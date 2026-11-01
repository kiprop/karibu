-- 1. How much checking each new category needs before it can be public.
-- Long-stay homes: fake landlords and "deposit first" scams are common, so documents (level 2) are required.
-- Home services: they come into your home, so documents (level 2) too. The rest start at level 1.
INSERT INTO category_min_level VALUES ('home', 2), ('home_services', 2), ('furniture', 1), ('utilities', 1), ('grooming', 1)
ON CONFLICT (category) DO NOTHING;

-- 2. "I paid this much" covers settling-in costs as well.
ALTER TABLE price_reports DROP CONSTRAINT IF EXISTS price_reports_group_name_check;
ALTER TABLE price_reports ADD CONSTRAINT price_reports_group_name_check
  CHECK (group_name IN ('food', 'drink', 'transport', 'stay', 'activity', 'shopping', 'other', 'home', 'services', 'utilities', 'grooming'));

-- 3. Richer experiences, so readers can find the ones like their own trip.
ALTER TABLE reviews ADD COLUMN traveller_type text
  CHECK (traveller_type IN ('solo', 'couple', 'family', 'friends', 'business', 'long_stay', 'moving_home'));

-- "Was this helpful?" One vote per account or device per experience.
CREATE TABLE review_votes (
  review_id  uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  voter      text NOT NULL,             -- 'u:<user id>' or 'd:<device id>'
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, voter)
);
CREATE INDEX review_votes_review ON review_votes (review_id);
