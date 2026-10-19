var LOG_SHEET_NAME = 'DeliveryLog';
var PREVIEW_SHEET_NAME = 'Preview';
var LOG_HEADERS = [
  'EventId',
  'Status',
  'Timestamp',
  'Category',
  'Customer',
  'Column',
  'JalaliDate',
  'IntervalDays',
  'Details'
];

function createMemoryLogIndex() {
  return { sent: {}, failed: {} };
}

function rememberDelivery(index, eventId, status) {
  if (!index || !eventId) return;
  if (status === 'SENT') {
    index.sent[eventId] = true;
    delete index.failed[eventId];
  } else if (status === 'FAILED') {
    index.failed[eventId] = true;
    delete index.sent[eventId];
  }
}

function ensureLogSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LOG_SPREADSHEET_ID');
  if (id) {
    // Never reset history silently: that could resend every previously delivered reminder.
    var existing = SpreadsheetApp.openById(id);
    var log = existing.getSheetByName(LOG_SHEET_NAME);
    if (!log || log.getLastRow() === 0) {
      throw new Error('فایل سوابق وجود دارد اما DeliveryLog در آن پیدا نشد. ارسال متوقف شد تا از پیام تکراری جلوگیری شود.');
    }
    return existing;
  }

  var created = SpreadsheetApp.create('Renewal Reminder Log (internal)');
  getDeliveryLogSheet(created);
  props.setProperty('LOG_SPREADSHEET_ID', created.getId());
  return created;
}

function getDeliveryLogSheet(ss) {
  var sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    var first = ss.getSheets()[0];
    if (first && ss.getSheets().length === 1 && first.getLastRow() === 0) {
      sheet = first;
      sheet.setName(LOG_SHEET_NAME);
    } else {
      sheet = ss.insertSheet(LOG_SHEET_NAME);
    }
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function loadLogIndex(sheet) {
  var index = createMemoryLogIndex();
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) throw new Error('DeliveryLog فاقد سربرگ است');
  var head = sheet.getRange(1, 1, 1, 2).getDisplayValues()[0];
  if (head[0] !== 'EventId' || head[1] !== 'Status') {
    throw new Error('ساختار فایل DeliveryLog نادرست است؛ ارسال برای پیشگیری از پیام تکراری متوقف شد');
  }
  if (lastRow < 2) return index;

  var data = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  data.forEach(function(row) {
    var eventId = String(row[0] || '').trim();
    var status = String(row[1] || '').trim();
    if (!eventId) return;
    rememberDelivery(index, eventId, status);
  });
  return index;
}

function persistEvents(sheet, index, events, status, delivery) {
  if (!sheet || !events || !events.length) return;
  var now = Utilities.formatDate(new Date(), SCRIPT_TZ, 'yyyy-MM-dd HH:mm:ss');
  var detail = '';
  if (delivery) {
    detail = delivery.ok ? String(delivery.messageId || 'ok') : String(delivery.error || 'failed');
  }
  var rows = events.map(function(ev) {
    return [
      ev.eventId,
      status,
      now,
      ev.customer.category,
      ev.customer.header,
      ev.customer.columnIndex,
      formatJalaliIso(ev.date),
      ev.interval,
      detail
    ];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LOG_HEADERS.length).setValues(rows);
  events.forEach(function(ev) {
    rememberDelivery(index, ev.eventId, status);
  });
}

function writePreviewSheet(ss, customers, events, toDeliver, today, errors) {
  var sheet = ss.getSheetByName(PREVIEW_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(PREVIEW_SHEET_NAME);
  sheet.clear();

  var generated = Utilities.formatDate(new Date(), SCRIPT_TZ, 'yyyy-MM-dd HH:mm:ss');
  var notifyIds = {};
  (toDeliver || []).forEach(function(ev) {
    notifyIds[ev.eventId] = true;
  });

  var rows = [[
    'GeneratedAt',
    'Category',
    'Spreadsheet',
    'SpreadsheetId',
    'Sheet',
    'SheetId',
    'Column',
    'Customer',
    'Domain',
    'JalaliDate',
    'DaysRemaining',
    'WouldNotify',
    'EventId'
  ]];

  (customers || []).forEach(function(customer) {
    if (!customer.dates.length) {
      rows.push([
        generated,
        customer.category,
        customer.spreadsheetName,
        customer.spreadsheetId,
        customer.sheetName,
        customer.sheetId,
        customer.columnIndex,
        customer.header,
        customer.domain,
        '',
        '',
        'NO',
        ''
      ]);
      return;
    }
    customer.dates.forEach(function(date) {
      var related = (events || []).filter(function(ev) {
        return ev.customer === customer && formatJalaliIso(ev.date) === formatJalaliIso(date);
      });
      var remaining = related.length ? related[0].remaining : '';
      var would = related.some(function(ev) { return notifyIds[ev.eventId]; }) ? 'YES' : 'NO';
      var eventId = related.filter(function(ev) { return notifyIds[ev.eventId]; })
        .map(function(ev) { return ev.eventId; })
        .join(' ; ');
      rows.push([
        generated,
        customer.category,
        customer.spreadsheetName,
        customer.spreadsheetId,
        customer.sheetName,
        customer.sheetId,
        customer.columnIndex,
        customer.header,
        customer.domain,
        formatJalaliIso(date),
        remaining,
        would,
        eventId
      ]);
    });
  });

  if (errors && errors.length) {
    rows.push([]);
    rows.push(['Errors']);
    errors.forEach(function(err) {
      rows.push([err]);
    });
  }

  var padded = padPreviewRows_(rows);
  sheet.getRange(1, 1, padded.length, padded[0].length).setValues(padded);
  sheet.setFrozenRows(1);
}

function padPreviewRows_(rows) {
  var width = 0;
  rows.forEach(function(row) {
    if (row.length > width) width = row.length;
  });
  return rows.map(function(row) {
    var copy = row.slice();
    while (copy.length < width) copy.push('');
    return copy;
  });
}
