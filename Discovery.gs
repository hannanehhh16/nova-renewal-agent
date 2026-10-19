/**
 * Dynamic customer discovery.
 * Every run reads the live used range. New columns and new date rows
 * are picked up automatically. No customer registry exists.
 */

function loadCustomersFromSpreadsheet(ss, sheetName, category, errors) {
  var sheet = resolveSheet_(ss, sheetName);
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  if (lastCol < 1 || lastRow < 1) return [];

  var values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  return discoverCustomersFromValues(values, {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheetId: sheet.getSheetId(),
    sheetName: sheet.getName(),
    category: category
  }, errors);
}

function resolveSheet_(ss, sheetName) {
  if (sheetName) {
    var named = ss.getSheetByName(sheetName);
    if (!named) {
      throw new Error('کاربرگ «' + sheetName + '» در اسپردشیت «' + ss.getName() + '» پیدا نشد');
    }
    return named;
  }
  var sheets = ss.getSheets().filter(function(s) { return !s.isSheetHidden(); });
  if (sheets.length !== 1) {
    throw new Error('نام کاربرگ برای «' + ss.getName() + '» مبهم است؛ SUPPORT_SHEET_NAME / SEO_SHEET_NAME را تنظیم کنید. تعداد کاربرگ‌های قابل‌مشاهده: ' + sheets.length);
  }
  return sheets[0];
}

function discoverCustomersFromValues(values, context, errors) {
  var customers = [];
  if (!values || !values.length || !values[0] || !values[0].length) return customers;

  var width = values[0].length;
  var height = values.length;
  var ctx = context || {};

  for (var col = 0; col < width; col++) {
    var header = String(values[0][col] == null ? '' : values[0][col]).trim();
    if (!header) continue;

    var dates = [];
    var seen = {};
    for (var row = 1; row < height; row++) {
      var raw = String(values[row][col] == null ? '' : values[row][col]).trim();
      if (!raw) continue;
      var parsed = parseJalaliDate(raw);
      if (!parsed) {
        if (errors) errors.push('تاریخ شمسی نامعتبر: ' + (ctx.spreadsheetName || ctx.category) +
          ' / ' + (ctx.sheetName || '') + ' / ستون ' + (col + 1) +
          ' / ردیف ' + (row + 1) + ' / مقدار: «' + raw.slice(0, 100) + '»');
        continue;
      }
      var key = formatJalaliIso(parsed);
      if (seen[key]) continue;
      seen[key] = true;
      dates.push(parsed);
    }

    customers.push({
      header: header,
      domain: extractDomain(header),
      columnIndex: col + 1,
      dates: dates,
      spreadsheetId: ctx.spreadsheetId || '',
      spreadsheetName: ctx.spreadsheetName || '',
      sheetId: ctx.sheetId == null ? '' : ctx.sheetId,
      sheetName: ctx.sheetName || '',
      category: ctx.category || ''
    });
  }
  return customers;
}

function extractDomain(header) {
  var text = String(header || '').trim();
  var match = text.match(/[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z]{2,})+/);
  return match ? match[0].toLowerCase() : '';
}

function buildEventId(parts) {
  return [
    'v1',
    parts.spreadsheetId,
    String(parts.sheetId),
    parts.category,
    'col:' + String(parts.columnIndex),
    formatJalaliIso(parts.date),
    'd' + String(parts.interval)
  ].join('|');
}

function buildReminderEvents(customers, reminderDays, today) {
  var events = [];
  (customers || []).forEach(function(customer) {
    (customer.dates || []).forEach(function(date) {
      var g = jalaliToGregorian(date.y, date.m, date.d);
      var remaining = daysBetweenGregorian(today, { y: g.gy, m: g.gm, d: g.gd });
      (reminderDays || []).forEach(function(interval) {
        events.push({
          eventId: buildEventId({
            spreadsheetId: customer.spreadsheetId,
            sheetId: customer.sheetId,
            category: customer.category,
            columnIndex: customer.columnIndex,
            date: date,
            interval: interval
          }),
          customer: customer,
          date: date,
          gregorian: g,
          remaining: remaining,
          interval: interval,
          dueToday: remaining === interval
        });
      });
    });
  });
  return events;
}

function shouldDeliverEvent(event, index) {
  if (!event) return false;
  var logIndex = index || createMemoryLogIndex();
  if (logIndex.sent[event.eventId]) return false;
  if (event.dueToday) return true;
  // Retry failed reminders only before or on the deadline; no overdue notifications by default.
  if (logIndex.failed[event.eventId] &&
      event.remaining >= 0 && event.remaining < event.interval) return true;
  return false;
}
