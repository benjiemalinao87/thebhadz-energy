/**
 * MACC Product Capture — Google Sheet receiver.
 *
 * Install: open the target Google Sheet → Extensions → Apps Script → replace the
 * placeholder code with this file → save → Deploy → New deployment → type "Web app"
 * → Execute as: Me → Who has access: Anyone → Deploy. Copy the /exec URL into the
 * extension's settings page.
 *
 * After ANY later edit to this file: Deploy → Manage deployments → ✏️ →
 * Version: "New version" — the /exec URL keeps serving the old code until you do.
 *
 * The URL accepts anonymous POSTs (that is how the extension reaches it without
 * OAuth), so treat it like a password. Optionally set SECRET below and put the
 * same value in the extension settings; requests without it are rejected.
 */

var SHEET_NAME = 'Products';
var SECRET = ''; // optional shared secret; must match the extension setting if set

// [row key sent by the extension, column header shown in the sheet] — reorder or
// relabel here (then redeploy a new version); the extension sends named fields, so
// column order lives only in this file.
var COLUMNS = [
  ['capturedAt', 'Captured at'],
  ['brand', 'Brand name'],
  ['product', 'Product'],
  ['description', 'Description'],
  ['cost', 'Cost'],
  ['currency', 'Currency'],
  ['location', 'Location'],
  ['supplier', 'Supplier'],
  ['moq', 'MOQ'],
  ['source', 'Source site'],
  ['url', 'Product URL'],
  ['image', 'Image URL'],
  ['other', 'Other info'],
  ['notes', 'Notes']
];

function doGet() {
  return json_({ ok: true, service: 'MACC Product Capture', sheet: SHEET_NAME });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SECRET && body.secret !== SECRET) return json_({ ok: false, error: 'Bad secret' });

    var rows = Array.isArray(body.rows) ? body.rows : [];
    if (body.test) rows = rows.concat([testRow_()]);
    if (!rows.length) return json_({ ok: false, error: 'No rows in payload' });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = ensureSheet_();
      var values = rows.map(function (r) {
        return COLUMNS.map(function (c) { return String((r && r[c[0]]) || ''); });
      });
      sheet.getRange(sheet.getLastRow() + 1, 1, values.length, COLUMNS.length).setValues(values);
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true, added: rows.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function ensureSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    var headers = COLUMNS.map(function (c) { return c[1]; });
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function testRow_() {
  return {
    capturedAt: new Date().toISOString(),
    product: 'TEST — connection check',
    description: 'Sent from the extension settings page. Safe to delete this row.',
    source: 'extension-settings'
  };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
