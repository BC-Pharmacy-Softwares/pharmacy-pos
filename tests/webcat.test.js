/* WEBCAT V6 parser + catalogue upsert tests.
   Run:  node tests/webcat.test.js
   Needs lib/sql-wasm.js (setup.sh / setup.bat downloads it). */

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { buildProduct, buildSpecial } = require('./webcat-fixtures.js');

/* Load the real parser the same way the browser does */
const WebcatParser = require(path.join(ROOT, 'js/parsers/webcat.js'));

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`); }
}
function section(t) { console.log(`\n${t}`); }

/* ── Parser ─────────────────────────────────────────────── */
section('record identification');
const tylenol = buildProduct({ item:'077123', desc:'TYLENOL EX STR 500MG 100 CAPLETS',
  narc:' ', din:'00559407', gst:'Y', pst:'N', regUnit:'0000899', srp:'0001299',
  gtin:'00056800000123', upcPkg:'0', upcVendor:'0056800', upcUnit:'00123' });

check('product record is 396 chars', tylenol.length, 396);
check('specials record is 345 chars', buildSpecial('077123').length, 345);

const mixed = WebcatParser.parseFile([tylenol, buildSpecial('077123')].join('\n'));
check('only the P record becomes a product', mixed.products.length, 1);
check('the S record is counted as a promotion', mixed.specials, 1);
check('product keeps its real description', mixed.products[0].description, 'TYLENOL EX STR 500MG 100 CAPLETS');
check('product keeps its DIN', mixed.products[0].din, '00559407');
check('product keeps its GTIN', mixed.products[0].gtin_unit, '00056800000123');
check('product keeps its retail price', mixed.products[0].suggested_retail, 12.99);

section('tax indicators (Y = yes, F = forced, N/blank = no)');
for (const [flag, expect] of [['Y', true], ['F', true], ['N', false], [' ', false]]) {
  const r = WebcatParser.parseLine(buildProduct({ item:'111111', gst:flag, pst:flag }));
  check(`GST '${flag}'`, r.gst_applicable, expect);
  check(`PST '${flag}'`, r.pst_applicable, expect);
}

section("narcotic indicator (C = controlled, N = narcotic non-controlled, blank = neither)");
check("'C' is controlled", WebcatParser.narcoticClass('C'), 'controlled');
check("'N' is a narcotic",  WebcatParser.narcoticClass('N'), 'narcotic');
check("blank is neither",   WebcatParser.narcoticClass(' '), null);
check("'N' counts as narcotic", WebcatParser.isNarcotic('N'), true);
check("blank is not narcotic",  WebcatParser.isNarcotic(''), false);

section('prices (7,2 with implied decimals)');
check('0001250 -> 12.50', WebcatParser.parseLine(buildProduct({ srp:'0001250' })).suggested_retail, 12.5);
check('0099999 -> 999.99', WebcatParser.parseLine(buildProduct({ srp:'0099999' })).suggested_retail, 999.99);
check('zero-filled -> null (not supplied)', WebcatParser.parseLine(buildProduct({ srp:'0000000' })).suggested_retail, null);
check('cost is parsed separately', WebcatParser.parseLine(buildProduct({ regUnit:'0000899' })).regular_unit_price, 8.99);

section('UPC');
check('absent UPC is null, not 0000000000000',
  WebcatParser.parseLine(buildProduct({ item:'222222' })).upc_unit, null);
check('present UPC is joined from its three fields',
  WebcatParser.parseLine(buildProduct({ upcPkg:'0', upcVendor:'0056800', upcUnit:'00123' })).upc_unit,
  '0005680000123');

section('line endings and malformed lines');
const crlf = WebcatParser.parseFile(tylenol + '\r\n' + buildProduct({ item:'077124' }) + '\r\n');
check('CRLF file parses both records', crlf.products.length, 2);
check('CRLF leaves no stray \\r in GTIN', crlf.products[0].gtin_unit, '00056800000123');

const short = WebcatParser.parseFile(tylenol.slice(0, 300).replace(/\s+$/, ''));
check('truncated line is flagged', short.truncated, 1);
check('truncated line does not invent a price', short.products[0].suggested_retail, null);

const headerless = WebcatParser.parseFile(tylenol.slice(1) + '\n' + buildProduct({ item:'077124' }).slice(1));
check('file with no record-ID column still imports', headerless.products.length, 2);
check('and says so', headerless.layout, 'no-record-id');
// Every field shifts one character left, so check real values, not just a count.
check('headerless: item number correct',  headerless.products[0].mckesson_item_no, '077123');
check('headerless: description correct',  headerless.products[0].description, 'TYLENOL EX STR 500MG 100 CAPLETS');
check('headerless: DIN correct',          headerless.products[0].din, '00559407');
check('headerless: retail price correct', headerless.products[0].suggested_retail, 12.99);
check('headerless: GTIN correct',         headerless.products[0].gtin_unit, '00056800000123');
check('headerless: GST correct',          headerless.products[0].gst_applicable, true);

// A file that is neither layout must import nothing rather than garbage.
const junk = WebcatParser.parseFile('this is not a webcat file at all\nnor is this line\n');
check('junk file yields no products', junk.products.length, 0);

const dupes = WebcatParser.parseFile([
  buildProduct({ item:'077123', desc:'OLD NAME', srp:'0001000' }),
  buildProduct({ item:'077123', desc:'NEW NAME', srp:'0002000' }),
].join('\n'));
check('duplicate item numbers collapse to one', dupes.products.length, 1);
check('last record wins', dupes.products[0].description, 'NEW NAME');
check('duplicates are counted', dupes.duplicates, 1);

/* ── Catalogue upsert ───────────────────────────────────── */
(async () => {
  let initSqlJs;
  try { initSqlJs = require(path.join(ROOT, 'lib/sql-wasm.js')); }
  catch { console.log('\n(skipping DB tests — lib/sql-wasm.js missing; run setup first)'); return done(); }

  const SQL = await initSqlJs({ locateFile: f => path.join(ROOT, 'lib', f) });
  const db  = new SQL.Database();
  db.run(`CREATE TABLE products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    mckesson_item_no TEXT UNIQUE, description TEXT NOT NULL,
    upc_unit TEXT, gtin_unit TEXT, din TEXT,
    suggested_retail REAL, regular_unit_price REAL,
    gst_applicable INTEGER DEFAULT 0, pst_applicable INTEGER DEFAULT 0,
    narcotic_indicator TEXT, product_status TEXT, last_synced DATETIME,
    price_override REAL)`);

  // Load the real DB module with a minimal browser shim.
  const dbSrc = fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8');
  const sandbox = { _db: db, localISOStr: () => '2026-11-13 10:00:00' };
  // Pull out just the two upsert functions plus their helpers, bound to our db.
  const body = dbSrc.slice(dbSrc.indexOf('function _inTransaction'),
                           dbSrc.indexOf('function getProductCount'));
  const make = new Function('_db', 'localISOStr', '_persist',
    body + '; return { upsertProducts, upsertProductsSelective, _inTransaction };');
  const DB = make(db, sandbox.localISOStr, () => {});

  section('upsert — a promotion record must not destroy the product');
  DB.upsertProducts(WebcatParser.parseFile([tylenol, buildSpecial('077123')].join('\n')).products);
  const row = db.exec('SELECT description, din, gtin_unit, suggested_retail FROM products')[0].values[0];
  check('description intact', row[0], 'TYLENOL EX STR 500MG 100 CAPLETS');
  check('DIN intact',          row[1], '00559407');
  check('GTIN intact',         row[2], '00056800000123');
  check('retail price intact', row[3], 12.99);

  section('upsert — "update existing only" (newItems: false)');
  const updated = WebcatParser.parseFile(buildProduct({ item:'077123',
    desc:'TYLENOL EX STR — NEW NAME', narc:' ', din:'00559407', gst:'Y', pst:'N',
    regUnit:'0000950', srp:'0001499', gtin:'00056800000123' })).products;
  let threw = null;
  try { DB.upsertProductsSelective(updated, { newItems:false, prices:true, descriptions:true, taxFlags:true }); }
  catch (e) { threw = e.message; }
  check('does not throw', threw, null);
  const r2 = db.exec('SELECT description, suggested_retail FROM products')[0].values[0];
  check('description actually updated', r2[0], 'TYLENOL EX STR — NEW NAME');
  check('price actually updated',       r2[1], 14.99);

  section('upsert — newItems:false does not add unstocked items');
  const before = db.exec('SELECT COUNT(*) FROM products')[0].values[0][0];
  DB.upsertProductsSelective(WebcatParser.parseFile(buildProduct({ item:'999999', srp:'0000500' })).products,
                             { newItems:false });
  check('row count unchanged', db.exec('SELECT COUNT(*) FROM products')[0].values[0][0], before);

  section('upsert — a failure rolls back instead of leaving the transaction open');
  try { DB._inTransaction(() => { throw new Error('boom'); }); } catch(_) {}
  let beginErr = null;
  try { db.run('BEGIN'); db.run('COMMIT'); } catch (e) { beginErr = e.message; }
  check('a later BEGIN still works', beginErr, null);

  done();
})();

function done() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
