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
