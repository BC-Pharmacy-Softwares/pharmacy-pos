/* ============================================================
   screens/reports.js — Sales Reports, Tax Summary, Orders
   ============================================================ */

class ReportsScreen {
  constructor({ onNavigate }) {
    this._onNavigate = onNavigate;
    this._el         = null;
    this._from       = _dateStr();
    this._to         = _dateStr();
    this._activeTab  = 'summary';
  }

  render(params = {}) {
    this._el = document.createElement('div');
    this._el.className = 'settings-screen'; // reuse settings layout
    this._el.innerHTML = `
      <div class="topbar">
        <button class="btn btn-outline btn-sm" id="btn-back">&#8592; Back</button>
        <span style="font-weight:600;font-size:15px;margin-left:8px;">Reports</span>
      </div>
      <div class="settings-body">
        <div class="settings-nav">
          ${[['summary','Sales Summary'],['tax','Tax Report'],['methods','By Method'],
             ['products','Products Sold'],['orders','Order Suggestions'],['shifts','Shift Reports']].map(([id,label]) =>
            `<div class="settings-nav-item${id===this._activeTab?' active':''}" data-tab="${id}">${label}</div>`
          ).join('')}
        </div>
        <div class="settings-content" id="report-content"></div>
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click', () => this._onNavigate('pos'));
    this._el.querySelectorAll('.settings-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        this._el.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this._activeTab = item.dataset.tab;
        this._renderTab(item.dataset.tab);
      });
    });
    this._renderTab(this._activeTab);
    return this._el;
  }

  _renderTab(tab) {
    const content = this._el.querySelector('#report-content');
    switch (tab) {
      case 'summary':  this._renderSummary(content);  break;
      case 'tax':      this._renderTax(content);      break;
      case 'methods':  this._renderMethods(content);  break;
      case 'products': this._renderProducts(content); break;
      case 'orders':   this._renderOrders(content);   break;
      case 'shifts':   this._renderShifts(content);   break;
    }
  }

  /* ── Shared date picker + print options header ────────────── */
  _datePickerHTML() {
    return `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;
                  background:var(--surface2);padding:12px 16px;border-radius:var(--radius);">
        <label style="font-size:13px;font-weight:500;">From</label>
        <input type="date" id="rpt-from" value="${this._from}" style="width:150px;" />
        <label style="font-size:13px;font-weight:500;">To</label>
        <input type="date" id="rpt-to"   value="${this._to}"   style="width:150px;" />
        <button class="btn btn-primary btn-sm" id="rpt-run">Run Report</button>
        <div style="display:flex;gap:6px;margin-left:auto;">
          <button class="btn btn-outline btn-sm" data-quick="today">Today</button>
          <button class="btn btn-outline btn-sm" data-quick="week">This Week</button>
          <button class="btn btn-outline btn-sm" data-quick="month">This Month</button>
        </div>
      </div>
      ${ReportPrint.printOptsHTML('rpt-print-opts')}`;
  }

  _attachDatePicker(content, onRun) {
    const setDates = (f, t) => {
      content.querySelector('#rpt-from').value = f;
      content.querySelector('#rpt-to').value   = t;
      this._from = f; this._to = t;
    };
    content.querySelector('#rpt-run').addEventListener('click', () => {
      this._from = content.querySelector('#rpt-from').value;
      this._to   = content.querySelector('#rpt-to').value;
      onRun(this._from, this._to);
    });
    content.querySelectorAll('[data-quick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const today = new Date();
        if (btn.dataset.quick === 'today') {
          setDates(localDateStr(today), localDateStr(today));
        } else if (btn.dataset.quick === 'week') {
          const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1);
          setDates(localDateStr(mon), localDateStr(today));
        } else if (btn.dataset.quick === 'month') {
          const first = new Date(today.getFullYear(), today.getMonth(), 1);
          setDates(localDateStr(first), localDateStr(today));
        }
        onRun(content.querySelector('#rpt-from').value, content.querySelector('#rpt-to').value);
      });
    });
  }

  /* ── Sales Summary ───────────────────────────────────────── */
  _renderSummary(content) {
    content.innerHTML = `
      <div class="settings-section">
        <h3>Sales Summary</h3>
        ${this._datePickerHTML()}
        <div id="summary-body"></div>
      </div>`;
    const run = (from, to) => {
      const s    = DB.getSalesSummary(from, to);
      const txns = DB.getTransactionsInRange(from, to);
      const body = content.querySelector('#summary-body');
      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px;">
          ${[
            ['Transactions', s.txn_count],
            ['Gross Sales',  Tax.fmt(s.gross_sales)],
            ['Subtotal',     Tax.fmt(s.total_subtotal)],
            ['GST Collected',Tax.fmt(s.total_gst)],
            ['PST Collected',Tax.fmt(s.total_pst)],
            ['Voided',       `${s.voided_count} / ${Tax.fmt(s.voided_amount)}`],
          ].map(([label,val]) => `
            <div style="background:var(--surface2);padding:14px;border-radius:var(--radius);">
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${label}</div>
              <div style="font-size:18px;font-weight:700;">${val}</div>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="btn-export-summary">&#8659; Export CSV</button>
          <button class="btn btn-outline btn-sm" id="btn-print-summary">&#128438; Print</button>
          <button class="btn btn-outline btn-sm" id="btn-email-summary">&#9993; Email</button>
        </div>
        ${txns.length === 0 ? '<p class="text-muted">No transactions in this period.</p>' : `
        <div style="overflow-x:auto;">
          <table class="table" style="font-size:13px;">
            <thead><tr><th>Txn#</th><th>Date</th><th>Type</th><th>Status</th><th>Staff</th>
              <th class="text-right">Subtotal</th><th class="text-right">GST</th>
              <th class="text-right">PST</th><th class="text-right">Total</th></tr></thead>
            <tbody>
              ${txns.map(t => `<tr style="${t.status==='REVERSED'?'opacity:.5;text-decoration:line-through':''}">
                <td>#${t.transaction_id}</td>
                <td>${new Date(t.transaction_date).toLocaleDateString(navigator.language)}</td>
                <td>${t.transaction_type}</td>
                <td><span class="badge badge-${t.status==='PAID'?'success':t.status==='REVERSED'?'danger':'warning'}" style="font-size:11px;">${t.status}</span></td>
                <td>${t.staff_pin||'—'}</td>
                <td class="text-right">${Tax.fmt(t.subtotal)}</td>
                <td class="text-right">${Tax.fmt(t.gst_amount)}</td>
                <td class="text-right">${Tax.fmt(t.pst_amount)}</td>
                <td class="text-right" style="font-weight:600;">${Tax.fmt(t.total_amount)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`}`;

      content.querySelector('#btn-export-summary')?.addEventListener('click', () => {
        const rows = [['Txn#','Date','Type','Status','Staff','Subtotal','GST','PST','Total'],
          ...txns.map(t=>[t.transaction_id, t.transaction_date, t.transaction_type, t.status,
            t.staff_pin||'', t.subtotal, t.gst_amount, t.pst_amount, t.total_amount])];
        _csvDownload(rows, `sales_summary_${from}_to_${to}.csv`);
      });
      content.querySelector('#btn-print-summary')?.addEventListener('click', () => {
        const opts = ReportPrint.collectPrintOpts(content);
        const gstRate = (Tax.gstRate()*100).toFixed(1).replace(/\.0$/,'');
        const pstRate = (Tax.pstRate()*100).toFixed(1).replace(/\.0$/,'');
        ReportPrint.printReport([
          { type: 'kpis', title: 'Key Metrics', items: [
              ['Transactions',     s.txn_count],
              ['Gross Sales',      Tax.fmt(s.gross_sales)],
              [`GST (${gstRate}%)`, Tax.fmt(s.total_gst)],
              [`PST (${pstRate}%)`, Tax.fmt(s.total_pst)],
            ]},
          { type: 'table', title: 'Summary Totals',
            headers: [{ label: 'Description' }, { label: 'Amount', right: true }],
            rows: [
              ['Total Sales (excl. tax)',  Tax.fmt(s.total_subtotal)],
              [`GST Collected (${gstRate}%)`, Tax.fmt(s.total_gst)],
              [`PST Collected (${pstRate}%)`, Tax.fmt(s.total_pst)],
              ['Total Tax',               Tax.fmt(s.total_gst + s.total_pst)],
              ['Gross Revenue (incl. tax)', Tax.fmt(s.gross_sales)],
              ['Voided / Reversed',       `${s.voided_count} txn${s.voided_count!==1?'s':''} / ${Tax.fmt(s.voided_amount)}`],
            ]},
          ...(txns.length ? [{ type: 'table', title: 'Transaction List',
            headers: [
              { label: 'Txn#' }, { label: 'Date' }, { label: 'Type' }, { label: 'Status' },
              { label: 'Staff' }, { label: 'Subtotal', right: true },
              { label: 'GST', right: true }, { label: 'PST', right: true },
              { label: 'Total', right: true }],
            rows: txns.map(t => [
              '#'+t.transaction_id,
              new Date(t.transaction_date).toLocaleDateString(navigator.language),
              t.transaction_type, t.status, t.staff_pin||'—',
              Tax.fmt(t.subtotal), Tax.fmt(t.gst_amount),
              Tax.fmt(t.pst_amount), Tax.fmt(t.total_amount)]),
            footer: ['TOTAL','','','','','',Tax.fmt(s.total_gst),Tax.fmt(s.total_pst),Tax.fmt(s.gross_sales)],
          }] : []),
        ], { title: 'Sales Summary', period: `${from} to ${to}`, customHeader: opts.customHeader }, opts);
      });
      content.querySelector('#btn-email-summary')?.addEventListener('click', async function() {
        const name = await _pharmacyName();
        const html = EmailAPI.buildEmailHTML({
          pharmacyName: name,
          title:    'Sales Summary',
          subtitle: `Period: ${from} to ${to}`,
          sections: [
            { kpis: [['Transactions', s.txn_count], ['Gross Sales', Tax.fmt(s.gross_sales)],
                     ['GST', Tax.fmt(s.total_gst)], ['PST', Tax.fmt(s.total_pst)]] },
            { heading: 'Summary',
              headers: ['', 'Amount'],
              rows: [
                ['Subtotal (excl. tax)', Tax.fmt(s.total_subtotal)],
                ['GST Collected',        Tax.fmt(s.total_gst)],
                ['PST Collected',        Tax.fmt(s.total_pst)],
                ['Gross Revenue',        Tax.fmt(s.gross_sales)],
                ['Voided / Reversed',    `${s.voided_count} txn${s.voided_count!==1?'s':''} / ${Tax.fmt(s.voided_amount)}`],
              ]},
          ],
        });
        const text = [`SALES SUMMARY — ${name}`,`Period: ${from} to ${to}`,``,
          `Transactions:  ${s.txn_count}`,`Gross Sales:   ${Tax.fmt(s.gross_sales)}`,
          `GST:           ${Tax.fmt(s.total_gst)}`,`PST:           ${Tax.fmt(s.total_pst)}`,
          `Voided:        ${s.voided_count} / ${Tax.fmt(s.voided_amount)}`,
        ].join('\n');
        _sendEmail({ recipientKey:'email_recipients_sales', subject:`Sales Summary ${from} to ${to}`,
          htmlBody: html, textBody: text, btn: this });
      });
    };
    this._attachDatePicker(content, run);
    run(this._from, this._to);
  }

  /* ── Tax Report ──────────────────────────────────────────── */
  _renderTax(content) {
    content.innerHTML = `
      <div class="settings-section">
        <h3>Tax Report</h3>
        <div class="alert alert-info" style="font-size:13px;">
          This report shows GST and PST collected in the selected period — suitable for tax filing.
        </div>
        ${this._datePickerHTML()}
        <div id="tax-body"></div>
      </div>`;
    const run = (from, to) => {
      const s    = DB.getSalesSummary(from, to);
      const methods = DB.getSalesByMethod(from, to);
      const body = content.querySelector('#tax-body');
      const gstRate = (Tax.gstRate()*100).toFixed(1).replace(/\.0$/,'');
      const pstRate = (Tax.pstRate()*100).toFixed(1).replace(/\.0$/,'');
      const cfg_name = ''; // will load async below
      body.innerHTML = `
        <div class="card" style="margin-bottom:16px;padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
            <div>
              <div style="font-size:16px;font-weight:700;">Tax Summary</div>
              <div style="font-size:13px;color:var(--text-muted);">${from} to ${to}</div>
            </div>
            <button class="btn btn-outline btn-sm" id="btn-export-tax">&#8659; Export for Accountant</button>
            <button class="btn btn-outline btn-sm" id="btn-print-tax">&#128438; Print</button>
            <button class="btn btn-outline btn-sm" id="btn-email-tax">&#9993; Email</button>
          </div>
          <table class="table" style="font-size:14px;">
            <tbody>
              <tr><td style="width:60%;">Total Sales (excl. tax)</td>
                  <td class="text-right" style="font-weight:600;">${Tax.fmt(s.total_subtotal)}</td></tr>
              <tr style="background:var(--surface2);">
                <td>GST Collected (${gstRate}%)</td>
                <td class="text-right" style="font-weight:600;color:var(--primary);">${Tax.fmt(s.total_gst)}</td></tr>
              <tr style="background:var(--surface2);">
                <td>PST Collected (${pstRate}%)</td>
                <td class="text-right" style="font-weight:600;color:var(--primary);">${Tax.fmt(s.total_pst)}</td></tr>
              <tr><td>Total Tax Collected</td>
                  <td class="text-right" style="font-weight:700;font-size:16px;">${Tax.fmt(s.total_gst + s.total_pst)}</td></tr>
              <tr><td>Gross Revenue (incl. tax)</td>
                  <td class="text-right" style="font-weight:700;">${Tax.fmt(s.gross_sales)}</td></tr>
              <tr><td style="color:var(--danger);">Voided / Reversed</td>
                  <td class="text-right" style="color:var(--danger);">(${Tax.fmt(s.voided_amount)})</td></tr>
            </tbody>
          </table>
          <div style="margin-top:16px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:8px;">By Payment Method</div>
            <table class="table" style="font-size:13px;">
              <thead><tr><th>Method</th><th class="text-right">Transactions</th><th class="text-right">Amount</th></tr></thead>
              <tbody>
                ${methods.map(m=>`<tr><td>${m.method}</td><td class="text-right">${m.count}</td>
                  <td class="text-right" style="font-weight:600;">${Tax.fmt(m.total)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;

      content.querySelector('#btn-print-tax')?.addEventListener('click', () => {
        const opts = ReportPrint.collectPrintOpts(content);
        const gstRate = (Tax.gstRate()*100).toFixed(1).replace(/\.0$/,'');
        const pstRate = (Tax.pstRate()*100).toFixed(1).replace(/\.0$/,'');
        ReportPrint.printReport([
          { type: 'kpis', title: 'Tax Summary', items: [
              ['Total Sales', Tax.fmt(s.total_subtotal)],
              [`GST (${gstRate}%)`, Tax.fmt(s.total_gst)],
              [`PST (${pstRate}%)`, Tax.fmt(s.total_pst)],
              ['Total Tax',  Tax.fmt(s.total_gst + s.total_pst)],
            ]},
          { type: 'table', title: 'Tax Breakdown',
            headers: [{ label: 'Description' }, { label: 'Amount', right: true }],
            rows: [
              ['Total Sales (excl. tax)',      Tax.fmt(s.total_subtotal)],
              [`GST Collected (${gstRate}%)`,  Tax.fmt(s.total_gst)],
              [`PST Collected (${pstRate}%)`,  Tax.fmt(s.total_pst)],
              ['Total Tax Collected',          Tax.fmt(s.total_gst + s.total_pst)],
              ['Gross Revenue (incl. tax)',    Tax.fmt(s.gross_sales)],
              ['Voided / Reversed',            `(${Tax.fmt(s.voided_amount)})`],
            ],
            footer: ['NET REVENUE', Tax.fmt(s.gross_sales - s.voided_amount)],
          },
          { type: 'table', title: 'By Payment Method',
            headers: [{ label: 'Method' }, { label: 'Transactions', right: true }, { label: 'Total', right: true }],
            rows: methods.map(m => [m.method, String(m.count), Tax.fmt(m.total)]),
            footer: ['TOTAL', String(methods.reduce((a,m)=>a+m.count,0)), Tax.fmt(methods.reduce((a,m)=>a+m.total,0))],
          },
        ], { title: 'Tax Report', period: `${from} to ${to}`, customHeader: opts.customHeader }, opts);
      });
      content.querySelector('#btn-export-tax').addEventListener('click', async () => {
        const name = await Config.get('pharmacy_name') || 'Pharmacy';
        const gstNo = await Config.get('pharmacy_gst_number') || '';
        const pstNo = await Config.get('pharmacy_pst_number') || '';
        const rows = [
          [`Tax Report — ${name}`],
          [`Period: ${from} to ${to}`],
          [`GST Number: ${gstNo}`],
          [`PST Number: ${pstNo}`],
          [],
          ['Description','Amount'],
          ['Total Sales (excl. tax)', s.total_subtotal],
          [`GST Collected (${gstRate}%)`, s.total_gst],
          [`PST Collected (${pstRate}%)`, s.total_pst],
          ['Total Tax Collected', s.total_gst + s.total_pst],
          ['Gross Revenue (incl. tax)', s.gross_sales],
          ['Voided/Reversed', -s.voided_amount],
          [],
          ['Payment Method Breakdown'],
          ['Method','Count','Total'],
          ...methods.map(m=>[m.method, m.count, m.total]),
        ];
        _csvDownload(rows, `tax_report_${from}_to_${to}.csv`);
      });
      content.querySelector('#btn-email-tax')?.addEventListener('click', async function() {
        const name  = await _pharmacyName();
        const gstNo = (await Config.get('pharmacy_gst_number')) || '';
        const pstNo = (await Config.get('pharmacy_pst_number')) || '';
        const html  = EmailAPI.buildEmailHTML({
          pharmacyName: name,
          title:    'Tax Report',
          subtitle: `Period: ${from} to ${to}${gstNo?' · GST# '+gstNo:''}`,
          sections: [
            { kpis: [['Total Sales', Tax.fmt(s.total_subtotal)],
                     [`GST (${gstRate}%)`, Tax.fmt(s.total_gst)],
                     [`PST (${pstRate}%)`, Tax.fmt(s.total_pst)],
                     ['Total Tax', Tax.fmt(s.total_gst + s.total_pst)]] },
            { heading: 'Tax Breakdown', headers: ['Description', 'Amount'],
              rows: [
                ['Total Sales (excl. tax)',      Tax.fmt(s.total_subtotal)],
                [`GST Collected (${gstRate}%)`,  Tax.fmt(s.total_gst)],
                [`PST Collected (${pstRate}%)`,  Tax.fmt(s.total_pst)],
                ['Total Tax Collected',          Tax.fmt(s.total_gst + s.total_pst)],
                ['Gross Revenue (incl. tax)',    Tax.fmt(s.gross_sales)],
                ['Voided / Reversed',            `(${Tax.fmt(s.voided_amount)})`],
              ]},
            { heading: 'By Payment Method', headers: ['Method', 'Transactions', 'Total'],
              rows: methods.map(m => [m.method, String(m.count), Tax.fmt(m.total)]) },
          ],
        });
        const text = [`TAX REPORT — ${name}`,`Period: ${from} to ${to}`,
          `GST#: ${gstNo}  PST#: ${pstNo}`,``,
          `Sales (excl. tax): ${Tax.fmt(s.total_subtotal)}`,
          `GST (${gstRate}%):       ${Tax.fmt(s.total_gst)}`,
          `PST (${pstRate}%):       ${Tax.fmt(s.total_pst)}`,
          `Total Tax:         ${Tax.fmt(s.total_gst+s.total_pst)}`,
          `Gross Revenue:     ${Tax.fmt(s.gross_sales)}`,
        ].join('\n');
        _sendEmail({ recipientKey:'email_recipients_sales', subject:`Tax Report ${from} to ${to}`,
          htmlBody: html, textBody: text, btn: this });
      });
    };
    this._attachDatePicker(content, run);
    run(this._from, this._to);
  }

  /* ── By Method ───────────────────────────────────────────── */
  _renderMethods(content) {
    content.innerHTML = `
      <div class="settings-section">
        <h3>Sales by Payment Method</h3>
        ${this._datePickerHTML()}
        <div id="methods-body"></div>
      </div>`;
    const run = (from, to) => {
      const methods = DB.getSalesByMethod(from, to);
      const total   = methods.reduce((s,m) => s+m.total, 0);
      const body    = content.querySelector('#methods-body');
      if (!methods.length) { body.innerHTML = '<p class="text-muted">No payments in this period.</p>'; return; }
      body.innerHTML = `
        <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="btn-export-methods">&#8659; Export CSV</button>
          <button class="btn btn-outline btn-sm" id="btn-print-methods">&#128438; Print</button>
          <button class="btn btn-outline btn-sm" id="btn-email-methods">&#9993; Email</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px;">
          ${methods.map(m=>`
            <div style="background:var(--surface2);padding:14px;border-radius:var(--radius);">
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${m.method}</div>
              <div style="font-size:18px;font-weight:700;">${Tax.fmt(m.total)}</div>
              <div style="font-size:12px;color:var(--text-muted);">${m.count} transaction${m.count!==1?'s':''}</div>
              <div style="margin-top:6px;height:4px;background:var(--border);border-radius:2px;">
                <div style="height:4px;background:var(--primary);border-radius:2px;width:${total?Math.round(m.total/total*100):0}%;"></div>
              </div>
            </div>`).join('')}
        </div>
        <table class="table" style="font-size:14px;">
          <thead><tr><th>Method</th><th class="text-right">Transactions</th><th class="text-right">Total</th><th class="text-right">% of Sales</th></tr></thead>
          <tbody>
            ${methods.map(m=>`<tr>
              <td>${m.method}</td>
              <td class="text-right">${m.count}</td>
              <td class="text-right" style="font-weight:600;">${Tax.fmt(m.total)}</td>
              <td class="text-right">${total?(m.total/total*100).toFixed(1):0}%</td>
            </tr>`).join('')}
            <tr style="font-weight:700;border-top:2px solid var(--border);">
              <td>TOTAL</td><td class="text-right">${methods.reduce((s,m)=>s+m.count,0)}</td>
              <td class="text-right">${Tax.fmt(total)}</td><td class="text-right">100%</td>
            </tr>
          </tbody>
        </table>`;
      content.querySelector('#btn-export-methods').addEventListener('click', () => {
        _csvDownload([['Method','Transactions','Total'],
          ...methods.map(m=>[m.method,m.count,m.total])],
          `sales_by_method_${from}_to_${to}.csv`);
      });
      content.querySelector('#btn-print-methods')?.addEventListener('click', () => {
        const opts = ReportPrint.collectPrintOpts(content);
        ReportPrint.printReport([
          { type: 'kpis', title: 'Payment Totals',
            items: methods.map(m => [m.method, Tax.fmt(m.total)]) },
          { type: 'table', title: 'Breakdown by Method',
            headers: [
              { label: 'Method' }, { label: 'Transactions', right: true },
              { label: 'Total', right: true }, { label: '% of Sales', right: true }],
            rows: methods.map(m => [
              m.method, String(m.count), Tax.fmt(m.total),
              total ? (m.total/total*100).toFixed(1)+'%' : '0%']),
            footer: ['TOTAL', String(methods.reduce((a,m)=>a+m.count,0)), Tax.fmt(total), '100%'],
          },
        ], { title: 'Sales by Payment Method', period: `${from} to ${to}`, customHeader: opts.customHeader }, opts);
      });
      content.querySelector('#btn-email-methods')?.addEventListener('click', async function() {
        const name = await _pharmacyName();
        const html = EmailAPI.buildEmailHTML({
          pharmacyName: name,
          title:    'Sales by Payment Method',
          subtitle: `Period: ${from} to ${to}`,
          sections: [
            { kpis: methods.map(m => [m.method, Tax.fmt(m.total)]) },
            { heading: 'Breakdown', headers: ['Method', 'Transactions', 'Total', '% of Sales'],
              rows: [
                ...methods.map(m => [m.method, String(m.count), Tax.fmt(m.total),
                                     total ? (m.total/total*100).toFixed(1)+'%' : '0%']),
                ['TOTAL', String(methods.reduce((a,m)=>a+m.count,0)), Tax.fmt(total), '100%'],
              ]},
          ],
        });
        const text = [`SALES BY METHOD — ${name}`,`Period: ${from} to ${to}`,``,
          ...methods.map(m=>`${m.method.padEnd(12)} ${Tax.fmt(m.total).padStart(10)}  (${m.count} txns)`),
          `${'TOTAL'.padEnd(12)} ${Tax.fmt(total).padStart(10)}`,
        ].join('\n');
        _sendEmail({ recipientKey:'email_recipients_sales', subject:`Sales by Method ${from} to ${to}`,
          htmlBody: html, textBody: text, btn: this });
      });
    };
    this._attachDatePicker(content, run);
    run(this._from, this._to);
  }

  /* ── Products Sold ───────────────────────────────────────── */
  _renderProducts(content) {
    content.innerHTML = `
      <div class="settings-section">
        <h3>Products Sold</h3>
        ${this._datePickerHTML()}
        <div id="products-body"></div>
      </div>`;
    const run = (from, to) => {
      const items = DB.getSoldProducts(from, to);
      const body  = content.querySelector('#products-body');
      if (!items.length) { body.innerHTML = '<p class="text-muted">No items sold in this period.</p>'; return; }
      body.innerHTML = `
        <div style="margin-bottom:12px;display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="btn-export-sold">&#8659; Export CSV</button>
          <button class="btn btn-outline btn-sm" id="btn-print-sold">&#128438; Print</button>
          <button class="btn btn-outline btn-sm" id="btn-email-sold">&#9993; Email</button>
        </div>
        <div style="overflow-x:auto;">
          <table class="table" style="font-size:13px;">
            <thead><tr><th>Description</th><th>Type</th><th>DIN/UPC</th>
              <th class="text-right">Qty Sold</th><th class="text-right">Revenue</th></tr></thead>
            <tbody>
              ${items.map(i=>`<tr>
                <td>${i.description}</td>
                <td><span class="badge badge-${(i.item_type||'').toLowerCase()}" style="font-size:11px;">${i.item_type||'—'}</span></td>
                <td style="font-size:12px;color:var(--text-muted);">${i.din||i.upc||'—'}</td>
                <td class="text-right" style="font-weight:600;">${i.qty_sold}</td>
                <td class="text-right">${Tax.fmt(i.total_revenue)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      content.querySelector('#btn-export-sold').addEventListener('click', () => {
        _csvDownload([['Description','Type','DIN','UPC','Qty Sold','Revenue'],
          ...items.map(i=>[i.description,i.item_type||'',i.din||'',i.upc||'',i.qty_sold,i.total_revenue])],
          `products_sold_${from}_to_${to}.csv`);
      });
      content.querySelector('#btn-print-sold')?.addEventListener('click', () => {
        const opts = ReportPrint.collectPrintOpts(content);
        const totalRev = items.reduce((a,i)=>a+i.total_revenue, 0);
        const totalQty = items.reduce((a,i)=>a+i.qty_sold, 0);
        ReportPrint.printReport([
          { type: 'kpis', items: [
              ['Product Lines', String(items.length)],
              ['Total Units Sold', String(totalQty)],
              ['Total Revenue', Tax.fmt(totalRev)],
            ]},
          { type: 'table', title: 'Products Sold',
            headers: [
              { label: 'Description' }, { label: 'Type' }, { label: 'DIN / UPC' },
              { label: 'Qty Sold', right: true }, { label: 'Revenue', right: true }],
            rows: items.map(i => [
              i.description, i.item_type||'—', i.din||i.upc||'—',
              String(i.qty_sold), Tax.fmt(i.total_revenue)]),
            footer: ['', '', 'TOTAL', String(totalQty), Tax.fmt(totalRev)],
          },
        ], { title: 'Products Sold', period: `${from} to ${to}`, customHeader: opts.customHeader }, opts);
      });
      content.querySelector('#btn-email-sold')?.addEventListener('click', async function() {
        const name     = await _pharmacyName();
        const totalRev = items.reduce((a,i)=>a+i.total_revenue,0);
        const totalQty = items.reduce((a,i)=>a+i.qty_sold,0);
        const html = EmailAPI.buildEmailHTML({
          pharmacyName: name,
          title:    'Products Sold',
          subtitle: `Period: ${from} to ${to}`,
          sections: [
            { kpis: [['Items (lines)', String(items.length)],['Total Qty', String(totalQty)],['Revenue', Tax.fmt(totalRev)]] },
            { heading: 'Top Products', headers: ['Description', 'Type', 'Qty Sold', 'Revenue'],
              rows: items.slice(0,30).map(i=>[i.description, i.item_type||'—', String(i.qty_sold), Tax.fmt(i.total_revenue)]) },
          ],
        });
        const text = [`PRODUCTS SOLD — ${name}`,`Period: ${from} to ${to}`,``,
          ...items.map(i=>`${i.description.substring(0,30).padEnd(31)} qty:${String(i.qty_sold).padStart(4)}  ${Tax.fmt(i.total_revenue).padStart(10)}`),
          `\nTOTAL qty: ${totalQty}  revenue: ${Tax.fmt(totalRev)}`,
        ].join('\n');
        _sendEmail({ recipientKey:'email_recipients_products', subject:`Products Sold ${from} to ${to}`,
          htmlBody: html, textBody: text, btn: this });
      });
    };
    this._attachDatePicker(content, run);
    run(this._from, this._to);
  }

  /* ── Order Suggestions + McKesson TXT ───────────────────── */
  _renderOrders(content) {
    content.innerHTML = `
      <div class="settings-section">
        <h3>Order Suggestions</h3>
        <div class="alert alert-info" style="font-size:13px;">
          Based on sales in the selected period. Adjust reorder multiplier to control order size.
          McKesson # can be edited inline — changes save automatically.
          After placing an order, use <strong>Mark Ordered</strong> to hide items from suggestions for 30 days.
        </div>
        ${this._datePickerHTML()}
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:10px;">
            <label style="white-space:nowrap;font-size:13px;">Reorder multiplier</label>
            <input type="number" id="order-mult" value="1.5" step="0.5" min="0.5" max="10" style="width:80px;" />
            <span style="font-size:13px;color:var(--text-muted);">× avg weekly sales</span>
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-left:auto;">
            <input type="checkbox" id="hide-ordered" checked />
            Hide recently ordered (30 days)
          </label>
        </div>
        <div id="orders-body"></div>
      </div>`;

    const run = (from, to) => {
      const items   = DB.getSoldProducts(from, to).filter(i => i.item_type !== 'RX');
      const body    = content.querySelector('#orders-body');
      const mult    = parseFloat(content.querySelector('#order-mult').value) || 1.5;
      const hideOrd = content.querySelector('#hide-ordered').checked;

      const days  = Math.max(1, (new Date(to) - new Date(from)) / 86400000 + 1);
      const weeks = days / 7;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      const cutoff = cutoffDate.toISOString();

      // Enrich each item with catalog lookup (product_id, mckesson_item_no, ordered_at)
      const allSuggested = items.map(i => {
        const prod = _findProduct(i);
        return {
          ...i,
          product_id:    prod?.product_id           || null,
          item_no:       prod?.mckesson_item_no      || '',
          ordered_at:    prod?.mckesson_ordered_at   || null,
          weekly_rate:   Tax.round2(i.qty_sold / weeks),
          suggested_qty: Math.ceil((i.qty_sold / weeks) * mult),
        };
      }).filter(i => i.suggested_qty > 0);

      const visible     = hideOrd
        ? allSuggested.filter(i => !i.ordered_at || i.ordered_at < cutoff)
        : allSuggested;
      const hiddenCount = allSuggested.length - visible.length;

      if (!allSuggested.length) {
        body.innerHTML = '<p class="text-muted">No OTC items sold in this period.</p>';
        return;
      }

      body.innerHTML = `
        <div style="margin-bottom:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-outline btn-sm" id="btn-export-order-csv">&#8659; Export CSV</button>
          <button class="btn btn-primary btn-sm" id="btn-export-mckesson">&#8659; McKesson Order TXT</button>
          <button class="btn btn-outline btn-sm" id="btn-email-orders">&#9993; Email</button>
          ${hiddenCount ? `<span style="font-size:12px;color:var(--text-muted);margin-left:4px;">${hiddenCount} item${hiddenCount!==1?'s':''} hidden (ordered recently — uncheck above to show)</span>` : ''}
        </div>
        ${visible.length === 0
          ? '<div class="alert alert-info" style="font-size:13px;">All items were recently ordered. Uncheck "Hide recently ordered" above to show them.</div>'
          : `<div style="overflow-x:auto;">
            <table class="table" style="font-size:13px;">
              <thead><tr>
                <th>Description</th>
                <th>McKesson # <small style="font-weight:400;opacity:.65;">(click to edit)</small></th>
                <th>UPC</th>
                <th class="text-right">Sold</th>
                <th class="text-right">Wkly</th>
                <th class="text-right">Suggest</th>
                <th style="text-align:center;">Order Qty</th>
                <th style="text-align:center;">Status</th>
              </tr></thead>
              <tbody>
                ${visible.map((i, idx) => `<tr data-idx="${idx}">
                  <td>${i.description}</td>
                  <td style="min-width:130px;">
                    <div style="display:flex;align-items:center;gap:4px;">
                      <input class="mckesson-item-input" type="text" data-idx="${idx}"
                        data-product-id="${i.product_id||''}"
                        value="${i.item_no||''}"
                        placeholder="${i.product_id?'Enter item #':'—'}"
                        ${!i.product_id?'disabled title="Custom product — not in catalog"':''}
                        style="width:88px;font-family:monospace;font-size:12px;padding:3px 6px;" />
                      <span class="save-indicator" style="font-size:11px;color:var(--success);min-width:28px;"></span>
                    </div>
                  </td>
                  <td style="font-size:12px;color:var(--text-muted);">${i.upc||'—'}</td>
                  <td class="text-right">${i.qty_sold}</td>
                  <td class="text-right">${i.weekly_rate}</td>
                  <td class="text-right" style="font-weight:600;">${i.suggested_qty}</td>
                  <td style="text-align:center;">
                    <input type="number" class="order-qty" data-idx="${idx}"
                      value="${i.suggested_qty}" min="0" step="1"
                      style="width:70px;text-align:center;" />
                  </td>
                  <td style="text-align:center;">
                    ${i.product_id
                      ? `<button class="btn btn-outline btn-sm btn-mark-ordered" data-idx="${idx}"
                          style="font-size:11px;padding:2px 8px;white-space:nowrap;">Mark Ordered</button>`
                      : '<span style="color:var(--text-muted);font-size:11px;">—</span>'}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`}`;

      /* — Editable McKesson item number — saves on change/blur — */
      body.querySelectorAll('.mckesson-item-input').forEach(input => {
        const saveItemNo = () => {
          const pid = parseInt(input.dataset.productId);
          const val = input.value.trim() || null;
          if (!pid) return;
          const ind = input.parentElement.querySelector('.save-indicator');
          try {
            DB.run('UPDATE products SET mckesson_item_no=? WHERE product_id=?', [val, pid]);
            visible[parseInt(input.dataset.idx)].item_no = val || '';
            if (ind) {
              ind.textContent = '✓';
              ind.style.color = 'var(--success)';
              setTimeout(() => { ind.textContent = ''; }, 2500);
            }
          } catch(_) {
            if (ind) {
              ind.textContent = '⚠dup';
              ind.style.color = 'var(--danger)';
              setTimeout(() => { ind.textContent = ''; ind.style.color = 'var(--success)'; }, 3000);
            }
          }
        };
        input.addEventListener('change', saveItemNo);
        input.addEventListener('blur',   saveItemNo);
      });

      /* — Mark Ordered per-row — */
      body.querySelectorAll('.btn-mark-ordered').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx  = parseInt(btn.dataset.idx);
          const item = visible[idx];
          const now  = new Date().toISOString();
          if (item.product_id) {
            DB.run('UPDATE products SET mckesson_ordered_at=? WHERE product_id=?', [now, item.product_id]);
            item.ordered_at = now;
          }
          const row = btn.closest('tr');
          row.style.transition = 'opacity .3s';
          row.style.opacity    = '0.35';
          btn.textContent      = '✓ Ordered';
          btn.disabled         = true;
          btn.style.color      = 'var(--success)';
        });
      });

      /* — Collect current adjusted qtys from table — */
      const getQtys = () => {
        const inputs = [...body.querySelectorAll('.order-qty')];
        const itemNos = [...body.querySelectorAll('.mckesson-item-input')];
        return inputs.map((el, idx) => ({
          ...visible[idx],
          qty:     parseInt(el.value) || 0,
          item_no: (itemNos[idx]?.value?.trim()) || visible[idx].item_no || '',
        })).filter(i => i.qty > 0);
      };

      /* — CSV export — */
      body.querySelector('#btn-export-order-csv')?.addEventListener('click', () => {
        _csvDownload(
          [['Description', 'McKesson Item No', 'UPC', 'Qty to Order'],
            ...getQtys().map(i => [i.description, i.item_no || '', i.upc || '', i.qty])],
          `order_suggestions_${from}_to_${to}.csv`
        );
      });

      /* — McKesson TXT export — */
      body.querySelector('#btn-export-mckesson')?.addEventListener('click', () => {
        const qtys  = getQtys();
        const exportable = qtys.filter(i => i.item_no);
        const skipped    = qtys.length - exportable.length;
        if (!exportable.length) {
          alert('No items have McKesson item numbers.\n\nTip: Click the "McKesson #" field for any item above to type its number — it saves automatically and will be remembered for future orders.');
          return;
        }
        const lines = exportable.map(i => `${String(i.item_no).padStart(7, '0')}\t${i.qty}`);
        const txt = [
          'PHARMACY ORDER',
          `DATE: ${_dateStr()}`,
          `ITEMS: ${lines.length}`,
          '',
          'ITEM_NO\tQTY',
          ...lines,
        ].join('\n');
        const blob = new Blob([txt], { type: 'text/plain' });
        _downloadBlob(blob, `mckesson_order_${_dateStr()}.txt`);

        // Offer to mark exported items as ordered
        const msg = skipped
          ? `Order file downloaded (${lines.length} item${lines.length!==1?'s':''}, ${skipped} skipped — no McKesson #).\n\nMark the ${lines.length} exported items as "ordered" to hide them from suggestions for 30 days?`
          : `Order file downloaded (${lines.length} item${lines.length!==1?'s':''}).\n\nMark all as "ordered" to hide them from suggestions for 30 days?`;
        if (confirm(msg)) {
          const now = new Date().toISOString();
          exportable.forEach(i => {
            if (i.product_id) {
              DB.run('UPDATE products SET mckesson_ordered_at=? WHERE product_id=?', [now, i.product_id]);
              i.ordered_at = now;
            }
          });
          // Visually fade ordered rows
          body.querySelectorAll('.order-qty').forEach((el, idx) => {
            if (visible[idx]?.ordered_at && visible[idx]?.product_id) {
              const row = el.closest('tr');
              row.style.transition = 'opacity .4s';
              row.style.opacity    = '0.3';
              const mkBtn = row.querySelector('.btn-mark-ordered');
              if (mkBtn) { mkBtn.textContent = '✓ Ordered'; mkBtn.disabled = true; mkBtn.style.color = 'var(--success)'; }
            }
          });
        }
      });

      /* — Email — */
      body.querySelector('#btn-email-orders')?.addEventListener('click', async function() {
        const name = await _pharmacyName();
        const qtys = getQtys();
        const html = EmailAPI.buildEmailHTML({
          pharmacyName: name,
          title:    'Order Suggestions',
          subtitle: `Period: ${from} to ${to} · ${mult}× weekly sales`,
          sections: [
            { kpis: [['Items to Order', String(qtys.length)],
                     ['Total Units', String(qtys.reduce((a,i)=>a+i.qty,0))]] },
            { heading: 'Suggested Order',
              headers: ['Description', 'McKesson #', 'Weekly Rate', 'Order Qty'],
              rows: qtys.map(i=>[i.description, i.item_no||'—', String(i.weekly_rate), String(i.qty)]) },
          ],
        });
        const text = [`ORDER SUGGESTIONS — ${name}`,`Period: ${from} to ${to}`,`Multiplier: ${mult}x`,``,
          ...qtys.map(i=>`${i.description.substring(0,30).padEnd(31)} mcks:${(i.item_no||'—').padStart(7)}  qty:${String(i.qty).padStart(4)}`),
        ].join('\n');
        _sendEmail({ recipientKey:'email_recipients_orders', subject:`Order Suggestions ${from} to ${to}`,
          htmlBody: html, textBody: text, btn: this });
      });
    };

    this._attachDatePicker(content, run);
    content.querySelector('#order-mult').addEventListener('change', () =>
      run(content.querySelector('#rpt-from').value, content.querySelector('#rpt-to').value));
    content.querySelector('#hide-ordered').addEventListener('change', () =>
      run(content.querySelector('#rpt-from').value, content.querySelector('#rpt-to').value));
    run(this._from, this._to);
  }

  /* ── Shift Reports ───────────────────────────────────────── */
  _renderShifts(content) {
    content.innerHTML = `
      <div class="settings-section">
        <h3>Shift Reports</h3>
        <div id="shifts-body"></div>
      </div>`;

    const body = content.querySelector('#shifts-body');
    const shifts = DB.getShiftHistory(100);

    if (!shifts.length) {
      body.innerHTML = '<p class="text-muted">No shifts recorded yet.</p>';
      return;
    }

    const rows = shifts.map(s => {
      const summary   = DB.getShiftSummary(s.shift_id);
      const openedAt  = new Date(s.opened_at);
      const closedAt  = s.closed_at ? new Date(s.closed_at) : null;
      const durMins   = closedAt ? Math.round((closedAt - openedAt) / 60000) : null;
      const durStr    = durMins !== null
        ? `${Math.floor(durMins/60)}h ${durMins%60}m`
        : '<span style="color:var(--warning);">Open</span>';
      const variance  = s.closing_counted !== null
        ? Tax.round2(s.closing_counted - summary.expectedCash)
        : null;
      const varStr    = variance !== null
        ? `<span style="color:${Math.abs(variance)<0.01?'var(--success)':Math.abs(variance)>5?'var(--danger)':'#856404'};font-weight:600;">${variance>=0?'+':''}${Tax.fmt(variance)}</span>`
        : '—';
      const statusBadge = s.status === 'OPEN'
        ? '<span class="badge badge-warning" style="font-size:11px;">OPEN</span>'
        : '<span class="badge badge-success" style="font-size:11px;">CLOSED</span>';

      return { s, summary, openedAt, closedAt, durStr, variance, varStr, statusBadge };
    });

    body.innerHTML = `
      <div style="margin-bottom:12px;display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" id="btn-export-shifts">&#8659; Export CSV</button>
        <button class="btn btn-outline btn-sm" id="btn-email-shifts">&#9993; Email</button>
      </div>
      <div style="overflow-x:auto;">
        <table class="table" style="font-size:13px;">
          <thead><tr>
            <th>Shift #</th><th>Staff</th><th>Opened</th><th>Closed</th>
            <th>Duration</th><th>Status</th>
            <th class="text-right">Float</th>
            <th class="text-right">Expected</th>
            <th class="text-right">Counted</th>
            <th class="text-right">Variance</th>
            <th class="text-right">Total Sales</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr data-shift-id="${r.s.shift_id}" style="cursor:pointer;">
                <td>#${r.s.shift_id}</td>
                <td>${r.s.staff_name || '—'}</td>
                <td>${r.openedAt.toLocaleString(navigator.language,{dateStyle:'short',timeStyle:'short'})}</td>
                <td>${r.closedAt ? r.closedAt.toLocaleString(navigator.language,{dateStyle:'short',timeStyle:'short'}) : '—'}</td>
                <td>${r.durStr}</td>
                <td>${r.statusBadge}</td>
                <td class="text-right">${Tax.fmt(r.s.opening_float||0)}</td>
                <td class="text-right">${Tax.fmt(r.summary.expectedCash)}</td>
                <td class="text-right">${r.s.closing_counted !== null ? Tax.fmt(r.s.closing_counted) : '—'}</td>
                <td class="text-right">${r.varStr}</td>
                <td class="text-right" style="font-weight:600;">${Tax.fmt(r.summary.txnSummary.total_sales)}</td>
                <td><button class="btn btn-outline btn-sm btn-shift-detail" data-shift-id="${r.s.shift_id}" style="padding:2px 8px;font-size:11px;">Details</button></td>
              </tr>
              <tr class="shift-detail-row" id="shift-detail-${r.s.shift_id}" style="display:none;">
                <td colspan="12" style="padding:0;">
                  ${_shiftDetailHTML(r.s, r.summary)}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    // Toggle detail rows
    body.querySelectorAll('.btn-shift-detail').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id  = btn.dataset.shiftId;
        const row = body.querySelector(`#shift-detail-${id}`);
        const isOpen = row.style.display !== 'none';
        row.style.display = isOpen ? 'none' : 'table-row';
        btn.textContent   = isOpen ? 'Details' : 'Hide';
      });
    });

    body.querySelector('#btn-email-shifts')?.addEventListener('click', async function() {
      const name   = await _pharmacyName();
      const closed = rows.filter(r => r.s.status === 'CLOSED');
      const totalSales = closed.reduce((a,r)=>a+r.summary.txnSummary.total_sales,0);
      const html = EmailAPI.buildEmailHTML({
        pharmacyName: name,
        title:    'Shift Report',
        subtitle: `Generated ${new Date().toLocaleString(navigator.language)}`,
        sections: [
          { kpis: [['Shifts (closed)', String(closed.length)], ['Total Sales', Tax.fmt(totalSales)]] },
          { heading: 'Shift Summary',
            headers: ['#', 'Staff', 'Opened', 'Duration', 'Float', 'Expected', 'Counted', 'Variance', 'Sales'],
            rows: closed.map(r => {
              const variance = r.s.closing_counted !== null ? Tax.round2(r.s.closing_counted - r.summary.expectedCash) : null;
              return [
                '#'+r.s.shift_id,
                r.s.staff_name||'—',
                r.openedAt.toLocaleString(navigator.language,{dateStyle:'short',timeStyle:'short'}),
                r.durStr.replace(/<[^>]+>/g,''),
                Tax.fmt(r.s.opening_float||0),
                Tax.fmt(r.summary.expectedCash),
                r.s.closing_counted!==null ? Tax.fmt(r.s.closing_counted) : '—',
                variance!==null ? (variance>=0?'+':'')+Tax.fmt(variance) : '—',
                Tax.fmt(r.summary.txnSummary.total_sales),
              ];
            }),
          },
        ],
      });
      const text = [`SHIFT REPORT — ${name}`,`Generated: ${new Date().toLocaleString(navigator.language)}`,``,
        ...closed.map(r=>{
          const v = r.s.closing_counted!==null?Tax.round2(r.s.closing_counted-r.summary.expectedCash):null;
          return `Shift #${r.s.shift_id}  ${r.s.staff_name||'—'}  Sales: ${Tax.fmt(r.summary.txnSummary.total_sales)}  Variance: ${v!==null?(v>=0?'+':'')+Tax.fmt(v):'—'}`;
        }),
        `\nTotal Sales: ${Tax.fmt(totalSales)}`,
      ].join('\n');
      _sendEmail({ recipientKey:'email_recipients_shifts', subject:`Shift Report ${_dateStr()}`,
        htmlBody: html, textBody: text, btn: this });
    });

    body.querySelector('#btn-export-shifts').addEventListener('click', () => {
      _csvDownload([
        ['Shift #','Staff','Opened','Closed','Duration','Status','Opening Float',
         'Cash Sales','Cash In','Cash Out','Expected Cash','Counted Cash','Variance','Total Sales','Notes'],
        ...rows.map(r => [
          r.s.shift_id,
          r.s.staff_name || '',
          r.s.opened_at,
          r.s.closed_at || '',
          r.durStr.replace(/<[^>]+>/g,''),
          r.s.status,
          r.s.opening_float || 0,
          r.summary.cashSales,
          r.summary.cashIn,
          r.summary.cashOut,
          r.summary.expectedCash,
          r.s.closing_counted !== null ? r.s.closing_counted : '',
          r.variance !== null ? r.variance : '',
          r.summary.txnSummary.total_sales,
          r.s.closing_notes || '',
        ])
      ], `shift_reports_${_dateStr()}.csv`);
    });
  }

  detach() {}
}

/* Shift detail panel HTML — payment breakdown + cash movements + notes */
function _shiftDetailHTML(shift, summary) {
  const byMethodRows = summary.byMethod.map(m => `
    <tr><td>${m.method}</td>
        <td class="text-right">${m.count}</td>
        <td class="text-right" style="font-weight:600;">${Tax.fmt(m.total)}</td></tr>`).join('') ||
    '<tr><td colspan="3" style="color:var(--text-muted);">No payments</td></tr>';

  const movementRows = summary.movements.length
    ? summary.movements.map(m => `
        <tr>
          <td>${new Date(m.movement_date).toLocaleString(navigator.language,{dateStyle:'short',timeStyle:'short'})}</td>
          <td><span class="badge badge-${m.movement_type==='CASH_IN'?'success':'danger'}" style="font-size:11px;">${m.movement_type==='CASH_IN'?'Cash In':'Cash Out'}</span></td>
          <td class="text-right" style="font-weight:600;">${Tax.fmt(m.amount)}</td>
          <td style="color:var(--text-muted);">${m.reason||'—'}</td>
          <td>${m.staff_name||'—'}</td>
        </tr>`).join('')
    : '<tr><td colspan="5" style="color:var(--text-muted);">No cash movements</td></tr>';

  const variance = shift.closing_counted !== null
    ? Tax.round2(shift.closing_counted - summary.expectedCash) : null;
  const varColor  = variance === null ? '' : Math.abs(variance) < 0.01 ? 'var(--success)' : Math.abs(variance) > 5 ? 'var(--danger)' : '#856404';

  return `
    <div style="padding:16px 20px;background:var(--surface2);border-top:2px solid var(--border);">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Payment Breakdown</div>
          <table class="table" style="font-size:13px;">
            <thead><tr><th>Method</th><th class="text-right">Txns</th><th class="text-right">Total</th></tr></thead>
            <tbody>${byMethodRows}</tbody>
          </table>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Cash Reconciliation</div>
          <table class="table" style="font-size:13px;">
            <tbody>
              <tr><td>Opening Float</td><td class="text-right">${Tax.fmt(shift.opening_float||0)}</td></tr>
              <tr><td>+ Cash Sales</td><td class="text-right">${Tax.fmt(summary.cashSales)}</td></tr>
              <tr><td>+ Cash In</td><td class="text-right">${Tax.fmt(summary.cashIn)}</td></tr>
              <tr><td>− Cash Out</td><td class="text-right">(${Tax.fmt(summary.cashOut)})</td></tr>
              <tr style="border-top:2px solid var(--border);font-weight:700;"><td>Expected Cash</td><td class="text-right">${Tax.fmt(summary.expectedCash)}</td></tr>
              <tr><td>Counted Cash</td><td class="text-right">${shift.closing_counted !== null ? Tax.fmt(shift.closing_counted) : '—'}</td></tr>
              ${variance !== null ? `<tr><td style="font-weight:700;">Variance</td>
                <td class="text-right" style="font-weight:700;color:${varColor};">${variance>=0?'+':''}${Tax.fmt(variance)}</td></tr>` : ''}
            </tbody>
          </table>
          ${shift.closing_notes ? `<div style="margin-top:8px;font-size:12px;color:var(--text-muted);"><strong>Notes:</strong> ${shift.closing_notes}</div>` : ''}
        </div>
      </div>
      <div style="margin-top:16px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Cash Movements Log</div>
        <table class="table" style="font-size:13px;">
          <thead><tr><th>Time</th><th>Type</th><th class="text-right">Amount</th><th>Reason</th><th>Staff</th></tr></thead>
          <tbody>${movementRows}</tbody>
        </table>
      </div>
    </div>`;
}

/* Send a report email, with status feedback on a button/element */
async function _sendEmail({ recipientKey, subject, htmlBody, textBody, statusEl, btn }) {
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  if (statusEl) { statusEl.textContent = ''; }
  try {
    const result = await EmailAPI.sendReport({ recipientKey, subject, htmlBody, textBody });
    const msg = result.method === 'mailto'
      ? 'Mail client opened — review and send.'
      : `✓ Email sent successfully.`;
    if (statusEl) { statusEl.textContent = msg; statusEl.style.color = 'var(--success)'; }
    else { alert(msg); }
  } catch(e) {
    const msg = `✗ ${e.message}`;
    if (statusEl) { statusEl.textContent = msg; statusEl.style.color = 'var(--danger)'; }
    else { alert(msg); }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '&#9993; Email'; }
  }
}

async function _pharmacyName() {
  return (await Config.get('pharmacy_name')) || 'Pharmacy POS';
}

/**
 * Find the catalog product row for a sold item.
 * Returns { product_id, mckesson_item_no, mckesson_ordered_at } or null.
 * Tries: exact UPC → leading-zero-stripped UPC → DIN → exact description.
 */
function _findProduct(item) {
  let p = null;

  // 1. Exact UPC match (upc_unit or gtin_unit)
  if (item.upc) {
    p = DB.get(
      `SELECT product_id, mckesson_item_no, mckesson_ordered_at FROM products
       WHERE upc_unit=? OR gtin_unit=? LIMIT 1`,
      [item.upc, item.upc]
    );
  }

  // 2. Leading-zero-stripped UPC match
  if (!p && item.upc) {
    const s = String(item.upc).replace(/^0+/, '');
    if (s) {
      p = DB.get(
        `SELECT product_id, mckesson_item_no, mckesson_ordered_at FROM products
         WHERE LTRIM(upc_unit,'0')=? OR LTRIM(gtin_unit,'0')=? LIMIT 1`,
        [s, s]
      );
    }
  }

  // 3. DIN match
  if (!p && item.din) {
    p = DB.get(
      `SELECT product_id, mckesson_item_no, mckesson_ordered_at FROM products
       WHERE din=? LIMIT 1`,
      [item.din]
    );
  }

  // 4. Exact description match (fallback)
  if (!p && item.description) {
    p = DB.get(
      `SELECT product_id, mckesson_item_no, mckesson_ordered_at FROM products
       WHERE LOWER(TRIM(description))=LOWER(TRIM(?)) LIMIT 1`,
      [item.description]
    );
  }

  return p || null;
}

/* CSV helper — shared with settings.js exports */
function _csvDownload(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v===null||v===undefined?'':v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  _downloadBlob(blob, filename);
}
