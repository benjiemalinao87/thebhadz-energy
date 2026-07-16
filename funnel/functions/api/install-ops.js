/**
 * /api/install-ops — founder-gated SC-10 installation, costing and crew records.
 * Linked received payments and paid/committed costs are synchronized to SC-09.
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

const STAGES = ["survey", "quoted", "approved", "deposit_paid", "design", "permits", "procurement", "scheduled", "installing", "testing", "energized", "handover", "warranty", "cancelled"];
const COST_STATUSES = ["planned", "committed", "paid"];
const PAYMENT_KINDS = ["deposit", "progress", "final", "refund"];
const PAYMENT_STATUSES = ["expected", "received"];
const RATE_TYPES = ["hourly", "daily", "project"];
const ASSIGNMENT_STATUSES = ["scheduled", "completed", "approved", "paid"];
const QC_STATUSES = ["pending", "passed", "rework"];
const CHECK_FIELDS = ["permit_checklist", "licensed_electrician_check", "net_metering_check", "safety_briefing_check", "testing_check", "handover_check"];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function authorized(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  return env.AUTH_SECRET ? verifyToken(token, env.AUTH_SECRET) : false;
}

function text(value, max = 160) { return String(value || "").trim().slice(0, max); }
function date(value) { const result = text(value, 10); return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : ""; }
function nonNegative(value) { const result = Number(value); return Number.isSafeInteger(result) && result >= 0 ? result : 0; }
function positive(value) { const result = Number(value); return Number.isSafeInteger(result) && result > 0 ? result : 0; }
function number(value) { const result = Number(value); return Number.isFinite(result) && result >= 0 ? Math.min(result, 10000) : 0; }
function flag(value) { return value === true || value === 1 || value === "1" ? 1 : 0; }
function id(value) { return text(value || crypto.randomUUID(), 80); }
function requiredId(value) { return text(value, 80); }

function cleanProject(input, existingId) {
  const customer = text(input.customer_name, 120);
  if (!customer) return null;
  const project = {
    id: id(existingId || input.id),
    lead_id: Number.isInteger(Number(input.lead_id)) && Number(input.lead_id) > 0 ? Number(input.lead_id) : null,
    customer_name: customer,
    phone: text(input.phone, 40),
    site_address: text(input.site_address, 300),
    package: text(input.package, 60) || "Custom",
    contract_price_cents: nonNegative(input.contract_price_cents),
    target_cost_cents: nonNegative(input.target_cost_cents),
    stage: STAGES.includes(input.stage) ? input.stage : "survey",
    owner: text(input.owner, 60),
    survey_date: date(input.survey_date),
    install_date: date(input.install_date),
    notes: text(input.notes, 2000),
  };
  CHECK_FIELDS.forEach((field) => { project[field] = flag(input[field]); });
  return project;
}

function cleanCost(input, existingId) {
  const projectId = requiredId(input.project_id);
  const description = text(input.description, 180);
  if (!projectId || !description) return null;
  return {
    id: id(existingId || input.id), project_id: projectId,
    category: text(input.category, 80) || "Materials", description,
    vendor: text(input.vendor, 120), budget_cents: nonNegative(input.budget_cents),
    committed_cents: nonNegative(input.committed_cents), actual_cents: nonNegative(input.actual_cents),
    status: COST_STATUSES.includes(input.status) ? input.status : "planned",
    finance_transaction_id: text(input.finance_transaction_id, 80),
  };
}

function cleanPayment(input, existingId) {
  const amount = positive(input.amount_cents);
  const paymentDate = date(input.payment_date);
  const projectId = requiredId(input.project_id);
  if (!amount || !paymentDate || !projectId) return null;
  return {
    id: id(existingId || input.id), project_id: projectId, payment_date: paymentDate,
    kind: PAYMENT_KINDS.includes(input.kind) ? input.kind : "deposit", amount_cents: amount,
    status: PAYMENT_STATUSES.includes(input.status) ? input.status : "expected",
    reference: text(input.reference, 160), finance_transaction_id: text(input.finance_transaction_id, 80),
  };
}

function cleanInstaller(input, existingId) {
  const name = text(input.name, 120);
  if (!name) return null;
  return {
    id: id(existingId || input.id), name, role: text(input.role, 80) || "Installer",
    phone: text(input.phone, 40), rate_type: RATE_TYPES.includes(input.rate_type) ? input.rate_type : "daily",
    rate_cents: nonNegative(input.rate_cents), license_number: text(input.license_number, 100),
    license_expiry: date(input.license_expiry), active: input.active === false || input.active === 0 ? 0 : 1,
    notes: text(input.notes, 1200),
  };
}

function cleanAssignment(input, existingId) {
  const workDate = date(input.work_date);
  const projectId = requiredId(input.project_id);
  const installerId = requiredId(input.installer_id);
  if (!workDate || !projectId || !installerId) return null;
  return {
    id: id(existingId || input.id), project_id: projectId, installer_id: installerId,
    work_date: workDate, hours: number(input.hours), days: number(input.days),
    agreed_cents: nonNegative(input.agreed_cents),
    status: ASSIGNMENT_STATUSES.includes(input.status) ? input.status : "scheduled",
    safety_checked: flag(input.safety_checked), qc_status: QC_STATUSES.includes(input.qc_status) ? input.qc_status : "pending",
    finance_transaction_id: text(input.finance_transaction_id, 80), notes: text(input.notes, 1200),
  };
}

function financeInsert(env, transaction) {
  return env.DB.prepare(
    `INSERT INTO finance_transactions
     (id, txn_date, direction, status, kind, category, account, amount_cents, counterparty,
      founder, contribution_type, project_id, reference, receipt_key, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, '', '', ?, ?, '', ?, ?, ?)`
  ).bind(
    transaction.id, transaction.date, transaction.direction, transaction.status, transaction.kind,
    transaction.category, transaction.amount, transaction.counterparty, transaction.projectId,
    transaction.reference || "", transaction.notes || "", transaction.now, transaction.now
  );
}

function financeUpdate(env, transaction) {
  return env.DB.prepare(
    `UPDATE finance_transactions SET txn_date=?, direction=?, status=?, kind=?, category=?, amount_cents=?,
     counterparty=?, project_id=?, reference=?, notes=?, updated_at=? WHERE id=?`
  ).bind(
    transaction.date, transaction.direction, transaction.status, transaction.kind, transaction.category,
    transaction.amount, transaction.counterparty, transaction.projectId, transaction.reference || "",
    transaction.notes || "", transaction.now, transaction.id
  );
}

async function projectName(env, projectId) {
  return env.DB.prepare(
    `SELECT customer_name, permit_checklist, licensed_electrician_check, net_metering_check
     FROM install_projects WHERE id=?`
  ).bind(projectId).first();
}

function complianceReady(project) {
  return Boolean(project && project.permit_checklist && project.licensed_electrician_check && project.net_metering_check);
}

function stageNeedsCompliance(stage) {
  return ["deposit_paid", "design", "permits", "procurement", "scheduled", "installing", "testing", "energized", "handover", "warranty"].includes(stage);
}

export async function onRequest({ request, env }) {
  if (!(await authorized(request, env))) return json({ ok: false, error: "Not authorized." }, 401);
  if (!env.DB) return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);

  if (request.method === "GET") {
    const [projects, costs, payments, installers, assignments, leads] = await env.DB.batch([
      env.DB.prepare(`SELECT * FROM install_projects ORDER BY CASE stage WHEN 'installing' THEN 1 WHEN 'scheduled' THEN 2 WHEN 'deposit_paid' THEN 3 WHEN 'procurement' THEN 4 WHEN 'energized' THEN 12 WHEN 'cancelled' THEN 13 ELSE 5 END, datetime(updated_at) DESC`),
      env.DB.prepare(`SELECT * FROM install_costs ORDER BY datetime(created_at) DESC`),
      env.DB.prepare(`SELECT * FROM install_payments ORDER BY payment_date DESC, datetime(created_at) DESC`),
      env.DB.prepare(`SELECT * FROM installers ORDER BY active DESC, name ASC`),
      env.DB.prepare(`SELECT a.*, i.name AS installer_name, p.customer_name AS customer_name FROM install_assignments a JOIN installers i ON i.id=a.installer_id JOIN install_projects p ON p.id=a.project_id ORDER BY a.work_date DESC`),
      env.DB.prepare(`SELECT id, name, phone, package, stage FROM leads WHERE stage IN ('proposal','sold') ORDER BY datetime(updated_at) DESC LIMIT 200`),
    ]);
    return json({
      ok: true,
      projects: projects.results || [], costs: costs.results || [], payments: payments.results || [],
      installers: installers.results || [], assignments: assignments.results || [], leads: leads.results || [],
    });
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
  const resource = text(body.resource, 30);
  const now = new Date().toISOString();

  if (request.method === "POST") {
    if (resource === "project") {
      const project = cleanProject(body);
      if (!project) return json({ ok: false, error: "Customer name is required." }, 422);
      if (stageNeedsCompliance(project.stage) && !complianceReady(project)) {
        return json({ ok: false, error: "Complete the permit, licensed-electrician, and net-metering checks before advancing this project." }, 409);
      }
      await env.DB.prepare(
        `INSERT INTO install_projects
         (id, lead_id, customer_name, phone, site_address, package, contract_price_cents,
          target_cost_cents, stage, owner, survey_date, install_date, permit_checklist,
          licensed_electrician_check, net_metering_check, safety_briefing_check,
          testing_check, handover_check, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        project.id, project.lead_id, project.customer_name, project.phone, project.site_address,
        project.package, project.contract_price_cents, project.target_cost_cents, project.stage,
        project.owner, project.survey_date, project.install_date, project.permit_checklist,
        project.licensed_electrician_check, project.net_metering_check, project.safety_briefing_check,
        project.testing_check, project.handover_check, project.notes, now, now
      ).run();
      return json({ ok: true, project: { ...project, created_at: now, updated_at: now } }, 201);
    }

    if (resource === "cost") {
      const cost = cleanCost(body);
      if (!cost) return json({ ok: false, error: "Project and cost description are required." }, 422);
      const project = await projectName(env, cost.project_id);
      if (!project) return json({ ok: false, error: "Installation project not found." }, 404);
      const statements = [];
      let financeId = "";
      const linkedAmount = cost.status === "paid" ? cost.actual_cents : cost.status === "committed" ? cost.committed_cents : 0;
      if (linkedAmount > 0) {
        financeId = crypto.randomUUID();
        statements.push(financeInsert(env, {
          id: financeId, date: now.slice(0, 10), direction: "outflow",
          status: cost.status === "paid" ? "paid" : "committed", kind: "expense",
          category: cost.category, amount: linkedAmount, counterparty: cost.vendor,
          projectId: cost.project_id, reference: cost.description,
          notes: `Linked job cost for ${project.customer_name}`, now,
        }));
      }
      statements.push(env.DB.prepare(
        `INSERT INTO install_costs
         (id, project_id, category, description, vendor, budget_cents, committed_cents,
          actual_cents, status, finance_transaction_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(cost.id, cost.project_id, cost.category, cost.description, cost.vendor, cost.budget_cents,
        cost.committed_cents, cost.actual_cents, cost.status, financeId, now, now));
      await env.DB.batch(statements);
      return json({ ok: true }, 201);
    }

    if (resource === "payment") {
      const payment = cleanPayment(body);
      if (!payment) return json({ ok: false, error: "Payment date and positive amount are required." }, 422);
      const project = await projectName(env, payment.project_id);
      if (!project) return json({ ok: false, error: "Installation project not found." }, 404);
      if (payment.status === "received" && payment.kind === "deposit" && !complianceReady(project)) {
        return json({ ok: false, error: "Do not accept or record a deposit until the permit, licensed-electrician, and net-metering checks are complete." }, 409);
      }
      const statements = [];
      let financeId = "";
      if (payment.status === "received") {
        financeId = crypto.randomUUID();
        statements.push(financeInsert(env, {
          id: financeId, date: payment.payment_date,
          direction: payment.kind === "refund" ? "outflow" : "inflow",
          status: "paid", kind: payment.kind === "refund" ? "refund" : "customer_payment",
          category: `Customer ${payment.kind}`, amount: payment.amount_cents,
          counterparty: project.customer_name, projectId: payment.project_id,
          reference: payment.reference, notes: `Linked ${payment.kind} for ${project.customer_name}`, now,
        }));
      }
      statements.push(env.DB.prepare(
        `INSERT INTO install_payments
         (id, project_id, payment_date, kind, amount_cents, status, reference,
          finance_transaction_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(payment.id, payment.project_id, payment.payment_date, payment.kind, payment.amount_cents,
        payment.status, payment.reference, financeId, now, now));
      await env.DB.batch(statements);
      return json({ ok: true }, 201);
    }

    if (resource === "installer") {
      const installer = cleanInstaller(body);
      if (!installer) return json({ ok: false, error: "Installer name is required." }, 422);
      await env.DB.prepare(
        `INSERT INTO installers
         (id, name, role, phone, rate_type, rate_cents, license_number, license_expiry,
          active, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(installer.id, installer.name, installer.role, installer.phone, installer.rate_type,
        installer.rate_cents, installer.license_number, installer.license_expiry,
        installer.active, installer.notes, now, now).run();
      return json({ ok: true }, 201);
    }

    if (resource === "assignment") {
      const assignment = cleanAssignment(body);
      if (!assignment) return json({ ok: false, error: "Project, installer, and work date are required." }, 422);
      const [project, installer] = await Promise.all([
        projectName(env, assignment.project_id),
        env.DB.prepare(`SELECT name FROM installers WHERE id=?`).bind(assignment.installer_id).first(),
      ]);
      if (!project || !installer) return json({ ok: false, error: "Project or installer not found." }, 404);
      const statements = [];
      let financeId = "";
      if (assignment.status === "paid" && assignment.agreed_cents > 0) {
        financeId = crypto.randomUUID();
        statements.push(financeInsert(env, {
          id: financeId, date: assignment.work_date, direction: "outflow", status: "paid",
          kind: "installer_payment", category: "Installer labor", amount: assignment.agreed_cents,
          counterparty: installer.name, projectId: assignment.project_id,
          reference: "Crew assignment", notes: `Linked installer payout for ${project.customer_name}`, now,
        }));
      }
      statements.push(env.DB.prepare(
        `INSERT INTO install_assignments
         (id, project_id, installer_id, work_date, hours, days, agreed_cents, status,
          safety_checked, qc_status, finance_transaction_id, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(assignment.id, assignment.project_id, assignment.installer_id, assignment.work_date,
        assignment.hours, assignment.days, assignment.agreed_cents, assignment.status,
        assignment.safety_checked, assignment.qc_status, financeId, assignment.notes, now, now));
      await env.DB.batch(statements);
      return json({ ok: true }, 201);
    }

    return json({ ok: false, error: "Unknown resource." }, 422);
  }

  if (request.method === "PATCH") {
    const recordId = id(body.id);
    if (!text(body.id, 80)) return json({ ok: false, error: "A valid id is required." }, 422);

    if (resource === "project") {
      const current = await env.DB.prepare(`SELECT * FROM install_projects WHERE id=?`).bind(recordId).first();
      if (!current) return json({ ok: false, error: "Installation project not found." }, 404);
      const project = cleanProject({ ...current, ...body }, recordId);
      if (!project) return json({ ok: false, error: "Customer name is required." }, 422);
      if (stageNeedsCompliance(project.stage) && !complianceReady(project)) {
        return json({ ok: false, error: "Complete the permit, licensed-electrician, and net-metering checks before advancing this project." }, 409);
      }
      await env.DB.prepare(
        `UPDATE install_projects SET lead_id=?, customer_name=?, phone=?, site_address=?, package=?,
         contract_price_cents=?, target_cost_cents=?, stage=?, owner=?, survey_date=?, install_date=?,
         permit_checklist=?, licensed_electrician_check=?, net_metering_check=?, safety_briefing_check=?,
         testing_check=?, handover_check=?, notes=?, updated_at=? WHERE id=?`
      ).bind(project.lead_id, project.customer_name, project.phone, project.site_address, project.package,
        project.contract_price_cents, project.target_cost_cents, project.stage, project.owner,
        project.survey_date, project.install_date, project.permit_checklist,
        project.licensed_electrician_check, project.net_metering_check, project.safety_briefing_check,
        project.testing_check, project.handover_check, project.notes, now, recordId).run();
      return json({ ok: true, updated_at: now });
    }

    if (resource === "cost") {
      const current = await env.DB.prepare(`SELECT * FROM install_costs WHERE id=?`).bind(recordId).first();
      if (!current) return json({ ok: false, error: "Cost line not found." }, 404);
      const cost = cleanCost({ ...current, ...body }, recordId);
      const project = await projectName(env, cost.project_id);
      const amount = cost.status === "paid" ? cost.actual_cents : cost.status === "committed" ? cost.committed_cents : 0;
      const statements = [];
      let financeId = current.finance_transaction_id || "";
      if (amount > 0) {
        if (!financeId) financeId = crypto.randomUUID();
        const transaction = { id: financeId, date: now.slice(0, 10), direction: "outflow",
          status: cost.status === "paid" ? "paid" : "committed", kind: "expense", category: cost.category,
          amount, counterparty: cost.vendor, projectId: cost.project_id, reference: cost.description,
          notes: `Linked job cost for ${project?.customer_name || "installation"}`, now };
        statements.push(current.finance_transaction_id ? financeUpdate(env, transaction) : financeInsert(env, transaction));
      } else if (financeId) {
        statements.push(env.DB.prepare(`DELETE FROM finance_transactions WHERE id=?`).bind(financeId));
        financeId = "";
      }
      statements.push(env.DB.prepare(
        `UPDATE install_costs SET category=?, description=?, vendor=?, budget_cents=?, committed_cents=?,
         actual_cents=?, status=?, finance_transaction_id=?, updated_at=? WHERE id=?`
      ).bind(cost.category, cost.description, cost.vendor, cost.budget_cents, cost.committed_cents,
        cost.actual_cents, cost.status, financeId, now, recordId));
      await env.DB.batch(statements);
      return json({ ok: true });
    }

    if (resource === "payment") {
      const current = await env.DB.prepare(`SELECT * FROM install_payments WHERE id=?`).bind(recordId).first();
      if (!current) return json({ ok: false, error: "Payment not found." }, 404);
      const payment = cleanPayment({ ...current, ...body }, recordId);
      if (!payment) return json({ ok: false, error: "Payment date and positive amount are required." }, 422);
      const project = await projectName(env, payment.project_id);
      if (payment.status === "received" && payment.kind === "deposit" && !complianceReady(project)) {
        return json({ ok: false, error: "Do not accept or record a deposit until the permit, licensed-electrician, and net-metering checks are complete." }, 409);
      }
      const statements = [];
      let financeId = current.finance_transaction_id || "";
      if (payment.status === "received") {
        if (!financeId) financeId = crypto.randomUUID();
        const transaction = { id: financeId, date: payment.payment_date,
          direction: payment.kind === "refund" ? "outflow" : "inflow", status: "paid",
          kind: payment.kind === "refund" ? "refund" : "customer_payment",
          category: `Customer ${payment.kind}`, amount: payment.amount_cents,
          counterparty: project?.customer_name || "Customer", projectId: payment.project_id,
          reference: payment.reference, notes: `Linked ${payment.kind} for ${project?.customer_name || "installation"}`, now };
        statements.push(current.finance_transaction_id ? financeUpdate(env, transaction) : financeInsert(env, transaction));
      } else if (financeId) {
        statements.push(env.DB.prepare(`DELETE FROM finance_transactions WHERE id=?`).bind(financeId));
        financeId = "";
      }
      statements.push(env.DB.prepare(
        `UPDATE install_payments SET payment_date=?, kind=?, amount_cents=?, status=?, reference=?,
         finance_transaction_id=?, updated_at=? WHERE id=?`
      ).bind(payment.payment_date, payment.kind, payment.amount_cents, payment.status,
        payment.reference, financeId, now, recordId));
      await env.DB.batch(statements);
      return json({ ok: true });
    }

    if (resource === "installer") {
      const current = await env.DB.prepare(`SELECT * FROM installers WHERE id=?`).bind(recordId).first();
      if (!current) return json({ ok: false, error: "Installer not found." }, 404);
      const installer = cleanInstaller({ ...current, ...body }, recordId);
      await env.DB.prepare(
        `UPDATE installers SET name=?, role=?, phone=?, rate_type=?, rate_cents=?, license_number=?,
         license_expiry=?, active=?, notes=?, updated_at=? WHERE id=?`
      ).bind(installer.name, installer.role, installer.phone, installer.rate_type, installer.rate_cents,
        installer.license_number, installer.license_expiry, installer.active, installer.notes, now, recordId).run();
      return json({ ok: true });
    }

    if (resource === "assignment") {
      const current = await env.DB.prepare(`SELECT * FROM install_assignments WHERE id=?`).bind(recordId).first();
      if (!current) return json({ ok: false, error: "Assignment not found." }, 404);
      const assignment = cleanAssignment({ ...current, ...body }, recordId);
      const installer = await env.DB.prepare(`SELECT name FROM installers WHERE id=?`).bind(assignment.installer_id).first();
      const project = await projectName(env, assignment.project_id);
      const statements = [];
      let financeId = current.finance_transaction_id || "";
      if (assignment.status === "paid" && assignment.agreed_cents > 0) {
        if (!financeId) financeId = crypto.randomUUID();
        const transaction = { id: financeId, date: assignment.work_date, direction: "outflow", status: "paid",
          kind: "installer_payment", category: "Installer labor", amount: assignment.agreed_cents,
          counterparty: installer?.name || "Installer", projectId: assignment.project_id,
          reference: "Crew assignment", notes: `Linked installer payout for ${project?.customer_name || "installation"}`, now };
        statements.push(current.finance_transaction_id ? financeUpdate(env, transaction) : financeInsert(env, transaction));
      } else if (financeId) {
        statements.push(env.DB.prepare(`DELETE FROM finance_transactions WHERE id=?`).bind(financeId));
        financeId = "";
      }
      statements.push(env.DB.prepare(
        `UPDATE install_assignments SET project_id=?, installer_id=?, work_date=?, hours=?, days=?,
         agreed_cents=?, status=?, safety_checked=?, qc_status=?, finance_transaction_id=?, notes=?,
         updated_at=? WHERE id=?`
      ).bind(assignment.project_id, assignment.installer_id, assignment.work_date, assignment.hours,
        assignment.days, assignment.agreed_cents, assignment.status, assignment.safety_checked,
        assignment.qc_status, financeId, assignment.notes, now, recordId));
      await env.DB.batch(statements);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown resource." }, 422);
  }

  if (request.method === "DELETE") {
    const recordId = text(body.id, 80);
    if (!recordId) return json({ ok: false, error: "A valid id is required." }, 422);
    const tables = { cost: "install_costs", payment: "install_payments", assignment: "install_assignments" };
    const table = tables[resource];
    if (!table) return json({ ok: false, error: "Only cost, payment, and assignment records can be removed." }, 422);
    const current = await env.DB.prepare(`SELECT finance_transaction_id FROM ${table} WHERE id=?`).bind(recordId).first();
    if (!current) return json({ ok: false, error: "Record not found." }, 404);
    const statements = [env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(recordId)];
    if (current.finance_transaction_id) statements.push(env.DB.prepare(`DELETE FROM finance_transactions WHERE id=?`).bind(current.finance_transaction_id));
    await env.DB.batch(statements);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
