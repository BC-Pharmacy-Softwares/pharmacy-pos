/* ============================================================
   screens/pos.js v50.1 — Main POS Screen
   F1=new transaction, F2=search patient, ESC=cancel last item
   ============================================================ */

class POSScreen {
  constructor({ onNavigate }) {
    this._onNavigate      = onNavigate;
    this._el              = null;
    this._cart            = [];
    this._patient         = null;
    this._scanning        = false;
    this._keyHandler      = null;
    this._pendingRxLoaded = false;
  }

  render() {
    this._el = document.createElement('div');
    this._el.className = 'pos-screen';
    this._el.innerHTML = `
      <!-- Top Bar -->
      <div class="topbar">
        <span class="topbar-brand">&#9654; Pharmacy POS</span>
        <div class="topbar-patient" id="topbar-patient">
          <span class="text-muted">No patient linked</span>
        </div>
        <div class="topbar-actions">
          <button class="btn btn-outline btn-sm" id="btn-search-patient">
            &#128269; Patient <small>(F2)</small>
          </button>
          <button class="btn btn-outline btn-sm" id="btn-new-txn">
            &#43; New <small>(F1)</small>
          </button>
          <button class="btn btn-outline btn-sm" id="btn-history">&#128203; History</button>
          <button class="btn btn-outline btn-sm" id="btn-reports">&#128200; Reports</button>
          <button class="btn btn-outline btn-sm" id="btn-customer-display" title="Open Customer Display">&#128065;</button>
          <button class="btn btn-sm" id="btn-shift"
                  style="border:1px solid var(--border);border-radius:var(--radius);
                         padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap;
                         background:var(--surface2);transition:background .15s;">
            <span id="shift-dot" style="color:#adb5bd;">&#9679;</span>
            <span id="shift-label" style="margin-left:4px;">Shift</span>
          </button>
          <button class="btn btn-outline btn-sm" id="btn-settings">&#9881;</button>
          <div class="topbar-staff">
            <span id="staff-name"></span>
            <button class="btn btn-outline btn-sm" id="btn-lock">Lock</button>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="pos-body">
        <!-- Cart (left) -->
        <div class="cart-panel">
          <div class="cart-header">
            <span>Cart</span>
            <span id="cart-count" class="text-muted" style="font-weight:400;font-size:13px;">0 items</span>
          </div>
          <div class="cart-items" id="cart-items">
            <div class="cart-empty">Scan a barcode or search for a patient</div>
          </div>
          <div class="cart-totals" id="cart-totals" style="display:none;">
            <div class="cart-totals-row"><span>Subtotal</span><span id="cart-subtotal">$0.00</span></div>
            <div class="cart-totals-row"><span id="cart-gst-label">GST</span><span id="cart-gst">$0.00</span></div>
            <div class="cart-totals-row"><span id="cart-pst-label">PST</span><span id="cart-pst">$0.00</span></div>
            <div class="cart-totals-row total"><span>TOTAL</span><span id="cart-total">$0.00</span></div>
            <div class="cart-charge-btn">
              <button class="btn btn-success btn-xl btn-block" id="btn-charge">Charge Patient</button>
            </div>
          </div>
        </div>

        <!-- Scan Panel (right) -->
        <div class="scan-panel">
          <div class="scan-input-area">
            <div class="scan-label">&#128244; Scan Barcode</div>
            <div class="scan-input-wrap">
              <input type="text" class="scan-input" id="scan-input"
                     placeholder="Scan Rx or UPC barcode..." autocomplete="off" />
            </div>
            <div class="scan-status" id="scan-status">Ready — scan or type a barcode</div>
          </div>

          <div class="quick-actions">
            <div class="quick-actions-title">Quick Actions</div>
            <div class="quick-action-grid">
              <button class="btn btn-outline" id="btn-manual-otc">&#43; Manual OTC</button>
              <button class="btn btn-outline" id="btn-manual-rx">&#43; Manual Rx</button>
              <button class="btn btn-outline" id="btn-custom-products">Custom Items</button>
              <button class="btn btn-outline btn-danger" id="btn-clear-cart">Clear Cart</button>
            </div>
            <div id="custom-quick-actions"></div>
          </div>

          <div class="shortcuts-hint">
            <span class="shortcut-key">F1</span> New transaction &nbsp;
            <span class="shortcut-key">F2</span> Search patient &nbsp;
            <span class="shortcut-key">ESC</span> Remove last item
          </div>
        </div>
      </div>`;

    this._attach();
    this._updateDisplay();
    return this._el;
  }

  _attach() {
    const staff = Auth.current();
    this._el.querySelector('#staff-name').textContent =
      staff ? `${staff.name} (${Auth.roleLabel(staff.role)})` : '';

    // Keyboard shortcuts
    document.addEventListener('keydown', this._keyHandler = e => {
      Auth.touch();
      if (e.key === 'F1') { e.preventDefault(); this.newTransaction(); }
      if (e.key === 'F2') { e.preventDefault(); this._onNavigate('patient', { returnToPos: true }); }
      if (e.key === 'Escape') { e.preventDefault(); this._removeLastItem(); }
    });

    // Keep scan input focused
    const scanInput = this._el.querySelector('#scan-input');
    this._el.addEventListener('click', () => setTimeout(() => scanInput.focus(), 50));
    // USB scanner sends Enter after the barcode string — handle it immediately
    // and cancel the input-timer so it doesn't fire a second time.
    let _scanBuffer = '';
    let _scanTimer  = null;
    scanInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(_scanTimer);   // stop the 200ms timer
        _scanTimer  = null;
        _scanBuffer = '';           // clear buffer so timer can't replay it
        this._handleScan(scanInput.value.trim());
      }
    });
    // Fallback: if scanner doesn't send Enter, fire after 200ms of no input
    scanInput.addEventListener('input', () => {
      _scanBuffer = scanInput.value;
      clearTimeout(_scanTimer);
      _scanTimer = setTimeout(() => {
        _scanTimer = null;
        if (_scanBuffer.length >= 3) this._handleScan(_scanBuffer.trim());
        _scanBuffer = '';
      }, 200);
    });

    // Buttons
    this._el.querySelector('#btn-new-txn').addEventListener('click', () => this.newTransaction());
    this._el.querySelector('#btn-search-patient').addEventListener('click', () => this._onNavigate('patient', { returnToPos: true }));
    this._el.querySelector('#btn-history').addEventListener('click', () => this._showHistoryModal());
    this._el.querySelector('#btn-reports').addEventListener('click', () => this._onNavigate('reports'));
    this._el.querySelector('#btn-shift').addEventListener('click', () => this._showShiftModal());
    this._updateShiftIndicator();
    this._el.querySelector('#btn-customer-display').addEventListener('click', () => {
      window.open('customer-display.html', 'customer-display',
        'width=800,height=500,menubar=no,toolbar=no,location=no,status=no');
    });
    this._el.querySelector('#btn-settings').addEventListener('click', () => this._onNavigate('settings'));
    this._el.querySelector('#btn-lock').addEventListener('click', () => { Auth.logout(); this._onNavigate('login'); });
    this._el.querySelector('#btn-charge').addEventListener('click', () => this._showPaymentModal());
    this._el.querySelector('#btn-clear-cart').addEventListener('click', () => this._confirmClearCart());
    this._el.querySelector('#btn-manual-otc').addEventListener('click', () => this._showManualOTCModal());
    this._el.querySelector('#btn-manual-rx').addEventListener('click', () => this._showManualRxModal());
    this._el.querySelector('#btn-custom-products').addEventListener('click', () => this._showCustomProductsModal());

    this._loadAndRenderQuickActions();

    setTimeout(() => scanInput.focus(), 100);
  }

  /* ---- Scan handler ---- */
  async _handleScan(raw) {
    if (!raw || this._scanning) return;
    this._scanning = true;
    const scanInput  = this._el.querySelector('#scan-input');
    const scanStatus = this._el.querySelector('#scan-status');
    scanInput.value  = '';

    this._setStatus('loading', `Processing: ${raw}...`);

    try {
      // 1. Try Rx barcode
      if (BarcodeParser.looksLikeRx(raw)) {
        const parsed = await BarcodeParser.parse(raw);
        if (parsed) {
          if (parsed.price !== undefined) {
            // Price embedded in barcode — try SQL lookup first for drug name + patient link;
            // use the barcode price as the fallback if SQL is unavailable
            this._scanning = false;
            await this._addRxItem(parsed.rxNumber, parsed.branchCode, raw, parsed.price);
            return;
          }
          await this._addRxItem(parsed.rxNumber, parsed.branchCode, raw);
          this._scanning = false;
          return;
        }
      }
      // 2. Try OTC product lookup
      const product = DB.findProductByBarcode(raw) || DB.findCustomProductByBarcode(raw);
      if (product) {
        this._addOTCItem(product, raw);
        this._scanning = false;
        return;
      }
      // 3. Unknown barcode — if looks numeric check as Rx anyway
      if (/^\d+$/.test(raw) && raw.length >= 4) {
        const branchCode = await Config.get('branch_code') || 'A';
        await this._addRxItem(raw, branchCode, raw);
        this._scanning = false;
        return;
      }
      // 4. Not found anywhere
      this._setStatus('error', `Barcode not found: ${raw}`);
      this._offerManualEntry(raw);
    } catch(e) {
      this._setStatus('error', e.message);
    }
    this._scanning = false;
    setTimeout(() => scanInput.focus(), 100);
  }

  async _addRxItem(rxNum, branchCode, originalBarcode, fallbackPrice) {
    this._setStatus('loading', `Looking up Rx ${rxNum}...`);
    try {
      const rxData = await PharmacyDashboardAPI.getRxTx(rxNum, branchCode);
      if (!rxData) throw new Error('Rx not found in Pharmacy Dashboard');

      // Auto-link patient from Rx data
      try {
        console.log('[patient-link] rxData.patient:', rxData.patient, '| rxData.patient_phn:', rxData.patient_phn, '| raw PHN:', rxData.raw?.PHN);
        // Use patient embedded in getRxTx response (SQL join) — no second API call needed
        const rawPt = rxData.patient;
        let patient = null;

        if (rawPt?.PHN) {
          // Save/update in local DB from the SQL-joined data
          DB.upsertPatient({
            phn:         String(rawPt.PHN),
            given_name:  rawPt.GIVEN    || '',
            surname:     rawPt.SURNAME  || '',
            dob:         rawPt.BIRTHDATE || null,
            phone:       rawPt.PHONE    || null,
            cell:        rawPt.CELL     || null,
            email:       rawPt.EMAIL    || null,
            address:     rawPt.ADDR1    || null,
            city:        rawPt.CITY     || null,
            province:    rawPt.PROV     || null,
            postal_code: rawPt.PC       || null,
            allergies:   rawPt.ALLERGY  || null,
          });
          patient = DB.getPatientByPhn(String(rawPt.PHN));
        } else if (rxData.patient_phn) {
          // Fallback: check local DB then fetch from API
          patient = DB.getPatientByPhn(rxData.patient_phn);
          if (!patient) {
            const apiPt = await PharmacyDashboardAPI.getPatient(rxData.patient_phn);
            if (apiPt?.phn) { DB.upsertPatient(apiPt); patient = DB.getPatientByPhn(apiPt.phn); }
          }
        }

        if (patient) {
          if (!this._patient) {
            this._patient = patient;
            this._updatePatientBar();
          } else if (this._patient.phn !== patient.phn) {
            this._setStatus('warn', `⚠ Rx ${rxNum} belongs to ${patient.given_name} ${patient.surname} — not the linked patient`);
          }
          if (!this._pendingRxLoaded) {
            this._pendingRxLoaded = true;
            this._loadPendingRx(patient.phn, branchCode);
          }
        }
      } catch(e) { console.warn('Patient auto-link failed:', e.message); }

      // Use copay from API; if it returned $0 and barcode had a price, use the barcode price
      const unitPrice = (rxData.unit_price > 0 || fallbackPrice === undefined)
        ? rxData.unit_price
        : fallbackPrice;

      // Build description — append fill qty if API returned it (e.g. "Metformin 500mg [Qty:90]")
      const desc = rxData.fill_qty
        ? `${rxData.description} [Qty:${rxData.fill_qty}]`
        : rxData.description;

      this._cart.push({
        item_type:      'RX',
        rx_number:      rxNum,
        branch_code:    branchCode,
        din:            rxData.din,
        description:    desc,
        quantity:       1,              // always 1 billing unit; copay is for the whole fill
        unit_price:     unitPrice,
        gst_applicable: false,
        pst_applicable: false,
        line_total:     Tax.round2(unitPrice),
      });
      this._setStatus('success', `Added: ${desc} — ${Tax.fmt(unitPrice)}`);
      this._updateDisplay();
    } catch(e) {
      // API/SQL unavailable or Rx not found — use barcode price if available
      this._showManualRxFallback(rxNum, branchCode, fallbackPrice);
    }
  }

  _showManualRxFallback(rxNum, branchCode, fallbackPrice) {
    // SQL unavailable — add with barcode price if known, otherwise $0; staff can tap to edit
    const price = typeof fallbackPrice === 'number' ? fallbackPrice : 0;
    this._cart.push({
      item_type:      'RX',
      rx_number:      rxNum,
      branch_code:    branchCode || 'A',
      din:            null,
      description:    'RX NO TAX',
      quantity:       1,
      unit_price:     price,
      gst_applicable: false,
      pst_applicable: false,
      line_total:     Tax.round2(price),
    });
    const msg = price > 0
      ? `Rx ${rxNum} added — ${Tax.fmt(price)} (from barcode)`
      : `Rx ${rxNum} added — tap price to update`;
    this._setStatus('', msg);
    this._updateDisplay();
    setTimeout(() => this._el?.querySelector('#scan-input')?.focus(), 50);
  }

  _addPositecRxDirect(rxRef, price) {
    this._cart.push({
      item_type:      'RX',
      rx_number:      rxRef,
      branch_code:    null,
      din:            null,
      description:    'RX NO TAX',
      quantity:       1,
      unit_price:     price,
      gst_applicable: false,
      pst_applicable: false,
      line_total:     Tax.round2(price),
    });
    this._setStatus('success', `Rx added — $${price.toFixed(2)}`);
    this._updateDisplay();
    setTimeout(() => this._el?.querySelector('#scan-input')?.focus(), 50);
  }

  _addOTCItem(product, barcode) {
    // price_override wins; fall back to suggested_retail (catalog) or price (custom)
    const price = product.price_override != null
      ? product.price_override
      : (product.suggested_retail || product.regular_unit_price || product.price || 0);
    this._cart.push({
      item_type:      'OTC',
      din:            product.din || null,
      upc:            barcode,
      description:    product.description,
      quantity:       1,
      unit_price:     price,
      gst_applicable: !!product.gst_applicable,
      pst_applicable: !!product.pst_applicable,
      line_total:     price,
    });
    this._setStatus('success', `Added: ${product.description} — ${Tax.fmt(price)}`);
    this._updateDisplay();
  }

  _removeLastItem() {
    if (this._cart.length === 0) return;
    const removed = this._cart.pop();
    this._setStatus('', `Removed: ${removed.description}`);
    this._updateDisplay();
  }

  newTransaction() {
    this._cart            = [];
    this._patient         = null;
    this._pendingRxLoaded = false;
    this._updateDisplay();
    this._updatePatientBar();
    this._setStatus('', 'New transaction started');
    const scanInput = this._el.querySelector('#scan-input');
    if (scanInput) { scanInput.value = ''; scanInput.focus(); }
  }

  setPatient(patient) {
    this._patient = patient;
    this._updatePatientBar();
  }

  /* ---- Display ---- */
  _updateDisplay() {
    const cartItems  = this._el.querySelector('#cart-items');
    const cartTotals = this._el.querySelector('#cart-totals');
    const cartCount  = this._el.querySelector('#cart-count');

    cartCount.textContent = `${this._cart.length} item${this._cart.length !== 1 ? 's' : ''}`;

    if (this._cart.length === 0) {
      cartTotals.style.display = 'none';
      cartItems.innerHTML = '<div class="cart-empty">Scan a barcode or search for a patient</div>';
      try {
        const bc = new BroadcastChannel('pos-cart');
        bc.postMessage({ type: 'clear' });
        bc.close();
      } catch(e) { /* BroadcastChannel not available */ }
      return;
    }

    cartTotals.style.display = 'block';
    cartItems.innerHTML = '';

    this._cart.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      const isDiscount = item.item_type === 'DISCOUNT';
      const badge = isDiscount
        ? `<span class="badge" style="background:rgba(220,53,69,.12);color:var(--danger);">Disc</span>`
        : item.item_type === 'RX'
        ? `<span class="badge badge-rx">Rx</span>`
        : item.item_type === 'OTC'
        ? `<span class="badge badge-otc">OTC</span>`
        : `<span class="badge badge-custom">Custom</span>`;
      if (isDiscount) row.style.cssText = 'background:rgba(220,53,69,.04);border-left:3px solid var(--danger);';
      row.innerHTML = `
        <div class="cart-item-info">
          ${badge} <span class="cart-item-name" style="${isDiscount?'color:var(--danger);':''}">${item.description}</span>
          <div class="cart-item-detail">
            ${item.rx_number ? `Rx# ${item.rx_number}-${item.branch_code}` : ''}
            ${item.quantity > 1 ? `Qty: ${item.quantity}` : ''}
            ${!item.gst_applicable && !item.pst_applicable ? '' : `${item.gst_applicable?'GST ':' '}${item.pst_applicable?'PST':''}`}
          </div>
        </div>
        <div class="cart-item-price${isDiscount ? '' : ' cart-item-price-editable'}"
             style="${isDiscount ? 'color:var(--danger);' : ''}"
             ${isDiscount ? '' : `data-edit-idx="${idx}" title="Click to edit price"`}>
          ${Tax.fmt(item.line_total)}${isDiscount ? '' : ' <span class="price-edit-icon">&#9998;</span>'}
        </div>
        <button class="cart-item-remove" data-idx="${idx}" title="Remove">&#215;</button>`;
      row.querySelector('.cart-item-remove').addEventListener('click', e => {
        const i = parseInt(e.target.dataset.idx);
        this._cart.splice(i, 1);
        this._updateDisplay();
      });
      if (!isDiscount) {
        row.querySelector('.cart-item-price-editable').addEventListener('click', () => {
          this._editItemPrice(idx);
        });
      }
      cartItems.appendChild(row);
    });

    const totals = Tax.calcCartTotals(this._cart);
    this._el.querySelector('#cart-subtotal').textContent  = Tax.fmt(totals.subtotal);
    this._el.querySelector('#cart-gst-label').textContent = `GST (${(Tax.gstRate()*100).toFixed(1).replace(/\.0$/,'')}%)`;
    this._el.querySelector('#cart-gst').textContent       = Tax.fmt(totals.gst_amount);
    this._el.querySelector('#cart-pst-label').textContent = `PST (${(Tax.pstRate()*100).toFixed(1).replace(/\.0$/,'')}%)`;
    this._el.querySelector('#cart-pst').textContent       = Tax.fmt(totals.pst_amount);
    this._el.querySelector('#cart-total').textContent     = Tax.fmt(totals.total_amount);

    // Broadcast cart state to customer display window
    try {
      const bc = new BroadcastChannel('pos-cart');
      bc.postMessage({ type: 'cart', items: this._cart, totals });
      bc.close();
    } catch(e) { /* BroadcastChannel not available */ }
  }

  _updatePatientBar() {
    const bar = this._el.querySelector('#topbar-patient');
    if (this._patient) {
      bar.innerHTML = `
        <button id="btn-patient-profile" style="background:none;border:none;padding:0;
                cursor:pointer;display:flex;align-items:center;gap:6px;color:inherit;">
          <strong style="color:var(--primary);">${this._patient.given_name} ${this._patient.surname}</strong>
          <span style="color:var(--text-muted);font-size:12px;">${this._patient.phn}</span>
        </button>
        <button class="btn btn-outline btn-sm" id="btn-unlink-patient"
                style="font-size:11px;padding:2px 7px;margin-left:4px;" title="Unlink customer">&#215;</button>`;
      bar.querySelector('#btn-patient-profile')?.addEventListener('click', () => {
        this._showPatientProfileModal(this._patient);
      });
      bar.querySelector('#btn-unlink-patient')?.addEventListener('click', e => {
        e.stopPropagation();
        this._patient = null;
        this._updatePatientBar();
      });
    } else {
      bar.innerHTML = `<span class="text-muted">No customer — <a href="#" id="link-patient" style="color:var(--primary)">&#128269; link</a></span>`;
      bar.querySelector('#link-patient')?.addEventListener('click', e => {
        e.preventDefault();
        this._showQuickCustomerModal();
      });
    }
  }

  async _showPatientProfileModal(patient) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);
      display:flex;align-items:center;justify-content:center;z-index:9200;`;

    const dob = patient.dob
      ? new Date(patient.dob).toLocaleDateString('en-CA', {year:'numeric',month:'short',day:'numeric'})
      : null;

    overlay.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
                  width:600px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;
                  box-shadow:0 8px 32px rgba(0,0,0,.35);">
        <!-- Header -->
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);
                    display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <div>
            <div style="font-size:18px;font-weight:700;">
              ${patient.given_name} ${patient.surname}
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:3px;display:flex;gap:14px;flex-wrap:wrap;">
              <span>PHN: <strong>${patient.phn}</strong></span>
              ${dob    ? `<span>DOB: <strong>${dob}</strong></span>` : ''}
              ${patient.phone ? `<span>Tel: <strong>${patient.phone}</strong></span>` : ''}
              ${patient.cell  ? `<span>Cell: <strong>${patient.cell}</strong></span>` : ''}
            </div>
            ${patient.allergies ? `
              <div style="margin-top:6px;padding:4px 10px;background:#fff3cd;border-radius:4px;
                          font-size:12px;color:#856404;font-weight:600;">
                &#9888; Allergies: ${patient.allergies}
              </div>` : ''}
          </div>
          <button id="pp-close" style="font-size:20px;background:none;border:none;
                  cursor:pointer;color:var(--text-muted);padding:0 4px;line-height:1;">&times;</button>
        </div>

        <!-- Rx list -->
        <div style="flex:1;overflow-y:auto;padding:0;">
          <div style="padding:12px 20px 6px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:12px;font-weight:700;text-transform:uppercase;
                         letter-spacing:.04em;color:var(--text-muted);">Active Prescriptions</span>
            <label style="font-size:12px;color:var(--text-muted);cursor:pointer;">
              <input type="checkbox" id="pp-select-all" style="margin-right:4px;">Select all
            </label>
          </div>
          <div id="pp-rx-list" style="padding:0 20px 12px;">
            <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">
              <span class="spinner"></span> Loading prescriptions…
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:12px 20px;border-top:1px solid var(--border);
                    display:flex;gap:10px;justify-content:flex-end;align-items:center;">
          <span id="pp-status" style="font-size:12px;color:var(--text-muted);flex:1;"></span>
          <button id="pp-skip" style="padding:8px 18px;border:1px solid var(--border);
            border-radius:var(--radius);background:var(--surface2);cursor:pointer;font-size:13px;">
            Close
          </button>
          <button id="pp-add" style="padding:8px 22px;border:none;border-radius:var(--radius);
            background:var(--accent);color:#fff;cursor:pointer;font-size:13px;font-weight:600;">
            Add Selected to Cart
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close   = () => overlay.remove();
    const listEl  = overlay.querySelector('#pp-rx-list');
    const statusEl= overlay.querySelector('#pp-status');
    overlay.querySelector('#pp-close').addEventListener('click', close);
    overlay.querySelector('#pp-skip').addEventListener('click', close);

    /* ── Load prescriptions ── */
    let pending = [];
    try {
      const profile = await PharmacyDashboardAPI.getPatientProfile(patient.phn);
      const rxList  = Array.isArray(profile) ? profile
                    : Array.isArray(profile?.RX) ? profile.RX
                    : [];

      if (!rxList.length) {
        listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">
          No active prescriptions found.</div>`;
      } else {
        const inCart = new Set(this._cart.map(i => String(i.rx_number)));
        const fmtDate = d => {
          if (!d) return '';
          const s = String(d);
          if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
          return s.slice(0, 10);
        };

        pending = rxList.map(r => ({
          rxNumber: String(r.RXNUM  || r.RxNum  || r.rxnum  || ''),
          drug:     r.DRUG   || r.DrugName || r.drug   || 'Rx',
          copay:    parseFloat(r.RECOPAY || r.Copay || r.copay || 0) || 0,
          qty:      parseInt(r.REQTY  || r.QTY   || r.qty   || 0) || 0,
          fillDate: r.REEFDATE || r.FillDate || null,
          din:      r.DIN    || r.din    || null,
        })).filter(r => r.rxNumber);

        listEl.innerHTML = pending.map((r, i) => {
          const already = inCart.has(r.rxNumber);
          return `
            <label style="display:flex;align-items:center;gap:10px;padding:10px 0;
                          cursor:${already ? 'default' : 'pointer'};
                          border-bottom:1px solid var(--border-faint,#2a2a2a);
                          opacity:${already ? '.5' : '1'};">
              <input type="checkbox" class="pp-cb" data-idx="${i}"
                     ${already ? 'disabled checked' : ''}
                     style="flex-shrink:0;width:16px;height:16px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;white-space:nowrap;
                             overflow:hidden;text-overflow:ellipsis;">${r.drug}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                  Rx #${r.rxNumber}
                  ${r.qty      ? ` &nbsp;·&nbsp; Qty: ${r.qty}`          : ''}
                  ${r.fillDate ? ` &nbsp;·&nbsp; Filled: ${fmtDate(r.fillDate)}` : ''}
                  ${already    ? ` &nbsp;·&nbsp; <em>already in cart</em>` : ''}
                </div>
              </div>
              <div style="font-size:15px;font-weight:700;color:var(--accent);white-space:nowrap;">
                $${r.copay.toFixed(2)}
              </div>
            </label>`;
        }).join('');

        overlay.querySelector('#pp-select-all').addEventListener('change', e => {
          overlay.querySelectorAll('.pp-cb:not(:disabled)').forEach(cb => {
            cb.checked = e.target.checked;
          });
        });
      }
    } catch(e) {
      listEl.innerHTML = `<div style="padding:16px;color:var(--danger);">
        Failed to load prescriptions: ${e.message}</div>`;
    }

    /* ── Add selected to cart ── */
    overlay.querySelector('#pp-add').addEventListener('click', () => {
      const checked = [...overlay.querySelectorAll('.pp-cb:checked:not(:disabled)')];
      if (!checked.length) { statusEl.textContent = 'Select at least one prescription.'; return; }

      const branchCode = this._patient?.branch_code || null;
      checked.forEach(cb => {
        const r = pending[parseInt(cb.dataset.idx)];
        if (!r || this._cart.some(c => String(c.rx_number) === r.rxNumber)) return;
        const desc = r.qty ? `${r.drug} [Qty:${r.qty}]` : r.drug;
        this._cart.push({
          item_type:      'RX',
          rx_number:      r.rxNumber,
          branch_code:    branchCode,
          din:            r.din,
          description:    desc,
          quantity:       1,
          unit_price:     r.copay,
          gst_applicable: false,
          pst_applicable: false,
          line_total:     Tax.round2(r.copay),
        });
      });

      this._updateDisplay();
      this._setStatus('success', `Added ${checked.length} prescription${checked.length > 1 ? 's' : ''} to cart`);
      close();
    });
  }

  /* ---- Quick Customer Search / Create Modal ---- */
  _showQuickCustomerModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:480px;">
        <div class="modal-header">
          <h3>&#128269; Link Customer</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="padding-bottom:0;">
          <div class="form-group" style="margin-bottom:10px;">
            <input type="text" id="qc-search" placeholder="Search by name, phone, or Customer ID…"
                   autocomplete="off" style="font-size:15px;" />
          </div>
          <div id="qc-results" style="min-height:48px;max-height:200px;overflow-y:auto;
               margin-bottom:12px;border:1px solid var(--border);border-radius:var(--radius);padding:4px;"></div>

          <details style="margin-bottom:0;">
            <summary style="cursor:pointer;font-size:13px;color:var(--primary);padding:8px 0;
                            border-top:1px solid var(--border);outline:none;">
              &#43; Create new customer profile
            </summary>
            <div style="padding:12px 0 4px;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                <input type="text" id="qc-given"   placeholder="First name *" />
                <input type="text" id="qc-surname" placeholder="Last name *" />
              </div>
              <input type="tel" id="qc-phone" placeholder="Phone number"
                     style="width:100%;box-sizing:border-box;margin-bottom:8px;" />
              <input type="text" id="qc-cid"
                     placeholder="Customer ID (optional — phone or auto-generated if blank)"
                     style="width:100%;box-sizing:border-box;" />
              <div id="qc-error" class="alert alert-danger" style="display:none;margin-top:8px;"></div>
            </div>
          </details>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <button class="btn btn-outline" id="qc-cancel">Cancel</button>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-outline btn-sm" id="qc-full-screen">Full Profile Screen</button>
            <button class="btn btn-success" id="qc-create">Create &amp; Link</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#qc-cancel').addEventListener('click', close);
    modal.querySelector('#qc-full-screen').addEventListener('click', () => {
      close();
      this._onNavigate('patient', { returnToPos: true });
    });

    const resultsEl   = modal.querySelector('#qc-results');
    const searchInput = modal.querySelector('#qc-search');

    const renderResults = patients => {
      if (patients.length === 0) {
        resultsEl.innerHTML = '<div style="padding:8px 10px;color:var(--text-muted);font-size:13px;">No matches.</div>';
        return;
      }
      resultsEl.innerHTML = patients.slice(0, 8).map((p, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:7px 10px;border-radius:4px;cursor:default;" class="qc-result-item" data-idx="${i}">
          <div>
            <strong style="font-size:13px;">${p.given_name} ${p.surname}</strong>
            <div style="font-size:11px;color:var(--text-muted);">
              ${p.phn}${p.phone ? ` &bull; ${p.phone}` : ''}${p.dob ? ` &bull; DOB: ${p.dob}` : ''}
            </div>
          </div>
          <button class="btn btn-primary btn-sm" data-idx="${i}" style="font-size:12px;">Link</button>
        </div>`).join('');

      resultsEl.querySelectorAll('.btn[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          this._patient = patients[parseInt(btn.dataset.idx)];
          this._updatePatientBar();
          close();
        });
      });
      // Hover highlight
      resultsEl.querySelectorAll('.qc-result-item').forEach(item => {
        item.addEventListener('mouseenter', () => item.style.background = 'var(--surface2)');
        item.addEventListener('mouseleave', () => item.style.background = '');
      });
    };

    resultsEl.innerHTML = '<div style="padding:8px 10px;color:var(--text-muted);font-size:13px;">Type to search…</div>';

    searchInput.addEventListener('input', () => {
      const term = searchInput.value.trim();
      if (!term) {
        resultsEl.innerHTML = '<div style="padding:8px 10px;color:var(--text-muted);font-size:13px;">Type to search…</div>';
        return;
      }
      renderResults(DB.searchPatients(term));
    });

    modal.querySelector('#qc-create').addEventListener('click', () => {
      const given   = modal.querySelector('#qc-given').value.trim();
      const surname = modal.querySelector('#qc-surname').value.trim();
      const phone   = modal.querySelector('#qc-phone').value.trim().replace(/\D/g, '');
      const cid     = modal.querySelector('#qc-cid').value.trim();
      const errEl   = modal.querySelector('#qc-error');

      if (!given || !surname) {
        errEl.style.display = 'block';
        errEl.textContent   = 'First name and last name are required.';
        return;
      }

      // Generate a unique Customer ID if not provided
      const customerId = cid || (phone ? phone : `CUST-${Date.now().toString(36).toUpperCase()}`);

      if (DB.getPatientByPhn(customerId)) {
        errEl.style.display = 'block';
        errEl.textContent   = `A profile with ID "${customerId}" already exists. Search for them above.`;
        return;
      }

      DB.upsertPatient({ phn: customerId, given_name: given, surname, phone: phone || null });
      this._patient = DB.getPatientByPhn(customerId);
      this._updatePatientBar();
      Audit.configChange(`Quick customer created: ${given} ${surname} (${customerId})`);
      close();
    });

    setTimeout(() => searchInput.focus(), 60);
  }

  _setStatus(type, msg) {
    const el = this._el.querySelector('#scan-status');
    if (!el) return;
    el.className = 'scan-status' + (type ? ` ${type}` : '');
    el.textContent = msg;
  }

  /* ---- Payment Modal ---- */
  /* Canadian nickel rounding: round to nearest $0.05 */
  _cashRound(amount) {
    return Math.round(amount * 20) / 20;
  }

  _showPaymentModal() {
    if (this._cart.length === 0) return;
    const shift = DB.getActiveShift();
    if (!shift) {
      if (!confirm('No shift is currently open.\n\nOpen a shift first for proper cash tracking.\nProceed anyway?')) return;
    }
    const totals = Tax.calcCartTotals(this._cart);
    const exact  = totals.total_amount;

    /* ── $0 pick-up: no payment needed — record immediately and go
       straight to the Pick Up Confirmation (RPh) modal.             */
    if (exact === 0) {
      this._saveTransactionMulti([{ method: 'NO_CHARGE', amount: 0 }], totals).then(saved => {
        const savedPatient = this._patient;
        this.newTransaction();
        if (savedPatient?.phn) {
          this._showRphSignatureModal(saved.txn, saved.items, saved.payments, savedPatient);
        }
      }).catch(e => alert('Error saving transaction: ' + e.message));
      return;
    }

    // Payment lines: [{method, amount, tendered, notes, cloverPaymentId}]
    const lines = [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:460px;">
        <div class="modal-header">
          <h3>Payment</h3>
          <button class="modal-close" id="pm-close">&times;</button>
        </div>
        <div class="modal-body">

          <!-- Totals bar -->
          <div style="background:var(--surface2);border-radius:var(--radius);padding:12px 16px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="font-size:13px;color:var(--text-muted);">Total Due</span>
              <span style="font-weight:700;font-size:16px;">${Tax.fmt(exact)}</span>
            </div>
            <div id="pm-rounded-row" style="display:none;justify-content:space-between;margin-bottom:3px;">
              <span style="font-size:12px;color:var(--text-muted);">Rounded (cash)</span>
              <span id="pm-rounded-amt" style="font-size:13px;font-weight:600;color:var(--primary);"></span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="font-size:13px;color:var(--text-muted);">Paid</span>
              <span id="pm-paid" style="font-weight:600;font-size:14px;color:var(--success);">${Tax.fmt(0)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding-top:6px;margin-top:3px;border-top:1px solid var(--border);">
              <span style="font-size:13px;font-weight:600;">Remaining</span>
              <span id="pm-remaining" style="font-weight:700;font-size:18px;color:var(--danger);">${Tax.fmt(exact)}</span>
            </div>
          </div>

          <!-- Payment lines -->
          <div id="pm-lines"></div>

          <!-- Add payment section -->
          <div id="pm-add">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);
                        letter-spacing:.04em;margin-bottom:8px;">Add Payment</div>
            <div class="payment-method-grid">
              ${['Cash','Debit','Credit','Insurance'].map(m =>
                `<button class="payment-method-btn" data-method="${m.toUpperCase()}">${m}</button>`
              ).join('')}
              <button class="payment-method-btn" data-method="MANUAL_ENTRY"
                      style="grid-column:1/-1;font-size:12px;"
                      title="Card not present — staff enters card number on Clover device">
                Manual Card Entry (Card Not Present)
              </button>
            </div>

            <!-- Amount entry (shown after method selected) -->
            <div id="pm-entry" style="display:none;margin-top:10px;">
              <div class="form-group" style="margin-bottom:8px;">
                <label id="pm-amt-label">Amount</label>
                <input type="number" id="pm-amount" step="0.01" min="0" style="font-size:16px;" />
              </div>

              <!-- Cash extras -->
              <div id="pm-cash-extras" style="display:none;">
                <div class="form-group" style="margin-bottom:8px;">
                  <label>Amount Tendered</label>
                  <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">
                    ${[5,10,20,50,100].map(d =>
                      `<button class="btn btn-outline btn-sm pm-quick" data-val="${d}" style="padding:4px 10px;">$${d}</button>`
                    ).join('')}
                  </div>
                  <input type="number" id="pm-tendered" step="0.01" min="0"
                         placeholder="Tendered amount" style="font-size:15px;" />
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;
                            background:var(--surface2);border-radius:var(--radius);padding:10px 14px;margin-bottom:8px;">
                  <span style="font-size:14px;font-weight:600;">Change Due</span>
                  <span id="pm-change" style="font-size:22px;font-weight:800;color:var(--success);">—</span>
                </div>
              </div>

              <!-- Clover hint -->
              <div id="pm-clover-hint" class="alert alert-info"
                   style="display:none;font-size:13px;margin-bottom:8px;">
                Tap <strong>Add &amp; Send to Clover</strong> to charge this amount on the terminal.
              </div>

              <div style="display:flex;gap:8px;">
                <button class="btn btn-primary" id="pm-add-btn" style="flex:1;">Add Payment</button>
                <button class="btn btn-outline" id="pm-entry-cancel">Cancel</button>
              </div>
            </div>
          </div>

          <div id="pm-error" class="alert alert-danger" style="display:none;margin-top:10px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="pm-cancel">Cancel</button>
          <button class="btn btn-success btn-lg" id="pm-confirm" disabled style="min-width:160px;">
            Complete Payment
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    /* ── Helpers ──────────────────────────────────────────────── */
    const close = () => { if (modal.parentNode) document.body.removeChild(modal); };

    const getPaid      = () => Tax.round2(lines.reduce((s, l) => s + l.amount, 0));
    const getRemaining = () => Math.max(0, Tax.round2(exact - getPaid()));

    const updateTotals = () => {
      const paid      = getPaid();
      const remaining = getRemaining();
      const hasCash   = lines.some(l => l.method === 'CASH');

      modal.querySelector('#pm-paid').textContent      = Tax.fmt(paid);
      modal.querySelector('#pm-remaining').textContent = Tax.fmt(remaining);
      modal.querySelector('#pm-remaining').style.color = remaining <= 0.005
        ? 'var(--success)' : 'var(--danger)';

      // Show rounded total when any cash line present and rounding differs
      const rounded = this._cashRound(exact);
      if (hasCash && Math.abs(rounded - exact) > 0.001) {
        modal.querySelector('#pm-rounded-row').style.display    = 'flex';
        modal.querySelector('#pm-rounded-amt').textContent = Tax.fmt(rounded);
      }

      // Render lines
      const linesEl = modal.querySelector('#pm-lines');
      if (!lines.length) { linesEl.innerHTML = ''; }
      else {
        linesEl.innerHTML = `
          <div style="border:1px solid var(--border);border-radius:var(--radius);
                      overflow:hidden;margin-bottom:12px;">
            ${lines.map((l, i) => `
              <div style="display:flex;justify-content:space-between;align-items:center;
                          padding:8px 12px;${i ? 'border-top:1px solid var(--border)' : ''}">
                <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                  <span class="badge badge-${l.method==='CASH'?'success':'primary'}"
                        style="font-size:11px;">${l.method}</span>
                  ${l.tendered && l.tendered > l.amount
                    ? `<span style="font-size:12px;color:var(--text-muted);">
                         Tendered ${Tax.fmt(l.tendered)} · Change ${Tax.fmt(Tax.round2(l.tendered - l.amount))}
                       </span>` : ''}
                  ${l.notes ? `<span style="font-size:11px;color:var(--text-muted);">${l.notes}</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                  <span style="font-weight:700;">${Tax.fmt(l.amount)}</span>
                  <button class="pm-rm" data-i="${i}"
                    style="background:none;border:none;cursor:pointer;color:var(--danger);
                           font-size:16px;padding:0 2px;line-height:1;">&times;</button>
                </div>
              </div>`).join('')}
          </div>`;
        linesEl.querySelectorAll('.pm-rm').forEach(btn =>
          btn.addEventListener('click', () => {
            lines.splice(parseInt(btn.dataset.i), 1);
            resetEntry();
            updateTotals();
          })
        );
      }

      // Enable confirm when fully covered.
      // For cash-only transactions, $54.50 on a $54.52 bill is acceptable (nickel rounding).
      const allCash   = lines.length > 0 && lines.every(l => l.method === 'CASH');
      const threshold = allCash ? this._cashRound(exact) : exact;
      modal.querySelector('#pm-confirm').disabled = paid < threshold - 0.005;
    };

    const resetEntry = () => {
      selectedMethod = null;
      modal.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('selected'));
      modal.querySelector('#pm-entry').style.display       = 'none';
      modal.querySelector('#pm-cash-extras').style.display = 'none';
      modal.querySelector('#pm-clover-hint').style.display = 'none';
    };

    const updateChange = () => {
      const amount   = parseFloat(modal.querySelector('#pm-amount').value)   || 0;
      const tendered = parseFloat(modal.querySelector('#pm-tendered').value) || 0;
      const change   = Tax.round2(tendered - amount);
      const el       = modal.querySelector('#pm-change');
      if (!el) return;
      el.textContent = tendered > 0 ? (change >= 0 ? Tax.fmt(change) : '—') : '—';
      el.style.color = change >= 0 ? 'var(--success)' : 'var(--danger)';
    };

    let selectedMethod = null;

    /* ── Method selection ──────────────────────────────────────── */
    modal.querySelectorAll('.payment-method-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedMethod = btn.dataset.method;

        const isCash        = selectedMethod === 'CASH';
        const isClover      = selectedMethod === 'DEBIT' || selectedMethod === 'CREDIT';
        const isManualEntry = selectedMethod === 'MANUAL_ENTRY';
        const isCloverAny   = isClover || isManualEntry;
        const remaining = getRemaining();

        // Pre-fill amount: cash gets rounded remainder, card gets exact
        const suggest = isCash ? this._cashRound(remaining) : Tax.round2(remaining);
        modal.querySelector('#pm-amount').value = suggest.toFixed(2);
        modal.querySelector('#pm-amt-label').textContent =
          isCash ? 'Cash Amount (rounded to $0.05)' : 'Amount';

        modal.querySelector('#pm-entry').style.display       = 'block';
        modal.querySelector('#pm-cash-extras').style.display = isCash      ? 'block' : 'none';
        modal.querySelector('#pm-clover-hint').style.display = isCloverAny ? 'block' : 'none';
        modal.querySelector('#pm-clover-hint').textContent   = isManualEntry
          ? 'Card not present — staff will enter card number on the Clover device.'
          : 'Tap Add & Send to Clover to charge this amount on the terminal.';
        modal.querySelector('#pm-add-btn').textContent       =
          isCloverAny ? 'Add & Send to Clover' : 'Add Payment';

        if (isCash) {
          modal.querySelector('#pm-tendered').value = '';
          updateChange();
          setTimeout(() => modal.querySelector('#pm-tendered').focus(), 50);
        } else {
          setTimeout(() => modal.querySelector('#pm-amount').focus(), 50);
        }
      });
    });

    /* ── Quick tender buttons ────────────────────────────────── */
    modal.querySelectorAll('.pm-quick').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelector('#pm-tendered').value = btn.dataset.val;
        updateChange();
      });
    });
    modal.querySelector('#pm-tendered').addEventListener('input', updateChange);
    modal.querySelector('#pm-amount').addEventListener('input', () => {
      if (selectedMethod === 'CASH') updateChange();
    });

    /* ── Add payment line ────────────────────────────────────── */
    modal.querySelector('#pm-add-btn').addEventListener('click', async () => {
      const amount = parseFloat(modal.querySelector('#pm-amount').value) || 0;
      if (amount <= 0) return;
      const isCash        = selectedMethod === 'CASH';
      const isManualEntry = selectedMethod === 'MANUAL_ENTRY';
      const isCloverAny   = selectedMethod === 'DEBIT' || selectedMethod === 'CREDIT' || isManualEntry;
      const cardEntryMethods = isManualEntry ? 8 : 15;
      const recordMethod     = isManualEntry ? 'CREDIT' : selectedMethod;

      if (isCloverAny) {
        // Run Clover as second overlay; on success add line and come back
        await this._runCloverPayment(
          modal, { ...totals, total_amount: amount }, recordMethod, null,
          (result) => {
            lines.push({
              method:          recordMethod,
              amount:          result.amount != null ? result.amount / 100 : amount,
              tendered:        null,
              notes:           [
                isManualEntry ? 'Manual Entry' : null,
                result.cardType, result.last4 ? `****${result.last4}` : null,
              ].filter(Boolean).join(' ') || null,
              cloverPaymentId: result.paymentId || null,
            });
            resetEntry();
            updateTotals();
          },
          cardEntryMethods
        );
      } else {
        const tendered = isCash
          ? (parseFloat(modal.querySelector('#pm-tendered').value) || amount)
          : null;
        lines.push({
          method:          selectedMethod,
          amount:          Tax.round2(amount),
          tendered:        tendered,
          notes:           null,
          cloverPaymentId: null,
        });
        resetEntry();
        updateTotals();
      }
    });

    modal.querySelector('#pm-entry-cancel').addEventListener('click', resetEntry);
    modal.querySelector('#pm-close').addEventListener('click', close);
    modal.querySelector('#pm-cancel').addEventListener('click', close);

    /* ── Complete payment ────────────────────────────────────── */
    modal.querySelector('#pm-confirm').addEventListener('click', async () => {
      const errEl = modal.querySelector('#pm-error');
      if (!lines.length) {
        errEl.style.display = 'block'; errEl.textContent = 'Add at least one payment.'; return;
      }
      errEl.style.display = 'none';
      try {
        const saved = await this._saveTransactionMulti(lines, totals);
        const savedPatient = this._patient;
        close();
        this.newTransaction();
        if (savedPatient?.phn) {
          this._showRphSignatureModal(saved.txn, saved.items, saved.payments, savedPatient);
        }
      } catch(e) {
        errEl.style.display = 'block'; errEl.textContent = 'Error: ' + e.message;
      }
    });

    updateTotals();
  }

  /* _runCloverPayment — handles Clover terminal payment.
     In split-payment mode (onSuccess callback provided): opens a second overlay,
     calls onSuccess(result) when approved, and returns control to the payment modal.
     In single-payment mode (no callback): takes over the whole modal and closes on success. */
  async _runCloverPayment(modal, totals, method, close, onSuccess = null, cardEntryMethods = 15) {
    const configured = await CloverAPI.isConfigured();
    const errTarget  = modal.querySelector('#pm-error') || modal.querySelector('#payment-error');

    if (!configured) {
      if (errTarget) {
        errTarget.style.display = 'block';
        errTarget.textContent   = 'Clover Local Pay not configured. Go to Settings → API Credentials → Clover.';
      }
      return;
    }

    const externalId  = Date.now().toString(36);
    const isSplitMode = typeof onSuccess === 'function';

    if (isSplitMode) {
      /* ── Split mode: second overlay on top of payment modal ── */
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.cssText = 'background:rgba(0,0,0,.6);z-index:10001;';
      overlay.innerHTML = `
        <div class="modal" style="max-width:340px;text-align:center;">
          <div class="modal-body" style="padding:28px 20px;">
            <div style="font-size:44px;margin-bottom:10px;">&#128179;</div>
            <div style="font-size:22px;font-weight:700;margin-bottom:4px;">${Tax.fmt(totals.total_amount)}</div>
            <div id="cv-msg" style="font-size:14px;color:var(--text-muted);margin-bottom:18px;">Sending to terminal…</div>
            <div id="cv-spinner"><span class="spinner"></span></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline btn-danger" id="cv-cancel">Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const setMsg    = msg => { const el = overlay.querySelector('#cv-msg'); if (el) el.textContent = msg; };
      const closeOver = ()  => { if (overlay.parentNode) document.body.removeChild(overlay); };
      const controller = new AbortController();

      overlay.querySelector('#cv-cancel').addEventListener('click', async () => {
        overlay.querySelector('#cv-cancel').disabled = true;
        setMsg('Cancelling…');
        controller.abort();
        await CloverAPI.cancel().catch(() => {});
        closeOver();
      });

      try {
        setMsg('Showing order on terminal…');
        await CloverAPI.displayOrder(this._cart, totals, externalId).catch(() => {});
        setMsg(cardEntryMethods === 8
          ? 'Enter card number on the Clover device…'
          : 'Waiting for customer — tap, insert, or swipe…');
        const result = await CloverAPI.sale(Math.round(totals.total_amount * 100), externalId, controller.signal, cardEntryMethods);

        if (result.ok) {
          overlay.querySelector('#cv-spinner').innerHTML =
            '<span style="font-size:36px;color:var(--success);">&#10003;</span>';
          setMsg('Payment approved!');
          setTimeout(() => { closeOver(); onSuccess(result); }, 900);
        } else {
          const code = result.code || '';
          setMsg(code === 'PAYMENT_CANCELLED' ? 'Cancelled on terminal.' : `Not completed: ${result.message || code}`);
          overlay.querySelector('#cv-spinner').innerHTML =
            '<span style="font-size:28px;color:var(--warning);">&#9888;</span>';
          overlay.querySelector('#cv-cancel').textContent = 'Close';
          overlay.querySelector('#cv-cancel').disabled = false;
          overlay.querySelector('#cv-cancel').onclick = closeOver;
        }
      } catch(e) {
        if (e.name === 'AbortError') return;
        setMsg('Clover error: ' + e.message);
        overlay.querySelector('#cv-spinner').innerHTML = '';
        overlay.querySelector('#cv-cancel').textContent = 'Close';
        overlay.querySelector('#cv-cancel').disabled = false;
        overlay.querySelector('#cv-cancel').onclick = closeOver;
      }

    } else {
      /* ── Single-payment mode: take over the modal ─────────── */
      modal.querySelector('#payment-modal-body').innerHTML = `
        <div style="text-align:center;padding:24px 16px;">
          <div style="font-size:48px;margin-bottom:12px;">&#128179;</div>
          <div style="font-size:22px;font-weight:700;margin-bottom:6px;">${Tax.fmt(totals.total_amount)}</div>
          <div id="clover-status-msg" style="font-size:15px;color:var(--text-muted);margin-bottom:20px;">
            Sending to terminal…
          </div>
          <div id="clover-spinner"><span class="spinner"></span></div>
        </div>`;
      modal.querySelector('#payment-modal-footer').innerHTML =
        '<button class="btn btn-outline btn-danger" id="clover-cancel-btn">Cancel</button>';

      const setMsg     = msg => { const el = modal.querySelector('#clover-status-msg'); if (el) el.textContent = msg; };
      const controller = new AbortController();

      modal.querySelector('#clover-cancel-btn').addEventListener('click', async () => {
        modal.querySelector('#clover-cancel-btn').disabled = true;
        setMsg('Cancelling…');
        controller.abort();
        await CloverAPI.cancel().catch(() => {});
        close();
      });

      try {
        setMsg('Showing order on terminal…');
        await CloverAPI.displayOrder(this._cart, totals, externalId).catch(() => {});
        setMsg(cardEntryMethods === 8
          ? 'Enter card number on the Clover device…'
          : 'Waiting for customer — tap, insert, or swipe…');
        const result = await CloverAPI.sale(Math.round(totals.total_amount * 100), externalId, controller.signal, cardEntryMethods);

        if (result.ok) {
          setMsg('Payment approved!');
          modal.querySelector('#clover-spinner').innerHTML =
            '<span style="font-size:36px;color:var(--success);">&#10003;</span>';
          const notes = [result.cardType, result.last4 ? `****${result.last4}` : null].filter(Boolean).join(' ') || null;
          const saved = await this._saveTransactionMulti([{
            method:          method,
            amount:          result.amount != null ? result.amount / 100 : totals.total_amount,
            tendered:        null,
            notes,
            cloverPaymentId: result.paymentId || null,
          }], totals);
          const savedPatient = this._patient;
          setTimeout(() => {
            close();
            this.newTransaction();
            if (savedPatient?.phn) {
              this._showRphSignatureModal(saved.txn, saved.items, saved.payments, savedPatient);
            }
          }, 1200);

        } else {
          const code = result.code || '';
          modal.querySelector('#payment-modal-body').innerHTML = `
            <div class="alert alert-warning" style="margin:16px;">
              ${code === 'PAYMENT_CANCELLED' ? 'Payment was cancelled on the terminal.'
                                             : `Payment not completed: ${result.message || code}`}
            </div>`;
          modal.querySelector('#payment-modal-footer').innerHTML =
            '<button class="btn btn-outline" id="clover-back">Close</button>';
          modal.querySelector('#clover-back').addEventListener('click', close);
        }
      } catch(e) {
        if (e.name === 'AbortError') return;
        modal.querySelector('#payment-modal-body').innerHTML = `
          <div class="alert alert-danger" style="margin:16px;">
            <strong>Clover error:</strong> ${e.message}
          </div>`;
        modal.querySelector('#payment-modal-footer').innerHTML =
          '<button class="btn btn-outline" id="clover-back">Close</button>';
        modal.querySelector('#clover-back').addEventListener('click', close);
      }
    }
  }

  /* Save a transaction with one or more payment lines.
     paymentLines: [{method, amount, tendered, notes, cloverPaymentId}] */
  async _saveTransactionMulti(paymentLines, totals) {
    const now      = localISOStr();
    const txnType  = this._cart.some(i => i.item_type === 'RX')
      ? (this._cart.some(i => i.item_type !== 'RX') ? 'MIXED' : 'RX')
      : 'OTC';
    const amountPaid   = Tax.round2(paymentLines.reduce((s, p) => s + p.amount, 0));
    const balanceOwing = Tax.round2(totals.total_amount - amountPaid);
    const status       = balanceOwing <= 0.005 ? 'PAID' : (amountPaid > 0 ? 'PARTIAL' : 'PENDING');
    const methodsStr   = [...new Set(paymentLines.map(p => p.method))].join('+');

    const txnId = DB.createTransaction({
      patient_id:       this._patient?.patient_id || null,
      transaction_date: now,
      transaction_type: txnType,
      status,
      subtotal:         totals.subtotal,
      gst_amount:       totals.gst_amount,
      pst_amount:       totals.pst_amount,
      total_amount:     totals.total_amount,
      amount_paid:      amountPaid,
      balance_owing:    Math.max(0, balanceOwing),
      staff_pin:        Auth.current()?.name || null,
      notes:            paymentLines.map(p => p.notes).filter(Boolean).join('; ') || null,
      clover_order_id:  paymentLines.find(p => p.cloverPaymentId)?.cloverPaymentId || null,
    });

    for (const item of this._cart) {
      DB.addTransactionItem({ ...item, transaction_id: txnId });
    }

    for (const pay of paymentLines) {
      if (pay.amount > 0) {
        DB.addPayment({
          transaction_id:   txnId,
          payment_date:     now,
          amount:           pay.amount,
          method:           pay.method,
          clover_payment_id: pay.cloverPaymentId || null,
          staff_pin:        Auth.current()?.name || null,
          notes:            pay.notes || null,
        });
      }
    }

    Audit.sale(txnId, `${txnType} sale ${Tax.fmt(totals.total_amount)} via ${methodsStr}`);

    const txn      = DB.getTransaction(txnId);
    const items    = DB.getItemsForTransaction(txnId);
    const payments = DB.getPaymentsForTransaction(txnId);
    Print.printReceipt(txn, items, payments, this._patient);

    return { txnId, txn, items, payments };
  }

  async _saveTransaction(method, amountPaid, notes, totals, cloverOrderId = null, cloverPaymentId = null) {
    const now        = localISOStr();
    const txnType    = this._cart.some(i => i.item_type === 'RX')
      ? (this._cart.some(i => i.item_type !== 'RX') ? 'MIXED' : 'RX')
      : 'OTC';
    const balanceOwing = Tax.round2(totals.total_amount - amountPaid);
    const status       = balanceOwing <= 0 ? 'PAID' : (amountPaid > 0 ? 'PARTIAL' : 'PENDING');

    const txnId = DB.createTransaction({
      patient_id:       this._patient?.patient_id || null,
      transaction_date: now,
      transaction_type: txnType,
      status,
      subtotal:         totals.subtotal,
      gst_amount:       totals.gst_amount,
      pst_amount:       totals.pst_amount,
      total_amount:     totals.total_amount,
      amount_paid:      amountPaid,
      balance_owing:    Math.max(0, balanceOwing),
      staff_pin:        Auth.current()?.name || null,
      notes:            notes || null,
      clover_order_id:  cloverOrderId,
    });

    for (const item of this._cart) {
      DB.addTransactionItem({ ...item, transaction_id: txnId });
    }

    if (amountPaid > 0) {
      DB.addPayment({
        transaction_id:   txnId,
        payment_date:     now,
        amount:           amountPaid,
        method,
        clover_payment_id: cloverPaymentId,
        staff_pin:        Auth.current()?.name || null,
        notes:            notes || null,
      });
    }

    Audit.sale(txnId, `${txnType} sale ${Tax.fmt(totals.total_amount)} via ${method}${cloverOrderId ? ` (Clover ${cloverOrderId})` : ''}`);

    const txn      = DB.getTransaction(txnId);
    const items    = DB.getItemsForTransaction(txnId);
    const payments = DB.getPaymentsForTransaction(txnId);
    Print.printReceipt(txn, items, payments, this._patient);

    if (this._patient?.phn) {
      Print.generateReceiptBase64(txn, items, payments, this._patient).then(result => {
        if (result?.base64) {
          PharmacyDashboardAPI.saveDocument(this._patient.phn, result.base64, 'RCPT', Auth.current()?.name);
        }
      });
    }

    return txnId;
  }

  /* ---- Manual Entry Modals ---- */
  _offerManualEntry(barcode) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Barcode Not Found</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p class="text-muted mb-3">Barcode <strong>${barcode}</strong> not found in catalog.</p>
          <div class="form-group">
            <label>Description</label>
            <input type="text" id="me-desc" placeholder="Product name" />
          </div>
          <div class="form-group">
            <label>Price</label>
            <input type="number" id="me-price" step="0.01" min="0" placeholder="0.00" />
          </div>
          <div class="form-group" style="display:flex;gap:16px;align-items:center;">
            <label style="margin:0;display:flex;gap:6px;align-items:center;">
              <input type="checkbox" id="me-gst" checked /> GST
            </label>
            <label style="margin:0;display:flex;gap:6px;align-items:center;">
              <input type="checkbox" id="me-pst" /> PST
            </label>
          </div>
          <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:8px;">
            <input type="checkbox" id="me-save" checked />
            Save as custom product for future scans
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="me-cancel">Cancel</button>
          <button class="btn btn-primary" id="me-add">Add to Cart</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => document.body.removeChild(modal);
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#me-cancel').addEventListener('click', close);
    modal.querySelector('#me-add').addEventListener('click', () => {
      const desc  = modal.querySelector('#me-desc').value.trim();
      const price = parseFloat(modal.querySelector('#me-price').value) || 0;
      const gst   = modal.querySelector('#me-gst').checked;
      const pst   = modal.querySelector('#me-pst').checked;
      const save  = modal.querySelector('#me-save').checked;
      if (!desc) { modal.querySelector('#me-desc').focus(); return; }
      if (save) {
        DB.saveCustomProduct({ description: desc, upc: barcode, price, gst_applicable: gst, pst_applicable: pst, created_by: Auth.current()?.pin });
      }
      this._cart.push({ item_type:'CUSTOM', upc: barcode, description: desc, quantity:1, unit_price: price, gst_applicable: gst, pst_applicable: pst, line_total: price });
      this._updateDisplay();
      this._setStatus('success', `Added: ${desc}`);
      close();
    });
    modal.querySelector('#me-desc').focus();
  }

  /* Positec Old barcode scanned — price extracted automatically, just need drug name */
  _showPositecRxModal(rxRef, price, rawBarcode) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Rx Scanned</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p class="text-muted" style="font-size:12px;margin-bottom:14px;">
            Price read from barcode: <strong style="font-size:16px;color:var(--success);">$${price.toFixed(2)}</strong><br>
            <span style="color:#999;">Ref: ${rawBarcode}</span>
          </p>
          <div class="form-group">
            <label>Drug Name / Description <span style="color:var(--danger);">*</span></label>
            <input type="text" id="pos-rxname"
                   value="RX NO TAX"
                   placeholder="e.g. Metformin 500mg #90"
                   style="font-size:15px;" />
          </div>
          <div class="form-group">
            <label>Qty</label>
            <input type="number" id="pos-rxqty" value="1" min="1" step="1" style="width:80px;" />
          </div>
          <div class="form-group">
            <label>Copay ($)</label>
            <input type="number" id="pos-rxprice" value="${price.toFixed(2)}"
                   step="0.01" min="0" style="width:120px;" />
            <span class="text-muted" style="font-size:12px;margin-left:8px;">
              (edit if label differs)
            </span>
          </div>
          <div id="pos-rxerr" class="alert alert-danger" style="display:none;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="pos-rxcancel">Cancel</button>
          <button class="btn btn-primary" id="pos-rxadd">&#43; Add to Cart</button>
        </div>
      </div>`;

    const close = () => { modal.remove(); setTimeout(() => this._el?.querySelector('#scan-input')?.focus(), 50); };
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#pos-rxcancel').addEventListener('click', close);

    modal.querySelector('#pos-rxadd').addEventListener('click', () => {
      const desc  = modal.querySelector('#pos-rxname').value.trim();
      const qty   = parseInt(modal.querySelector('#pos-rxqty').value)   || 1;
      const copay = parseFloat(modal.querySelector('#pos-rxprice').value) || 0;
      const err   = modal.querySelector('#pos-rxerr');

      if (!desc) {
        err.style.display = 'block';
        err.textContent   = 'Enter the drug name from the prescription label.';
        modal.querySelector('#pos-rxname').focus();
        return;
      }

      this._cart.push({
        item_type:      'RX',
        rx_number:      rxRef,
        branch_code:    null,
        din:            null,
        description:    desc,
        quantity:       qty,
        unit_price:     copay,
        gst_applicable: false,
        pst_applicable: false,
        line_total:     Tax.round2(copay * qty),
      });
      this._setStatus('success', `Added Rx: ${desc} — $${copay.toFixed(2)}`);
      this._updateDisplay();
      close();
    });

    document.body.appendChild(modal);
    setTimeout(() => {
      const inp = modal.querySelector('#pos-rxname');
      inp.focus();
      inp.select(); // select all so staff can type over it instantly
    }, 100);
  }

  _showManualOTCModal() {
    this._offerManualEntry('');
  }

  _showManualRxModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Manual Rx Entry</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="input-group mb-3">
            <div class="form-group flex-1" style="margin:0;">
              <label>Rx Number</label>
              <input type="text" id="mrx-num" placeholder="e.g. 53817" />
            </div>
            <div class="form-group" style="margin:0;width:100px;">
              <label>Branch</label>
              <input type="text" id="mrx-br" placeholder="A" maxlength="2" />
            </div>
          </div>
          <div id="mrx-error" class="alert alert-danger" style="display:none;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="mrx-cancel">Cancel</button>
          <button class="btn btn-primary" id="mrx-lookup">Look Up Rx</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close  = () => document.body.removeChild(modal);
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#mrx-cancel').addEventListener('click', close);
    modal.querySelector('#mrx-lookup').addEventListener('click', async () => {
      const num = modal.querySelector('#mrx-num').value.trim();
      const br  = modal.querySelector('#mrx-br').value.trim() || await Config.get('branch_code') || 'A';
      const err = modal.querySelector('#mrx-error');
      if (!num) { err.style.display='block'; err.textContent='Enter Rx number.'; return; }
      err.style.display = 'none';
      modal.querySelector('#mrx-lookup').disabled = true;
      try {
        await this._addRxItem(num, br, num);
        close();
      } catch(e) {
        err.style.display = 'block';
        err.textContent = e.message;
        modal.querySelector('#mrx-lookup').disabled = false;
      }
    });
    modal.querySelector('#mrx-num').focus();
  }

  _showCustomProductsModal() {
    const products = DB.getAllCustomProducts();
    const modal    = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h3>Custom Products</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="padding:0;">
          ${products.length === 0
            ? '<p class="text-muted" style="padding:20px;">No custom products saved yet.</p>'
            : `<table class="table">
                <thead><tr><th>Description</th><th>Price</th><th>Tax</th><th></th></tr></thead>
                <tbody>
                  ${products.map(p => `
                    <tr>
                      <td>${p.description}</td>
                      <td>${Tax.fmt(p.price)}</td>
                      <td>${p.gst_applicable?'GST ':''}${p.pst_applicable?'PST':''}</td>
                      <td>
                        <button class="btn btn-sm btn-primary" data-id="${p.custom_product_id}">Add</button>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>`}
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="cp-close">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => document.body.removeChild(modal);
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#cp-close').addEventListener('click', close);
    modal.querySelectorAll('[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = products.find(x => x.custom_product_id === parseInt(btn.dataset.id));
        if (p) { this._addOTCItem(p, p.upc || ''); close(); }
      });
    });
  }

  _confirmClearCart() {
    if (this._cart.length === 0) return;
    if (confirm('Clear all items from cart?')) {
      this._cart = [];
      this._updateDisplay();
    }
  }

  _showHistoryModal() {
    const today = localDateStr();
    const isBcrypt = s => typeof s === 'string' && s.startsWith('$2');
    const fmtStaff = s => (s && !isBcrypt(s)) ? s : '—';
    let lastRxSearch = null; // track current view mode for refresh

    document.querySelector('.hist-modal')?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay hist-modal';
    modal.innerHTML = `
      <div class="modal" style="max-width:800px;width:96%;">
        <div class="modal-header">
          <h3>Transaction History</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="padding:12px 16px 0;">
          <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;flex-wrap:wrap;">
            <input type="text" id="hist-rx-search"
                   placeholder="&#128269; Search by Rx number and press Enter…"
                   style="flex:1;min-width:160px;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius);
                          font-size:13px;background:var(--surface2);color:var(--text);outline:none;" />
            <button class="btn btn-primary btn-sm" id="hist-rx-btn">Search Rx</button>
            <span style="border-left:1px solid var(--border);height:24px;margin:0 2px;"></span>
            <input type="date" id="hist-date" value="${today}"
                   style="padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius);
                          font-size:13px;background:var(--surface2);color:var(--text);outline:none;cursor:pointer;" />
            <button class="btn btn-outline btn-sm" id="hist-today-btn">Today</button>
          </div>
          <div id="hist-results" style="max-height:62vh;overflow-y:auto;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="hist-close">Close</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#hist-close').addEventListener('click', close);
    const resultsEl = modal.querySelector('#hist-results');

    /* ── attach row-level events after each render ── */
    const attachEvents = () => {
      resultsEl.querySelectorAll('[data-action="view"]').forEach(btn => {
        btn.addEventListener('click', () => {
          close();
          this._onNavigate('transaction', { transactionId: parseInt(btn.dataset.txnid) });
        });
      });
      resultsEl.querySelectorAll('[data-action="void"]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!Auth.isAdmin()) { alert('Only admins can void transactions.'); return; }
          const txnId = parseInt(btn.dataset.txnid);
          if (!confirm(`Void transaction #${txnId}? This cannot be undone.`)) return;
          DB.reverseTransaction(txnId);
          Audit.refund(txnId, `Transaction voided by ${Auth.current()?.name}`);
          refresh();
        });
      });
      resultsEl.querySelectorAll('[data-action="link-patient"]').forEach(btn => {
        btn.addEventListener('click', () => {
          this._showLinkPatientModal(parseInt(btn.dataset.txnid), () => refresh());
        });
      });
    };

    const refresh = () => {
      if (lastRxSearch) { renderRxResults(lastRxSearch); return; }
      const pickedDate = modal.querySelector('#hist-date')?.value || today;
      renderDateTable(pickedDate);
    };

    /* ── patient cell helper ── */
    const patientCell = (t) => {
      if (t.given_name && t.surname) {
        return `<span style="font-size:12px;line-height:1.4;">${t.given_name} ${t.surname}
                  <br><span class="text-muted">${t.phn || ''}</span></span>`;
      }
      return `<button class="btn btn-sm btn-outline" data-action="link-patient"
                data-txnid="${t.transaction_id}"
                style="font-size:11px;padding:2px 8px;white-space:nowrap;">
                &#128100; Link Patient
              </button>`;
    };

    /* ── Transactions for a given date ── */
    const renderDateTable = (dateStr) => {
      lastRxSearch = null;
      const txns = DB.getTransactionsForDate(dateStr);
      const dayTotal = txns.reduce((s, t) => s + (t.status !== 'REVERSED' ? t.total_amount : 0), 0);
      const isToday = dateStr === today;

      // Parse date for display without timezone shift
      const [yr, mo, dy] = dateStr.split('-').map(Number);
      const displayDate = new Date(yr, mo - 1, dy).toLocaleDateString(navigator.language,
        { weekday:'long', year:'numeric', month:'long', day:'numeric' });

      if (txns.length === 0) {
        resultsEl.innerHTML = `<p class="text-muted" style="padding:20px;">
          No transactions on ${displayDate}.</p>`;
        return;
      }

      resultsEl.innerHTML = `
        <div class="text-muted" style="font-size:12px;padding:2px 0 8px;">
          ${displayDate} &mdash; ${txns.length} transaction${txns.length !== 1 ? 's' : ''}
        </div>
        <table class="table" style="font-size:13px;">
          <thead>
            <tr>
              <th>Txn #</th><th>Time</th><th>Type</th><th>Status</th>
              <th>Patient</th><th>Staff</th>
              <th class="text-right">Total</th><th style="text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${txns.map(t => {
              const time = new Date(t.transaction_date).toLocaleTimeString(navigator.language, { hour:'2-digit', minute:'2-digit' });
              const sc = t.status === 'PAID' ? 'success' : t.status === 'REVERSED' ? 'danger' : 'warning';
              const canVoid = isToday && t.status !== 'REVERSED';
              return `<tr style="${t.status === 'REVERSED' ? 'opacity:0.5;text-decoration:line-through;' : ''}">
                <td>#${t.transaction_id}</td>
                <td>${time}</td>
                <td>${t.transaction_type}</td>
                <td><span class="badge badge-${sc}" style="font-size:11px;">${t.status === 'REVERSED' ? 'VOIDED' : t.status}</span></td>
                <td>${patientCell(t)}</td>
                <td>${fmtStaff(t.staff_pin)}</td>
                <td class="text-right">${Tax.fmt(t.total_amount)}</td>
                <td style="text-align:center;white-space:nowrap;">
                  <button class="btn btn-sm btn-outline" data-action="view" data-txnid="${t.transaction_id}" style="margin-right:4px;">View</button>
                  ${canVoid ? `<button class="btn btn-sm btn-danger" data-action="void" data-txnid="${t.transaction_id}">Void</button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:600;border-top:2px solid var(--border);">
              <td colspan="6" class="text-right" style="padding:8px 12px;">Day Total (excl. voided)</td>
              <td class="text-right" style="padding:8px 12px;">${Tax.fmt(dayTotal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>`;

      attachEvents();
    };

    const renderTodayTable = () => {
      modal.querySelector('#hist-date').value = today;
      renderDateTable(today);
    };

    /* ── Rx search results ── */
    const renderRxResults = (rxNum) => {
      lastRxSearch = rxNum;
      const txns = DB.searchTransactionsByRx(rxNum);

      if (txns.length === 0) {
        resultsEl.innerHTML = `<p class="text-muted" style="padding:20px;">
          No transactions found containing Rx# ${rxNum}.</p>`;
        return;
      }

      resultsEl.innerHTML = `
        <div class="text-muted" style="font-size:12px;padding:2px 0 8px;">
          ${txns.length} transaction${txns.length !== 1 ? 's' : ''} found for Rx# <strong>${rxNum}</strong>
        </div>
        <table class="table" style="font-size:13px;">
          <thead>
            <tr>
              <th>Txn #</th><th>Date</th><th>Rx Drug</th><th>Status</th>
              <th>Patient</th><th class="text-right">Total</th>
              <th style="text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${txns.map(t => {
              const dt = new Date(t.transaction_date).toLocaleString(navigator.language, {
                month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'
              });
              const sc = t.status === 'PAID' ? 'success' : t.status === 'REVERSED' ? 'danger' : 'warning';
              return `<tr style="${t.status === 'REVERSED' ? 'opacity:0.5;text-decoration:line-through;' : ''}">
                <td>#${t.transaction_id}</td>
                <td style="font-size:12px;">${dt}</td>
                <td style="font-size:12px;max-width:180px;">${t.rx_description || ('Rx# ' + (t.rx_number || rxNum))}</td>
                <td><span class="badge badge-${sc}" style="font-size:11px;">${t.status === 'REVERSED' ? 'VOIDED' : t.status}</span></td>
                <td>${patientCell(t)}</td>
                <td class="text-right">${Tax.fmt(t.total_amount)}</td>
                <td style="text-align:center;white-space:nowrap;">
                  <button class="btn btn-sm btn-outline" data-action="view" data-txnid="${t.transaction_id}">View</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;

      attachEvents();
    };

    /* ── wire search controls ── */
    const doRxSearch = () => {
      const raw = modal.querySelector('#hist-rx-search').value.trim();
      const v   = raw.replace(/^0+/, '') || raw;
      if (v) renderRxResults(v);
    };
    modal.querySelector('#hist-rx-btn').addEventListener('click', doRxSearch);
    modal.querySelector('#hist-rx-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') doRxSearch();
    });
    modal.querySelector('#hist-today-btn').addEventListener('click', () => {
      modal.querySelector('#hist-rx-search').value = '';
      renderTodayTable();
    });
    modal.querySelector('#hist-date').addEventListener('change', e => {
      const v = e.target.value;
      if (!v) return;
      modal.querySelector('#hist-rx-search').value = '';
      lastRxSearch = null;
      renderDateTable(v);
    });

    // Default view: today
    renderTodayTable();

    // Focus search box
    setTimeout(() => modal.querySelector('#hist-rx-search')?.focus(), 80);
  }

  /* ── Link Patient to existing transaction ───────────────────── */

  _showLinkPatientModal(txnId, onLinked) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '1100'; // above history modal
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
        // Try API/SQL first, then fall back to local DB
        if (/^\d{6,}$/.test(q)) {
          const p = await PharmacyDashboardAPI.getPatient(q).catch(() => null);
          if (p?.phn) { DB.upsertPatient(p); patients = [p]; }
        }
        if (!patients.length) {
          const nameOrPhn = /^\d+$/.test(q) ? { name: '' } : {};
          const apiResults = await PharmacyDashboardAPI.getPatients({ name: q, ...nameOrPhn }).catch(() => []);
          if (apiResults.length) {
            apiResults.forEach(p => DB.upsertPatient(p));
            patients = apiResults;
          }
        }
      } catch(_) {}

      // Always supplement / fallback with local DB
      if (!patients.length) {
        patients = DB.searchPatients(q);
      }

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
          const phn     = btn.dataset.phn;
          const patient = DB.getPatientByPhn(phn);
          if (!patient) { alert('Patient not found in local DB.'); return; }
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

  /* ── Shift Management ───────────────────────────────────────── */

  _updateShiftIndicator() {
    const shift    = DB.getActiveShift();
    const dot      = this._el?.querySelector('#shift-dot');
    const label    = this._el?.querySelector('#shift-label');
    const btn      = this._el?.querySelector('#btn-shift');
    if (!dot || !label || !btn) return;
    if (shift) {
      const opened = new Date(shift.opened_at);
      const hhmm   = opened.toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' });
      dot.style.color   = '#198754';
      label.textContent = `Shift · ${hhmm}`;
      btn.style.background = 'rgba(25,135,84,.1)';
      btn.style.borderColor = 'rgba(25,135,84,.4)';
    } else {
      dot.style.color   = '#fd7e14';
      label.textContent = 'Open Shift';
      btn.style.background = 'rgba(253,126,20,.1)';
      btn.style.borderColor = 'rgba(253,126,20,.4)';
    }
  }

  _showShiftModal() {
    const shift = DB.getActiveShift();
    if (!shift) {
      this._showOpenShiftModal();
    } else {
      this._showActiveShiftModal(shift);
    }
  }

  _showOpenShiftModal() {
    const DENOMS = [
      { label: '$100', value: 100,  type: 'bill' },
      { label: '$50',  value: 50,   type: 'bill' },
      { label: '$20',  value: 20,   type: 'bill' },
      { label: '$10',  value: 10,   type: 'bill' },
      { label: '$5',   value: 5,    type: 'bill' },
      { label: '$2',   value: 2,    type: 'coin' },
      { label: '$1',   value: 1,    type: 'coin' },
      { label: '25¢',  value: 0.25, type: 'coin' },
      { label: '10¢',  value: 0.10, type: 'coin' },
      { label: '5¢',   value: 0.05, type: 'coin' },
    ];

    const rows = DENOMS.map((d, i) => `
      <tr>
        <td style="padding:5px 8px;font-weight:600;white-space:nowrap;">
          <span style="display:inline-block;width:20px;text-align:center;font-size:13px;">${d.type==='bill'?'💵':'🪙'}</span>
          ${d.label}
        </td>
        <td style="padding:5px 8px;">
          <input type="number" class="denom-qty" data-idx="${i}" min="0" value="0"
            style="width:70px;text-align:center;padding:4px 6px;" />
        </td>
        <td style="padding:5px 8px;text-align:right;font-size:13px;color:var(--text-muted);" id="denom-sub-${i}">$0.00</td>
      </tr>`).join('');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <h3>&#128181; Open Shift — Count Float</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="padding-top:8px;">
          <div class="alert alert-info" style="font-size:13px;margin-bottom:10px;">
            Enter the quantity of each denomination in the drawer.
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--border);">
                <th style="padding:4px 8px;text-align:left;">Denomination</th>
                <th style="padding:4px 8px;text-align:center;">Qty</th>
                <th style="padding:4px 8px;text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="margin-top:12px;padding:10px 12px;background:var(--bg-secondary);border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;">Total Float</span>
            <span id="shift-float-total" style="font-size:22px;font-weight:700;color:var(--success);">$0.00</span>
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:8px;">
            Staff: <strong>${Auth.current()?.name || '—'}</strong>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="shift-cancel">Cancel</button>
          <button class="btn btn-success" id="shift-open-confirm">Open Shift</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#shift-cancel').addEventListener('click', close);

    const totalEl = modal.querySelector('#shift-float-total');
    let floatTotal = 0;

    const recalc = () => {
      floatTotal = 0;
      modal.querySelectorAll('.denom-qty').forEach(input => {
        const idx = parseInt(input.dataset.idx);
        const qty = parseInt(input.value) || 0;
        const sub = Tax.round2(qty * DENOMS[idx].value);
        modal.querySelector(`#denom-sub-${idx}`).textContent = Tax.fmt(sub);
        floatTotal = Tax.round2(floatTotal + sub);
      });
      totalEl.textContent = Tax.fmt(floatTotal);
    };

    modal.querySelectorAll('.denom-qty').forEach(input => {
      input.addEventListener('input', recalc);
      input.addEventListener('focus', () => { input.select(); });
    });

    modal.querySelector('#shift-open-confirm').addEventListener('click', () => {
      const staff = Auth.current();
      DB.openShift(staff?.staff_id, staff?.name, floatTotal);
      Audit.configChange(`Shift opened by ${staff?.name} — float ${Tax.fmt(floatTotal)}`);
      close();
      this._updateShiftIndicator();
      this._setStatus('success', `Shift opened — float ${Tax.fmt(floatTotal)}`);
    });

    // Focus first qty input
    modal.querySelector('.denom-qty').focus();
  }

  _showActiveShiftModal(shift) {
    const s     = DB.getShiftSummary(shift.shift_id);
    const staff = Auth.current();

    const opened  = new Date(shift.opened_at);
    const elapsed = Math.floor((Date.now() - opened.getTime()) / 60000);
    const hrs     = Math.floor(elapsed / 60);
    const mins    = elapsed % 60;
    const duration = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

    const movementRows = s.movements.length === 0
      ? '<tr><td colspan="3" class="text-muted" style="padding:8px;font-size:12px;">No cash movements recorded.</td></tr>'
      : s.movements.map(m => `<tr>
          <td style="font-size:12px;">${new Date(m.movement_date).toLocaleTimeString(navigator.language,{hour:'2-digit',minute:'2-digit'})}</td>
          <td><span style="font-size:11px;font-weight:600;padding:2px 6px;border-radius:4px;
               background:${m.movement_type==='CASH_IN'?'rgba(25,135,84,.15)':'rgba(220,53,69,.15)'};
               color:${m.movement_type==='CASH_IN'?'#198754':'#dc3545'};">${m.movement_type==='CASH_IN'?'IN':'OUT'}</span>
               ${m.reason ? `<span style="font-size:12px;margin-left:4px;color:var(--text-muted);">${m.reason}</span>` : ''}
          </td>
          <td class="text-right" style="font-size:13px;font-weight:600;
              color:${m.movement_type==='CASH_IN'?'var(--success)':'var(--danger)'};">
            ${m.movement_type==='CASH_IN'?'+':'−'}${Tax.fmt(m.amount)}
          </td>
        </tr>`).join('');

    const byMethodRows = s.byMethod.map(m => `
      <tr>
        <td style="font-size:13px;">${m.method}</td>
        <td class="text-right" style="font-size:13px;">${m.count}</td>
        <td class="text-right" style="font-size:13px;font-weight:600;">${Tax.fmt(m.total)}</td>
      </tr>`).join('');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:500px;width:96%;">
        <div class="modal-header">
          <h3>&#128181; Current Shift</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">

          <!-- Shift Overview -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;">
            ${[
              ['Opened', new Date(shift.opened_at).toLocaleTimeString(navigator.language,{hour:'2-digit',minute:'2-digit'})],
              ['Duration', duration],
              ['Float', Tax.fmt(shift.opening_float||0)],
              ['Transactions', s.txnSummary.txn_count],
              ['Total Sales', Tax.fmt(s.txnSummary.total_sales)],
              ['Expected Cash', Tax.fmt(s.expectedCash)],
            ].map(([l,v]) => `
              <div style="background:var(--surface2);padding:10px;border-radius:var(--radius);text-align:center;">
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px;">${l}</div>
                <div style="font-size:15px;font-weight:700;">${v}</div>
              </div>`).join('')}
          </div>

          <!-- Sales by Method -->
          ${s.byMethod.length > 0 ? `
          <div style="margin-bottom:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">SALES BY METHOD</div>
            <table class="table" style="font-size:13px;">
              <thead><tr><th>Method</th><th class="text-right">Txns</th><th class="text-right">Total</th></tr></thead>
              <tbody>${byMethodRows}</tbody>
            </table>
          </div>` : ''}

          <!-- Cash Movements -->
          <div style="margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div style="font-size:12px;font-weight:600;color:var(--text-muted);">CASH MOVEMENTS</div>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-sm btn-outline" id="btn-cash-in"
                        style="color:var(--success);border-color:var(--success);">+ Cash In</button>
                <button class="btn btn-sm btn-outline" id="btn-cash-out"
                        style="color:var(--danger);border-color:var(--danger);">− Cash Out</button>
              </div>
            </div>
            <table class="table" style="font-size:13px;">
              <thead><tr><th>Time</th><th>Type / Reason</th><th class="text-right">Amount</th></tr></thead>
              <tbody>${movementRows}</tbody>
            </table>
          </div>

        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <button class="btn btn-danger btn-outline" id="btn-close-shift">Close Shift</button>
          <button class="btn btn-outline" id="shift-done">Done</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#shift-done').addEventListener('click', close);

    modal.querySelector('#btn-cash-in').addEventListener('click', () => {
      close();
      this._showCashMovementModal('CASH_IN', shift);
    });
    modal.querySelector('#btn-cash-out').addEventListener('click', () => {
      close();
      this._showCashMovementModal('CASH_OUT', shift);
    });
    modal.querySelector('#btn-close-shift').addEventListener('click', () => {
      close();
      this._showCloseShiftModal(shift, s);
    });
  }

  _showCashMovementModal(type, shift) {
    const isCashIn = type === 'CASH_IN';
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:360px;">
        <div class="modal-header">
          <h3 style="color:${isCashIn ? 'var(--success)' : 'var(--danger)'};">
            ${isCashIn ? '+ Cash In' : '− Cash Out'}
          </h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Amount</label>
            <input type="number" id="cm-amount" step="0.01" min="0.01" placeholder="0.00"
                   style="font-size:22px;text-align:center;" />
          </div>
          <div class="form-group">
            <label>Reason <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
            <input type="text" id="cm-reason"
                   placeholder="${isCashIn ? 'e.g. Safe drop top-up, Opening float correction' : 'e.g. Safe drop, Petty cash'}" />
          </div>
          <div id="cm-err" class="alert alert-danger" style="display:none;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="cm-cancel">Cancel</button>
          <button class="btn" id="cm-confirm"
                  style="background:${isCashIn ? 'var(--success)' : 'var(--danger)'};color:#fff;">
            Record ${isCashIn ? 'Cash In' : 'Cash Out'}
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close  = () => modal.remove();
    const errEl  = modal.querySelector('#cm-err');
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#cm-cancel').addEventListener('click', close);
    const amountInput = modal.querySelector('#cm-amount');
    amountInput.focus();
    modal.querySelector('#cm-confirm').addEventListener('click', () => {
      const amount = parseFloat(amountInput.value);
      const reason = modal.querySelector('#cm-reason').value.trim();
      if (!amount || amount <= 0) {
        errEl.style.display = 'block'; errEl.textContent = 'Enter a valid amount.'; return;
      }
      DB.recordCashMovement(shift.shift_id, type, amount, reason, Auth.current()?.name);
      Audit.configChange(`${type} ${Tax.fmt(amount)}${reason ? ' — ' + reason : ''}`);
      close();
      this._setStatus('success', `${isCashIn ? 'Cash In' : 'Cash Out'} recorded: ${Tax.fmt(amount)}`);
    });
  }

  _showCloseShiftModal(shift, summary) {
    const DENOMS = [
      { label: '$100', value: 100,  type: 'bill' },
      { label: '$50',  value: 50,   type: 'bill' },
      { label: '$20',  value: 20,   type: 'bill' },
      { label: '$10',  value: 10,   type: 'bill' },
      { label: '$5',   value: 5,    type: 'bill' },
      { label: '$2',   value: 2,    type: 'coin' },
      { label: '$1',   value: 1,    type: 'coin' },
      { label: '25¢',  value: 0.25, type: 'coin' },
      { label: '10¢',  value: 0.10, type: 'coin' },
      { label: '5¢',   value: 0.05, type: 'coin' },
    ];

    const rows = DENOMS.map((d, i) => `
      <tr>
        <td style="padding:5px 8px;font-weight:600;white-space:nowrap;">
          <span style="display:inline-block;width:20px;text-align:center;font-size:13px;">${d.type==='bill'?'💵':'🪙'}</span>
          ${d.label}
        </td>
        <td style="padding:5px 8px;">
          <input type="number" class="cs-denom-qty" data-idx="${i}" min="0" value="0"
            style="width:70px;text-align:center;padding:4px 6px;" />
        </td>
        <td style="padding:5px 8px;text-align:right;font-size:13px;color:var(--text-muted);" id="cs-denom-sub-${i}">$0.00</td>
      </tr>`).join('');

    const kpis = [
      ['Total Sales',   Tax.fmt(summary.txnSummary.total_sales)],
      ['Cash Sales',    Tax.fmt(summary.cashSales)],
      ['Cash In',       Tax.fmt(summary.cashIn)],
      ['Cash Out',      Tax.fmt(summary.cashOut)],
      ['Opening Float', Tax.fmt(shift.opening_float || 0)],
      ['Expected Cash', Tax.fmt(summary.expectedCash)],
    ].map(([l, v]) => `
      <div style="display:flex;justify-content:space-between;padding:6px 10px;
                  background:var(--surface2);border-radius:var(--radius);">
        <span style="font-size:12px;color:var(--text-muted);">${l}</span>
        <span style="font-size:12px;font-weight:700;">${v}</span>
      </div>`).join('');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <h3>&#128181; Close Shift — Count Cash</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="padding-top:8px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;">${kpis}</div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--border);">
                <th style="padding:4px 8px;text-align:left;">Denomination</th>
                <th style="padding:4px 8px;text-align:center;">Qty</th>
                <th style="padding:4px 8px;text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="margin-top:10px;padding:10px 12px;background:var(--bg-secondary);border-radius:6px;
                      display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;">Counted Cash</span>
            <span id="cs-counted-total" style="font-size:20px;font-weight:700;color:var(--success);">$0.00</span>
          </div>
          <div id="cs-variance" style="display:none;margin-top:8px;padding:10px 14px;border-radius:var(--radius);
               text-align:center;font-size:14px;font-weight:600;"></div>
          <div class="form-group" style="margin-top:12px;">
            <label>Closing Notes <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
            <textarea id="cs-notes" rows="2" style="resize:vertical;" placeholder="Any discrepancies or notes..."></textarea>
          </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <button class="btn btn-outline" id="cs-cancel">Back</button>
          <button class="btn btn-danger" id="cs-confirm">Close Shift</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#cs-cancel').addEventListener('click', () => {
      close();
      this._showActiveShiftModal(shift);
    });

    const totalEl   = modal.querySelector('#cs-counted-total');
    const varianceEl = modal.querySelector('#cs-variance');
    let counted = 0;

    const recalc = () => {
      counted = 0;
      modal.querySelectorAll('.cs-denom-qty').forEach(input => {
        const idx = parseInt(input.dataset.idx);
        const qty = parseInt(input.value) || 0;
        const sub = Tax.round2(qty * DENOMS[idx].value);
        modal.querySelector(`#cs-denom-sub-${idx}`).textContent = Tax.fmt(sub);
        counted = Tax.round2(counted + sub);
      });
      totalEl.textContent = Tax.fmt(counted);
      const variance = Tax.round2(counted - summary.expectedCash);
      varianceEl.style.display = 'block';
      if (Math.abs(variance) < 0.01) {
        varianceEl.textContent       = '✓ Cash balanced perfectly';
        varianceEl.style.background  = 'rgba(25,135,84,.12)';
        varianceEl.style.color       = 'var(--success)';
      } else {
        varianceEl.textContent       = `Variance: ${variance >= 0 ? '+' : ''}${Tax.fmt(variance)} ${variance > 0 ? '(over)' : '(short)'}`;
        varianceEl.style.background  = Math.abs(variance) > 5 ? 'rgba(220,53,69,.12)' : 'rgba(255,193,7,.15)';
        varianceEl.style.color       = Math.abs(variance) > 5 ? 'var(--danger)' : '#856404';
      }
    };

    modal.querySelectorAll('.cs-denom-qty').forEach(input => {
      input.addEventListener('input', recalc);
      input.addEventListener('focus', () => input.select());
    });

    modal.querySelector('#cs-confirm').addEventListener('click', () => {
      const notes = modal.querySelector('#cs-notes').value.trim();
      DB.closeShift(shift.shift_id, counted, notes);
      const variance = Tax.round2(counted - summary.expectedCash);
      Audit.configChange(`Shift closed by ${Auth.current()?.name} — counted ${Tax.fmt(counted)}, variance ${Tax.fmt(variance)}`);
      close();
      this._updateShiftIndicator();
      this._setStatus('', `Shift closed — ${Tax.fmt(summary.txnSummary.total_sales)} total sales`);
    });

    modal.querySelector('.cs-denom-qty').focus();
  }

  _addQuickActionToCart(action, price) {
    this._cart.push({
      item_type:      'CUSTOM',
      description:    action.description || action.label,
      quantity:       1,
      unit_price:     price,
      gst_applicable: !!action.gst,
      pst_applicable: !!action.pst,
      line_total:     price,
    });
    this._setStatus('success', `Added: ${action.description || action.label} — ${Tax.fmt(price)}`);
    this._updateDisplay();
  }

  _promptQuickActionPrice(action) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:320px;">
        <div class="modal-header">
          <h3>${action.label}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
            ${action.description || action.label}
          </div>
          <div class="form-group" style="margin:0;">
            <label>Enter Price</label>
            <input type="number" id="qa-price-input" step="0.01" min="0"
                   placeholder="0.00" style="font-size:22px;text-align:center;" />
          </div>
          <div id="qa-price-err" class="alert alert-danger" style="display:none;margin-top:8px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="qa-price-cancel">Cancel</button>
          <button class="btn btn-success" id="qa-price-confirm">Add to Cart</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const input  = modal.querySelector('#qa-price-input');
    const errEl  = modal.querySelector('#qa-price-err');
    const close  = () => modal.remove();
    const confirm = () => {
      const price = parseFloat(input.value);
      if (isNaN(price) || price < 0) {
        errEl.style.display = 'block';
        errEl.textContent   = 'Enter a valid price.';
        input.focus();
        return;
      }
      close();
      this._addQuickActionToCart(action, price);
    };

    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#qa-price-cancel').addEventListener('click', close);
    modal.querySelector('#qa-price-confirm').addEventListener('click', confirm);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });

    setTimeout(() => input.focus(), 50);
  }

  _editItemPrice(idx) {
    const item = this._cart[idx];
    if (!item) return;
    const currentPrice = item.unit_price;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:320px;">
        <div class="modal-header">
          <h3>Edit Price</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;word-break:break-word;">
            ${item.description}${item.quantity > 1 ? ` &nbsp;×&nbsp; ${item.quantity}` : ''}
          </div>
          <div class="form-group" style="margin:0;">
            <label>Unit Price</label>
            <input type="number" id="edit-price-input" step="0.01" min="0"
                   value="${currentPrice.toFixed(2)}"
                   style="font-size:22px;text-align:center;margin-top:6px;" />
          </div>
          ${item.quantity > 1 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;text-align:center;">Line total: <span id="edit-price-line">—</span></div>` : ''}
          <div id="edit-price-err" class="alert alert-danger" style="display:none;margin-top:8px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="edit-price-cancel">Cancel</button>
          <button class="btn btn-primary" id="edit-price-save">Update Price</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const input   = modal.querySelector('#edit-price-input');
    const lineEl  = modal.querySelector('#edit-price-line');
    const errEl   = modal.querySelector('#edit-price-err');
    const close   = () => modal.remove();

    if (lineEl) {
      const updateLine = () => {
        const v = parseFloat(input.value);
        lineEl.textContent = isNaN(v) ? '—' : Tax.fmt(Tax.round2(v * item.quantity));
      };
      input.addEventListener('input', updateLine);
      updateLine();
    }

    const save = () => {
      const newPrice = parseFloat(input.value);
      if (isNaN(newPrice) || newPrice < 0) {
        errEl.style.display = 'block';
        errEl.textContent = 'Enter a valid price.';
        input.focus(); return;
      }
      this._cart[idx].unit_price = Tax.round2(newPrice);
      this._cart[idx].line_total = Tax.round2(newPrice * item.quantity);
      close();
      this._updateDisplay();
      this._setStatus('success', `Price updated: ${item.description} → ${Tax.fmt(newPrice)}`);
    };

    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#edit-price-cancel').addEventListener('click', close);
    modal.querySelector('#edit-price-save').addEventListener('click', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    setTimeout(() => { input.focus(); input.select(); }, 50);
  }

  _applyDiscountAction(action) {
    if (this._cart.length === 0) {
      this._setStatus('error', 'Add items to the cart before applying a discount.');
      return;
    }
    if (!action.discount_value) {
      this._promptDiscountAmount(action);
      return;
    }
    this._calcAndAddDiscount(action, action.discount_value);
  }

  _calcAndAddDiscount(action, inputValue) {
    let amount;
    if (action.discount_type === 'percent') {
      if (action.discount_applies === 'last_item' && this._cart.length > 0) {
        const last = this._cart[this._cart.length - 1];
        amount = Tax.round2(Math.abs(last.line_total) * (inputValue / 100));
      } else {
        const totals = Tax.calcCartTotals(this._cart);
        amount = Tax.round2(totals.subtotal * (inputValue / 100));
      }
    } else {
      amount = Tax.round2(inputValue);
    }
    if (amount <= 0) { this._setStatus('error', 'Discount amount must be greater than zero.'); return; }
    this._cart.push({
      item_type:      'DISCOUNT',
      description:    action.label,
      quantity:       1,
      unit_price:     -amount,
      gst_applicable: false,
      pst_applicable: false,
      line_total:     -amount,
    });
    this._setStatus('success', `Discount applied: -${Tax.fmt(amount)}`);
    this._updateDisplay();
  }

  _promptDiscountAmount(action) {
    const isPercent = action.discount_type === 'percent';
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:320px;">
        <div class="modal-header">
          <h3>${action.label}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group" style="margin:0;">
            <label>Enter ${isPercent ? 'Percentage (%)' : 'Discount Amount ($)'}</label>
            <input type="number" id="disc-input" step="${isPercent ? '1' : '0.01'}" min="0"
                   ${isPercent ? 'max="100"' : ''}
                   placeholder="${isPercent ? 'e.g. 10' : '0.00'}"
                   style="font-size:22px;text-align:center;margin-top:8px;" />
          </div>
          <div id="disc-err" class="alert alert-danger" style="display:none;margin-top:8px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="disc-cancel">Cancel</button>
          <button class="btn btn-danger" id="disc-confirm">Apply Discount</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const input = modal.querySelector('#disc-input');
    const errEl = modal.querySelector('#disc-err');
    const close = () => modal.remove();
    const confirm = () => {
      const val = parseFloat(input.value);
      if (isNaN(val) || val <= 0) {
        errEl.style.display = 'block';
        errEl.textContent = `Enter a valid ${isPercent ? 'percentage' : 'amount'}.`;
        input.focus(); return;
      }
      if (isPercent && val > 100) {
        errEl.style.display = 'block'; errEl.textContent = 'Percentage cannot exceed 100%.';
        input.focus(); return;
      }
      close();
      this._calcAndAddDiscount(action, val);
    };

    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#disc-cancel').addEventListener('click', close);
    modal.querySelector('#disc-confirm').addEventListener('click', confirm);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
    setTimeout(() => input.focus(), 50);
  }

  async _loadAndRenderQuickActions() {
    const raw = await Config.get('quick_actions_json');
    if (!raw) return;
    let actions;
    try { actions = JSON.parse(raw); } catch(e) { return; }
    if (!Array.isArray(actions) || actions.length === 0) return;
    this._renderQuickActionButtons(actions);
  }

  _renderQuickActionButtons(actions) {
    const container = this._el.querySelector('#custom-quick-actions');
    if (!container) return;

    const colorClass = { blue: 'btn-primary', green: 'btn-success', orange: 'btn-warning', red: 'btn-danger' };

    container.innerHTML = `
      <div style="height:1px;background:var(--border);margin:10px 0;"></div>
      <div class="quick-action-grid" id="cqa-grid">
        ${actions.map(a => `
          <button class="btn ${colorClass[a.color] || 'btn-outline'} cqa-btn"
                  data-qa-id="${a.id}"
                  title="${a.description || a.label} — ${Tax.fmt(a.price || 0)}">
            ${a.label}
          </button>`).join('')}
      </div>`;

    container.querySelectorAll('.cqa-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = actions.find(a => a.id === btn.dataset.qaId);
        if (!action) return;
        if (action.type === 'discount') {
          this._applyDiscountAction(action);
        } else if (!action.price) {
          this._promptQuickActionPrice(action);
        } else {
          this._addQuickActionToCart(action, action.price);
        }
      });
    });
  }

  _showRphSignatureModal(txn, items, payments, patient) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.6);
      display:flex;align-items:center;justify-content:center;z-index:9500;`;

    overlay.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);
                  border-radius:var(--radius);width:480px;max-width:95vw;
                  box-shadow:0 8px 32px rgba(0,0,0,.4);">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);">
          <div style="font-size:15px;font-weight:700;">Pick Up Confirmation</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">
            RPh signature confirms counselling &amp; allergy check — saved to patient file.
          </div>
        </div>
        <div style="padding:16px 20px;">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-muted);">
            Counselling and Allergy Checked by (RPh) — Signature:
          </div>
          <div style="border:1px solid var(--border);border-radius:4px;background:#fff;
                      position:relative;margin-bottom:8px;overflow:hidden;">
            <canvas id="rph-canvas" width="436" height="110"
                    style="display:block;cursor:crosshair;touch-action:none;width:100%;"></canvas>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
            <button id="rph-clear" style="font-size:11px;padding:3px 10px;
              border:1px solid var(--border);border-radius:var(--radius);
              background:var(--surface2);cursor:pointer;color:var(--text-muted);">
              Clear signature
            </button>
          </div>
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);
                         display:block;margin-bottom:5px;">Name / Initials</label>
          <input id="rph-name" type="text" placeholder="e.g. J. Smith, RPh" autocomplete="off"
                 style="width:100%;padding:9px 12px;border:1px solid var(--border);
                        border-radius:var(--radius);font-size:14px;
                        background:var(--surface2);color:var(--text);box-sizing:border-box;" />
        </div>
        <div style="padding:12px 20px;border-top:1px solid #ddd;
                    display:flex;flex-direction:row;gap:10px;justify-content:flex-end;align-items:center;">
          <button id="rph-skip" style="padding:8px 18px;border:1px solid #ccc;
            border-radius:6px;background:#f5f5f5;
            cursor:pointer;font-size:13px;color:#333;">
            Skip
          </button>
          <button id="rph-confirm" style="padding:8px 24px;border:none;
            border-radius:6px;background:#2563eb;color:#fff;
            cursor:pointer;font-size:13px;font-weight:600;">
            Confirm &amp; Upload
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    /* ── Canvas drawing ── */
    const canvas = overlay.querySelector('#rph-canvas');
    const ctx    = canvas.getContext('2d');
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    let drawing      = false;
    let hasSignature = false;

    function canvasPos(e) {
      const rect = canvas.getBoundingClientRect();
      const src  = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * (canvas.width  / rect.width),
        y: (src.clientY - rect.top)  * (canvas.height / rect.height),
      };
    }

    canvas.addEventListener('mousedown', e => {
      drawing = true;
      const p = canvasPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
    });
    canvas.addEventListener('mousemove', e => {
      if (!drawing) return;
      hasSignature = true;
      const p = canvasPos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
    });
    canvas.addEventListener('mouseup',    () => { drawing = false; });
    canvas.addEventListener('mouseleave', () => { drawing = false; });
    canvas.addEventListener('touchstart', e => {
      e.preventDefault(); drawing = true;
      const p = canvasPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!drawing) return;
      hasSignature = true;
      const p = canvasPos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
    }, { passive: false });
    canvas.addEventListener('touchend', () => { drawing = false; });

    overlay.querySelector('#rph-clear').addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasSignature = false;
    });

    overlay.querySelector('#rph-skip').addEventListener('click', () => overlay.remove());

    overlay.querySelector('#rph-confirm').addEventListener('click', async () => {
      const name             = overlay.querySelector('#rph-name').value.trim();
      const signatureDataUrl = hasSignature ? canvas.toDataURL('image/png') : null;

      if (!name && !signatureDataUrl) {
        const nameInput = overlay.querySelector('#rph-name');
        nameInput.style.borderColor = 'var(--danger, red)';
        nameInput.placeholder = 'Please enter your name or draw a signature';
        nameInput.focus();
        return;
      }

      const btn     = overlay.querySelector('#rph-confirm');
      const skipBtn = overlay.querySelector('#rph-skip');
      btn.disabled     = true;
      skipBtn.disabled = true;
      btn.textContent  = 'Uploading…';

      const rphInfo = { name, signatureDataUrl };
      let folderOk  = false;
      let sqlOk     = false;
      let errorMsg  = '';
      try {
        // A5 PDF with large barcode — for WinRx document inbox folder
        const folderDoc = await Print.generateFolderDocBase64(txn, items, payments, patient, rphInfo);
        if (folderDoc?.base64) {
          const folderResult = await PharmacyDashboardAPI.savePdfToFolder(folderDoc.base64, folderDoc.filename);
          folderOk = folderResult.ok;
          if (!folderOk && folderResult.reason !== 'no-folder-configured' && folderResult.reason !== 'no-local-api') {
            console.warn('Folder save failed:', folderResult.reason);
          }
        }

        // 80mm PDF — SQL INSERT into WinRx patient document table
        try {
          const sqlDoc = await Print.generateReceiptBase64(txn, items, payments, patient, rphInfo);
          if (sqlDoc?.base64) {
            const sqlSaved = await PharmacyDashboardAPI.saveDocument(
              patient.phn, sqlDoc.base64, 'RCPT', name || Auth.current()?.name
            );
            sqlOk = !!sqlSaved;
          }
        } catch (sqlErr) {
          console.warn('SQL document save failed:', sqlErr.message);
        }

        if (!folderOk && !sqlOk) {
          throw new Error('Document not saved — configure the document folder in Settings → API Credentials');
        }
      } catch(e) {
        errorMsg = e.message;
        console.error('RPh receipt upload failed:', e.message);
      }

      const anyOk = folderOk || sqlOk;
      if (anyOk) {
        const via = folderOk && sqlOk ? 'folder + SQL' : folderOk ? 'folder' : 'SQL';
        btn.textContent      = `✓ Pick Up Confirmation saved (${via})`;
        btn.style.background = '#28a745';
        setTimeout(() => overlay.remove(), 1800);
      } else {
        btn.disabled    = false;
        btn.textContent = 'Retry Upload';
        skipBtn.disabled = false;
        let errEl = overlay.querySelector('#rph-upload-error');
        if (!errEl) {
          errEl = document.createElement('div');
          errEl.id = 'rph-upload-error';
          errEl.style.cssText = `color:#c00;font-size:12px;margin-top:8px;
            padding:8px 12px;background:#fff0f0;border-radius:4px;border:1px solid #fcc;`;
          btn.parentNode.insertBefore(errEl, btn);
        }
        errEl.textContent = `Pick Up Confirmation upload failed: ${errorMsg}. Configure the document folder in Settings → API Credentials.`;
      }
    });

    setTimeout(() => overlay.querySelector('#rph-name').focus(), 150);
  }

  async _loadPendingRx(phn, branchCode) {
    try {
      const profile = await PharmacyDashboardAPI.getPatientProfile(phn);
      const rxList  = Array.isArray(profile) ? profile
                    : Array.isArray(profile?.RX) ? profile.RX
                    : [];
      if (!rxList.length) return;

      // Filter out Rx already in the cart
      const inCart = new Set(this._cart.map(i => String(i.rx_number)));
      const pending = rxList
        .filter(r => {
          const num = String(r.RXNUM || r.RxNum || r.rxnum || '');
          return num && !inCart.has(num);
        })
        .map(r => ({
          rxNumber:  String(r.RXNUM   || r.RxNum   || r.rxnum   || ''),
          drug:      r.DRUG   || r.DrugName || r.drug    || `Rx`,
          copay:     parseFloat(r.RECOPAY || r.Copay || r.copay || 0) || 0,
          qty:       parseInt(r.REQTY  || r.QTY    || r.qty    || 0) || 0,
          fillDate:  r.REEFDATE || r.FillDate || null,
          din:       r.DIN     || r.din      || null,
        }));

      if (pending.length) this._showPendingRxPrompt(pending, branchCode);
    } catch(e) {
      console.warn('_loadPendingRx failed:', e.message);
    }
  }

  _showPendingRxPrompt(pending, branchCode) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.55);
      display:flex;align-items:center;justify-content:center;z-index:9100;`;

    const fmt = v => `$${parseFloat(v || 0).toFixed(2)}`;
    const fmtDate = d => {
      if (!d) return '';
      const s = String(d);
      if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
      return s.slice(0, 10);
    };

    overlay.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
                  width:520px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;
                  box-shadow:0 8px 32px rgba(0,0,0,.35);">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);
                    display:flex;align-items:center;justify-content:space-between;">
          <strong style="font-size:15px;">Other Prescriptions on File</strong>
          <label style="font-size:12px;color:var(--text-muted);cursor:pointer;">
            <input type="checkbox" id="pend-select-all" style="margin-right:5px;">
            Select all
          </label>
        </div>
        <div style="overflow-y:auto;flex:1;padding:8px 0;">
          ${pending.map((r, i) => `
            <label style="display:flex;align-items:center;gap:10px;padding:10px 20px;
                          cursor:pointer;border-bottom:1px solid var(--border-faint,#333);">
              <input type="checkbox" class="pend-cb" data-idx="${i}"
                     style="flex-shrink:0;width:16px;height:16px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;white-space:nowrap;
                             overflow:hidden;text-overflow:ellipsis;">${r.drug}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                  Rx #${r.rxNumber}
                  ${r.qty ? ` · Qty: ${r.qty}` : ''}
                  ${r.fillDate ? ` · Filled: ${fmtDate(r.fillDate)}` : ''}
                </div>
              </div>
              <div style="font-size:13px;font-weight:600;color:var(--text-muted);white-space:nowrap;font-style:italic;">
                ${r.copay > 0 ? fmt(r.copay) : 'price on add'}
              </div>
            </label>`).join('')}
        </div>
        <div style="padding:14px 20px;border-top:1px solid var(--border);
                    display:flex;gap:10px;align-items:center;justify-content:space-between;">
          <span style="font-size:11px;color:var(--text-muted);">Prices fetched from WinRx when added</span>
          <div style="display:flex;gap:8px;">
            <button id="pend-skip"
                    style="padding:8px 18px;border:1px solid var(--border);border-radius:var(--radius);
                           background:var(--surface2);cursor:pointer;font-size:13px;">
              Skip
            </button>
            <button id="pend-add"
                    style="padding:8px 22px;border:none;border-radius:var(--radius);
                           background:var(--accent);color:#fff;cursor:pointer;
                           font-size:13px;font-weight:600;min-width:110px;">
              Add to Cart
            </button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.querySelector('#pend-skip').addEventListener('click', close);

    overlay.querySelector('#pend-select-all').addEventListener('change', e => {
      overlay.querySelectorAll('.pend-cb').forEach(cb => { cb.checked = e.target.checked; });
    });

    overlay.querySelector('#pend-add').addEventListener('click', async () => {
      const checked = [...overlay.querySelectorAll('.pend-cb:checked')];
      if (!checked.length) { close(); return; }

      const btn = overlay.querySelector('#pend-add');
      btn.disabled = true;
      btn.textContent = 'Loading prices…';

      // Fetch real copay for each selected Rx via getRxTx (same as scanning a barcode)
      const results = await Promise.allSettled(
        checked.map(cb => {
          const r = pending[parseInt(cb.dataset.idx)];
          return PharmacyDashboardAPI.getRxTx(r.rxNumber, branchCode).then(rxData => ({ r, rxData }));
        })
      );

      let added = 0;
      results.forEach(res => {
        if (res.status !== 'fulfilled') return;
        const { r, rxData } = res.value;
        if (this._cart.some(c => String(c.rx_number) === r.rxNumber)) return;
        const copay = rxData?.unit_price ?? r.copay ?? 0;
        const desc  = rxData?.description || (r.qty ? `${r.drug} [Qty:${r.qty}]` : r.drug);
        this._cart.push({
          item_type:      'RX',
          rx_number:      r.rxNumber,
          branch_code:    branchCode || null,
          din:            rxData?.din || r.din,
          description:    desc,
          quantity:       1,
          unit_price:     copay,
          gst_applicable: false,
          pst_applicable: false,
          line_total:     Tax.round2(copay),
          patient_phn:    this._patient?.phn || null,
        });
        added++;
      });

      this._updateDisplay();
      if (added) this._setStatus('success', `Added ${added} prescription${added > 1 ? 's' : ''} to cart`);
      close();
    });
  }

  detach() {
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
  }
}
