/**
 * Google Apps Script — Web App (POST).
 * Deploy: Web app, Execute as: Me, Who has access: Anyone (hoặc tương đương cho server gọi được).
 * Đặt WEBHOOK_SECRET trùng GOOGLE_SHEETS_APPS_SCRIPT_SECRET trên BE.
 */
var WEBHOOK_SECRET = 'PUT_SAME_SECRET_AS_BACKEND';

var TAB_RSVP = 'Xác nhận tham dự';
var TAB_WISH = 'Gửi lời chúc tới cô dâu chú rể';

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (!body.secret || body.secret !== WEBHOOK_SECRET) {
      return jsonOut({ ok: false, error: 'Unauthorized' });
    }

    var action = body.action;
    if (action === 'append') {
      return handleAppend(body);
    }
    if (!action || action === 'create') {
      return handleCreate(body);
    }
    return jsonOut({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut({
      ok: false,
      error: err && err.message ? String(err.message) : String(err),
    });
  }
}

function handleAppend(body) {
  var id = body.spreadsheetId;
  var tab = body.tab;
  var row = body.row;
  if (!id || !tab || !row || !row.length) {
    return jsonOut({ ok: false, error: 'Missing spreadsheetId, tab, or row' });
  }
  var sheetName = tab === 'rsvp' ? TAB_RSVP : tab === 'wish' ? TAB_WISH : null;
  if (!sheetName) {
    return jsonOut({ ok: false, error: 'Invalid tab (use rsvp or wish)' });
  }
  var ss = SpreadsheetApp.openById(String(id));
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return jsonOut({ ok: false, error: 'Sheet not found: ' + sheetName });
  }
  sheet.appendRow(row);
  return jsonOut({ ok: true });
}

function handleCreate(body) {
  var title = body.title || 'Guest book ' + new Date().toISOString();
  var sheets = body.sheets || [];
  var shareToEmail = body.shareToEmail ? String(body.shareToEmail).trim() : '';

  var ss = SpreadsheetApp.create(String(title));

  if (sheets.length === 0) {
    return finishCreate(ss, shareToEmail);
  }

  var first = ss.getSheets()[0];
  first.setName(String(sheets[0].title || 'Sheet1'));
  if (sheets[0].headers && sheets[0].headers.length) {
    first.getRange(1, 1, 1, sheets[0].headers.length).setValues([sheets[0].headers]]);
  }

  for (var i = 1; i < sheets.length; i++) {
    var sh = ss.insertSheet(String(sheets[i].title || 'Sheet' + (i + 1)));
    if (sheets[i].headers && sheets[i].headers.length) {
      sh.getRange(1, 1, 1, sheets[i].headers.length).setValues([sheets[i].headers]]);
    }
  }

  return finishCreate(ss, shareToEmail);
}

function finishCreate(ss, shareToEmail) {
  if (shareToEmail) {
    try {
      DriveApp.getFileById(ss.getId()).addEditor(shareToEmail);
    } catch (ignore) {}
  }
  return jsonOut({
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
  });
}
