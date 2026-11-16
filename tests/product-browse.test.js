/* Paged product browsing, and the classification that is NOT the BTC flag.
   Run:  node tests/product-browse.test.js        (needs lib/)

   Why these assertions exist: searchProducts capped at 80 rows and said nothing
   about the ones it dropped, and the Products page could not list the catalogue
   at all. Both are the silent-truncation fault this project keeps hitting — the
   query succeeds and shows less than the truth. So the things worth pinning are
   that `total` always counts EVERY match (never the page), that the page clamps
   instead of stranding you on an empty page, and that a tag filter cannot match
   a different tag by accident. */

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const initSqlJs    = require(path.join(ROOT, 'lib/sql-wasm.js'));
const WebcatParser = require(path.join(ROOT, 'js/parsers/webcat.js'));
const { buildProduct } = require('./webcat-fixtures.js');

let passed = 0, failed = 0;
const check = (name, cond) => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`); }
};
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`); }
};

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(ROOT, 'lib', f) });
  const db  = new SQL.Database();

  // Schema as db.js leaves it after its ALTER list.
  db.run(`CREATE TABLE products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    mckesson_item_no TEXT UNIQUE, description TEXT NOT NULL,
    upc_unit TEXT, gtin_unit TEXT, din TEXT,
    suggested_retail REAL, regular_unit_price REAL,
    gst_applicable INTEGER DEFAULT 0, pst_applicable INTEGER DEFAULT 0,
    narcotic_indicator TEXT, product_status TEXT, last_synced DATETIME,
    price_override REAL, unit_cost REAL,
    sale_price REAL, sale_start TEXT, sale_end TEXT,
    qty_on_hand REAL, qty_threshold REAL, location TEXT, notes TEXT,
    schedule_flag TEXT, family_group TEXT,
    category TEXT, brand TEXT, tags TEXT)`);
  db.run(`CREATE TABLE custom_products (
    custom_product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL, upc TEXT, price REAL, unit_cost REAL,
    gst_applicable INTEGER DEFAULT 1, pst_applicable INTEGER DEFAULT 0,
    created_by TEXT, created_at DATETIME,
    qty_on_hand REAL, qty_threshold REAL, location TEXT, notes TEXT,
    schedule_flag TEXT, sale_price REAL, sale_start TEXT, sale_end TEXT,
    sku TEXT, category TEXT, brand TEXT, tags TEXT)`);

  /* Load the real functions, from saveCustomProduct through updateCatalogProduct.
     Low-level helpers are injected so nothing is reimplemented here. */
  const src = fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8');
  const body = src.slice(src.indexOf('  function saveCustomProduct'),
                         src.indexOf('  function exportDb'));
  const all = (sql, params = []) => {
    const stmt = db.prepare(sql); stmt.bind(params);
    const rows = []; while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free(); return rows;
  };
  const get = (sql, params = []) => all(sql, params)[0] || null;
  let lastRowid = 0;
  const run = (sql, params = []) => {
    db.run(sql, params);
    lastRowid = db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] || 0;
  };
  const DB = new Function(
    '_db', 'all', 'get', 'run', 'lastInsertId', '_persist', 'localISOStr', 'localDateStr',
    'findCustomProductByBarcode',
    body + `; return { saveCustomProduct, updateCustomProduct, updateCatalogProduct,
       deleteCustomProduct, upsertProducts, upsertProductsSelective,
       searchProducts, queryCatalogProducts, queryCustomProducts,
       getProductFacets, getCategoryCounts, renameCategory,
       splitTags, normTags: _normTags, effectivePrice, saleIsActive };`
  )(db, all, get, run, () => lastRowid, () => {}, () => '2026-11-16 10:00:00',
    () => '2026-11-16',
    (upc) => get('SELECT * FROM custom_products WHERE upc=?', [upc]));

  /* ── Fixtures ─────────────────────────────────────────────────────────── */
  // 120 catalogue rows, so the old LIMIT 80 would have hidden 40 of them.
  const cat = [];
  for (let i = 1; i <= 120; i++) {
    cat.push({
      mckesson_item_no: String(100000 + i),
      description: `CATALOGUE ITEM ${String(i).padStart(3, '0')}`,
      upc_unit: `0000${String(i).padStart(9, '0')}`,
      gtin_unit: null, din: null,
      suggested_retail: 9.99, regular_unit_price: 5.00,
      gst_applicable: 1, pst_applicable: 0,
      narcotic_indicator: null, product_status: 'A',
      family_group: i % 2 ? 'ABCD' : 'WXYZ',
    });
  }
  DB.upsertProducts(cat);

  DB.saveCustomProduct({ description: 'HOUSE LOZENGES', upc: '111', price: 4.5,
    sku: 'HL-001', category: 'Cough & Cold', brand: 'Jamieson',
    tags: 'front-window, seasonal', gst_applicable: true, created_by: 'test' });
  DB.saveCustomProduct({ description: 'INSULIN COOLER BAG', upc: '222', price: 24.99,
    sku: 'ICB-9', category: 'Diabetes Care', brand: 'Medline',
    tags: 'cold-chain', gst_applicable: true, qty_on_hand: 2, qty_threshold: 5 });
  DB.saveCustomProduct({ description: 'BULK EPSOM SALT', upc: '333', price: 7.25,
    sku: 'ES-5KG', category: 'Personal Care', brand: 'Jamieson',
    tags: 'cold', gst_applicable: true, qty_on_hand: 40, qty_threshold: 10 });

  /* ── Pagination ───────────────────────────────────────────────────────── */
  console.log('\npagination reports the real total, not the page');
  const p1 = DB.queryCatalogProducts({ pageSize: 50, page: 1 });
  eq('total counts every match',   p1.total, 120);
  eq('pages derived from total',   p1.pages, 3);
  eq('first page is full',         p1.rows.length, 50);
  eq('page echoed back',           p1.page, 1);

  const p3 = DB.queryCatalogProducts({ pageSize: 50, page: 3 });
  eq('last page holds the remainder', p3.rows.length, 20);
  check('last page is the tail',
    p3.rows[p3.rows.length - 1].description === 'CATALOGUE ITEM 120');
  check('pages do not overlap',
    p1.rows.every(r => !p3.rows.some(x => x.product_id === r.product_id)));

  console.log('\nthe 80-row cap is gone');
  eq('searchProducts still caps (unchanged, kept for the till)',
    DB.searchProducts('CATALOGUE').length, 80);
  eq('browsing reaches all 120',
    DB.queryCatalogProducts({ pageSize: 250, page: 1 }).rows.length, 120);

  console.log('\nthe catalogue is listable with no search term');
  eq('an empty term lists everything', DB.queryCatalogProducts({ pageSize: 50 }).total, 120);

  console.log('\nout-of-range pages clamp instead of showing an empty table');
  const over = DB.queryCatalogProducts({ pageSize: 50, page: 99 });
  eq('clamped to the last page', over.page, 3);
  check('and still returns rows', over.rows.length === 20);
  const under = DB.queryCatalogProducts({ pageSize: 50, page: 0 });
  eq('page 0 becomes page 1', under.page, 1);
  eq('junk page becomes page 1', DB.queryCatalogProducts({ pageSize: 50, page: 'abc' }).page, 1);
  eq('junk page size falls back to 50', DB.queryCatalogProducts({ pageSize: 'x' }).pageSize, 50);

  console.log('\na filter that matches nothing is honest about it');
  const none = DB.queryCatalogProducts({ term: 'NOTHINGMATCHESTHIS' });
  eq('total zero', none.total, 0);
  eq('no rows',    none.rows.length, 0);
  eq('still one page', none.pages, 1);

  /* ── Searching ────────────────────────────────────────────────────────── */
  console.log('\nsearch covers the item number and the SKU');
  eq('catalogue by McKesson item #',
    DB.queryCatalogProducts({ term: '100007' }).total, 1);
  eq('custom by SKU',
    DB.queryCustomProducts({ term: 'ICB-9' }).total, 1);
  eq('custom by brand',
    DB.queryCustomProducts({ term: 'Jamieson' }).total, 2);
  eq('custom by UPC',
    DB.queryCustomProducts({ term: '222' }).total, 1);

  /* ── Category / brand / tag filters ──────────────────────────────────── */
  console.log('\ncategory, brand and tag filters');
  eq('by category', DB.queryCustomProducts({ category: 'Diabetes Care' }).total, 1);
  eq('by brand',    DB.queryCustomProducts({ brand: 'Jamieson' }).total, 2);
  eq('by tag',      DB.queryCustomProducts({ tag: 'seasonal' }).total, 1);
  // "cold" and "cold-chain" are different tags. Matching on a bare LIKE would
  // have returned both.
  eq('a tag is not a substring match', DB.queryCustomProducts({ tag: 'cold' }).total, 1);
  check('and it found the right one',
    DB.queryCustomProducts({ tag: 'cold' }).rows[0].description === 'BULK EPSOM SALT');
  eq('tag match ignores case', DB.queryCustomProducts({ tag: 'COLD-CHAIN' }).total, 1);
  eq('filters combine (brand + category)',
    DB.queryCustomProducts({ brand: 'Jamieson', category: 'Personal Care' }).total, 1);
  eq('low stock combines with a brand',
    DB.queryCustomProducts({ filter: 'low', brand: 'Medline' }).total, 1);
  eq('low stock excludes the well-stocked',
    DB.queryCustomProducts({ filter: 'low' }).total, 1);

  /* ── Tag normalisation ───────────────────────────────────────────────── */
  console.log('\ntags are normalised on the way in');
  eq('lower-cased and trimmed', DB.normTags('  Fridge , SEASONAL '), 'fridge,seasonal');
  eq('duplicates collapsed',    DB.normTags('fridge, Fridge, FRIDGE'), 'fridge');
  eq('blanks dropped',          DB.normTags('a,,  ,b'), 'a,b');
  eq('empty becomes null',      DB.normTags('   ,  '), null);
  eq('null stays null',         DB.normTags(null), null);
  eq('inner whitespace squashed', DB.normTags('front   window'), 'front window');
  eq('splitTags round-trips',   DB.splitTags('a,b,c'), ['a','b','c']);
  eq('splitTags on empty',      DB.splitTags(null), []);

  console.log('\nsaving a product stores the new fields');
  const savedId = DB.saveCustomProduct({ description: 'TEST VITAMIN D', upc: '444', price: 11,
    sku: 'VD-1000', category: 'Vitamins & Supplements', brand: 'Webber',
    tags: ' Fridge , fridge , Seasonal ', gst_applicable: true });
  const saved = get('SELECT * FROM custom_products WHERE custom_product_id=?', [savedId]);
  eq('sku saved',      saved.sku, 'VD-1000');
  eq('category saved', saved.category, 'Vitamins & Supplements');
  eq('brand saved',    saved.brand, 'Webber');
  eq('tags normalised on save', saved.tags, 'fridge,seasonal');

  console.log('\nediting a catalogue product stores them too');
  const target = get("SELECT product_id FROM products WHERE mckesson_item_no='100005'");
  DB.updateCatalogProduct(target.product_id, {
    category: 'Pain Relief', brand: 'Tylenol', tags: 'A, a, B',
    gst_applicable: true, pst_applicable: false });
  const edited = get('SELECT * FROM products WHERE product_id=?', [target.product_id]);
  eq('catalogue category', edited.category, 'Pain Relief');
  eq('catalogue brand',    edited.brand, 'Tylenol');
  eq('catalogue tags normalised', edited.tags, 'a,b');
  eq('catalogue filter finds it', DB.queryCatalogProducts({ category: 'Pain Relief' }).total, 1);

  /* ── Facets ──────────────────────────────────────────────────────────── */
  console.log('\nfacets read BOTH tables');
  const f = DB.getProductFacets();
  check('brands span both tables',
    f.brands.includes('Jamieson') && f.brands.includes('Tylenol'));
  check('categories span both tables',
    f.categories.includes('Diabetes Care') && f.categories.includes('Pain Relief'));
  check('tags are split, not whole strings',
    f.tags.includes('front-window') && f.tags.includes('cold-chain') && !f.tags.includes('front-window, seasonal'));
  check('tags de-duplicated across rows',
    f.tags.filter(t => t === 'seasonal').length === 1);

  /* ── Category rename ─────────────────────────────────────────────────── */
  console.log('\nrenaming a category');
  const counts = DB.getCategoryCounts();
  eq('counts one product per category',
    counts.find(c => c.category === 'Cough & Cold')?.count, 1);
  eq('rename reports how many it changed',
    DB.renameCategory('Cough & Cold', 'Cold & Flu'), 1);
  eq('old name gone',  DB.queryCustomProducts({ category: 'Cough & Cold' }).total, 0);
  eq('new name found', DB.queryCustomProducts({ category: 'Cold & Flu' }).total, 1);
  eq('renaming to itself is a no-op', DB.renameCategory('Cold & Flu', 'Cold & Flu'), 0);
  eq('renaming a blank name is refused', DB.renameCategory('', 'X'), 0);
  eq('renaming to blank is refused', DB.renameCategory('Cold & Flu', '   '), 0);
  // A rename must reach BOTH tables, or a catalogue product keeps the old label
  // and the category appears twice in the filter list.
  DB.updateCatalogProduct(target.product_id, { category: 'Shared', gst_applicable: true });
  DB.saveCustomProduct({ description: 'SHARED CAT ITEM', upc: '555', price: 1,
    category: 'Shared', gst_applicable: true });
  eq('rename touches catalogue AND custom', DB.renameCategory('Shared', 'Renamed'), 2);
  eq('catalogue row renamed', DB.queryCatalogProducts({ category: 'Renamed' }).total, 1);
  eq('custom row renamed',    DB.queryCustomProducts({ category: 'Renamed' }).total, 1);

  /* ── family_group from the catalogue file ────────────────────────────── */
  console.log('\nWEBCAT family group is stored, not discarded');
  const parsed = WebcatParser.parseFile([
    buildProduct({ item: '900001', desc: 'FAMILY GROUP TEST', gst: 'Y', pst: 'N',
                   srp: '0001000', gtin: '9' }),
  ].join('\n'));
  check('the parser now returns it', 'family_group' in parsed.products[0]);
  DB.upsertProducts(parsed.products);
  const fg = get("SELECT family_group FROM products WHERE mckesson_item_no='900001'");
  check('and the import stores it', fg.family_group !== null && fg.family_group !== undefined);
  eq('a re-sync keeps it in step',
    (DB.upsertProducts(parsed.products),
     get("SELECT family_group FROM products WHERE mckesson_item_no='900001'").family_group),
    fg.family_group);

  /* ── The price rule is untouched by any of this ──────────────────────── */
  console.log('\nthe single price rule still holds (1.4.17)');
  eq('a custom price is used',
    DB.effectivePrice(get("SELECT * FROM custom_products WHERE sku='ICB-9'")).price, 24.99);
  eq("McKesson's cost is still never a selling price",
    DB.effectivePrice({ regular_unit_price: 7 }).price, 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
