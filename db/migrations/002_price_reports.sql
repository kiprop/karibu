-- "I paid this much": traveller price reports.
-- Travellers (guest or signed in) say what they paid for an item in a city, optionally at a listed business.
-- Public pages show ranges from these reports next to the team's checked prices, so the next traveller
-- knows the going rate before they are quoted a "mzungu price".

CREATE TYPE price_feel AS ENUM ('fair', 'high', 'ripoff');

CREATE TABLE price_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       int  NOT NULL REFERENCES cities(id),
  listing_id    uuid REFERENCES listings(id) ON DELETE SET NULL,
  group_name    text NOT NULL CHECK (group_name IN ('food', 'drink', 'transport', 'stay', 'activity', 'shopping', 'other')),
  item          text NOT NULL CHECK (char_length(item) BETWEEN 2 AND 80),
  -- Normalised name used to group reports of the same thing ("Plate of  Ugali" = "plate of ugali").
  item_key      text GENERATED ALWAYS AS (lower(regexp_replace(btrim(item), '\s+', ' ', 'g'))) STORED,
  area          text CHECK (char_length(area) <= 80),
  amount        integer NOT NULL CHECK (amount > 0 AND amount < 100000000),
  currency      char(3) NOT NULL DEFAULT 'KES' CHECK (currency IN ('KES', 'TZS', 'UGX', 'RWF', 'ETB', 'USD')),
  unit          text CHECK (char_length(unit) <= 40),
  paid_on       date NOT NULL DEFAULT current_date,
  feel          price_feel,
  negotiated    boolean,
  note          text CHECK (char_length(note) <= 280),
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  device_id     text,
  is_example    boolean NOT NULL DEFAULT false,
  is_hidden     boolean NOT NULL DEFAULT false,
  hidden_reason text,
  hidden_by     uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (paid_on <= current_date + 1)
);

CREATE INDEX price_reports_city_item ON price_reports (city_id, item_key) WHERE NOT is_hidden;
CREATE INDEX price_reports_listing ON price_reports (listing_id) WHERE listing_id IS NOT NULL AND NOT is_hidden;
CREATE INDEX price_reports_item_trgm ON price_reports USING gin (item_key gin_trgm_ops);
CREATE INDEX price_reports_recent ON price_reports (created_at DESC);

-- One row per city, item and currency, from visible reports paid in the last 12 months.
-- The typical range (p25, median, p75) leaves out reports the traveller flagged as a rip-off: those show
-- what overcharging looks like, not the going rate. They still count in reports, min, max and ripoff_share.
CREATE VIEW price_report_summary AS
SELECT r.city_id,
       r.item_key,
       r.currency,
       mode() WITHIN GROUP (ORDER BY r.item)       AS item,
       mode() WITHIN GROUP (ORDER BY r.group_name) AS group_name,
       mode() WITHIN GROUP (ORDER BY r.unit)       AS unit,
       count(*)::int                                AS reports,
       (count(*) FILTER (WHERE r.feel IS DISTINCT FROM 'ripoff'))::int AS typical_reports,
       min(r.amount)                                AS min_amount,
       max(r.amount)                                AS max_amount,
       round(percentile_cont(0.25) WITHIN GROUP (ORDER BY r.amount) FILTER (WHERE r.feel IS DISTINCT FROM 'ripoff'))::int AS p25,
       round(percentile_cont(0.50) WITHIN GROUP (ORDER BY r.amount) FILTER (WHERE r.feel IS DISTINCT FROM 'ripoff'))::int AS median,
       round(percentile_cont(0.75) WITHIN GROUP (ORDER BY r.amount) FILTER (WHERE r.feel IS DISTINCT FROM 'ripoff'))::int AS p75,
       round(avg((r.feel = 'ripoff')::int)::numeric, 2) AS ripoff_share,
       max(r.paid_on)                               AS last_paid,
       bool_or(r.is_example)                        AS has_examples
  FROM price_reports r
 WHERE NOT r.is_hidden AND r.paid_on > current_date - 365
 GROUP BY r.city_id, r.item_key, r.currency;
