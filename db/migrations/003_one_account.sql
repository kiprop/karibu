-- One account for everyone.
-- Before: the sign-in method decided the account type (email = traveller, phone = vendor), so a business
-- owner who signed in by email could not reach their business, and a traveller who used a phone became a "vendor".
-- After: anyone signs in with a verified email, phone or Google. Business access comes from vendor_members
-- (owning or helping run a business), never from how you signed in. users.role now only marks staff
-- (reviewer, admin); everyone else is 'traveller'. The 'vendor' enum value stays for compatibility but is unused.

UPDATE users SET role = 'traveller' WHERE role = 'vendor';

-- Which sign-in identifiers have been proven. Every existing one was proven by signing in with it.
ALTER TABLE users
  ADD COLUMN email_verified_at timestamptz,
  ADD COLUMN phone_verified_at timestamptz;
UPDATE users SET email_verified_at = coalesce(last_seen_at, created_at) WHERE email IS NOT NULL AND email NOT LIKE 'deleted+%@invalid';
UPDATE users SET phone_verified_at = coalesce(last_seen_at, created_at) WHERE phone_e164 IS NOT NULL;

-- A sign-in token can be "add this to my account" rather than "sign me in".
ALTER TABLE login_tokens ADD COLUMN for_user_id uuid REFERENCES users(id) ON DELETE CASCADE;

-- Business contact details travellers see, and whether they were proven.
-- WhatsApp is proven when it matches an owner's verified phone; email when it matches a member's verified
-- sign-in email or the business clicks a link sent to it.
ALTER TABLE vendors
  ADD COLUMN email_verified_at timestamptz,
  ADD COLUMN whatsapp_verified_at timestamptz;
UPDATE vendors v SET whatsapp_verified_at = now()
  WHERE EXISTS (SELECT 1 FROM vendor_members m JOIN users u ON u.id = m.user_id WHERE m.vendor_id = v.id AND u.phone_e164 = v.whatsapp_e164);
UPDATE vendors v SET email_verified_at = now()
  WHERE v.email IS NOT NULL AND EXISTS (SELECT 1 FROM vendor_members m JOIN users u ON u.id = m.user_id WHERE m.vendor_id = v.id AND lower(u.email) = lower(v.email));

ALTER TYPE token_kind ADD VALUE IF NOT EXISTS 'vendor_email';
