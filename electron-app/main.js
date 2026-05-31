/**
 * Pharmacy POS — Electron main process
 *
 * Starts a local Express server that:
 *   1. Serves the HTML/JS app files (static)
 *   2. Provides /getPatient, /getRxTx etc. routes that query WinRx SQL Server directly
 *
 * If sql-config.json exists and SQL connects successfully, all patient/Rx lookups
 * go straight to the local WinRx database — no Cloudflare Worker needed.
 *
 * If SQL is not configured, the app falls back to the Cloudflare Worker as usual.
 */

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const express    = require('express');
const path       = require('path');
const http       = require('http');
const fs         = require('fs');
const nodemailer = require('nodemailer');
const { spawn }  = require('child_process');

let mainWindow    = null;
let server        = null;
let sqlPool       = null;
let cloverProcess = null;

/* ------------------------------------------------------------------
   Start Clover Local Pay bridge (clover-local-pay/server.js)
   Runs as a background child process — killed when app closes.
------------------------------------------------------------------ */
function startCloverBridge() {
  const cloverDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'clover-local-pay')
    : path.join(__dirname, '..', 'clover-local-pay');

  const serverJs  = path.join(cloverDir, 'server.js');
  if (!fs.existsSync(serverJs)) {
    console.log('Clover bridge not found — skipping.');
    return;
  }

  // Check .env exists and has a real IP set
  const envPath = path.join(cloverDir, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('CLOVER_DEVICE_IP=192.168.1.100') ||
        !envContent.match(/CLOVER_DEVICE_IP=\d+\.\d+\.\d+\.\d+/)) {
      console.log('Clover bridge: no real device IP configured — skipping.');
      return;
    }
  }

  console.log('Starting Clover Local Pay bridge...');
  cloverProcess = spawn(process.execPath.replace('Pharmacy POS.exe', 'node.exe')
      .replace(/[^/\\]*\.exe$/, 'node.exe'),
    [serverJs], {
    cwd:   cloverDir,
    env:   { ...process.env },
    stdio: 'ignore',
    detached: false,
  });

  cloverProcess.on('error', (err) => {
    // node not found via that path — try system node
    console.warn('Clover bridge spawn error:', err.message, '— trying system node');
    cloverProcess = spawn('node', [serverJs], {
      cwd: cloverDir, env: { ...process.env }, stdio: 'ignore', detached: false,
    });
    cloverProcess.on('error', e => console.warn('Clover bridge unavailable:', e.message));
  });

  cloverProcess.on('exit', (code) => {
    console.log('Clover bridge exited with code', code);
    cloverProcess = null;
  });
}

/* ------------------------------------------------------------------
   App file location
   • Packaged → <install>/resources/app/
   • Dev       → parent folder (pharmacy-pos/)
------------------------------------------------------------------ */
function getAppDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..');
}

/* ------------------------------------------------------------------
   Find sql-config.json
   Checks next to the exe first, then the electron-app dev folder.
------------------------------------------------------------------ */
function getSqlConfigPath() {
  const candidates = [
    path.join(app.getPath('userData'), 'sql-config.json'), // %AppData%\pharmacy-pos\
    path.join(process.resourcesPath || __dirname, 'sql-config.json'), // packaged
    path.join(__dirname, 'sql-config.json'),               // dev
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

/* ------------------------------------------------------------------
   Connect to WinRx SQL Server
------------------------------------------------------------------ */
async function connectSQL(configOverride) {
  // Close existing pool if reconnecting
  if (sqlPool) {
    try { await sqlPool.close(); } catch (_) {}
    sqlPool = null;
  }

  let config = configOverride;
  if (!config) {
    const configPath = getSqlConfigPath();
    if (!configPath) {
      console.log('sql-config.json not found — running without local SQL (will use Cloudflare Worker)');
      return;
    }
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.error('Failed to read sql-config.json:', e.message);
      return;
    }
  }

  try {
    const sql = require('mssql');
    sqlPool = await sql.connect({
      server:   config.server,
      database: config.database,
      user:     config.user,
      password: config.password,
      options: {
        trustServerCertificate: true,
        enableArithAbort:       true,
      },
    });
    console.log('✓ Connected to WinRx SQL Server:', config.server, '/', config.database);
  } catch (e) {
    console.error('✗ WinRx SQL connection failed:', e.message);
    sqlPool = null;
  }
}

/* ------------------------------------------------------------------
   IPC handlers — called from Settings → SQL Connection tab
------------------------------------------------------------------ */
function registerIpcHandlers() {
  // Generate a real PDF from receipt HTML using Chromium's print engine.
  // Uses a temp file (NOT data: URL) so large logos don't hit Chromium's 2MB limit.
  ipcMain.handle('generate-receipt-pdf', async (_, htmlDocument) => {
    const os   = require('os');
    return new Promise((resolve) => {
      let win;
      let tmpFile;
      try {
        tmpFile = path.join(os.tmpdir(), 'pos-rcpt-' + Date.now() + '.html');
        fs.writeFileSync(tmpFile, htmlDocument, 'utf8');

        // 302 px wide = 80 mm at 96 dpi — matches the thermal wrapper width
        win = new BrowserWindow({
          show:   false,
          width:  302,
          height: 800,
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        });

        win.loadFile(tmpFile);

        win.webContents.once('did-finish-load', async () => {
          // Wait for layout/paint to complete before capturing
          await new Promise(r => setTimeout(r, 500));
          try {
            const pdfBuffer = await win.webContents.printToPDF({
              marginsType:       1,                                   // no margins
              pageSize:          { width: 80000, height: 2000000 },  // 80mm × 2m roll
              printBackground:   true,
              landscape:         false,
              preferCSSPageSize: false,
            });
            win.close();
            try { fs.unlinkSync(tmpFile); } catch (_) {}
            resolve(Buffer.from(pdfBuffer).toString('base64'));
          } catch (e) {
            console.error('generate-receipt-pdf printToPDF error:', e.message);
            try { win.close(); } catch (_) {}
            try { fs.unlinkSync(tmpFile); } catch (_) {}
            resolve(null);
          }
        });

        win.webContents.once('did-fail-load', () => {
          console.error('generate-receipt-pdf: page failed to load');
          try { win.close(); } catch (_) {}
          try { fs.unlinkSync(tmpFile); } catch (_) {}
          resolve(null);
        });
      } catch (e) {
        console.error('generate-receipt-pdf error:', e.message);
        try { if (win) win.close(); } catch (_) {}
        try { if (tmpFile) fs.unlinkSync(tmpFile); } catch (_) {}
        resolve(null);
      }
    });
  });

  // Generate an A5 PDF — used for WinRx document inbox folder drop.
  // Uses a temp file (avoids 2 MB data: URL limit) and waits for two
  // animation frames to guarantee Chromium has fully painted the page.
  ipcMain.handle('generate-a5-pdf', async (_, htmlDocument) => {
    const os = require('os');

    return new Promise((resolve) => {
      let win;
      let tmpFile;
      try {
        // Write HTML to temp file so loadFile() can read it
        tmpFile = path.join(os.tmpdir(), 'pos-a5-' + Date.now() + '.html');
        fs.writeFileSync(tmpFile, htmlDocument, 'utf8');
        console.log('generate-a5-pdf: wrote', tmpFile, fs.statSync(tmpFile).size, 'bytes');

        // Use a generous window size — content uses CSS % widths so pixel size
        // doesn't affect layout; we just need the window to exist so Chromium renders
        win = new BrowserWindow({
          show:   false,
          width:  794,   // A5 at 96 dpi = 559 px; use 794 (A4 width) for headroom
          height: 1123,  // A4 height at 96 dpi — content is paginated by @page CSS
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        });

        win.loadFile(tmpFile);

        win.webContents.once('did-finish-load', async () => {
          console.log('generate-a5-pdf: did-finish-load fired');
          try {
            // Wait for two paint frames — more reliable than a fixed timeout
            await win.webContents.executeJavaScript(
              'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'
            );
            // Small extra buffer for any deferred layout
            await new Promise(r => setTimeout(r, 200));

            const pdfBuffer = await win.webContents.printToPDF({
              marginsType:       1,     // no Electron margins — @page CSS handles margins
              preferCSSPageSize: true,  // use @page{size:A5 portrait} from the HTML
              printBackground:   true,
              landscape:         false,
            });

            console.log('generate-a5-pdf: PDF size', pdfBuffer.length, 'bytes');
            win.close();
            try { fs.unlinkSync(tmpFile); } catch (_) {}
            resolve(Buffer.from(pdfBuffer).toString('base64'));
          } catch (e) {
            console.error('generate-a5-pdf printToPDF error:', e.message);
            try { win.close(); } catch (_) {}
            try { fs.unlinkSync(tmpFile); } catch (_) {}
            resolve(null);
          }
        });

        win.webContents.once('did-fail-load', (ev, code, desc) => {
          console.error('generate-a5-pdf: page failed to load —', code, desc);
          try { win.close(); } catch (_) {}
          try { fs.unlinkSync(tmpFile); } catch (_) {}
          resolve(null);
        });

      } catch (e) {
        console.error('generate-a5-pdf error:', e.message);
        try { if (win) win.close(); } catch (_) {}
        try { if (tmpFile) fs.unlinkSync(tmpFile); } catch (_) {}
        resolve(null);
      }
    });
  });

  // List installed printers available to Chromium
  ipcMain.handle('get-printers', async () => {
    if (!mainWindow) return [];
    try {
      const list = await mainWindow.webContents.getPrintersAsync();
      return list.map(p => ({
        name:      p.name,
        isDefault: p.isDefault || false,
        status:    p.status,          // 0 = idle/ready
      }));
    } catch (e) {
      console.error('get-printers error:', e.message);
      return [];
    }
  });

  // Print receipt HTML silently to a named printer (no dialog)
  ipcMain.handle('print-receipt-html', async (_, { html, printerName }) => {
    return new Promise((resolve) => {
      let win;
      try {
        win = new BrowserWindow({
          show:   false,
          width:  400,
          height: 1200,
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        });

        win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

        win.webContents.once('did-finish-load', () => {
          win.webContents.print(
            {
              silent:          true,
              printBackground: true,
              deviceName:      printerName,
              // No pageSize — let the printer driver use its own paper settings
              margins:         { marginType: 'printableArea' },
            },
            (success, failureReason) => {
              try { win.close(); } catch {}
              resolve({ ok: success, reason: failureReason || null });
            }
          );
        });

        win.webContents.once('did-fail-load', () => {
          try { win.close(); } catch {}
          resolve({ ok: false, reason: 'Page failed to load' });
        });
      } catch (e) {
        try { if (win) win.close(); } catch {}
        resolve({ ok: false, reason: e.message });
      }
    });
  });

  // Send email directly via SMTP (nodemailer) — no Cloudflare Worker needed
  ipcMain.handle('send-email', async (_, { smtpHost, smtpPort, smtpEncryption,
                                           smtpUser, smtpPass,
                                           fromEmail, fromName, replyTo,
                                           to, subject, htmlBody, textBody }) => {
    try {
      const enc = (smtpEncryption || 'starttls').toLowerCase();
      const transporter = nodemailer.createTransport({
        host:   smtpHost,
        port:   parseInt(smtpPort) || 587,
        secure: enc === 'ssl',          // true = TLS on connect (port 465)
        auth:   { user: smtpUser, pass: smtpPass },
        tls:    { rejectUnauthorized: false },   // accept self-signed certs on local servers
      });

      await transporter.sendMail({
        from:    fromName ? `"${fromName}" <${fromEmail || smtpUser}>` : (fromEmail || smtpUser),
        to,
        replyTo: replyTo || undefined,
        subject,
        html:    htmlBody  || undefined,
        text:    textBody  || undefined,
      });

      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Return current config (password masked)
  ipcMain.handle('get-sql-config', () => {
    const configPath = getSqlConfigPath();
    if (!configPath) return { server: '', database: 'winrxdata', user: '', password: '', connected: false };
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return {
        server:    cfg.server   || '',
        database:  cfg.database || 'winrxdata',
        user:      cfg.user     || '',
        password:  cfg.password || '',   // sent back so field isn't blank; stays local
        connected: !!sqlPool,
      };
    } catch (_) {
      return { server: '', database: 'winrxdata', user: '', password: '', connected: false };
    }
  });

  // Test a connection without saving or replacing the live pool
  ipcMain.handle('test-sql-connection', async (_, config) => {
    try {
      const sql  = require('mssql');
      const pool = await sql.connect({
        server:   config.server,
        database: config.database,
        user:     config.user,
        password: config.password,
        options:  { trustServerCertificate: true, enableArithAbort: true },
      });
      await pool.close();
      return { ok: true, message: `Connected to ${config.server} / ${config.database}` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });

  // Save config to sql-config.json and reconnect live pool
  ipcMain.handle('save-sql-config', async (_, config) => {
    try {
      // Write to userData path (writable in packaged app)
      const savePath = path.join(app.getPath('userData'), 'sql-config.json');
      fs.writeFileSync(savePath, JSON.stringify({
        server:   config.server,
        database: config.database,
        user:     config.user,
        password: config.password,
        options:  { trustServerCertificate: true, enableArithAbort: true },
      }, null, 2));

      // Reconnect with new credentials
      await connectSQL(config);

      if (!sqlPool) return { ok: false, message: 'Config saved but connection failed — check credentials.' };

      // Re-inject the local API URL into the open window
      if (mainWindow) {
        const port = server.address().port;
        mainWindow.webContents.executeJavaScript(
          `window.__WINRX_LOCAL_API__ = 'http://127.0.0.1:${port}';
           console.log('✓ WinRx SQL reconnected — local API active:', window.__WINRX_LOCAL_API__);`
        );
        // Also add SQL routes to the Express app if not already added
        if (_expressApp) addSqlRoutes(_expressApp);
      }

      return { ok: true, message: `Connected to ${config.server} / ${config.database}` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });
}

/* ------------------------------------------------------------------
   Map a PATIENT row → PD-compatible field names
   Full mapping of all Pharmacy Dashboard API getPatient response fields.
   Gracefully handles missing columns with null fallback.
------------------------------------------------------------------ */
function mapPatient(p) {
  const fmtDate = v => v instanceof Date ? v.toISOString().split('T')[0] : (v || null);
  return {
    PHN:       String(p.PANUM      || ''),
    SURNAME:   p.PASURNAME  || '',
    GIVEN:     p.PAGIVEN    || '',
    SEX:       p.PASEX      || null,               // M / F / U
    BIRTHDATE: fmtDate(p.PABIRTH),
    ADDR1:     p.PAADDR1    || null,
    ADDR2:     p.PAADDR2    || null,               // address line 2
    ADDR3:     p.PAADDR3    || null,               // address line 3
    CITY:      p.PACITY     || null,
    PROV:      p.PAPROV     || null,
    PC:        p.PAPC       || null,
    AREA:      p.PAAREA     || null,               // area code (3 digits)
    PHONE:     p.PAHOME     || p.PAPHONE || null,
    CELL:      p.PACELL     || null,
    EMAIL:     p.PAEMAIL    || null,
    ALLERGY:   p.PAALLERGY  || null,
    FACILITY:  p.PAFACIL    || p.PAHOME2 || null,  // facility code
    ROUTE:     p.PAROUTE    || null,               // delivery route
  };
}

/* ------------------------------------------------------------------
   Map a DRUG row → PD-compatible getDrug response fields
------------------------------------------------------------------ */
function mapDrug(d) {
  if (!d) return null;
  return {
    DIN:         d.DGDIN     != null ? Number(d.DGDIN)          : null,
    LocalDIN:    d.DGLDIN    != null ? Number(d.DGLDIN)         : null,
    GenericName: d.DGGNAME   || d.DGDESC  || null,
    TradeName:   d.DGDESC    || null,
    Manufacturer:d.DGMANUF   || d.DGMFR   || null,
    Form:        d.DGFORM    || null,
    PackSize:    d.DGSIZE    != null ? parseFloat(d.DGSIZE)     : null,
    Cost:        d.DGCOST    != null ? parseFloat(d.DGCOST)     : null,
    UnitCost:    d.DGUCOST   != null ? parseFloat(d.DGUCOST)    : null,
    InStock:     d.DGSTOCK   != null ? parseFloat(d.DGSTOCK)    : null,
  };
}

/* ------------------------------------------------------------------
   Add WinRx SQL API routes to Express
   These mirror the Cloudflare Worker endpoints exactly.
------------------------------------------------------------------ */
function addSqlRoutes(expressApp) {
  const sql = require('mssql');

  /* /ping — health check */
  expressApp.all('/ping', (req, res) => {
    res.json({ ok: true, sql: true, source: 'local-winrx' });
  });

  /* /getPatient — lookup single patient by PHN */
  expressApp.post('/getPatient', async (req, res) => {
    const { PHN } = req.body || {};
    if (!PHN) return res.status(400).json({ error: 'PHN required' });
    try {
      const result = await sqlPool.request()
        .input('phn', sql.VarChar, String(PHN))
        .query(`
          SELECT TOP 1
            PANUM, PAGIVEN, PASURNAME, PABIRTH,
            PAHOME, PAPHONE, PACELL, PAEMAIL,
            PAADDR1, PACITY, PAPROV, PAPC, PAALLERGY
          FROM PATIENT
          WHERE PANUM = @phn
        `);
      if (!result.recordset.length) return res.json({});
      res.json(mapPatient(result.recordset[0]));
    } catch (e) {
      console.error('/getPatient error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /* /getPatients — search by name, phone, or DOB */
  expressApp.post('/getPatients', async (req, res) => {
    const { NAME, PHONE, DOB } = req.body || {};
    try {
      const request = sqlPool.request();
      const conditions = ['1=1'];

      if (NAME) {
        conditions.push(`(PASURNAME LIKE @name + '%' OR PAGIVEN LIKE @name + '%'
          OR (PASURNAME + ' ' + PAGIVEN) LIKE '%' + @name + '%'
          OR (PAGIVEN + ' ' + PASURNAME) LIKE '%' + @name + '%')`);
        request.input('name', sql.VarChar, String(NAME).trim());
      }
      if (PHONE) {
        // Match last 7 digits of either phone field
        const ph = String(PHONE).replace(/\D/g, '').slice(-7);
        conditions.push(`(PAHOME LIKE '%' + @phone + '%'
          OR PACELL LIKE '%' + @phone + '%'
          OR PAPHONE LIKE '%' + @phone + '%')`);
        request.input('phone', sql.VarChar, ph);
      }
      if (DOB) {
        conditions.push(`CONVERT(date, PABIRTH) = @dob`);
        request.input('dob', sql.Date, new Date(DOB));
      }

      const result = await request.query(`
        SELECT TOP 30
          PANUM, PAGIVEN, PASURNAME, PABIRTH,
          PAHOME, PAPHONE, PACELL, PAEMAIL,
          PAADDR1, PACITY, PAPROV, PAPC, PAALLERGY
        FROM PATIENT
        WHERE ${conditions.join(' AND ')}
        ORDER BY PASURNAME, PAGIVEN
      `);
      res.json(result.recordset.map(mapPatient));
    } catch (e) {
      console.error('/getPatients error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /* /getRxTx — fill details + copay for a specific Rx number
     Strategy:
       1. Query RX table directly for patient PHN + drug (always present if Rx exists)
       2. Query TXNS for most recent copay/adjudication (may not exist for new Rx)
       3. Look up PATIENT by PHN separately (TRIM both sides for whitespace safety)
     This way a missing TXNS record never prevents patient auto-link. */
  expressApp.post('/getRxTx', async (req, res) => {
    const { NUM } = req.body || {};
    if (!NUM) return res.status(400).json({ error: 'NUM required' });
    const rxNum = parseFloat(NUM);
    console.log(`/getRxTx: looking up Rx ${rxNum}`);
    try {

      // ── Step 1: Query RX table for patient PHN + drug ───────────
      let rxRow = null;
      try {
        const r1 = await sqlPool.request()
          .input('rxnum', sql.Float, rxNum)
          .query(`
            SELECT TOP 1
              r.RXNUM,
              LTRIM(RTRIM(r.RXPANUM))   AS PHN,
              r.RXQTY                   AS REQTY,
              r.RXDAYS,
              r.RXLIM,
              r.RXSIG,
              r.ORIGDATE,
              CAST(d.DGDIN AS BIGINT)   AS DIN,
              d.DGDESC                  AS DRUG
            FROM RX r
            LEFT JOIN DRUG d ON d.DGDIN = r.RXDIN
            WHERE r.RXNUM = @rxnum
          `);
        if (r1.recordset.length) rxRow = r1.recordset[0];
      } catch (_drugErr) {
        console.warn('/getRxTx: DRUG join failed, retrying without drug:', _drugErr.message);
        try {
          const r1b = await sqlPool.request()
            .input('rxnum', sql.Float, rxNum)
            .query(`
              SELECT TOP 1
                RXNUM,
                LTRIM(RTRIM(RXPANUM)) AS PHN,
                RXQTY                 AS REQTY,
                RXDAYS,
                RXLIM
              FROM RX
              WHERE RXNUM = @rxnum
            `);
          if (r1b.recordset.length) rxRow = r1b.recordset[0];
        } catch (rxErr) {
          console.warn('/getRxTx: RX table query failed:', rxErr.message);
        }
      }

      if (!rxRow) {
        console.log(`/getRxTx: Rx ${rxNum} not found in RX table`);
        return res.json({});
      }
      console.log(`/getRxTx: RX row found — PHN="${rxRow.PHN}", DRUG="${rxRow.DRUG}"`);

      // ── Step 2: Get most recent copay from TXNS ──────────────────
      let txRow = null;
      try {
        const r2 = await sqlPool.request()
          .input('rxnum', sql.Float, rxNum)
          .query(`
            SELECT TOP 1
              AMT     AS RECOPAY,
              ADJDATE AS REEFDATE,
              PLANID
            FROM TXNS
            WHERE RX = @rxnum
            ORDER BY ADJDATE DESC
          `);
        if (r2.recordset.length) txRow = r2.recordset[0];
      } catch (txErr) {
        console.warn('/getRxTx: TXNS query failed (copay will be 0):', txErr.message);
      }

      // ── Step 3: Look up patient by PHN ───────────────────────────
      const phn = rxRow.PHN ? String(rxRow.PHN).trim() : null;
      let patientData = null;
      if (phn) {
        try {
          // Try exact match first, then numeric match (handles leading zero differences)
          const patResult = await sqlPool.request()
            .input('phn', sql.VarChar, phn)
            .query(`
              SELECT TOP 1
                PANUM, PAGIVEN, PASURNAME, PABIRTH,
                PAHOME, PACELL, PAEMAIL,
                PAADDR1, PACITY, PAPROV, PAPC, PAALLERGY
              FROM PATIENT
              WHERE LTRIM(RTRIM(PANUM)) = @phn
                 OR LTRIM(RTRIM(PANUM)) = LTRIM(RTRIM(@phn))
            `);
          if (patResult.recordset.length) {
            const p = patResult.recordset[0];
            const fmtDate = v => v instanceof Date ? v.toISOString().split('T')[0] : null;
            patientData = {
              PHN:       String(p.PANUM    || '').trim(),
              GIVEN:     p.PAGIVEN   || '',
              SURNAME:   p.PASURNAME || '',
              BIRTHDATE: fmtDate(p.PABIRTH),
              PHONE:     p.PAHOME    || p.PACELL || null,
              CELL:      p.PACELL    || null,
              EMAIL:     p.PAEMAIL   || null,
              ADDR1:     p.PAADDR1   || null,
              CITY:      p.PACITY    || null,
              PROV:      p.PAPROV    || null,
              PC:        p.PAPC      || null,
              ALLERGY:   p.PAALLERGY || null,
            };
            console.log(`/getRxTx: patient found — ${patientData.GIVEN} ${patientData.SURNAME}`);
          } else {
            console.warn(`/getRxTx: no patient found for PHN="${phn}" — check RXPANUM vs PANUM format`);
          }
        } catch (patErr) {
          console.warn('/getRxTx: patient lookup error:', patErr.message);
        }
      } else {
        console.warn('/getRxTx: RXPANUM is null/empty — cannot auto-link patient');
      }

      res.json({
        RECOPAY:   parseFloat(txRow?.RECOPAY)   || 0,
        RECOST:    0,
        REUPCHG:   0,
        RECMPDCHG: 0,
        REFEE:     0,
        REEFDATE:  txRow?.REEFDATE  || null,
        REUSERID:  null,
        PHN:       phn              || null,
        REQTY:     rxRow.REQTY      || 0,
        RXNUM:     rxRow.RXNUM,
        RXDAYS:    rxRow.RXDAYS     || null,
        RXLIM:     rxRow.RXLIM      || null,
        ORIGDATE:  rxRow.ORIGDATE   || null,
        RXSIG:     rxRow.RXSIG      || null,
        PLANID:    txRow?.PLANID    || null,
        DIN:       rxRow.DIN        || null,
        DRUG:      rxRow.DRUG       || null,
        PATIENT:   patientData,
      });
    } catch (e) {
      console.error('/getRxTx error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /* /debug-rx — diagnostic: show raw RX + TXNS + PATIENT rows for an Rx number
     GET or POST with { NUM: "12345" }  — returns raw rows for troubleshooting */
  expressApp.all('/debug-rx', async (req, res) => {
    const NUM = req.body?.NUM || req.query?.num;
    if (!NUM) return res.json({ error: 'Pass ?num=XXXXX or POST { NUM: "XXXXX" }' });
    const rxNum = parseFloat(NUM);
    const out = { rxNum, rxRow: null, txnsRows: [], patientRow: null, errors: [] };
    try {
      const r1 = await sqlPool.request().input('n', sql.Float, rxNum)
        .query(`SELECT TOP 1 * FROM RX WHERE RXNUM=@n`);
      out.rxRow = r1.recordset[0] || null;
    } catch(e) { out.errors.push('RX query: ' + e.message); }
    try {
      const r2 = await sqlPool.request().input('n', sql.Float, rxNum)
        .query(`SELECT TOP 3 * FROM TXNS WHERE RX=@n ORDER BY ADJDATE DESC`);
      out.txnsRows = r2.recordset;
    } catch(e) { out.errors.push('TXNS query: ' + e.message); }
    if (out.rxRow?.RXPANUM) {
      try {
        const phn = String(out.rxRow.RXPANUM).trim();
        const r3 = await sqlPool.request().input('p', sql.VarChar, phn)
          .query(`SELECT TOP 1 * FROM PATIENT WHERE LTRIM(RTRIM(PANUM))=@p`);
        out.patientRow = r3.recordset[0] || null;
        out.phnSearched = phn;
      } catch(e) { out.errors.push('PATIENT query: ' + e.message); }
    }
    res.json(out);
  });

  /* /getPatientProfile — active Rx list for a patient
     Returns all Pharmacy Dashboard getPatientProfile response fields:
     RXNUM, RXEXTNO, DRUG, DIN, RXSIG, DRLAST, DR1ST, ORIGDATE,
     QTY, RXDAYS, REFILL, QTYFILLED, PREVDATE, PREVQTY, REFLEFT, QTYLEFT */
  expressApp.post('/getPatientProfile', async (req, res) => {
    const { PHN, Stopped } = req.body || {};
    if (!PHN) return res.status(400).json({ error: 'PHN required' });
    const inclStopped = (Stopped || 'N').toUpperCase() === 'Y';
    try {
      // Try with DRUG join; fall back to basic if RXDIN column doesn't exist
      let result;
      const baseWhere = `r.RXPANUM = @phn ${inclStopped ? '' : 'AND (r.RXSTOP IS NULL OR r.RXSTOP > GETDATE())'}`;
      try {
        result = await sqlPool.request()
          .input('phn', sql.VarChar, String(PHN))
          .query(`
            SELECT TOP 60
              r.RXNUM,
              r.RXPANUM           AS PHN,
              r.RXQTY             AS QTY,
              r.RXDAYS,
              r.RXLIM             AS REFILL,
              r.RXSTOP,
              CAST(d.DGDIN AS BIGINT) AS DIN,
              d.DGDESC            AS DRUG,
              t.AMT               AS RECOPAY,
              t.ADJDATE           AS REEFDATE,
              t.PLANID
            FROM RX r
            LEFT JOIN DRUG d ON d.DGDIN = r.RXDIN
            LEFT JOIN TXNS t ON t.RX = r.RXNUM
              AND t.ADJDATE = (SELECT MAX(ADJDATE) FROM TXNS WHERE RX = r.RXNUM)
            WHERE ${baseWhere}
            ORDER BY t.ADJDATE DESC, r.RXNUM DESC
          `);
      } catch (_drugErr) {
        console.warn('/getPatientProfile: DRUG join failed, using basic query:', _drugErr.message);
        result = await sqlPool.request()
          .input('phn', sql.VarChar, String(PHN))
          .query(`
            SELECT TOP 60
              r.RXNUM,
              r.RXPANUM AS PHN,
              r.RXQTY   AS QTY,
              r.RXDAYS,
              r.RXLIM   AS REFILL,
              r.RXSTOP,
              t.AMT     AS RECOPAY,
              t.ADJDATE AS REEFDATE,
              t.PLANID
            FROM RX r
            LEFT JOIN TXNS t ON t.RX = r.RXNUM
              AND t.ADJDATE = (SELECT MAX(ADJDATE) FROM TXNS WHERE RX = r.RXNUM)
            WHERE ${baseWhere}
            ORDER BY t.ADJDATE DESC, r.RXNUM DESC
          `);
      }
      // Shape each row to match PD API response fields
      const rows = result.recordset.map(row => ({
        RXNUM:    String(row.RXNUM    || ''),
        PHN:      row.PHN             || null,
        DRUG:     row.DRUG            || `Rx ${row.RXNUM}`,
        DIN:      row.DIN             || null,
        RXSIG:    row.RXSIG           || null,
        ORIGDATE: row.ORIGDATE        || null,
        QTY:      row.QTY             || 0,
        RXDAYS:   row.RXDAYS          || null,
        REFILL:   row.REFILL          || 0,
        REFLEFT:  row.REFLEFT         || 0,
        RECOPAY:  parseFloat(row.RECOPAY) || 0,
        REEFDATE: row.REEFDATE        || null,
        PLANID:   row.PLANID          || null,
      }));
      res.json(rows);
    } catch (e) {
      console.error('/getPatientProfile error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /* /getStore — pharmacy branch info
     Returns all Pharmacy Dashboard getStore response fields:
     Branch, Address, Phone, AreaCode, PostalCode, Province, Country */
  expressApp.post('/getStore', async (req, res) => {
    try {
      const result = await sqlPool.request()
        .query(`
          SELECT TOP 1
            BRID, BRDESC, BRADDR1, BRPROV, BRPC, BRPHONE, BREMAIL
          FROM BRANCH
        `);
      if (!result.recordset.length) return res.json({});
      const b = result.recordset[0];
      res.json({
        Branch:     b.BRDESC  || '',
        Address:    b.BRADDR1 || '',
        ADDR1:      b.BRADDR1 || '',
        Phone:      b.BRPHONE || '',
        PHONE:      b.BRPHONE || '',
        PostalCode: b.BRPC    || '',
        PC:         b.BRPC    || '',
        Province:   b.BRPROV  || '',
        PROV:       b.BRPROV  || '',
        EMAIL:      b.BREMAIL || '',
      });
    } catch (e) {
      console.error('/getStore error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /* /getDrug — lookup drug by DIN (matches PD getDrug endpoint)
     Returns: DIN, LocalDIN, GenericName, TradeName, Manufacturer, Form, PackSize, Cost, InStock, UnitCost */
  expressApp.post('/getDrug', async (req, res) => {
    const { DIN } = req.body || {};
    try {
      const request = sqlPool.request();
      let query;
      if (DIN) {
        request.input('din', sql.Float, parseFloat(DIN));
        query = `SELECT TOP 1 * FROM DRUG WHERE DGDIN = @din`;
      } else {
        // No DIN — return first few for diagnostics
        query = `SELECT TOP 20 * FROM DRUG ORDER BY DGDIN`;
      }
      const result = await request.query(query);
      if (!result.recordset.length) return res.json({});
      res.json(mapDrug(result.recordset[0]));
    } catch (e) {
      console.error('/getDrug error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /* _discoverDocTable — search ALL tables for one with PHN + large image/text column.
     Returns tableInfo object or null. Also returns candidateList for UI display. */
  async function _discoverDocTable(overrideName) {
    // If caller supplied a specific table name, use it directly (skip discovery)
    if (overrideName) {
      const result = await sqlPool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${overrideName.replace(/'/g,'')}'
        ORDER BY ORDINAL_POSITION
      `);
      const cols = result.recordset.map(r => ({ col: r.COLUMN_NAME, type: r.DATA_TYPE }));
      return { tableInfo: _mapCols(overrideName, cols), candidates: [] };
    }

    // Broad search — all base tables that have BOTH a PHN-like column AND a large text/image column
    const schema = await sqlPool.request().query(`
      SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS c
      JOIN INFORMATION_SCHEMA.TABLES t
        ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
    `);

    const tables = {};
    for (const row of schema.recordset) {
      if (!tables[row.TABLE_NAME]) tables[row.TABLE_NAME] = [];
      tables[row.TABLE_NAME].push({ col: row.COLUMN_NAME, type: row.DATA_TYPE });
    }

    const IMAGE_TYPES = new Set(['text','ntext','varchar','nvarchar','image','varbinary']);
    const candidates = [];

    for (const [tbl, cols] of Object.entries(tables)) {
      const names = cols.map(c => c.col.toUpperCase());
      const hasPhn   = names.some(n => n.includes('PANUM') || n === 'PHN' || n === 'PATPHN');
      const hasImage = cols.some(c => IMAGE_TYPES.has(c.type.toLowerCase()) &&
        (c.col.toUpperCase().includes('IMAGE') || c.col.toUpperCase().includes('TEXT') ||
         c.col.toUpperCase().includes('CONTENT') || c.col.toUpperCase().includes('DATA') ||
         c.col.toUpperCase().includes('BODY') || c.col.toUpperCase().includes('BLOB')));
      if (hasPhn && hasImage) candidates.push({ tbl, cols });
    }

    // Prefer tables whose name suggests documents
    const DOC_KEYWORDS = ['DOC','NOTE','ATTACH','RECEIPT','CONSULT','COUNSEL','LOG','FILE'];
    candidates.sort((a, b) => {
      const aScore = DOC_KEYWORDS.some(k => a.tbl.toUpperCase().includes(k)) ? 0 : 1;
      const bScore = DOC_KEYWORDS.some(k => b.tbl.toUpperCase().includes(k)) ? 0 : 1;
      return aScore - bScore;
    });

    const tableInfo = candidates.length ? _mapCols(candidates[0].tbl, candidates[0].cols) : null;
    return { tableInfo, candidates: candidates.map(c => c.tbl) };
  }

  function _mapCols(tbl, cols) {
    const find = (...keys) => cols.find(c => keys.some(k => c.col.toUpperCase().includes(k)))?.col || null;
    return {
      tbl,
      phnCol:   find('PANUM','PHN'),
      imageCol: find('IMAGE','CONTENT','BODY','BLOB','TEXT','DATA'),
      typeCol:  find('TYPE'),
      dateCol:  find('DATE'),
      descCol:  find('DESC','NAME','TITLE'),
      userCol:  find('USER','STAFF','TECH'),
    };
  }

  /* /saveDocument — insert a receipt PDF into the WinRx patient document table. */
  expressApp.post('/saveDocument', async (req, res) => {
    const { PHN, DocumentType, DocumentImage, Description, UserId, TableOverride } = req.body || {};
    if (!PHN || !DocumentImage) {
      return res.status(400).json({ ok: false, error: 'PHN and DocumentImage are required' });
    }

    const docType = String(DocumentType || 'RCPT').slice(0, 4).toUpperCase();
    const desc    = String(Description  || `Receipt ${new Date().toLocaleDateString('en-CA')}`).slice(0, 255);
    const userId  = String(UserId || 'POS').slice(0, 20);
    const phn     = String(PHN).trim();

    let tableInfo = null;
    let candidates = [];
    try {
      const found = await _discoverDocTable(TableOverride || null);
      tableInfo  = found.tableInfo;
      candidates = found.candidates;
    } catch (schemaErr) {
      return res.status(500).json({ ok: false, error: `Schema discovery failed: ${schemaErr.message}`, candidates: [] });
    }

    if (!tableInfo || !tableInfo.phnCol || !tableInfo.imageCol) {
      return res.status(500).json({
        ok: false,
        error: `No suitable document table found. Use Settings → Document Table to pick the correct table.`,
        candidates,
      });
    }

    try {
      const { tbl, phnCol, imageCol, typeCol, dateCol, descCol, userCol } = tableInfo;
      const insertCols = [phnCol, imageCol];
      const insertVals = ['@phn', '@image'];
      if (typeCol) { insertCols.push(typeCol); insertVals.push('@docType'); }
      if (dateCol) { insertCols.push(dateCol); insertVals.push('@docDate'); }
      if (descCol) { insertCols.push(descCol); insertVals.push('@desc'); }
      if (userCol) { insertCols.push(userCol); insertVals.push('@userId'); }

      const request = sqlPool.request();
      request.input('phn',     sql.VarChar(20),      phn);
      request.input('image',   sql.VarChar(sql.MAX), String(DocumentImage));
      request.input('docType', sql.VarChar(10),      docType);
      request.input('docDate', sql.DateTime,         new Date());
      request.input('desc',    sql.VarChar(255),     desc);
      request.input('userId',  sql.VarChar(20),      userId);

      await request.query(`INSERT INTO ${tbl} (${insertCols.join(', ')}) VALUES (${insertVals.join(', ')})`);
      res.json({ ok: true, table: tbl });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message, table: tableInfo?.tbl, candidates });
    }
  });

  /* /list-document-tables — find all candidate document tables (for Settings UI) */
  expressApp.all('/list-document-tables', async (req, res) => {
    try {
      const { tableInfo, candidates } = await _discoverDocTable(null);
      res.json({ recommended: tableInfo?.tbl || null, candidates });
    } catch (e) {
      res.status(500).json({ error: e.message, candidates: [] });
    }
  });

  /* /schema-search — find any table whose name contains a keyword.
     Usage: GET /schema-search?q=consult   or   GET /schema-search?q=log
     Returns every matching table with all its column names + types. */
  expressApp.get('/schema-search', async (req, res) => {
    const term = String(req.query.q || '').trim();
    if (!term) return res.status(400).json({ error: 'q parameter required, e.g. ?q=consult' });
    try {
      const result = await sqlPool.request().query(`
        SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE,
               c.CHARACTER_MAXIMUM_LENGTH, c.ORDINAL_POSITION
        FROM INFORMATION_SCHEMA.COLUMNS c
        JOIN INFORMATION_SCHEMA.TABLES t
          ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
        WHERE c.TABLE_NAME LIKE '%${term.replace(/'/g, '')}%'
        ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
      `);
      // Group by table for readability
      const grouped = {};
      for (const row of result.recordset) {
        if (!grouped[row.TABLE_NAME]) grouped[row.TABLE_NAME] = [];
        grouped[row.TABLE_NAME].push({
          column: row.COLUMN_NAME,
          type:   row.DATA_TYPE + (row.CHARACTER_MAXIMUM_LENGTH ? `(${row.CHARACTER_MAXIMUM_LENGTH})` : ''),
        });
      }
      res.json({ term, tables: grouped, count: Object.keys(grouped).length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* /all-tables — list every table in the WinRx database (names only) */
  expressApp.get('/all-tables', async (req, res) => {
    try {
      const result = await sqlPool.request().query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `);
      res.json(result.recordset.map(r => r.TABLE_NAME));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* /save-pdf-file — write a base64 PDF to a folder on disk.
     Body: { base64, filename, folderPath }
     The folder must already exist (WinRx document inbox folder). */
  expressApp.post('/save-pdf-file', async (req, res) => {
    const { base64, filename, folderPath } = req.body || {};
    if (!base64 || !filename || !folderPath) {
      return res.status(400).json({ ok: false, error: 'base64, filename, and folderPath are required' });
    }
    try {
      const fs   = require('fs');
      const path = require('path');
      const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const fullPath  = path.join(folderPath, safeName);
      const buf = Buffer.from(base64, 'base64');
      fs.writeFileSync(fullPath, buf);
      res.json({ ok: true, path: fullPath });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

/* ------------------------------------------------------------------
   Start Express server
------------------------------------------------------------------ */
let _expressApp = null;   // kept so we can add SQL routes on reconnect

function startServer(appDir) {
  return new Promise((resolve, reject) => {
    _expressApp = express();
    _expressApp.use(express.json({ limit: '10mb' })); // parse JSON request bodies (large for base64 PDFs)
    _expressApp.use(express.static(appDir));   // serve the POS HTML/JS files

    // Add SQL API routes if connected
    if (sqlPool) addSqlRoutes(_expressApp);

    server = http.createServer(_expressApp);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    server.on('error', reject);
  });
}

/* ------------------------------------------------------------------
   Create the app window
------------------------------------------------------------------ */
async function createWindow() {
  registerIpcHandlers();
  await connectSQL();

  const appDir = getAppDir();
  let port;
  try {
    port = await startServer(appDir);
  } catch (err) {
    dialog.showErrorBox('Pharmacy POS — Startup Error',
      'Could not start local server:\n' + err.message);
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width:           1440,
    height:          900,
    minWidth:        1100,
    minHeight:       680,
    title:           'Pharmacy POS',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload:          path.join(__dirname, 'preload.js'),
    },
  });

  // Load via file:// so IndexedDB origin is constant across restarts.
  // (loadURL with a random port changes the origin every launch, wiping the database.)
  mainWindow.loadFile(path.join(appDir, 'index.html'));
  mainWindow.setMenu(null);

  // Inject the SQL API base URL after each page load so pharmacy-dashboard.js
  // routes reads to the local Express server instead of Cloudflare.
  mainWindow.webContents.on('did-finish-load', () => {
    // Always inject so the app knows the correct port even if SQL connects later
    mainWindow.webContents.executeJavaScript(
      `window.__WINRX_LOCAL_PORT__ = ${port};` +
      (sqlPool
        ? `window.__WINRX_LOCAL_API__ = 'http://127.0.0.1:${port}';
           console.log('✓ WinRx local SQL API active:', window.__WINRX_LOCAL_API__);`
        : `console.log('ℹ SQL not connected — configure in Settings → SQL Connection');`)
    );
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  startCloverBridge();
  createWindow();
});

app.on('window-all-closed', () => {
  if (cloverProcess) { try { cloverProcess.kill(); } catch(_) {} }
  if (server) server.close();
  if (sqlPool) sqlPool.close().catch(() => {});
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
