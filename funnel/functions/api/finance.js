/**
 * /api/finance — founder-gated SC-09 cash ledger backed by D1.
 *
 * GET                              -> ledger, settings and computed summary
 * POST   { transaction fields }    -> create a ledger entry
 * PATCH  { id, ...fields }         -> update a ledger entry
 * PATCH  { resource:"settings", cash_required_per_install_cents }
 * DELETE { id }                    -> remove an entry
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

const DIRECTIONS = ["inflow", "outflow"];
const STATUSES = ["paid", "committed"];
const KINDS = ["opening_balance", "founder_contribution", "customer_payment", "expense", "installer_payment", "refund", "other"];
const CONTRIBUTION_TYPES = ["", "capital", "founder_loan", "reimbursable"];
const SETTINGS_ID = "finance-v1";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function requireFounder(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  return env.AUTH_SECRET ? verifyToken(token, env.AUTH_SECRET) : false;
}

function text(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function date(value) {
  const result = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : "";
}

function cents(value) {
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : 0;
}

function cleanTransaction(input, existingId) {
  const amount = cents(input.amount_cents);
  const txnDate = date(input.txn_date);
  if (!amount || !txnDate) return null;
  const direction = DIRECTIONS.includes(input.direction) ? input.direction : "outflow";
  const kind = KINDS.includes(input.kind) ? input.kind : "other";
  const contributionType = CONTRIBUTION_TYPES.includes(input.contribution_type) ? input.contribution_type : "";
  if (kind === "founder_contribution" && !contributionType) return null;
  return {
    id: text(existingId || input.id || crypto.randomUUID(), 80),
    txn_date: txnDate,
    direction,
    status: STATUSES.includes(input.status) ? input.status : "paid",
    kind,
    category: text(input.category, 80) || "Uncategorized",
    account: text(input.account, 80),
    amount_cents: amount,
    counterparty: text(input.counterparty, 120),
    founder: text(input.founder, 60),
    contribution_type: contributionType,
    project_id: text(input.project_id, 80),
    reference: text(input.reference, 160),
    receipt_key: text(input.receipt_key, 240),
    notes: text(input.notes, 1200),
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!(await requireFounder(request, env))) return json({ ok: false, error: "Not authorized." }, 401);
  if (!env.DB) return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);

  if (request.method === "GET") {
    const [ledger, summary, settings] = await env.DB.batch([
      env.DB.prepare(
        `SELECT id, txn_date, direction, status, kind, category, account, amount_cents,
                counterparty, founder, contribution_type, project_id, reference,
                receipt_key, notes, created_at, updated_at,
                CASE WHEN EXISTS (SELECT 1 FROM install_costs c WHERE c.finance_transaction_id=finance_transactions.id)
                       OR EXISTS (SELECT 1 FROM install_payments p WHERE p.finance_transaction_id=finance_transactions.id)
                       OR EXISTS (SELECT 1 FROM install_assignments a WHERE a.finance_transaction_id=finance_transactions.id)
                     THEN 1 ELSE 0 END AS managed_by_install_ops
         FROM finance_transactions
         ORDER BY txn_date DESC, datetime(created_at) DESC
         LIMIT 1000`
      ),
      env.DB.prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status='paid' AND direction='inflow' THEN amount_cents ELSE 0 END), 0) AS paid_inflows,
           COALESCE(SUM(CASE WHEN status='paid' AND direction='outflow' THEN amount_cents ELSE 0 END), 0) AS paid_outflows,
           COALESCE(SUM(CASE WHEN status='committed' AND direction='outflow' THEN amount_cents ELSE 0 END), 0) AS committed_outflows,
           COALESCE(SUM(CASE WHEN status='paid' AND kind='founder_contribution' THEN amount_cents ELSE 0 END), 0) AS founder_funding,
           COALESCE(SUM(CASE WHEN status='paid' AND kind='customer_payment' AND direction='inflow' THEN amount_cents ELSE 0 END), 0) AS customer_cash,
           COALESCE(SUM(CASE WHEN status='paid' AND direction='outflow' AND txn_date >= date('now','-30 days') THEN amount_cents ELSE 0 END), 0) AS burn_30d
         FROM finance_transactions`
      ),
      env.DB.prepare(
        `SELECT cash_required_per_install, updated_at FROM finance_settings WHERE id = ?`
      ).bind(SETTINGS_ID),
    ]);
    return json({
      ok: true,
      transactions: ledger.results || [],
      summary: summary.results?.[0] || {},
      settings: settings.results?.[0] || { cash_required_per_install: 0, updated_at: null },
    });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const transaction = cleanTransaction(body);
    if (!transaction) return json({ ok: false, error: "Date, positive amount, and valid contribution classification are required." }, 422);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO finance_transactions
       (id, txn_date, direction, status, kind, category, account, amount_cents,
        counterparty, founder, contribution_type, project_id, reference, receipt_key,
        notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      transaction.id, transaction.txn_date, transaction.direction, transaction.status,
      transaction.kind, transaction.category, transaction.account, transaction.amount_cents,
      transaction.counterparty, transaction.founder, transaction.contribution_type,
      transaction.project_id, transaction.reference, transaction.receipt_key,
      transaction.notes, now, now
    ).run();
    return json({ ok: true, transaction: { ...transaction, created_at: now, updated_at: now } }, 201);
  }

  if (request.method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }

    if (body.resource === "settings") {
      const cashRequired = Number(body.cash_required_per_install_cents);
      if (!Number.isSafeInteger(cashRequired) || cashRequired < 0) {
        return json({ ok: false, error: "Cash required per install must be zero or a positive integer." }, 422);
      }
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO finance_settings (id, cash_required_per_install, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET cash_required_per_install=excluded.cash_required_per_install, updated_at=excluded.updated_at`
      ).bind(SETTINGS_ID, cashRequired, now).run();
      return json({ ok: true, updated_at: now });
    }

    const id = text(body.id, 80);
    if (!id) return json({ ok: false, error: "A valid id is required." }, 422);
    const linked = await env.DB.prepare(
      `SELECT 1 AS linked FROM install_costs WHERE finance_transaction_id=?
       UNION ALL SELECT 1 FROM install_payments WHERE finance_transaction_id=?
       UNION ALL SELECT 1 FROM install_assignments WHERE finance_transaction_id=? LIMIT 1`
    ).bind(id, id, id).first();
    if (linked) return json({ ok: false, error: "This entry is managed by Install Operations. Update the job cost, customer payment, or installer assignment there." }, 409);
    const current = await env.DB.prepare(
      `SELECT id, txn_date, direction, status, kind, category, account, amount_cents,
              counterparty, founder, contribution_type, project_id, reference, receipt_key, notes
       FROM finance_transactions WHERE id = ?`
    ).bind(id).first();
    if (!current) return json({ ok: false, error: "Transaction not found." }, 404);
    const transaction = cleanTransaction({ ...current, ...body }, id);
    if (!transaction) return json({ ok: false, error: "Date, positive amount, and valid contribution classification are required." }, 422);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE finance_transactions SET txn_date=?, direction=?, status=?, kind=?, category=?,
       account=?, amount_cents=?, counterparty=?, founder=?, contribution_type=?, project_id=?,
       reference=?, receipt_key=?, notes=?, updated_at=? WHERE id=?`
    ).bind(
      transaction.txn_date, transaction.direction, transaction.status, transaction.kind,
      transaction.category, transaction.account, transaction.amount_cents,
      transaction.counterparty, transaction.founder, transaction.contribution_type,
      transaction.project_id, transaction.reference, transaction.receipt_key,
      transaction.notes, now, id
    ).run();
    return json({ ok: true, updated_at: now });
  }

  if (request.method === "DELETE") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = text(body.id, 80);
    if (!id) return json({ ok: false, error: "A valid id is required." }, 422);
    const linked = await env.DB.prepare(
      `SELECT 1 AS linked FROM install_costs WHERE finance_transaction_id=?
       UNION ALL SELECT 1 FROM install_payments WHERE finance_transaction_id=?
       UNION ALL SELECT 1 FROM install_assignments WHERE finance_transaction_id=? LIMIT 1`
    ).bind(id, id, id).first();
    if (linked) return json({ ok: false, error: "This entry is linked to Install Operations. Update it from that project." }, 409);
    const result = await env.DB.prepare(`DELETE FROM finance_transactions WHERE id=?`).bind(id).run();
    if (!result.meta || result.meta.changes === 0) return json({ ok: false, error: "Transaction not found." }, 404);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
