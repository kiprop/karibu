-- 009: the travel companion. Smart search requests, personal trip context, the settle-in plan,
-- shared trip editing, seasonal notes for explained suggestions, and the Ask Karibu question log.

-- "Tell us you need this" from a search that found nothing.
CREATE TABLE demand_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query       text NOT NULL,
  city_slug   text,
  category    text,
  contact     text,
  note        text,
  device_id   text,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'recruiting', 'filled', 'closed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX demand_requests_created ON demand_requests (created_at DESC);

-- What the companion needs to know to be useful. All optional; guests keep the same on their device.
CREATE TABLE traveller_profiles (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode             text CHECK (mode IN ('visit', 'settle')),
  passport_country char(2),
  arriving_on      date,
  leaving_on       date,
  base_city        text,
  traveller_type   text,
  party_size       smallint CHECK (party_size BETWEEN 1 AND 30),
  budget           text CHECK (budget IN ('budget', 'mid', 'premium')),
  language         text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'sw')),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Ticked steps of the before-you-go checklist and the 30-day settle-in plan.
CREATE TABLE checklist_progress (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_key   text NOT NULL,
  done_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, step_key)
);

-- Plan a trip together: anyone with the edit link can join as an editor.
ALTER TABLE trips ADD COLUMN edit_token text UNIQUE;
CREATE TABLE trip_members (
  trip_id    uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'editor' CHECK (role IN ('editor')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
ALTER TABLE trip_items ADD COLUMN added_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- Typical seasons by place, edited by the content team. Used to explain suggestions ("migration crossings peak in your dates").
CREATE TABLE season_notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_slug        text,                 -- NULL: whole country
  country_code     char(2) NOT NULL REFERENCES countries(code),
  months           smallint[] NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('highlight', 'weather', 'busy', 'event')),
  category         text,                 -- the listing category it relates to, if any
  note             text NOT NULL,
  last_reviewed_on date NOT NULL DEFAULT current_date
);

-- Questions asked of Ask Karibu: what was asked and whether it could be answered. Never who asked.
CREATE TABLE ask_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  channel     text NOT NULL CHECK (channel IN ('web', 'whatsapp')),
  intent      text,
  question    text NOT NULL,
  answered    boolean NOT NULL,
  sources     smallint NOT NULL DEFAULT 0,
  helpful     boolean
);
CREATE INDEX ask_log_at ON ask_log (at DESC);
