-- Karibu schema v1 · PostgreSQL 16 + PostGIS 3
-- Conventions: uuid keys, timestamptz stored in UTC, money as integer minor-free amounts
-- in the listing's own currency, every trust decision audited.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------- enums ----------
CREATE TYPE user_role       AS ENUM ('traveller','vendor','reviewer','admin');
CREATE TYPE token_kind      AS ENUM ('email_link','phone_code');
CREATE TYPE listing_category AS ENUM ('stay','safari','transport','guide','experience','event');
CREATE TYPE budget_tier     AS ENUM ('budget','mid','premium');
CREATE TYPE listing_status  AS ENUM ('draft','submitted','in_review','changes_requested','live','rejected','suspended','expired');
CREATE TYPE doc_result      AS ENUM ('pending','accepted','rejected');
CREATE TYPE report_status   AS ENUM ('open','triaged','actioned','dismissed');
CREATE TYPE plan_code       AS ENUM ('free','pro','featured');
CREATE TYPE sub_status      AS ENUM ('active','past_due','cancelled');

-- ---------- places ----------
CREATE TABLE countries (
  code          char(2) PRIMARY KEY,               -- ISO 3166-1 alpha-2
  name          text NOT NULL,
  currency      char(3) NOT NULL,
  time_zone     text NOT NULL,
  languages     text[] NOT NULL DEFAULT '{}',
  is_live       boolean NOT NULL DEFAULT false,
  launch_wave   smallint NOT NULL DEFAULT 9
);

CREATE TABLE cities (
  id            serial PRIMARY KEY,
  country_code  char(2) NOT NULL REFERENCES countries(code),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  kind          text NOT NULL DEFAULT 'city',        -- city | park | beach | town
  location      geography(Point,4326) NOT NULL,
  is_live       boolean NOT NULL DEFAULT false
);

-- ---------- people ----------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE,
  phone_e164    text UNIQUE CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  display_name  text,
  role          user_role NOT NULL DEFAULT 'traveller',
  google_sub    text UNIQUE,
  apple_sub     text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  deleted_at    timestamptz,
  CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL OR google_sub IS NOT NULL OR apple_sub IS NOT NULL)
);

CREATE TABLE login_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          token_kind NOT NULL,
  target        text NOT NULL,                       -- email or phone
  token_hash    text NOT NULL,                       -- sha256 of link token or code
  attempts      smallint NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_tokens_target_idx ON login_tokens (target, created_at DESC);

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- supply ----------
CREATE TABLE vendors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,
  country_code        char(2) NOT NULL REFERENCES countries(code),
  whatsapp_e164       text NOT NULL CHECK (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  phone_e164          text,
  email               text,
  licence_number      text,
  verification_level  smallint NOT NULL DEFAULT 0 CHECK (verification_level BETWEEN 0 AND 3),
  verified_at         timestamptz,
  reverify_due        date,
  is_suspended        boolean NOT NULL DEFAULT false,
  plan                plan_code NOT NULL DEFAULT 'free',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vendors_name_trgm ON vendors USING gin (name gin_trgm_ops);

CREATE TABLE vendor_members (
  vendor_id   uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_owner    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (vendor_id, user_id)
);

CREATE TABLE vendor_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  doc_type     text NOT NULL,
  storage_key  text NOT NULL,
  file_name    text,
  expires_on   date,
  result       doc_result NOT NULL DEFAULT 'pending',
  reviewed_by  uuid REFERENCES users(id),
  reviewed_at  timestamptz,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id           uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  city_id             int  NOT NULL REFERENCES cities(id),
  category            listing_category NOT NULL,
  subtype             text NOT NULL,
  title               text NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  slug                text NOT NULL UNIQUE,
  summary             text NOT NULL CHECK (length(summary) <= 200),
  description         text,
  location            geography(Point,4326) NOT NULL,
  location_is_private boolean NOT NULL DEFAULT false,
  budget_tier         budget_tier,
  currency            char(3) NOT NULL,
  price_from          integer CHECK (price_from >= 0),
  price_to            integer CHECK (price_to IS NULL OR price_to >= price_from),
  price_unit          text NOT NULL DEFAULT 'per person',   -- per night | per person | per vehicle per day | per seat
  attributes          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- category-specific, validated in the API
  amenities           text[] NOT NULL DEFAULT '{}',
  is_sample           boolean NOT NULL DEFAULT false,
  status              listing_status NOT NULL DEFAULT 'draft',
  featured_until      timestamptz,
  last_confirmed_at   timestamptz,
  published_at        timestamptz,
  search_doc          tsvector,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listings_location_gix ON listings USING gist (location);
CREATE INDEX listings_search_gin   ON listings USING gin (search_doc);
CREATE INDEX listings_title_trgm   ON listings USING gin (title gin_trgm_ops);
CREATE INDEX listings_live_idx     ON listings (status, category, city_id) WHERE status = 'live';
CREATE INDEX listings_amenities    ON listings USING gin (amenities);

CREATE OR REPLACE FUNCTION listings_search_doc() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_doc :=
      setweight(to_tsvector('simple', unaccent(coalesce(NEW.title,''))), 'A')
   || setweight(to_tsvector('simple', unaccent(coalesce(NEW.subtype,''))), 'B')
   || setweight(to_tsvector('simple', unaccent(coalesce(NEW.summary,''))), 'B')
   || setweight(to_tsvector('simple', unaccent(coalesce(NEW.description,''))), 'C');
  RETURN NEW;
END $$;
CREATE TRIGGER listings_search_doc_trg BEFORE INSERT OR UPDATE OF title, subtype, summary, description
  ON listings FOR EACH ROW EXECUTE FUNCTION listings_search_doc();

CREATE TABLE listing_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url         text NOT NULL,
  alt         text NOT NULL DEFAULT '',
  position    smallint NOT NULL DEFAULT 0
);

CREATE TABLE event_dates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL CHECK (ends_at > starts_at),
  confirmed_at timestamptz,
  ticket_url   text,
  is_cancelled boolean NOT NULL DEFAULT false
);

-- ---------- trust: state machine + audit ----------
CREATE TABLE listing_transitions (
  from_status listing_status NOT NULL,
  to_status   listing_status NOT NULL,
  PRIMARY KEY (from_status, to_status)
);
INSERT INTO listing_transitions VALUES
  ('draft','submitted'),('submitted','in_review'),('in_review','live'),
  ('in_review','changes_requested'),('in_review','rejected'),('changes_requested','submitted'),
  ('live','suspended'),('suspended','live'),('live','expired'),('expired','submitted'),
  ('live','submitted');   -- vendor edits a live listing: goes back to review

CREATE TABLE listing_events (
  id          bigserial PRIMARY KEY,
  listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  from_status listing_status NOT NULL,
  to_status   listing_status NOT NULL,
  actor_id    uuid,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION enforce_listing_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (SELECT 1 FROM listing_transitions WHERE from_status = OLD.status AND to_status = NEW.status) THEN
      RAISE EXCEPTION 'Illegal listing transition % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'live' THEN
      NEW.published_at := coalesce(NEW.published_at, now());
      NEW.last_confirmed_at := now();
    END IF;
    INSERT INTO listing_events (listing_id, from_status, to_status, actor_id, reason)
    VALUES (NEW.id, OLD.status, NEW.status,
            NULLIF(current_setting('app.actor', true), '')::uuid,
            NULLIF(current_setting('app.reason', true), ''));
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER listing_transition_guard BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION enforce_listing_transition();

-- Minimum verification level per category (drivers and safari operators need level 2)
CREATE TABLE category_min_level (
  category  listing_category PRIMARY KEY,
  min_level smallint NOT NULL
);
INSERT INTO category_min_level VALUES
  ('stay',1),('safari',2),('transport',2),('guide',1),('experience',1),('event',1);

-- The single definition of what travellers may see.
CREATE OR REPLACE VIEW public_listings AS
SELECT l.*, v.name AS vendor_name, v.slug AS vendor_slug, v.whatsapp_e164, v.phone_e164 AS vendor_phone,
       v.email AS vendor_email, v.verification_level, v.verified_at, v.plan,
       c.name AS city_name, c.slug AS city_slug, c.country_code,
       (l.featured_until IS NOT NULL AND l.featured_until > now()) AS is_featured
FROM listings l
JOIN vendors v ON v.id = l.vendor_id
JOIN cities  c ON c.id = l.city_id
JOIN category_min_level m ON m.category = l.category
WHERE l.status = 'live'
  AND NOT v.is_suspended
  AND (v.reverify_due IS NULL OR v.reverify_due >= current_date)
  AND v.verification_level >= GREATEST(m.min_level, CASE WHEN l.location_is_private THEN 3 ELSE 1 END)
  AND (l.last_confirmed_at IS NULL OR l.last_confirmed_at > now() - interval '180 days');

-- ---------- travellers ----------
CREATE TABLE enquiries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code         text NOT NULL UNIQUE,
  listing_id       uuid REFERENCES listings(id) ON DELETE SET NULL,
  vendor_id        uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  device_id        text,
  channel          text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','phone','email')),
  requested_date   date,
  reminder_contact text,
  source_code      text,                          -- creator or partner attribution
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enquiries_vendor_time ON enquiries (vendor_id, created_at);
CREATE INDEX enquiries_device ON enquiries (device_id);

CREATE TABLE favourites (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE trips (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  starts_on    date,
  ends_on      date CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  notes        text,
  share_token  text UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trip_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  listing_id  uuid REFERENCES listings(id) ON DELETE SET NULL,
  day         date,
  time_label  text,
  note        text,
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id   uuid NOT NULL UNIQUE REFERENCES enquiries(id) ON DELETE CASCADE,
  listing_id   uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body         text CHECK (body IS NULL OR length(body) <= 2000),
  status       text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  vendor_reply text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_listing ON reviews (listing_id) WHERE status = 'published';

CREATE TABLE recommendations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  business    text NOT NULL,
  contact     text,
  city        text,
  why         text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid REFERENCES listings(id) ON DELETE SET NULL,
  subject     text,                                -- free-text operator name when not listed
  category    text NOT NULL CHECK (category IN ('safety','scam','overcharged','wrong_info','other')),
  body        text NOT NULL CHECK (length(body) BETWEEN 5 AND 4000),
  contact     text,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  status      report_status NOT NULL DEFAULT 'open',
  resolution  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operator_watchlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  phone_e164  text,
  reason      text NOT NULL,
  added_by    uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX watchlist_name_trgm ON operator_watchlist USING gin (name gin_trgm_ops);

CREATE TABLE operator_lookups (
  id          bigserial PRIMARY KEY,
  query       text NOT NULL,
  result      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- information ----------
CREATE TABLE country_pages (
  country_code      char(2) NOT NULL REFERENCES countries(code),
  slug              text NOT NULL,              -- entry, health, money, sim, getting-around, safety
  title             text NOT NULL,
  body_md           text NOT NULL,
  source_urls       text[] NOT NULL DEFAULT '{}',
  last_reviewed_on  date NOT NULL,
  PRIMARY KEY (country_code, slug)
);

CREATE TABLE emergency_contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code      char(2) NOT NULL REFERENCES countries(code),
  kind              text NOT NULL CHECK (kind IN ('emergency','police','ambulance','embassy','hospital','tourist_police')),
  label             text NOT NULL,
  value             text NOT NULL,
  nationality       char(2),                       -- for embassies
  source_url        text,
  last_reviewed_on  date NOT NULL
);

CREATE TABLE advisories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL REFERENCES countries(code),
  city_id      int REFERENCES cities(id),
  message      text NOT NULL,
  starts_at    timestamptz NOT NULL DEFAULT now(),
  ends_at      timestamptz,
  created_by   uuid REFERENCES users(id)
);

CREATE TABLE price_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     int NOT NULL REFERENCES cities(id),
  group_name  text NOT NULL CHECK (group_name IN ('food','transport','other')),
  item        text NOT NULL,
  area        text,
  currency    char(3) NOT NULL,
  low         integer NOT NULL,
  high        integer NOT NULL CHECK (high >= low),
  checked_on  date NOT NULL,
  checked_by  uuid REFERENCES users(id),
  is_example  boolean NOT NULL DEFAULT false
);

-- ---------- billing (vendor plans only) ----------
CREATE TABLE plans (
  code            plan_code PRIMARY KEY,
  name            text NOT NULL,
  monthly_usd     numeric(8,2) NOT NULL,
  max_listings    int NOT NULL,
  features        text[] NOT NULL
);
INSERT INTO plans VALUES
  ('free','Free',0,1,ARRAY['Verification and badge','WhatsApp, phone and email buttons','Basic weekly stats','Reply to reviews']),
  ('pro','Pro',15,5,ARRAY['Everything in Free','Up to 5 listings','Seasonal prices and calendar','Full enquiry analytics','More photos','Priority re-verification']),
  ('featured','Featured',45,5,ARRAY['Everything in Pro','Labelled Featured placement in your destination','Home page rotation']);

CREATE TABLE subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id          uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  plan               plan_code NOT NULL,
  status             sub_status NOT NULL DEFAULT 'active',
  provider           text NOT NULL,
  provider_ref       text UNIQUE,
  current_period_end timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_events (
  id           bigserial PRIMARY KEY,
  provider     text NOT NULL,
  event_type   text NOT NULL,
  provider_ref text,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION new_ref_code() RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text; b bytea;
BEGIN
  LOOP
    b := gen_random_bytes(5);
    candidate := 'K-';
    FOR i IN 0..4 LOOP
      candidate := candidate || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM enquiries WHERE ref_code = candidate);
  END LOOP;
  RETURN candidate;
END $$;

CREATE OR REPLACE VIEW listing_ratings AS
SELECT listing_id, count(*)::int AS review_count, round(avg(rating)::numeric, 1) AS rating
FROM reviews WHERE status = 'published' GROUP BY listing_id;
