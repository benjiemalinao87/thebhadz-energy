/**
 * /api/jobs — SC-07 Jobs workspace: one installation per record, from survey to warranty.
 *
 *   GET                              -> { ok, jobs: [...], installers: [...], leads: [...] }
 *   GET  ?id=<job>                   -> { ok, job, tasks, costs, payments, assignments, events, activity }
 *   POST   { lead_id?|customer_name, package, ... }        -> create a job + seed its checklist
 *   POST   { resource:"task", job_id, title, ... }         -> add one task to a job
 *   PATCH  { id, stage }             -> move stage (REFUSED with 409 when gates are open)
 *   PATCH  { id, <field> }           -> edit job fields / compliance gates
 *   PATCH  { resource:"task", id, done|title|due|role }     -> edit a task
 *   DELETE { resource:"task", id }   -> remove a task
 *
 * The job IS the install_projects row that SC-10 already owns. This endpoint adds the
 * things a board needs and SC-10 never had — a job code, a stage clock, per-job tasks,
 * stage history and enforced gates — and *reads* costs/payments/crew for display without
 * duplicating them. Money and crew are still written through /api/install-ops, which
 * already syncs them to the SC-09 finance ledger; there is no second copy to drift.
 *
 * Auth and the audit trail come from functions/api/_middleware.js: it authenticates every
 * /api/* call and writes an activity_log row for each mutating one, with the signed-in
 * founder attached. Nothing here re-implements either.
 */
import { currentUser } from "../_auth.js";
import { phToday } from "../_ph-date.js";

const STAGES = [
  "survey", "quoted", "approved", "deposit_paid", "design", "permits", "procurement",
  "scheduled", "installing", "testing", "energized", "handover", "warranty", "cancelled",
];

/**
 * The six board columns. Fourteen stages is the right resolution for a record and the
 * wrong one for a board, so the board groups them and the card still shows the exact
 * stage. `gated` marks the columns a job may not enter with an open compliance gate.
 */
export const PHASES = [
  { key: "intake", label: "Survey & quote", stages: ["survey", "quoted"] },
  { key: "won", label: "Won", stages: ["approved", "deposit_paid"] },
  { key: "prep", label: "Design & permits", stages: ["design", "permits", "procurement"] },
  { key: "scheduled", label: "Scheduled", stages: ["scheduled"] },
  { key: "site", label: "On site", stages: ["installing", "testing"], gated: true },
  { key: "live", label: "Energized", stages: ["energized", "handover", "warranty"], gated: true },
];

/**
 * The three gates that cannot be skipped (Founder OS §7: no install without permit,
 * licensed-electrician sign-off and net metering). `na` names the one gate a package
 * can legitimately not need.
 */
const GATES = [
  { key: "permit_checklist", label: "LGU / barangay permit filed" },
  { key: "licensed_electrician_check", label: "Licensed electrician sign-off" },
  { key: "net_metering_check", label: "Net-metering application", na: "net_metering_na" },
];

const ROLES = ["Tech", "Sales", "Admin", "PEE", "Ops", "Procurement"];
const PHASE_KEYS = PHASES.map((p) => p.key);
const GATE_KEYS = GATES.map((g) => g.key);
// Every gate open — the state a job is created in, before any row exists to read.
const GATE_DEFAULTS = Object.fromEntries(GATES.map((g) => [g.key, 0]));

/**
 * The standard install checklist a new job is seeded with — the reason a job is never a
 * blank board. `off` is days relative to install_date (negative = before), so re-dating
 * the install re-dates the whole plan. `gate` rows drive the compliance flags above.
 * `offGridSkip` drops the net-metering task for packages with no interconnection.
 */
const TEMPLATE = [
  { phase: "intake", title: "Book site survey with homeowner", role: "Sales", off: -40 },
  { phase: "intake", title: "Measure roof, azimuth and shading", role: "Tech", off: -39 },
  { phase: "intake", title: "Photograph service entrance and meter", role: "Tech", off: -39 },
  { phase: "intake", title: "Collect 3 months of utility bills", role: "Sales", off: -38 },
  { phase: "intake", title: "Build quote in SC-16 and deliver savings sheet", role: "Sales", off: -35 },
  { phase: "intake", title: "Log the commitment ask outcome on the contact", role: "Sales", off: -33 },
  { phase: "won", title: "Signed contract filed on the job", role: "Admin", off: -30 },
  { phase: "won", title: "Collect deposit and issue official receipt", role: "Admin", off: -30 },
  { phase: "won", title: "Confirm package scope and inclusions in writing", role: "Sales", off: -29 },
  { phase: "prep", title: "Single-line diagram + layout drawing", role: "Tech", off: -24 },
  { phase: "prep", title: "Licensed electrician (PEE) design sign-off", role: "PEE", off: -22, gate: "licensed_electrician_check" },
  { phase: "prep", title: "File LGU / barangay electrical permit", role: "Admin", off: -20, gate: "permit_checklist" },
  { phase: "prep", title: "Lodge net-metering application with utility", role: "Admin", off: -18, gate: "net_metering_check", offGridSkip: true },
  { phase: "prep", title: "Order panels and inverter", role: "Procurement", off: -16 },
  { phase: "prep", title: "Confirm racking, BOS and cable delivery date", role: "Procurement", off: -12 },
  { phase: "prep", title: "Stage materials and count against BOM", role: "Procurement", off: -4 },
  { phase: "scheduled", title: "Confirm install date with homeowner", role: "Sales", off: -3 },
  { phase: "scheduled", title: "Assign crew and send call time", role: "Ops", off: -3 },
  { phase: "scheduled", title: "Tools, PPE and fall-protection check", role: "Ops", off: -1 },
  { phase: "scheduled", title: "Yard sign and photo consent signed", role: "Sales", off: -1 },
  { phase: "site", title: "Toolbox safety briefing, all crew signed", role: "Ops", off: 0 },
  { phase: "site", title: "Mount racking and flashing, torque to spec", role: "Tech", off: 0 },
  { phase: "site", title: "Lay panels, string and DC run", role: "Tech", off: 0 },
  { phase: "site", title: "Inverter, AC combiner and bonding", role: "PEE", off: 1 },
  { phase: "site", title: "Insulation, continuity and polarity test", role: "PEE", off: 1 },
  { phase: "site", title: "Commissioning, monitoring app paired", role: "Tech", off: 1 },
  { phase: "live", title: "Handover walkthrough and app training", role: "Sales", off: 2 },
  { phase: "live", title: "Utility meter swap witnessed", role: "Admin", off: 14 },
  { phase: "live", title: "First-bill check-in with homeowner", role: "Sales", off: 40 },
  { phase: "live", title: "Referral and testimonial ask (with permission)", role: "Sales", off: 42 },
];

// Packages with no grid interconnection. Kept as a prefix test so "ILAW off-grid",
// "ILAW+" and similar names all resolve without another list to maintain.
function isOffGrid(pkg) {
  return /^ilaw/i.test(String(pkg || "").trim());
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function text(value, max = 160) { return String(value == null ? "" : value).trim().slice(0, max); }
function date(value) { const v = text(value, 10); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; }
function cents(value) { const n = Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : 0; }
function flag(value) { return value === true || value === 1 || value === "1" ? 1 : 0; }
function shiftDate(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function phaseOf(stage) {
  return PHASES.find((p) => p.stages.includes(stage)) || null;
}

/**
 * Which gates are still outstanding. A gate satisfied by its `na` companion counts as
 * cleared — the off-grid case — and everything else must be an explicit sign-off.
 */
function missingGates(job) {
  return GATES.filter((g) => {
    if (g.na && Number(job[g.na]) === 1) return false;
    return Number(job[g.key]) !== 1;
  });
}

// Created on demand for the same reason as the auth and documents tables: a deploy that
// beats the schema.sql apply must degrade gracefully, never 500. Memoized per isolate —
// the schema cannot change under a running isolate — and a failure is not cached, so a
// transient error simply retries on the next request.
let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = migrate(env).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function migrate(env) {
  // ALTER TABLE has no IF NOT EXISTS in SQLite, so a duplicate-column error is the
  // success case on every run after the first.
  const additions = [
    `ALTER TABLE install_projects ADD COLUMN job_code TEXT`,
    `ALTER TABLE install_projects ADD COLUMN stage_entered_at TEXT`,
    `ALTER TABLE install_projects ADD COLUMN net_metering_na INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE project_tasks ADD COLUMN job_id TEXT`,
    `ALTER TABLE project_tasks ADD COLUMN role TEXT`,
    `ALTER TABLE project_tasks ADD COLUMN phase TEXT`,
    `ALTER TABLE project_tasks ADD COLUMN is_gate INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE project_tasks ADD COLUMN gate_key TEXT`,
    `ALTER TABLE project_tasks ADD COLUMN sort_order REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE project_tasks ADD COLUMN completed_at TEXT`,
  ];
  for (const sql of additions) {
    try { await env.DB.prepare(sql).run(); } catch { /* column already present */ }
  }
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS job_stage_events (
       id          TEXT PRIMARY KEY,
       job_id      TEXT NOT NULL,
       from_stage  TEXT,
       to_stage    TEXT NOT NULL,
       refused     INTEGER NOT NULL DEFAULT 0,
       reason      TEXT,
       actor       TEXT,
       created_at  TEXT NOT NULL
     )`
  ).run();
  // These three name columns this function just added, which is exactly why they live here
  // and not in schema.sql: that file is re-applied to existing databases, where the
  // CREATE TABLEs are no-ops and an index on a new column would abort the whole apply.
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_job_stage_events_job ON job_stage_events(job_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_project_tasks_job ON project_tasks(job_id, sort_order)`,
    // UNIQUE, because a job code ends up on a customer receipt. nextJobCode reads the
    // highest code and inserts in a separate statement, so two founders creating jobs in
    // the same second can compute the same number; the database has to be the arbiter.
    // Kept alongside the old non-unique index rather than replacing it: dropping an index
    // a running deploy is planning on is the riskier move, and SQLite is happy with both.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_install_projects_code_unique ON install_projects(job_code) WHERE job_code IS NOT NULL AND job_code != ''`,
    `CREATE INDEX IF NOT EXISTS idx_install_projects_code ON install_projects(job_code)`,
  ];
  for (const sql of indexes) {
    try { await env.DB.prepare(sql).run(); } catch { /* index already present */ }
  }

  // Jobs that predate job codes get one, oldest first, so the numbering matches the
  // order the team actually took the work on.
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, updated_at FROM install_projects
     WHERE job_code IS NULL OR job_code = '' ORDER BY datetime(created_at) ASC`
  ).all();
  for (const row of results || []) {
    const code = await nextJobCode(env, String(row.created_at || "").slice(0, 4));
    await env.DB.prepare(
      `UPDATE install_projects
       SET job_code = ?, stage_entered_at = COALESCE(NULLIF(stage_entered_at, ''), ?)
       WHERE id = ?`
    ).bind(code, row.updated_at || row.created_at, row.id).run();
  }
}

/**
 * Next JOB-<year>-<nnn>, allocated as one above the highest suffix currently held for that
 * year. Reading the max rather than counting rows keeps numbering stable when a job in the
 * middle is removed.
 *
 * Deleting the NEWEST job does free its number for the next one. That is acceptable here
 * only because deleteJob refuses any job with a received payment: a deletable job never
 * reached a customer receipt, so the freed code cannot collide with money already banked.
 * If jobs ever become deletable after payment, this needs a monotonic counter instead.
 */
async function nextJobCode(env, year) {
  const yr = /^\d{4}$/.test(String(year || "")) ? String(year) : String(new Date().getUTCFullYear());
  const row = await env.DB.prepare(
    `SELECT job_code FROM install_projects
     WHERE job_code LIKE ? ORDER BY job_code DESC LIMIT 1`
  ).bind(`JOB-${yr}-%`).first();
  const last = row && row.job_code ? parseInt(String(row.job_code).split("-")[2], 10) : 0;
  const next = (Number.isFinite(last) ? last : 0) + 1;
  return `JOB-${yr}-${String(next).padStart(3, "0")}`;
}

async function logStageEvent(env, jobId, from, to, refused, reason, actor) {
  await env.DB.prepare(
    `INSERT INTO job_stage_events (id, job_id, from_stage, to_stage, refused, reason, actor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), jobId, from || null, to, refused ? 1 : 0, reason || null, actor || null, new Date().toISOString()).run();
}

function actorName(user) {
  if (!user) return "";
  return text(user.name || user.email || "", 80);
}

/* ------------------------------------------------------------------ reads ------- */

/**
 * List rows carry everything the board, list, schedule and crew views draw, so switching
 * views never costs another round trip. Cost and payment totals are aggregated here
 * (forecast = actual → committed → budget, the same precedence SC-10 uses) rather than
 * shipping every line item for seven jobs.
 */
async function listJobs(env) {
  const [jobs, taskAgg, costAgg, payAgg, crew, installers, leads] = await env.DB.batch([
    env.DB.prepare(
      `SELECT * FROM install_projects
       ORDER BY CASE stage
         WHEN 'installing' THEN 1 WHEN 'testing' THEN 2 WHEN 'scheduled' THEN 3
         WHEN 'procurement' THEN 4 WHEN 'permits' THEN 5 WHEN 'design' THEN 6
         WHEN 'deposit_paid' THEN 7 WHEN 'approved' THEN 8 WHEN 'quoted' THEN 9
         WHEN 'survey' THEN 10 WHEN 'energized' THEN 11 WHEN 'handover' THEN 12
         WHEN 'warranty' THEN 13 ELSE 14 END,
         CASE WHEN install_date IS NULL OR install_date = '' THEN 1 ELSE 0 END,
         install_date ASC, datetime(updated_at) DESC`
    ),
    // Overdue is measured against the Manila date, not SQLite's date('now') (UTC): before
    // 08:00 PHT those differ by a day, which is exactly when the crew checks the board.
    env.DB.prepare(
      `SELECT job_id,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN status != 'Done' AND due != '' AND due IS NOT NULL
                        AND due < ? THEN 1 ELSE 0 END) AS overdue
       FROM project_tasks WHERE job_id IS NOT NULL GROUP BY job_id`
    ).bind(phToday()),
    env.DB.prepare(
      `SELECT project_id,
              SUM(CASE WHEN actual_cents > 0 THEN actual_cents
                       WHEN committed_cents > 0 THEN committed_cents
                       ELSE budget_cents END) AS forecast,
              SUM(actual_cents) AS actual
       FROM install_costs GROUP BY project_id`
    ),
    env.DB.prepare(
      `SELECT project_id,
              SUM(CASE WHEN status = 'received' AND kind != 'refund' THEN amount_cents ELSE 0 END) AS received,
              SUM(CASE WHEN status = 'received' AND kind = 'deposit' THEN amount_cents ELSE 0 END) AS deposit
       FROM install_payments GROUP BY project_id`
    ),
    env.DB.prepare(
      `SELECT DISTINCT a.project_id, i.id AS installer_id, i.name, i.role
       FROM install_assignments a JOIN installers i ON i.id = a.installer_id`
    ),
    env.DB.prepare(`SELECT * FROM installers ORDER BY active DESC, name ASC`),
    // Every contact, not just the late-funnel ones. This used to filter to
    // quote_sent/demoed/proposal/sold, which made "New job from contact" look like there
    // were no contacts at all on a young pipeline where everyone is still 'lead' — and a
    // deposit can land before anyone remembers to move the stage. The ordering does the
    // work instead: closest-to-sold first, lost last, and has_job flags the ones already
    // converted so the picker can warn instead of quietly creating a duplicate job.
    env.DB.prepare(
      `SELECT l.id, l.name, l.phone, l.address, l.package, l.stage,
              EXISTS (SELECT 1 FROM install_projects p WHERE p.lead_id = l.id) AS has_job
       FROM leads l
       ORDER BY CASE l.stage
                  WHEN 'sold' THEN 1 WHEN 'proposal' THEN 2 WHEN 'quote_sent' THEN 3
                  WHEN 'demoed' THEN 4 WHEN 'contacted' THEN 5 WHEN 'lead' THEN 6
                  ELSE 7 END,
                datetime(l.updated_at) DESC
       LIMIT 500`
    ),
  ]);

  const byId = (rows, key) => {
    const map = new Map();
    for (const row of rows || []) map.set(row[key], row);
    return map;
  };
  const tasks = byId(taskAgg.results, "job_id");
  const costs = byId(costAgg.results, "project_id");
  const pays = byId(payAgg.results, "project_id");

  const crewByJob = new Map();
  for (const row of crew.results || []) {
    if (!crewByJob.has(row.project_id)) crewByJob.set(row.project_id, []);
    crewByJob.get(row.project_id).push({ id: row.installer_id, name: row.name, role: row.role });
  }

  const decorated = (jobs.results || []).map((job) => {
    const t = tasks.get(job.id) || { total: 0, done: 0, overdue: 0 };
    const c = costs.get(job.id) || { forecast: 0, actual: 0 };
    const p = pays.get(job.id) || { received: 0, deposit: 0 };
    return {
      ...job,
      task_total: Number(t.total) || 0,
      task_done: Number(t.done) || 0,
      task_overdue: Number(t.overdue) || 0,
      cost_forecast_cents: Number(c.forecast) || 0,
      cost_actual_cents: Number(c.actual) || 0,
      paid_cents: Number(p.received) || 0,
      deposit_cents: Number(p.deposit) || 0,
      crew: crewByJob.get(job.id) || [],
      missing_gates: missingGates(job).map((g) => g.key),
      phase: (phaseOf(job.stage) || {}).key || null,
    };
  });

  return json({
    ok: true,
    jobs: decorated,
    installers: installers.results || [],
    leads: leads.results || [],
    phases: PHASES,
    template_size: TEMPLATE.length,
  });
}

/** Everything one job's drawer shows, in one call. */
async function jobDetail(env, id) {
  const job = await env.DB.prepare(`SELECT * FROM install_projects WHERE id = ?`).bind(id).first();
  if (!job) return json({ ok: false, error: "Job not found." }, 404);

  const [tasks, costs, payments, assignments, events, activity] = await env.DB.batch([
    env.DB.prepare(
      `SELECT * FROM project_tasks WHERE job_id = ? ORDER BY sort_order ASC, datetime(created_at) ASC`
    ).bind(id),
    env.DB.prepare(`SELECT * FROM install_costs WHERE project_id = ? ORDER BY datetime(created_at) ASC`).bind(id),
    env.DB.prepare(`SELECT * FROM install_payments WHERE project_id = ? ORDER BY payment_date ASC`).bind(id),
    env.DB.prepare(
      `SELECT a.*, i.name AS installer_name, i.role AS installer_role, i.license_number, i.license_expiry
       FROM install_assignments a JOIN installers i ON i.id = a.installer_id
       WHERE a.project_id = ? ORDER BY a.work_date ASC`
    ).bind(id),
    env.DB.prepare(`SELECT * FROM job_stage_events WHERE job_id = ? ORDER BY datetime(created_at) DESC`).bind(id),
    // The middleware already records every mutating call, stamping entity_id from the
    // request body's id — so job-level writes are attributable with no new plumbing.
    // Task writes carry the task's own id, hence the detail fallback; task state itself
    // is visible on the Tasks tab, so nothing here has to invent coverage it lacks.
    env.DB.prepare(
      `SELECT action, detail, actor_name AS user_name, created_at FROM activity_log
       WHERE entity = 'jobs' AND (entity_id = ? OR detail LIKE ?)
       ORDER BY datetime(created_at) DESC LIMIT 40`
    ).bind(id, `%${id}%`),
  ]);

  return json({
    ok: true,
    job: {
      ...job,
      missing_gates: missingGates(job).map((g) => g.key),
      phase: (phaseOf(job.stage) || {}).key || null,
    },
    tasks: tasks.results || [],
    costs: costs.results || [],
    payments: payments.results || [],
    assignments: assignments.results || [],
    events: events.results || [],
    activity: activity.results || [],
  });
}

/* ----------------------------------------------------------------- writes ------- */

/**
 * Create a job and seed its checklist. Given a lead_id the customer, phone, address and
 * package come from the contact, so the same install is never typed twice.
 */
async function createJob(env, body, user) {
  let lead = null;
  const leadId = Number(body.lead_id);
  if (Number.isInteger(leadId) && leadId > 0) {
    lead = await env.DB.prepare(`SELECT * FROM leads WHERE id = ?`).bind(leadId).first();
  }

  const customer = text(body.customer_name, 120) || text(lead && lead.name, 120);
  if (!customer) return json({ ok: false, error: "A customer name is required." }, 422);

  const pkg = text(body.package, 60) || text(lead && lead.package, 60) || "Custom";
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const installDate = date(body.install_date);
  const surveyDate = date(body.survey_date);
  const stage = STAGES.includes(body.stage) ? body.stage : "survey";

  // A brand-new job has no gate signed off, so being *born* into On site or Energized
  // would walk straight past the check moveStage exists to enforce. The refusal has to
  // live on create too, or the guarantee is only as good as the UI that never sends it.
  const startPhase = phaseOf(stage);
  if (startPhase && startPhase.gated) {
    const missing = missingGates({ ...GATE_DEFAULTS, net_metering_na: isOffGrid(pkg) ? 1 : 0 });
    if (missing.length) {
      return json({
        ok: false,
        error: `A new job cannot start in ${startPhase.label} — its compliance gates are still open.`,
        missing: missing.map((g) => ({ key: g.key, label: g.label })),
      }, 409);
    }
  }

  const job = {
    id,
    job_code: "",
    lead_id: lead ? lead.id : null,
    customer_name: customer,
    phone: text(body.phone, 40) || text(lead && lead.phone, 40),
    site_address: text(body.site_address, 300) || text(lead && lead.address, 300),
    package: pkg,
    contract_price_cents: cents(body.contract_price_cents),
    target_cost_cents: cents(body.target_cost_cents),
    stage,
    owner: text(body.owner, 60) || actorName(user),
    survey_date: surveyDate,
    install_date: installDate,
    // Off-grid has no interconnection to apply for; recorded as N/A up front rather
    // than left looking like an outstanding gate forever.
    net_metering_na: isOffGrid(pkg) ? 1 : 0,
    notes: text(body.notes, 2000),
    stage_entered_at: now,
  };

  // Allocate the code and insert under the unique index. A racing create takes the number
  // first and this insert fails; recompute and try again rather than handing a founder an
  // error for something the database just told us how to fix. Three attempts is plenty for
  // a three-person team — beyond that something is wrong that a retry will not cure.
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    job.job_code = await nextJobCode(env, now.slice(0, 4));
    try {
      await env.DB.prepare(
        `INSERT INTO install_projects
           (id, job_code, lead_id, customer_name, phone, site_address, package,
            contract_price_cents, target_cost_cents, stage, owner, survey_date, install_date,
            net_metering_na, notes, stage_entered_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        job.id, job.job_code, job.lead_id, job.customer_name, job.phone, job.site_address,
        job.package, job.contract_price_cents, job.target_cost_cents, job.stage, job.owner,
        job.survey_date, job.install_date, job.net_metering_na, job.notes, job.stage_entered_at,
        now, now
      ).run();
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (!/UNIQUE|constraint/i.test(String(err && err.message))) throw err;
    }
  }
  if (lastErr) {
    return json({ ok: false, error: "Another job took that job code. Try creating it again." }, 409);
  }

  const seeded = await seedTemplate(env, job, now);
  await logStageEvent(env, id, null, stage, 0, `Job created with ${seeded} template tasks`, actorName(user));

  return json({ ok: true, id, job_code: job.job_code, tasks_seeded: seeded });
}

/**
 * Write the template onto a job. Dates hang off install_date when it is known; without
 * one the tasks are created undated rather than given invented deadlines.
 */
async function seedTemplate(env, job, now) {
  const anchor = job.install_date || "";
  const offGrid = isOffGrid(job.package);
  const rows = TEMPLATE.filter((t) => !(t.offGridSkip && offGrid));
  const statements = rows.map((t, i) =>
    env.DB.prepare(
      `INSERT INTO project_tasks
         (id, title, owner, type, due, status, notes, job_id, role, phase, is_gate, gate_key,
          sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 'Traction', ?, 'Backlog', '', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), t.title, "", anchor ? shiftDate(anchor, t.off) : "",
      job.id, t.role, t.phase, t.gate ? 1 : 0, t.gate || null, i, now, now
    )
  );
  if (statements.length) await env.DB.batch(statements);
  return statements.length;
}

/**
 * Move a job's stage. This is the check the old board had no way to express: a job may
 * not enter On site or Energized while a compliance gate is open, and the refusal is a
 * 409 from the server, not a greyed-out control the next UI could forget to draw.
 */
async function moveStage(env, job, nextStage, user) {
  const phase = phaseOf(nextStage);
  if (phase && phase.gated) {
    const missing = missingGates(job);
    if (missing.length) {
      await logStageEvent(
        env, job.id, job.stage, nextStage, 1,
        `Refused: ${missing.map((g) => g.label).join("; ")}`, actorName(user)
      );
      return json({
        ok: false,
        error: `${job.job_code || "This job"} cannot enter ${phase.label} yet.`,
        missing: missing.map((g) => ({ key: g.key, label: g.label })),
      }, 409);
    }
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE install_projects SET stage = ?, stage_entered_at = ?, updated_at = ? WHERE id = ?`
  ).bind(nextStage, now, now, job.id).run();
  await logStageEvent(env, job.id, job.stage, nextStage, 0, null, actorName(user));
  return json({ ok: true, stage: nextStage, stage_entered_at: now });
}

const JOB_TEXT_FIELDS = {
  customer_name: 120, phone: 40, site_address: 300, package: 60, owner: 60, notes: 2000,
};
const JOB_FLAG_FIELDS = [
  "permit_checklist", "licensed_electrician_check", "net_metering_check", "net_metering_na",
  "safety_briefing_check", "testing_check", "handover_check",
];

async function patchJob(env, body, user) {
  const id = text(body.id, 80);
  if (!id) return json({ ok: false, error: "A job id is required." }, 422);
  const job = await env.DB.prepare(`SELECT * FROM install_projects WHERE id = ?`).bind(id).first();
  if (!job) return json({ ok: false, error: "Job not found." }, 404);

  // A stage move is its own operation — it is gated, and it writes history.
  if (typeof body.stage === "string") {
    if (!STAGES.includes(body.stage)) return json({ ok: false, error: "Unknown stage." }, 422);
    if (body.stage !== job.stage) return moveStage(env, job, body.stage, user);
  }

  const sets = [];
  const binds = [];
  for (const [field, max] of Object.entries(JOB_TEXT_FIELDS)) {
    if (typeof body[field] === "string") {
      if (field === "customer_name" && !text(body[field], max)) {
        return json({ ok: false, error: "A customer name is required." }, 422);
      }
      sets.push(`${field} = ?`); binds.push(text(body[field], max));
    }
  }
  for (const field of ["contract_price_cents", "target_cost_cents"]) {
    if (body[field] !== undefined) { sets.push(`${field} = ?`); binds.push(cents(body[field])); }
  }
  for (const field of ["survey_date", "install_date"]) {
    if (typeof body[field] === "string") { sets.push(`${field} = ?`); binds.push(date(body[field])); }
  }
  for (const field of JOB_FLAG_FIELDS) {
    if (body[field] !== undefined) { sets.push(`${field} = ?`); binds.push(flag(body[field])); }
  }
  if (!sets.length) return json({ ok: false, error: "Nothing to update." }, 422);

  const now = new Date().toISOString();
  sets.push("updated_at = ?"); binds.push(now);
  binds.push(id);
  await env.DB.prepare(`UPDATE install_projects SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();

  // A gate flag and the template task that drives it are one fact. Flipping the gate
  // here settles the task too, so the field view and the office never disagree.
  for (const gate of GATES) {
    if (body[gate.key] === undefined) continue;
    const done = flag(body[gate.key]);
    await env.DB.prepare(
      `UPDATE project_tasks
       SET status = ?, completed_at = ?, updated_at = ?
       WHERE job_id = ? AND gate_key = ?`
    ).bind(done ? "Done" : "Backlog", done ? now : null, now, id, gate.key).run();
  }

  // Re-dating the install re-dates the plan: template offsets are relative by design.
  if (typeof body.install_date === "string" && date(body.install_date) && date(body.install_date) !== job.install_date) {
    await redateTasks(env, id, date(body.install_date), job.package, now);
  }

  const updated = await env.DB.prepare(`SELECT * FROM install_projects WHERE id = ?`).bind(id).first();
  return json({ ok: true, job: { ...updated, missing_gates: missingGates(updated).map((g) => g.key) } });
}

/**
 * Re-hang every still-template task off a new install date. Tasks the team added by hand
 * (no matching template title) keep their own dates — re-dating the plan must not quietly
 * move work somebody scheduled deliberately.
 */
async function redateTasks(env, jobId, installDate, pkg, now) {
  const offsets = new Map(TEMPLATE.map((t) => [t.title, t.off]));
  const { results } = await env.DB.prepare(
    `SELECT id, title FROM project_tasks WHERE job_id = ?`
  ).bind(jobId).all();
  const statements = [];
  for (const row of results || []) {
    if (!offsets.has(row.title)) continue;
    statements.push(
      env.DB.prepare(`UPDATE project_tasks SET due = ?, updated_at = ? WHERE id = ?`)
        .bind(shiftDate(installDate, offsets.get(row.title)), now, row.id)
    );
  }
  if (statements.length) await env.DB.batch(statements);
  return statements.length;
}

/* ------------------------------------------------------------- job tasks ------- */

async function createTask(env, body) {
  const jobId = text(body.job_id, 80);
  const title = text(body.title, 96);
  if (!jobId || !title) return json({ ok: false, error: "A job and a task title are required." }, 422);
  const job = await env.DB.prepare(`SELECT id FROM install_projects WHERE id = ?`).bind(jobId).first();
  if (!job) return json({ ok: false, error: "Job not found." }, 404);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const phase = PHASE_KEYS.includes(body.phase) ? body.phase : "prep";
  const role = ROLES.includes(body.role) ? body.role : "Ops";
  const last = await env.DB.prepare(
    `SELECT MAX(sort_order) AS n FROM project_tasks WHERE job_id = ?`
  ).bind(jobId).first();

  await env.DB.prepare(
    `INSERT INTO project_tasks
       (id, title, owner, type, due, status, notes, job_id, role, phase, is_gate, gate_key,
        sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 'Traction', ?, 'Backlog', ?, ?, ?, ?, 0, NULL, ?, ?, ?)`
  ).bind(
    id, title, text(body.owner, 36), date(body.due), text(body.notes, 160),
    jobId, role, phase, (Number(last && last.n) || 0) + 1, now, now
  ).run();

  return json({ ok: true, id });
}

async function patchTask(env, body) {
  const id = text(body.id, 80);
  if (!id) return json({ ok: false, error: "A task id is required." }, 422);
  const task = await env.DB.prepare(`SELECT * FROM project_tasks WHERE id = ?`).bind(id).first();
  if (!task) return json({ ok: false, error: "Task not found." }, 404);

  const now = new Date().toISOString();
  const sets = [];
  const binds = [];

  if (body.done !== undefined) {
    const done = flag(body.done);
    sets.push("status = ?"); binds.push(done ? "Done" : "Backlog");
    sets.push("completed_at = ?"); binds.push(done ? now : null);
  }
  if (typeof body.title === "string") {
    const title = text(body.title, 96);
    if (!title) return json({ ok: false, error: "A task title is required." }, 422);
    sets.push("title = ?"); binds.push(title);
  }
  if (typeof body.due === "string") { sets.push("due = ?"); binds.push(date(body.due)); }
  if (typeof body.owner === "string") { sets.push("owner = ?"); binds.push(text(body.owner, 36)); }
  if (typeof body.notes === "string") { sets.push("notes = ?"); binds.push(text(body.notes, 160)); }
  if (typeof body.role === "string" && ROLES.includes(body.role)) { sets.push("role = ?"); binds.push(body.role); }
  if (!sets.length) return json({ ok: false, error: "Nothing to update." }, 422);

  sets.push("updated_at = ?"); binds.push(now);
  binds.push(id);
  await env.DB.prepare(`UPDATE project_tasks SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();

  // The other half of the one-fact rule: settling a gate task signs off the job's gate.
  //
  // gate_key is a column name spliced into SQL below, so it is checked against the GATES
  // list first. Today only seedTemplate writes that column and only from the local
  // TEMPLATE, so nothing user-supplied can reach it — the whitelist is what keeps that
  // true after the next endpoint that learns to write project_tasks.
  let gate = null;
  if (GATE_KEYS.includes(task.gate_key) && task.job_id && body.done !== undefined) {
    const done = flag(body.done);
    await env.DB.prepare(
      `UPDATE install_projects SET ${task.gate_key} = ?, updated_at = ? WHERE id = ?`
    ).bind(done, now, task.job_id).run();
    const job = await env.DB.prepare(`SELECT * FROM install_projects WHERE id = ?`).bind(task.job_id).first();
    gate = { key: task.gate_key, value: done, missing_gates: missingGates(job).map((g) => g.key) };
  }

  return json({ ok: true, gate });
}

async function deleteTask(env, body) {
  const id = text(body.id, 80);
  if (!id) return json({ ok: false, error: "A task id is required." }, 422);
  const result = await env.DB.prepare(`DELETE FROM project_tasks WHERE id = ?`).bind(id).run();
  if (!result.meta || result.meta.changes === 0) return json({ ok: false, error: "Task not found." }, 404);
  return json({ ok: true });
}

/**
 * Delete a job. Refused once real money is attached — a record with a received payment
 * is an accounting document, and removing it would silently orphan the ledger rows SC-09
 * has already reported. Cancel the job instead.
 *
 * Every cost, payment and crew assignment can carry a finance_transaction_id: install-ops
 * writes the SC-09 ledger row and the install row as a pair, and deletes them as a pair
 * (/api/install-ops DELETE). This did not, so removing a job with a committed supplier
 * cost left an expense in Finance pointing at a project that no longer existed — an
 * unreconcilable ledger nobody would notice until month end. The paired rows go too.
 */
async function deleteJob(env, body) {
  const id = text(body.id, 80);
  if (!id) return json({ ok: false, error: "A job id is required." }, 422);
  const paid = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM install_payments WHERE project_id = ? AND status = 'received'`
  ).bind(id).first();
  if (Number(paid && paid.n) > 0) {
    return json({
      ok: false,
      error: "This job has received payments. Move it to the Cancelled stage instead of deleting it.",
    }, 409);
  }

  const ledger = await env.DB.batch([
    env.DB.prepare(`SELECT finance_transaction_id AS fid FROM install_costs WHERE project_id = ?`).bind(id),
    env.DB.prepare(`SELECT finance_transaction_id AS fid FROM install_payments WHERE project_id = ?`).bind(id),
    env.DB.prepare(`SELECT finance_transaction_id AS fid FROM install_assignments WHERE project_id = ?`).bind(id),
  ]);
  const financeIds = ledger
    .flatMap((r) => r.results || [])
    .map((r) => r.fid)
    .filter(Boolean);

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM project_tasks WHERE job_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM job_stage_events WHERE job_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM install_costs WHERE project_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM install_payments WHERE project_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM install_assignments WHERE project_id = ?`).bind(id),
    ...financeIds.map((fid) =>
      env.DB.prepare(`DELETE FROM finance_transactions WHERE id = ?`).bind(fid)
    ),
    env.DB.prepare(`DELETE FROM install_projects WHERE id = ?`).bind(id),
  ]);
  return json({ ok: true, finance_rows_removed: financeIds.length });
}

/* --------------------------------------------------------------- handler ------- */

export async function onRequest(context) {
  const { request, env } = context;

  const user = await currentUser(context);
  if (!user) return json({ ok: false, error: "Not authorized." }, 401);
  if (!env.DB) return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);

  try {
    await ensureSchema(env);
  } catch {
    return json({ ok: false, error: "The job tables are not ready yet. Apply schema.sql and retry." }, 503);
  }

  if (request.method === "GET") {
    const id = text(new URL(request.url).searchParams.get("id"), 80);
    return id ? jobDetail(env, id) : listJobs(env);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
  const resource = text(body.resource, 30);

  if (request.method === "POST") {
    if (resource === "task") return createTask(env, body);
    return createJob(env, body, user);
  }
  if (request.method === "PATCH") {
    if (resource === "task") return patchTask(env, body);
    return patchJob(env, body, user);
  }
  if (request.method === "DELETE") {
    if (resource === "task") return deleteTask(env, body);
    return deleteJob(env, body);
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
