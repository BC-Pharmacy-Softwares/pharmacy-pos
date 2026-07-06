/* ============================================================
   utils/scheduler.js — Automated daily + monthly report emails
   Runs in the renderer (has access to DB + EmailAPI + Config).
   Checks every 60 seconds whether a scheduled report is due.
   ============================================================ */

const Scheduler = (() => {

  let _timer = null;

  /* ── Report builders ───────────────────────────────────────── */

  /* Read which optional sections the pharmacy enabled.
     Sales Summary is always included. Defaults match the UI defaults. */
  async function _enabledSections() {
    const flag = async (key, def) => {
      const v = await Config.get(key);
      return v !== null && v !== undefined && v !== '' ? v === 'true' : def;
    };
    return {
      methods:  await flag('auto_rpt_methods',  true),
      tax:      await flag('auto_rpt_tax',      true),
      products: await flag('auto_rpt_products', false),
      btc:      await flag('auto_rpt_btc',      false),
      lowstock: await flag('auto_rpt_lowstock', false),
    };
  }

  /* Build the report sections array shared by daily + monthly.
     `from`/`to` are date strings (same for a single day).      */
  async function _buildSections(from, to) {
    const s       = DB.getSalesSummary(from, to);
    const gstRate = (Tax.gstRate() * 100).toFixed(1).replace(/\.0$/, '');
    const pstRate = (Tax.pstRate() * 100).toFixed(1).replace(/\.0$/, '');
    const enabled = await _enabledSections();

    const sections = [
      { kpis: [
          ['Transactions',      s.txn_count],
          ['Gross Sales',       Tax.fmt(s.gross_sales)],
          [`GST (${gstRate}%)`, Tax.fmt(s.total_gst)],
          [`PST (${pstRate}%)`, Tax.fmt(s.total_pst)],
        ]},
      { heading: 'Sales Summary',
        headers: ['', 'Amount'],
        rows: [
          ['Total Sales (excl. tax)',     Tax.fmt(s.total_subtotal)],
          [`GST Collected (${gstRate}%)`, Tax.fmt(s.total_gst)],
          [`PST Collected (${pstRate}%)`, Tax.fmt(s.total_pst)],
          ['Total Tax Collected',         Tax.fmt(s.total_gst + s.total_pst)],
          ['Gross Revenue (incl. tax)',   Tax.fmt(s.gross_sales)],
          ['Voided / Reversed',
           `${s.voided_count} txn${s.voided_count !== 1 ? 's' : ''} / ${Tax.fmt(s.voided_amount)}`],
        ]},
    ];

    // By Payment Method
    if (enabled.methods) {
      const methods = DB.getSalesByMethod(from, to);
      if (methods.length) {
        sections.push({
          heading: 'By Payment Method',
          headers: ['Method', 'Transactions', 'Total'],
          rows: methods.map(m => [m.method, String(m.count), Tax.fmt(m.total)]),
        });
      }
    }

    // Tax Breakdown
    if (enabled.tax) {
      sections.push({
        heading: 'Tax Breakdown',
        headers: ['Tax', 'Rate', 'Collected'],
        rows: [
          ['GST', `${gstRate}%`, Tax.fmt(s.total_gst)],
          ['PST', `${pstRate}%`, Tax.fmt(s.total_pst)],
          ['Total Tax', '', Tax.fmt(s.total_gst + s.total_pst)],
        ],
      });
    }

    // Top Products Sold
    if (enabled.products) {
      const sold = (DB.getSoldProducts(from, to) || [])
        .filter(p => p.item_type !== 'RX')
        .sort((a,b) => (b.qty_sold||0) - (a.qty_sold||0))
        .slice(0, 15);
      if (sold.length) {
        sections.push({
          heading: 'Top Products Sold',
          headers: ['Product', 'Qty', 'Revenue'],
          rows: sold.map(p => [p.description, String(p.qty_sold||0), Tax.fmt(p.revenue||0)]),
        });
      }
    }

    // BTC / Controlled Log
    if (enabled.btc) {
      const logs = (DB.getBtcLog(from, to) || []).filter(l => l.log_type !== 'received');
      if (logs.length) {
        sections.push({
          heading: 'BTC / Controlled Substance Log',
          headers: ['Date', 'Drug', 'Qty', 'Pharmacist'],
          rows: logs.map(l => [
            new Date(l.sale_date).toLocaleDateString('en-CA'),
            l.drug_name, String(l.quantity), l.pharmacist_name || '—',
          ]),
        });
      }
    }

    // Low Stock Alert
    if (enabled.lowstock) {
      const low = DB.getLowStockProducts() || [];
      if (low.length) {
        sections.push({
          heading: 'Low Stock Alert',
          headers: ['Product', 'On Hand', 'Threshold'],
          rows: low.map(p => [p.description, String(p.qty_on_hand ?? 0), String(p.qty_threshold ?? 0)]),
        });
      }
    }

    return { sections, summary: s, gstRate, pstRate };
  }

  function _summaryText(title, name, period, s) {
    return [
      `${title} — ${name}`,
      period,
      '',
      `Transactions: ${s.txn_count}`,
      `Gross Sales:  ${Tax.fmt(s.gross_sales)}`,
      `GST:          ${Tax.fmt(s.total_gst)}`,
      `PST:          ${Tax.fmt(s.total_pst)}`,
      `Voided:       ${s.voided_count} / ${Tax.fmt(s.voided_amount)}`,
    ].join('\n');
  }

  async function _buildDailyEmail(date) {
    const name = (await Config.get('pharmacy_name')) || 'Pharmacy POS';
    const { sections, summary } = await _buildSections(date, date);
    const html = EmailAPI.buildEmailHTML({
      pharmacyName: name,
      title:        'Daily Sales Report',
      subtitle:     `Date: ${date}`,
      sections,
    });
    return { html, text: _summaryText('DAILY SALES REPORT', name, `Date: ${date}`, summary) };
  }

  async function _buildMonthlyEmail(year, month) {
    const name      = (await Config.get('pharmacy_name')) || 'Pharmacy POS';
    const from      = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay   = new Date(year, month, 0).getDate();
    const to        = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const monthName = new Date(year, month - 1, 1).toLocaleString('en-CA',
      { month: 'long', year: 'numeric' });

    const { sections, summary } = await _buildSections(from, to);
    const html = EmailAPI.buildEmailHTML({
      pharmacyName: name,
      title:        'Monthly Sales Report',
      subtitle:     monthName,
      sections,
    });
    return { html, text: _summaryText('MONTHLY SALES REPORT', name, `Month: ${monthName}`, summary) };
  }

  /* ── Nightly DB backup ─────────────────────────────────────── */

  // Uint8Array → base64 (chunked; btoa(String.fromCharCode(...big)) overflows the stack)
  function _bytesToB64(bytes) {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  /* Write a plaintext .sqlite snapshot to the configured folder.
     Same format as the manual Settings → Export, so Import/Restore works on it.
     Returns { ok, path } or { ok:false, error }. */
  async function runBackupNow(folderOverride) {
    const folder = folderOverride || (await Config.get('auto_backup_folder')) || '';
    if (!folder) return { ok: false, error: 'No backup folder configured.' };
    if (!window.electronAPI?.savePdfFile) return { ok: false, error: 'Backup needs the desktop app.' };
    const bytes = DB.exportDb();
    if (!bytes) return { ok: false, error: 'Database not ready.' };
    const stamp    = localDateStr(new Date());           // YYYY-MM-DD
    const filename = `pharmacy_pos_backup_${stamp}.sqlite`;
    const res = await window.electronAPI.savePdfFile({
      base64:     _bytesToB64(bytes),
      filename,
      folderPath: folder,
    });
    return res;
  }

  /* ── Main check (runs every 60 s) ──────────────────────────── */

  async function _check() {
    const now  = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = localDateStr(now);

    /* ── Nightly DB backup ── */
    try {
      if ((await Config.get('auto_backup_enabled')) === 'true') {
        const backupTime = (await Config.get('auto_backup_time')) || '23:30';
        const lastDone   = (await Config.get('auto_last_backup')) || '';
        if (hhmm === backupTime && lastDone !== today) {
          const folder = (await Config.get('auto_backup_folder')) || '';
          if (folder) {
            const res = await runBackupNow(folder);
            if (res && res.ok) {
              await Config.set('auto_last_backup', today);
              console.log(`✓ Scheduler: DB backup saved — ${res.path}`);
            } else {
              console.error('Scheduler: backup failed:', res && res.error);
            }
          } else {
            console.warn('Scheduler: backup enabled but no folder configured.');
          }
        }
      }
    } catch (e) {
      console.error('Scheduler: backup error:', e.message);
    }

    /* ── Daily report ── */
    try {
      if ((await Config.get('auto_daily_enabled')) === 'true') {
        const dailyTime = (await Config.get('auto_daily_time')) || '21:00';
        const lastSent  = (await Config.get('auto_last_daily_sent')) || '';

        if (hhmm === dailyTime && lastSent !== today) {
          const recipients = (await Config.get('auto_daily_recipients')) ||
                             (await Config.get('email_recipients_sales')) || '';
          if (recipients) {
            // Send report for yesterday (today's sales may still be happening)
            const yesterday = localDateStr(new Date(now.getTime() - 86400000));
            const { html, text } = await _buildDailyEmail(yesterday);
            await EmailAPI.send({
              to:       recipients,
              subject:  `Daily Sales Report — ${yesterday}`,
              htmlBody: html,
              textBody: text,
            });
            await Config.set('auto_last_daily_sent', today);
            console.log(`✓ Scheduler: daily report sent for ${yesterday} at ${hhmm}`);
          } else {
            console.warn('Scheduler: daily report enabled but no recipients configured.');
          }
        }
      }
    } catch (e) {
      console.error('Scheduler: daily report error:', e.message);
    }

    /* ── Monthly report ── */
    try {
      if ((await Config.get('auto_monthly_enabled')) === 'true') {
        const targetDay = parseInt((await Config.get('auto_monthly_day')) || '1') || 1;
        const monthKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const lastSent  = (await Config.get('auto_last_monthly_sent')) || '';

        if (now.getDate() === targetDay && lastSent !== monthKey) {
          const recipients = (await Config.get('auto_monthly_recipients')) ||
                             (await Config.get('email_recipients_sales')) || '';
          if (recipients) {
            // Report for the previous calendar month
            const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            const month = now.getMonth() === 0 ? 12 : now.getMonth();
            const { html, text } = await _buildMonthlyEmail(year, month);
            const monthName = new Date(year, month - 1, 1).toLocaleString('en-CA',
              { month: 'long', year: 'numeric' });
            await EmailAPI.send({
              to:       recipients,
              subject:  `Monthly Sales Report — ${monthName}`,
              htmlBody: html,
              textBody: text,
            });
            await Config.set('auto_last_monthly_sent', monthKey);
            console.log(`✓ Scheduler: monthly report sent for ${monthName}`);
          } else {
            console.warn('Scheduler: monthly report enabled but no recipients configured.');
          }
        }
      }
    } catch (e) {
      console.error('Scheduler: monthly report error:', e.message);
    }
  }

  /* ── Public ─────────────────────────────────────────────────── */

  function start() {
    if (_timer) clearInterval(_timer);
    // Initial check after 10 s (give DB time to finish loading), then every 60 s
    setTimeout(_check, 10000);
    _timer = setInterval(_check, 60000);
    console.log('Scheduler started — checking for scheduled reports every 60 s');
  }

  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  /** Trigger a manual send right now (used for "Send now" button in Settings) */
  async function sendDailyNow(date, recipients) {
    const { html, text } = await _buildDailyEmail(date);
    await EmailAPI.send({
      to:       recipients,
      subject:  `Daily Sales Report — ${date}`,
      htmlBody: html,
      textBody: text,
    });
  }

  async function sendMonthlyNow(year, month, recipients) {
    const { html, text } = await _buildMonthlyEmail(year, month);
    const monthName = new Date(year, month - 1, 1).toLocaleString('en-CA',
      { month: 'long', year: 'numeric' });
    await EmailAPI.send({
      to:       recipients,
      subject:  `Monthly Sales Report — ${monthName}`,
      htmlBody: html,
      textBody: text,
    });
  }

  return { start, stop, sendDailyNow, sendMonthlyNow, runBackupNow };
})();
