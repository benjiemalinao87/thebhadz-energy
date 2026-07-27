-- Solar City leads pipeline schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  goal          TEXT,
  address       TEXT,                     -- site address; the survey cannot be booked without it
  monthly_bill  TEXT,
  package       TEXT,
  financing     INTEGER DEFAULT 0,        -- 0/1
  -- Research fields (Founder OS §2: the lead form is a research instrument).
  -- What they already do about the problem tells us whether the pain is real;
  -- prior spend on a genset/UPS/quote is the signal, a complaint is not.
  current_solution  TEXT,
  interview_opt_in  INTEGER DEFAULT 0,    -- 0/1: will talk to us even if they never buy
  stage         TEXT NOT NULL DEFAULT 'lead',  -- lead|contacted|demoed|quote_sent|proposal|sold|lost
  notes         TEXT,
  -- The ONE next step that advances this lead, plus when it is due and who owns it.
  -- Structured rather than buried in notes so overdue work can surface on its own
  -- (SC-17 next-action board) instead of relying on somebody re-reading every card.
  next_action        TEXT,
  next_action_due    TEXT,                     -- YYYY-MM-DD
  next_action_owner  TEXT,
  source        TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  referrer      TEXT,
  ip            TEXT,
  country       TEXT,
  created_at    TEXT NOT NULL,            -- ISO timestamp
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_next_due ON leads(next_action_due);

-- Founder team notes (images live in R2, keys stored as a JSON array)
CREATE TABLE IF NOT EXISTS notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  author      TEXT,
  title       TEXT,
  body        TEXT NOT NULL DEFAULT '',
  images      TEXT NOT NULL DEFAULT '[]',   -- legacy name: JSON array of R2 attachment keys/metadata
  created_at  TEXT NOT NULL,                -- ISO timestamp
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);

-- Internal project board tasks
CREATE TABLE IF NOT EXISTS project_tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  owner       TEXT,
  type        TEXT NOT NULL DEFAULT 'Traction'
              CHECK (type IN ('Traction', 'Product', 'Ops')),
  due         TEXT,
  status      TEXT NOT NULL DEFAULT 'Backlog'
              CHECK (status IN ('Backlog', 'This week', 'Doing', 'Blocked', 'Done')),
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_due ON project_tasks(due);

-- Shared team checklists (e.g. the SC-13 SEC registration checklist).
-- One row per checklist; state_json maps checkbox id → true.
CREATE TABLE IF NOT EXISTS checklists (
  key         TEXT PRIMARY KEY,
  state_json  TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL
);

-- Shared founder pricing, positioning and evidence workspace
CREATE TABLE IF NOT EXISTS founder_strategy (
  id          TEXT PRIMARY KEY,
  state_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- SC-09 Finance & Runway: cash ledger and founder-owned planning inputs.
-- Money is stored as integer centavos to avoid floating-point rounding.
CREATE TABLE IF NOT EXISTS finance_settings (
  id                         TEXT PRIMARY KEY,
  cash_required_per_install  INTEGER NOT NULL DEFAULT 0,
  updated_at                 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id                 TEXT PRIMARY KEY,
  txn_date           TEXT NOT NULL,
  direction          TEXT NOT NULL CHECK (direction IN ('inflow', 'outflow')),
  status             TEXT NOT NULL CHECK (status IN ('paid', 'committed')),
  kind               TEXT NOT NULL CHECK (kind IN (
                       'opening_balance', 'founder_contribution', 'customer_payment',
                       'expense', 'installer_payment', 'refund', 'other')),
  category           TEXT NOT NULL,
  account            TEXT,
  amount_cents       INTEGER NOT NULL CHECK (amount_cents > 0),
  counterparty       TEXT,
  founder            TEXT,
  contribution_type  TEXT NOT NULL DEFAULT '' CHECK (contribution_type IN (
                       '', 'capital', 'founder_loan', 'reimbursable')),
  project_id         TEXT,
  reference          TEXT,
  receipt_key        TEXT,
  notes              TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_txn_date ON finance_transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_finance_status ON finance_transactions(status);
CREATE INDEX IF NOT EXISTS idx_finance_project ON finance_transactions(project_id);

-- SC-10 Install Operations: one operational record from survey through warranty.
CREATE TABLE IF NOT EXISTS install_projects (
  id                         TEXT PRIMARY KEY,
  lead_id                    INTEGER,
  customer_name              TEXT NOT NULL,
  phone                      TEXT,
  site_address               TEXT,
  package                    TEXT NOT NULL,
  contract_price_cents       INTEGER NOT NULL DEFAULT 0,
  target_cost_cents          INTEGER NOT NULL DEFAULT 0,
  stage                      TEXT NOT NULL CHECK (stage IN (
                               'survey', 'quoted', 'approved', 'deposit_paid',
                               'design', 'permits', 'procurement', 'scheduled',
                               'installing', 'testing', 'energized', 'handover',
                               'warranty', 'cancelled')),
  owner                      TEXT,
  survey_date                TEXT,
  install_date               TEXT,
  permit_checklist           INTEGER NOT NULL DEFAULT 0 CHECK (permit_checklist IN (0, 1)),
  licensed_electrician_check INTEGER NOT NULL DEFAULT 0 CHECK (licensed_electrician_check IN (0, 1)),
  net_metering_check         INTEGER NOT NULL DEFAULT 0 CHECK (net_metering_check IN (0, 1)),
  safety_briefing_check      INTEGER NOT NULL DEFAULT 0 CHECK (safety_briefing_check IN (0, 1)),
  testing_check              INTEGER NOT NULL DEFAULT 0 CHECK (testing_check IN (0, 1)),
  handover_check             INTEGER NOT NULL DEFAULT 0 CHECK (handover_check IN (0, 1)),
  notes                      TEXT,
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE INDEX IF NOT EXISTS idx_install_projects_stage ON install_projects(stage);
CREATE INDEX IF NOT EXISTS idx_install_projects_install_date ON install_projects(install_date);

CREATE TABLE IF NOT EXISTS install_costs (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL,
  category               TEXT NOT NULL,
  description            TEXT NOT NULL,
  vendor                 TEXT,
  budget_cents           INTEGER NOT NULL DEFAULT 0,
  committed_cents        INTEGER NOT NULL DEFAULT 0,
  actual_cents           INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL CHECK (status IN ('planned', 'committed', 'paid')),
  finance_transaction_id TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES install_projects(id)
);

CREATE INDEX IF NOT EXISTS idx_install_costs_project ON install_costs(project_id);

CREATE TABLE IF NOT EXISTS install_payments (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL,
  payment_date           TEXT NOT NULL,
  kind                   TEXT NOT NULL CHECK (kind IN ('deposit', 'progress', 'final', 'refund')),
  amount_cents           INTEGER NOT NULL CHECK (amount_cents > 0),
  status                 TEXT NOT NULL CHECK (status IN ('expected', 'received')),
  reference              TEXT,
  finance_transaction_id TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES install_projects(id)
);

CREATE INDEX IF NOT EXISTS idx_install_payments_project ON install_payments(project_id);

CREATE TABLE IF NOT EXISTS installers (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL,
  phone          TEXT,
  rate_type      TEXT NOT NULL CHECK (rate_type IN ('hourly', 'daily', 'project')),
  rate_cents     INTEGER NOT NULL DEFAULT 0,
  license_number TEXT,
  license_expiry TEXT,
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_installers_active ON installers(active);

CREATE TABLE IF NOT EXISTS install_assignments (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL,
  installer_id           TEXT NOT NULL,
  work_date              TEXT NOT NULL,
  hours                  REAL NOT NULL DEFAULT 0,
  days                   REAL NOT NULL DEFAULT 0,
  agreed_cents           INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'approved', 'paid')),
  safety_checked         INTEGER NOT NULL DEFAULT 0 CHECK (safety_checked IN (0, 1)),
  qc_status              TEXT NOT NULL DEFAULT 'pending' CHECK (qc_status IN ('pending', 'passed', 'rework')),
  finance_transaction_id TEXT,
  notes                  TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES install_projects(id),
  FOREIGN KEY (installer_id) REFERENCES installers(id)
);

CREATE INDEX IF NOT EXISTS idx_install_assignments_project ON install_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_install_assignments_installer ON install_assignments(installer_id);
CREATE INDEX IF NOT EXISTS idx_install_assignments_date ON install_assignments(work_date);

-- Meeting recordings (Zoom call recordings on /internal/meetings.html).
-- Metadata only — the media file itself lives in the NOTES_R2 bucket under recordings/.
CREATE TABLE IF NOT EXISTS meeting_recordings (
  id            TEXT PRIMARY KEY,
  meeting_id    TEXT NOT NULL,              -- matches the article id on meetings.html, e.g. m-2026-07-13
  title         TEXT NOT NULL,
  original_name TEXT,
  content_type  TEXT,
  size          INTEGER NOT NULL DEFAULT 0, -- bytes
  r2_key        TEXT NOT NULL,
  upload_id     TEXT,                       -- R2 multipart upload id while status = 'pending'
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_meeting ON meeting_recordings(meeting_id);

-- Company mailbox (/internal/mail.html) for hello@ and main@maccsyseng.com, plus
-- each founder's personal mailbox (users.mailbox, e.g. benjie@macc-inc.com).
-- Inbound rows are written by the hello-fanout Email Worker (workers/hello-fanout),
-- which ALSO still forwards every message to Gmail — the whole team's inboxes for
-- shared addresses, only the owner's for a personal address. Gmail stays the system
-- of record for attachments, so nothing here is load-bearing for filings.
-- Outbound rows are written by /api/mail when a founder sends or replies.
-- The `mailbox` column decides who may see a row: an address claimed in
-- users.mailbox is private to that account; every other address is the shared
-- company mailbox, visible to all founders.
CREATE TABLE IF NOT EXISTS emails (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  direction     TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  mailbox       TEXT NOT NULL,              -- which of our addresses: hello@… / main@…
  sender        TEXT NOT NULL,              -- envelope from (inbound) or our address (outbound)
  recipient     TEXT NOT NULL,              -- our address (inbound) or the destination (outbound)
  subject       TEXT NOT NULL DEFAULT '',
  body_text     TEXT NOT NULL DEFAULT '',
  body_html     TEXT NOT NULL DEFAULT '',
  -- JSON array of {name,type,size} — metadata only. The files themselves are NOT
  -- stored; they live in the Gmail copy. Shown in the UI so you know to check Gmail.
  attachments   TEXT NOT NULL DEFAULT '[]',
  message_id    TEXT,                       -- RFC 2822 Message-ID, for threading
  in_reply_to   TEXT,
  sent_by       TEXT,                       -- founder who clicked send (outbound only)
  error         TEXT,                       -- delivery error, if the send failed
  read_at       TEXT,                       -- NULL until opened in the UI
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emails_created ON emails(created_at);
CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails(direction);
CREATE INDEX IF NOT EXISTS idx_emails_mailbox ON emails(mailbox);

-- ─────────────────────────────────────────────────────────────────────────────
-- Founder accounts, sessions and audit trail (/internal auth).
-- One login per founder, plus the shared team password (which signs in as the
-- shared-login account). Founders are equals: role 'master' is the default and may
-- administer accounts and read the whole activity log; role 'founder' is the limited
-- login used for installers, interns and bookkeepers.
--
-- These three tables are also created on demand by functions/_auth.js
-- (ensureAuthSchema) so a deploy can never lock the team out because someone
-- forgot to apply this file. Kept here so the schema stays readable in one place.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,        -- stored lowercase; the login identity
  name           TEXT NOT NULL,
  -- 'master' = a founder (full access, manages accounts); 'founder' = limited login.
  role           TEXT NOT NULL DEFAULT 'master' CHECK (role IN ('master', 'founder')),
  -- pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url> — never a plain password
  password_hash  TEXT NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  must_change    INTEGER NOT NULL DEFAULT 0 CHECK (must_change IN (0, 1)),
  failed_count   INTEGER NOT NULL DEFAULT 0,  -- consecutive bad passwords
  locked_until   TEXT,                        -- ISO timestamp while rate-limited
  last_login_at  TEXT,
  -- JSON array of section keys this account may NOT see (functions/_pages.js).
  -- Empty = full access, which is what every founder gets; used for installers,
  -- interns and bookkeepers. Enforced by both middlewares, not just the sidebar.
  hidden_pages   TEXT NOT NULL DEFAULT '[]',
  -- This founder's personal company address (e.g. benjie@macc-inc.com), or NULL for
  -- none. Rows in `emails` whose mailbox matches it form that founder's PRIVATE
  -- mailbox in /internal/mail.html — visible and sendable-from only by this account.
  -- Must be on macc-inc.com (the sending-enabled zone) and unique across accounts.
  mailbox        TEXT,
  created_by     TEXT,                        -- email of the master who created the row
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Server-side sessions: the cookie carries only a signed session id, so deleting
-- or disabling an account kills its open sessions on the next request.
CREATE TABLE IF NOT EXISTS user_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  ip            TEXT,
  user_agent    TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- Who did what, across every founder tool. Written by functions/api/_middleware.js
-- for each mutating API call, and by the auth endpoints for logins and account admin.
CREATE TABLE IF NOT EXISTS activity_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT,                          -- NULL for failed logins with no account
  actor_email  TEXT NOT NULL DEFAULT '',
  actor_name   TEXT NOT NULL DEFAULT '',
  action       TEXT NOT NULL,                 -- login | logout | notes.create | users.delete …
  entity       TEXT NOT NULL DEFAULT '',      -- resource touched: notes, leads, users …
  entity_id    TEXT NOT NULL DEFAULT '',
  method       TEXT NOT NULL DEFAULT '',
  path         TEXT NOT NULL DEFAULT '',
  status       INTEGER,                       -- HTTP status of the attempt
  detail       TEXT NOT NULL DEFAULT '',      -- short human summary
  ip           TEXT,
  user_agent   TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);

-- Quotations actually sent to a customer. One row per send, written by /api/quote
-- only after the email left — so this table is the evidence behind a lead sitting in
-- the quote_sent stage, not a record of quotes that were merely rendered on screen.
CREATE TABLE IF NOT EXISTS quotes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_no       TEXT NOT NULL,
  lead_id        INTEGER,
  customer_name  TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  package        TEXT,
  kwp            REAL,
  contract_price REAL,
  indicative     INTEGER DEFAULT 0,          -- 0/1: priced on unconfirmed supplier numbers
  sent_by        TEXT,
  sent_at        TEXT NOT NULL               -- ISO timestamp
);

CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes(lead_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SC-16 price list. The quote builder ships with a built-in catalogue (the
-- Tacloban supplier sheet for balance-of-system, plus equipment estimates); this
-- table holds the founders' edits on top of it, so a price correction is a form
-- submission rather than a JavaScript edit and a redeploy.
--
-- `confirmed` is the important column: it is what decides whether a quote prints
-- stamped INDICATIVE (Founder OS §7). It cannot be set without `source_note` —
-- who quoted the number and when — because a flag that turns an estimate into a
-- firm price with one click, and records nothing, is worse than no flag at all.
--
-- Quantities for built-in balance-of-system lines stay derived from the array
-- geometry in code; only `qty_fixed` custom lines carry their own quantity.
CREATE TABLE IF NOT EXISTS price_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,              -- inverter | panel | battery | bos
  item_key      TEXT NOT NULL UNIQUE,       -- built-in id / label, or custom-<n>
  label         TEXT NOT NULL,
  price         REAL NOT NULL,
  qty_fixed     REAL,                       -- custom lines only; NULL = geometry-derived
  group_name    TEXT,                       -- BOS grouping shown on the sheet
  confirmed     INTEGER NOT NULL DEFAULT 0, -- 0/1 — drives the INDICATIVE stamp
  source_note   TEXT,                       -- required to set confirmed
  confirmed_at  TEXT,
  confirmed_by  TEXT,
  custom        INTEGER NOT NULL DEFAULT 0, -- 0 = overrides a built-in, 1 = founder-added
  active        INTEGER NOT NULL DEFAULT 1, -- 0 hides a line from new quotes
  updated_at    TEXT NOT NULL,
  updated_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_price_items_kind ON price_items(kind);
