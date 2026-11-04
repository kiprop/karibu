-- 008: password sign-in for every account, and a separate staff console with roles,
-- two-step sign-in, country scope, second approvals and an append-only audit log.

-- ---------- Passwords for traveller and business accounts ----------
ALTER TABLE users
  ADD COLUMN password_hash       text,
  ADD COLUMN password_changed_at timestamptz,
  ADD COLUMN failed_logins       smallint NOT NULL DEFAULT 0,
  ADD COLUMN locked_until        timestamptz;

-- Sessions remember whether "Keep me signed in" was ticked, and where they came from.
ALTER TABLE sessions
  ADD COLUMN remember     boolean NOT NULL DEFAULT true,
  ADD COLUMN user_agent   text,
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

-- Codes that prove an email or phone before a password is set (new account or reset).
-- The new password's hash waits in payload until the code is confirmed.
ALTER TYPE token_kind ADD VALUE IF NOT EXISTS 'signup_code';
ALTER TYPE token_kind ADD VALUE IF NOT EXISTS 'reset_code';
ALTER TABLE login_tokens ADD COLUMN payload jsonb;

-- ---------- Staff ----------
CREATE TYPE staff_role AS ENUM (
  'owner', 'country_lead', 'verification_officer', 'field_verifier', 'trust_safety',
  'content_editor', 'business_support', 'finance', 'analyst'
);

-- Staff are not traveller accounts. user_id links each staff member to a users row only so that
-- existing "who did this" columns (listing_events.actor_id, watchlist.added_by and so on) keep working.
CREATE TABLE staff_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL UNIQUE REFERENCES users(id),
  email            text NOT NULL UNIQUE CHECK (email = lower(email)),
  display_name     text NOT NULL,
  role             staff_role NOT NULL,
  country_code     char(2) REFERENCES countries(code),          -- NULL: all countries
  status           text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  password_hash    text,
  totp_secret      text,                                         -- encrypted at rest
  totp_enabled_at  timestamptz,
  totp_last_step   bigint,                                       -- stops a code being used twice
  recovery_codes   text[] NOT NULL DEFAULT '{}',                 -- sha256 of unused one-time codes
  failed_logins    smallint NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  invited_by       uuid REFERENCES staff_members(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_login_at    timestamptz,
  CHECK (status <> 'active' OR (password_hash IS NOT NULL AND totp_enabled_at IS NOT NULL))
);

-- One-time tokens: invitations, the second sign-in step, and authenticator set-up.
CREATE TABLE staff_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('invite', 'mfa', 'enrol')),
  token_hash  text NOT NULL UNIQUE,
  attempts    smallint NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Short sessions: 12 hours at most, and they end after 30 minutes without activity.
CREATE TABLE staff_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  ip           text,
  user_agent   text
);

-- Every staff sign-in and decision. Rows can be added, never changed or removed.
CREATE TABLE staff_audit (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  staff_id     uuid REFERENCES staff_members(id),
  staff_name   text,
  staff_role   staff_role,
  action       text NOT NULL,
  target_type  text,
  target_id    text,
  target_label text,
  reason       text,
  country_code char(2),
  ip           text,
  meta         jsonb
);
CREATE INDEX staff_audit_at ON staff_audit (at DESC);
CREATE INDEX staff_audit_staff ON staff_audit (staff_id, at DESC);

CREATE OR REPLACE FUNCTION staff_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The staff audit log cannot be changed' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER staff_audit_no_update BEFORE UPDATE OR DELETE ON staff_audit
  FOR EACH ROW EXECUTE FUNCTION staff_audit_append_only();

-- Decisions that need a second person: a Visited (level 3) badge, suspending a verified business,
-- and confirming an emergency listing suspension.
CREATE TABLE staff_approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('level3', 'suspend_vendor', 'confirm_suspension')),
  target_id     uuid NOT NULL,
  target_label  text NOT NULL,
  country_code  char(2),
  payload       jsonb NOT NULL DEFAULT '{}',
  requested_by  uuid NOT NULL REFERENCES staff_members(id),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  reason        text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  decided_by    uuid REFERENCES staff_members(id),
  decided_at    timestamptz,
  decision_note text,
  CHECK (decided_by IS NULL OR decided_by <> requested_by OR (payload ->> 'solo')::boolean)
);
CREATE UNIQUE INDEX staff_approvals_one_pending ON staff_approvals (kind, target_id) WHERE status = 'pending';

-- Field visits for level 3.
CREATE TABLE field_visits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  assigned_to   uuid NOT NULL REFERENCES staff_members(id),
  scheduled_for timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'submitted', 'cancelled')),
  checklist     jsonb NOT NULL DEFAULT '{}',
  notes         text,
  checked_in_at timestamptz,
  submitted_at  timestamptz,
  created_by    uuid REFERENCES staff_members(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX field_visits_assignee ON field_visits (assigned_to, scheduled_for);

-- ---------- What insights need ----------
-- Searches, without who made them, so the team can see demand and gaps (searches with few verified results).
CREATE TABLE search_log (
  id            bigserial PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  device_id     text,
  query         text,
  query_key     text GENERATED ALWAYS AS (lower(regexp_replace(btrim(query), '\s+', ' ', 'g'))) STORED,
  country_code  char(2),
  city_slug     text,
  category      text,
  mode          text,
  results       int NOT NULL
);
CREATE INDEX search_log_at ON search_log (at);

-- Listing page views, counted per day.
CREATE TABLE listing_views (
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day        date NOT NULL DEFAULT current_date,
  views      int NOT NULL DEFAULT 1,
  PRIMARY KEY (listing_id, day)
);

-- When a report was handled, for the "on time" measures.
ALTER TABLE reports ADD COLUMN resolved_at timestamptz, ADD COLUMN handled_by uuid REFERENCES users(id);
UPDATE reports SET resolved_at = created_at WHERE status IN ('actioned', 'dismissed') AND resolved_at IS NULL;
