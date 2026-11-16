/* The single selling-price rule: DB.effectivePrice / DB.saleIsActive.
   Run:  node tests/pricing.test.js

   Every place that shows a price — the till, shelf tags, reports — must go
   through this one function. Two price calculations is how the old app came to
   show two different AR balances, and the shelf tags drifted once already by
   falling back to McKesson's COST as a public shelf price. */

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const dbSrc = fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8');
const slice = dbSrc.slice(dbSrc.indexOf('  function saleIsActive'), dbSrc.indexOf('  function updateCustomProduct'));
const DB = new Function('localDateStr', slice + '; return { effectivePrice, saleIsActive };')
  (d => d.toISOString().slice(0, 10));

let passed = 0, failed = 0;
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`); }
};
const TODAY = '2026-11-16';

console.log('\nprice order: sale → override → retail');
check('catalogue retail',
  DB.effectivePrice({ suggested_retail: 10 }, TODAY).price, 10);
check('override beats retail',
  DB.effectivePrice({ suggested_retail: 10, price_override: 8 }, TODAY).price, 8);
check('an active sale beats the override',
  DB.effectivePrice({ suggested_retail: 10, price_override: 8, sale_price: 6, sale_start: '2026-11-01', sale_end: '2026-11-30' }, TODAY).price, 6);
check('custom product uses its own price',
  DB.effectivePrice({ price: 4.5 }, TODAY).price, 4.5);

console.log("\nMcKesson's COST is never a selling price");
check('cost alone yields no price',
  DB.effectivePrice({ regular_unit_price: 7 }, TODAY).price, 0);
check('cost is ignored even beside a retail price',
  DB.effectivePrice({ regular_unit_price: 7, suggested_retail: 12 }, TODAY).price, 12);

console.log('\nsale date windows');
const sale = (start, end) => ({ suggested_retail: 10, sale_price: 6, sale_start: start, sale_end: end });
check('inside the window',        DB.effectivePrice(sale('2026-11-01', '2026-11-30'), TODAY).isSale, true);
check('on the first day',         DB.effectivePrice(sale(TODAY, '2026-11-30'), TODAY).isSale, true);
check('on the last day',          DB.effectivePrice(sale('2026-11-01', TODAY), TODAY).isSale, true);
check('the day before it starts', DB.effectivePrice(sale('2026-11-17', '2026-11-30'), TODAY).isSale, false);
check('the day after it ends',    DB.effectivePrice(sale('2026-11-01', '2026-11-15'), TODAY).isSale, false);
check('no dates at all = running', DB.effectivePrice(sale(null, null), TODAY).isSale, true);
check('open-ended from a past date', DB.effectivePrice(sale('2026-01-01', null), TODAY).isSale, true);
check('future with no end date',     DB.effectivePrice(sale('2027-01-01', null), TODAY).isSale, false);

console.log('\nan expired sale falls back cleanly');
const expired = DB.effectivePrice(sale('2026-01-01', '2026-01-31'), TODAY);
check('charges the normal price', expired.price, 10);
check('not flagged as a sale',    expired.isSale, false);

console.log('\nthe regular price is reported alongside, for "was $X"');
const live = DB.effectivePrice(sale('2026-11-01', '2026-11-30'), TODAY);
check('sale price charged', live.price, 6);
check('regular price kept', live.regular, 10);
check('end date reported',  live.saleEnds, '2026-11-30');

console.log('\nrubbish input does not throw');
check('null product',        DB.effectivePrice(null, TODAY).price, 0);
check('empty product',       DB.effectivePrice({}, TODAY).price, 0);
check('zero sale price ignored',
  DB.effectivePrice({ suggested_retail: 10, sale_price: 0 }, TODAY).price, 10);
check('negative sale price ignored',
  DB.effectivePrice({ suggested_retail: 10, sale_price: -5 }, TODAY).price, 10);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
