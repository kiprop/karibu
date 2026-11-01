-- 1. Traveller experiences.
-- A review no longer has to come from an enquiry made through Karibu. Any signed-in traveller can share an
-- experience with a business: stars, would they recommend it, what they paid and what happened.
-- Reviews linked to an enquiry are marked "Contacted through Karibu" so readers can weigh them.
-- Stars need a signed-in account (accountability); prices alone can still be shared as a guest.

ALTER TABLE reviews ALTER COLUMN enquiry_id DROP NOT NULL;
ALTER TABLE reviews
  ADD COLUMN recommend        boolean,
  ADD COLUMN visited_on       date,
  ADD COLUMN price_report_id  uuid REFERENCES price_reports(id) ON DELETE SET NULL,
  ADD COLUMN updated_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN hidden_reason    text;
-- One free-standing experience per traveller per business; they edit it rather than piling up.
CREATE UNIQUE INDEX reviews_one_per_traveller ON reviews (listing_id, user_id) WHERE enquiry_id IS NULL AND user_id IS NOT NULL;

DROP VIEW listing_ratings;
CREATE VIEW listing_ratings AS
SELECT listing_id,
       count(*)::int                                         AS review_count,
       round(avg(rating)::numeric, 1)                        AS rating,
       (count(*) FILTER (WHERE recommend IS NOT NULL))::int  AS recommend_answers,
       (count(*) FILTER (WHERE recommend))::int              AS recommend_yes,
       (count(*) FILTER (WHERE enquiry_id IS NOT NULL))::int AS contacted_count
  FROM reviews WHERE status = 'published' GROUP BY listing_id;

-- 2. Official government links per country, so visitors know where to go for visas, park fees,
-- licence checks, health rules, trains and embassies. Checked by the team; each row shows when.
CREATE TABLE country_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code    char(2) NOT NULL REFERENCES countries(code),
  topic           text NOT NULL CHECK (topic IN ('entry', 'safety', 'parks', 'business_check', 'health', 'transport', 'embassies', 'complaints', 'tourism')),
  title           text NOT NULL,
  url             text NOT NULL CHECK (url ~ '^https://'),
  description     text NOT NULL,
  warning         text,                     -- e.g. "Only use this site; look-alike sites charge extra"
  position        smallint NOT NULL DEFAULT 0,
  last_checked_on date NOT NULL DEFAULT current_date,
  is_active       boolean NOT NULL DEFAULT true,
  UNIQUE (country_code, url)
);
CREATE INDEX country_links_country ON country_links (country_code, topic, position) WHERE is_active;

-- 3. Shareable business pages (/b/<slug>): a short "about" and the business's own website.
ALTER TABLE vendors
  ADD COLUMN about   text CHECK (char_length(about) <= 600),
  ADD COLUMN website text CHECK (website IS NULL OR website ~ '^https?://');
