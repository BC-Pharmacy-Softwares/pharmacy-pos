/* ============================================================
   db.js — SQLite database via sql.js, persisted in IndexedDB
   ============================================================ */

const DB_IDB_KEY = 'pharmacy_pos_db';
const DB_IDB_STORE = 'sqlite_store';
const DB_IDB_NAME  = 'PharmacyPOS';

const DB = (() => {
  let _db      = null;
  let _SQL     = null;
  let _lastRowid = 0;

  /* ---- Persistence via IndexedDB ---- */
  function _openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_IDB_NAME, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore(DB_IDB_STORE);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function _loadFromIDB() {
    try {
      const idb  = await _openIDB();
      const tx   = idb.transaction(DB_IDB_STORE, 'readonly');
      const store = tx.objectStore(DB_IDB_STORE);
      return new Promise((resolve) => {
        const req = store.get(DB_IDB_KEY);
        req.onsuccess = e => resolve(e.target.result || null);
        req.onerror   = () => resolve(null);
      });
    } catch { return null; }
  }

  async function _saveToIDB(data) {
    try {
      const idb   = await _openIDB();
      const tx    = idb.transaction(DB_IDB_STORE, 'readwrite');
      const store = tx.objectStore(DB_IDB_STORE);
      store.put(data, DB_IDB_KEY);
    } catch(e) { console.error('IDB save error', e); }
  }

  function _persist() {
    const data = _db.export();
    _saveToIDB(data);
  }

  /* ---- Schema ---- */
  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS patients (
      patient_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      phn          TEXT UNIQUE NOT NULL,
      surname      TEXT NOT NULL,
      given_name   TEXT NOT NULL,
      dob          TEXT,
      phone        TEXT,
      cell         TEXT,
      email        TEXT,
      address      TEXT,
      city         TEXT,
      province     TEXT,
      postal_code  TEXT,
      allergies    TEXT,
      created_at   DATETIME DEFAULT (datetime('now')),
      updated_at   DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transactions (
      transaction_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id       INTEGER REFERENCES patients(patient_id),
      transaction_date DATETIME NOT NULL,
      transaction_type TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'PENDING',
      subtotal         REAL,
      gst_amount       REAL,
      pst_amount       REAL,
      total_amount     REAL,
      amount_paid      REAL DEFAULT 0,
      balance_owing    REAL,
      staff_pin        TEXT,
      notes            TEXT,
      clover_order_id  TEXT,
      created_at       DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transaction_items (
      item_id          INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id   INTEGER REFERENCES transactions(transaction_id),
      item_type        TEXT NOT NULL,
      rx_number        TEXT,
      branch_code      TEXT,
      din              TEXT,
      upc              TEXT,
      description      TEXT NOT NULL,
      quantity         INTEGER DEFAULT 1,
      unit_price       REAL,
      gst_applicable   INTEGER DEFAULT 0,
      pst_applicable   INTEGER DEFAULT 0,
      line_total       REAL
    );
    CREATE TABLE IF NOT EXISTS payments (
      payment_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id    INTEGER REFERENCES transactions(transaction_id),
      payment_date      DATETIME NOT NULL,
      amount            REAL NOT NULL,
      method            TEXT NOT NULL,
      clover_payment_id TEXT,
      staff_pin         TEXT,
      notes             TEXT
    );
    CREATE TABLE IF NOT EXISTS products (
      product_id          INTEGER PRIMARY KEY AUTOINCREMENT,
      mckesson_item_no    TEXT UNIQUE,
      description         TEXT NOT NULL,
      upc_unit            TEXT,
      gtin_unit           TEXT,
      din                 TEXT,
      suggested_retail    REAL,
      regular_unit_price  REAL,
      gst_applicable      INTEGER DEFAULT 0,
      pst_applicable      INTEGER DEFAULT 0,
      narcotic_indicator  TEXT,
      product_status      TEXT,
      last_synced         DATETIME
    );
    CREATE TABLE IF NOT EXISTS custom_products (
      custom_product_id INTEGER PRIMARY KEY AUTOINCREMENT,
      description       TEXT NOT NULL,
      upc               TEXT,
      price             REAL,
      gst_applicable    INTEGER DEFAULT 1,
      pst_applicable    INTEGER DEFAULT 0,
      created_by        TEXT,
      created_at        DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      log_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      event_time     DATETIME NOT NULL,
      staff_pin      TEXT,
      event_type     TEXT,
      description    TEXT,
      transaction_id INTEGER,
      ip_address     TEXT
    );
    CREATE TABLE IF NOT EXISTS staff (
      staff_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      pin        TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'CASHIER',
      active     INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS shifts (
      shift_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id        INTEGER,
      staff_name      TEXT,
      opened_at       DATETIME NOT NULL,
      closed_at       DATETIME,
      opening_float   REAL DEFAULT 0,
      closing_counted REAL,
      closing_notes   TEXT,
      status          TEXT DEFAULT 'OPEN'
    );
    CREATE TABLE IF NOT EXISTS cash_movements (
      movement_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id        INTEGER NOT NULL,
      movement_date   DATETIME NOT NULL,
      movement_type   TEXT NOT NULL,
      amount          REAL NOT NULL,
      reason          TEXT,
      staff_name      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_products_upc   ON products(upc_unit);
    CREATE INDEX IF NOT EXISTS idx_products_gtin  ON products(gtin_unit);
    CREATE INDEX IF NOT EXISTS idx_custom_upc     ON custom_products(upc);
    CREATE INDEX IF NOT EXISTS idx_txn_patient    ON transactions(patient_id);
    CREATE INDEX IF NOT EXISTS idx_items_txn      ON transaction_items(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_payments_txn   ON payments(transaction_id);
  `;

  /* ---- Init ---- */
  async function init() {
    if (!window.initSqlJs) throw new Error('sql.js not loaded. Run setup.bat first.');
    _SQL = await initSqlJs({ locateFile: f => `lib/${f}` });
    const saved = await _loadFromIDB();
    if (saved) {
      _db = new _SQL.Database(saved);
    } else {
      _db = new _SQL.Database();
    }
    _db.run(SCHEMA);
    // Add columns introduced after initial schema (ALTER TABLE ignores errors if column exists)
    [
      "ALTER TABLE staff ADD COLUMN emp_id TEXT",
      "ALTER TABLE staff ADD COLUMN email  TEXT",
      "ALTER TABLE staff ADD COLUMN phone  TEXT",
      // Product inventory fields
      "ALTER TABLE products ADD COLUMN qty_on_hand  REAL",
      "ALTER TABLE products ADD COLUMN qty_threshold REAL",
      "ALTER TABLE products ADD COLUMN location      TEXT",
      "ALTER TABLE products ADD COLUMN notes         TEXT",
      "ALTER TABLE products ADD COLUMN price_override REAL",
      "ALTER TABLE products ADD COLUMN mckesson_ordered_at DATETIME",
      "ALTER TABLE custom_products ADD COLUMN qty_on_hand  REAL",
      "ALTER TABLE custom_products ADD COLUMN qty_threshold REAL",
      "ALTER TABLE custom_products ADD COLUMN location      TEXT",
      "ALTER TABLE custom_products ADD COLUMN notes         TEXT",
    ].forEach(sql => { try { _db.run(sql); } catch(_) {} });
    _persist();
    return _db;
  }

  /* ---- Helpers ---- */
  function run(sql, params = []) {
    _db.run(sql, params);
    // Capture rowid BEFORE _persist() calls export(), which resets last_insert_rowid()
    const res = _db.exec('SELECT last_insert_rowid()');
    _lastRowid = res[0]?.values[0]?.[0] || 0;
    _persist();
  }

  function all(sql, params = []) {
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function get(sql, params = []) {
    const rows = all(sql, params);
    return rows[0] || null;
  }

  function lastInsertId() {
    return _lastRowid;
  }

  /* ---- Staff ---- */
  function getStaffByPin(pin) {
    return all('SELECT * FROM staff WHERE active=1');
  }
  function getAllStaff() {
    return all('SELECT * FROM staff ORDER BY name');
  }
  function createStaff(name, hashedPin, role) {
    run('INSERT INTO staff(name,pin,role) VALUES(?,?,?)', [name, hashedPin, role]);
    return lastInsertId();
  }
  function updateStaff(staffId, fields) {
    run(`UPDATE staff SET name=?,role=?,emp_id=?,email=?,phone=? WHERE staff_id=?`,
      [fields.name, fields.role, fields.emp_id||null, fields.email||null, fields.phone||null, staffId]);
  }
  function updateStaffPin(staffId, hashedPin) {
    run('UPDATE staff SET pin=? WHERE staff_id=?', [hashedPin, staffId]);
  }
  function deactivateStaff(staffId) {
    run('UPDATE staff SET active=0 WHERE staff_id=?', [staffId]);
  }
  function reactivateStaff(staffId) {
    run('UPDATE staff SET active=1 WHERE staff_id=?', [staffId]);
  }
  function hasAnyStaff() {
    return (get('SELECT COUNT(*) as c FROM staff WHERE active=1')?.c || 0) > 0;
  }

  /* ---- Patients ---- */
  function upsertPatient(p) {
    const existing = get('SELECT patient_id FROM patients WHERE phn=?', [p.phn]);
    if (existing) {
      run(`UPDATE patients SET surname=?,given_name=?,dob=?,phone=?,cell=?,email=?,
           address=?,city=?,province=?,postal_code=?,allergies=?,updated_at=?
           WHERE phn=?`,
        [p.surname,p.given_name,p.dob,p.phone,p.cell,p.email,
         p.address,p.city,p.province,p.postal_code,p.allergies,localISOStr(),p.phn]);
      return existing.patient_id;
    } else {
      run(`INSERT INTO patients(phn,surname,given_name,dob,phone,cell,email,address,city,province,postal_code,allergies)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.phn,p.surname,p.given_name,p.dob,p.phone,p.cell,p.email,
         p.address,p.city,p.province,p.postal_code,p.allergies]);
      return lastInsertId();
    }
  }
  function getPatient(patientId) {
    return get('SELECT * FROM patients WHERE patient_id=?', [patientId]);
  }
  function getPatientByPhn(phn) {
    return get('SELECT * FROM patients WHERE phn=?', [phn]);
  }
  function searchPatients(term) {
    const t = `%${term}%`;
    return all(`SELECT * FROM patients WHERE surname LIKE ? OR given_name LIKE ? OR phn LIKE ? OR phone LIKE ? OR cell LIKE ?
                ORDER BY surname, given_name LIMIT 50`, [t,t,t,t,t]);
  }

  /* ---- Transactions ---- */
  function createTransaction(t) {
    run(`INSERT INTO transactions(patient_id,transaction_date,transaction_type,status,subtotal,gst_amount,pst_amount,total_amount,amount_paid,balance_owing,staff_pin,notes,clover_order_id)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [t.patient_id,t.transaction_date,t.transaction_type,t.status,
       t.subtotal,t.gst_amount,t.pst_amount,t.total_amount,
       t.amount_paid||0,t.balance_owing,t.staff_pin,t.notes||null,
       t.clover_order_id||null]);
    return lastInsertId();
  }
  function updateTransactionStatus(txnId, status, amountPaid, balanceOwing) {
    run('UPDATE transactions SET status=?,amount_paid=?,balance_owing=? WHERE transaction_id=?',
      [status, amountPaid, balanceOwing, txnId]);
  }
  function getTransaction(txnId) {
    return get('SELECT * FROM transactions WHERE transaction_id=?', [txnId]);
  }
  function getTransactionsForPatient(patientId) {
    return all('SELECT * FROM transactions WHERE patient_id=? ORDER BY transaction_date DESC', [patientId]);
  }
  function getTransactionsForDate(date) {
    return all(`
      SELECT t.*, p.given_name, p.surname, p.phn
      FROM transactions t
      LEFT JOIN patients p ON p.patient_id = t.patient_id
      WHERE date(t.transaction_date) = date(?)
      ORDER BY t.transaction_date DESC
    `, [date]);
  }
  function reverseTransaction(txnId) {
    run("UPDATE transactions SET status='REVERSED' WHERE transaction_id=?", [txnId]);
  }

  /* ---- Transaction Items ---- */
  function addTransactionItem(i) {
    run(`INSERT INTO transaction_items(transaction_id,item_type,rx_number,branch_code,din,upc,description,quantity,unit_price,gst_applicable,pst_applicable,line_total)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [i.transaction_id,i.item_type,i.rx_number||null,i.branch_code||null,
       i.din||null,i.upc||null,i.description,i.quantity||1,
       i.unit_price,i.gst_applicable?1:0,i.pst_applicable?1:0,i.line_total]);
    return lastInsertId();
  }
  function getItemsForTransaction(txnId) {
    return all('SELECT * FROM transaction_items WHERE transaction_id=?', [txnId]);
  }

  /* ---- Payments ---- */
  function addPayment(p) {
    run(`INSERT INTO payments(transaction_id,payment_date,amount,method,clover_payment_id,staff_pin,notes)
         VALUES(?,?,?,?,?,?,?)`,
      [p.transaction_id,p.payment_date,p.amount,p.method,
       p.clover_payment_id||null,p.staff_pin||null,p.notes||null]);
    return lastInsertId();
  }
  function getPaymentsForTransaction(txnId) {
    return all('SELECT * FROM payments WHERE transaction_id=? ORDER BY payment_date', [txnId]);
  }

  /* ---- Products ---- */
  function findProductByBarcode(barcode) {
    // Match exact first, then fall back to leading-zero-stripped comparison
    // (scanners often omit leading zeros that are stored in EAN-13/UPC-A fields)
    return get(
      `SELECT * FROM products
       WHERE (upc_unit=? OR gtin_unit=?
           OR LTRIM(upc_unit,'0')=LTRIM(?,'0')
           OR LTRIM(gtin_unit,'0')=LTRIM(?,'0'))
         AND product_status!=? LIMIT 1`,
      [barcode, barcode, barcode, barcode, 'D']
    );
  }
  function findCustomProductByBarcode(barcode) {
    return get(
      `SELECT * FROM custom_products
       WHERE upc=? OR LTRIM(upc,'0')=LTRIM(?,'0') LIMIT 1`,
      [barcode, barcode]
    );
  }
  function saveCustomProduct(p) {
    if (p.upc) {
      const existing = findCustomProductByBarcode(p.upc);
      if (existing) {
        run('UPDATE custom_products SET description=?,price=?,gst_applicable=?,pst_applicable=? WHERE upc=?',
          [p.description,p.price,p.gst_applicable?1:0,p.pst_applicable?1:0,p.upc]);
        return existing.custom_product_id;
      }
    }
    run('INSERT INTO custom_products(description,upc,price,gst_applicable,pst_applicable,created_by) VALUES(?,?,?,?,?,?)',
      [p.description,p.upc||null,p.price,p.gst_applicable?1:0,p.pst_applicable?1:0,p.created_by||null]);
    return lastInsertId();
  }
  function getAllCustomProducts() {
    return all('SELECT * FROM custom_products ORDER BY description');
  }
  function deleteCustomProduct(id) {
    run('DELETE FROM custom_products WHERE custom_product_id=?', [id]);
  }

  /* ---- Catalog upsert (WEBCAT sync) ---- */
  function upsertProducts(products) {
    const now = localISOStr();
    const stmt = _db.prepare(`
      INSERT INTO products(mckesson_item_no,description,upc_unit,gtin_unit,din,
        suggested_retail,regular_unit_price,gst_applicable,pst_applicable,
        narcotic_indicator,product_status,last_synced)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(mckesson_item_no) DO UPDATE SET
        description=excluded.description,
        upc_unit=excluded.upc_unit,
        gtin_unit=excluded.gtin_unit,
        din=excluded.din,
        suggested_retail=excluded.suggested_retail,
        regular_unit_price=excluded.regular_unit_price,
        gst_applicable=excluded.gst_applicable,
        pst_applicable=excluded.pst_applicable,
        narcotic_indicator=excluded.narcotic_indicator,
        product_status=excluded.product_status,
        last_synced=excluded.last_synced
    `);
    _db.run('BEGIN');
    for (const p of products) {
      stmt.run([p.mckesson_item_no,p.description,p.upc_unit,p.gtin_unit,p.din,
                p.suggested_retail,p.regular_unit_price,p.gst_applicable?1:0,
                p.pst_applicable?1:0,p.narcotic_indicator,p.product_status,now]);
    }
    _db.run('COMMIT');
    stmt.free();
    _persist();
  }
  function upsertProductsSelective(products, opts = {}) {
    const now = localISOStr();
    const { newItems = true, prices = true, descriptions = true, taxFlags = true } = opts;
    const updateParts = [];
    if (prices)       updateParts.push('suggested_retail=excluded.suggested_retail, regular_unit_price=excluded.regular_unit_price');
    if (descriptions) updateParts.push('description=excluded.description, upc_unit=excluded.upc_unit, gtin_unit=excluded.gtin_unit, din=excluded.din');
    if (taxFlags)     updateParts.push('gst_applicable=excluded.gst_applicable, pst_applicable=excluded.pst_applicable');
    updateParts.push('narcotic_indicator=excluded.narcotic_indicator, product_status=excluded.product_status, last_synced=excluded.last_synced');

    const onConflict = updateParts.length
      ? `DO UPDATE SET ${updateParts.join(', ')}`
      : 'DO NOTHING';

    const sql = `INSERT INTO products(mckesson_item_no,description,upc_unit,gtin_unit,din,
        suggested_retail,regular_unit_price,gst_applicable,pst_applicable,
        narcotic_indicator,product_status,last_synced)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(mckesson_item_no) ${onConflict}`;

    if (newItems) {
      const stmt = _db.prepare(sql);
      _db.run('BEGIN');
      for (const p of products) {
        stmt.run([p.mckesson_item_no,p.description,p.upc_unit,p.gtin_unit,p.din,
                  p.suggested_retail,p.regular_unit_price,p.gst_applicable?1:0,
                  p.pst_applicable?1:0,p.narcotic_indicator,p.product_status,now]);
      }
      _db.run('COMMIT');
      stmt.free();
    } else {
      // Update existing only — skip INSERT for new items
      if (updateParts.length > 1) {
        const updateSql = `UPDATE products SET ${updateParts.slice(0,-1).join(', ')
          .replace(/excluded\./g,'')}, last_synced=?
          WHERE mckesson_item_no=?`;
        const stmt = _db.prepare(updateSql);
        _db.run('BEGIN');
        for (const p of products) {
          const vals = [];
          if (prices)       vals.push(p.suggested_retail, p.regular_unit_price);
          if (descriptions) vals.push(p.description, p.upc_unit, p.gtin_unit, p.din);
          if (taxFlags)     vals.push(p.gst_applicable?1:0, p.pst_applicable?1:0);
          vals.push(now, p.mckesson_item_no);
          stmt.run(vals);
        }
        _db.run('COMMIT');
        stmt.free();
      }
    }
    _persist();
  }

  function getProductCount() {
    return get('SELECT COUNT(*) as c FROM products')?.c || 0;
  }
  function getLastSyncTime() {
    return get('SELECT MAX(last_synced) as t FROM products')?.t || null;
  }

  /* ---- Product queries ---- */
  function searchProducts(term, limit = 80) {
    const t = `%${term}%`;
    return all(`SELECT * FROM products WHERE (description LIKE ? OR upc_unit LIKE ? OR din LIKE ? OR mckesson_item_no LIKE ?)
                AND product_status != 'D' ORDER BY description LIMIT ?`, [t, t, t, t, limit]);
  }
  function updateCustomProduct(id, p) {
    run(`UPDATE custom_products SET description=?,upc=?,price=?,gst_applicable=?,pst_applicable=?,
         qty_on_hand=?,qty_threshold=?,location=?,notes=? WHERE custom_product_id=?`,
      [p.description, p.upc||null, p.price, p.gst_applicable?1:0, p.pst_applicable?1:0,
       p.qty_on_hand??null, p.qty_threshold??null, p.location||null, p.notes||null, id]);
  }

  function updateCatalogProduct(id, p) {
    const sets = ['price_override=?','gst_applicable=?','pst_applicable=?',
                  'qty_on_hand=?','qty_threshold=?','location=?','notes=?'];
    const vals = [p.price_override??null, p.gst_applicable?1:0, p.pst_applicable?1:0,
                  p.qty_on_hand??null, p.qty_threshold??null, p.location||null, p.notes||null];
    if (p.description !== undefined) { sets.push('description=?'); vals.push(p.description||null); }
    if (p.upc_unit    !== undefined) { sets.push('upc_unit=?');    vals.push(p.upc_unit||null); }
    vals.push(id);
    run(`UPDATE products SET ${sets.join(',')} WHERE product_id=?`, vals);
  }

  function exportDb() {
    return _db ? _db.export() : null;
  }

  function adjustStock(source, id, delta) {
    if (source === 'custom') {
      run('UPDATE custom_products SET qty_on_hand = COALESCE(qty_on_hand,0) + ? WHERE custom_product_id=?', [delta, id]);
    } else {
      run('UPDATE products SET qty_on_hand = COALESCE(qty_on_hand,0) + ? WHERE product_id=?', [delta, id]);
    }
  }

  function getLowStockProducts() {
    const catalog = all(`SELECT product_id as id,'catalog' as source, description, upc_unit as upc,
      COALESCE(price_override, suggested_retail, regular_unit_price) as price,
      qty_on_hand, qty_threshold, location
      FROM products WHERE qty_threshold IS NOT NULL AND qty_on_hand IS NOT NULL
        AND qty_on_hand <= qty_threshold ORDER BY description`);
    const custom = all(`SELECT custom_product_id as id,'custom' as source, description, upc,
      price, qty_on_hand, qty_threshold, location
      FROM custom_products WHERE qty_threshold IS NOT NULL AND qty_on_hand IS NOT NULL
        AND qty_on_hand <= qty_threshold ORDER BY description`);
    return [...catalog, ...custom];
  }

  /* ---- Reports ---- */
  function getSalesSummary(fromDate, toDate) {
    return get(`SELECT
      COUNT(*) as txn_count,
      COALESCE(SUM(CASE WHEN status!='REVERSED' THEN total_amount ELSE 0 END),0) as gross_sales,
      COALESCE(SUM(CASE WHEN status!='REVERSED' THEN gst_amount   ELSE 0 END),0) as total_gst,
      COALESCE(SUM(CASE WHEN status!='REVERSED' THEN pst_amount   ELSE 0 END),0) as total_pst,
      COALESCE(SUM(CASE WHEN status!='REVERSED' THEN subtotal     ELSE 0 END),0) as total_subtotal,
      COALESCE(SUM(CASE WHEN status='REVERSED'  THEN total_amount ELSE 0 END),0) as voided_amount,
      COUNT(CASE WHEN status='REVERSED' THEN 1 END) as voided_count
      FROM transactions WHERE date(transaction_date) BETWEEN date(?) AND date(?)`,
      [fromDate, toDate]);
  }
  function getSalesByMethod(fromDate, toDate) {
    return all(`SELECT p.method, COALESCE(SUM(p.amount),0) as total, COUNT(*) as count
      FROM payments p JOIN transactions t ON p.transaction_id=t.transaction_id
      WHERE date(t.transaction_date) BETWEEN date(?) AND date(?) AND t.status!='REVERSED'
      GROUP BY p.method ORDER BY total DESC`, [fromDate, toDate]);
  }
  function getSoldProducts(fromDate, toDate) {
    return all(`SELECT ti.description, ti.din, ti.item_type, ti.upc,
      COALESCE(SUM(ti.quantity),0) as qty_sold,
      COALESCE(SUM(ti.line_total),0) as total_revenue
      FROM transaction_items ti JOIN transactions t ON ti.transaction_id=t.transaction_id
      WHERE date(t.transaction_date) BETWEEN date(?) AND date(?) AND t.status!='REVERSED'
      GROUP BY ti.description, ti.din ORDER BY qty_sold DESC`, [fromDate, toDate]);
  }
  function getTransactionsInRange(fromDate, toDate) {
    return all(`SELECT * FROM transactions WHERE date(transaction_date) BETWEEN date(?) AND date(?)
      ORDER BY transaction_date DESC`, [fromDate, toDate]);
  }

  /* Search all transactions that contain a specific Rx number */
  function searchTransactionsByRx(rxNumber) {
    return all(`
      SELECT t.*,
             ti.rx_number, ti.description AS rx_description, ti.branch_code,
             p.given_name, p.surname, p.phn
      FROM transactions t
      JOIN transaction_items ti ON ti.transaction_id = t.transaction_id
      LEFT JOIN patients p ON p.patient_id = t.patient_id
      WHERE ti.item_type = 'RX' AND ti.rx_number = ?
      ORDER BY t.transaction_date DESC
      LIMIT 50
    `, [String(rxNumber).replace(/^0+/, '') || String(rxNumber)]);
  }

  /* Link (or unlink) a patient to an existing transaction */
  function linkPatientToTransaction(txnId, patientId) {
    run(`UPDATE transactions SET patient_id = ? WHERE transaction_id = ?`,
        [patientId || null, txnId]);
  }

  /* ---- AR summary ---- */
  function getPatientARSummary(patientId) {
    const billed = get('SELECT COALESCE(SUM(total_amount),0) as total FROM transactions WHERE patient_id=? AND status!=?',
      [patientId, 'REVERSED'])?.total || 0;
    const paid = get('SELECT COALESCE(SUM(amount),0) as total FROM payments p JOIN transactions t ON p.transaction_id=t.transaction_id WHERE t.patient_id=? AND t.status!=?',
      [patientId, 'REVERSED'])?.total || 0;
    const outstanding = get('SELECT COALESCE(SUM(balance_owing),0) as total FROM transactions WHERE patient_id=? AND status IN (?,?)',
      [patientId, 'PENDING', 'PARTIAL'])?.total || 0;
    return { billed, paid, outstanding };
  }

  /* ---- Shifts ---- */
  function openShift(staffId, staffName, openingFloat) {
    run(`INSERT INTO shifts(staff_id,staff_name,opened_at,opening_float,status)
         VALUES(?,?,?,?,'OPEN')`, [staffId||null, staffName||null, localISOStr(), openingFloat||0]);
    return lastInsertId();
  }
  function closeShift(shiftId, countedCash, notes) {
    run(`UPDATE shifts SET closed_at=?,closing_counted=?,closing_notes=?,status='CLOSED'
         WHERE shift_id=?`, [localISOStr(), countedCash, notes||null, shiftId]);
  }
  function getActiveShift() {
    return get("SELECT * FROM shifts WHERE status='OPEN' ORDER BY opened_at DESC LIMIT 1");
  }
  function getShiftHistory(limit = 30) {
    return all('SELECT * FROM shifts ORDER BY opened_at DESC LIMIT ?', [limit]);
  }
  function recordCashMovement(shiftId, type, amount, reason, staffName) {
    run(`INSERT INTO cash_movements(shift_id,movement_date,movement_type,amount,reason,staff_name)
         VALUES(?,?,?,?,?,?)`, [shiftId, localISOStr(), type, amount, reason||null, staffName||null]);
    return lastInsertId();
  }
  function getCashMovements(shiftId) {
    return all('SELECT * FROM cash_movements WHERE shift_id=? ORDER BY movement_date', [shiftId]);
  }
  function getShiftSummary(shiftId) {
    const shift = get('SELECT * FROM shifts WHERE shift_id=?', [shiftId]);
    if (!shift) return null;
    const endTime = shift.closed_at || localISOStr();
    const txnSummary = get(`
      SELECT
        COUNT(*) as txn_count,
        COALESCE(SUM(CASE WHEN status!='REVERSED' THEN total_amount ELSE 0 END),0) as total_sales,
        COALESCE(SUM(CASE WHEN status='REVERSED'  THEN total_amount ELSE 0 END),0) as voided_amount,
        COUNT(CASE WHEN status='REVERSED' THEN 1 END) as voided_count
      FROM transactions
      WHERE transaction_date >= ? AND transaction_date <= ?`,
      [shift.opened_at, endTime]);
    const byMethod = all(`
      SELECT p.method, COALESCE(SUM(p.amount),0) as total, COUNT(*) as count
      FROM payments p JOIN transactions t ON p.transaction_id=t.transaction_id
      WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.status!='REVERSED'
      GROUP BY p.method ORDER BY total DESC`,
      [shift.opened_at, endTime]);
    const movements  = getCashMovements(shiftId);
    const cashIn     = movements.filter(m => m.movement_type === 'CASH_IN').reduce((s,m) => s+m.amount, 0);
    const cashOut    = movements.filter(m => m.movement_type === 'CASH_OUT').reduce((s,m) => s+m.amount, 0);
    const cashSales  = byMethod.find(m => m.method === 'CASH')?.total || 0;
    const expectedCash = Math.round(((shift.opening_float||0) + cashSales + cashIn - cashOut) * 100) / 100;
    return { shift, txnSummary, byMethod, movements, cashIn, cashOut, cashSales, expectedCash };
  }

  /* ---- Audit log ---- */
  function logEvent(staffPin, eventType, description, transactionId) {
    run(`INSERT INTO audit_log(event_time,staff_pin,event_type,description,transaction_id)
         VALUES(?,?,?,?,?)`,
      [localISOStr(), staffPin||null, eventType, description, transactionId||null]);
  }

  return {
    init, run, all, get, lastInsertId,
    getStaffByPin, getAllStaff, createStaff, updateStaff, updateStaffPin, deactivateStaff, reactivateStaff, hasAnyStaff,
    upsertPatient, getPatient, getPatientByPhn, searchPatients,
    createTransaction, updateTransactionStatus, getTransaction,
    getTransactionsForPatient, getTransactionsForDate, reverseTransaction,
    addTransactionItem, getItemsForTransaction,
    addPayment, getPaymentsForTransaction,
    findProductByBarcode, findCustomProductByBarcode, saveCustomProduct,
    getAllCustomProducts, deleteCustomProduct, updateCustomProduct,
    exportDb, updateCatalogProduct, adjustStock, getLowStockProducts, searchProducts,
    upsertProducts, upsertProductsSelective, getProductCount, getLastSyncTime,
    getSalesSummary, getSalesByMethod, getSoldProducts, getTransactionsInRange,
    searchTransactionsByRx, linkPatientToTransaction,
    getPatientARSummary, logEvent,
    openShift, closeShift, getActiveShift, getShiftHistory,
    recordCashMovement, getCashMovements, getShiftSummary,
  };
})();
