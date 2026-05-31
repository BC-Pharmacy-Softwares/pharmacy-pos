/* ============================================================
   screens/transaction.js — Transaction Detail / Receipt
   ============================================================ */

class TransactionScreen {
  constructor({ onNavigate }) {
    this._onNavigate = onNavigate;
    this._el = null;
  }

  render(params = {}) {
    this._params = params;
    this._el = document.createElement('div');
    this._el.className = 'transaction-screen';
    this._el.innerHTML = `
      <div class="topbar">
        <button class="btn btn-outline btn-sm" id="btn-back">&#8592; Back</button>
        <span style="font-weight:600;font-size:15px;margin-left:8px;">Transaction Detail</span>
      </div>
      <div class="transaction-content" id="txn-content">
        <div style="padding:20px;"><span class="spinner"></span> Loading...</div>
      </div>`;

    this._attach();
    return this._el;
  }

  _attach() {
    this._el.querySelector('#btn-back').addEventListener('click', () => {
      if (this._params?.patient) {
        this._onNavigate('patient', { selectedPatient: this._params.patient });
      } else {
        this._onNavigate('pos');
      }
    });
    setTimeout(() => this._load(), 50);
  }

  _load() {
    const txnId   = this._params?.transactionId;
    const patient = this._params?.patient;
    const content = this._el.querySelector('#txn-content');

    if (!txnId) {
      content.innerHTML = '<div class="alert alert-danger">No transaction ID provided.</div>';
      return;
    }

    const txn      = DB.getTransaction(txnId);
    const items    = DB.getItemsForTransaction(txnId);
    const payments = DB.getPaymentsForTransaction(txnId);

    if (!txn) {
      content.innerHTML = '<div class="alert alert-danger">Transaction not found.</div>';
      return;
    }

    // Use passed-in patient, or look up linked patient from DB
    const linkedPatient = patient || (txn.patient_id ? DB.getPatient(txn.patient_id) : null);
    const totalpaid = payments.reduce((s, p) => s + p.amount, 0);

    content.innerHTML = `
      <!-- Header info -->
      <div class="transaction-header-info">
        <div class="txn-info-box">
          <div class="txn-info-label">Transaction #</div>
          <div class="txn-info-value">${txn.transaction_id}</div>
        </div>
        <div class="txn-info-box">
          <div class="txn-info-label">Date</div>
          <div class="txn-info-value">${new Date(txn.transaction_date).toLocaleString(navigator.language)}</div>
        </div>
        <div class="txn-info-box">
          <div class="txn-info-label">Type</div>
          <div class="txn-info-value">${txn.transaction_type}</div>
        </div>
        <div class="txn-info-box">
          <div class="txn-info-label">Status</div>
          <div class="txn-info-value"><span class="badge badge-${txn.status.toLowerCase()}">${txn.status}</span></div>
        </div>
      </div>

      <!-- Patient card -->
      <div class="card" style="margin-bottom:12px;" id="txn-patient-card">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          ${linkedPatient
            ? `<div>
                 <span style="font-size:13px;font-weight:600;">&#128100; ${linkedPatient.given_name} ${linkedPatient.surname}</span>
                 <span class="text-muted" style="margin-left:10px;font-size:12px;">PHN: ${linkedPatient.phn}</span>
                 ${linkedPatient.dob ? `<span class="text-muted" style="font-size:12px;"> &bull; DOB: ${linkedPatient.dob}</span>` : ''}
               </div>
               <button class="btn btn-sm btn-outline" id="btn-change-patient">Change Patient</button>`
            : `<span class="text-muted" style="font-size:13px;">No patient linked to this transaction.</span>
               <button class="btn btn-sm btn-primary" id="btn-link-patient">&#128100; Link Patient</button>`
          }
        </div>
      </div>

      <!-- Items -->
      <div class="card" style="margin-bottom:12px;">
        <div class="card-header">Items</div>
        <table class="table">
          <thead><tr><th>Type</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Tax</th><th class="text-right">Total</th></tr></thead>
          <tbody>
            ${items.map(i => `
              <tr>
                <td><span class="badge badge-${i.item_type.toLowerCase()}">${i.item_type}</span></td>
                <td>
                  ${i.description}
                  ${i.rx_number ? `<div style="font-size:11px;color:var(--text-muted);">Rx# ${i.rx_number}-${i.branch_code||''}</div>` : ''}
                </td>
                <td>${i.quantity}</td>
                <td>${Tax.fmt(i.unit_price)}</td>
                <td>${i.gst_applicable?'GST ':''}${i.pst_applicable?'PST':''}</td>
                <td class="text-right">${Tax.fmt(i.line_total)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div style="padding:12px 16px;text-align:right;border-top:1px solid var(--border);">
          <div class="text-muted" style="font-size:13px;">Subtotal: ${Tax.fmt(txn.subtotal)}</div>
          ${txn.gst_amount > 0 ? `<div class="text-muted" style="font-size:13px;">GST (${(Tax.gstRate()*100).toFixed(1).replace(/\.0$/,'')}%): ${Tax.fmt(txn.gst_amount)}</div>` : ''}
          ${txn.pst_amount > 0 ? `<div class="text-muted" style="font-size:13px;">PST (${(Tax.pstRate()*100).toFixed(1).replace(/\.0$/,'')}%): ${Tax.fmt(txn.pst_amount)}</div>` : ''}
          <div style="font-size:18px;font-weight:700;margin-top:4px;">TOTAL: ${Tax.fmt(txn.total_amount)}</div>
        </div>
      </div>

      <!-- Payments -->
      <div class="card" style="margin-bottom:12px;">
        <div class="card-header">Payment History</div>
        ${payments.length === 0
          ? '<div class="card-body text-muted">No payments recorded.</div>'
          : `<table class="table">
              <thead><tr><th>Date</th><th>Method</th><th class="text-right">Amount</th><th>Staff</th><th>Notes</th></tr></thead>
              <tbody>
                ${payments.map(p => `
                  <tr>
                    <td>${new Date(p.payment_date).toLocaleString(navigator.language)}</td>
                    <td>${p.method}</td>
                    <td class="text-right">${Tax.fmt(p.amount)}</td>
                    <td>${p.staff_pin||''}</td>
                    <td>${p.notes||''}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
            <div style="padding:10px 16px;text-align:right;border-top:1px solid var(--border);">
              <span class="fw-bold">Total Paid: ${Tax.fmt(totalpaid)}</span>
              ${txn.balance_owing > 0 ? `<span class="text-danger fw-bold" style="margin-left:16px;">Balance Owing: ${Tax.fmt(txn.balance_owing)}</span>` : ''}
            </div>`}
      </div>

      <!-- Actions -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary" id="btn-print">&#128438; Print Receipt</button>
        ${(txn.status === 'PENDING' || txn.status === 'PARTIAL')
          ? `<button class="btn btn-success" id="btn-record-payment">Record Payment</button>` : ''}
        ${txn.status !== 'REVERSED'
          ? `<button class="btn btn-danger btn-sm" id="btn-reverse">Void Transaction</button>` : ''}
      </div>`;

    // Actions
    content.querySelector('#btn-print')?.addEventListener('click', () => {
      Print.printReceipt(txn, items, payments, linkedPatient || null);
    });

    // Link / change patient
    const linkBtn = content.querySelector('#btn-link-patient') || content.querySelector('#btn-change-patient');
    if (linkBtn) {
      linkBtn.addEventListener('click', () => {
        this._showLinkPatientModal(txn.transaction_id, () => this._load());
      });
    }

    content.querySelector('#btn-record-payment')?.addEventListener('click', () => {
      this._showRecordPaymentModal(txn, payments);
    });

    content.querySelector('#btn-reverse')?.addEventListener('click', () => {
      if (!Auth.isAdmin()) { alert('Only admins can reverse transactions.'); return; }
      if (!confirm(`Reverse transaction #${txn.transaction_id}? This cannot be undone.`)) return;
      DB.reverseTransaction(txn.transaction_id);
      Audit.refund(txn.transaction_id, `Transaction reversed by ${Auth.current()?.name}`);
      this._load();
    });
  }

  _showRecordPaymentModal(txn, existingPayments) {
    const totalpaid    = existingPayments.reduce((s, p) => s + p.amount, 0);
    const balanceOwing = Tax.round2(txn.total_amount - totalpaid);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Record Payment</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="alert alert-info">
            Balance owing: <strong>${Tax.fmt(balanceOwing)}</strong>
          </div>
          <div class="form-group">
            <label>Payment Method</label>
            <div class="payment-method-grid">
              ${['Cash','Debit','Credit','Insurance'].map(m =>
                `<button class="payment-method-btn" data-method="${m.toUpperCase()}">${m}</button>`
              ).join('')}
            </div>
          </div>
          <div class="form-group">
            <label>Amount</label>
            <input type="number" id="rp-amount" step="0.01" min="0.01"
                   max="${balanceOwing}" value="${balanceOwing.toFixed(2)}" />
          </div>
          <div class="form-group">
            <label>Notes</label>
            <input type="text" id="rp-notes" placeholder="Optional" />
          </div>
          <div id="rp-error" class="alert alert-danger" style="display:none;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="rp-cancel">Cancel</button>
          <button class="btn btn-success" id="rp-confirm">Record Payment</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    let selectedMethod = null;
    modal.querySelectorAll('.payment-method-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedMethod = btn.dataset.method;
      });
    });

    const close = () => document.body.removeChild(modal);
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#rp-cancel').addEventListener('click', close);
    modal.querySelector('#rp-confirm').addEventListener('click', () => {
      const errEl  = modal.querySelector('#rp-error');
      const amount = parseFloat(modal.querySelector('#rp-amount').value) || 0;
      const notes  = modal.querySelector('#rp-notes').value.trim();
      if (!selectedMethod) { errEl.style.display='block'; errEl.textContent='Select a method.'; return; }
      if (amount <= 0)     { errEl.style.display='block'; errEl.textContent='Enter valid amount.'; return; }
      errEl.style.display = 'none';

      DB.addPayment({
        transaction_id: txn.transaction_id,
        payment_date:   localISOStr(),
        amount,
        method:         selectedMethod,
        staff_pin:      Auth.current()?.pin || null,
        notes:          notes || null,
      });

      const newTotal    = Tax.round2(totalpaid + amount);
      const newBalance  = Tax.round2(txn.total_amount - newTotal);
      const newStatus   = newBalance <= 0 ? 'PAID' : 'PARTIAL';
      DB.updateTransactionStatus(txn.transaction_id, newStatus, newTotal, Math.max(0, newBalance));
      Audit.sale(txn.transaction_id, `Payment recorded: ${Tax.fmt(amount)} via ${selectedMethod}`);
      close();
      this._load();
    });
  }

  _showLinkPatientModal(txnId, onLinked) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:520px;width:96%;">
        <div class="modal-header">
          <h3>Link Patient to Transaction #${txnId}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;gap:8px;margin-bottom:10px;">
            <input type="text" id="lp-query" placeholder="PHN, name, or phone…"
                   style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius);
                          font-size:13px;background:var(--surface2);color:var(--text);outline:none;" />
            <button class="btn btn-primary btn-sm" id="lp-search-btn">Search</button>
          </div>
          <div id="lp-results" style="max-height:280px;overflow-y:auto;font-size:13px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="lp-cancel">Cancel</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('#lp-cancel').addEventListener('click', close);

    const resultsEl = overlay.querySelector('#lp-results');

    const doSearch = async () => {
      const q = overlay.querySelector('#lp-query').value.trim();
      if (!q) return;
      resultsEl.innerHTML = '<span class="spinner"></span> Searching…';

      let patients = [];
      try {
        if (/^\d{6,}$/.test(q)) {
          const p = await PharmacyDashboardAPI.getPatient(q).catch(() => null);
          if (p?.phn) { DB.upsertPatient(p); patients = [p]; }
        }
        if (!patients.length) {
          const apiResults = await PharmacyDashboardAPI.getPatients({ name: q }).catch(() => []);
          if (apiResults.length) {
            apiResults.forEach(p => DB.upsertPatient(p));
            patients = apiResults;
          }
        }
      } catch(_) {}

      if (!patients.length) patients = DB.searchPatients(q);

      if (!patients.length) {
        resultsEl.innerHTML = '<p class="text-muted" style="padding:10px 0;">No patients found.</p>';
        return;
      }

      resultsEl.innerHTML = patients.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:8px 4px;border-bottom:1px solid var(--border);">
          <div>
            <strong>${p.given_name} ${p.surname}</strong>
            <span class="text-muted" style="margin-left:8px;font-size:12px;">PHN: ${p.phn}</span>
            ${p.dob ? `<span class="text-muted" style="font-size:12px;"> &bull; DOB: ${p.dob}</span>` : ''}
          </div>
          <button class="btn btn-sm btn-success" data-phn="${p.phn}">Select</button>
        </div>`).join('');

      resultsEl.querySelectorAll('[data-phn]').forEach(btn => {
        btn.addEventListener('click', () => {
          const patient = DB.getPatientByPhn(btn.dataset.phn);
          if (!patient) { alert('Patient not found.'); return; }
          DB.linkPatientToTransaction(txnId, patient.patient_id);
          close();
          if (typeof onLinked === 'function') onLinked();
        });
      });
    };

    overlay.querySelector('#lp-search-btn').addEventListener('click', doSearch);
    overlay.querySelector('#lp-query').addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch();
    });
    setTimeout(() => overlay.querySelector('#lp-query')?.focus(), 80);
  }

  detach() {}
}
