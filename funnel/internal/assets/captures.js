/**
 * SC-19 Product captures (/internal/captures.html).
 *
 * Read-mostly viewer over /api/captures: rows are created by the MACC Product
 * Capture browser extension, so this page lists, searches, annotates (notes) and
 * deletes — it does not create. Search filters client-side over the loaded set
 * (the API caps the list at its newest 500; older rows exist only in exports).
 *
 * Runs its init immediately (no DOMContentLoaded) and returns early when its anchor
 * element is absent, as the SPA router requires — see assets/spa-router.js.
 */
(function () {
  "use strict";

  var root = document.querySelector(".ops-captures");
  if (!root) return;

  var API = "/api/captures";
  var state = { rows: [], q: "" };

  function $(id) { return document.getElementById(id); }
  var els = {
    status: $("cap-status"),
    search: $("cap-search"),
    refresh: $("cap-refresh"),
    exportBtn: $("cap-export"),
    metrics: $("cap-metrics"),
    empty: $("cap-empty"),
    wrap: $("cap-table-wrap"),
    rows: $("cap-rows"),
  };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function setStatus(text) { els.status.textContent = text; }

  function api(method, body, query) {
    return fetch(API + (query || ""), {
      method: method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (response) { return response.json(); });
  }

  function day(iso) { return String(iso || "").slice(0, 10); }

  function costCell(row) {
    if (!row.cost) return '<span class="muted">—</span>';
    var cur = row.currency && row.cost.indexOf(row.currency) === -1 ? ' <span class="muted">' + esc(row.currency) + "</span>" : "";
    return '<span class="amount">' + esc(row.cost) + "</span>" + cur;
  }

  function matches(row, q) {
    if (!q) return true;
    var hay = [row.product, row.brand, row.supplier, row.description, row.location, row.source, row.moq, row.notes, row.other, row.created_by]
      .join(" \n ").toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return state.rows.filter(function (row) { return matches(row, q); });
  }

  function metrics() {
    var weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    var sources = {};
    var week = 0;
    var priced = 0;
    state.rows.forEach(function (row) {
      if (row.source) sources[row.source] = true;
      if (Date.parse(row.captured_at || row.created_at) >= weekAgo) week++;
      if (row.cost) priced++;
    });
    $("cap-total").textContent = state.rows.length;
    $("cap-week").textContent = week;
    $("cap-sources").textContent = Object.keys(sources).length;
    $("cap-priced").textContent = priced;
    els.metrics.hidden = !state.rows.length;
  }

  function detailBlock(label, text) {
    if (!text) return "";
    return "<div><span>" + label + "</span><p>" + esc(text) + "</p></div>";
  }

  function render() {
    var rows = filtered();
    els.empty.hidden = state.rows.length !== 0;
    els.wrap.hidden = state.rows.length === 0;
    var html = rows.map(function (row) {
      var product = esc(row.product || "(no name — see description)");
      var brand = row.brand ? '<span class="muted">' + esc(row.brand) + "</span>" : "";
      var source = row.url
        ? '<a href="' + esc(row.url) + '" target="_blank" rel="noopener noreferrer">' + esc(row.source || "open") + "</a>"
        : esc(row.source || "");
      return (
        '<tr class="cap-row" data-id="' + row.id + '">' +
        '<td class="muted" title="' + esc(row.captured_at) + '">' + esc(day(row.captured_at)) + "</td>" +
        "<td><strong>" + product + "</strong>" + brand + "</td>" +
        "<td>" + costCell(row) + "</td>" +
        "<td>" + esc(row.supplier) + "</td>" +
        "<td>" + esc(row.location) + "</td>" +
        "<td>" + esc(row.moq) + "</td>" +
        "<td>" + source + "</td>" +
        '<td class="muted">' + esc(row.created_by) + "</td>" +
        '<td class="row-actions"><button type="button" class="secondary" data-open="' + row.id + '">Details</button></td>' +
        "</tr>" +
        '<tr class="cap-detail" data-detail="' + row.id + '" hidden><td colspan="9">' +
        '<div class="cap-detail-grid">' +
        detailBlock("Description", row.description) +
        detailBlock("Other info", row.other) +
        (row.image ? '<div><span>Image</span><p><a href="' + esc(row.image) + '" target="_blank" rel="noopener noreferrer">Open image</a></p></div>' : "") +
        (row.url ? '<div><span>Link</span><p><a href="' + esc(row.url) + '" target="_blank" rel="noopener noreferrer">' + esc(row.url).slice(0, 120) + "</a></p></div>" : "") +
        '<div class="cap-notes"><span>Notes</span>' +
        '<textarea data-notes="' + row.id + '" maxlength="2000" placeholder="Why it matters, next step…">' + esc(row.notes) + "</textarea>" +
        '<div class="cap-notes-actions">' +
        '<button type="button" data-save="' + row.id + '">Save notes</button>' +
        '<button type="button" class="secondary" data-delete="' + row.id + '">Delete capture</button>' +
        '<span class="muted" data-flash="' + row.id + '"></span>' +
        "</div></div>" +
        "</div></td></tr>"
      );
    }).join("");
    els.rows.innerHTML = html;
    setStatus(state.q.trim()
      ? rows.length + " of " + state.rows.length + " captures match"
      : state.rows.length + " capture" + (state.rows.length === 1 ? "" : "s"));
  }

  function load() {
    setStatus("Loading captures…");
    api("GET").then(function (data) {
      if (!data.ok) { setStatus(data.error || "Could not load captures."); return; }
      state.rows = data.captures || [];
      metrics();
      render();
    }).catch(function () { setStatus("Network error — try Refresh."); });
  }

  function toggleDetail(id) {
    var detail = els.rows.querySelector('[data-detail="' + id + '"]');
    if (detail) detail.hidden = !detail.hidden;
  }

  function saveNotes(id) {
    var textarea = els.rows.querySelector('[data-notes="' + id + '"]');
    var flash = els.rows.querySelector('[data-flash="' + id + '"]');
    if (!textarea) return;
    api("PATCH", { id: Number(id), notes: textarea.value }).then(function (data) {
      if (flash) flash.textContent = data.ok ? "Saved ✓" : (data.error || "Failed");
      if (data.ok) {
        var row = state.rows.find(function (r) { return String(r.id) === String(id); });
        if (row) row.notes = textarea.value;
      }
    }).catch(function () { if (flash) flash.textContent = "Network error"; });
  }

  function deleteCapture(id) {
    var row = state.rows.find(function (r) { return String(r.id) === String(id); });
    var name = row && (row.product || row.description) || "this capture";
    if (!confirm('Delete "' + String(name).slice(0, 80) + '"? This cannot be undone.')) return;
    api("DELETE", { id: Number(id) }).then(function (data) {
      if (!data.ok) { setStatus(data.error || "Delete failed."); return; }
      state.rows = state.rows.filter(function (r) { return String(r.id) !== String(id); });
      metrics();
      render();
    }).catch(function () { setStatus("Network error — try again."); });
  }

  function exportCsv() {
    var headers = ["Captured at", "Brand name", "Product", "Description", "Cost", "Currency", "Location", "Supplier", "MOQ", "Source site", "Product URL", "Image URL", "Other info", "Notes", "Captured by"];
    var keys = ["captured_at", "brand", "product", "description", "cost", "currency", "location", "supplier", "moq", "source", "url", "image", "other", "notes", "created_by"];
    var quote = function (value) { return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"'; };
    var lines = [headers.map(quote).join(",")];
    filtered().forEach(function (row) {
      lines.push(keys.map(function (key) { return quote(row[key]); }).join(","));
    });
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "product-captures-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 500);
  }

  els.rows.addEventListener("click", function (event) {
    var target = event.target;
    if (target.closest("a") || target.closest("textarea")) return;
    var save = target.closest("[data-save]");
    if (save) { saveNotes(save.getAttribute("data-save")); return; }
    var del = target.closest("[data-delete]");
    if (del) { deleteCapture(del.getAttribute("data-delete")); return; }
    var open = target.closest("[data-open]");
    if (open) { toggleDetail(open.getAttribute("data-open")); return; }
    var row = target.closest(".cap-row");
    if (row) toggleDetail(row.getAttribute("data-id"));
  });

  els.search.addEventListener("input", function () { state.q = els.search.value; render(); });
  els.refresh.addEventListener("click", load);
  els.exportBtn.addEventListener("click", exportCsv);

  load();
})();
