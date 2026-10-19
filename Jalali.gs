/**
 * Jalali (Persian) calendar helpers.
 * Conversion algorithm from jalaali-js (MIT).
 */

var JALALI_YEAR_MIN = 1200;
var JALALI_YEAR_MAX = 1599;
var JALALI_BREAKS_ = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
  1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178
];

function normalizeDigits(value) {
  var persian = '۰۱۲۳۴۵۶۷۸۹';
  var arabic = '٠١٢٣٤٥٦٧٨٩';
  return String(value == null ? '' : value).replace(/[۰-۹٠-٩]/g, function(ch) {
    var i = persian.indexOf(ch);
    if (i >= 0) return String(i);
    i = arabic.indexOf(ch);
    return i >= 0 ? String(i) : ch;
  });
}

function toPersianDigits(value) {
  var persian = '۰۱۲۳۴۵۶۷۸۹';
  return String(value).replace(/\d/g, function(ch) {
    return persian[Number(ch)];
  });
}

function parseJalaliDate(raw) {
  if (raw == null) return null;
  var s = normalizeDigits(String(raw).trim());
  if (!s) return null;
  s = s.replace(/[–—.]/g, '-');
  var match = s.match(/^(\d{1,4})[-\/](\d{1,2})[-\/](\d{1,4})$/);
  if (!match) return null;

  var a = Number(match[1]);
  var b = Number(match[2]);
  var c = Number(match[3]);
  var y;
  var m;
  var d;

  if (a >= JALALI_YEAR_MIN && a <= JALALI_YEAR_MAX) {
    y = a;
    m = b;
    d = c;
  } else if (c >= JALALI_YEAR_MIN && c <= JALALI_YEAR_MAX) {
    y = c;
    if (a > 12) {
      d = a;
      m = b;
    } else if (b > 12) {
      m = a;
      d = b;
    } else {
      d = a;
      m = b;
    }
  } else {
    return null;
  }

  if (!isValidJalaliDate(y, m, d)) return null;
  return { y: y, m: m, d: d };
}

function isValidJalaliDate(jy, jm, jd) {
  return jy >= JALALI_YEAR_MIN && jy <= JALALI_YEAR_MAX &&
    jm >= 1 && jm <= 12 &&
    jd >= 1 && jd <= jalaliMonthLength(jy, jm);
}

function isLeapJalaaliYear(jy) {
  return jalCalLeap_(jy) === 0;
}

function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaaliYear(jy) ? 30 : 29;
}

function jalaliToGregorian(jy, jm, jd) {
  return jalaliD2g_(jalaliJ2d_(jy, jm, jd));
}

function gregorianToJalali(gy, gm, gd) {
  var g = jalaliG2d_(gy, gm, gd);
  var year = gy - 621;
  var r = jalCal_(year, false);
  var farvardin = jalaliG2d_(gy, 3, r.march);
  var k = g - farvardin;
  var month;
  var day;
  if (k >= 0) {
    if (k <= 185) {
      month = 1 + jalDiv_(k, 31);
      day = jalMod_(k, 31) + 1;
      return { y: year, m: month, d: day };
    }
    k -= 186;
  } else {
    year -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  month = 7 + jalDiv_(k, 30);
  day = jalMod_(k, 30) + 1;
  return { y: year, m: month, d: day };
}

function daysBetweenGregorian(from, to) {
  return jalaliG2d_(to.y, to.m, to.d) - jalaliG2d_(from.y, from.m, from.d);
}

function tehranTodayGregorian() {
  var s = Utilities.formatDate(new Date(), SCRIPT_TZ, 'yyyy-MM-dd');
  var parts = s.split('-');
  return { y: Number(parts[0]), m: Number(parts[1]), d: Number(parts[2]) };
}

function formatJalaliDisplay(date) {
  return toPersianDigits(
    date.y + '/' + pad2_(date.m) + '/' + pad2_(date.d)
  );
}

function formatJalaliIso(date) {
  return date.y + '-' + pad2_(date.m) + '-' + pad2_(date.d);
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function jalDiv_(a, b) {
  return ~~(a / b);
}

function jalMod_(a, b) {
  return a - ~~(a / b) * b;
}

function jalCalLeap_(jy) {
  var bl = JALALI_BREAKS_.length;
  var jp = JALALI_BREAKS_[0];
  var jm;
  var jump = 0;
  var leap;
  var n;
  var i;

  if (jy < jp || jy >= JALALI_BREAKS_[bl - 1]) {
    throw new Error('Invalid Jalaali year ' + jy);
  }

  for (i = 1; i < bl; i += 1) {
    jm = JALALI_BREAKS_[i];
    jump = jm - jp;
    if (jy < jm) break;
    jp = jm;
  }
  n = jy - jp;

  if (jump - n < 6) {
    n = n - jump + jalDiv_(jump + 4, 33) * 33;
  }
  leap = jalMod_(jalMod_(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return leap;
}

function jalCal_(jy, withoutLeap) {
  var bl = JALALI_BREAKS_.length;
  var gy = jy + 621;
  var leapJ = -14;
  var jp = JALALI_BREAKS_[0];
  var jm;
  var jump = 0;
  var leap;
  var leapG;
  var march;
  var n;
  var i;

  if (jy < jp || jy >= JALALI_BREAKS_[bl - 1]) {
    throw new Error('Invalid Jalaali year ' + jy);
  }

  for (i = 1; i < bl; i += 1) {
    jm = JALALI_BREAKS_[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + jalDiv_(jump, 33) * 8 + jalDiv_(jalMod_(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;

  leapJ = leapJ + jalDiv_(n, 33) * 8 + jalDiv_(jalMod_(n, 33) + 3, 4);
  if (jalMod_(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  leapG = jalDiv_(gy, 4) - jalDiv_((jalDiv_(gy, 100) + 1) * 3, 4) - 150;
  march = 20 + leapJ - leapG;
  if (withoutLeap) return { gy: gy, march: march };

  if (jump - n < 6) {
    n = n - jump + jalDiv_(jump + 4, 33) * 33;
  }
  leap = jalMod_(jalMod_(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap: leap, gy: gy, march: march };
}

function jalaliJ2d_(jy, jm, jd) {
  var r = jalCal_(jy, true);
  return jalaliG2d_(r.gy, 3, r.march) + (jm - 1) * 31 - jalDiv_(jm, 7) * (jm - 7) + jd - 1;
}

function jalaliG2d_(gy, gm, gd) {
  var d = jalDiv_((gy + jalDiv_(gm - 8, 6) + 100100) * 1461, 4) +
    jalDiv_(153 * jalMod_(gm + 9, 12) + 2, 5) +
    gd - 34840408;
  d = d - jalDiv_(jalDiv_(gy + 100100 + jalDiv_(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function jalaliD2g_(jdn) {
  var j = 4 * jdn + 139361631;
  j = j + jalDiv_(jalDiv_(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  var i = jalDiv_(jalMod_(j, 1461), 4) * 5 + 308;
  var gd = jalDiv_(jalMod_(i, 153), 5) + 1;
  var gm = jalMod_(jalDiv_(i, 153), 12) + 1;
  var gy = jalDiv_(j, 1461) - 100100 + jalDiv_(8 - gm, 6);
  return { gy: gy, gm: gm, gd: gd };
}
