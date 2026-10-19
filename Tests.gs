function runAllTests() {
  var tests = [
    { name: '1. six existing customer columns are detected', fn: testSixCustomersDetected_ },
    { name: '2. seventh column needs no configuration change', fn: testSeventhColumnNoConfig_ },
    { name: '3. twentieth customer is detected', fn: testTwentiethCustomer_ },
    { name: '4. customer after an empty column is detected', fn: testCustomerAfterEmptyColumn_ },
    { name: '5. new dates are detected automatically', fn: testNewDatesDetected_ },
    { name: '6. empty cells are ignored safely', fn: testEmptyCellsIgnored_ },
    { name: '7. identical names remain independent', fn: testIdenticalNamesIndependent_ },
    { name: '8. support and SEO reminders stay separate', fn: testSupportSeoSeparate_ },
    { name: '9. Jalali date calculations are correct', fn: testJalaliCalculations_ },
    { name: '10. duplicate reminders are prevented', fn: testDuplicateRemindersPrevented_ },
    { name: '11. failed Telegram deliveries can be retried', fn: testFailedTelegramRetry_ },
    { name: '12. expired contracts are not retried', fn: testExpiredFailedNotRetried_ },
    { name: '13. invalid date with trailing text is rejected', fn: testTrailingTextRejected_ },
    { name: '14. Gregorian/Jalali round trip works', fn: testRoundTrip_ },
    { name: '15. multiple reminders for one contract render only once', fn: testCombinedReminders_ }
  ];

  var results = [];
  var failed = 0;
  tests.forEach(function(test) {
    try {
      test.fn();
      results.push('PASS  ' + test.name);
    } catch (e) {
      failed += 1;
      results.push('FAIL  ' + test.name + ' — ' + e.message);
    }
  });

  var summary = failed ? (failed + ' failed') : 'all passed';
  results.push('');
  results.push(tests.length + ' tests, ' + summary);
  Logger.log(results.join('\n'));
  return results;
}

function testCtx_(category, spreadsheetId, sheetId) {
  return {
    category: category || 'support',
    spreadsheetId: spreadsheetId || 'ss-support',
    spreadsheetName: category === 'seo' ? 'SEO dead time' : 'Support dead time',
    sheetId: sheetId == null ? 101 : sheetId,
    sheetName: 'Sheet1'
  };
}

function makeGrid_(columns) {
  var width = columns.length;
  var height = 1;
  columns.forEach(function(col) {
    if (col && col.dates && col.dates.length + 1 > height) {
      height = col.dates.length + 1;
    }
  });
  var grid = [];
  for (var r = 0; r < height; r++) {
    grid[r] = [];
    for (var c = 0; c < width; c++) {
      var col = columns[c];
      if (!col) {
        grid[r][c] = '';
      } else if (r === 0) {
        grid[r][c] = col.header;
      } else {
        grid[r][c] = col.dates[r - 1] || '';
      }
    }
  }
  return grid;
}

function nCustomers_(count) {
  var columns = [];
  for (var i = 1; i <= count; i++) {
    columns.push({
      header: 'customer' + i + '.com',
      dates: ['1405-7-' + (10 + (i % 15))]
    });
  }
  return columns;
}

function testSixCustomersDetected_() {
  var customers = discoverCustomersFromValues(makeGrid_(nCustomers_(6)), testCtx_('support'));
  assertEqual_(customers.length, 6, 'expected 6 customers');
  assertEqual_(customers[0].header, 'customer1.com');
  assertEqual_(customers[5].header, 'customer6.com');
  assertEqual_(customers[5].columnIndex, 6);
}

function testSeventhColumnNoConfig_() {
  var six = discoverCustomersFromValues(makeGrid_(nCustomers_(6)), testCtx_('support'));
  var seven = discoverCustomersFromValues(makeGrid_(nCustomers_(7)), testCtx_('support'));
  assertEqual_(six.length, 6);
  assertEqual_(seven.length, 7, 'seventh column must appear without config');
  assertEqual_(seven[6].header, 'customer7.com');
  assertEqual_(seven[6].columnIndex, 7);
}

function testTwentiethCustomer_() {
  var customers = discoverCustomersFromValues(makeGrid_(nCustomers_(20)), testCtx_('support'));
  assertEqual_(customers.length, 20);
  assertEqual_(customers[19].header, 'customer20.com');
  assertEqual_(customers[19].columnIndex, 20);
}

function testCustomerAfterEmptyColumn_() {
  var grid = makeGrid_([
    { header: 'A.com', dates: ['1405-7-20'] },
    { header: 'B.com', dates: ['1405-8-15'] },
    null,
    { header: 'D.com', dates: ['1405-9-10'] },
    { header: 'E.com', dates: ['1405-10-5'] }
  ]);
  var customers = discoverCustomersFromValues(grid, testCtx_('support'));
  assertEqual_(customers.length, 4);
  assertEqual_(customers[2].header, 'D.com');
  assertEqual_(customers[2].columnIndex, 4);
  assertEqual_(customers[3].header, 'E.com');
  assertEqual_(customers[3].columnIndex, 5);
}

function testNewDatesDetected_() {
  var before = makeGrid_([
    { header: 'shop.com', dates: ['1405-7-20'] }
  ]);
  var after = makeGrid_([
    { header: 'shop.com', dates: ['1405-7-20', '1405-8-20', '', '1405-10-20'] }
  ]);
  var first = discoverCustomersFromValues(before, testCtx_('support'));
  var second = discoverCustomersFromValues(after, testCtx_('support'));
  assertEqual_(first[0].dates.length, 1);
  assertEqual_(second[0].dates.length, 3, 'new dates after empty rows must be found');
  assertEqual_(formatJalaliIso(second[0].dates[2]), '1405-10-20');
}

function testEmptyCellsIgnored_() {
  var grid = makeGrid_([
    { header: 'ok.com', dates: ['', '1405-7-20', '', 'not-a-date', '۱۴۰۵/۰۸/۱۵'] },
    null,
    { header: '', dates: ['1405-9-10'] }
  ]);
  var customers = discoverCustomersFromValues(grid, testCtx_('support'));
  assertEqual_(customers.length, 1, 'empty header must be skipped');
  assertEqual_(customers[0].dates.length, 2);
  assertEqual_(formatJalaliIso(customers[0].dates[0]), '1405-07-20');
  assertEqual_(formatJalaliIso(customers[0].dates[1]), '1405-08-15');
}

function testIdenticalNamesIndependent_() {
  var grid = makeGrid_([
    { header: 'same.com', dates: ['1405-7-20'] },
    { header: 'same.com', dates: ['1405-7-20'] }
  ]);
  var customers = discoverCustomersFromValues(grid, testCtx_('support', 'ss-support', 11));
  assertEqual_(customers.length, 2);
  var id1 = buildEventId({
    spreadsheetId: customers[0].spreadsheetId,
    sheetId: customers[0].sheetId,
    category: customers[0].category,
    columnIndex: customers[0].columnIndex,
    date: customers[0].dates[0],
    interval: 3
  });
  var id2 = buildEventId({
    spreadsheetId: customers[1].spreadsheetId,
    sheetId: customers[1].sheetId,
    category: customers[1].category,
    columnIndex: customers[1].columnIndex,
    date: customers[1].dates[0],
    interval: 3
  });
  assertTrue_(id1 !== id2, 'identical names must not share event ids');
}

function testSupportSeoSeparate_() {
  var grid = makeGrid_([
    { header: 'shared.com', dates: ['1405-7-20'] }
  ]);
  var support = discoverCustomersFromValues(grid, testCtx_('support', 'ss-support', 1));
  var seo = discoverCustomersFromValues(grid, testCtx_('seo', 'ss-seo', 2));
  var supportId = buildEventId({
    spreadsheetId: support[0].spreadsheetId,
    sheetId: support[0].sheetId,
    category: support[0].category,
    columnIndex: support[0].columnIndex,
    date: support[0].dates[0],
    interval: 1
  });
  var seoId = buildEventId({
    spreadsheetId: seo[0].spreadsheetId,
    sheetId: seo[0].sheetId,
    category: seo[0].category,
    columnIndex: seo[0].columnIndex,
    date: seo[0].dates[0],
    interval: 1
  });
  assertTrue_(supportId !== seoId, 'support and SEO must stay separate');
  assertTrue_(supportId.indexOf('|support|') >= 0);
  assertTrue_(seoId.indexOf('|seo|') >= 0);
}

function testJalaliCalculations_() {
  var n20 = parseJalaliDate('1405-7-20');
  var slash = parseJalaliDate('1405/07/20');
  var persian = parseJalaliDate('۱۴۰۵/۰۷/۲۰');
  assertTrue_(!!n20 && !!slash && !!persian);
  assertEqual_(formatJalaliIso(n20), formatJalaliIso(slash));
  assertEqual_(formatJalaliIso(n20), formatJalaliIso(persian));

  var g1403 = jalaliToGregorian(1403, 1, 1);
  assertEqual_(g1403.gy, 2024);
  assertEqual_(g1403.gm, 3);
  assertEqual_(g1403.gd, 20);

  var g1404 = jalaliToGregorian(1404, 1, 1);
  assertEqual_(g1404.gy, 2025);
  assertEqual_(g1404.gm, 3);
  assertEqual_(g1404.gd, 21);

  assertTrue_(isLeapJalaaliYear(1403), '1403 is leap');
  assertTrue_(!isLeapJalaaliYear(1404), '1404 is not leap');
  assertTrue_(!!parseJalaliDate('1403/12/30'));
  assertTrue_(!parseJalaliDate('1404/12/30'), 'invalid leap day must be rejected');
  assertTrue_(!parseJalaliDate('not a date'));

  var remaining = daysBetweenGregorian(
    { y: 2026, m: 10, d: 5 },
    { y: 2026, m: 10, d: 12 }
  );
  assertEqual_(remaining, 7);

  var today = { y: 2026, m: 10, d: 5 };
  var customer = discoverCustomersFromValues(
    makeGrid_([{ header: 'gpu-bazar.com 10', dates: ['1405-7-20'] }]),
    testCtx_('support')
  )[0];
  assertEqual_(customer.domain, 'gpu-bazar.com');
  assertEqual_(customer.header, 'gpu-bazar.com 10');
  var g = jalaliToGregorian(1405, 7, 20);
  var days = daysBetweenGregorian(today, { y: g.gy, m: g.gm, d: g.gd });
  assertEqual_(days, 7, '1405-7-20 should be 7 days after 2026-10-05');
}

function testDuplicateRemindersPrevented_() {
  var today = { y: 2026, m: 10, d: 5 };
  var customers = discoverCustomersFromValues(
    makeGrid_([{ header: 'a.com', dates: ['1405-7-20'] }]),
    testCtx_('support')
  );
  var events = buildReminderEvents(customers, [7, 3, 1, 0], today);
  var due = events.filter(function(ev) { return ev.dueToday; });
  assertEqual_(due.length, 1);
  assertEqual_(due[0].interval, 7);

  var index = createMemoryLogIndex();
  assertTrue_(shouldDeliverEvent(due[0], index));
  rememberDelivery(index, due[0].eventId, 'SENT');
  assertTrue_(!shouldDeliverEvent(due[0], index), 'sent reminder must not repeat');

  var extraColumn = discoverCustomersFromValues(
    makeGrid_([
      { header: 'a.com', dates: ['1405-7-20'] },
      { header: 'new.com', dates: ['1405-8-01'] }
    ]),
    testCtx_('support')
  );
  var afterAdd = buildReminderEvents(extraColumn, [7, 3, 1, 0], today)
    .filter(function(ev) { return ev.customer.header === 'a.com' && ev.dueToday; });
  assertEqual_(afterAdd[0].eventId, due[0].eventId, 'new column must not change old event ids');
  assertTrue_(!shouldDeliverEvent(afterAdd[0], index));
}

function testFailedTelegramRetry_() {
  var event = {
    eventId: 'v1|ss|1|support|col:1|1405-07-20|d3',
    dueToday: true,
    remaining: 3
  };
  var index = createMemoryLogIndex();
  assertTrue_(shouldDeliverEvent(event, index));
  rememberDelivery(index, event.eventId, 'FAILED');
  assertTrue_(shouldDeliverEvent(event, index), 'failed delivery must remain retryable');

  var later = {
    eventId: event.eventId,
    dueToday: false,
    remaining: 2,
    interval: 3
  };
  assertTrue_(shouldDeliverEvent(later, index), 'failed reminder retries after the interval day');
  rememberDelivery(index, event.eventId, 'SENT');
  assertTrue_(!shouldDeliverEvent(later, index), 'successful retry must stop further sends');
}

function assertEqual_(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'assertEqual') + ': expected ' + JSON.stringify(expected) +
      ' but got ' + JSON.stringify(actual));
  }
}

function assertTrue_(condition, message) {
  if (!condition) throw new Error(message || 'assertTrue failed');
}

function testExpiredFailedNotRetried_() {
  var idx = createMemoryLogIndex();
  rememberDelivery(idx, 'failed-event', 'FAILED');
  assertTrue_(!shouldDeliverEvent({ eventId: 'failed-event', dueToday: false, remaining: -1, interval: 3 }, idx));
}

function testTrailingTextRejected_() {
  assertTrue_(!parseJalaliDate('1405-7-20 extra'));
  assertTrue_(!!parseJalaliDate('۱۴۰۵/۷/۲۰'));
}

function testRoundTrip_() {
  [[1403, 1, 1], [1404, 12, 29], [1405, 7, 20], [1403, 12, 30]].forEach(function(input) {
    var g = jalaliToGregorian(input[0], input[1], input[2]);
    var j = gregorianToJalali(g.gy, g.gm, g.gd);
    assertEqual_(formatJalaliIso(j), formatJalaliIso({ y: input[0], m: input[1], d: input[2] }));
  });
}

function testCombinedReminders_() {
  var c = discoverCustomersFromValues(makeGrid_([{ header: 'a.com', dates: ['1405-7-20'] }]), testCtx_('support'))[0];
  var a = { customer: c, date: c.dates[0], remaining: 3, interval: 7 };
  var b = { customer: c, date: c.dates[0], remaining: 3, interval: 3 };
  var chunks = splitReportChunks([a, b]);
  assertEqual_(chunks.length, 1);
  assertEqual_(chunks[0].events.length, 2);
  var matches = chunks[0].text.match(/👤/g);
  assertEqual_(matches && matches.length, 1);
}
