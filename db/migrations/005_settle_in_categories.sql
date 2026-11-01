-- Settle in: Karibu also serves long stays and people moving home (repatriates, remote workers, long-term
-- visitors). They need a home, furniture, someone to fix the plumbing, internet and a good barber.
-- New category values live in their own migration: Postgres can't use a new enum value in the transaction that adds it.
ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'home';           -- long-stay rentals and letting agents
ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'furniture';      -- furniture, appliances, workshops (fundis), second-hand
ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'home_services';  -- movers, cleaners, plumbers, electricians, security
ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'utilities';      -- home internet, mobile, power, water, gas, solar
ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'grooming';       -- barbers, salons, natural hair, nails, spa
