-- Solar City leads pipeline schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  goal          TEXT,
  monthly_bill  TEXT,
  package       TEXT,
  financing     INTEGER DEFAULT 0,        -- 0/1
  stage         TEXT NOT NULL DEFAULT 'lead',  -- lead|contacted|demoed|proposal|sold|lost
  notes         TEXT,
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

-- Founder team notes (images live in R2, keys stored as a JSON array)
CREATE TABLE IF NOT EXISTS notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  author      TEXT,
  title       TEXT,
  body        TEXT NOT NULL DEFAULT '',
  images      TEXT NOT NULL DEFAULT '[]',   -- JSON array of R2 object keys ("notes/…")
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
