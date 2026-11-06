# Deploying EI Karibu to karibu.enkopintelligence.com

The app runs in Docker on one small Linux server. A **Cloudflare Tunnel** connects that server to Cloudflare, so:

- the server opens **no ports** to the internet (the tunnel connects outwards);
- Cloudflare provides HTTPS, the `karibu.enkopintelligence.com` DNS record, caching of static files and DDoS protection;
- the database is never reachable from outside.

```
Visitor ──HTTPS──▶ Cloudflare ──tunnel──▶ cloudflared ──▶ web (Next.js :3000) ──▶ api (Fastify :4000) ──▶ db (PostGIS)
                                          └──────────────── one server, docker-compose.prod.yml ─────────────────┘
```

Cloudflare Pages or Workers alone can't host this app: it needs a Node server that is always on and a PostgreSQL database with PostGIS.

## 1. A server

Any Ubuntu 22.04 or 24.04 server with **4 GB RAM** and 40 GB disk is enough to start (Hetzner, DigitalOcean, Azure or AWS all work). 2 GB works if you add swap, because the web build is memory-hungry.

```bash
# on the server
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in
```

## 2. The code

The repo is private, so either add a deploy key or use the GitHub CLI:

```bash
sudo apt install -y gh && gh auth login
gh repo clone kiprop/karibu && cd karibu
```

## 3. The Cloudflare Tunnel and subdomain

In the Cloudflare dashboard:

1. **Zero Trust → Networks → Tunnels → Create a tunnel**, choose **Cloudflared**, name it `karibu`.
2. On the install screen, copy the **token** (the long string after `--token`). You don't need to run the command they show; Docker does that.
3. **Public hostname → Add**:
   - Subdomain: `karibu`
   - Domain: `enkopintelligence.com`
   - Service: `HTTP` and `web:3000`
4. Save. Cloudflare creates the `karibu` DNS record for you.

If saving fails with "a record with that host already exists", go to **DNS → Records**, delete the existing `karibu` record (often an A record left over from a web host such as Hostinger), and save the hostname again. A subdomain created at a web host does nothing while Cloudflare manages your DNS, so you can remove it there too.

## 4. Sign-in emails (required)

In production, sign-in links are emailed. Until email is set up, **nobody can sign in, including you**.

1. Create a free account at resend.com and add the domain `enkopintelligence.com`.
2. Resend shows a few DNS records (SPF, DKIM). Add them in **Cloudflare → DNS** exactly as shown, with the proxy **off** (grey cloud).
3. When Resend shows the domain as verified, create an API key.

Phone sign-in needs an Africa's Talking account (`SMS_PROVIDER=africastalking`). Until then, use email.

## 5. Settings

```bash
cp .env.production.example .env.production
nano .env.production
```

Fill in `POSTGRES_PASSWORD` and `COOKIE_SECRET` (generate each with `openssl rand -hex 32`), `ADMIN_EMAIL` (your own inbox), `CLOUDFLARE_TUNNEL_TOKEN` and `MAIL_API_KEY`. The file is git-ignored; never commit it.

## 6. Start it

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production exec api node dist/db/seed.js
```

The database tables are created on start. The seed adds countries, cities, official links and price examples. It also adds clearly labelled sample businesses; to leave those out, run the seed with `-e SEED_SAMPLES=false` after `exec`.

## 7. The staff console

The staff console at **https://karibu.enkopintelligence.com/admin** has its own sign-in, separate from traveller and business accounts: a work email, a password, and a code from an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password).

The first time the seed runs, it invites `ADMIN_EMAIL` as the **Owner** and prints the invitation link (it's also emailed). Open it to choose a password, scan the QR code with your authenticator app, and save your recovery codes. From then on, invite everyone else from **Team and roles** inside the console.

If the link is lost, or the only Owner loses their phone and recovery codes, use the command line on the server:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec api node dist/db/staff-cli.js list
docker compose -f docker-compose.prod.yml --env-file .env.production exec api node dist/db/staff-cli.js reset you@example.com
docker compose -f docker-compose.prod.yml --env-file .env.production exec api node dist/db/staff-cli.js invite person@example.com country_lead KE "Their Name"
```

Roles: `owner`, `country_lead`, `verification_officer`, `field_verifier`, `trust_safety`, `content_editor`, `business_support`, `finance`, `analyst`. Use `ALL` instead of a country code for all countries.

Staff sessions end after 30 minutes without activity (`STAFF_IDLE_MINUTES`) and after 12 hours at most (`STAFF_SESSION_HOURS`). Authenticator secrets are encrypted with `STAFF_SECRET_KEY` (falls back to `COOKIE_SECRET`); if you change that key, every staff member has to be reset.

For an extra lock, you can put **Cloudflare Access** (Zero Trust, free for up to 50 users) in front of `karibu.enkopintelligence.com/admin*` and `/api/staff*`, `/api/admin*`, allowing only your staff emails.

## 8. Ask Karibu and WhatsApp (optional)

Ask Karibu works without any extra setup: it answers from Karibu's own data (fair prices, verified listings, the watchlist, Travel smart pages and official links) and always lists its sources.

- **Smoother wording:** set `ANTHROPIC_API_KEY`. The model only rewords the answer Karibu already built; it can't add facts, prices or rules, and emergencies are never reworded.
- **Karibu on WhatsApp:** create a WhatsApp Business app in Meta for Developers, add a phone number, then set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, a `WHATSAPP_VERIFY_TOKEN` you choose, and the app's `WHATSAPP_APP_SECRET`. Point the webhook at `https://karibu.enkopintelligence.com/api/webhooks/whatsapp` with that verify token and subscribe to `messages`. Until then, replies are written to the api log.

## Updating

```bash
cd karibu && git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Database changes apply automatically on start. Re-running the seed is safe.

**Upgrading to the staff console (November 2026).** The old Admin link for traveller accounts is gone. After updating, run the seed once (`… exec api node dist/db/seed.js`); because no staff exist yet, it invites `ADMIN_EMAIL` as Owner and prints the link. See section 7.

## Backups

The database is the only thing you can't rebuild. A nightly dump, kept for 14 days:

```bash
mkdir -p ~/backups
crontab -e
# add:
15 2 * * * cd ~/karibu && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db pg_dump -U karibu karibu | gzip > ~/backups/karibu-$(date +\%F).sql.gz && find ~/backups -name '*.sql.gz' -mtime +14 -delete
```

Copy the backups off the server too (for example to Cloudflare R2 or another cloud bucket). Uploaded business documents are in the `uploads` Docker volume; back that up as well.

## Troubleshooting

**The api keeps restarting.** Look at why: `docker compose -f docker-compose.prod.yml --env-file .env.production logs api --tail 40`.
"password authentication failed" or "role karibu does not exist" means the database was created earlier with different
credentials. If it holds nothing you need, remove it and start again (this deletes the production database):
`docker compose -f docker-compose.prod.yml --env-file .env.production down -v`, then `up -d --build`.

**"platform (linux/amd64) does not match" on a Mac.** Harmless: the PostGIS image runs through emulation on Apple
Silicon. Linux servers don't show this.

## Useful commands

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps          # what's running
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api # API logs
docker compose -f docker-compose.prod.yml --env-file .env.production restart web
```

## Before a public launch

- Replace or remove the sample businesses, and replace the example price figures with real checks.
- Switch map tiles to a paid provider (`NEXT_PUBLIC_TILE_URL`); OpenStreetMap's own servers are for light use only.
- When you outgrow one server, move the database to a managed PostgreSQL with PostGIS and documents to Cloudflare R2. The README's scaling section has the order.
