/**
 * Script Properties:
 *   SUPPORT_SPREADSHEET_ID  (required)
 *   SEO_SPREADSHEET_ID      (required)
 *   TELEGRAM_BOT_TOKEN      (required for sending)
 *   TELEGRAM_CHAT_ID        (required for sending)
 *   SUPPORT_SHEET_NAME      (optional; default: first worksheet)
 *   SEO_SHEET_NAME          (optional; default: first worksheet)
 *   REMINDER_DAYS           (optional; default: 7,3,1,0)
 *   LOG_SPREADSHEET_ID      (optional; created automatically)
 */

var DEFAULT_REMINDER_DAYS = [7, 3, 1, 0];
var SCRIPT_TZ = 'Asia/Tehran';

function loadConfig(options) {
  var opts = options || {};
  var requireTelegram = opts.requireTelegram !== false;
  var props = PropertiesService.getScriptProperties();

  function get(key, required) {
    var value = props.getProperty(key);
    if (required && (!value || !String(value).trim())) {
      throw new Error('ویژگی اسکریپت تنظیم نشده است: ' + key);
    }
    return value ? String(value).trim() : '';
  }

  return {
    supportSpreadsheetId: get('SUPPORT_SPREADSHEET_ID', true),
    seoSpreadsheetId: get('SEO_SPREADSHEET_ID', true),
    telegramBotToken: get('TELEGRAM_BOT_TOKEN', requireTelegram),
    telegramChatId: get('TELEGRAM_CHAT_ID', requireTelegram),
    supportSheetName: get('SUPPORT_SHEET_NAME', false),
    seoSheetName: get('SEO_SHEET_NAME', false),
    logSpreadsheetId: get('LOG_SPREADSHEET_ID', false),
    reminderDays: parseReminderDays_(get('REMINDER_DAYS', false))
  };
}

function parseReminderDays_(raw) {
  if (!raw) return DEFAULT_REMINDER_DAYS.slice();
  var parts = normalizeDigits(String(raw)).split(/[,\s]+/).filter(function(part) {
    return part !== '';
  });
  var days = [];
  var seen = {};
  parts.forEach(function(part) {
    var n = Number(part);
    if (!isFinite(n) || n < 0 || n > 366 || Math.floor(n) !== n) return;
    if (seen[n]) return;
    seen[n] = true;
    days.push(n);
  });
  if (!days.length) return DEFAULT_REMINDER_DAYS.slice();
  days.sort(function(a, b) { return b - a; });
  return days;
}

function showConfigStatus() {
  var props = PropertiesService.getScriptProperties();
  var keys = [
    'SUPPORT_SPREADSHEET_ID',
    'SEO_SPREADSHEET_ID',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'SUPPORT_SHEET_NAME',
    'SEO_SHEET_NAME',
    'REMINDER_DAYS',
    'LOG_SPREADSHEET_ID'
  ];
  var lines = keys.map(function(key) {
    var value = props.getProperty(key);
    if (!value) return key + ': (unset)';
    if (key === 'TELEGRAM_BOT_TOKEN') {
      return key + ': set (…' + String(value).slice(-4) + ')';
    }
    return key + ': ' + value;
  });
  var text = lines.join('\n');
  Logger.log(text);
  return text;
}
