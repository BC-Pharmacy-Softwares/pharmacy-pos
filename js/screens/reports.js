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
             ['products','Products Sold'],['orders','Order Suggestions'],['shifts','Shift Reports'],
             ['btclog','BTC / Controlled Log'],['ar','Accounts Receivable'],
             ['yearend','Year-End (Accountant)']].map(([id,label]) =>
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
      case 'btclog':   this._renderBtcLog(content);   break;
      case 'ar':       this._renderAR(content);       break;
      case 'yearend':  this._renderYearEnd(content);  break;
    }
  }

  /* ── Year-End accountant package (as of fiscal year-end) ── */
  async _renderYearEnd(content) {
    const fyEndSaved = (await Config.get('fiscal_year_end')) || (new Date().getFullYear() + '-12-31');
    const fyStartOf = (fyEnd) => {
      const d = new Date(fyEnd); const s = new Date(d);
      s.setFullYear(d.getFullYear() - 1); s.setDate(s.getDate() + 1);
      return s.toISOString().slice(0, 10);
    };
    const fromSaved  = (await Config.get('ye_from')) || fyStartOf(fyEndSaved);
    const cutoff     = (await Config.get('ar_cutoff_date')) || '';
    content.innerHTML = `
      <div class="settings-section" style="max-width:900px;">
        <h3>Year-End Accountant Package</h3>
        <div class="alert alert-info">Bundle for your accountant for any period: AR aging (as of the end date), bad debt written off, collected, inventory value, and sales/tax. CSV-exportable.</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">
          <span style="font-size:13px;color:var(--text-muted);">Period — From</span>
          <input type="date" id="ye-from" value="${fromSaved}" style="width:auto;" />
          <span style="font-size:13px;color:var(--text-muted);">To</span>
          <input type="date" id="ye-to" value="${fyEndSaved}" style="width:auto;" />
          <button class="btn btn-primary btn-sm" id="ye-generate">Generate</button>
          <span id="ye-status" style="font-size:12px;color:var(--text-muted);"></span>
        </div>
        <div id="ye-out"></div>
      </div>`;

    const generate = async () => {
      const from = content.querySelector('#ye-from').value;
      const to   = content.querySelector('#ye-to').value;
      if (!from || !to) return;
      await Config.setMany({ fiscal_year_end: to, ye_from: from });
      const start = from, fyEnd = to;
      const status = content.querySelector('#ye-status');
      status.textContent = 'Reconciling AR from WinRx…';

      // AR outstanding/aging is a point-in-time balance → as of the end date
      // (uses the global billed-from cutoff). Activity metrics use the From–To period.
      const ye   = await AR.getYearEndAR({ cutoff, fyEnd: to });
      const sales = DB.getSalesSummary(start, fyEnd);
      const coll  = DB.getTotalCollectedInRange(start, fyEnd);
      const inv   = DB.getInventoryValuation();
      const wo    = DB.getArWriteOffs(start, fyEnd);
      const woTotal = wo.reduce((s, w) => s + (w.amount || 0), 0);
      status.textContent = '';

      if (ye.error) { content.querySelector('#ye-out').innerHTML = `<div class="alert alert-danger">${ye.error}</div>`; return; }
      const ag = ye.aging;
      content.querySelector('#ye-out').innerHTML = `
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">Period ${start} → ${fyEnd}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:18px;">
          ${[['AR outstanding (as of '+fyEnd+')', Tax.fmt(ye.totalOutstanding)],
             ['Bad debt written off', Tax.fmt(woTotal)],
             ['Collected in period', Tax.fmt(coll.total)],
             ['Net sales (POS)', Tax.fmt(sales.gross_sales)],
             ['GST collected', Tax.fmt(sales.total_gst)],
             ['PST collected', Tax.fmt(sales.total_pst)],
             ['Inventory (retail value)', Tax.fmt(inv.retailValue)],
             ['Accounts owing', String(ye.count)],
            ].map(([l,v]) => `<div style="background:var(--surface2);border-radius:var(--radius);padding:10px 12px;">
              <div style="font-size:11px;color:var(--text-muted);">${l}</div>
              <div style="font-size:17px;font-weight:700;">${v}</div></div>`).join('')}
        </div>

        <h4 style="margin:0 0 8px;">AR Aging (as of ${fyEnd})</h4>
        <table class="table" style="margin-bottom:6px;">
          <thead><tr><th>0–30</th><th>31–60</th><th>61–90</th><th>90+</th>${ye.unmatched?'<th>Unaged*</th>':''}<th class="text-right">Total</th></tr></thead>
          <tbody><tr>
            <td>${Tax.fmt(ag.d0_30)}</td><td>${Tax.fmt(ag.d31_60)}</td><td>${Tax.fmt(ag.d61_90)}</td><td>${Tax.fmt(ag.d90_plus)}</td>
            ${ye.unmatched?`<td>${Tax.fmt(ye.unmatched)}</td>`:''}
            <td class="text-right fw-bold">${Tax.fmt(ye.totalOutstanding)}</td>
          </tr></tbody>
        </table>
        ${ye.unmatched?`<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px;">*Unaged = patients billed in WinRx but not in the POS patient list (no fill dates to age).</div>`:''}

        <div style="display:flex;gap:8px;margin:12px 0;">
          <button class="btn btn-outline btn-sm" id="ye-csv-ar">&#8659; AR list CSV</button>
          <button class="btn btn-outline btn-sm" id="ye-csv-bd">&#8659; Bad debt CSV</button>
          <button class="btn btn-outline btn-sm" id="ye-print">&#128424; Print package</button>
        </div>

        <h4 style="margin:14px 0 8px;">Bad Debt Written Off (${start} → ${fyEnd})</h4>
        ${wo.length ? `<table class="table"><thead><tr><th>Date</th><th>Patient</th><th>Reason</th><th class="text-right">Amount</th></tr></thead>
          <tbody>${wo.map(w => `<tr><td>${new Date(w.entry_date).toLocaleDateString('en-CA')}</td>
            <td>${(w.given_name||'')+' '+(w.surname||'')}</td><td>${w.reason||''}</td>
            <td class="text-right">${Tax.fmt(w.amount)}</td></tr>`).join('')}
          <tr><td colspan="3" class="text-right fw-bold">Total</td><td class="text-right fw-bold">${Tax.fmt(woTotal)}</td></tr></tbody></table>`
          : '<div class="text-muted">No write-offs in this fiscal year.</div>'}`;

      content.querySelector('#ye-csv-ar').onclick = () => {
        _csvDownload([['Account','Patient','PHN','Owing'],
          ...ye.rows.map(r => [r.acct||'', r.name, r.phn, r.owing.toFixed(2)])],
          `yearend_AR_${fyEnd}.csv`);
      };
      content.querySelector('#ye-csv-bd').onclick = () => {
        _csvDownload([['Date','Patient','PHN','Reason','Amount'],
          ...wo.map(w => [new Date(w.entry_date).toLocaleDateString('en-CA'), (w.given_name||'')+' '+(w.surname||''), w.phn||'', w.reason||'', (w.amount||0).toFixed(2)])],
          `yearend_baddebt_${fyEnd}.csv`);
      };
      content.querySelector('#ye-print').onclick = () => window.print();
    };

    content.querySelector('#ye-generate').addEventListener('click', generate);
  }

  /* ── Accounts Receivable — who owes (WinRx billed − POS/manual paid) ── */
  async _renderAR(content) {
    content.innerHTML = `
      <div class="settings-section" style="max-width:880px;">
        <h3>Accounts Receivable</h3>
        <div class="alert alert-info">Patient copays billed in WinRx that haven't been collected (POS + manual payments). Insurance is not included.</div>
        <div id="ar-loading" class="text-muted">Loading from WinRx…</div>
        <div id="ar-body" style="display:none;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px;" id="ar-kpis"></div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Aging</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px;" id="ar-aging"></div>
          <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;flex-wrap:wrap;">
            <input type="text" id="ar-search" placeholder="🔍 Filter by name or PHN…" style="width:auto;flex:1;min-width:180px;" />
            <span style="font-size:12px;color:var(--text-muted);">Billed from</span>
            <input type="date" id="ar-cutoff" style="width:auto;" title="Ignore fills billed before this date" />
            <span style="font-size:12px;color:var(--text-muted);">As of</span>
            <input type="date" id="ar-asof" style="width:auto;" title="Balance as of this date (blank = today)" />
            <button class="btn btn-outline btn-sm" id="ar-refresh">&#8635; Refresh</button>
            <button class="btn btn-outline btn-sm" id="ar-export">&#8659; CSV</button>
          </div>
          <div id="ar-table"></div>
        </div>
      </div>`;

    let cutoff = (await Config.get('ar_cutoff_date')) || '';
    let asOf   = '';
    let allRows = [];
    const cutoffEl = content.querySelector('#ar-cutoff');
    const asofEl   = content.querySelector('#ar-asof');
    const searchEl = content.querySelector('#ar-search');
    if (cutoffEl) cutoffEl.value = cutoff;
    const loadEl = content.querySelector('#ar-loading');
    const bodyEl = content.querySelector('#ar-body');

    let agingFilter = '';
    let agingData = { d0_30:0, d31_60:0, d61_90:0, d90_plus:0 };
    const AGE_LABEL = { d0_30:'0–30 days', d31_60:'31–60 days', d61_90:'61–90 days', d90_plus:'90+ days' };

    // Rows after the active search + aging-bucket drill-down
    const currentRows = () => {
      const term = (searchEl?.value || '').trim().toLowerCase();
      let rows = allRows;
      if (term) rows = rows.filter(r =>
        (r.name||'').toLowerCase().includes(term) || (r.phn||'').toLowerCase().includes(term) || (r.acct||'').toLowerCase().includes(term));
      if (agingFilter) rows = rows.filter(r => r.aging && (r.aging[agingFilter]||0) > 0.005);
      return rows;
    };

    const renderTable = () => {
      const rows = currentRows();
      const showBucket = !!agingFilter;
      const amt = r => showBucket ? (r.aging[agingFilter]||0) : r.owing;
      const shownTotal = rows.reduce((s, r) => s + amt(r), 0);
      content.querySelector('#ar-table').innerHTML = rows.length ? `
        <table class="table">
          <thead><tr><th>Acct</th><th>Patient</th><th>PHN</th><th>Fills</th><th class="text-right">Billed</th>
            <th class="text-right">Paid</th><th class="text-right">${showBucket?AGE_LABEL[agingFilter]:'Owing'}</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr style="cursor:pointer;" data-pid="${r.patient_id||''}" data-phn="${r.phn}">
              <td>${r.acct || '—'}</td><td>${r.name}</td><td>${r.phn}</td><td>${r.fills}</td>
              <td class="text-right">${Tax.fmt(r.billed)}</td>
              <td class="text-right">${Tax.fmt(r.paid)}</td>
              <td class="text-right fw-bold text-danger">${Tax.fmt(amt(r))}</td>
            </tr>`).join('')}</tbody>
        </table>
        <div class="text-muted" style="margin-top:8px;font-size:12px;">
          Showing ${rows.length} of ${allRows.length}${agingFilter?` in ${AGE_LABEL[agingFilter]}`:''} · ${Tax.fmt(shownTotal)}
          ${agingFilter?` · <a id="ar-clear-filter" style="cursor:pointer;color:var(--primary);">clear filter</a>`:''} · click a row for the statement.</div>`
        : `<div class="text-muted">${allRows.length ? 'No accounts in this filter.' : 'No outstanding balances. 🎉'}</div>`;

      content.querySelector('#ar-clear-filter')?.addEventListener('click', () => { agingFilter=''; renderAging(); renderTable(); });
      content.querySelectorAll('#ar-table tr[data-phn]').forEach(tr => {
        tr.addEventListener('click', () => {
          const pid = parseInt(tr.dataset.pid) || null;
          if (pid) this._showARStatement(pid, tr.dataset.phn, cutoff, asOf);
          else alert('This patient is billed in WinRx but not yet in the POS patient list — ring a sale or look them up first.');
        });
      });
    };

    // Clickable aging tiles → drill the table to that bucket
    const renderAging = () => {
      const ag = agingData;
      content.querySelector('#ar-aging').innerHTML = ['d0_30','d31_60','d61_90','d90_plus'].map(key => {
        const warn = key === 'd90_plus', active = agingFilter === key;
        return `<div class="ar-aging-tile" data-bucket="${key}" title="Click to see these accounts"
          style="cursor:pointer;background:${active?'var(--primary-soft)':(warn&&ag[key]>0?'#fbeaea':'var(--surface2)')};
          border:1px solid ${active?'var(--primary)':'var(--border)'};border-radius:var(--radius);padding:8px 11px;">
          <div style="font-size:11px;color:var(--text-muted);">${AGE_LABEL[key]}</div>
          <div style="font-size:16px;font-weight:700;${warn&&ag[key]>0?'color:var(--danger);':''}">${Tax.fmt(ag[key])}</div></div>`;
      }).join('');
      content.querySelectorAll('.ar-aging-tile').forEach(t => t.addEventListener('click', () => {
        agingFilter = (agingFilter === t.dataset.bucket) ? '' : t.dataset.bucket;
        renderAging(); renderTable();
      }));
    };

    const load = async () => {
      loadEl.style.display = 'block'; loadEl.textContent = 'Loading from WinRx…'; bodyEl.style.display = 'none';
      const res = await AR.getAROutstandingAll({ cutoff, asOf });
      if (res.error) { loadEl.textContent = res.error; return; }
      loadEl.style.display = 'none'; bodyEl.style.display = 'block';
      allRows = res.rows;
      agingData = res.aging || { d0_30:0, d31_60:0, d61_90:0, d90_plus:0 };

      content.querySelector('#ar-kpis').innerHTML = [
        ['Total outstanding', Tax.fmt(res.totalOutstanding), 'all'],
        ['Accounts owing', String(res.count), 'all'],
        ['As of', asOf || 'today', ''],
        ['Largest', res.rows[0] ? Tax.fmt(res.rows[0].owing) : '—', 'largest'],
      ].map(([l,v,act]) => `<div class="ar-kpi" ${act?`data-act="${act}" `:''}style="${act?'cursor:pointer;':''}background:var(--surface2);border-radius:var(--radius);padding:10px 12px;">
          <div style="font-size:11px;color:var(--text-muted);">${l}</div>
          <div style="font-size:18px;font-weight:700;">${v}</div></div>`).join('');
      content.querySelectorAll('.ar-kpi[data-act]').forEach(k => k.addEventListener('click', () => {
        if (k.dataset.act === 'all') { agingFilter=''; if (searchEl) searchEl.value=''; renderAging(); renderTable(); }
        else if (k.dataset.act === 'largest' && allRows[0] && allRows[0].patient_id) this._showARStatement(allRows[0].patient_id, allRows[0].phn, cutoff, asOf);
      }));

      renderAging();
      renderTable();

      content.querySelector('#ar-export').onclick = () => {
        const rows = currentRows();
        const showBucket = !!agingFilter;
        _csvDownload([['Account','Patient','PHN','Fills','Billed','Paid', showBucket?AGE_LABEL[agingFilter]:'Owing'],
          ...rows.map(r => [r.acct||'', r.name, r.phn, r.fills, r.billed.toFixed(2), r.paid.toFixed(2),
            (showBucket ? (r.aging[agingFilter]||0) : r.owing).toFixed(2)])],
          `accounts_receivable${agingFilter?'_'+agingFilter:''}_${asOf || _dateStr()}.csv`);
      };
    };

    content.querySelector('#ar-refresh').addEventListener('click', load);
    searchEl?.addEventListener('input', renderTable);
    cutoffEl?.addEventListener('change', async () => {
      cutoff = cutoffEl.value || '';
      await Config.set('ar_cutoff_date', cutoff);
      await load();
    });
    asofEl?.addEventListener('change', async () => { asOf = asofEl.value || ''; await load(); });
    await load();
  }

  async _showARStatement(patientId, phn, cutoff, asOf) {
    const patient = DB.getPatient(patientId);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:700px;max-height:92vh;display:flex;flex-direction:column;">
        <div class="modal-header"><h3>Statement — ${patient ? patient.given_name+' '+patient.surname : phn}${patient&&patient.ar_account_no?' · '+patient.ar_account_no:''}</h3>
          <button class="modal-close">&times;</button></div>
        <div style="padding:10px 20px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:12px;color:var(--text-muted);">From</span>
          <input type="date" id="st-from" style="width:auto;" value="${cutoff||''}" />
          <span style="font-size:12px;color:var(--text-muted);">To</span>
          <input type="date" id="st-to" style="width:auto;" value="${asOf||''}" />
          <button class="btn btn-outline btn-sm" id="st-apply">Apply</button>
          <button class="btn btn-primary btn-sm" id="st-record" style="margin-left:auto;">&#43; Record payment</button>
        </div>
        <div class="modal-body" id="st-body" style="overflow-y:auto;">Loading…</div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="ar-st-csv">&#8659; CSV</button>
          <button class="btn btn-outline modal-close-btn">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('.modal-close-btn').addEventListener('click', close);

    let st = null;
    const render = async () => {
      const from = modal.querySelector('#st-from').value || '';
      const to   = modal.querySelector('#st-to').value || '';
      const body = modal.querySelector('#st-body');
      body.innerHTML = '<div class="text-muted">Loading…</div>';
      st = await AR.getStatement({ patient_id: patientId, phn }, { cutoff: from, asOf: to });
      if (st.error) { body.innerHTML = `<div class="alert alert-danger">${st.error}</div>`; return; }
      const ag = st.aging || {};
      const entries = DB.getArEntries(patientId);
      body.innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:10px;font-size:14px;flex-wrap:wrap;">
          <div>Billed: <strong>${Tax.fmt(st.billed)}</strong></div>
          <div>Paid: <strong>${Tax.fmt(st.paid)}</strong></div>
          <div>Owing: <strong class="text-danger">${Tax.fmt(st.owing)}</strong></div>
          ${st.credit>0?`<div>Credit: <strong class="text-success">${Tax.fmt(st.credit)}</strong></div>`:''}
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">
          Aging — 0-30: ${Tax.fmt(ag.d0_30)} · 31-60: ${Tax.fmt(ag.d31_60)} · 61-90: ${Tax.fmt(ag.d61_90)} · 90+: ${Tax.fmt(ag.d90_plus)}</div>
        <div style="font-weight:600;font-size:13px;margin:4px 0;">By prescription</div>
        <table class="table" style="margin-bottom:14px;">
          <thead><tr><th>Rx #</th><th>Fill date</th><th class="text-right">Billed</th><th class="text-right">Paid</th><th class="text-right">Owing</th><th></th></tr></thead>
          <tbody>${(st.perRx||[]).map(r => `<tr style="${r.owing>0?'background:#fdf4f3;':''}"><td>Rx #${r.rxNumber}</td>
            <td>${r.fillDate?new Date(r.fillDate).toLocaleDateString('en-CA'):''}</td>
            <td class="text-right">${Tax.fmt(r.billed)}</td><td class="text-right">${Tax.fmt(r.paid)}</td>
            <td class="text-right ${r.owing>0?'fw-bold text-danger':''}">${Tax.fmt(r.owing)}</td>
            <td style="text-align:right;white-space:nowrap;">${r.owing>0?`
              <button class="btn btn-outline btn-sm st-pay" data-rx="${r.rxNumber}" data-amt="${r.owing}">Pay</button>
              <button class="btn btn-outline btn-sm st-wo" data-rx="${r.rxNumber}" data-amt="${r.owing}">Write off</button>`:'<span style="color:var(--success);">✓</span>'}</td></tr>`).join('')}</tbody>
        </table>
        <div style="font-weight:600;font-size:13px;margin:4px 0;">Payments &amp; adjustments</div>
        ${entries.length ? `<table class="table"><thead><tr><th>Date</th><th>Type</th><th>Method / Ref</th><th class="text-right">Amount</th><th></th></tr></thead>
          <tbody>${entries.map(e => `<tr>
            <td>${new Date(e.entry_date).toLocaleDateString('en-CA')}</td>
            <td>${e.entry_type}${e.rx_number?` · Rx#${e.rx_number}`:''}</td>
            <td>${[e.method,e.reference,e.reason].filter(Boolean).join(' · ')||'—'}</td>
            <td class="text-right">${Tax.fmt(e.amount)}</td>
            <td style="white-space:nowrap;text-align:right;">
              <button class="btn btn-outline btn-sm st-edit" data-id="${e.ar_id}">Edit</button>
              <button class="btn btn-outline btn-sm st-del" data-id="${e.ar_id}">Del</button></td></tr>`).join('')}</tbody></table>`
          : '<div class="text-muted" style="font-size:12px;">No manual payments/adjustments recorded.</div>'}`;

      body.querySelectorAll('.st-edit').forEach(b => b.addEventListener('click', () => {
        this._showArEntryEditModal(DB.getArEntry(parseInt(b.dataset.id)), render);
      }));
      body.querySelectorAll('.st-del').forEach(b => b.addEventListener('click', () => {
        const e = DB.getArEntry(parseInt(b.dataset.id));
        if (e.entry_type === 'write_off' && !(typeof Auth!=='undefined' && Auth.isAdmin && Auth.isAdmin())) {
          alert('Deleting a bad-debt write-off requires an Admin login.'); return;
        }
        if (confirm(`Delete this ${e.entry_type} of ${Tax.fmt(e.amount)}?`)) {
          DB.deleteArEntry(e.ar_id);
          Audit.configChange(`AR entry deleted (${e.entry_type} ${Tax.fmt(e.amount)}) — patient ${patientId}`);
          render();
        }
      }));
      // Per-Rx actions: pay / write off this specific prescription
      const pObj = patient || { patient_id: patientId, phn, given_name: '', surname: '' };
      body.querySelectorAll('.st-pay').forEach(b => b.addEventListener('click', () =>
        this._showArRecordModal(pObj, { rxNumber: b.dataset.rx, amount: b.dataset.amt, type: 'payment' }, render)));
      body.querySelectorAll('.st-wo').forEach(b => b.addEventListener('click', () =>
        this._showArRecordModal(pObj, { rxNumber: b.dataset.rx, amount: b.dataset.amt, type: 'write_off' }, render)));
    };

    modal.querySelector('#st-apply').addEventListener('click', render);
    modal.querySelector('#st-record').addEventListener('click', () =>
      this._showArRecordModal(patient || { patient_id: patientId, phn, given_name:'', surname:'' }, {}, render));
    modal.querySelector('#ar-st-csv').addEventListener('click', () => {
      if (!st || st.error) return;
      _csvDownload([['Rx #','Fill date','Billed','Paid','Owing'],
        ...(st.perRx||[]).map(r => ['Rx #'+r.rxNumber, r.fillDate?new Date(r.fillDate).toLocaleDateString('en-CA'):'',
          r.billed.toFixed(2), r.paid.toFixed(2), r.owing.toFixed(2)])],
        `statement_${phn}_${_dateStr()}.csv`);
    });
    await render();
  }

  /* Edit an existing AR entry (correct a mis-keyed payment/adjustment). */
  _showArEntryEditModal(entry, onDone) {
    if (!entry) return;
    const isWO = entry.entry_type === 'write_off';
    if (isWO && !(typeof Auth!=='undefined' && Auth.isAdmin && Auth.isAdmin())) {
      alert('Editing a bad-debt write-off requires an Admin login.'); return;
    }
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.zIndex = '1100';
    modal.innerHTML = `
      <div class="modal" style="max-width:380px;">
        <div class="modal-header"><h3>Edit ${entry.entry_type}</h3><button class="modal-close">&times;</button></div>
        <div class="modal-body">
          <div class="form-group"><label>Amount ($)</label><input type="number" step="0.01" id="ee-amount" value="${entry.amount}" /></div>
          <div class="form-group"><label>Date</label><input type="date" id="ee-date" value="${String(entry.entry_date||'').slice(0,10)}" /></div>
          <div class="form-group"><label>Method</label><input type="text" id="ee-method" value="${entry.method||''}" /></div>
          <div class="form-group"><label>Reference</label><input type="text" id="ee-ref" value="${entry.reference||''}" /></div>
          <div class="form-group"><label>Apply to Rx# <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label><input type="text" id="ee-rx" value="${entry.rx_number||''}" /></div>
          ${isWO?`<div class="form-group"><label>Reason</label><input type="text" id="ee-reason" value="${entry.reason||''}" /></div>`:''}
          <div class="form-group"><label>Note</label><input type="text" id="ee-note" value="${entry.note||''}" /></div>
          <div id="ee-err" class="login-error"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="ee-cancel">Cancel</button>
          <button class="btn btn-primary" id="ee-save">Save</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const $ = s => modal.querySelector(s);
    const close = () => modal.remove();
    $('.modal-close').addEventListener('click', close);
    $('#ee-cancel').addEventListener('click', close);
    $('#ee-save').addEventListener('click', () => {
      const amount = parseFloat($('#ee-amount').value);
      if (!(amount > 0)) { $('#ee-err').textContent = 'Amount must be greater than zero.'; return; }
      DB.updateArEntry(entry.ar_id, {
        amount, entry_date: $('#ee-date').value || entry.entry_date,
        method: $('#ee-method').value.trim() || null,
        reference: $('#ee-ref').value.trim() || null,
        rx_number: $('#ee-rx').value.trim() || null,
        reason: $('#ee-reason') ? ($('#ee-reason').value.trim() || null) : undefined,
        note: $('#ee-note').value.trim() || null,
      });
      Audit.configChange(`AR entry #${entry.ar_id} edited → ${Tax.fmt(amount)}`);
      close();
      onDone && onDone();
    });
  }

  /* Record a payment / adjustment / write-off — optionally pre-targeted to one Rx. */
  _showArRecordModal(patient, preset, onDone) {
    preset = preset || {};
    if (!patient || !patient.patient_id) { alert('This patient is not in the POS list yet — look them up first.'); return; }
    const isAdmin = typeof Auth!=='undefined' && Auth.isAdmin && Auth.isAdmin();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.zIndex = '1100';
    modal.innerHTML = `
      <div class="modal" style="max-width:400px;">
        <div class="modal-header"><h3>${preset.type==='write_off'?'Write off to bad debt':'Record payment / adjustment'}</h3><button class="modal-close">&times;</button></div>
        <div class="modal-body">
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">${patient.given_name} ${patient.surname} · PHN ${patient.phn}${preset.rxNumber?` · <strong>Rx #${preset.rxNumber}</strong>`:''}</div>
          <div class="form-group"><label>Type</label>
            <select id="arr-type">
              <option value="payment">Payment received</option>
              <option value="credit">Credit (goodwill)</option>
              <option value="correction">Correction (billing error)</option>
              <option value="write_off">Bad-debt write-off${isAdmin?'':' (Admin only)'}</option>
            </select></div>
          <div class="form-group"><label>Amount ($)</label><input type="number" step="0.01" id="arr-amt" value="${preset.amount!=null?Number(preset.amount).toFixed(2):''}" /></div>
          <div class="form-group" id="arr-method-wrap"><label>Method</label>
            <select id="arr-method"><option value="online">Online</option><option value="payment_link">Payment link</option><option value="etransfer">E-transfer</option><option value="cheque">Cheque</option><option value="cash">Cash</option><option value="other">Other</option></select></div>
          <div class="form-group"><label>Apply to Rx# <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label><input type="text" id="arr-rx" value="${preset.rxNumber||''}" /></div>
          <div class="form-group"><label>Reference</label><input type="text" id="arr-ref" placeholder="confirmation #" /></div>
          <div class="form-group" id="arr-reason-wrap" style="display:none;"><label>Bad-debt reason <span style="color:var(--danger);">*</span></label><input type="text" id="arr-reason" placeholder="e.g. uncollectible" /></div>
          <div class="form-group"><label>Date</label><input type="date" id="arr-date" value="${_dateStr()}" /></div>
          <div class="form-group"><label>Note</label><input type="text" id="arr-note" /></div>
          <div id="arr-err" class="login-error"></div>
        </div>
        <div class="modal-footer"><button class="btn btn-outline" id="arr-cancel">Cancel</button><button class="btn btn-primary" id="arr-save">Save</button></div>
      </div>`;
    document.body.appendChild(modal);
    const $ = s => modal.querySelector(s);
    const close = () => modal.remove();
    $('.modal-close').addEventListener('click', close);
    $('#arr-cancel').addEventListener('click', close);
    const typeEl = $('#arr-type');
    if (preset.type) typeEl.value = preset.type;
    const onType = () => {
      const wo = typeEl.value === 'write_off';
      $('#arr-reason-wrap').style.display = wo ? 'block' : 'none';
      $('#arr-method-wrap').style.display = typeEl.value === 'payment' ? 'block' : 'none';
    };
    typeEl.addEventListener('change', onType); onType();
    $('#arr-save').addEventListener('click', () => {
      const err = $('#arr-err'), type = typeEl.value, amount = parseFloat($('#arr-amt').value), ref = $('#arr-ref').value.trim();
      if (type === 'write_off' && !isAdmin) { err.textContent = 'Bad-debt write-offs require an Admin login.'; return; }
      if (!(amount > 0)) { err.textContent = 'Enter an amount greater than zero.'; return; }
      if (type === 'write_off' && !$('#arr-reason').value.trim()) { err.textContent = 'A reason is required for a write-off.'; return; }
      if (ref && DB.getArEntryByReference(ref) && !confirm('An entry with this reference already exists. Record anyway?')) return;
      DB.addArEntry({
        patient_id: patient.patient_id, entry_date: $('#arr-date').value || _dateStr(),
        amount, entry_type: type,
        method: type === 'payment' ? $('#arr-method').value : null,
        rx_number: $('#arr-rx').value.trim() || null,
        reference: ref || null,
        reason: type === 'write_off' ? $('#arr-reason').value.trim() : null,
        note: $('#arr-note').value.trim() || null,
        staff_name: (typeof Auth!=='undefined' && Auth.current && Auth.current()?.name) || null,
      });
      Audit.configChange(`AR ${type} ${Tax.fmt(amount)} — ${patient.given_name} ${patient.surname}${preset.rxNumber?` Rx#${preset.rxNumber}`:''}`);
      close();
      onDone && onDone();
    });
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
          <button class="btn btn-outline btn-sm" id="btn-export-mckesson">&#8659; PharmaClik Order (.ord)</button>
          ${window.electronAPI?.mckessonSoap ? `<button class="btn btn-primary btn-sm" id="btn-upload-mckesson">&#8593; Upload to PharmaClik</button>` : ''}
          <button class="btn btn-success btn-sm" id="btn-receive-stock">&#8657; Receive Stock</button>
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

      /* — PharmaClik .ord export (real format) — */
      body.querySelector('#btn-export-mckesson')?.addEventListener('click', async () => {
        const account = (await Config.get('mckesson_account') || '').replace(/\D/g, '');
        if (!account) {
          alert('McKesson Account Number is not set.\n\nGo to Settings → API Credentials → McKesson and enter your 6-digit Account / Customer Number first.');
          return;
        }

        const qtys = getQtys();
        // An item is exportable if it has a McKesson item# OR a UPC
        const exportable = qtys.filter(i => i.item_no || i.upc);
        const skipped    = qtys.length - exportable.length;
        if (!exportable.length) {
          alert('No items have a McKesson # or UPC.\n\nTip: Click the "McKesson #" field for any item above to type its number — it saves automatically.');
          return;
        }

        // Build the PharmaClik electronic order line.
        // Format: ACE0000000+CU{account}+PO{ponum}+{item}{qty}+...+AAAAAAAAAA+
        //   McKesson item# = 6 digits, followed directly by qty (1-4 digits)
        //   UPC fallback   = U + 11 digits, followed by qty
        const poNum   = 'POS' + new Date().toISOString().slice(2,10).replace(/-/g,''); // e.g. POS260614
        const segments = ['ACE0000000', `CU${account.padStart(6,'0')}`, `PO${poNum}`];

        exportable.forEach(i => {
          const qty = Math.max(1, Math.round(i.qty));
          if (i.item_no) {
            // 6-digit distributor item number + quantity
            segments.push(`${String(i.item_no).replace(/\D/g,'').padStart(6,'0')}${qty}`);
          } else if (i.upc) {
            // UPC: U + 11 digits + quantity
            const upc = String(i.upc).replace(/\D/g,'').padStart(11,'0').slice(-11);
            segments.push(`U${upc}${qty}`);
          }
        });
        segments.push('AAAAAAAAAA');

        // Each segment ends with '+', single continuous line
        const ordContent = segments.join('+') + '+';
        const blob = new Blob([ordContent], { type: 'text/plain' });
        _downloadBlob(blob, `order_${poNum}_${_dateStr()}.ord`);

        // Offer to mark exported items as ordered
        const msg = skipped
          ? `PharmaClik order file (.ord) downloaded — ${exportable.length} item${exportable.length!==1?'s':''}, ${skipped} skipped (no item# or UPC).\n\nUpload it in PharmaClik → Orders → Upload Orders.\n\nMark exported items as "ordered" to hide them for 30 days?`
          : `PharmaClik order file (.ord) downloaded — ${exportable.length} item${exportable.length!==1?'s':''}.\n\nUpload it in PharmaClik → Orders → Upload Orders.\n\nMark all as "ordered" to hide them for 30 days?`;
        if (confirm(msg)) {
          const now = new Date().toISOString();
          exportable.forEach(i => {
            if (i.product_id) {
              DB.run('UPDATE products SET mckesson_ordered_at=? WHERE product_id=?', [now, i.product_id]);
              i.ordered_at = now;
            }
          });
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

      /* — Upload order directly to PharmaClik (web service) — */
      body.querySelector('#btn-upload-mckesson')?.addEventListener('click', async function() {
        const account = (await Config.get('mckesson_account') || '').replace(/\D/g, '');
        if (!account) {
          alert('Set your McKesson Account Number in Settings → API Credentials first.');
          return;
        }
        const qtys = getQtys().filter(i => i.item_no || i.upc);
        if (!qtys.length) {
          alert('No items have a McKesson # or UPC to upload.');
          return;
        }
        if (!confirm(`Upload ${qtys.length} item${qtys.length!==1?'s':''} directly to PharmaClik now?`)) return;

        const btn = this;
        btn.disabled = true; btn.textContent = 'Uploading…';
        try {
          const items = qtys.map(i => i.item_no
            ? { itemId: String(i.item_no).replace(/\D/g,''), itemType: 'D', quantity: i.qty, modality: 'U' }
            : { itemId: String(i.upc).replace(/\D/g,''),    itemType: 'U', quantity: i.qty, modality: 'U' });
          const poNumber = 'POS' + new Date().toISOString().slice(2,10).replace(/-/g,'');
          const conf = await McKessonAPI.uploadOrder({ items, poNumber });

          // Mark all uploaded items as ordered
          const now = new Date().toISOString();
          qtys.forEach(i => { if (i.product_id) {
            DB.run('UPDATE products SET mckesson_ordered_at=? WHERE product_id=?', [now, i.product_id]);
          }});

          btn.textContent = '✓ Uploaded';
          btn.style.background = 'var(--success)';
          alert(`✓ Order uploaded to PharmaClik.\n\nConfirmation: ${conf}\n\nReview & send it in PharmaClik → Orders → Order Management.`);
        } catch(e) {
          btn.disabled = false; btn.textContent = '↑ Upload to PharmaClik';
          alert('Upload failed:\n\n' + e.message);
        }
      });

      /* — Receive Stock (update qty_on_hand) — */
      body.querySelector('#btn-receive-stock')?.addEventListener('click', () => {
        this._showReceiveStockModal();
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

  /* ── Receive Stock — update qty_on_hand manually or by scan ─ */
  _showReceiveStockModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:620px;">
        <div class="modal-header" style="background:#d1e7dd;">
          <h3 style="color:#0a3622;">⬆ Receive Stock</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          ${window.electronAPI?.mckessonSoap ? `
          <div style="background:var(--surface2);border-radius:var(--radius);padding:12px 14px;margin-bottom:14px;">
            <div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">
              Auto-Receive from PharmaClik Invoice
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px;">
              Pulls invoices from McKesson and updates stock automatically for matched items.
            </p>

            <div style="display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                <input type="radio" name="rs-inv-mode" value="new" checked /> New invoices only
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                <input type="radio" name="rs-inv-mode" value="date" /> By date range
              </label>
            </div>

            <div id="rs-date-range" style="display:none;gap:10px;align-items:flex-end;margin-bottom:10px;">
              <div>
                <label style="font-size:11px;color:var(--text-muted);">From</label>
                <input type="date" id="rs-inv-from" value="${_dateStr()}" style="width:140px;" />
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-muted);">To</label>
                <input type="date" id="rs-inv-to" value="${_dateStr()}" style="width:140px;" />
              </div>
            </div>

            <button class="btn btn-primary btn-sm" id="rs-fetch-invoices">⬇ Download Invoices</button>
            <div id="rs-invoice-status" style="font-size:12px;margin-top:8px;"></div>
          </div>
          <div style="text-align:center;font-size:11px;color:var(--text-muted);margin-bottom:12px;">— or add manually —</div>
          ` : ''}
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
            Search a product, enter the quantity received, and click Add. On-hand stock updates immediately.
          </p>
          <div style="display:flex;gap:8px;margin-bottom:6px;">
            <input type="text" id="rs-search" placeholder="Search by name, UPC, or McKesson #…"
                   style="flex:1;" autocomplete="off" />
          </div>
          <div id="rs-results" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);
               border-radius:var(--radius);margin-bottom:14px;display:none;"></div>

          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);
                      margin-bottom:8px;">Received This Session</div>
          <div id="rs-received" style="border:1px solid var(--border);border-radius:var(--radius);
               min-height:60px;max-height:200px;overflow-y:auto;">
            <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">
              No items received yet.
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="rs-close">Done</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const self = this;
    const received  = []; // {desc, source, id, qty}

    // On close, if items were received, offer to print shelf tags
    const close = () => {
      modal.remove();
      if (received.length && typeof ShelfTags !== 'undefined') {
        self._offerShelfTagsForReceived(received);
      }
    };
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#rs-close').addEventListener('click', close);

    const searchEl  = modal.querySelector('#rs-search');
    const resultsEl = modal.querySelector('#rs-results');
    const receivedEl= modal.querySelector('#rs-received');

    const renderReceived = () => {
      if (!received.length) {
        receivedEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">
          No items received yet.</div>`;
        return;
      }
      receivedEl.innerHTML = received.map((r,i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;
                    ${i<received.length-1?'border-bottom:1px solid var(--border);':''}">
          <span style="flex:1;font-size:13px;">${r.desc}</span>
          <span style="color:var(--success);font-weight:700;margin:0 12px;">+${r.qty}</span>
          <span style="font-size:12px;color:var(--text-muted);">→ ${r.newQty} on hand</span>
        </div>`).join('');
    };

    /* — Toggle date-range fields based on mode — */
    modal.querySelectorAll('input[name="rs-inv-mode"]').forEach(r =>
      r.addEventListener('change', () => {
        const byDate = modal.querySelector('input[name="rs-inv-mode"]:checked').value === 'date';
        modal.querySelector('#rs-date-range').style.display = byDate ? 'flex' : 'none';
      }));

    /* — Auto-receive from PharmaClik invoices — */
    modal.querySelector('#rs-fetch-invoices')?.addEventListener('click', async function() {
      const btn = this; // the button element
      const status = modal.querySelector('#rs-invoice-status');
      const byDate = modal.querySelector('input[name="rs-inv-mode"]:checked').value === 'date';
      let opts = { allNew: true };
      if (byDate) {
        const from = modal.querySelector('#rs-inv-from').value;
        const to   = modal.querySelector('#rs-inv-to').value;
        if (!from || !to) { status.textContent = 'Select both dates.'; status.style.color = 'var(--danger)'; return; }
        if (from > to)    { status.textContent = 'From date must be before To date.'; status.style.color = 'var(--danger)'; return; }
        opts = { allNew: false, startDate: from, endDate: to };
      }
      btn.disabled = true; btn.textContent = 'Downloading…';
      status.textContent = byDate ? 'Requesting invoices by date…' : 'Requesting new invoices from McKesson…';
      status.style.color = 'var(--text-muted)';
      try {
        const { invoices, lineItems } = await McKessonAPI.downloadInvoices(opts);
        if (!lineItems.length) {
          status.textContent = 'No invoices found.';
          btn.disabled = false; btn.textContent = '⬇ Download Invoices';
          return;
        }

        // Match + classify each line item
        const rows = lineItems.map(li => {
          let prod = null;
          if (li.itemNumber) prod = DB.get('SELECT product_id, description, qty_on_hand, schedule_flag, narcotic_indicator, din, suggested_retail, price_override FROM products WHERE mckesson_item_no=?', [li.itemNumber]);
          if (!prod && li.upc) prod = DB.get('SELECT product_id, description, qty_on_hand, schedule_flag, narcotic_indicator, din, suggested_retail, price_override FROM products WHERE upc_unit=? OR gtin_unit=?', [li.upc, li.upc]);
          const units = (li.shippedQty || 0) * (li.qtyPerPack || 1);

          // Classify
          let category, include;
          if (!prod) {
            category = 'unmatched'; include = false;
          } else if (prod.schedule_flag === 'btc' || prod.schedule_flag === 'btc_ctrl') {
            category = 'BTC'; include = true;
          } else if ((prod.narcotic_indicator && prod.narcotic_indicator !== 'N')) {
            category = 'Rx/Narcotic'; include = false;        // Rx — managed in WinRx, skip
          } else if (prod.din && !(prod.suggested_retail || prod.price_override)) {
            category = 'Rx?'; include = false;                 // has DIN, no POS retail price → likely Rx
          } else {
            category = 'OTC'; include = true;
          }
          return { li, prod, units, category, include,
                   desc: prod?.description || li.description || '(unknown item)' };
        });

        // Show review screen
        btn.disabled = false; btn.textContent = '⬇ Download Invoices';
        status.innerHTML = `Loaded ${invoices.length} invoice(s), ${rows.length} line(s). Review below.`;
        status.style.color = 'var(--text-muted)';
        self._showInvoiceReview(rows, (applied) => {
          applied.forEach(r => {
            DB.adjustStock('catalog', r.prod.product_id, r.units);
            received.push({ desc: r.desc, source:'catalog', id:r.prod.product_id,
                            qty: r.units, newQty: (r.prod.qty_on_hand||0) + r.units });
          });
          renderReceived();
          status.innerHTML = `✓ Received <strong>${applied.length}</strong> item(s) into stock.`;
          status.style.color = 'var(--success)';
        });
      } catch(e) {
        status.textContent = 'Failed: ' + e.message;
        status.style.color = 'var(--danger)';
        btn.disabled = false; btn.textContent = '⬇ Download Invoices';
      }
    });

    const doSearch = () => {
      const term = searchEl.value.trim();
      if (!term) { resultsEl.style.display = 'none'; return; }
      // Search both custom and catalog products
      const customs = DB.getAllCustomProducts().filter(p =>
        (p.description||'').toLowerCase().includes(term.toLowerCase()) ||
        (p.upc||'').includes(term));
      const catalog = (DB.searchProducts ? DB.searchProducts(term) : []).slice(0, 10);

      const all = [
        ...customs.map(p => ({ desc:p.description, source:'custom', id:p.custom_product_id, qoh:p.qty_on_hand })),
        ...catalog.map(p => ({ desc:p.description, source:'catalog', id:p.product_id, qoh:p.qty_on_hand })),
      ].slice(0, 12);

      if (!all.length) {
        resultsEl.innerHTML = `<div style="padding:10px;color:var(--text-muted);font-size:13px;">No matches.</div>`;
        resultsEl.style.display = 'block';
        return;
      }
      resultsEl.innerHTML = all.map((p,i) => `
        <div class="rs-result" data-idx="${i}" style="display:flex;justify-content:space-between;
             align-items:center;gap:8px;padding:8px 12px;cursor:pointer;
             ${i<all.length-1?'border-bottom:1px solid var(--border);':''}">
          <span style="flex:1;font-size:13px;">${p.desc}
            <span style="color:var(--text-muted);font-size:11px;">(${p.qoh??0} on hand)</span>
          </span>
          <input type="number" class="rs-qty" data-idx="${i}" min="1" step="1" value="1"
                 placeholder="Qty" style="width:70px;" onclick="event.stopPropagation()" />
          <button class="btn btn-success btn-sm rs-add" data-idx="${i}">Add</button>
        </div>`).join('');
      resultsEl.style.display = 'block';

      resultsEl.querySelectorAll('.rs-add').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          const p   = all[idx];
          const qty = parseInt(resultsEl.querySelector(`.rs-qty[data-idx="${idx}"]`).value) || 0;
          if (qty < 1) return;
          // Update stock
          DB.adjustStock(p.source, p.id, qty);
          const newQty = (p.qoh || 0) + qty;
          received.push({ desc:p.desc, source:p.source, id:p.id, qty, newQty });
          renderReceived();
          searchEl.value = '';
          resultsEl.style.display = 'none';
          searchEl.focus();
        });
      });
    };

    let _t = null;
    searchEl.addEventListener('input', () => { clearTimeout(_t); _t = setTimeout(doSearch, 200); });
    setTimeout(() => searchEl.focus(), 80);
  }

  /* ── Invoice review — pick which items to receive ──────────
     rows: [{ li, prod, units, category, include, desc }]
     onApply(appliedRows) called with the checked, matched rows. */
  _showInvoiceReview(rows, onApply) {
    const catStyle = {
      'OTC':         'background:#d1e7dd;color:#0a3622;',
      'BTC':         'background:#fff3cd;color:#856404;',
      'Rx/Narcotic': 'background:#f8d7da;color:#842029;',
      'Rx?':         'background:#f8d7da;color:#842029;',
      'unmatched':   'background:#e2e3e5;color:#41464b;',
    };

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.zIndex = '9600';
    modal.innerHTML = `
      <div class="modal" style="max-width:760px;">
        <div class="modal-header">
          <h3>Review Invoice Items — Select What to Receive</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="alert alert-info" style="font-size:12px;">
            <strong>OTC &amp; BTC</strong> items are pre-selected. <strong>Rx / prescription</strong> items are
            unchecked — those are tracked in WinRx, not the POS. Adjust as needed, then Receive.
          </div>
          <div style="display:flex;gap:8px;margin-bottom:10px;">
            <button class="btn btn-outline btn-sm" id="ir-all-otc">Select OTC + BTC only</button>
            <button class="btn btn-outline btn-sm" id="ir-all">Select all</button>
            <button class="btn btn-outline btn-sm" id="ir-none">Select none</button>
          </div>
          <div style="overflow-x:auto;max-height:50vh;overflow-y:auto;">
            <table class="table" style="font-size:12px;min-width:680px;">
              <thead><tr>
                <th style="width:34px;"></th><th>Category</th><th>Item</th>
                <th>McKesson# / UPC</th><th class="text-right">Qty to Add</th>
              </tr></thead>
              <tbody>
                ${rows.map((r,i) => `
                  <tr style="${r.category==='unmatched'?'opacity:.55;':''}">
                    <td><input type="checkbox" class="ir-cb" data-i="${i}"
                         ${r.include?'checked':''} ${r.category==='unmatched'?'disabled':''} /></td>
                    <td><span class="badge" style="${catStyle[r.category]||''}">${r.category}</span></td>
                    <td>${r.desc}</td>
                    <td style="font-size:11px;color:var(--text-muted);">
                      ${r.li.itemNumber||'—'}${r.li.upc?` / ${r.li.upc}`:''}</td>
                    <td class="text-right">
                      ${r.category==='unmatched'
                        ? '<span style="color:var(--danger);">no product</span>'
                        : `+${r.units} <small style="color:var(--text-muted);">(${r.li.shippedQty}×${r.li.qtyPerPack})</small>`}
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <span id="ir-count" style="font-size:13px;color:var(--text-muted);"></span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-outline" id="ir-cancel">Cancel</button>
            <button class="btn btn-success" id="ir-apply">Receive Selected</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#ir-cancel').addEventListener('click', close);

    const cbs = [...modal.querySelectorAll('.ir-cb')];
    const updateCount = () => {
      const n = cbs.filter(c => c.checked).length;
      modal.querySelector('#ir-count').textContent = `${n} item${n!==1?'s':''} selected`;
    };
    cbs.forEach(c => c.addEventListener('change', updateCount));

    modal.querySelector('#ir-all-otc').addEventListener('click', () => {
      cbs.forEach(c => { if (!c.disabled) {
        const cat = rows[parseInt(c.dataset.i)].category;
        c.checked = (cat === 'OTC' || cat === 'BTC');
      }});
      updateCount();
    });
    modal.querySelector('#ir-all').addEventListener('click', () => {
      cbs.forEach(c => { if (!c.disabled) c.checked = true; }); updateCount();
    });
    modal.querySelector('#ir-none').addEventListener('click', () => {
      cbs.forEach(c => c.checked = false); updateCount();
    });

    modal.querySelector('#ir-apply').addEventListener('click', () => {
      const applied = cbs.filter(c => c.checked && !c.disabled)
                         .map(c => rows[parseInt(c.dataset.i)])
                         .filter(r => r.prod && r.units > 0);
      if (!applied.length) { alert('No items selected.'); return; }
      close();
      onApply(applied);
    });

    updateCount();
  }

  /* ── Offer to print shelf tags for just-received products ──
     received: [{ desc, source, id, qty }]                       */
  _offerShelfTagsForReceived(received) {
    // Build tag data by looking up each product's price + barcode
    const tags = [];
    received.forEach(r => {
      let p = null;
      if (r.source === 'custom') {
        p = DB.get('SELECT description, upc, price, schedule_flag FROM custom_products WHERE custom_product_id=?', [r.id]);
        if (p) tags.push({ description: p.description, price: p.price || 0,
                           barcode: p.upc || '', sku: '', din: '' });
      } else {
        p = DB.get('SELECT description, upc_unit, gtin_unit, din, mckesson_item_no, price_override, suggested_retail, regular_unit_price FROM products WHERE product_id=?', [r.id]);
        if (p) tags.push({ description: p.description,
                           price: p.price_override ?? p.suggested_retail ?? p.regular_unit_price ?? 0,
                           barcode: p.upc_unit || p.gtin_unit || '',
                           sku: p.mckesson_item_no || '', din: p.din || '' });
      }
    });
    if (!tags.length) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.zIndex = '9600';
    const presetOpts = Object.entries(ShelfTags.PRESETS)
      .map(([k,v]) => `<option value="${k}">${v.name}</option>`).join('');
    modal.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <h3>🏷 Print Shelf Tags?</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;">
            You received <strong>${tags.length}</strong> product${tags.length!==1?'s':''}.
            Print updated shelf price tags for them?
          </p>
          <div class="form-group">
            <label>Label size</label>
            <select id="rst-preset">${presetOpts}</select>
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="rst-barcode" checked /> Include barcode
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="rst-skip">No thanks</button>
          <button class="btn btn-primary" id="rst-print">🖨 Print Tags</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#rst-skip').addEventListener('click', close);

    modal.querySelector('#rst-print').addEventListener('click', () => {
      const presetKey = modal.querySelector('#rst-preset').value;
      const fields = { name:true, price:true, barcode: modal.querySelector('#rst-barcode').checked,
                       unitPrice:false, sku:false, din:false, date:true, border:true, barcodeType:'auto' };
      const doc = ShelfTags.buildSheet(tags, fields, presetKey);
      close();
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;left:-9999px;width:900px;height:1200px;border:none;';
      document.body.appendChild(frame);
      frame.contentDocument.open(); frame.contentDocument.write(doc); frame.contentDocument.close();
      setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print();
        setTimeout(() => frame.remove(), 1000); }, 400);
    });
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

  /* ── BTC / Controlled Substance Log ─────────────────────── */
  _renderBtcLog(content) {
    const renderTable = (from, to) => {
      const logs = from ? DB.getBtcLog(from, to) : DB.getBtcLogAll();
      const bodyEl = content.querySelector('#btc-body');

      if (!logs.length) {
        bodyEl.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">
          No BTC records in this period.</div>`;
        return;
      }

      // Calculate running balance per drug
      const balance = {};
      logs.forEach(l => {
        const key = l.drug_name;
        if (!balance[key]) balance[key] = 0;
        if (l.log_type === 'received') balance[key] += l.quantity;
        else balance[key] -= l.quantity;
      });

      // Summary cards
      const drugs = [...new Set(logs.map(l => l.drug_name))];
      const summaryCards = drugs.map(drug => {
        const received = logs.filter(l => l.drug_name === drug && l.log_type === 'received')
                             .reduce((s,l) => s+l.quantity, 0);
        const dispensed = logs.filter(l => l.drug_name === drug && l.log_type !== 'received')
                              .reduce((s,l) => s+l.quantity, 0);
        const bal = received - dispensed;
        return `<div style="background:var(--surface2);border-radius:var(--radius);padding:12px 16px;
                            border-left:4px solid ${bal<0?'var(--danger)':bal===0?'var(--text-muted)':'var(--success)'}">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${drug}</div>
          <div style="display:flex;gap:20px;font-size:13px;">
            <span>📥 Received: <strong>${received}</strong></span>
            <span>📤 Dispensed: <strong>${dispensed}</strong></span>
            <span style="color:${bal<0?'var(--danger)':bal>0?'var(--success)':'inherit'}">
              Balance: <strong>${bal}</strong>
            </span>
          </div>
        </div>`;
      }).join('');

      // Detail rows
      let runningBal = {};
      const rows = logs.map(l => {
        const d    = new Date(l.sale_date);
        const date = d.toLocaleDateString('en-CA');
        const time = d.toLocaleTimeString('en-CA', {hour:'2-digit',minute:'2-digit'});
        const key  = l.drug_name;
        if (!runningBal[key]) runningBal[key] = 0;
        const isReceived = l.log_type === 'received';
        if (isReceived) runningBal[key] += l.quantity;
        else runningBal[key] -= l.quantity;
        const bal = runningBal[key];

        const typeBadge = isReceived
          ? `<span class="badge" style="background:#d1e7dd;color:#0a3622;">📥 RECEIVED</span>`
          : l.schedule_flag === 'btc_ctrl'
          ? `<span class="badge" style="background:#ffe5cc;color:#a04000;">CTRL BTC</span>`
          : `<span class="badge" style="background:#fff3cd;color:#856404;">BTC</span>`;

        return `<tr style="${isReceived?'background:rgba(209,231,221,.2);':''}">
          <td>${date} ${time}</td>
          <td>${typeBadge}</td>
          <td><strong>${l.drug_name}</strong>${l.din?`<br><small style="color:var(--text-muted);">DIN: ${l.din}</small>`:''}</td>
          <td style="text-align:center;color:${isReceived?'var(--success)':'inherit'};">
            ${isReceived?'+':'−'}${l.quantity}
          </td>
          <td style="text-align:center;font-weight:600;color:${bal<0?'var(--danger)':bal>0?'var(--success)':'inherit'}">
            ${bal}
          </td>
          <td>${isReceived ? (l.pharmacist_name||'—') : (l.pharmacist_name||'—')}</td>
          <td>${isReceived ? (l.supplier||'—') : (l.counselled?'✅':'—')}</td>
          <td>${isReceived ? (l.lot_number||'—') : (l.patient_name||'<span style="color:var(--text-muted);">Not recorded</span>')}</td>
          <td>${isReceived ? (l.notes||'—') : (l.patient_phone||'—')}</td>
          <td style="text-align:center;">${l.transaction_id?`#${l.transaction_id}`:'—'}</td>
        </tr>`;
      }).join('');

      bodyEl.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:16px;">
          ${summaryCards}
        </div>
        <div style="overflow-x:auto;">
          <table class="table" style="font-size:12px;min-width:900px;">
            <thead><tr>
              <th>Date / Time</th><th>Type</th><th>Drug</th>
              <th>Qty</th><th>Balance</th><th>Staff / RPh</th>
              <th>Counselled / Supplier</th><th>Patient / Lot #</th>
              <th>Phone / Notes</th><th>Txn#</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-muted);">
          ${logs.length} record${logs.length!==1?'s':''} &nbsp;·&nbsp;
          ${logs.filter(l=>l.log_type==='received').length} received &nbsp;·&nbsp;
          ${logs.filter(l=>l.log_type!=='received').length} dispensed
        </div>`;
    };

      if (!logs.length) {
        content.querySelector('#btc-body').innerHTML = `
          <div style="padding:40px;text-align:center;color:var(--text-muted);">
            No BTC/controlled sales recorded in this period.
          </div>`;
        return;
      }

    content.innerHTML = `
      <div class="settings-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <h3 style="margin:0;">BTC / Controlled Substance Log</h3>
          <button class="btn btn-success btn-sm" id="btc-add-received">
            📥 Record Stock Received
          </button>
        </div>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">
          Tracks all BTC sales (dispensed) and stock receipts. Running balance is calculated
          per drug. Patient name is for your records only — not sent to WinRx.
        </p>

        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;
                    background:var(--surface2);padding:12px 16px;border-radius:var(--radius);">
          <label style="font-size:13px;font-weight:500;">From</label>
          <input type="date" id="btc-from" value="${_dateStr()}" style="width:150px;" />
          <label style="font-size:13px;font-weight:500;">To</label>
          <input type="date" id="btc-to"   value="${_dateStr()}" style="width:150px;" />
          <button class="btn btn-primary btn-sm" id="btc-run">Run Report</button>
          <div style="display:flex;gap:6px;margin-left:auto;">
            <button class="btn btn-outline btn-sm" id="btc-quick-today">Today</button>
            <button class="btn btn-outline btn-sm" id="btc-quick-month">This Month</button>
            <button class="btn btn-outline btn-sm" id="btc-quick-all">All Time</button>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <button class="btn btn-outline btn-sm" id="btc-csv">⬇ Export CSV</button>
          <button class="btn btn-outline btn-sm" id="btc-print">🖨 Print</button>
        </div>

        <div id="btc-body">
          <div style="padding:40px;text-align:center;color:var(--text-muted);">
            Select a date range and click Run Report.
          </div>
        </div>
      </div>`;

    const getFrom = () => content.querySelector('#btc-from').value;
    const getTo   = () => content.querySelector('#btc-to').value;

    content.querySelector('#btc-run').addEventListener('click', () => renderTable(getFrom(), getTo()));

    content.querySelector('#btc-quick-today').addEventListener('click', () => {
      const t = _dateStr();
      content.querySelector('#btc-from').value = t;
      content.querySelector('#btc-to').value   = t;
      renderTable(t, t);
    });
    content.querySelector('#btc-quick-month').addEventListener('click', () => {
      const d = new Date(); d.setDate(1);
      const f = d.toISOString().slice(0,10);
      const t = _dateStr();
      content.querySelector('#btc-from').value = f;
      content.querySelector('#btc-to').value   = t;
      renderTable(f, t);
    });
    content.querySelector('#btc-quick-all').addEventListener('click', () => {
      content.querySelector('#btc-from').value = '2000-01-01';
      content.querySelector('#btc-to').value   = _dateStr();
      renderTable('2000-01-01', _dateStr());
    });

    // Record Stock Received modal
    content.querySelector('#btc-add-received').addEventListener('click', () => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal" style="max-width:440px;">
          <div class="modal-header" style="background:#d1e7dd;">
            <h3 style="color:#0a3622;">📥 Record Stock Received</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Drug Name <span style="color:var(--danger);">*</span></label>
              <input type="text" id="rcv-drug" placeholder="e.g. LENOLTEC #1 CODEINE CPLT 300-8-15MG" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group">
                <label>DIN</label>
                <input type="text" id="rcv-din" placeholder="e.g. 06458900" />
              </div>
              <div class="form-group">
                <label>Qty Received <span style="color:var(--danger);">*</span></label>
                <input type="number" id="rcv-qty" min="1" step="1" placeholder="e.g. 24" />
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group">
                <label>Date Received</label>
                <input type="date" id="rcv-date" value="${_dateStr()}" />
              </div>
              <div class="form-group">
                <label>Lot / Batch #</label>
                <input type="text" id="rcv-lot" placeholder="Optional" />
              </div>
            </div>
            <div class="form-group">
              <label>Supplier</label>
              <input type="text" id="rcv-supplier" placeholder="e.g. McKesson, Shoppers Drug Mart" />
            </div>
            <div class="form-group">
              <label>Received By</label>
              <input type="text" id="rcv-by"
                value="${Auth.current()?.name||''}" placeholder="Staff name" />
            </div>
            <div class="form-group">
              <label>Notes</label>
              <input type="text" id="rcv-notes" placeholder="Optional" />
            </div>
            <div id="rcv-err" class="alert alert-danger" style="display:none;"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="rcv-cancel">Cancel</button>
            <button class="btn btn-success" id="rcv-save">Save Stock Receipt</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const close = () => modal.remove();
      modal.querySelector('.modal-close').addEventListener('click', close);
      modal.querySelector('#rcv-cancel').addEventListener('click', close);
      setTimeout(() => modal.querySelector('#rcv-drug').focus(), 80);

      modal.querySelector('#rcv-save').addEventListener('click', () => {
        const drug    = modal.querySelector('#rcv-drug').value.trim();
        const qty     = parseInt(modal.querySelector('#rcv-qty').value);
        const errEl   = modal.querySelector('#rcv-err');
        if (!drug) { errEl.style.display='block'; errEl.textContent='Drug name is required.'; return; }
        if (!qty || qty < 1) { errEl.style.display='block'; errEl.textContent='Quantity must be at least 1.'; return; }

        DB.addBtcReceived({
          drug_name:     drug,
          din:           modal.querySelector('#rcv-din').value.trim() || null,
          quantity:      qty,
          received_date: modal.querySelector('#rcv-date').value || _dateStr(),
          lot_number:    modal.querySelector('#rcv-lot').value.trim() || null,
          supplier:      modal.querySelector('#rcv-supplier').value.trim() || null,
          received_by:   modal.querySelector('#rcv-by').value.trim() || null,
          notes:         modal.querySelector('#rcv-notes').value.trim() || null,
          schedule_flag: 'btc',
        });
        close();
        renderTable(getFrom(), getTo());
      });
    });

    content.querySelector('#btc-csv').addEventListener('click', () => {
      const logs = DB.getBtcLog(getFrom(), getTo());
      const rows = [
        ['Date/Time','Type','Drug Name','DIN','Qty (+In/-Out)','Balance','Price',
         'Staff/RPh','Counselled/Supplier','Patient Name/Lot#','Phone/Notes','Supplier','Txn#'],
      ];
      let runBal = {};
      logs.forEach(l => {
        const key = l.drug_name;
        if (!runBal[key]) runBal[key] = 0;
        const isRcv = l.log_type === 'received';
        if (isRcv) runBal[key] += l.quantity; else runBal[key] -= l.quantity;
        rows.push([
          new Date(l.sale_date).toLocaleString(),
          isRcv ? 'RECEIVED' : (l.schedule_flag==='btc_ctrl'?'CTRL BTC':'BTC'),
          l.drug_name, l.din||'',
          (isRcv?'+':'-') + l.quantity,
          runBal[key],
          isRcv ? '' : (l.price||0).toFixed(2),
          l.pharmacist_name||'',
          isRcv ? (l.supplier||'') : (l.counselled?'Yes':'No'),
          isRcv ? (l.lot_number||'') : (l.patient_name||''),
          isRcv ? (l.notes||'') : (l.patient_phone||''),
          l.supplier||'',
          l.transaction_id||'',
        ]);
      });
      _csvDownload(rows, `btc_log_${getFrom()}_to_${getTo()}.csv`);
    });

    content.querySelector('#btc-print').addEventListener('click', () => window.print());

    // Auto-run for this month to show balance
    const d = new Date(); d.setDate(1);
    const monthStart = d.toISOString().slice(0,10);
    content.querySelector('#btc-from').value = monthStart;
    renderTable(monthStart, _dateStr());
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
