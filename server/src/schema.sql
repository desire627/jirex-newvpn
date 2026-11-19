CREATE TABLE IF NOT EXISTS users (
  id                     SERIAL PRIMARY KEY,
  email                  TEXT UNIQUE,
  password_hash          TEXT,
  is_admin               BOOLEAN NOT NULL DEFAULT FALSE,
  -- The customer can use the VPN while access_until is in the future.
  access_until           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS servers (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  country     TEXT,
  endpoint    TEXT NOT NULL,          -- what clients connect to, e.g. 203.0.113.10:51820
  public_key  TEXT NOT NULL,          -- WireGuard server public key
  dns         TEXT NOT NULL DEFAULT '1.1.1.1, 1.0.0.1',
  agent_url   TEXT NOT NULL,          -- e.g. https://203.0.113.10:8443
  agent_token TEXT NOT NULL,
  agent_cert  TEXT NOT NULL,          -- agent's self-signed TLS certificate (pinned)
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id       INT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  public_key      TEXT UNIQUE NOT NULL,
  private_key_enc TEXT NOT NULL,
  ip_index        INT NOT NULL,       -- client address = 10.8.(ip_index / 256).(ip_index % 256)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, ip_index)
);

CREATE TABLE IF NOT EXISTS payments (
  id           SERIAL PRIMARY KEY,
  user_id      INT REFERENCES users(id) ON DELETE SET NULL,
  provider     TEXT NOT NULL,         -- transfer (receipt) | manual (added by admin)
  provider_ref TEXT NOT NULL,
  plan         TEXT,
  amount       NUMERIC(14, 2) NOT NULL,
  currency     TEXT NOT NULL,
  status       TEXT NOT NULL,         -- pending | successful | failed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'phone';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS installation_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS devices_installation_key ON devices (user_id, server_id, installation_id);

-- AmneziaWG camouflage settings for each server (Jc, Jmin, Jmax, S1, S2, H1-H4).
-- Every customer config for that server must carry the same values.
ALTER TABLE servers ADD COLUMN IF NOT EXISTS obfuscation JSONB;

-- Email verification + sessions that can be cancelled (bumping token_version signs out everywhere)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

-- One person = one account: variants of the same inbox (dots/+tags in Gmail etc.) share this value
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_canonical TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_canonical_key ON users(email_canonical);
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_key_hash TEXT UNIQUE;
-- The key itself, encrypted (AES-256-GCM with ENCRYPTION_KEY), so customers can view it again.
-- Sign-in still looks keys up by their hash.
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_key_enc TEXT;
-- New email waiting for confirmation (admin profile → change email)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_type TEXT NOT NULL DEFAULT 'email'
  CHECK (auth_type IN ('email', 'key'));
-- Customer code (like JX-K7Q-4MP): how customers are identified to support and in transfer
-- comments. Random, so it doesn't reveal how many customers there are.
ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_customer_code_key ON users(customer_code);
UPDATE users
   SET customer_code = 'JX-' || upper(substr(md5(random()::text || id::text), 1, 3)) || '-'
                             || upper(substr(md5(random()::text || id::text), 1, 3))
 WHERE customer_code IS NULL AND NOT is_admin;
-- Soft delete: a deleted account can't sign in and its devices are disconnected, but the
-- record is kept so an admin can look it up or restore it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Signed-in sessions. Signing out deletes the row, so a copied cookie can't be reused.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

-- One-time codes sent by email (stored only as a hash)
CREATE TABLE IF NOT EXISTS otp_codes (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL,         -- verify | login | reset
  code_hash  TEXT NOT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_codes_user_idx ON otp_codes(user_id, purpose);

-- Customer names
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';

-- Bank transfers: the customer uploads a receipt, an admin approves or rejects it.
-- provider = 'transfer', status = pending | successful | rejected
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_name TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_on DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_file TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_mime TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS review_note TEXT;
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);
-- Receipts are deleted RECEIPT_RETENTION_DAYS after review (privacy); the payment record stays.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_deleted_at TIMESTAMPTZ;

-- Simple key/value settings editable from the admin panel (e.g. bank details)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS devices_user_idx ON devices(user_id);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments(user_id);

-- Plans customers can buy. Admins edit prices and add plans in Settings.
-- A plan that has been paid for is hidden (active = false) rather than deleted.
CREATE TABLE IF NOT EXISTS plans (
  id         TEXT PRIMARY KEY,
  name_en    TEXT NOT NULL,
  name_ru    TEXT NOT NULL,
  days       INT NOT NULL CHECK (days BETWEEN 1 AND 3650),
  price      INT NOT NULL CHECK (price > 0),
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  featured   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO plans (id, name_en, name_ru, days, price, featured) VALUES
  ('weekly', 'Weekly', 'Неделя', 7, 99, FALSE),
  ('monthly', 'Monthly', 'Месяц', 30, 299, FALSE),
  ('yearly', 'Yearly', 'Год', 365, 2490, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Encrypted receipt files, for hosts without a lasting disk (RECEIPT_STORAGE=database, e.g. Vercel).
CREATE TABLE IF NOT EXISTS receipt_files (
  name       TEXT PRIMARY KEY,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
