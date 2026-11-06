import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertInScope, audit, can, isOnlyApprover, requireStaff, scope, type Staff } from '../lib/staff.js';
import { HttpError, badRequest, forbidden, isCompanyEmail, notFound } from '../lib/util.js';
import { readPrivateFile, savePublicImage } from '../lib/storage.js';

const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });

async function listingInfo(id: string) {
  const { rows } = await q(
    `SELECT l.id, l.title, l.status, l.vendor_id AS "vendorId", v.name AS vendor, v.country_code AS country, v.verification_level AS "vendorLevel"
       FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound();
  return { ...rows[0], country: rows[0].country.trim() } as { id: string; title: string; status: string; vendorId: string; vendor: string; country: string; vendorLevel: number };
}

/** Make a listing live at a level. Used directly for levels 1 and 2, and after a second approval for level 3. */
async function approveListing(c: pg.PoolClient, id: string, level: number) {
  const cur = await c.query(
    `SELECT l.status, l.vendor_id, l.location_is_private, m.min_level FROM listings l JOIN category_min_level m ON m.category = l.category WHERE l.id = $1 FOR UPDATE OF l`,
    [id],
  );
  const row = cur.rows[0];
  if (!row) throw notFound();
  if (row.status === 'submitted') await c.query(`UPDATE listings SET status = 'in_review' WHERE id = $1`, [id]);
  else if (row.status !== 'in_review') throw badRequest(`This listing is ${row.status.replace('_', ' ')}, not waiting for review`);
  const needed = Math.max(row.min_level, row.location_is_private ? 3 : 1);
  if (level < needed) throw badRequest(`This listing needs verification level ${needed} before it can go live`);
  await c.query(
    `UPDATE vendors SET verification_level = GREATEST(verification_level, $2), verified_at = now(), reverify_due = (current_date + interval '12 months')::date WHERE id = $1`,
    [row.vendor_id, level],
  );
  await c.query(`UPDATE listings SET status = 'live' WHERE id = $1`, [id]);
}

/** Carry out an approved two-person decision. */
async function execute(req: FastifyRequest, s: Staff, a: { kind: string; target_id: string; payload: any; reason: string | null; requested_by_user: string }) {
  if (a.kind === 'level3') {
    await tx((c) => approveListing(c, a.target_id, 3), { actor: a.requested_by_user, reason: `Visited (level 3): ${a.reason ?? 'visit report reviewed'}; second approval by ${s.displayName}` });
  } else if (a.kind === 'suspend_vendor') {
    await q(`UPDATE vendors SET is_suspended = true, updated_at = now() WHERE id = $1`, [a.target_id]);
  }
  // confirm_suspension: approving keeps the listing suspended, nothing else to do.
}

export async function adminRoutes(app: FastifyInstance) {
  // ---------------- Overview ----------------
  app.get('/admin/overview', async (req) => {
    const s = requireStaff(req);
    const p: unknown[] = [];
    const sc = scope(s, 'v.country_code', p);
    const { rows } = await q(
      `SELECT
         (SELECT count(*) FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.status IN ('submitted','in_review') AND ${sc}) AS queue,
         (SELECT count(*) FROM listings l JOIN vendors v ON v.id = l.vendor_id
           WHERE l.status IN ('submitted','in_review') AND ${sc}
             AND (SELECT max(e.created_at) FROM listing_events e WHERE e.listing_id = l.id AND e.to_status = 'submitted') < now() - interval '2 days') AS "queueLate",
         (SELECT count(*) FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.status = 'live' AND ${sc}) AS live,
         (SELECT count(*) FROM listings l JOIN vendors v ON v.id = l.vendor_id
           WHERE l.status = 'live' AND l.category IN ('home','furniture','home_services','utilities','grooming') AND ${sc}) AS "liveSettle",
         (SELECT count(*) FROM enquiries e JOIN vendors v ON v.id = e.vendor_id WHERE e.created_at > now() - interval '7 days' AND ${sc}) AS "enquiries7",
         (SELECT count(*) FROM enquiries e JOIN vendors v ON v.id = e.vendor_id WHERE e.created_at BETWEEN now() - interval '14 days' AND now() - interval '7 days' AND ${sc}) AS "enquiriesPrev7",
         (SELECT count(*) FROM vendors v WHERE v.created_at > now() - interval '7 days' AND ${sc}) AS "newBusinesses"`,
      p,
    );
    return { counts: rows[0] };
  });

  // ---------------- Review queue ----------------
  app.get('/admin/queue', async (req) => {
    const s = requireStaff(req, 'queue.view');
    const p: unknown[] = [];
    const { rows } = await q(
      `SELECT l.id, l.title, l.category, l.subtype, l.status, v.name AS vendor, v.verification_level AS "vendorLevel",
              c.name AS city, m.min_level AS "minLevel", l.location_is_private AS "isPrivate",
              (SELECT max(e.created_at) FROM listing_events e WHERE e.listing_id = l.id AND e.to_status = 'submitted') AS since,
              (SELECT count(*) FROM vendor_documents d WHERE d.vendor_id = v.id AND d.result = 'pending') AS "docsPending",
              (SELECT a.status FROM staff_approvals a WHERE a.target_id = l.id AND a.kind = 'level3' ORDER BY a.requested_at DESC LIMIT 1) AS "level3Approval",
              (SELECT f.status FROM field_visits f WHERE f.listing_id = l.id AND f.status <> 'cancelled' ORDER BY f.created_at DESC LIMIT 1) AS visit
         FROM listings l JOIN vendors v ON v.id = l.vendor_id JOIN cities c ON c.id = l.city_id
         JOIN category_min_level m ON m.category = l.category
        WHERE l.status IN ('submitted','in_review') AND ${scope(s, 'v.country_code', p)}
        ORDER BY since NULLS FIRST`,
      p,
    );
    return { queue: rows };
  });

  // Photos added by staff for a business (the pilot: field team photographs with the owner's written permission).
  const PHOTO_PERMS = ['businesses.support', 'queue.decide', 'visits.submit'] as const;
  app.post('/admin/listings/:id/photos', async (req) => {
    const s = requireStaff(req, ...PHOTO_PERMS);
    const { id } = idParam.parse(req.params);
    const l = await q(`SELECT l.id, l.title, v.country_code FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.id = $1`, [id]);
    if (!l.rows[0]) throw notFound();
    assertInScope(s, l.rows[0].country_code);
    const file = await req.file();
    if (!file) throw badRequest('Attach a photo');
    const f = file.fields as Record<string, { value?: string } | undefined>;
    if (f.permission?.value !== 'yes') throw badRequest('Confirm the business gave permission to use this photo');
    const alt = String(f.alt?.value ?? '').slice(0, 160);
    const count = await q(`SELECT count(*)::int AS n FROM listing_photos WHERE listing_id = $1`, [id]);
    if (count.rows[0].n >= 20) throw badRequest('A listing can have up to 20 photos');
    const url = await savePublicImage(`listings/staff/${id}`, await file.toBuffer());
    const { rows } = await q(`INSERT INTO listing_photos (listing_id, url, alt, position) VALUES ($1,$2,$3,$4) RETURNING id, url, alt`, [id, url, alt, count.rows[0].n]);
    await audit(req, s, 'listing.photo_add', { type: 'listing', id, label: l.rows[0].title }, 'Photo added with the business’s permission', { url });
    return { photo: rows[0] };
  });

  app.delete('/admin/listings/:id/photos/:photoId', async (req) => {
    const s = requireStaff(req, ...PHOTO_PERMS);
    const { id, photoId } = z.object({ id: z.string().uuid(), photoId: z.string().uuid() }).parse(req.params);
    const l = await q(`SELECT l.title, v.country_code FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.id = $1`, [id]);
    if (!l.rows[0]) throw notFound();
    assertInScope(s, l.rows[0].country_code);
    const r = await q(`DELETE FROM listing_photos WHERE id = $1 AND listing_id = $2 RETURNING url`, [photoId, id]);
    if (!r.rows[0]) throw notFound('Photo not found');
    await audit(req, s, 'listing.photo_remove', { type: 'listing', id, label: l.rows[0].title }, null, { url: r.rows[0].url });
    return { ok: true };
  });

  app.get('/admin/listings/:id', async (req) => {
    const s = requireStaff(req, 'queue.view', 'reports.view', 'businesses.view', 'visits.view', 'visits.submit');
    const { id } = idParam.parse(req.params);
    const l = await q(
      `SELECT l.*, ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lon, v.name AS vendor_name, v.id AS vendor_id,
              v.whatsapp_e164, v.licence_number, v.verification_level, v.verified_at, v.country_code AS vendor_country, c.name AS city,
              v.email AS vendor_email, v.email_verified_at IS NOT NULL AS vendor_email_verified, v.whatsapp_verified_at IS NOT NULL AS whatsapp_verified,
              m.min_level
         FROM listings l JOIN vendors v ON v.id = l.vendor_id JOIN cities c ON c.id = l.city_id
         JOIN category_min_level m ON m.category = l.category WHERE l.id = $1`,
      [id],
    );
    if (!l.rows[0]) throw notFound();
    assertInScope(s, l.rows[0].vendor_country);
    const seesContacts = can(s, 'queue.view') || can(s, 'reports.view') || can(s, 'businesses.view');
    const [docs, history, photos, visits, approvals] = await Promise.all([
      can(s, 'queue.view')
        ? q(`SELECT id, doc_type AS "docType", file_name AS "fileName", result, uploaded_at AS "uploadedAt" FROM vendor_documents WHERE vendor_id = $1 ORDER BY uploaded_at DESC`, [l.rows[0].vendor_id])
        : Promise.resolve({ rows: [] }),
      q(`SELECT e.from_status AS "from", e.to_status AS "to", e.reason, e.created_at AS at, coalesce(sm.display_name, u.display_name) AS actor
           FROM listing_events e LEFT JOIN users u ON u.id = e.actor_id LEFT JOIN staff_members sm ON sm.user_id = e.actor_id
          WHERE e.listing_id = $1 ORDER BY e.id DESC`, [id]),
      q(`SELECT id, url, alt FROM listing_photos WHERE listing_id = $1 ORDER BY position`, [id]),
      q(`SELECT f.id, f.status, f.scheduled_for AS "scheduledFor", f.checklist, f.notes, f.submitted_at AS "submittedAt", f.checked_in_at AS "checkedInAt", m.display_name AS verifier
           FROM field_visits f JOIN staff_members m ON m.id = f.assigned_to WHERE f.listing_id = $1 ORDER BY f.created_at DESC`, [id]),
      q(`SELECT a.id, a.kind, a.status, a.reason, a.requested_at AS "requestedAt", r.display_name AS "requestedBy", a.requested_by = $2 AS mine
           FROM staff_approvals a JOIN staff_members r ON r.id = a.requested_by WHERE a.target_id = $1 ORDER BY a.requested_at DESC`, [id, s.id]),
    ]);
    const { search_doc: _s, location: _loc, ...listing } = l.rows[0];
    listing.vendor_email_is_company = listing.vendor_email ? isCompanyEmail(listing.vendor_email) : false;
    if (!seesContacts) {
      listing.whatsapp_e164 = null;
      listing.vendor_email = null;
    }
    return { listing, documents: docs.rows, history: history.rows, photos: photos.rows, visits: visits.rows, approvals: approvals.rows };
  });

  /** Open a business document. Only verification staff, and every opening is recorded. */
  app.get('/admin/documents/:id/file', async (req, reply) => {
    const s = requireStaff(req, 'queue.decide');
    const { id } = idParam.parse(req.params);
    const { rows } = await q(
      `SELECT d.storage_key, d.file_name, d.doc_type, v.name, v.country_code FROM vendor_documents d JOIN vendors v ON v.id = d.vendor_id WHERE d.id = $1`,
      [id],
    );
    if (!rows[0]) throw notFound();
    assertInScope(s, rows[0].country_code);
    const data = await readPrivateFile(rows[0].storage_key).catch(() => {
      throw notFound('The file is missing from storage');
    });
    await audit(req, s, 'Opened business document', { type: 'document', id, label: `${rows[0].name} · ${rows[0].doc_type}`, country: rows[0].country_code });
    const name = String(rows[0].file_name ?? 'document').replace(/[^A-Za-z0-9._-]/g, '_');
    const ext = name.split('.').pop()?.toLowerCase();
    const type = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
    reply.header('content-type', type).header('content-disposition', `inline; filename="${name}"`).header('cache-control', 'private, no-store');
    return reply.send(data);
  });

  app.post('/admin/documents/:id', async (req) => {
    const s = requireStaff(req, 'queue.decide');
    const { id } = idParam.parse(req.params);
    const b = z.object({ result: z.enum(['accepted', 'rejected']) }).parse(req.body);
    const { rows } = await q(
      `UPDATE vendor_documents d SET result = $2, reviewed_by = $3, reviewed_at = now() FROM vendors v
        WHERE d.id = $1 AND v.id = d.vendor_id RETURNING d.doc_type, v.name, v.country_code`,
      [id, b.result, s.userId],
    );
    if (!rows[0]) throw notFound();
    assertInScope(s, rows[0].country_code);
    await audit(req, s, `Document ${b.result}`, { type: 'document', id, label: `${rows[0].name} · ${rows[0].doc_type}`, country: rows[0].country_code });
    return { ok: true };
  });

  app.post('/admin/listings/:id/decision', async (req) => {
    const s = requireStaff(req, 'queue.decide');
    const { id } = idParam.parse(req.params);
    const b = z
      .object({ decision: z.enum(['approve', 'changes', 'reject']), level: z.number().int().min(1).max(3).optional(), note: z.string().trim().max(1000).optional() })
      .refine((v) => v.decision === 'approve' || (v.note && v.note.length >= 5), 'Add a note telling the business what to change or why')
      .refine((v) => v.decision !== 'approve' || v.level, 'Choose the verification level reached')
      .parse(req.body);
    const info = await listingInfo(id);
    assertInScope(s, info.country);
    const target = { type: 'listing', id, label: `${info.vendor} · ${info.title}`, country: info.country };

    if (b.decision === 'approve' && b.level === 3) {
      // Visited badges need a submitted visit report and a second person.
      const v = await q(`SELECT 1 FROM field_visits WHERE listing_id = $1 AND status = 'submitted'`, [id]);
      if (!v.rows[0]) throw badRequest('Level 3 needs a submitted field visit report. Book a visit first.');
      const solo = can(s, 'level3.approve') && (await isOnlyApprover(s, 'level3.approve', info.country));
      const { rows } = await q(
        `INSERT INTO staff_approvals (kind, target_id, target_label, country_code, payload, requested_by, reason, status, decided_by, decided_at)
         VALUES ('level3', $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [id, target.label, info.country, JSON.stringify({ level: 3, solo }), s.id, b.note ?? null, solo ? 'approved' : 'pending', solo ? s.id : null, solo ? new Date() : null],
      ).catch((e) => {
        if (e.code === '23505') throw badRequest('A level 3 approval is already waiting for this listing');
        throw e;
      });
      if (solo) {
        await execute(req, s, { kind: 'level3', target_id: id, payload: {}, reason: b.note ?? null, requested_by_user: s.userId });
        await audit(req, s, 'Approved at level 3 (no second approver available)', target, b.note, { approvalId: rows[0].id, solo: true });
        return { status: 'live', solo: true };
      }
      await audit(req, s, 'Sent level 3 for second approval', target, b.note, { approvalId: rows[0].id });
      return { status: 'awaiting_second_approval' };
    }

    const out = await tx(
      async (c) => {
        if (b.decision === 'approve') {
          await approveListing(c, id, b.level!);
          return { status: 'live' };
        }
        const cur = await c.query(`SELECT status FROM listings WHERE id = $1 FOR UPDATE`, [id]);
        if (cur.rows[0].status === 'submitted') await c.query(`UPDATE listings SET status = 'in_review' WHERE id = $1`, [id]);
        else if (cur.rows[0].status !== 'in_review') throw badRequest(`This listing is ${cur.rows[0].status.replace('_', ' ')}, not waiting for review`);
        const to = b.decision === 'changes' ? 'changes_requested' : 'rejected';
        await c.query(`UPDATE listings SET status = $2 WHERE id = $1`, [id, to]);
        return { status: to };
      },
      { actor: s.userId, reason: b.note ?? (b.decision === 'approve' ? `Approved at level ${b.level}` : null) },
    );
    const label = { approve: `Approved at level ${b.level}`, changes: 'Asked for changes', reject: 'Rejected' }[b.decision];
    await audit(req, s, label, target, b.note);
    return out;
  });

  // ---------------- Second approvals ----------------
  app.get('/admin/approvals', async (req) => {
    const s = requireStaff(req, 'level3.approve', 'suspension.confirm', 'level3.request', 'vendor.suspend', 'listing.suspend');
    const { status } = z.object({ status: z.enum(['pending', 'approved', 'declined']).default('pending') }).parse(req.query);
    const p: unknown[] = [status, s.id];
    const { rows } = await q(
      `SELECT a.id, a.kind, a.target_id AS "targetId", a.target_label AS "targetLabel", a.country_code AS country, a.reason, a.status,
              a.requested_at AS "requestedAt", r.display_name AS "requestedBy", r.role AS "requestedRole", a.requested_by = $2 AS mine,
              d.display_name AS "decidedBy", a.decided_at AS "decidedAt", a.decision_note AS "decisionNote", (a.payload ->> 'solo')::boolean AS solo
         FROM staff_approvals a JOIN staff_members r ON r.id = a.requested_by LEFT JOIN staff_members d ON d.id = a.decided_by
        WHERE a.status = $1 AND ${scope(s, 'a.country_code', p)}
        ORDER BY a.requested_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 100`,
      p,
    );
    return { approvals: rows };
  });

  app.post('/admin/approvals/:id', async (req) => {
    const s = requireStaff(req, 'level3.approve', 'suspension.confirm');
    const { id } = idParam.parse(req.params);
    const b = z.object({ decision: z.enum(['approve', 'decline']), note: z.string().trim().max(500).optional() })
      .refine((v) => v.decision === 'approve' || (v.note && v.note.length >= 5), 'Say why you are declining').parse(req.body);
    const { rows } = await q(
      `SELECT a.*, r.user_id AS requested_by_user FROM staff_approvals a JOIN staff_members r ON r.id = a.requested_by WHERE a.id = $1`,
      [id],
    );
    const a = rows[0];
    if (!a) throw notFound();
    if (a.status !== 'pending') throw badRequest('This has already been decided');
    assertInScope(s, a.country_code);
    if (a.requested_by === s.id) throw forbidden('A second approval must come from someone else');
    if (!can(s, a.kind === 'level3' ? 'level3.approve' : 'suspension.confirm')) throw forbidden('Your role can’t decide this');
    if (b.decision === 'approve') await execute(req, s, a);
    if (b.decision === 'decline' && a.kind === 'confirm_suspension') {
      // Declining an emergency suspension puts the listing back.
      await tx((c) => c.query(`UPDATE listings SET status = 'live' WHERE id = $1 AND status = 'suspended'`, [a.target_id]), {
        actor: s.userId, reason: `Suspension not confirmed: ${b.note}`,
      });
    }
    await q(`UPDATE staff_approvals SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1`, [
      id, b.decision === 'approve' ? 'approved' : 'declined', s.id, b.note ?? null,
    ]);
    const what = { level3: 'level 3 badge', suspend_vendor: 'business suspension', confirm_suspension: 'listing suspension' }[a.kind as string];
    await audit(req, s, `${b.decision === 'approve' ? 'Gave second approval' : 'Declined'}: ${what}`, { type: a.kind === 'suspend_vendor' ? 'vendor' : 'listing', id: a.target_id, label: a.target_label, country: a.country_code }, b.note);
    return { status: b.decision === 'approve' ? 'approved' : 'declined' };
  });

  // ---------------- Suspensions ----------------
  app.post('/admin/listings/:id/suspend', async (req) => {
    const s = requireStaff(req, 'listing.suspend', 'suspension.confirm');
    const { id } = idParam.parse(req.params);
    const b = z.object({ reason: z.string().trim().min(5).max(500), reinstate: z.boolean().default(false) }).parse(req.body);
    const info = await listingInfo(id);
    assertInScope(s, info.country);
    const target = { type: 'listing', id, label: `${info.vendor} · ${info.title}`, country: info.country };
    if (b.reinstate) {
      if (!can(s, 'suspension.confirm')) throw forbidden('Only a country lead or Owner can put a suspended listing back');
      await tx((c) => c.query(`UPDATE listings SET status = 'live' WHERE id = $1`, [id]), { actor: s.userId, reason: b.reason });
      await q(`UPDATE staff_approvals SET status = 'declined', decided_by = $2, decided_at = now(), decision_note = $3 WHERE target_id = $1 AND kind = 'confirm_suspension' AND status = 'pending' AND requested_by <> $2`, [id, s.id, b.reason]);
      await audit(req, s, 'Reinstated listing', target, b.reason);
      return { status: 'live' };
    }
    // Safety first: the listing comes down now. Someone who can confirm reviews it afterwards.
    await tx((c) => c.query(`UPDATE listings SET status = 'suspended' WHERE id = $1`, [id]), { actor: s.userId, reason: b.reason });
    let needsConfirm = false;
    if (!can(s, 'suspension.confirm')) {
      needsConfirm = true;
      await q(
        `INSERT INTO staff_approvals (kind, target_id, target_label, country_code, requested_by, reason) VALUES ('confirm_suspension', $1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [id, target.label, info.country, s.id, b.reason],
      );
    }
    await audit(req, s, needsConfirm ? 'Suspended listing (to be confirmed)' : 'Suspended listing', target, b.reason);
    return { status: 'suspended', needsConfirm };
  });

  app.post('/admin/vendors/:id/suspend', async (req) => {
    const s = requireStaff(req, 'vendor.suspend', 'suspension.confirm');
    const { id } = idParam.parse(req.params);
    const b = z.object({ suspended: z.boolean(), reason: z.string().trim().min(5).max(500) }).parse(req.body);
    const { rows } = await q(`SELECT name, country_code, verification_level, is_suspended FROM vendors WHERE id = $1`, [id]);
    const v = rows[0];
    if (!v) throw notFound();
    assertInScope(s, v.country_code);
    const target = { type: 'vendor', id, label: v.name, country: v.country_code };
    if (!b.suspended) {
      if (!can(s, 'suspension.confirm')) throw forbidden('Only a country lead or Owner can restore a business');
      await q(`UPDATE vendors SET is_suspended = false, updated_at = now() WHERE id = $1`, [id]);
      await audit(req, s, 'Restored business', target, b.reason);
      return { suspended: false };
    }
    // Suspending a verified business takes two people, unless nobody else could approve.
    if (v.verification_level >= 1) {
      const solo = await isOnlyApprover(s, 'suspension.confirm', v.country_code.trim());
      if (!solo) {
        await q(
          `INSERT INTO staff_approvals (kind, target_id, target_label, country_code, requested_by, reason) VALUES ('suspend_vendor', $1, $2, $3, $4, $5)`,
          [id, v.name, v.country_code, s.id, b.reason],
        ).catch((e) => {
          if (e.code === '23505') throw badRequest('A suspension for this business is already waiting for approval');
          throw e;
        });
        await audit(req, s, 'Asked to suspend business (needs second approval)', target, b.reason);
        return { suspended: false, status: 'awaiting_second_approval' };
      }
    }
    await q(`UPDATE vendors SET is_suspended = true, updated_at = now() WHERE id = $1`, [id]);
    await audit(req, s, v.verification_level >= 1 ? 'Suspended business (no second approver available)' : 'Suspended business', target, b.reason);
    return { suspended: true };
  });

  // ---------------- Field visits ----------------
  app.get('/admin/visits', async (req) => {
    const s = requireStaff(req, 'visits.view', 'visits.submit');
    const p: unknown[] = [];
    const mine = !can(s, 'visits.view');
    if (mine) p.push(s.id);
    const where = mine ? 'f.assigned_to = $1' : scope(s, 'v.country_code', p);
    p.push(s.id);
    const meParam = `$${p.length}`;
    const { rows } = await q(
      `SELECT f.id, f.status, f.scheduled_for AS "scheduledFor", f.checklist, f.notes, f.checked_in_at AS "checkedInAt", f.submitted_at AS "submittedAt",
              l.id AS "listingId", l.title, l.category, l.location_is_private AS "isPrivate", c.name AS city, v.name AS vendor,
              m.display_name AS verifier, f.assigned_to = ${meParam} AS mine
         FROM field_visits f JOIN listings l ON l.id = f.listing_id JOIN vendors v ON v.id = l.vendor_id JOIN cities c ON c.id = l.city_id
         JOIN staff_members m ON m.id = f.assigned_to
        WHERE f.status <> 'cancelled' AND ${where}
        ORDER BY f.status = 'submitted', f.scheduled_for LIMIT 200`,
      p,
    );
    return { visits: rows };
  });

  app.get('/admin/verifiers', async (req) => {
    const s = requireStaff(req, 'visits.assign');
    const { rows } = await q(
      `SELECT id, display_name AS "displayName", role FROM staff_members
        WHERE status = 'active' AND role IN ('field_verifier','owner') AND ($1::char(2) IS NULL OR country_code IS NULL OR country_code = $1)
        ORDER BY role = 'owner', display_name`,
      [s.country],
    );
    return { verifiers: rows };
  });

  app.post('/admin/visits', async (req) => {
    const s = requireStaff(req, 'visits.assign');
    const b = z.object({ listingId: uuid, assignedTo: uuid, scheduledFor: z.string().datetime({ offset: true }) }).parse(req.body);
    const info = await listingInfo(b.listingId);
    assertInScope(s, info.country);
    const who = await q(`SELECT display_name, role FROM staff_members WHERE id = $1 AND status = 'active'`, [b.assignedTo]);
    if (!who.rows[0] || !['field_verifier', 'owner'].includes(who.rows[0].role)) throw badRequest('Choose an active field verifier');
    const { rows } = await q(
      `INSERT INTO field_visits (listing_id, assigned_to, scheduled_for, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
      [b.listingId, b.assignedTo, b.scheduledFor, s.id],
    );
    await audit(req, s, `Booked field visit with ${who.rows[0].display_name}`, { type: 'listing', id: b.listingId, label: `${info.vendor} · ${info.title}`, country: info.country });
    return { visit: rows[0] };
  });

  async function myVisit(s: Staff, id: string) {
    const { rows } = await q(
      `SELECT f.*, l.title, v.name AS vendor, v.country_code FROM field_visits f JOIN listings l ON l.id = f.listing_id JOIN vendors v ON v.id = l.vendor_id WHERE f.id = $1`,
      [id],
    );
    const f = rows[0];
    if (!f) throw notFound();
    if (f.assigned_to !== s.id) throw forbidden('Only the assigned field verifier can do this');
    if (f.status !== 'booked') throw badRequest('This visit is already finished');
    return f;
  }

  app.post('/admin/visits/:id/check-in', async (req) => {
    const s = requireStaff(req, 'visits.submit');
    const { id } = idParam.parse(req.params);
    const f = await myVisit(s, id);
    await q(`UPDATE field_visits SET checked_in_at = now() WHERE id = $1`, [id]);
    await audit(req, s, 'Checked in at field visit', { type: 'listing', id: f.listing_id, label: `${f.vendor} · ${f.title}`, country: f.country_code });
    return { ok: true };
  });

  app.post('/admin/visits/:id/submit', async (req) => {
    const s = requireStaff(req, 'visits.submit');
    const { id } = idParam.parse(req.params);
    const b = z.object({
      checklist: z.object({ addressMatches: z.boolean(), personMatchesId: z.boolean(), matchesListing: z.boolean(), safeForGuests: z.boolean() }),
      notes: z.string().trim().min(10, 'Describe what you saw in a sentence or two').max(3000),
    }).parse(req.body);
    const f = await myVisit(s, id);
    if (!f.checked_in_at) throw badRequest('Check in on site before submitting the report');
    await q(`UPDATE field_visits SET status = 'submitted', checklist = $2, notes = $3, submitted_at = now() WHERE id = $1`, [id, JSON.stringify(b.checklist), b.notes]);
    const passed = Object.values(b.checklist).every(Boolean);
    await audit(req, s, passed ? 'Submitted visit report: all checks passed' : 'Submitted visit report: some checks failed', { type: 'listing', id: f.listing_id, label: `${f.vendor} · ${f.title}`, country: f.country_code });
    return { ok: true };
  });

  app.post('/admin/visits/:id/cancel', async (req) => {
    const s = requireStaff(req, 'visits.assign');
    const { id } = idParam.parse(req.params);
    const { rows } = await q(`UPDATE field_visits SET status = 'cancelled' WHERE id = $1 AND status = 'booked' RETURNING listing_id`, [id]);
    if (!rows[0]) throw notFound();
    await audit(req, s, 'Cancelled field visit', { type: 'listing', id: rows[0].listing_id });
    return { ok: true };
  });

  // ---------------- Experiences (reviews) ----------------
  app.get('/admin/reviews', async (req) => {
    requireStaff(req, 'reviews.moderate');
    const { view } = z.object({ view: z.enum(['recent', 'low', 'hidden', 'flagged']).default('recent') }).parse(req.query);
    const where = {
      hidden: `r.status = 'hidden'`,
      low: `r.status = 'published' AND r.rating <= 2`,
      recent: `r.status = 'published'`,
      // Personal details in the text, or several posts for one business in a short time.
      flagged: `r.status = 'published' AND (r.body ~* '(\\+?\\d[\\d\\s-]{8,}\\d|@[a-z0-9-]+\\.)' OR (SELECT count(*) FROM reviews r2 WHERE r2.listing_id = r.listing_id AND abs(extract(epoch FROM r2.created_at - r.created_at)) < 3600) >= 4)`,
    }[view];
    const { rows } = await q(
      `SELECT r.id, r.rating, r.recommend, r.body, r.created_at AS "createdAt", r.hidden_reason AS "hiddenReason", (r.enquiry_id IS NOT NULL) AS contacted,
              r.traveller_type AS "travellerType", l.title AS listing, l.slug AS "listingSlug", v.name AS vendor,
              (r.body ~* '(\\+?\\d[\\d\\s-]{8,}\\d|@[a-z0-9-]+\\.)') AS "personalDetails"
         FROM reviews r JOIN listings l ON l.id = r.listing_id JOIN vendors v ON v.id = l.vendor_id
        WHERE ${where} ORDER BY r.created_at DESC LIMIT 100`,
    );
    return { reviews: rows };
  });

  app.post('/admin/reviews/:id', async (req) => {
    const s = requireStaff(req, 'reviews.moderate');
    const { id } = idParam.parse(req.params);
    const b = z.object({ hidden: z.boolean(), reason: z.string().trim().max(200).optional() })
      .refine((v) => !v.hidden || (v.reason && v.reason.length >= 3), 'Say why you are hiding it').parse(req.body);
    const r = await q(
      `UPDATE reviews r SET status = $2, hidden_reason = $3 FROM listings l WHERE r.id = $1 AND l.id = r.listing_id RETURNING l.title`,
      [id, b.hidden ? 'hidden' : 'published', b.hidden ? b.reason ?? null : null],
    );
    if (!r.rows[0]) throw notFound();
    await audit(req, s, b.hidden ? 'Hid experience' : 'Restored experience', { type: 'review', id, label: r.rows[0].title }, b.reason);
    return { hidden: b.hidden };
  });

  // ---------------- Reports and watchlist ----------------
  app.get('/admin/reports', async (req) => {
    const s = requireStaff(req, 'reports.view');
    const { status } = z.object({ status: z.enum(['open', 'triaged', 'actioned', 'dismissed']).default('open') }).parse(req.query);
    const p: unknown[] = [status];
    const { rows } = await q(
      `SELECT r.id, r.category, r.body, r.contact, r.subject, r.status, r.resolution, r.created_at AS "createdAt", r.resolved_at AS "resolvedAt",
              l.title AS listing, l.id AS "listingId", l.status AS "listingStatus", v.name AS vendor, v.id AS "vendorId", v.is_suspended AS "vendorSuspended",
              CASE WHEN r.category IN ('safety','scam') THEN r.created_at + interval '4 hours' ELSE r.created_at + interval '2 days' END AS "dueAt"
         FROM reports r LEFT JOIN listings l ON l.id = r.listing_id LEFT JOIN vendors v ON v.id = l.vendor_id
        WHERE r.status = $1 AND (v.country_code IS NULL OR ${scope(s, 'v.country_code', p)})
        ORDER BY (r.category IN ('safety','scam')) DESC, r.created_at LIMIT 200`,
      p,
    );
    return { reports: rows };
  });

  app.post('/admin/reports/:id', async (req) => {
    const s = requireStaff(req, 'reports.act');
    const { id } = idParam.parse(req.params);
    const b = z.object({ status: z.enum(['triaged', 'actioned', 'dismissed']), resolution: z.string().trim().max(1000).optional() }).parse(req.body);
    const { rows } = await q(
      `UPDATE reports SET status = $2::report_status, resolution = coalesce($3, resolution), handled_by = $4,
              resolved_at = CASE WHEN $2::report_status IN ('actioned','dismissed') THEN coalesce(resolved_at, now()) ELSE resolved_at END
        WHERE id = $1 RETURNING category, coalesce(subject, '') AS subject`,
      [id, b.status, b.resolution ?? null, s.userId],
    );
    if (!rows[0]) throw notFound();
    await audit(req, s, `Report ${b.status}`, { type: 'report', id, label: `${rows[0].category}${rows[0].subject ? ` · ${rows[0].subject}` : ''}` }, b.resolution);
    return { ok: true };
  });

  app.get('/admin/watchlist', async (req) => {
    requireStaff(req, 'reports.view');
    const { rows } = await q(
      `SELECT w.id, w.name, w.phone_e164 AS phone, w.reason, w.created_at AS "createdAt", coalesce(sm.display_name, u.display_name) AS "addedBy"
         FROM operator_watchlist w LEFT JOIN users u ON u.id = w.added_by LEFT JOIN staff_members sm ON sm.user_id = w.added_by
        ORDER BY w.created_at DESC LIMIT 200`,
    );
    return { watchlist: rows };
  });

  app.post('/admin/watchlist', async (req) => {
    const s = requireStaff(req, 'reports.act');
    const b = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/).optional(), reason: z.string().trim().min(5).max(500) }).parse(req.body);
    const { rows } = await q(`INSERT INTO operator_watchlist (name, phone_e164, reason, added_by) VALUES ($1,$2,$3,$4) RETURNING id`, [b.name, b.phone ?? null, b.reason, s.userId]);
    await audit(req, s, 'Added to operator watchlist', { type: 'watchlist', id: rows[0].id, label: b.name }, b.reason);
    return { entry: rows[0] };
  });

  app.delete('/admin/watchlist/:id', async (req) => {
    const s = requireStaff(req, 'reports.act');
    const { id } = idParam.parse(req.params);
    const { rows } = await q(`DELETE FROM operator_watchlist WHERE id = $1 RETURNING name`, [id]);
    if (!rows[0]) throw notFound();
    await audit(req, s, 'Removed from operator watchlist', { type: 'watchlist', id, label: rows[0].name });
    return { ok: true };
  });

  // ---------------- Official links, advisories and price checks ----------------
  app.get('/admin/links', async (req) => {
    const s = requireStaff(req, 'content.edit');
    const p: unknown[] = [];
    const { rows } = await q(
      `SELECT id, country_code AS country, topic, title, url, description, warning, position, last_checked_on AS "lastCheckedOn", is_active AS "isActive",
              current_date - last_checked_on AS "daysSinceCheck"
         FROM country_links WHERE ${scope(s, 'country_code', p)} ORDER BY is_active DESC, last_checked_on, country_code, topic, position`,
      p,
    );
    return { links: rows };
  });

  const linkBody = z.object({
    country: z.string().length(2).toUpperCase(),
    topic: z.enum(['entry', 'safety', 'parks', 'business_check', 'health', 'transport', 'embassies', 'complaints', 'tourism']),
    title: z.string().trim().min(3).max(120),
    url: z.string().trim().url().startsWith('https://', 'Official links must use https://').max(400),
    description: z.string().trim().min(5).max(300),
    warning: z.string().trim().max(300).nullable().optional(),
  });

  app.post('/admin/links', async (req) => {
    const s = requireStaff(req, 'content.edit');
    const b = linkBody.parse(req.body);
    assertInScope(s, b.country);
    const { rows } = await q(
      `INSERT INTO country_links (country_code, topic, title, url, description, warning, position)
       VALUES ($1,$2,$3,$4,$5,$6, (SELECT coalesce(max(position), 0) + 1 FROM country_links WHERE country_code = $1 AND topic = $2)) RETURNING id`,
      [b.country, b.topic, b.title, b.url, b.description, b.warning ?? null],
    ).catch((e) => {
      if (e.code === '23505') throw badRequest('That link is already listed for this country');
      throw e;
    });
    await audit(req, s, 'Added official link', { type: 'link', id: rows[0].id, label: b.url, country: b.country });
    return { link: rows[0] };
  });

  app.patch('/admin/links/:id', async (req) => {
    const s = requireStaff(req, 'content.edit');
    const { id } = idParam.parse(req.params);
    const b = linkBody.partial().extend({ checked: z.boolean().optional(), isActive: z.boolean().optional(), note: z.string().trim().max(300).optional() }).parse(req.body);
    const cur = await q(`SELECT country_code, url FROM country_links WHERE id = $1`, [id]);
    if (!cur.rows[0]) throw notFound();
    assertInScope(s, cur.rows[0].country_code);
    await q(
      `UPDATE country_links SET title = coalesce($2, title), url = coalesce($3, url), description = coalesce($4, description),
              warning = CASE WHEN $5 THEN $6 ELSE warning END, is_active = coalesce($7, is_active),
              last_checked_on = CASE WHEN $8 OR $3 IS NOT NULL THEN current_date ELSE last_checked_on END, topic = coalesce($9, topic)
        WHERE id = $1`,
      [id, b.title ?? null, b.url ?? null, b.description ?? null, b.warning !== undefined, b.warning ?? null, b.isActive ?? null, !!b.checked, b.topic ?? null],
    );
    const action = b.checked && Object.keys(b).length <= 2 ? 'Re-checked official link' : b.isActive === false ? 'Retired official link' : 'Edited official link';
    await audit(req, s, action, { type: 'link', id, label: b.url ?? cur.rows[0].url, country: cur.rows[0].country_code }, b.note);
    return { ok: true };
  });

  app.get('/admin/advisories', async (req) => {
    const s = requireStaff(req, 'content.edit', 'advisories.publish');
    const p: unknown[] = [];
    const { rows } = await q(
      `SELECT a.id, a.country_code AS country, c.name AS city, a.message, a.starts_at AS "startsAt", a.ends_at AS "endsAt",
              (a.ends_at IS NULL OR a.ends_at > now()) AS active
         FROM advisories a LEFT JOIN cities c ON c.id = a.city_id WHERE ${scope(s, 'a.country_code', p)} ORDER BY a.starts_at DESC LIMIT 50`,
      p,
    );
    return { advisories: rows };
  });

  app.post('/admin/advisories', async (req) => {
    const s = requireStaff(req, 'advisories.publish');
    const b = z.object({ countryCode: z.string().length(2).toUpperCase(), cityId: z.number().int().optional(), message: z.string().trim().min(10).max(500), endsAt: z.string().datetime({ offset: true }).optional() }).parse(req.body);
    assertInScope(s, b.countryCode);
    const { rows } = await q(`INSERT INTO advisories (country_code, city_id, message, ends_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [b.countryCode, b.cityId ?? null, b.message, b.endsAt ?? null, s.userId]);
    await audit(req, s, 'Published advisory', { type: 'advisory', id: rows[0].id, label: b.message.slice(0, 80), country: b.countryCode });
    return { advisory: rows[0] };
  });

  app.post('/admin/advisories/:id/end', async (req) => {
    const s = requireStaff(req, 'advisories.publish');
    const { id } = idParam.parse(req.params);
    const { rows } = await q(`UPDATE advisories SET ends_at = now() WHERE id = $1 RETURNING message, country_code`, [id]);
    if (!rows[0]) throw notFound();
    await audit(req, s, 'Ended advisory', { type: 'advisory', id, label: rows[0].message.slice(0, 80), country: rows[0].country_code });
    return { ok: true };
  });

  app.post('/admin/price-checks', async (req) => {
    const s = requireStaff(req, 'content.edit');
    const b = z
      .object({ citySlug: z.string(), group: z.enum(['food', 'transport', 'other']), item: z.string().trim().min(2).max(100), area: z.string().max(80).optional(), low: z.number().int().min(0), high: z.number().int().min(0), checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .refine((v) => v.high >= v.low, 'High must be at least low')
      .parse(req.body);
    const { rows } = await q(
      `INSERT INTO price_checks (city_id, group_name, item, area, currency, low, high, checked_on, checked_by)
       SELECT c.id, $2, $3, $4, co.currency, $5, $6, $7, $8 FROM cities c JOIN countries co ON co.code = c.country_code
        WHERE c.slug = $1 AND ($9::char(2) IS NULL OR c.country_code = $9) RETURNING id`,
      [b.citySlug, b.group, b.item, b.area ?? null, b.low, b.high, b.checkedOn, s.userId, s.country],
    );
    if (!rows[0]) throw badRequest('Unknown city');
    await audit(req, s, 'Added price check', { type: 'price_check', id: rows[0].id, label: `${b.item}: ${b.low}–${b.high}` });
    return { priceCheck: rows[0] };
  });

  app.get('/admin/stale', async (req) => {
    requireStaff(req, 'content.edit');
    const [pages, prices, listings] = await Promise.all([
      q(`SELECT country_code AS country, slug, last_reviewed_on AS "lastReviewedOn" FROM country_pages WHERE last_reviewed_on < current_date - 90`),
      q(`SELECT c.name AS city, p.item, p.checked_on AS "checkedOn" FROM price_checks p JOIN cities c ON c.id = p.city_id WHERE p.checked_on < current_date - 120`),
      q(`SELECT id, title, last_confirmed_at AS "lastConfirmedAt" FROM listings WHERE status = 'live' AND last_confirmed_at < now() - interval '90 days'`),
    ]);
    return { pages: pages.rows, prices: prices.rows, listings: listings.rows };
  });

  // ---------------- Businesses ----------------
  app.get('/admin/businesses', async (req) => {
    const s = requireStaff(req, 'businesses.view', 'queue.view', 'billing.view', 'reports.view');
    const f = z.object({ q: z.string().trim().max(80).optional(), status: z.enum(['all', 'live', 'review', 'suspended', 'none']).default('all') }).parse(req.query);
    const p: unknown[] = [];
    const where = [scope(s, 'v.country_code', p)];
    if (f.q) {
      p.push(`%${f.q}%`);
      where.push(`(v.name ILIKE $${p.length} OR v.slug ILIKE $${p.length})`);
    }
    if (f.status === 'suspended') where.push('v.is_suspended');
    const { rows } = await q(
      `SELECT * FROM (
         SELECT v.id, v.name, v.slug, v.country_code AS country, v.verification_level AS level, v.plan, v.is_suspended AS suspended,
                v.created_at AS "createdAt", v.reverify_due AS "reverifyDue", (SELECT bool_and(l.is_sample) FROM listings l WHERE l.vendor_id = v.id) AS "isSample",
                (SELECT count(*) FROM listings l WHERE l.vendor_id = v.id AND l.status = 'live') AS live,
                (SELECT count(*) FROM listings l WHERE l.vendor_id = v.id AND l.status IN ('submitted','in_review')) AS "inReview",
                (SELECT count(*) FROM enquiries e WHERE e.vendor_id = v.id AND e.created_at > now() - interval '30 days') AS "enquiries30",
                (SELECT min(c.name) FROM listings l JOIN cities c ON c.id = l.city_id WHERE l.vendor_id = v.id) AS city,
                (SELECT string_agg(DISTINCT l.category::text, ',') FROM listings l WHERE l.vendor_id = v.id) AS categories
           FROM vendors v WHERE ${where.join(' AND ')}) x
        WHERE ${{ all: 'true', live: 'x.live > 0', review: 'x."inReview" > 0', suspended: 'true', none: 'x.live = 0 AND x."inReview" = 0' }[f.status]}
        ORDER BY x."enquiries30" DESC, x.name LIMIT 300`,
      p,
    );
    return { businesses: rows };
  });

  app.get('/admin/recommendations', async (req) => {
    requireStaff(req, 'businesses.view');
    const { rows } = await q(`SELECT id, business, contact, city, why, created_at AS "createdAt" FROM recommendations ORDER BY created_at DESC LIMIT 200`);
    return { recommendations: rows };
  });

  /** Searches that found nothing, where the traveller asked us to find a business. */
  app.get('/admin/demand', async (req) => {
    requireStaff(req, 'businesses.view');
    const { rows } = await q(
      `SELECT d.id, d.query, d.city_slug AS city, d.category, d.contact, d.note, d.status, d.created_at AS "createdAt",
              (SELECT count(*) FROM demand_requests x WHERE lower(x.query) = lower(d.query)) AS same
         FROM demand_requests d ORDER BY d.status = 'open' DESC, d.created_at DESC LIMIT 200`,
    );
    return { requests: rows };
  });

  app.post('/admin/demand/:id', async (req) => {
    const s = requireStaff(req, 'businesses.support');
    const { id } = idParam.parse(req.params);
    const b = z.object({ status: z.enum(['open', 'recruiting', 'filled', 'closed']) }).parse(req.body);
    const { rows } = await q(`UPDATE demand_requests SET status = $2 WHERE id = $1 RETURNING query`, [id, b.status]);
    if (!rows[0]) throw notFound();
    await audit(req, s, `Traveller request marked ${b.status}`, { type: 'demand', id, label: rows[0].query });
    return { ok: true };
  });

  // ---------------- Plans and billing ----------------
  app.get('/admin/billing', async (req) => {
    const s = requireStaff(req, 'billing.view');
    const p: unknown[] = [];
    const sc = scope(s, 'v.country_code', p);
    const [plans, subs] = await Promise.all([
      q(`SELECT pl.code, pl.name, pl.monthly_usd AS "monthlyUsd", count(v.id) FILTER (WHERE NOT v.is_suspended) AS businesses
           FROM plans pl LEFT JOIN vendors v ON v.plan = pl.code AND ${sc} GROUP BY pl.code, pl.name, pl.monthly_usd ORDER BY pl.monthly_usd`, p),
      q(`SELECT sb.id, v.id AS "vendorId", v.name AS vendor, sb.plan, sb.status, sb.provider, sb.current_period_end AS "periodEnd", sb.created_at AS "createdAt"
           FROM subscriptions sb JOIN vendors v ON v.id = sb.vendor_id WHERE ${sc} ORDER BY sb.status <> 'past_due', sb.created_at DESC LIMIT 200`, p),
    ]);
    const mrr = plans.rows.reduce((t, r) => t + Number(r.monthlyUsd) * Number(r.businesses), 0);
    return { plans: plans.rows, subscriptions: subs.rows, mrrUsd: mrr, earlyAccess: process.env.EARLY_ACCESS !== 'false' };
  });

  app.post('/admin/vendors/:id/plan', async (req) => {
    const s = requireStaff(req, 'billing.manage');
    const { id } = idParam.parse(req.params);
    const b = z.object({ plan: z.enum(['free', 'pro', 'featured']), reason: z.string().trim().min(5).max(300) }).parse(req.body);
    const { rows } = await q(`UPDATE vendors SET plan = $2, updated_at = now() WHERE id = $1 RETURNING name, country_code`, [id, b.plan]);
    if (!rows[0]) throw notFound();
    // Plans never touch verification: this changes listing limits and labelled placement only.
    await audit(req, s, `Changed plan to ${b.plan}`, { type: 'vendor', id, label: rows[0].name, country: rows[0].country_code }, b.reason);
    return { ok: true };
  });

  // ---------------- Audit log ----------------
  app.get('/admin/audit', async (req) => {
    const s = requireStaff(req, 'audit.view');
    const f = z.object({ q: z.string().trim().max(80).optional(), staff: uuid.optional(), before: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(10).max(500).default(100) }).parse(req.query);
    const p: unknown[] = [];
    const where: string[] = [];
    // Country staff see their country's records and their own actions; sign-in records of others stay with Owners.
    if (s.country) {
      p.push(s.country, s.id);
      where.push(`(a.country_code = $1 OR a.staff_id = $2)`);
    }
    if (s.role !== 'owner') {
      p.push(s.id);
      where.push(`(a.target_type IS DISTINCT FROM 'staff' OR a.staff_id = $${p.length})`);
    }
    if (f.q) {
      p.push(`%${f.q}%`);
      where.push(`(a.action ILIKE $${p.length} OR a.target_label ILIKE $${p.length} OR a.staff_name ILIKE $${p.length} OR a.reason ILIKE $${p.length})`);
    }
    if (f.staff) {
      p.push(f.staff);
      where.push(`a.staff_id = $${p.length}`);
    }
    if (f.before) {
      p.push(f.before);
      where.push(`a.id < $${p.length}`);
    }
    p.push(f.limit);
    const { rows } = await q(
      `SELECT a.id, a.at, a.staff_id AS "staffId", a.staff_name AS "staffName", a.staff_role AS "staffRole", a.action, a.target_type AS "targetType",
              a.target_id AS "targetId", a.target_label AS "targetLabel", a.reason, a.country_code AS country, a.ip, a.meta
         FROM staff_audit a ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT $${p.length}`,
      p,
    );
    return { entries: rows };
  });

  // Guard against old clients using the removed traveller-account roles.
  app.post('/admin/users/role', async () => {
    throw new HttpError(410, 'Staff are now managed in the staff console under Team and roles', 'gone');
  });
}
