/**
 * Staff accounts from the command line, for when nobody can sign in to the console (for example, the only Owner lost their phone).
 *
 *   node dist/db/staff-cli.js list
 *   node dist/db/staff-cli.js invite <email> <role> [country|ALL] ["Display name"]
 *   node dist/db/staff-cli.js reset <email>
 *
 * Roles: owner, country_lead, verification_officer, field_verifier, trust_safety, content_editor, business_support, finance, analyst
 */
import { pool } from './pool.js';
import { inviteStaff } from '../routes/staff.js';
import { ROLE_PERMS, type StaffRole } from '../lib/staff.js';

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'list') {
    const { rows } = await pool.query(`SELECT email, display_name, role, coalesce(country_code, 'ALL') AS country, status, last_login_at FROM staff_members ORDER BY role, email`);
    console.table(rows);
    return;
  }
  if (cmd === 'invite') {
    const [email, role, country, ...name] = args;
    if (!email || !role || !(role in ROLE_PERMS)) throw new Error(`Usage: invite <email> <role> [country|ALL] ["Name"]\nRoles: ${Object.keys(ROLE_PERMS).join(', ')}`);
    const cc = !country || country.toUpperCase() === 'ALL' ? null : country.toUpperCase();
    const out = await inviteStaff({ email, role: role as StaffRole, country: cc, displayName: name.join(' ') || email.split('@')[0] });
    console.log(`Invited ${email} as ${role}. Invitation link (works once, 7 days):\n\n  ${out.link}\n`);
    return;
  }
  if (cmd === 'reset') {
    const { rows } = await pool.query(`SELECT email, display_name, role, country_code FROM staff_members WHERE email = lower($1)`, [args[0] ?? '']);
    if (!rows[0]) throw new Error('No staff member with that email');
    const out = await inviteStaff({ email: rows[0].email, displayName: rows[0].display_name, role: rows[0].role, country: rows[0].country_code?.trim() ?? null, reset: true });
    console.log(`Sign-in reset for ${rows[0].email}. New invitation link (works once, 7 days):\n\n  ${out.link}\n`);
    return;
  }
  console.log('Commands: list | invite <email> <role> [country|ALL] ["Name"] | reset <email>');
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
