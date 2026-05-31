/* ============================================================
   utils/scheduler.js — Automated daily + monthly report emails
   Runs in the renderer (has access to DB + EmailAPI + Config).
   Checks every 60 seconds whether a scheduled report is due.
   ============================================================ */

const Scheduler = (() => {

  let _timer = null;

  /* ── Report builders ───────────────────────────────────────── */

  async function _buildDailyEmail(date) {
    const name    = (await Config.get('pharmacy_name')) || 'Pharmacy POS';
    const s       = DB.getSalesSummary(date, date);
    const methods = DB.getSalesByMethod(date, date);
    const gstRate = (Tax.gstRate() * 100).toFixed(1).replace(/\.0$/, '');
    const pstRate = (Tax.pstRate() * 100).toFixed(1).replace(/\.0$/, '');

    const html = EmailAPI.buildEmailHTML({
      pharmacyName: name,
      title:        'Daily Sales Report',
      subtitle:     `Date: ${date}`,
      sections: [
        { kpis: [
            ['Transactions',     s.txn_count],
            ['Gross Sales',      Tax.fmt(s.gross_sales)],
            [`GST (${gstRate}%)`, Tax.fmt(s.total_gst)],
            [`PST (${pstRate}%)`, Tax.fmt(s.total_pst)],
          ]},
        { heading: 'Sales Summary',
          headers: ['', 'Amount'],
          rows: [
            ['Total Sales (excl. tax)', Tax.fmt(s.total_subtotal)],
            [`GST Collected (${gstRate}%)`, Tax.fmt(s.total_gst)],
            [`PST Collected (${pstRate}%)`, Tax.fmt(s.total_pst)],
            ['Total Tax Collected',        Tax.fmt(s.total_gst + s.total_pst)],
            ['Gross Revenue (incl. tax)',  Tax.fmt(s.gross_sales)],
            ['Voided / Reversed',
             `${s.voided_count} txn${s.voided_count !== 1 ? 's' : ''} / ${Tax.fmt(s.voided_amount)}`],
          ]},
        ...(methods.length ? [{
          heading: 'By Payment Method',
          headers: ['Method', 'Transactions', 'Total'],
          rows: methods.map(m => [m.method, String(m.count), Tax.fmt(m.total)]),
        }] : []),
      ],
    });

    const text = [
      `DAILY SALES REPORT — ${name}`,
      `Date: ${date}`,
      '',
      `Transactions: ${s.txn_count}`,
      `Gross Sales:  ${Tax.fmt(s.gross_sales)}`,
      `GST:          ${Tax.fmt(s.total_gst)}`,
      `PST:          ${Tax.fmt(s.total_pst)}`,
      `Voided:       ${s.voided_count} / ${Tax.fmt(s.voided_amount)}`,
      '',
      ...methods.map(m => `${m.method.padEnd(12)} ${Tax.fmt(m.total).padStart(10)}  (${m.count} txns)`),
    ].join('\n');

    return { html, text };
  }

  async function _buildMonthlyEmail(year, month) {
    const name      = (await Config.get('pharmacy_name')) || 'Pharmacy POS';
    const from      = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay   = new Date(year, month, 0).getDate();
    const to        = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const monthName = new Date(year, month - 1, 1).toLocaleString('en-CA',
      { month: 'long', year: 'numeric' });

    const s       = DB.getSalesSummary(from, to);
    const methods = DB.getSalesByMethod(from, to);
    const gstRate = (Tax.gstRate() * 100).toFixed(1).replace(/\.0$/, '');
    const pstRate = (Tax.pstRate() * 100).toFixed(1).replace(/\.0$/, '');

    const html = EmailAPI.buildEmailHTML({
      pharmacyName: name,
      title:        'Monthly Sales Report',
      subtitle:     monthName,
      sections: [
        { kpis: [
            ['Transactions',      s.txn_count],
            ['Gross Sales',       Tax.fmt(s.gross_sales)],
            [`GST (${gstRate}%)`, Tax.fmt(s.total_gst)],
            [`PST (${pstRate}%)`, Tax.fmt(s.total_pst)],
          ]},
        { heading: 'Monthly Summary',
          headers: ['', 'Amount'],
          rows: [
            ['Total Sales (excl. tax)',   Tax.fmt(s.total_subtotal)],
            [`GST Collected (${gstRate}%)`, Tax.fmt(s.total_gst)],
            [`PST Collected (${pstRate}%)`, Tax.fmt(s.total_pst)],
            ['Total Tax Collected',        Tax.fmt(s.total_gst + s.total_pst)],
            ['Gross Revenue (incl. tax)', Tax.fmt(s.gross_sales)],
            ['Voided / Reversed',
             `${s.voided_count} txn${s.voided_count !== 1 ? 's' : ''} / ${Tax.fmt(s.voided_amount)}`],
          ]},
        ...(methods.length ? [{
          heading: 'By Payment Method',
          headers: ['Method', 'Transactions', 'Total'],
          rows: methods.map(m => [m.method, String(m.count), Tax.fmt(m.total)]),
        }] : []),
      ],
    });

    const text = [
      `MONTHLY SALES REPORT — ${name}`,
      `Month: ${monthName}`,
      `Period: ${from} to ${to}`,
      '',
      `Transactions: ${s.txn_count}`,
      `Gross Sales:  ${Tax.fmt(s.gross_sales)}`,
      `GST:          ${Tax.fmt(s.total_gst)}`,
      `PST:          ${Tax.fmt(s.total_pst)}`,
      `Voided:       ${s.voided_count} / ${Tax.fmt(s.voided_amount)}`,
    ].join('\n');

    return { html, text };
  }

  /* ── Main check (runs every 60 s) ──────────────────────────── */

  async function _check() {
    const now  = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = localDateStr(now);

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

  return { start, stop, sendDailyNow, sendMonthlyNow };
})();
