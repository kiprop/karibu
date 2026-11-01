# EI Karibu

**Branding:** the Enkop Intelligence logo is `apps/web/public/brand/ei-logo.png` (original) and `ei-logo-dark.png` (near-black recoloured for dark mode). Replace both to update the header, footer and app icons.

Verified travel information for East Africa. Travellers find stays, game drives, transport, guides, experiences and events, check that a business is real, and message it directly on WhatsApp. Karibu never handles payments between travellers and businesses. Businesses can pay Karibu a subscription for more listings and labelled visibility, but verification is free and can't be bought.

An Enkop Intelligence venture. Product spec: the Karibu PRD v1.0 (Claude doc).

## What's in the MVP

**Travellers (guest or signed in)**
- Search and filter by country, destination, category, type, budget, price, amenities, verification level and distance; list and map views.
- Listing pages with category facts (park, vehicle, hot water hours, Wi-Fi speed and so on), verification badge, freshness and ratings (shown once there are 3+ reviews).
- Contact on WhatsApp with a prefilled message and a reference code (K-XXXXX); optional reminder to review.
- Safety tools: operator check against a watchlist, emergency numbers, safe meetup guide, reporting, and **official government links** per country (eTA and eVisa portals, the TRA licence checker, KWS park fees, SGR tickets, health, police, complaints), each with a checked date and look-alike-site warnings.
- **Share your experience** (/share): signed-in travellers rate a business with stars, recommend yes or no, what they paid and what happened. Experiences from a Karibu enquiry are marked "Contacted via Karibu". Shown on listing pages, business pages (/b/&lt;slug&gt;) and a feed; reviewers moderate at /admin/experiences.
- **Fair prices and "I paid this much"**: anyone (no account needed) can report what they paid for a meal, ride, tour or souvenir, in a city or at a listed business. The price board shows team-checked prices next to traveller ranges, and "Is this price fair?" compares any quote with both, so visitors know the going rate before they're quoted a "mzungu price". Reports flagged as rip-offs are kept out of the typical range; reviewers can hide outliers at /admin/prices.
- Signed in (email magic link, or Google): favourites, trip planner by day with a route map and share link, enquiry history, reviews tied to a real enquiry, recommendations. Guest favourites and enquiries merge into the account on sign-in.

**Settle in (long stays and moving home)**
- For returning diaspora, remote workers and long stays: long-stay homes, furniture and home goods (local workshops to big stores, new and second-hand), home services (movers, cleaners, plumbers, electricians, security), internet and utilities, and hair and grooming.
- "Visiting" and "Staying long or moving home" modes in search and Explore, a Settle in section on the home page and a moving-home guide at /settle. Long-stay homes and home services need document checks (level 2) before they appear.

**Listing pages** follow the best review sites: breadcrumbs, a photo mosaic with a full-screen viewer, rating summary with "% recommend", "Why people like it" highlights, a sticky section menu, a rating breakdown you can click to filter, filters by who went (solo, family, long stay, moving home and more), popular mentions, search within experiences, sorting, "Helpful" votes, an "About the business" card and "You might also like". Search matches word beginnings and English stems ("sofa" finds sofas) across listing details.

**Businesses**
- Phone sign-in by SMS code, business profile, listings for each category with a review workflow, private document upload, monthly "still accurate" confirmation, enquiry stats with CSV export, review replies.
- Plans: Free (1 listing), Pro ($15, 5 listings), Featured ($45, labelled placement). Paystack checkout once early access ends.

**Reviewers and admins**
- Review queue with documents, verification level decision (1 phone, 2 documents, 3 visit) and notes; reports with 4 hour (safety and scam) and 2 day targets; listing and vendor suspension; watchlist, advisories, price checks and stale content endpoints.

## Who can do what

| | Guest (no account) | Signed-in traveller | Business (any account that adds a business) |
|---|---|---|---|
| Search, read listings, message on WhatsApp | yes | yes | yes |
| Check operators, prices, official links, report scams | yes | yes | yes |
| "I paid this much" price reports | yes | yes | yes |
| Saved places on every device, trip planner, enquiry history | on this device only | yes | yes |
| Rate a business (stars, recommend, what you paid, what happened) | no | yes | yes, but not their own |
| Business tools: listings, documents, enquiries, replies, plans, public page and badge | no | no | yes |

There is one kind of account. Anyone signs in with a verified **email** (magic link), **mobile number** (SMS code) or Google, and can add the other method later from Account. Business tools appear when the account owns or helps run a business (`vendor_members`), never because of how they signed in. A business's WhatsApp and email count as confirmed when they match a verified sign-in, or when the business clicks a link sent to its shared inbox. `users.role` marks staff only (reviewer, admin).

## Architecture

```
apps/web   Next.js 15 (App Router, React 19, Tailwind, Leaflet)   :3000
             └─ /api/*  proxied at runtime (src/app/api/[...path]) to API_URL, so the session cookie stays first-party
apps/api   Fastify 5 + TypeScript + zod + pg                      :4000  (/v1/*)
db/        SQL migrations: PostgreSQL 16 + PostGIS, pg_trgm, unaccent
```

Rules that matter for trust live in the database, so no code path can skip them:
- `public_listings` view is the only thing public endpoints read: live status, vendor not suspended, verification current, minimum level per category (game drives and transport need level 2, private homes level 3), confirmed in the last 180 days.
- A trigger enforces the listing state machine and writes every transition to `listing_events` with who and why.

## Run it locally

Needs Node 22, pnpm 10 and PostgreSQL 16 with PostGIS (or Docker).

```bash
pnpm install
# Database: either your own Postgres with PostGIS, or
docker compose up -d db
createdb -h localhost -U postgres karibu   # skip if using docker compose (it creates it)

pnpm db:migrate
pnpm db:seed          # Kenya live, TZ/UG/RW/ET upcoming, 14 sample listings, admin@karibu.example

pnpm dev:api          # http://localhost:4000/v1/health
pnpm dev:web          # http://localhost:3000
```

Copy `apps/api/.env.example` and `apps/web/.env.example` if you need to change defaults.

**Signing in during development.** Email and SMS go to the API console. With `EXPOSE_DEV_SECRETS` on (the default outside production) the sign-in screens also show the magic link or SMS code so you can click straight through.
- Traveller: any email.
- Business: any phone number, then create a business on /vendor.
- Reviewer: `admin@karibu.example`, then open /admin.

Full stack in Docker: `docker compose up --build`, then `docker compose exec api node dist/db/seed.js`. After pulling new code, run the same two commands again: new migrations apply on start and the seed is safe to re-run.

## Tests

```bash
pnpm test        # API integration tests against a real Postgres (creates karibu_test)
pnpm typecheck
pnpm build
```

CI (`.github/workflows/ci.yml`) runs typecheck, the API tests against PostGIS, and both builds.

## Going to production

- Set `NODE_ENV=production`, a long random `COOKIE_SECRET`, `WEB_URL`, and `EXPOSE_DEV_SECRETS=false`. Serve over HTTPS and leave `COOKIE_SECURE` unset (the compose file sets it to false only for plain-http localhost).
- Email: `MAIL_PROVIDER=resend` and `MAIL_API_KEY`. SMS: `SMS_PROVIDER=africastalking`, `SMS_USERNAME`, `SMS_API_KEY`.
- Payments: set `EARLY_ACCESS=false`, `PAYSTACK_SECRET_KEY` and plan codes, and point the Paystack webhook at `https://<api>/v1/webhooks/paystack`.
- Map tiles: use a paid tile provider via `NEXT_PUBLIC_TILE_URL`.
- Document storage: the local driver suits one server. Move to S3 or Cloudflare R2 before running more than one API instance.
- Replace the seeded sample listings (`is_sample = true`) with real, verified businesses before launch.

### Scaling path

The API is stateless (sessions in Postgres), so it scales horizontally behind a load balancer. In order of need:
1. Managed Postgres with PostGIS (Neon, Supabase, RDS, Crunchy) and a read replica for search.
2. Object storage plus a CDN for photos and documents.
3. A job queue (pg-boss on the same Postgres) for email, SMS, review reminders and re-verification reminders.
4. A search engine (Meilisearch or Typesense) only when Postgres full-text plus trigram stops being enough, likely beyond tens of thousands of listings.
5. New countries are data, not code: add rows to `countries`, `cities`, `country_pages` and `emergency_contacts`, and set `is_live`.

## Not yet verified

Docker images and compose (written, not built here), Google sign-in, real email and SMS delivery, and live Paystack checkout all need a first run with real credentials.
