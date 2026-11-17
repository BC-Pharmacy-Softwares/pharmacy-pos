/* The WinRx SQL connection in electron-app/main.js.
   Run:  node tests/sql-pool.test.js

   Reported from the floor: Accounts Receivable showed
       WinRx unavailable: API error 500: {"error":"Connection is closed."}
   Cause: the app used mssql's GLOBAL pool, and `sql.connect(config)` ignores
   its config when a global pool already exists — it returns the live one. The
   Settings "Test Connection" button did connect-then-close, so TESTING the
   connection CLOSED it, and nothing reconnected until the app restarted.

   No SQL Server is available here, so the library is a fake that copies the
   two behaviours that matter from mssql 10's lib/global-connection.js (read
   from the real package): connect() reuses the global pool, and a closed pool
   refuses requests with "Connection is closed.". */

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

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

/* ── A stand-in for mssql ───────────────────────────────────────────────── */
function fakeMssql() {
  const state = { down: false, badUser: null, made: [] };
  class ConnectionPool {
    constructor(cfg) { this.config = cfg; this.connected = false; this.listeners = {}; state.made.push(this); }
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return this; }
    async connect() {
      if (state.down) throw new Error('Failed to connect to server');
      if (state.badUser && this.config.user === state.badUser) throw new Error('Login failed for user');
      this.connected = true; return this;
    }
    async close() { this.connected = false; }
    request() {
      if (!this.connected) throw new Error('Connection is closed.');
      return { query: async () => ({ recordset: [{ ok: 1 }] }) };
    }
  }
  let globalPool = null;
  // Same shape as mssql's global connect(): config is IGNORED when a global
  // pool exists, and close() on it clears the global.
  const connect = async (cfg) => {
    if (!globalPool) {
      globalPool = new ConnectionPool(cfg);
      const og = globalPool.close.bind(globalPool);
      globalPool.close = async () => { globalPool = null; return og(); };
    }
    return globalPool.connect();
  };
  return { ConnectionPool, connect, state };
}

/* ── The real code, lifted out of main.js ───────────────────────────────── */
const mainSrc = fs.readFileSync(path.join(ROOT, 'electron-app/main.js'), 'utf8');
const block   = mainSrc.slice(mainSrc.indexOf('/* SQL-POOL-BEGIN'), mainSrc.indexOf('/* SQL-POOL-END */'));
check('the SQL pool block was found in main.js', block.length > 500);

function load(sqlLib, configOnDisk) {
  const fakeFs = { readFileSync: () => JSON.stringify(configOnDisk) };
  const quiet  = { log() {}, error() {}, warn() {} };
  return new Function('require', 'getSqlConfigPath', 'fs', 'console',
    'let sqlPool = null;\n' + block + `
    return {
      connectSQL, ensureSqlPool, testSqlConnection, sqlPoolIsLive,
      get pool() { return sqlPool; },
      get lastConfig() { return lastSqlConfig; },
      COOLDOWN: SQL_RETRY_COOLDOWN_MS,
    };`
  )(() => sqlLib, () => (configOnDisk ? '/fake/sql-config.json' : null), fakeFs, quiet);
}

const CFG  = { server: 'WINRX-PC', database: 'winrxdata', user: 'pos_reader', password: 'test-only' };
const CFG2 = { server: 'WINRX-PC', database: 'winrxdata', user: 'someone_else', password: 'test-only' };

(async () => {

  console.log('\nthe root cause, reproduced with the OLD code');
  {
    const sql  = fakeMssql();
    const live = await sql.connect(CFG);                       // app start-up
    // The old "Test Connection" handler, verbatim in shape:
    const testPool = await sql.connect(CFG2);
    check('sql.connect() hands back the LIVE pool, ignoring the new config', testPool === live);
    await testPool.close();
    let msg = null;
    try { live.request(); } catch (e) { msg = e.message; }
    eq('…so closing the "test" pool kills every later lookup', msg, 'Connection is closed.');
  }

  console.log('\nconnecting');
  {
    const sql = fakeMssql();
    const m   = load(sql, CFG);
    await m.connectSQL();
    check('connected from the config file', m.sqlPoolIsLive());
    eq('the config is remembered for reconnects', m.lastConfig.server, 'WINRX-PC');
    check('the pool has an error listener (an idle error must not crash the app)',
      (m.pool.listeners.error || []).length === 1);
    eq('driver options applied', m.pool.config.options,
      { trustServerCertificate: true, enableArithAbort: true });
  }

  console.log('\nTest Connection never touches the live pool');
  {
    const sql = fakeMssql();
    const m   = load(sql, CFG);
    await m.connectSQL();
    const live = m.pool;

    const r = await m.testSqlConnection(CFG2);
    eq('a good test reports success', r.ok, true);
    check('the live pool is still connected', live.connected === true && m.pool === live);
    check('a lookup still works afterwards', !!live.request());
    eq('the test used its own pool', sql.state.made.length, 2);
    eq('and closed it', sql.state.made[1].connected, false);

    sql.state.badUser = 'someone_else';
    const bad = await m.testSqlConnection(CFG2);
    eq('a failed test reports the reason', [bad.ok, bad.message], [false, 'Login failed for user']);
    check('the live pool survives a FAILED test too', live.connected === true && m.pool === live);
    check('ten tests in a row leave it alone', await (async () => {
      sql.state.badUser = null;
      for (let i = 0; i < 10; i++) await m.testSqlConnection(CFG2);
      return live.connected === true && m.pool === live;
    })());
  }

  console.log('\na closed pool heals itself');
  {
    const sql = fakeMssql();
    const m   = load(sql, CFG);
    await m.connectSQL();
    const first = m.pool;

    eq('a live pool needs no reconnect', await m.ensureSqlPool(), true);
    eq('and none was made', sql.state.made.length, 1);

    await first.close();                                        // lost / closed
    check('it is reported as NOT live', m.sqlPoolIsLive() === false);
    eq('ensureSqlPool brings it back', await m.ensureSqlPool(), true);
    check('with a NEW pool', m.pool !== first && m.pool.connected);
    eq('using the remembered credentials', m.pool.config.user, 'pos_reader');
    check('and a lookup works again', !!m.pool.request());
  }

  console.log('\nconcurrent lookups share one reconnect');
  {
    const sql = fakeMssql();
    const m   = load(sql, CFG);
    await m.connectSQL();
    await m.pool.close();
    const before  = sql.state.made.length;
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => m.ensureSqlPool()));
    eq('all six succeed', results, [true, true, true, true, true, true]);
    eq('with exactly ONE new pool', sql.state.made.length - before, 1);
  }

  console.log('\nWinRx down: fail fast, then recover without a restart');
  {
    const realNow = Date.now;
    let now = 1000000;
    Date.now = () => now;
    try {
      const sql = fakeMssql();
      const m   = load(sql, CFG);
      await m.connectSQL();
      await m.pool.close();
      sql.state.down = true;

      eq('a reconnect that fails reports false', await m.ensureSqlPool(), false);
      const attempts = sql.state.made.length;
      eq('a lookup straight after does not wait on another attempt', await m.ensureSqlPool(), false);
      eq('no new attempt was made during the cool-down', sql.state.made.length, attempts);

      now += m.COOLDOWN + 1;
      eq('after the cool-down it tries again (still down)', await m.ensureSqlPool(), false);
      eq('one more attempt', sql.state.made.length, attempts + 1);

      sql.state.down = false;                                   // WinRx PC back on
      now += m.COOLDOWN + 1;
      eq('once the server is back, the next lookup reconnects', await m.ensureSqlPool(), true);
      check('and lookups work', !!m.pool.request());
    } finally { Date.now = realNow; }
  }

  console.log('\nWinRx off when the app STARTS');
  {
    const sql = fakeMssql();
    sql.state.down = true;
    const m = load(sql, CFG);
    await m.connectSQL();
    check('start-up connect fails cleanly', m.pool === null);
    check('but the config is kept, so the routes can still be registered', !!m.lastConfig);
    sql.state.down = false;
    eq('the first lookup after WinRx comes up connects', await m.ensureSqlPool(), true);
  }

  console.log('\nno configuration at all');
  {
    const sql = fakeMssql();
    const m   = load(sql, null);
    await m.connectSQL();
    check('no pool, no crash', m.pool === null && m.lastConfig === null);
    eq('ensureSqlPool reports false', await m.ensureSqlPool(), false);
    eq('and never opened a pool', sql.state.made.length, 0);
  }

  console.log('\nsaving new credentials replaces the pool');
  {
    const sql = fakeMssql();
    const m   = load(sql, CFG);
    await m.connectSQL();
    const old = m.pool;
    await m.connectSQL(CFG2);
    check('the old pool was closed', old.connected === false);
    eq('the new pool uses the new credentials', m.pool.config.user, 'someone_else');
    eq('and they are what a reconnect will use', m.lastConfig.user, 'someone_else');
  }

  console.log('\nmain.js wiring');
  check('the global sql.connect() is gone from main.js', !/\bsql\.connect\(/.test(mainSrc.replace(block, '')));
  check('Test Connection uses the isolated tester',
    /ipcMain\.handle\('test-sql-connection'[\s\S]{0,200}testSqlConnection\(/.test(mainSrc));
  check('Settings is told the truth about the connection',
    mainSrc.includes('connected: sqlPoolIsLive(),') && !mainSrc.includes('connected: !!sqlPool,'));
  // Every route that queries WinRx must sit behind the reconnect middleware.
  const routeRe = /expressApp\.(?:post|get|all)\('([^']+)'/g;
  const listed  = (mainSrc.match(/const SQL_ROUTES = \[([\s\S]*?)\];/) || [, ''])[1];
  const missing = [];
  let mm;
  while ((mm = routeRe.exec(mainSrc))) {
    const route = mm[1];
    const start = mm.index;
    const next  = mainSrc.indexOf('expressApp.', start + 10);
    const body  = mainSrc.slice(start, next === -1 ? undefined : next);
    if (/sqlPool\.request\(\)/.test(body) && !listed.includes(`'${route}'`)) missing.push(route);
  }
  eq('every WinRx route is covered by the reconnect check', missing, []);
  check('a failed reconnect answers 503 with a sentence naming the fix',
    /status\(503\)[\s\S]{0,300}WinRx & McKesson → WinRx Connection/.test(mainSrc));
  check('routes are registered once, however often Settings is saved',
    /if \(sqlRoutesAdded\) return;/.test(mainSrc));

  console.log('\nthe screen shows the sentence, not raw JSON');
  const pd = fs.readFileSync(path.join(ROOT, 'js/api/pharmacy-dashboard.js'), 'utf8');
  check('the error body is unwrapped', /JSON\.parse\(text\)\?\.error/.test(pd));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
