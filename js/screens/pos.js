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
    this._pendingBtcLog   = null;
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
            <div style="padding:0 0 6px;display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" id="btn-discount" style="flex:1;font-size:12px;">% Discount</button>
              <button class="btn btn-outline btn-sm" id="btn-hold" style="flex:1;font-size:12px;">⏸ Hold</button>
              <button class="btn btn-outline btn-sm" id="btn-quote" style="flex:1;font-size:12px;">📄 Quote</button>
            </div>
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

          <!-- Always-available tools (use the empty space under Quick Actions) -->
          <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px;
                      display:flex;flex-direction:column;gap:8px;">
            <button class="btn btn-outline" id="tile-find-receipt" style="padding:12px;font-size:13px;">
              &#128203; Find Paid Receipt (Txn #)
            </button>
            <button class="btn btn-outline" id="tile-resume-held" style="padding:12px;font-size:13px;">
              &#9208; Held Carts <span id="tile-held-count" style="background:var(--danger);color:#fff;border-radius:8px;padding:0 6px;font-size:11px;display:none;"></span>
            </button>
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
    this._el.querySelector('#btn-lock').addEventListener('click', () => {
      this._holdCart();
      Auth.logout();
      this._onNavigate('login');
    });
    this._el.querySelector('#btn-charge').addEventListener('click', () => this._showPaymentModal());
    this._el.querySelector('#btn-discount')?.addEventListener('click', () => this._showDiscountModal());
    this._el.querySelector('#btn-hold')?.addEventListener('click', () => this._holdCartWithReason());
    this._el.querySelector('#btn-quote')?.addEventListener('click', () => this._printQuote());
    this._el.querySelector('#tile-resume-held')?.addEventListener('click', () => this._showHeldCartsModal());
    this._el.querySelector('#tile-find-receipt')?.addEventListener('click', () => this._showFindReceiptModal());
    this._refreshHeldCount();
    this._el.querySelector('#btn-clear-cart').addEventListener('click', () => this._confirmClearCart());
    this._el.querySelector('#btn-manual-otc').addEventListener('click', () => this._showManualOTCModal());
    this._el.querySelector('#btn-manual-rx').addEventListener('click', () => this._showManualRxModal());
    this._el.querySelector('#btn-custom-products').addEventListener('click', () => this._showCustomProductsModal());

    this._loadAndRenderQuickActions();

    // Register auto-lock hold-cart hook
    window._posHoldCart = () => this._holdCart();

    // Offer to resume a cart held before last lock/logout
    setTimeout(() => this._offerResumeCart(), 600);

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

      // Real drug name (kept internally for BTC log + WinRx docs, never shown to patient)
      const drugName = rxData.fill_qty
        ? `${rxData.description} [Qty:${rxData.fill_qty}]`
        : rxData.description;
      // Patient-facing privacy label — no medication name
      const desc = `Rx ${rxNum}${rxData.fill_qty ? ` [Qty:${rxData.fill_qty}]` : ''}`;

      this._cart.push({
        item_type:      'RX',
        rx_number:      rxNum,
        branch_code:    branchCode,
        din:            rxData.din,
        description:    desc,
        drug_name:      drugName,        // internal only — BTC log + WinRx pickup doc
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
    // Determine source and ID so stock can be deducted on save
    const isCustom = product.custom_product_id != null;
    this._cart.push({
      item_type:       'OTC',
      din:             product.din || null,
      upc:             barcode,
      description:     product.description,
      quantity:        1,
      unit_price:      price,
      gst_applicable:  !!product.gst_applicable,
      pst_applicable:  !!product.pst_applicable,
      line_total:      price,
      _product_id:     isCustom ? product.custom_product_id : product.product_id,
      _product_source: isCustom ? 'custom' : 'catalog',
      // schedule_flag from DB, or fall back to checking narcotic_indicator (McKesson catalog)
      // or notes containing "CTRL" (legacy workaround before Phase 3)
      _schedule_flag:  product.schedule_flag ||
                       (product.narcotic_indicator && product.narcotic_indicator !== 'N' ? 'narcotic' : null) ||
                       (/CTRL/i.test(product.notes||'') || /\bBTC\b/i.test(product.location||'') ? 'btc' : null),
    });

    // Debug: log what flag was detected
    const flag = this._cart[this._cart.length-1]?._schedule_flag;
    console.log('[BTC] product:', product.description,
      '| schedule_flag:', product.schedule_flag,
      '| notes:', product.notes,
      '| location:', product.location,
      '| detected flag:', flag);

    this._setStatus('success', `Added: ${product.description} — ${Tax.fmt(price)}${flag ? ` [${flag.toUpperCase()}]` : ''}`);
    this._updateDisplay();
  }

  _removeLastItem() {
    if (this._cart.length === 0) return;
    const removed = this._cart.pop();
    this._setStatus('', `Removed: ${removed.description}`);
    this._updateDisplay();
  }

  /* Save current cart to localStorage so it survives a lock/logout */
  _holdCart() {
    if (this._cart.length === 0) return;
    try {
      localStorage.setItem('pos_held_cart', JSON.stringify({
        cart:      this._cart,
        patient:   this._patient,
        savedAt:   new Date().toISOString(),
      }));
    } catch(e) { console.warn('Cart hold failed:', e.message); }
  }

  /* Offer to resume a previously held cart */
  _offerResumeCart() {
    try {
      const raw = localStorage.getItem('pos_held_cart');
      if (!raw) return;
      const held = JSON.parse(raw);
      if (!held?.cart?.length) return;

      const total   = Tax.calcCartTotals(held.cart).total_amount;
      const patient = held.patient;
      const name    = patient ? `${patient.given_name} ${patient.surname}` : 'No patient';
      const age     = held.savedAt
        ? Math.round((Date.now() - new Date(held.savedAt)) / 60000) + ' min ago'
        : '';

      const banner = document.createElement('div');
      banner.style.cssText = `
        position:fixed;bottom:16px;right:16px;z-index:9000;
        background:var(--surface);border:1px solid var(--border);
        border-radius:var(--radius);box-shadow:0 4px 20px rgba(0,0,0,.25);
        padding:14px 18px;max-width:320px;`;
      banner.innerHTML = `
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">🛒 Resume held cart?</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">
          ${held.cart.length} item${held.cart.length>1?'s':''} &nbsp;·&nbsp;
          ${Tax.fmt(total)} &nbsp;·&nbsp; ${name}
          ${age ? `<br><span style="opacity:.6;">${age}</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;">
          <button id="resume-yes" class="btn btn-primary btn-sm" style="flex:1;">Resume</button>
          <button id="resume-no"  class="btn btn-outline btn-sm" style="flex:1;">Discard</button>
        </div>`;
      document.body.appendChild(banner);

      banner.querySelector('#resume-yes').addEventListener('click', () => {
        this._cart    = held.cart;
        this._patient = held.patient;
        this._pendingRxLoaded = false;
        this._updateDisplay();
        this._updatePatientBar();
        this._setStatus('success', 'Cart resumed');
        localStorage.removeItem('pos_held_cart');
        banner.remove();
      });
      banner.querySelector('#resume-no').addEventListener('click', () => {
        localStorage.removeItem('pos_held_cart');
        banner.remove();
      });
      // Auto-dismiss after 30 seconds if no action
      setTimeout(() => banner.remove(), 30000);
    } catch(e) { /* ignore */ }
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
      const scheduleBadge = item._schedule_flag === 'btc'
        ? `<span class="badge" style="background:#fff3cd;color:#856404;border:1px solid #ffc107;margin-left:4px;">BTC</span>`
        : item._schedule_flag === 'btc_ctrl'
        ? `<span class="badge" style="background:#ffe5cc;color:#a04000;border:1px solid #ffa04a;margin-left:4px;">CTRL BTC</span>`
        : '';
      const badge = isDiscount
        ? `<span class="badge" style="background:rgba(220,53,69,.12);color:var(--danger);">Disc</span>`
        : item.item_type === 'RX'
        ? `<span class="badge badge-rx">Rx</span>`
        : item.item_type === 'OTC'
        ? `<span class="badge badge-otc">OTC</span>`
        : `<span class="badge badge-custom">Custom</span>`;
      if (isDiscount) row.style.cssText = 'background:rgba(220,53,69,.04);border-left:3px solid var(--danger);';
      // Quantity stepper for OTC/Custom items (not Rx — billed as 1 fill — or discounts)
      const qtyEditable = item.item_type === 'OTC' || item.item_type === 'CUSTOM';
      const qtyControl = qtyEditable
        ? `<span class="cart-qty" style="display:inline-flex;align-items:center;gap:4px;margin-top:3px;">
             <button class="qty-dec" data-idx="${idx}" style="width:20px;height:20px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);cursor:pointer;line-height:1;">−</button>
             <span style="min-width:22px;text-align:center;font-weight:600;">${item.quantity || 1}</span>
             <button class="qty-inc" data-idx="${idx}" style="width:20px;height:20px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);cursor:pointer;line-height:1;">+</button>
           </span>`
        : (item.quantity > 1 ? `Qty: ${item.quantity}` : '');
      row.innerHTML = `
        <div class="cart-item-info">
          ${badge}${scheduleBadge} <span class="cart-item-name" style="${isDiscount?'color:var(--danger);':''}">${item.description}</span>
          <div class="cart-item-detail" style="display:flex;align-items:center;gap:8px;">
            ${item.rx_number ? `Rx# ${item.rx_number}-${item.branch_code}` : ''}
            ${qtyControl}
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
      const decBtn = row.querySelector('.qty-dec');
      const incBtn = row.querySelector('.qty-inc');
      if (decBtn) decBtn.addEventListener('click', e => { e.stopPropagation(); this._changeItemQty(idx, -1); });
      if (incBtn) incBtn.addEventListener('click', e => { e.stopPropagation(); this._changeItemQty(idx, +1); });
      cartItems.appendChild(row);
    });

    const totals = Tax.calcCartTotals(this._cart);
    this._el.querySelector('#cart-subtotal').textContent  = Tax.fmt(totals.subtotal);
    this._el.querySelector('#cart-gst-label').textContent = `GST (${(Tax.gstRate()*100).toFixed(1).replace(/\.0$/,'')}%)`;
    this._el.querySelector('#cart-gst').textContent       = Tax.fmt(totals.gst_amount);
    this._el.querySelector('#cart-pst-label').textContent = `PST (${(Tax.pstRate()*100).toFixed(1).replace(/\.0$/,'')}%)`;
    this._el.querySelector('#cart-pst').textContent       = Tax.fmt(totals.pst_amount);
    this._el.querySelector('#cart-total').textContent     = Tax.fmt(totals.total_amount);

    // ── Allergy warning banner ──────────────────────────────────
    let allergyBanner = this._el.querySelector('#allergy-warning');
    if (this._patient?.allergies) {
      if (!allergyBanner) {
        allergyBanner = document.createElement('div');
        allergyBanner.id = 'allergy-warning';
        allergyBanner.style.cssText = `
          background:#fff3cd;color:#856404;border:1px solid #ffc107;
          border-radius:var(--radius);padding:8px 12px;margin-bottom:10px;
          font-size:13px;font-weight:600;display:flex;align-items:flex-start;gap:8px;`;
        // Insert before the charge button row
        const chargeBtn = this._el.querySelector('.cart-charge-btn');
        chargeBtn?.parentNode.insertBefore(allergyBanner, chargeBtn);
      }
      allergyBanner.innerHTML = `<span style="font-size:16px;">⚠️</span>
        <span><strong>ALLERGY ALERT:</strong> ${this._patient.allergies}</span>`;
    } else if (allergyBanner) {
      allergyBanner.remove();
    }

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

        <!-- Date filter -->
        <div style="padding:10px 20px 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:11px;color:var(--text-muted);margin-right:2px;">Show filled:</span>
          <button class="pp-filter" data-range="today" style="font-size:12px;padding:4px 12px;border:1px solid var(--border);border-radius:14px;background:var(--primary);color:#fff;cursor:pointer;">Today</button>
          <button class="pp-filter" data-range="week"  style="font-size:12px;padding:4px 12px;border:1px solid var(--border);border-radius:14px;background:var(--surface2);cursor:pointer;">This Week</button>
          <button class="pp-filter" data-range="all"   style="font-size:12px;padding:4px 12px;border:1px solid var(--border);border-radius:14px;background:var(--surface2);cursor:pointer;">All</button>
          <input type="date" id="pp-filter-date" style="font-size:12px;padding:3px 6px;margin-left:4px;" title="Pick a specific fill date" />
        </div>

        <!-- Rx list -->
        <div style="flex:1;overflow-y:auto;padding:0;">
          <div style="padding:12px 20px 6px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:12px;font-weight:700;text-transform:uppercase;
                         letter-spacing:.04em;color:var(--text-muted);">Prescriptions</span>
            <label style="font-size:12px;color:var(--text-muted);cursor:pointer;">
              <input type="checkbox" id="pp-select-all" style="margin-right:4px;">Select all shown
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
            background:var(--primary);color:#fff;cursor:pointer;font-size:13px;font-weight:600;">
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

        // Normalise a fill date to YYYY-MM-DD for comparison
        const toYmd = d => {
          if (!d) return '';
          const s = String(d);
          if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
          return s.slice(0, 10);
        };
        const todayYmd = (typeof localDateStr === 'function')
          ? localDateStr(new Date()) : new Date().toISOString().slice(0,10);
        const weekAgoYmd = new Date(Date.now() - 6*86400000).toISOString().slice(0,10);

        let currentRange = 'today';   // today | week | all | a specific YYYY-MM-DD

        // Running total of selected (non-disabled) prescriptions
        const updateTotal = () => {
          const checked = [...overlay.querySelectorAll('.pp-cb:checked:not(:disabled)')];
          const sum = checked.reduce((s, cb) => s + (pending[parseInt(cb.dataset.idx)]?.copay || 0), 0);
          statusEl.textContent = checked.length
            ? `${checked.length} selected · ${Tax.fmt(sum)}`
            : '';
        };

        const matchesFilter = r => {
          const ymd = toYmd(r.fillDate);
          if (currentRange === 'all')   return true;
          if (currentRange === 'today') return ymd === todayYmd;
          if (currentRange === 'week')  return ymd >= weekAgoYmd && ymd <= todayYmd;
          return ymd === currentRange;  // specific picked date
        };

        const renderList = () => {
          const visible = pending.filter(matchesFilter);
          if (!visible.length) {
            listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">
              No prescriptions match this date filter.</div>`;
            updateTotal();
            return;
          }
          listEl.innerHTML = visible.map(r => {
            const i = pending.indexOf(r);
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
                               overflow:hidden;text-overflow:ellipsis;">Rx #${r.rxNumber}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                    ${r.qty      ? `Qty: ${r.qty}`                         : ''}
                    ${r.fillDate ? ` &nbsp;·&nbsp; Filled: ${fmtDate(r.fillDate)}` : ''}
                    ${already    ? ` &nbsp;·&nbsp; <em>already in cart</em>` : ''}
                  </div>
                </div>
                <div style="font-size:15px;font-weight:700;color:var(--primary);white-space:nowrap;">
                  $${r.copay.toFixed(2)}
                </div>
              </label>`;
          }).join('');
          // wire checkbox totals
          listEl.querySelectorAll('.pp-cb').forEach(cb => cb.addEventListener('change', updateTotal));
          overlay.querySelector('#pp-select-all').checked = false;
          updateTotal();
        };

        // Filter button wiring
        overlay.querySelectorAll('.pp-filter').forEach(btn => {
          btn.addEventListener('click', () => {
            currentRange = btn.dataset.range;
            overlay.querySelector('#pp-filter-date').value = '';
            overlay.querySelectorAll('.pp-filter').forEach(b => {
              b.style.background = 'var(--surface2)'; b.style.color = '';
            });
            btn.style.background = 'var(--primary)'; btn.style.color = '#fff';
            renderList();
          });
        });
        overlay.querySelector('#pp-filter-date').addEventListener('change', e => {
          if (!e.target.value) return;
          currentRange = e.target.value;
          overlay.querySelectorAll('.pp-filter').forEach(b => {
            b.style.background = 'var(--surface2)'; b.style.color = '';
          });
          renderList();
        });

        overlay.querySelector('#pp-select-all').addEventListener('change', e => {
          overlay.querySelectorAll('.pp-cb:not(:disabled)').forEach(cb => {
            cb.checked = e.target.checked;
          });
          updateTotal();
        });

        renderList();  // initial render (defaults to Today)
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
        const drugName = r.qty ? `${r.drug} [Qty:${r.qty}]` : r.drug;       // internal only
        const desc = `Rx ${r.rxNumber}${r.qty ? ` [Qty:${r.qty}]` : ''}`;   // patient-facing
        this._cart.push({
          item_type:      'RX',
          rx_number:      r.rxNumber,
          branch_code:    branchCode,
          din:            r.din,
          description:    desc,
          drug_name:      drugName,
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

  /* ---- Partial Refund Modal ---- */
  _showPartialRefundModal(txnId, onDone) {
    const txn   = DB.getTransaction(txnId);
    const items = DB.getItemsForTransaction(txnId).filter(i => i.line_total > 0);
    if (!txn || !items.length) { alert('No returnable items found.'); return; }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>↩ Return Items — Txn #${txnId}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
            Select items to return. A refund transaction will be created and a receipt printed.
          </p>
          <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:14px;">
            <label style="display:flex;align-items:center;gap:10px;padding:8px 14px;
                           background:var(--surface2);border-bottom:1px solid var(--border);
                           cursor:pointer;font-size:13px;font-weight:600;">
              <input type="checkbox" id="refund-select-all" />
              Select all items
            </label>
            ${items.map((item, i) => `
              <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                             cursor:pointer;font-size:13px;
                             ${i < items.length-1 ? 'border-bottom:1px solid var(--border);' : ''}">
                <input type="checkbox" class="refund-item-cb" data-idx="${i}" />
                <span style="flex:1;">${item.description}
                  ${item.rx_number ? `<span style="font-size:11px;color:var(--text-muted);"> — Rx# ${item.rx_number}</span>` : ''}
                </span>
                <strong style="color:var(--danger);">-${Tax.fmt(item.line_total)}</strong>
              </label>`).join('')}
          </div>

          <div style="display:flex;justify-content:space-between;padding:10px 14px;
                      background:var(--surface2);border-radius:var(--radius);font-size:14px;">
            <span>Refund Total:</span>
            <strong id="refund-total" style="color:var(--danger);">$0.00</strong>
          </div>

          <div class="form-group" style="margin-top:14px;">
            <label>Reason for Return</label>
            <select id="refund-reason">
              <option value="Customer Return">Customer Return</option>
              <option value="Wrong Item">Wrong Item Dispensed</option>
              <option value="Damaged">Damaged / Defective</option>
              <option value="Overpayment">Overpayment Correction</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div id="refund-err" class="alert alert-danger" style="display:none;margin-top:8px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="refund-cancel">Cancel</button>
          <button class="btn btn-danger" id="refund-confirm" disabled>Process Refund</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    const close  = () => modal.remove();
    const errEl  = modal.querySelector('#refund-err');
    const totalEl= modal.querySelector('#refund-total');
    const confirmBtn = modal.querySelector('#refund-confirm');

    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#refund-cancel').addEventListener('click', close);

    const updateTotal = () => {
      const checked = [...modal.querySelectorAll('.refund-item-cb:checked')];
      const total   = checked.reduce((s, cb) => s + (items[parseInt(cb.dataset.idx)]?.line_total || 0), 0);
      totalEl.textContent     = `-${Tax.fmt(total)}`;
      confirmBtn.disabled     = checked.length === 0;
    };

    modal.querySelector('#refund-select-all').addEventListener('change', e => {
      modal.querySelectorAll('.refund-item-cb').forEach(cb => { cb.checked = e.target.checked; });
      updateTotal();
    });
    modal.querySelectorAll('.refund-item-cb').forEach(cb => cb.addEventListener('change', updateTotal));

    modal.querySelector('#refund-confirm').addEventListener('click', async () => {
      const checked     = [...modal.querySelectorAll('.refund-item-cb:checked')];
      const reason      = modal.querySelector('#refund-reason').value;
      const returnItems = checked.map(cb => items[parseInt(cb.dataset.idx)]);

      if (!returnItems.length) {
        errEl.style.display = 'block'; errEl.textContent = 'Select at least one item.'; return;
      }

      confirmBtn.disabled    = true;
      confirmBtn.textContent = 'Processing…';
      errEl.style.display    = 'none';

      // Work out if this transaction had a card (Clover) payment
      const payments      = DB.getPaymentsForTransaction(txnId);
      const cardPayment   = payments.find(p =>
        ['DEBIT','CREDIT','MANUAL_ENTRY'].includes((p.method||'').toUpperCase()) && p.amount > 0
      );
      const refundAmtCents = Math.round(
        returnItems.reduce((s, i) => s + Math.abs(i.line_total || 0), 0) * 100
      );
      const hasClover = !!cardPayment?.clover_payment_id;

      try {
        // ── Step 1: Clover terminal refund (if card was used) ──────────
        if (cardPayment && refundAmtCents > 0) {
          confirmBtn.textContent = hasClover
            ? 'Sending to Clover terminal…'
            : 'Manual card refund — processing…';

          try {
            const cloverResult = await CloverAPI.refund(
              refundAmtCents,
              cardPayment.clover_payment_id || null
            );
            if (!cloverResult.ok) throw new Error(cloverResult.message || 'Clover refund failed');
            confirmBtn.textContent = '✓ Card refunded — saving record…';
          } catch (cloverErr) {
            if (cloverErr.code === 'PAYMENT_CANCELLED') {
              errEl.style.display   = 'block';
              errEl.textContent     = 'Refund cancelled on terminal. No record created.';
              confirmBtn.disabled   = false;
              confirmBtn.textContent = 'Process Refund';
              return;
            }
            // Non-cancel error — warn but still create the record
            console.warn('Clover refund error:', cloverErr.message);
            errEl.style.display = 'block';
            errEl.textContent   = `⚠ Card terminal error: ${cloverErr.message} — record saved, process card refund manually on Clover.`;
          }
        }

        // ── Step 2: Create refund transaction in DB ─────────────────────
        confirmBtn.textContent = 'Saving refund record…';
        const refundTxnId = DB.createRefundTransaction(txnId, returnItems, Auth.current()?.name);
        Audit.refund(txnId, `Partial refund #${refundTxnId} — ${reason} — by ${Auth.current()?.name}`);

        // ── Step 3: Print refund receipt ────────────────────────────────
        const refundTxn   = DB.getTransaction(refundTxnId);
        const refundedItems = DB.getItemsForTransaction(refundTxnId);
        const patient     = txn.patient_id ? DB.getPatient(txn.patient_id) : null;
        refundTxn.notes   = `↩ Refund for Txn #${txnId} — ${reason}`;
        Print.printReceipt(refundTxn, refundedItems, [], patient);

        confirmBtn.textContent      = '✓ Refund Complete';
        confirmBtn.style.background = 'var(--success)';
        setTimeout(() => { close(); if (onDone) onDone(); }, 1500);

      } catch(e) {
        errEl.style.display    = 'block';
        errEl.textContent      = 'Refund failed: ' + e.message;
        confirmBtn.disabled    = false;
        confirmBtn.textContent = 'Process Refund';
      }
    });
  }

  /* ---- BTC PDF — auto-save to configured folder ---- */
  async _saveBtcPdf(txnId) {
    if (!window.electronAPI?.savePdfFile) {
      console.warn('[BTC PDF] SKIPPED — window.electronAPI.savePdfFile not available. Rebuild the app with the latest preload.js.');
      this._setStatus('warn', '⚠ BTC record not saved — app needs rebuild (savePdfFile missing)');
      return;
    }
    const folderPath = await Config.get('btc_records_folder');
    if (!folderPath) {
      console.warn('[BTC PDF] SKIPPED — no folder configured. Set it in Settings → BTC Records.');
      this._setStatus('warn', '⚠ BTC record not saved — no folder set (Settings → BTC Records)');
      return;
    }
    console.log('[BTC PDF] Folder path:', folderPath);

    const txn   = DB.getTransaction(txnId);
    const logs  = DB.getBtcLogAll().filter(l => l.transaction_id === txnId);
    if (!logs.length) {
      console.warn('[BTC PDF] SKIPPED — no BTC log entries found for txn', txnId);
      return;
    }
    console.log('[BTC PDF] Generating PDF for', logs.length, 'BTC item(s)...');

    const ph    = await Config.getAll();
    const now   = new Date();
    const stamp = now.toISOString().slice(0,19).replace(/[T:]/g,'-');
    const drug  = logs[0].drug_name.replace(/[^a-zA-Z0-9]/g,'').slice(0,20);
    const rph   = (logs[0].pharmacist_name||'').replace(/[^a-zA-Z0-9]/g,'').slice(0,15);
    const fname = `${stamp}_${drug}_${rph}.pdf`;

    const rows  = logs.map(l => `
      <tr>
        <td>${new Date(l.sale_date).toLocaleString()}</td>
        <td><strong>${l.drug_name}</strong>${l.din?` <small>(DIN: ${l.din})</small>`:''}</td>
        <td style="text-align:center;">${l.quantity}</td>
        <td>$${(l.price||0).toFixed(2)}</td>
        <td>${l.pharmacist_name||''}</td>
        <td style="text-align:center;">${l.counselled?'✅':'—'}</td>
        <td>${l.patient_name||'—'}</td>
        <td>${l.patient_phone||'—'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        @page{size:Letter landscape;margin:12mm;}
        body{font-family:Arial,sans-serif;font-size:11pt;padding:0;margin:0;}
        h2{margin:0 0 4px;}h4{margin:0 0 16px;color:#555;font-weight:400;}
        table{width:100%;border-collapse:collapse;margin-top:16px;}
        th{background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;text-align:left;font-size:10pt;}
        td{padding:7px 10px;border:1px solid #ddd;font-size:10pt;}
        .footer{margin-top:24px;font-size:9pt;color:#777;border-top:1px solid #ccc;padding-top:8px;}
      </style></head><body>
      <h2>${ph.pharmacy_name||'Pharmacy'} — BTC / Controlled Substance Record</h2>
      <h4>Transaction #${txnId} &nbsp;·&nbsp; ${now.toLocaleDateString('en-CA',{year:'numeric',month:'long',day:'numeric'})}</h4>
      <table>
        <thead><tr>
          <th>Date/Time</th><th>Drug</th><th>Qty</th><th>Price</th>
          <th>Pharmacist</th><th>Counselled</th><th>Patient Name</th><th>Phone</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">Generated by Pharmacy POS &nbsp;·&nbsp; For internal records only</div>
    </body></html>`;

    try {
      // Use A5 PDF for a proper readable record (not the narrow 80mm receipt size)
      const generateFn = window.electronAPI.generateA5Pdf || window.electronAPI.generateReceiptPdf;
      if (generateFn) {
        const b64 = await generateFn(html);
        if (b64) {
          const result = await window.electronAPI.savePdfFile({ base64: b64, filename: fname, folderPath });
          if (result?.ok) {
            console.log('[BTC PDF] ✓ Saved:', result.path);
            this._setStatus('success', `✓ BTC record saved: ${result.path}`);
          } else {
            console.warn('[BTC PDF] Save FAILED:', result?.error);
            this._setStatus('error', `⚠ BTC PDF save failed: ${result?.error || 'unknown error'}`);
          }
        } else {
          console.warn('[BTC PDF] PDF generation returned empty');
          this._setStatus('error', '⚠ BTC PDF generation failed (empty result)');
        }
      }
    } catch(e) { console.warn('BTC PDF save error:', e.message); }
  }

  /* ---- BTC / Controlled Substance Counselling Modal ---- */
  _showBtcCounsellingModal(controlledItems, onProceed) {
    const isCtrl     = controlledItems.some(i => i._schedule_flag === 'btc_ctrl');
    const isBtc      = controlledItems.some(i => i._schedule_flag === 'btc') && !isCtrl;
    const nameRequired = isCtrl; // Controlled BTC requires patient name
    const staff      = Auth.current();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:460px;">
        <div class="modal-header" style="background:${isCtrl?'#ffe5cc':'#fff3cd'};border-radius:var(--radius) var(--radius) 0 0;">
          <h3 style="color:${isCtrl?'#a04000':'#856404'};">
            ${isCtrl ? '🟠 Controlled BTC — Patient Name Required' : '🟡 Behind the Counter (Schedule II)'}
          </h3>
        </div>
        <div class="modal-body">

          <div style="margin-bottom:14px;">
            ${controlledItems.map(i => `
              <div style="display:flex;justify-content:space-between;padding:6px 0;
                          border-bottom:1px solid var(--border);font-size:13px;">
                <span><strong>${i.description}</strong></span>
                <span class="badge" style="background:${i._schedule_flag==='btc_ctrl'?'#ffe5cc':'#fff3cd'};
                  color:${i._schedule_flag==='btc_ctrl'?'#a04000':'#856404'};">
                  ${i._schedule_flag==='btc_ctrl'?'CTRL BTC':'BTC'}
                </span>
              </div>`).join('')}
          </div>

          <!-- Counselling checklist -->
          <div style="background:var(--surface2);border-radius:var(--radius);padding:12px 14px;margin-bottom:14px;">
            <div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">
              Pharmacist Counselling
            </div>
            <label style="display:flex;gap:10px;align-items:center;margin-bottom:8px;cursor:pointer;font-size:13px;">
              <input type="checkbox" id="btc-chk-counsel" style="width:16px;height:16px;" />
              Patient counselled on use, dosage &amp; side effects
            </label>
            <label style="display:flex;gap:10px;align-items:center;margin-bottom:8px;cursor:pointer;font-size:13px;">
              <input type="checkbox" id="btc-chk-allergy" style="width:16px;height:16px;" />
              Allergies &amp; interactions reviewed
            </label>
            <label style="display:flex;gap:10px;align-items:center;cursor:pointer;font-size:13px;">
              <input type="checkbox" id="btc-chk-id" style="width:16px;height:16px;" />
              Patient identity confirmed
            </label>
          </div>

          <!-- Optional patient name + phone (not mandatory for BTC) -->
          <div style="background:${nameRequired?'#fff8f2':'var(--surface2)'};
                      border:${nameRequired?'1px solid #ffa04a':''};
                      border-radius:var(--radius);padding:12px 14px;margin-bottom:4px;">
            <div style="font-weight:700;font-size:12px;text-transform:uppercase;
                        color:${nameRequired?'#a04000':'var(--text-muted)'};margin-bottom:10px;">
              Patient Info
              <span style="font-weight:400;font-size:11px;text-transform:none;margin-left:6px;
                           color:${nameRequired?'#a04000':'var(--text-muted)'};">
                ${nameRequired ? '⚠ Name required for Controlled BTC' : '(optional for BTC — your records only)'}
              </span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label style="font-size:12px;color:var(--text-muted);">
                  Name ${nameRequired ? '<span style="color:var(--danger);">*</span>' : ''}
                </label>
                <input id="btc-pt-name" type="text"
                  placeholder="${nameRequired ? 'Patient name (required)' : 'Patient name (optional)'}"
                  value="${this._patient ? this._patient.given_name+' '+this._patient.surname : ''}"
                  style="margin-top:4px;width:100%;box-sizing:border-box;
                         ${nameRequired ? 'border-color:#ffa04a;' : ''}" />
              </div>
              <div>
                <label style="font-size:12px;color:var(--text-muted);">Phone</label>
                <input id="btc-pt-phone" type="tel" placeholder="Phone number (optional)"
                  value="${this._patient?.phone||this._patient?.cell||''}"
                  style="margin-top:4px;width:100%;box-sizing:border-box;" />
              </div>
            </div>
          </div>

          <div id="btc-err" class="alert alert-danger" style="display:none;margin-top:10px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="btc-cancel">Cancel</button>
          <button class="btn btn-primary" id="btc-confirm">
            ✓ Counselled — Proceed to Payment
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    const close  = () => modal.remove();
    const errEl  = modal.querySelector('#btc-err');

    modal.querySelector('#btc-cancel').addEventListener('click', close);

    modal.querySelector('#btc-confirm').addEventListener('click', async () => {
      const chkCounsel = modal.querySelector('#btc-chk-counsel').checked;
      const chkAllergy = modal.querySelector('#btc-chk-allergy').checked;
      const chkId      = modal.querySelector('#btc-chk-id').checked;
      const ptName     = modal.querySelector('#btc-pt-name').value.trim();
      const ptPhone    = modal.querySelector('#btc-pt-phone').value.trim();

      if (!chkCounsel) {
        errEl.style.display = 'block';
        errEl.textContent   = 'Please confirm the patient has been counselled before proceeding.';
        return;
      }

      // Controlled BTC requires patient name
      if (nameRequired && !ptName) {
        errEl.style.display = 'block';
        errEl.textContent   = 'Patient name is required for Controlled BTC items.';
        modal.querySelector('#btc-pt-name').focus();
        return;
      }

      // Log each controlled item to btc_log (transaction_id filled in after save)
      const pharmacist = staff?.name || '';
      modal._btcLogEntries = controlledItems.map(item => ({
        drug_name:      item.drug_name || item.description,   // real name for the legal log
        din:            item.din || null,
        quantity:       item.quantity || 1,
        price:          item.line_total,
        pharmacist_name: pharmacist,
        counselled:     chkCounsel,
        patient_name:   ptName || null,
        patient_phone:  ptPhone || null,
        schedule_flag:  item._schedule_flag,
      }));

      // Store on POS instance so saveTransaction can pick them up
      this._pendingBtcLog = modal._btcLogEntries;

      close();
      onProceed();
    });

    setTimeout(() => modal.querySelector('#btc-chk-counsel')?.focus(), 100);
  }

  /* ---- Discount Modal ---- */
  _showDiscountModal() {
    if (this._cart.length === 0) return;
    const totals = Tax.calcCartTotals(this._cart);
    const modal  = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:400px;">
        <div class="modal-header">
          <h3>% Apply Discount</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">

          <!-- Quick preset buttons — tap one to select -->
          <div class="form-group">
            <label>Quick Select</label>
            <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:4px;">
              ${[5,10,15,20,25,50].map(p =>
                `<button class="btn btn-outline disc-pct-btn"
                  data-pct="${p}"
                  style="font-size:14px;font-weight:700;padding:10px 0;">${p}%</button>`
              ).join('')}
            </div>
          </div>

          <!-- Or type custom % -->
          <div class="form-group">
            <label>Or enter custom %</label>
            <input type="number" id="disc-pct" min="0.1" max="100" step="0.1"
                   placeholder="e.g. 12.5"
                   style="font-size:20px;text-align:center;max-width:140px;" />
          </div>

          <!-- Applies to -->
          <div class="form-group">
            <label>Applies to</label>
            <select id="disc-type">
              <option value="cart">Whole cart (subtotal ${Tax.fmt(totals.subtotal)})</option>
              <option value="item">Single item</option>
            </select>
          </div>
          <div id="disc-item-row" class="form-group" style="display:none;">
            <label>Which item?</label>
            <select id="disc-item-select">
              ${this._cart.filter(i => i.item_type !== 'DISCOUNT').map((item, i) =>
                `<option value="${i}">${item.description} — ${Tax.fmt(item.line_total)}</option>`
              ).join('')}
            </select>
          </div>

          <!-- Reason -->
          <div class="form-group">
            <label>Reason</label>
            <select id="disc-reason">
              <option value="Staff Discount">Staff Discount</option>
              <option value="Senior Discount">Senior Discount</option>
              <option value="Loyalty">Loyalty</option>
              <option value="Promotion">Promotion</option>
              <option value="Courtesy">Courtesy</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <!-- Live preview -->
          <div id="disc-preview"
               style="background:var(--surface2);border-radius:var(--radius);
                      padding:12px 14px;font-size:14px;display:none;text-align:center;">
          </div>

          <!-- Error -->
          <div id="disc-err" class="alert alert-danger" style="display:none;margin-top:8px;"></div>

        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="disc-cancel">Cancel</button>
          <button class="btn btn-danger btn-lg" id="disc-apply" style="min-width:160px;">
            Apply Discount
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const close    = () => modal.remove();
    const typeEl   = modal.querySelector('#disc-type');
    const itemRow  = modal.querySelector('#disc-item-row');
    const pctInput = modal.querySelector('#disc-pct');
    const preview  = modal.querySelector('#disc-preview');
    const errEl    = modal.querySelector('#disc-err');

    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#disc-cancel').addEventListener('click', close);

    /* ── Define updatePreview FIRST, then attach listeners ── */
    function updatePreview() {
      const pct = parseFloat(pctInput.value);
      errEl.style.display = 'none';
      if (!pct || pct <= 0 || pct > 100) { preview.style.display = 'none'; return; }
      let baseAmount;
      if (typeEl.value === 'item') {
        const idx = parseInt(modal.querySelector('#disc-item-select').value) || 0;
        baseAmount = Math.abs(totals.subtotal); // fallback
        const nonDisc = modal._cartItems || [];
        if (nonDisc[idx]) baseAmount = Math.abs(nonDisc[idx].line_total);
      } else {
        baseAmount = totals.subtotal;
      }
      const discAmt = Tax.round2(baseAmount * pct / 100);
      preview.style.display = 'block';
      preview.innerHTML =
        `<span style="color:var(--danger);font-size:18px;font-weight:800;">-${Tax.fmt(discAmt)}</span>` +
        `<span style="color:var(--text-muted);font-size:12px;margin-left:6px;">
          ${pct}% off ${typeEl.value === 'cart' ? 'cart' : 'item'}
        </span>`;
    }

    // Store non-discount cart items for item-mode lookup
    modal._cartItems = this._cart.filter(i => i.item_type !== 'DISCOUNT');

    // Preset buttons
    modal.querySelectorAll('.disc-pct-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.disc-pct-btn').forEach(b => b.classList.remove('btn-primary'));
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-outline');
        pctInput.value = btn.dataset.pct;
        updatePreview();
      });
    });

    // Type toggle
    typeEl.addEventListener('change', () => {
      itemRow.style.display = typeEl.value === 'item' ? 'block' : 'none';
      updatePreview();
    });

    pctInput.addEventListener('input', updatePreview);
    modal.querySelector('#disc-item-select')?.addEventListener('change', updatePreview);

    // Apply
    modal.querySelector('#disc-apply').addEventListener('click', () => {
      const pct    = parseFloat(pctInput.value);
      const reason = modal.querySelector('#disc-reason').value;

      if (!pct || pct <= 0 || pct > 100) {
        errEl.style.display = 'block';
        errEl.textContent   = 'Please select a quick % above or type a percentage first.';
        pctInput.focus();
        return;
      }

      let discAmt, description;
      if (typeEl.value === 'item') {
        const nonDisc = modal._cartItems;
        const idx     = parseInt(modal.querySelector('#disc-item-select').value) || 0;
        const item    = nonDisc[idx];
        if (!item) { errEl.style.display = 'block'; errEl.textContent = 'Item not found.'; return; }
        discAmt     = Tax.round2(Math.abs(item.line_total) * pct / 100);
        description = `${reason} — ${pct}% off ${item.description}`;
      } else {
        discAmt     = Tax.round2(totals.subtotal * pct / 100);
        description = `${reason} — ${pct}% cart discount`;
      }

      if (discAmt <= 0) {
        errEl.style.display = 'block';
        errEl.textContent   = 'Discount amount is $0.00 — nothing to apply.';
        return;
      }

      this._cart.push({
        item_type:      'DISCOUNT',
        description,
        quantity:       1,
        unit_price:     -discAmt,
        gst_applicable: false,
        pst_applicable: false,
        line_total:     -discAmt,
      });
      this._updateDisplay();
      this._setStatus('success', `Discount applied: -${Tax.fmt(discAmt)}`);
      close();
    });

    // Focus the first preset button for quick keyboard use
    setTimeout(() => modal.querySelector('.disc-pct-btn')?.focus(), 80);
  }

  /* ---- Payment Modal ---- */
  /* Canadian nickel rounding: round to nearest $0.05 */
  _cashRound(amount) {
    return Math.round(amount * 20) / 20;
  }

  _showPaymentModal() {
    if (this._cart.length === 0) return;

    // Check for BTC / Narcotic items — must counsel before payment
    const controlledItems = this._cart.filter(i =>
      i._schedule_flag === 'btc' || i._schedule_flag === 'btc_ctrl'
    );
    if (controlledItems.length > 0) {
      this._showBtcCounsellingModal(controlledItems, () => this._openPaymentModal());
      return;
    }
    this._openPaymentModal();
  }

  _openPaymentModal() {
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
              ${['Cash','Debit','Credit','Insurance','AR'].map(m =>
                `<button class="payment-method-btn" data-method="${m === 'AR' ? 'AR' : m.toUpperCase()}"
                  ${m === 'AR' && !this._patient ? 'disabled title="Link a patient first to use AR"' : ''}
                >${m === 'AR' ? '🧾 AR (Account)' : m}</button>`
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
        const isAR          = selectedMethod === 'AR';
        const isClover      = selectedMethod === 'DEBIT' || selectedMethod === 'CREDIT';
        const isManualEntry = selectedMethod === 'MANUAL_ENTRY';
        const isCloverAny   = isClover || isManualEntry;
        const remaining = getRemaining();

        // AR — show patient balance and charge immediately
        if (isAR) {
          const arSummary = this._patient ? DB.getPatientARSummary(this._patient.patient_id) : null;
          const outstanding = arSummary?.outstanding || 0;
          modal.querySelector('#pm-entry').style.display = 'block';
          modal.querySelector('#pm-cash-extras').style.display = 'none';
          modal.querySelector('#pm-clover-hint').style.display = 'none';
          modal.querySelector('#pm-amount').value = Tax.round2(remaining).toFixed(2);
          modal.querySelector('#pm-amt-label').textContent = 'Amount to charge to AR';
          if (this._patient) {
            let arInfo = modal.querySelector('#pm-ar-info');
            if (!arInfo) {
              arInfo = document.createElement('div');
              arInfo.id = 'pm-ar-info';
              arInfo.style.cssText = 'font-size:12px;padding:8px 10px;background:var(--surface2);border-radius:var(--radius);margin-bottom:8px;';
              modal.querySelector('#pm-amount').parentNode.insertAdjacentElement('afterend', arInfo);
            }
            arInfo.innerHTML = `<strong>${this._patient.given_name} ${this._patient.surname}</strong>` +
              (outstanding > 0 ? ` &nbsp;·&nbsp; <span style="color:var(--danger);">Current balance: ${Tax.fmt(outstanding)}</span>` : ' &nbsp;·&nbsp; <span style="color:var(--success);">No outstanding balance</span>');
          }
          modal.querySelector('#pm-add-btn').textContent = 'Charge to AR';
          return;
        }

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
      // Must be a full CloverAPI.CARD_ENTRY value — the bare base bits (8 / 15) are
      // discarded by the terminal in kiosk mode, which is why manual entry never showed.
      const cardEntryMethods = isManualEntry
        ? CloverAPI.CARD_ENTRY.MANUAL
        : CloverAPI.CARD_ENTRY.ALL;
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
        // Offer to email the receipt (corner prompt — won't block the RPh modal)
        this._offerPostSaleEmail(saved, savedPatient);
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
  async _runCloverPayment(modal, totals, method, close, onSuccess = null,
                          cardEntryMethods = CloverAPI.CARD_ENTRY.ALL) {
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
        setMsg(cardEntryMethods === CloverAPI.CARD_ENTRY.MANUAL
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
        setMsg(cardEntryMethods === CloverAPI.CARD_ENTRY.MANUAL
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
      // Deduct inventory for OTC / custom items that have a tracked product ID
      if (item._product_id && item._product_source) {
        DB.adjustStock(item._product_source, item._product_id, -(item.quantity || 1));
      }
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

    // Save any pending BTC / controlled substance log entries
    if (this._pendingBtcLog?.length) {
      this._pendingBtcLog.forEach(entry => {
        try { DB.addBtcLog({ ...entry, transaction_id: txnId }); } catch(_) {}
      });
      this._pendingBtcLog = null;

      // Auto-save BTC PDF to configured folder
      this._saveBtcPdf(txnId).catch(e => console.warn('BTC PDF save failed:', e.message));
    }

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

      resultsEl.querySelectorAll('[data-action="refund"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const txnId = parseInt(btn.dataset.txnid);
          this._showPartialRefundModal(txnId, () => refresh());
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
              const canVoid   = isToday && t.status !== 'REVERSED' && t.transaction_type !== 'REFUND';
              const canRefund = t.status === 'PAID' && t.transaction_type !== 'REFUND';
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
                  ${canRefund ? `<button class="btn btn-sm btn-warning" data-action="refund" data-txnid="${t.transaction_id}" style="margin-right:4px;background:#fd7e14;color:#fff;border:none;">↩ Return</button>` : ''}
                  ${canVoid   ? `<button class="btn btn-sm btn-danger"  data-action="void"   data-txnid="${t.transaction_id}">Void</button>` : ''}
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
      // Start-of-Day opening checklist
      if (typeof Checklists !== 'undefined') {
        const sh = DB.getActiveShift();
        Checklists.show('open', { shift_id: sh?.shift_id });
      }
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
      const shiftId = shift.shift_id;
      DB.closeShift(shiftId, counted, notes);
      const variance = Tax.round2(counted - summary.expectedCash);
      Audit.configChange(`Shift closed by ${Auth.current()?.name} — counted ${Tax.fmt(counted)}, variance ${Tax.fmt(variance)}`);
      close();
      this._updateShiftIndicator();
      this._setStatus('', `Shift closed — ${Tax.fmt(summary.txnSummary.total_sales)} total sales`);
      // End-of-Day sign-off checklist
      if (typeof Checklists !== 'undefined') {
        Checklists.show('close', { shift_id: shiftId });
      }
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

  /* ---- Cart quantity stepper (OTC / Custom items) ---- */
  _changeItemQty(idx, delta) {
    const item = this._cart[idx];
    if (!item) return;
    const newQty = Math.max(1, (item.quantity || 1) + delta);
    item.quantity   = newQty;
    item.line_total = Tax.round2((item.unit_price || 0) * newQty);
    this._updateDisplay();
  }

  /* ---- Hold cart with a reason (park multiple sales) ---- */
  _heldKey() { return 'pos_held_carts'; }
  _getHeldCarts() {
    try { return JSON.parse(localStorage.getItem(this._heldKey()) || '[]'); } catch(_) { return []; }
  }
  _setHeldCarts(list) {
    try { localStorage.setItem(this._heldKey(), JSON.stringify(list)); } catch(_) {}
    this._refreshHeldCount();
  }
  _refreshHeldCount() {
    const n = this._getHeldCarts().length;
    // Held Carts tile is always visible; show the count badge only when > 0
    const tileCount = this._el?.querySelector('#tile-held-count');
    if (tileCount) {
      tileCount.textContent = n;
      tileCount.style.display = n ? 'inline-block' : 'none';
    }
  }

  async _holdCartWithReason() {
    if (!this._cart.length) { this._setStatus('error', 'Cart is empty — nothing to hold.'); return; }
    const reason = await this._askHoldReason();
    if (reason === null) return;  // cancelled
    const label = reason.trim() || 'Held cart';
    const held = this._getHeldCarts();
    held.push({
      id:      Date.now(),
      reason:  label,
      patient: this._patient || null,
      cart:    this._cart,
      total:   Tax.calcCartTotals(this._cart).total_amount,
      heldAt:  new Date().toISOString(),
      heldBy:  Auth.current()?.name || '',
    });
    this._setHeldCarts(held);
    this.newTransaction();
    this._refreshHeldCount();
    this._setStatus('success', `Cart held — ${label}`);
  }

  // In-app reason prompt (Electron has no window.prompt). Resolves to the
  // entered string, or null if cancelled.
  _askHoldReason() {
    return new Promise(resolve => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal" style="max-width:400px;">
          <div class="modal-header"><h3>⏸ Hold Cart</h3></div>
          <div class="modal-body">
            <div class="form-group">
              <label>Reason / label (optional)</label>
              <input type="text" id="hr-input" autocomplete="off" style="font-size:16px;"
                     placeholder='e.g. "Delivery — J. Smith", "Waiting for price"' />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="hr-cancel">Cancel</button>
            <button class="btn btn-primary" id="hr-hold">Hold Cart</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const input = modal.querySelector('#hr-input');
      input.focus();
      const done = (val) => { modal.remove(); resolve(val); };
      modal.querySelector('#hr-cancel').addEventListener('click', () => done(null));
      modal.querySelector('#hr-hold').addEventListener('click', () => done(input.value));
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') done(input.value);
        else if (e.key === 'Escape') done(null);
      });
    });
  }

  _showHeldCartsModal() {
    const held = this._getHeldCarts();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>⏸ Held Carts</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          ${held.length ? held.map(h => {
            const when = new Date(h.heldAt).toLocaleString('en-CA',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
            const who  = h.patient ? `${h.patient.given_name} ${h.patient.surname}` : 'No patient';
            return `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:13px;">${h.reason}</div>
                  <div style="font-size:11px;color:var(--text-muted);">
                    ${h.cart.length} item${h.cart.length!==1?'s':''} · ${Tax.fmt(h.total)} · ${who} · ${when}
                  </div>
                </div>
                <button class="btn btn-primary btn-sm held-resume" data-id="${h.id}">Resume</button>
                <button class="btn btn-sm held-del" data-id="${h.id}" style="color:var(--danger);background:none;border:none;cursor:pointer;font-size:16px;">✕</button>
              </div>`;
          }).join('') : '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">No held carts.</div>'}
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline modal-close-btn">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('.modal-close-btn').addEventListener('click', close);

    modal.querySelectorAll('.held-resume').forEach(btn => btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const list = this._getHeldCarts();
      const h = list.find(x => x.id === id);
      if (!h) return;
      if (this._cart.length && !confirm('Resuming will replace the current cart. Continue?')) return;
      this._cart    = h.cart;
      this._patient = h.patient;
      this._pendingRxLoaded = false;
      this._setHeldCarts(list.filter(x => x.id !== id));
      this._updateDisplay();
      this._updatePatientBar();
      this._setStatus('success', `Resumed: ${h.reason}`);
      close();
    }));
    modal.querySelectorAll('.held-del').forEach(btn => btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      this._setHeldCarts(this._getHeldCarts().filter(x => x.id !== id));
      close(); this._showHeldCartsModal();
    }));
  }

  /* ---- Email a receipt to the patient (or a typed address) ---- */
  // In-app email prompt (Electron has no window.prompt). Resolves to a
  // trimmed address, or null if cancelled.
  _askEmailAddress(preset) {
    return new Promise(resolve => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal" style="max-width:360px;">
          <div class="modal-header"><h3>✉ Email Receipt</h3></div>
          <div class="modal-body">
            <div class="form-group">
              <label>Send receipt to:</label>
              <input type="email" id="ea-input" placeholder="name@example.com"
                     value="${(preset || '').replace(/"/g, '&quot;')}"
                     style="font-size:16px;" autocomplete="email" />
            </div>
            <div id="ea-err" class="login-error"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="ea-cancel">Cancel</button>
            <button class="btn btn-primary" id="ea-send">Send</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const input = modal.querySelector('#ea-input');
      const err   = modal.querySelector('#ea-err');
      input.focus(); input.select();
      const done = (val) => { modal.remove(); resolve(val); };
      const submit = () => {
        const addr = input.value.trim();
        if (!/.+@.+\..+/.test(addr)) { err.textContent = 'Enter a valid email address.'; return; }
        done(addr);
      };
      modal.querySelector('#ea-cancel').addEventListener('click', () => done(null));
      modal.querySelector('#ea-send').addEventListener('click', submit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') submit();
        else if (e.key === 'Escape') done(null);
      });
    });
  }

  async _emailReceipt(txn, items, payments, patient) {
    const preset = patient?.email || '';
    const addr = await this._askEmailAddress(preset);
    if (addr === null) return;          // cancelled
    if (!/.+@.+\..+/.test(addr)) { this._setStatus('error', 'Enter a valid email address.'); return; }

    this._setStatus('loading', 'Emailing receipt…');
    try {
      const ph     = await Config.getAll();
      const inner  = await Print.generateReceiptHTML(txn, items, payments, patient, null);
      const html   = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
        <body style="background:#f4f4f4;padding:16px;">
          <div style="max-width:340px;margin:0 auto;background:#fff;padding:16px;
                       border-radius:8px;font-family:'Courier New',monospace;">${inner}</div>
        </body></html>`;
      const res = await EmailAPI.send({
        to:       addr,
        subject:  `Receipt #${txn.transaction_id} — ${ph.pharmacy_name || 'Pharmacy'}`,
        htmlBody: html,
        textBody: `Receipt #${txn.transaction_id} — total ${Tax.fmt(txn.total_amount)}`,
      });
      if (res && res.ok === false) throw new Error(res.error || 'send failed');
      this._setStatus('success', `Receipt emailed to ${addr}`);
    } catch(e) {
      this._setStatus('error', 'Email failed: ' + e.message);
    }
  }

  /* ---- After a sale: offer to email the receipt (non-intrusive corner prompt) ---- */
  _offerPostSaleEmail(saved, patient) {
    if (!saved?.txn) return;
    // Remove any existing prompt
    document.getElementById('post-sale-email')?.remove();

    const box = document.createElement('div');
    box.id = 'post-sale-email';
    box.style.cssText = `position:fixed;bottom:16px;right:16px;z-index:9000;
      background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
      box-shadow:0 4px 20px rgba(0,0,0,.25);padding:14px 16px;max-width:300px;`;
    box.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">✓ Sale complete — #${saved.txn.transaction_id}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">
        ${patient?.email ? `Email receipt to ${patient.email}?` : 'Email a copy of the receipt?'}
      </div>
      <div style="display:flex;gap:8px;">
        <button id="pse-email" class="btn btn-primary btn-sm" style="flex:1;">✉ Email Receipt</button>
        <button id="pse-no" class="btn btn-outline btn-sm">No</button>
      </div>`;
    document.body.appendChild(box);

    box.querySelector('#pse-no').addEventListener('click', () => box.remove());
    box.querySelector('#pse-email').addEventListener('click', () => {
      box.remove();
      this._emailReceipt(saved.txn, saved.items, saved.payments, patient);
    });
    // Auto-dismiss after 20s
    setTimeout(() => box.remove(), 20000);
  }

  /* ---- Find a paid receipt by transaction # and reprint ---- */
  _showFindReceiptModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:460px;">
        <div class="modal-header">
          <h3>📋 Find Paid Receipt</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Transaction #</label>
            <input type="number" id="fr-txn" placeholder="e.g. 1042" style="font-size:18px;" autocomplete="off" />
          </div>
          <div id="fr-result" style="margin-top:10px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="fr-cancel">Close</button>
          <button class="btn btn-primary" id="fr-find">Find</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#fr-cancel').addEventListener('click', close);

    const resultEl = modal.querySelector('#fr-result');
    const input = modal.querySelector('#fr-txn');

    const find = () => {
      const id = parseInt(input.value);
      if (!id) { resultEl.innerHTML = '<div class="alert alert-danger">Enter a transaction #.</div>'; return; }
      const txn = DB.getTransaction(id);
      if (!txn) { resultEl.innerHTML = `<div class="alert alert-danger">No transaction #${id} found.</div>`; return; }
      const items    = DB.getItemsForTransaction(id);
      const payments = DB.getPaymentsForTransaction(id);
      const patient  = txn.patient_id ? DB.getPatient(txn.patient_id) : null;
      const when = new Date(txn.transaction_date).toLocaleString('en-CA');
      const statusBadge = txn.status === 'REVERSED' ? '<span style="color:var(--danger);">VOIDED</span>' : txn.status;
      resultEl.innerHTML = `
        <div style="background:var(--surface2);border-radius:var(--radius);padding:12px 14px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;"><strong>Txn #${id}</strong><span>${statusBadge}</span></div>
          <div style="color:var(--text-muted);font-size:12px;margin:4px 0;">${when}
            ${patient?` · ${patient.given_name} ${patient.surname}`:''}</div>
          <div style="margin:6px 0;">${items.map(i=>`<div style="display:flex;justify-content:space-between;">
            <span>${i.description}</span><span>${Tax.fmt(i.line_total)}</span></div>`).join('')}</div>
          <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid var(--border);padding-top:4px;">
            <span>Total</span><span>${Tax.fmt(txn.total_amount)}</span></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn btn-success" id="fr-reprint" style="flex:1;">🖨 Reprint</button>
          <button class="btn btn-outline" id="fr-email" style="flex:1;">✉ Email Receipt</button>
        </div>`;
      resultEl.querySelector('#fr-reprint').addEventListener('click', () => {
        Print.printReceipt(txn, items, payments, patient);
        this._setStatus('success', `Reprinted receipt #${id}`);
        close();
      });
      resultEl.querySelector('#fr-email').addEventListener('click', () => {
        this._emailReceipt(txn, items, payments, patient);
      });
    };

    modal.querySelector('#fr-find').addEventListener('click', find);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') find(); });
    setTimeout(() => input.focus(), 60);
  }

  /* ---- Print cart as a Quote / Estimate (no payment) ---- */
  async _printQuote() {
    if (!this._cart.length) { this._setStatus('error', 'Cart is empty — nothing to quote.'); return; }
    const ph = await Config.getAll();
    const totals = Tax.calcCartTotals(this._cart);
    const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const logo = localStorage.getItem('pharmacy_logo_data') || '';
    const now = new Date();

    const itemRows = this._cart.map(i => {
      const isDisc = i.item_type === 'DISCOUNT';
      const qty = i.quantity || 1;
      return `<tr>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;">${esc(i.description)}${i.rx_number?` <small>(Rx# ${esc(i.rx_number)})</small>`:''}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">${qty>1?qty:''}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;${isDisc?'color:#b00;':''}">${Tax.fmt(i.line_total)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      @page{size:80mm auto;margin:0;}
      body{font-family:Arial,sans-serif;font-size:12px;color:#000;width:280px;margin:0;padding:10px;}
      .c{text-align:center;} h2{margin:4px 0;font-size:15px;} .muted{color:#555;font-size:11px;}
      table{width:100%;border-collapse:collapse;margin:8px 0;}
      .tot{display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:6px;border-top:1px solid #000;padding-top:4px;}
      .badge{display:inline-block;border:2px solid #000;border-radius:4px;padding:2px 10px;font-weight:bold;letter-spacing:1px;margin:6px 0;}
    </style></head><body>
      <div class="c">
        ${logo?`<img src="${logo}" style="max-height:40px;max-width:90%;"><br>`:''}
        <h2>${esc(ph.pharmacy_name||'Pharmacy')}</h2>
        ${ph.pharmacy_phone?`<div class="muted">Tel: ${esc(ph.pharmacy_phone)}</div>`:''}
        <div class="badge">QUOTE / ESTIMATE</div>
        <div class="muted">${now.toLocaleString('en-CA')}</div>
        ${this._patient?`<div class="muted">For: ${esc(this._patient.given_name)} ${esc(this._patient.surname)}</div>`:''}
      </div>
      <table>
        <thead><tr>
          <th style="text-align:left;border-bottom:1px solid #000;padding:3px 6px;">Item</th>
          <th style="border-bottom:1px solid #000;padding:3px 6px;">Qty</th>
          <th style="text-align:right;border-bottom:1px solid #000;padding:3px 6px;">Amount</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="display:flex;justify-content:space-between;font-size:12px;"><span>Subtotal</span><span>${Tax.fmt(totals.subtotal)}</span></div>
      ${totals.gst_amount>0?`<div style="display:flex;justify-content:space-between;font-size:12px;"><span>GST</span><span>${Tax.fmt(totals.gst_amount)}</span></div>`:''}
      ${totals.pst_amount>0?`<div style="display:flex;justify-content:space-between;font-size:12px;"><span>PST</span><span>${Tax.fmt(totals.pst_amount)}</span></div>`:''}
      <div class="tot"><span>ESTIMATED TOTAL</span><span>${Tax.fmt(totals.total_amount)}</span></div>
      <div class="c muted" style="margin-top:10px;">This is an estimate, not a receipt. Prices subject to change.</div>
    </body></html>`;

    // Print via hidden iframe (works in both desktop and browser)
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-9999px;width:320px;height:600px;border:none;';
    document.body.appendChild(frame);
    frame.contentDocument.open(); frame.contentDocument.write(html); frame.contentDocument.close();
    setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print();
      setTimeout(() => frame.remove(), 1000); }, 350);
    this._setStatus('success', 'Quote printed');
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

    // Pre-fill RPh name + license from logged-in staff if they are a pharmacist
    const currentStaff = Auth.current();
    const prefilledName    = currentStaff?.name    || '';
    const prefilledLicense = currentStaff?.license_number || '';

    // Pharmacists who can sign (have a license #), with stored signature + mode
    const pharmacists = (DB.getAllStaff ? DB.getAllStaff() : [])
      .filter(p => p.active && (p.license_number || p.role === 'PHARMACIST'));
    const pharmMap = {};
    pharmacists.forEach(p => { pharmMap[p.staff_id] = {
      name: p.name, lic: p.license_number || '', mode: p.signoff_mode || 'pin', signature: p.signature || '',
    }; });

    // Show allergy status for this patient
    const allergyNote = patient?.allergies
      ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;
                     padding:6px 10px;font-size:12px;color:#856404;margin-bottom:10px;">
           ⚠️ <strong>Allergies on file:</strong> ${patient.allergies}
         </div>`
      : '';

    overlay.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);
                  border-radius:var(--radius);width:500px;max-width:96vw;max-height:92vh;
                  overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.4);">

        <div style="padding:16px 20px;border-bottom:1px solid var(--border);">
          <div style="font-size:15px;font-weight:700;">Pick Up Confirmation — RPh Sign-off</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">
            Saved to patient file in WinRx.
          </div>
        </div>

        <div style="padding:16px 20px;">

          ${allergyNote}

          <!-- Counselling checkboxes -->
          <div style="background:var(--surface2);border-radius:var(--radius);
                      padding:12px 14px;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;
                        letter-spacing:.04em;color:var(--text-muted);margin-bottom:10px;">
              Counselling Checklist
            </div>
            <label style="display:flex;align-items:center;gap:10px;margin-bottom:8px;
                          cursor:pointer;font-size:13px;">
              <input type="checkbox" id="rph-chk-allergy" style="width:16px;height:16px;" />
              Allergies reviewed with patient
            </label>
            <label style="display:flex;align-items:center;gap:10px;margin-bottom:8px;
                          cursor:pointer;font-size:13px;">
              <input type="checkbox" id="rph-chk-side-effects" style="width:16px;height:16px;" />
              Side effects &amp; interactions discussed
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">
              <input type="checkbox" id="rph-chk-new-rx" style="width:16px;height:16px;" />
              New medication — full counselling provided
            </label>
          </div>

          <!-- Sign as (pharmacist picker) -->
          <div style="margin-bottom:10px;">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Sign as</label>
            <select id="rph-select" style="width:100%;padding:8px 10px;border:1px solid var(--border);
                    border-radius:var(--radius);font-size:13px;background:var(--surface2);color:var(--text);box-sizing:border-box;">
              ${pharmacists.map(p => `<option value="${p.staff_id}" ${currentStaff&&currentStaff.staff_id===p.staff_id?'selected':''}>${p.name}${p.license_number?` — ${p.license_number}`:''}</option>`).join('')}
              <option value="">Other / draw signature…</option>
            </select>
          </div>

          <!-- RPh name + license -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);
                             display:block;margin-bottom:4px;">Pharmacist Name *</label>
              <input id="rph-name" type="text" value="${prefilledName}"
                     placeholder="e.g. J. Smith, RPh" autocomplete="off"
                     style="width:100%;padding:8px 10px;border:1px solid var(--border);
                            border-radius:var(--radius);font-size:13px;
                            background:var(--surface2);color:var(--text);box-sizing:border-box;" />
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);
                             display:block;margin-bottom:4px;">License / Registration #</label>
              <input id="rph-license" type="text" value="${prefilledLicense}"
                     placeholder="e.g. 12345" autocomplete="off"
                     style="width:100%;padding:8px 10px;border:1px solid var(--border);
                            border-radius:var(--radius);font-size:13px;
                            background:var(--surface2);color:var(--text);box-sizing:border-box;" />
            </div>
          </div>

          <!-- Stored signature preview (when signing as a saved pharmacist) -->
          <div id="rph-sig-stored" style="display:none;margin-bottom:8px;">
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">Signature</div>
            <img id="rph-sig-img" alt="" style="height:48px;max-width:280px;background:#fff;border:1px solid var(--border);border-radius:4px;" />
          </div>

          <!-- PIN re-entry (when the selected pharmacist uses PIN mode) -->
          <div id="rph-pin-row" style="display:none;margin-bottom:8px;">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Enter your PIN to sign</label>
            <input id="rph-pin" type="password" inputmode="numeric" maxlength="8" placeholder="PIN" autocomplete="off"
                   style="width:160px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);
                          font-size:13px;background:var(--surface2);color:var(--text);box-sizing:border-box;" />
          </div>

          <!-- Signature pad (draw — manual fallback) -->
          <div id="rph-draw-wrap">
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">
              Signature
            </div>
            <div style="border:1px solid var(--border);border-radius:4px;background:#fff;
                        position:relative;margin-bottom:6px;overflow:hidden;">
              <canvas id="rph-canvas" width="456" height="100"
                      style="display:block;cursor:crosshair;touch-action:none;width:100%;"></canvas>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-bottom:4px;">
              <button id="rph-clear" style="font-size:11px;padding:3px 10px;
                border:1px solid var(--border);border-radius:var(--radius);
                background:var(--surface2);cursor:pointer;color:var(--text-muted);">
                Clear signature
              </button>
            </div>
          </div>

          <div id="rph-signoff-error" style="display:none;color:#b02a37;font-size:12px;margin-top:4px;"></div>

        </div>

        <div style="padding:12px 20px;border-top:1px solid var(--border);
                    display:flex;gap:10px;justify-content:flex-end;align-items:center;">
          <button id="rph-skip" style="padding:8px 18px;border:1px solid var(--border);
            border-radius:var(--radius);background:var(--surface2);
            cursor:pointer;font-size:13px;">
            Skip
          </button>
          <button id="rph-confirm" style="padding:8px 24px;border:none;
            border-radius:var(--radius);background:var(--primary);color:#fff;
            cursor:pointer;font-size:13px;font-weight:600;">
            Confirm &amp; Save to File
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    /* ── Pharmacist picker → stored signature + PIN/tick, or draw fallback ── */
    const rphSelEl   = overlay.querySelector('#rph-select');
    const rphNameEl  = overlay.querySelector('#rph-name');
    const rphLicEl   = overlay.querySelector('#rph-license');
    const drawWrap   = overlay.querySelector('#rph-draw-wrap');
    const storedWrap = overlay.querySelector('#rph-sig-stored');
    const storedImg  = overlay.querySelector('#rph-sig-img');
    const rphPinRow  = overlay.querySelector('#rph-pin-row');
    const applyRphSel = () => {
      const p = pharmMap[rphSelEl.value];
      if (p && p.signature) {
        rphNameEl.value = p.name; rphLicEl.value = p.lic;
        rphNameEl.readOnly = true; rphLicEl.readOnly = true;
        storedImg.src = p.signature; storedWrap.style.display = 'block';
        drawWrap.style.display = 'none';
        rphPinRow.style.display = p.mode === 'pin' ? 'block' : 'none';
      } else if (p) {
        rphNameEl.value = p.name; rphLicEl.value = p.lic;
        rphNameEl.readOnly = false; rphLicEl.readOnly = false;
        storedWrap.style.display = 'none'; drawWrap.style.display = 'block'; rphPinRow.style.display = 'none';
      } else {
        rphNameEl.readOnly = false; rphLicEl.readOnly = false;
        storedWrap.style.display = 'none'; drawWrap.style.display = 'block'; rphPinRow.style.display = 'none';
      }
    };
    rphSelEl.addEventListener('change', applyRphSel);
    applyRphSel();

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
      const license          = overlay.querySelector('#rph-license').value.trim();
      const chkAllergy       = overlay.querySelector('#rph-chk-allergy').checked;
      const chkSideEffects   = overlay.querySelector('#rph-chk-side-effects').checked;
      const chkNewRx         = overlay.querySelector('#rph-chk-new-rx').checked;
      const sigErr           = overlay.querySelector('#rph-signoff-error');
      const showSigErr       = (m) => { sigErr.textContent = m; sigErr.style.display = 'block'; };

      // Resolve the signature: stored (selected pharmacist) or drawn
      const selPh = pharmMap[rphSelEl.value] || null;
      let signatureDataUrl;
      if (selPh && selPh.signature) {
        if (selPh.mode === 'pin') {
          const pin = overlay.querySelector('#rph-pin').value.trim();
          if (!pin) { showSigErr(`Enter ${selPh.name}'s PIN to sign.`); return; }
          const ok = await Auth.verifyPin(parseInt(rphSelEl.value), pin);
          if (!ok) { showSigErr('Incorrect PIN — could not verify the pharmacist.'); return; }
        }
        signatureDataUrl = selPh.signature;
      } else {
        signatureDataUrl = hasSignature ? canvas.toDataURL('image/png') : null;
      }
      sigErr.style.display = 'none';

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
      btn.textContent  = 'Saving…';

      const rphInfo = {
        name, license, signatureDataUrl,
        counselledAllergies:   chkAllergy,
        counselledSideEffects: chkSideEffects,
        counselledNewRx:       chkNewRx,
        signedAt:              new Date().toISOString(),
      };

      // Persist counselling record to transaction
      try { DB.saveRphSignoff(txn.transaction_id, rphInfo); } catch(_) {}
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
            Select all shown
          </label>
        </div>
        <!-- Date filter -->
        <div style="padding:10px 20px 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:11px;color:var(--text-muted);margin-right:2px;">Show filled:</span>
          <button class="pend-filter" data-range="today" style="font-size:12px;padding:4px 12px;border:1px solid var(--border);border-radius:14px;background:var(--primary);color:#fff;cursor:pointer;">Today</button>
          <button class="pend-filter" data-range="week"  style="font-size:12px;padding:4px 12px;border:1px solid var(--border);border-radius:14px;background:var(--surface2);cursor:pointer;">This Week</button>
          <button class="pend-filter" data-range="all"   style="font-size:12px;padding:4px 12px;border:1px solid var(--border);border-radius:14px;background:var(--surface2);cursor:pointer;">All</button>
          <input type="date" id="pend-filter-date" style="font-size:12px;padding:3px 6px;margin-left:4px;" title="Pick a specific fill date" />
        </div>
        <div id="pend-list" style="overflow-y:auto;flex:1;padding:8px 0;"></div>
        <div style="padding:14px 20px;border-top:1px solid var(--border);
                    display:flex;gap:10px;align-items:center;justify-content:space-between;">
          <span id="pend-total" style="font-size:11px;color:var(--text-muted);">Prices fetched from WinRx when added</span>
          <div style="display:flex;gap:8px;">
            <button id="pend-skip"
                    style="padding:8px 18px;border:1px solid var(--border);border-radius:var(--radius);
                           background:var(--surface2);cursor:pointer;font-size:13px;">
              Skip
            </button>
            <button id="pend-add"
                    style="padding:8px 22px;border:none;border-radius:var(--radius);
                           background:var(--primary);color:#fff;cursor:pointer;
                           font-size:13px;font-weight:600;min-width:110px;">
              Add to Cart
            </button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#pend-skip').addEventListener('click', close);

    const listEl  = overlay.querySelector('#pend-list');
    const totalEl = overlay.querySelector('#pend-total');

    const toYmd = d => {
      if (!d) return '';
      const s = String(d);
      if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
      return s.slice(0, 10);
    };
    const todayYmd = (typeof localDateStr === 'function')
      ? localDateStr(new Date()) : new Date().toISOString().slice(0,10);
    const weekAgoYmd = new Date(Date.now() - 6*86400000).toISOString().slice(0,10);
    let currentRange = 'today';

    const matchesFilter = r => {
      const ymd = toYmd(r.fillDate);
      if (currentRange === 'all')   return true;
      if (currentRange === 'today') return ymd === todayYmd;
      if (currentRange === 'week')  return ymd >= weekAgoYmd && ymd <= todayYmd;
      return ymd === currentRange;
    };

    const updateTotal = () => {
      const checked = [...overlay.querySelectorAll('.pend-cb:checked')];
      const sum = checked.reduce((s, cb) => s + (pending[parseInt(cb.dataset.idx)]?.copay || 0), 0);
      totalEl.textContent = checked.length
        ? `${checked.length} selected · ${fmt(sum)}`
        : 'Prices fetched from WinRx when added';
    };

    const renderList = () => {
      const visible = pending.filter(matchesFilter);
      if (!visible.length) {
        listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">
          No prescriptions match this date filter.</div>`;
        updateTotal();
        return;
      }
      listEl.innerHTML = visible.map(r => {
        const i = pending.indexOf(r);
        return `
          <label style="display:flex;align-items:center;gap:10px;padding:10px 20px;
                        cursor:pointer;border-bottom:1px solid var(--border-faint,#333);">
            <input type="checkbox" class="pend-cb" data-idx="${i}"
                   style="flex-shrink:0;width:16px;height:16px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;white-space:nowrap;
                           overflow:hidden;text-overflow:ellipsis;">Rx #${r.rxNumber}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                ${r.qty ? `Qty: ${r.qty}` : ''}
                ${r.fillDate ? ` · Filled: ${fmtDate(r.fillDate)}` : ''}
              </div>
            </div>
            <div style="font-size:13px;font-weight:600;color:var(--text-muted);white-space:nowrap;font-style:italic;">
              ${r.copay > 0 ? fmt(r.copay) : 'price on add'}
            </div>
          </label>`;
      }).join('');
      listEl.querySelectorAll('.pend-cb').forEach(cb => cb.addEventListener('change', updateTotal));
      overlay.querySelector('#pend-select-all').checked = false;
      updateTotal();
    };

    overlay.querySelectorAll('.pend-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        currentRange = btn.dataset.range;
        overlay.querySelector('#pend-filter-date').value = '';
        overlay.querySelectorAll('.pend-filter').forEach(b => { b.style.background='var(--surface2)'; b.style.color=''; });
        btn.style.background = 'var(--primary)'; btn.style.color = '#fff';
        renderList();
      });
    });
    overlay.querySelector('#pend-filter-date').addEventListener('change', e => {
      if (!e.target.value) return;
      currentRange = e.target.value;
      overlay.querySelectorAll('.pend-filter').forEach(b => { b.style.background='var(--surface2)'; b.style.color=''; });
      renderList();
    });

    overlay.querySelector('#pend-select-all').addEventListener('change', e => {
      overlay.querySelectorAll('.pend-cb').forEach(cb => { cb.checked = e.target.checked; });
      updateTotal();
    });

    renderList();  // initial render (defaults to Today)

    overlay.querySelector('#pend-add').addEventListener('click', async () => {
      const checked = [...overlay.querySelectorAll('.pend-cb:checked')];
      if (!checked.length) { close(); return; }

      const btn = overlay.querySelector('#pend-add');
      btn.disabled = true;
      btn.textContent = 'Loading prices…';

      // The popup already shows the authoritative copay (RECOPAY) for each Rx.
      // Honor it directly; only call getRxTx for "price on add" rows whose
      // displayed copay was 0/unknown (so we don't clobber good prices with a 0).
      const results = await Promise.allSettled(
        checked.map(async cb => {
          const r = pending[parseInt(cb.dataset.idx)];
          if (Number(r.copay) > 0) return { r, rxData: null };          // already known
          const rxData = await PharmacyDashboardAPI.getRxTx(r.rxNumber, branchCode);
          return { r, rxData };
        })
      );

      let added = 0;
      results.forEach(res => {
        if (res.status !== 'fulfilled') return;
        const { r, rxData } = res.value;
        if (this._cart.some(c => String(c.rx_number) === r.rxNumber)) return;
        // Known copay wins; else use a real (>0) fetched price; else 0.
        const fetched = Number(rxData?.unit_price);
        const copay   = Number(r.copay) > 0
          ? Number(r.copay)
          : ((Number.isFinite(fetched) && fetched > 0) ? fetched : 0);
        const drugName = rxData?.description || (r.qty ? `${r.drug} [Qty:${r.qty}]` : r.drug); // internal only
        const desc = `Rx ${r.rxNumber}${r.qty ? ` [Qty:${r.qty}]` : ''}`;                      // patient-facing
        this._cart.push({
          item_type:      'RX',
          rx_number:      r.rxNumber,
          branch_code:    branchCode || null,
          din:            rxData?.din || r.din,
          description:    desc,
          drug_name:      drugName,
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
