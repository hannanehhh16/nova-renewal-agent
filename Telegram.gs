var TELEGRAM_LIMIT = 3900;
var CATEGORY_TITLE = {
  support: '🛠 تمدید پشتیبانی',
  seo: '🔎 تمدید سئو'
};
var CATEGORY_ORDER = ['support', 'seo'];

function sendTestTelegram() {
  var result = sendTelegramMessage('✅ ربات یادآور تمدید فعال است.');
  Logger.log(JSON.stringify(result));
  return result;
}

function sendTelegramMessage(text, optConfig) {
  var config = optConfig || loadConfig();
  if (!text) return { ok: false, error: 'empty message' };

  var url = 'https://api.telegram.org/bot' + config.telegramBotToken + '/sendMessage';
  var payload = {
    chat_id: config.telegramChatId,
    text: text,
    disable_web_page_preview: true
  };

  var last = { ok: false, error: 'unknown' };
  for (var attempt = 0; attempt < 3; attempt++) {
    last = sendTelegramOnce_(url, payload);
    // Network errors sometimes contain the request URL. Never leak the bot token to logs.
    if (last.error) last.error = String(last.error).split(config.telegramBotToken).join('[REDACTED]');
    if (last.ok) return last;
    if (!isRetryableTelegramError_(last) || attempt === 2) return last;
    Utilities.sleep(1000 * (attempt + 1));
  }
  return last;
}

function sendTelegramOnce_(url, payload) {
  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    var bodyText = response.getContentText();
    var body = {};
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      return { ok: false, status: code, error: bodyText || e.message };
    }
    if (code === 200 && body.ok) {
      return {
        ok: true,
        status: code,
        messageId: body.result && body.result.message_id
      };
    }
    return {
      ok: false,
      status: code,
      error: body.description || bodyText || ('HTTP ' + code)
    };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function isRetryableTelegramError_(result) {
  if (!result) return false;
  if (result.status === 0) return true;
  if (result.status === 429) return true;
  return result.status >= 500;
}

function discoverTelegramChatId() {
  var config = loadConfig({ requireTelegram: false });
  if (!config.telegramBotToken) throw new Error('ابتدا TELEGRAM_BOT_TOKEN را در Script Properties ثبت کنید');
  // Send /start to your bot in a private chat before running this function.
  var url = 'https://api.telegram.org/bot' + config.telegramBotToken + '/getUpdates';
  var response;
  try {
    response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) {
    throw new Error('ارتباط با تلگرام ناموفق بود؛ وضعیت اتصال را بررسی کنید');
  }
  var body;
  try { body = JSON.parse(response.getContentText()); }
  catch (e) { throw new Error('پاسخ نامعتبر از تلگرام'); }
  if (response.getResponseCode() !== 200 || !body.ok) {
    throw new Error('getUpdates موفق نبود؛ مطمئن شوید ربات ساخته شده و webhook فعال نیست');
  }
  var seen = {};
  var chats = [];
  (body.result || []).forEach(function(update) {
    var chat = (update.message || update.edited_message || {}).chat;
    if (!chat || chat.type !== 'private') return;
    var id = String(chat.id);
    if (seen[id]) return;
    seen[id] = true;
    chats.push({ chatId: id, username: chat.username || '', firstName: chat.first_name || '' });
  });
  Logger.log(JSON.stringify(chats));
  return chats;
}

function remainingLabel(days) {
  if (days === 0) return '🔴 موعد تمدید امروز';
  if (days < 0) return '🔴 موعد تمدید گذشته';
  return '⏳ ' + toPersianDigits(days) + ' روز باقی‌مانده';
}

function formatCustomerBlock(event) {
  return [
    '👤 ' + event.customer.header,
    '📅 ' + formatJalaliDisplay(event.date),
    remainingLabel(event.remaining)
  ].join('\n');
}

function compareEvents(a, b) {
  if (a.remaining !== b.remaining) return a.remaining - b.remaining;
  var ha = a.customer.header;
  var hb = b.customer.header;
  if (ha < hb) return -1;
  if (ha > hb) return 1;
  return formatJalaliIso(a.date) < formatJalaliIso(b.date) ? -1 : 1;
}

function splitReportChunks(events) {
  if (!events || !events.length) return [];

  var grouped = { support: [], seo: [] };
  events.forEach(function(ev) {
    if (!grouped[ev.customer.category]) grouped[ev.customer.category] = [];
    grouped[ev.customer.category].push(ev);
  });

  var blocks = [];
  CATEGORY_ORDER.forEach(function(category) {
    var list = grouped[category] || [];
    if (!list.length) return;
    list.sort(compareEvents);
    blocks.push({
      text: CATEGORY_TITLE[category] || category,
      events: []
    });
    // Multiple failed/regular intervals for the same date must result in ONE customer block.
    var byContract = {};
    list.forEach(function(ev) {
      var key = ev.customer.spreadsheetId + '|' + ev.customer.sheetId + '|' +
        ev.customer.columnIndex + '|' + formatJalaliIso(ev.date);
      if (!byContract[key]) {
        byContract[key] = { text: formatCustomerBlock(ev), events: [] };
        blocks.push(byContract[key]);
      }
      byContract[key].events.push(ev);
    });
  });

  var header = '🔔 گزارش تمدید قراردادها';
  var chunks = [];
  var currentText = header;
  var currentEvents = [];

  function flush() {
    if (currentText === header) return;
    chunks.push({
      text: currentText.trim(),
      events: currentEvents.slice()
    });
    currentText = header;
    currentEvents = [];
  }

  blocks.forEach(function(block) {
    var next = currentText + '\n\n' + block.text;
    if (next.length > TELEGRAM_LIMIT && currentEvents.length) {
      flush();
      currentText = header + '\n\n' + block.text;
      currentEvents = block.events.slice();
    } else {
      currentText = next;
      currentEvents = currentEvents.concat(block.events);
    }
  });
  flush();
  return chunks;
}

function formatErrorReport(errors, today) {
  var lines = ['⚠️ خطا در سامانه یادآور تمدید'];
  if (today) {
    lines.push('📅 ' + formatJalaliDisplay(gregorianToJalali(today.y, today.m, today.d)));
  }
  lines.push('');
  (errors || []).forEach(function(err) {
    lines.push('• ' + err);
  });
  return lines.join('\n');
}
