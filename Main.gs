/**
 * Daily renewal reminders for Support and SEO spreadsheets.
 *
 * Public functions:
 *   install()
 *   runDailyReminders()
 *   previewReminders()
 *   setupDailyTrigger()
 *   sendTestTelegram()
 *   runAllTests()
 *   showConfigStatus()
 */

function install() {
  loadConfig({ requireTelegram: true });
  var tests = runAllTests();
  if (tests.some(function(line) { return line.indexOf('FAIL ') === 0; })) {
    throw new Error('Self-tests failed; no scheduled trigger installed');
  }
  var preview = previewReminders();
  if (!preview.ok) {
    throw new Error('Spreadsheet preview failed; no scheduled trigger installed: ' + preview.errors.join(' ; '));
  }
  ensureLogSpreadsheet();
  setupDailyTrigger();
  Logger.log('Install complete');
  return { tests: tests, preview: preview };
}

function runDailyReminders() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) {
    Logger.log('runDailyReminders: another execution holds the lock');
    return { ok: false, error: 'LOCK_BUSY' };
  }
  try {
    return executeReminderRun_({
      sendTelegram: true,
      persistLog: true,
      mode: 'daily'
    });
  } finally {
    lock.releaseLock();
  }
}

function previewReminders() {
  return executeReminderRun_({
    sendTelegram: false,
    persistLog: false,
    mode: 'preview'
  });
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'runDailyReminders') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('runDailyReminders')
    .timeBased()
    .atHour(9)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(SCRIPT_TZ)
    .create();
  Logger.log('Daily trigger set for ~09:00 Asia/Tehran');
}

function executeReminderRun_(options) {
  var sendTelegram = !!(options && options.sendTelegram);
  var persistLog = !!(options && options.persistLog);
  var mode = (options && options.mode) || 'daily';
  var errors = [];
  var config;

  try {
    config = loadConfig({ requireTelegram: sendTelegram });
  } catch (e) {
    errors.push(e.message);
    Logger.log(e.message);
    if (sendTelegram) {
      try {
        sendTelegramMessage('⚠️ خطا در سامانه یادآور تمدید\n\n' + e.message);
      } catch (ignored) {}
    }
    return { ok: false, errors: errors };
  }

  var today = tehranTodayGregorian();
  var customers = [];
  var sources = [
    {
      category: 'support',
      spreadsheetId: config.supportSpreadsheetId,
      sheetName: config.supportSheetName
    },
    {
      category: 'seo',
      spreadsheetId: config.seoSpreadsheetId,
      sheetName: config.seoSheetName
    }
  ];

  sources.forEach(function(source) {
    try {
      var ss = SpreadsheetApp.openById(source.spreadsheetId);
      var found = loadCustomersFromSpreadsheet(ss, source.sheetName, source.category, errors);
      found.forEach(function(customer) {
        customers.push(customer);
      });
    } catch (e) {
      errors.push(source.category + ': ' + e.message);
    }
  });

  var events = buildReminderEvents(customers, config.reminderDays, today);
  var logIndex = createMemoryLogIndex();
  var logSs = null;
  var logSheet = null;

  if (persistLog) {
    try {
      logSs = ensureLogSpreadsheet();
      logSheet = getDeliveryLogSheet(logSs);
      logIndex = loadLogIndex(logSheet);
    } catch (e) {
      errors.push('log: ' + e.message);
      if (sendTelegram) {
        try {
          sendTelegramMessage(formatErrorReport(errors, today));
        } catch (ignored) {}
      }
      return {
        ok: false,
        errors: errors,
        customers: summarizeCustomers_(customers),
        delivered: 0
      };
    }
  } else if (config.logSpreadsheetId) {
    // Preview is read-only; never create a log file or a Preview tab.
    try {
      logSs = SpreadsheetApp.openById(config.logSpreadsheetId);
      logSheet = logSs.getSheetByName(LOG_SHEET_NAME);
      if (!logSheet) throw new Error('DeliveryLog یافت نشد');
      logIndex = loadLogIndex(logSheet);
    } catch (e) {
      errors.push('خواندن سابقه در پیش‌نمایش ناموفق بود: ' + e.message);
    }
  }

  var toDeliver = events.filter(function(event) {
    return shouldDeliverEvent(event, logIndex);
  });

  if (mode === 'preview') {
    var previewText = formatPreviewReport_(customers, events, toDeliver, today, errors);
    Logger.log(previewText);
    return {
      ok: errors.length === 0,
      errors: errors,
      customers: summarizeCustomers_(customers),
      wouldNotify: toDeliver.map(summarizeEvent_),
      preview: previewText
    };
  }

  var deliveredCount = 0;
  if (toDeliver.length && sendTelegram) {
    var chunks = splitReportChunks(toDeliver);
    chunks.forEach(function(chunk) {
      Logger.log(chunk.text);
      var delivery = sendTelegramMessage(chunk.text, config);
      var status = delivery.ok ? 'SENT' : 'FAILED';
      if (delivery.ok) deliveredCount += chunk.events.length;
      else errors.push('telegram: ' + delivery.error);
      if (logSheet) persistEvents(logSheet, logIndex, chunk.events, status, delivery);
    });
  }

  if (errors.length && sendTelegram) {
    try {
      sendTelegramMessage(formatErrorReport(errors, today), config);
    } catch (e) {
      Logger.log('Could not send error report: ' + e.message);
    }
  }

  return {
    ok: errors.length === 0,
    errors: errors,
    customers: summarizeCustomers_(customers),
    dueCount: toDeliver.length,
    delivered: deliveredCount
  };
}

function summarizeCustomers_(customers) {
  return (customers || []).map(function(customer) {
    return {
      category: customer.category,
      spreadsheet: customer.spreadsheetName,
      spreadsheetId: customer.spreadsheetId,
      sheet: customer.sheetName,
      column: customer.columnIndex,
      header: customer.header,
      domain: customer.domain,
      dates: customer.dates.map(formatJalaliIso)
    };
  });
}

function summarizeEvent_(event) {
  return {
    eventId: event.eventId,
    category: event.customer.category,
    header: event.customer.header,
    date: formatJalaliIso(event.date),
    remaining: event.remaining,
    interval: event.interval
  };
}

function formatPreviewReport_(customers, events, toDeliver, today, errors) {
  var lines = [];
  lines.push('پیش‌نمایش کشف مشتریان و تمدیدها');
  lines.push('امروز (تهران): ' + today.y + '-' + pad2_(today.m) + '-' + pad2_(today.d));
  lines.push('تعداد مشتری کشف‌شده: ' + customers.length);
  lines.push('یادآورهای آماده‌ارسال: ' + toDeliver.length);
  lines.push('');

  var byCategory = { support: [], seo: [] };
  customers.forEach(function(customer) {
    if (!byCategory[customer.category]) byCategory[customer.category] = [];
    byCategory[customer.category].push(customer);
  });

  CATEGORY_ORDER.forEach(function(category) {
    var list = byCategory[category] || [];
    lines.push(CATEGORY_TITLE[category] || category);
    if (!list.length) {
      lines.push('  (موردی نیست)');
      lines.push('');
      return;
    }
    list.forEach(function(customer) {
      lines.push('  ستون ' + customer.columnIndex + ' | ' + customer.header);
      lines.push('  منبع: ' + (customer.spreadsheetName || customer.spreadsheetId));
      if (!customer.dates.length) {
        lines.push('    بدون تاریخ معتبر');
        return;
      }
      customer.dates.forEach(function(date) {
        var sample = events.filter(function(ev) {
          return ev.customer === customer && formatJalaliIso(ev.date) === formatJalaliIso(date);
        })[0];
        var remaining = sample ? sample.remaining : '?';
        lines.push('    ' + formatJalaliIso(date) + ' | ' + remaining + ' روز');
      });
    });
    lines.push('');
  });

  if (toDeliver.length) {
    lines.push('یادآورهایی که امروز ارسال می‌شدند:');
    toDeliver.forEach(function(ev) {
      lines.push('  - ' + ev.customer.category + ' | ' + ev.customer.header + ' | ' +
        formatJalaliIso(ev.date) + ' | d' + ev.interval);
    });
  }

  if (errors && errors.length) {
    lines.push('');
    lines.push('خطاها:');
    errors.forEach(function(err) {
      lines.push('  - ' + err);
    });
  }
  return lines.join('\n');
}
