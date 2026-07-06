/* ============================================================
   screens/settings.js — Settings (Admin only)
   ============================================================ */

class SettingsScreen {
  constructor({ onNavigate }) {
    this._onNavigate = onNavigate;
    this._el          = null;
    this._activeTab   = 'pharmacy';
  }

  render(params = {}) {
    /* Cashier — no settings access at all */
    if (!Auth.isManager()) {
      const el = document.createElement('div');
      el.className = 'pos-screen';
      el.innerHTML = `
        <div class="topbar">
          <button class="btn btn-outline btn-sm" id="btn-back">&#8592; Back</button>
          <span style="font-weight:600;font-size:15px;margin-left:8px;">Settings</span>
        </div>
        <div style="padding:40px;text-align:center;color:var(--text-muted);">
          Settings are restricted to Manager and Admin staff.
        </div>`;
      el.querySelector('#btn-back').addEventListener('click', () => this._onNavigate('pos'));
      return el;
    }

    /* Tabs that require full Admin (super-admin) access */
    const ADMIN_ONLY_TABS = new Set(['api', 'staff', 'backup']);

    const roleTitle = Auth.isAdmin() ? 'Settings (Admin)' : 'Settings (Manager)';

    this._el = document.createElement('div');
    this._el.className = 'settings-screen';
    this._el.innerHTML = `
      <div class="topbar">
        <button class="btn btn-outline btn-sm" id="btn-back">&#8592; Back</button>
        <span style="font-weight:600;font-size:15px;margin-left:8px;">${roleTitle}</span>
        <span style="margin-left:auto;font-size:12px;color:var(--text-muted);">v${window.APP_VERSION || '?'}</span>
      </div>
      <div class="settings-body">
        <div class="settings-nav">
          ${[
            ['__hdr__',      'Pharmacy Setup'],
            ['pharmacy',     'Pharmacy Details',  false, false],
            ['datetime',     'Date & Time',       false, false],
            ['staff',        'Staff Management',  false, true ],  // Admin only
            ['__hdr__',      'Connections'],
            ['sql',          'SQL Connection',    true,  false],  // desktop only
            ['api',          'API Credentials',   false, true ],  // Admin only
            ['catalog',      'Catalog Sync',      false, false],
            ['__hdr__',      'Products & Pricing'],
            ['products',     'Products',          false, false],
            ['quickactions', 'Quick Actions',     false, false],
            ['barcode',      'Barcode Profiles',  false, false],
            ['__hdr__',      'Printing & Labels'],
            ['printer',      'Receipt Printer',   true,  false],  // desktop only
            ['receipt',      'Receipt Layout',    false, false],
            ['shelftags',    'Shelf Tags',        false, false],
            ['nametags',     'Name Tags',         false, false],
            ['__hdr__',      'Records & Reports'],
            ['btcfolder',    'BTC Records',       true,  false],  // desktop only
            ['emailreports', 'Email Reports',     false, false],
            ['backup',       'Backup',            false, true ],  // Admin only
          ].filter(row => row[0] === '__hdr__' || !row[2] || !!window.electronAPI)
           .map(row => {
             if (row[0] === '__hdr__') {
               return `<div style="font-size:10px;font-weight:700;text-transform:uppercase;
                           letter-spacing:.05em;color:var(--text-muted);opacity:.65;
                           padding:14px 12px 4px;">${row[1]}</div>`;
             }
             const [id, label, , adminOnly] = row;
             const locked = adminOnly && !Auth.isAdmin();
             return `<div class="settings-nav-item${id === this._activeTab ? ' active' : ''}"
                         data-tab="${id}" data-locked="${locked}"
                         style="${locked ? 'color:var(--text-muted);' : ''}">
               ${label}${locked ? ' <span style="font-size:10px;opacity:.6;">&#128274;</span>' : ''}
             </div>`;
           }).join('')}
        </div>
        <div class="settings-content" id="settings-content"></div>
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click', () => this._onNavigate('pos'));
    this._el.querySelectorAll('.settings-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        this._el.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this._activeTab = item.dataset.tab;

        /* Block Manager from Admin-only tabs */
        if (ADMIN_ONLY_TABS.has(item.dataset.tab) && !Auth.isAdmin()) {
          document.getElementById('settings-content').innerHTML = `
            <div class="settings-section" style="text-align:center;padding:60px 40px;">
              <div style="font-size:40px;margin-bottom:14px;">&#128274;</div>
              <div style="font-weight:700;font-size:16px;margin-bottom:8px;">Admin Access Required</div>
              <div style="color:var(--text-muted);font-size:13px;">
                This section is restricted to <strong>Admin</strong> staff only.<br/>
                Ask your Admin to make changes here.
              </div>
            </div>`;
          return;
        }

        this._renderTab(item.dataset.tab);
      });
    });

    // Delegated handler for all "📁 Browse" folder-picker buttons (any tab)
    this._el.querySelector('#settings-content').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-browse]');
      if (!btn) return;
      const input = this._el.querySelector(btn.dataset.browse);
      if (!input) return;
      if (!window.electronAPI?.pickFolder) {
        alert('Folder browsing is only available in the desktop app. Type the path manually.');
        return;
      }
      window.electronAPI.pickFolder(input.value.trim()).then(res => {
        if (res && res.ok && res.path) input.value = res.path;
      });
    });

    this._renderTab(this._activeTab);
    return this._el;
  }

  _renderTab(tab) {
    const content = this._el.querySelector('#settings-content');
    switch (tab) {
      case 'pharmacy':     this._renderPharmacy(content);     break;
      case 'receipt':      this._renderReceipt(content);      break;
      case 'datetime':     this._renderDateTime(content);     break;
      case 'api':          this._renderAPI(content);          break;
      case 'staff':        this._renderStaff(content);        break;
      case 'products':     this._renderProducts(content);     break;
      case 'shelftags':    this._renderShelfTags(content);    break;
      case 'nametags':     this._renderNameTags(content);     break;
      case 'quickactions': this._renderQuickActions(content); break;
      case 'catalog':      this._renderCatalog(content);      break;
      case 'sql':     if (window.electronAPI) this._renderSQL(content);     break;
      case 'barcode':      this._renderBarcode(content);      break;
      case 'printer':    if (window.electronAPI) this._renderPrinter(content);   break;
      case 'btcfolder':  if (window.electronAPI) this._renderBtcFolder(content); break;
      case 'emailreports': this._renderEmailReports(content);  break;
      case 'backup':       this._renderBackup(content);       break;
    }
  }

  async _renderPharmacy(content) {
    const cfg       = await Config.getAll();
    const logo      = localStorage.getItem('pharmacy_logo_data') || '';
    const headerMsg = cfg.receipt_header_msg || '';
    const footerMsg = cfg.receipt_footer_msg || '';

    // Brand Kit (defaults = the brand palette baked into the CSS)
    const BK_DEFAULT = { background:'#f4f3ee', primary:'#1e4031', danger:'#c62f25', warning:'#e9a93c' };
    let bk = { ...BK_DEFAULT };
    try { if (cfg.brand_kit) bk = { ...BK_DEFAULT, ...(typeof cfg.brand_kit === 'string' ? JSON.parse(cfg.brand_kit) : cfg.brand_kit) }; } catch(_) {}

    content.innerHTML = `
      <div class="settings-section">
        <h3>Pharmacy Details</h3>
        <div class="alert alert-info">Used on receipts, reports, and patient communications.</div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin:16px 0 8px;">
          <h4 style="font-size:14px;color:var(--text-muted);margin:0;">Business Info</h4>
          <button class="btn btn-outline btn-sm" id="btn-fetch-api">&#8645; Fetch from API</button>
        </div>
        <div id="fetch-api-status" style="font-size:13px;margin-bottom:10px;"></div>

        <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end;">
          <div class="form-group" style="margin:0;">
            <label>Pharmacy Name</label>
            <input type="text" id="ph-name" value="${cfg.pharmacy_name||''}" placeholder="e.g. Your Pharmacy Name" />
          </div>
          <div class="form-group" style="margin:0;width:110px;">
            <label>Branch Code</label>
            <input type="text" id="ph-branch" value="${cfg.branch_code||''}" placeholder="e.g. A" maxlength="4" />
          </div>
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Phone</label>
            <input type="text" id="ph-phone" value="${cfg.pharmacy_phone||''}" placeholder="(604) 555-0100" />
          </div>
          <div class="form-group">
            <label>Fax</label>
            <input type="text" id="ph-fax" value="${cfg.pharmacy_fax||''}" placeholder="(604) 555-0101" />
          </div>
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="ph-email" value="${cfg.pharmacy_email||''}" placeholder="info@yourpharmacy.ca" />
        </div>
        <div class="form-group">
          <label>Website</label>
          <input type="text" id="ph-website" value="${cfg.pharmacy_website||''}" placeholder="www.yourpharmacy.ca" />
        </div>

        <h4 style="margin:16px 0 8px;font-size:14px;color:var(--text-muted);">Address</h4>
        <div class="form-group">
          <label>Street Address</label>
          <input type="text" id="ph-address" value="${cfg.pharmacy_address||''}" placeholder="123 Main Street" />
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>City</label>
            <input type="text" id="ph-city" value="${cfg.pharmacy_city||''}" placeholder="Vancouver" />
          </div>
          <div class="form-group">
            <label>Province</label>
            <input type="text" id="ph-province" value="${cfg.pharmacy_province||''}" maxlength="2" placeholder="e.g. BC, ON, AB" />
          </div>
          <div class="form-group">
            <label>Postal Code</label>
            <input type="text" id="ph-postal" value="${cfg.pharmacy_postal||''}" placeholder="V1A 2B3" maxlength="7" />
          </div>
        </div>

        <h4 style="margin:16px 0 8px;font-size:14px;color:var(--text-muted);">Tax Registration</h4>
        <div class="form-group">
          <label>GST Registration Number</label>
          <input type="text" id="ph-gst-number" value="${cfg.pharmacy_gst_number||''}" placeholder="RT 0001 (e.g. 123456789 RT 0001)" />
        </div>
        <div class="form-group">
          <label>PST Registration Number <span style="font-weight:400;color:var(--text-muted);">(if applicable)</span></label>
          <input type="text" id="ph-pst-number" value="${cfg.pharmacy_pst_number||''}" placeholder="PST-1234-5678" />
        </div>

        <h4 style="margin:16px 0 8px;font-size:14px;color:var(--text-muted);">Tax Rates</h4>
        <div class="alert alert-info" style="font-size:13px;">
          These rates apply to OTC items marked as taxable. Rx prescriptions are always tax-exempt.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group" style="background:var(--surface2);padding:14px;border-radius:var(--radius);">
            <label style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer;">
              <input type="checkbox" id="tax-gst-enabled" ${cfg.tax_gst_enabled !== 'false' ? 'checked' : ''} style="width:16px;height:16px;" />
              <span style="font-weight:600;">Charge GST</span>
            </label>
            <label style="font-size:13px;">GST Rate (%)</label>
            <input type="number" id="tax-gst-rate" value="${cfg.tax_gst_rate||'5'}"
                   min="0" max="30" step="0.1" style="margin-top:4px;" />
            <div class="text-muted mt-2" style="font-size:12px;">Federal — default 5%</div>
          </div>
          <div class="form-group" style="background:var(--surface2);padding:14px;border-radius:var(--radius);">
            <label style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer;">
              <input type="checkbox" id="tax-pst-enabled" ${cfg.tax_pst_enabled !== 'false' ? 'checked' : ''} style="width:16px;height:16px;" />
              <span style="font-weight:600;">Charge PST</span>
            </label>
            <label style="font-size:13px;">PST Rate (%)</label>
            <input type="number" id="tax-pst-rate" value="${cfg.tax_pst_rate||'7'}"
                   min="0" max="30" step="0.1" style="margin-top:4px;" />
            <div class="text-muted mt-2" style="font-size:12px;">BC Provincial — default 7%</div>
          </div>
        </div>

        <!-- ── Receipt Customization ─────────────────────────── -->
        <h4 style="margin:24px 0 8px;font-size:14px;color:var(--text-muted);">Receipt Customization</h4>

        <div class="form-group">
          <label>Pharmacy Logo</label>
          <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">
            <div id="logo-preview-box"
                 style="width:180px;min-height:72px;border:2px dashed var(--border);border-radius:var(--radius);
                        display:flex;align-items:center;justify-content:center;overflow:hidden;
                        background:var(--surface2);padding:10px;cursor:pointer;" title="Click to upload">
              ${logo
                ? `<img id="logo-preview-img" src="${logo}" style="max-width:100%;max-height:80px;object-fit:contain;" />`
                : `<span id="logo-placeholder" style="color:var(--text-muted);font-size:12px;text-align:center;line-height:1.5;">
                     &#128247;<br>No logo<br><small>Click to upload</small>
                   </span>`}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;justify-content:center;">
              <input type="file" id="ph-logo-file" accept="image/png,image/jpeg,image/gif,image/svg+xml" style="display:none;" />
              <button class="btn btn-outline btn-sm" id="btn-upload-logo" style="width:140px;">
                &#128247; Upload Logo
              </button>
              <button class="btn btn-sm" id="btn-remove-logo"
                      style="width:140px;color:var(--danger);border:1px solid var(--danger);background:transparent;
                             border-radius:var(--radius);padding:6px;font-size:13px;cursor:pointer;
                             ${logo ? '' : 'opacity:.4;pointer-events:none;'}">
                Remove Logo
              </button>
              <div class="text-muted" style="font-size:12px;line-height:1.5;">
                PNG or JPG — shown above pharmacy<br>name on receipt.<br>
                Ideal size: 300 × 80 px.
              </div>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>Custom Header Message
            <span style="font-weight:400;color:var(--text-muted);"> — shown below address on receipt</span>
          </label>
          <textarea id="ph-receipt-header" rows="2" style="resize:vertical;width:100%;"
                    placeholder="e.g. Free prescription delivery! Ask us about blister packs.">${headerMsg}</textarea>
        </div>

        <div class="form-group">
          <label>Custom Footer Message
            <span style="font-weight:400;color:var(--text-muted);"> — shown at bottom of receipt</span>
          </label>
          <textarea id="ph-receipt-footer" rows="2" style="resize:vertical;width:100%;"
                    placeholder="e.g. Thank you! Follow us @pharmacy or call (604) 555-0100">${footerMsg}</textarea>
        </div>

        <!-- Brand Kit -->
        <div class="settings-section-title" style="margin-top:28px;">🎨 Brand Kit</div>
        <p style="font-size:13px;color:var(--text-muted);margin:-6px 0 12px;">
          Your brand colours are applied across the app and to print templates (name tags, shelf tags, receipts).
        </p>
        <div style="display:flex;gap:18px;flex-wrap:wrap;" id="brand-kit">
          ${[
            ['background','Background','Page background'],
            ['primary','Color 1 — Primary','Buttons, links, highlights'],
            ['danger','Color 2 — Alerts','Refunds, delete, warnings'],
            ['warning','Color 3 — Accent','Badges, accents'],
          ].map(([key,label,hint]) => `
            <label style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;width:96px;text-align:center;">
              <input type="color" class="bk-swatch" data-key="${key}" value="${bk[key]}"
                     style="width:64px;height:64px;border:1px solid var(--border);border-radius:14px;padding:0;cursor:pointer;background:none;" />
              <span style="font-size:12px;font-weight:500;">${label}</span>
              <span style="font-size:10px;color:var(--text-muted);line-height:1.3;">${hint}</span>
              <span class="bk-hex" style="font-size:10px;color:var(--text-muted);font-family:monospace;">${bk[key]}</span>
            </label>`).join('')}
        </div>
        <div style="margin-top:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="font-size:13px;color:var(--text-muted);">Live preview:</span>
          <button type="button" class="btn btn-primary" style="pointer-events:none;">Primary</button>
          <button type="button" class="btn btn-danger"  style="pointer-events:none;">Alert</button>
          <span class="badge badge-otc" style="pointer-events:none;">Badge</span>
          <button type="button" class="btn btn-outline btn-sm" id="bk-reset">Reset to brand defaults</button>
        </div>

        <div style="margin-top:20px;">
          <button class="btn btn-primary" id="btn-save-pharmacy">Save Pharmacy Details</button>
          <div id="pharmacy-save-status" style="margin-top:8px;font-size:13px;"></div>
        </div>
      </div>`;

    /* ── Fetch from API ─────────────────────────────────────── */
    content.querySelector('#btn-fetch-api').addEventListener('click', async () => {
      const statusEl = content.querySelector('#fetch-api-status');
      statusEl.textContent = 'Fetching pharmacy info from API…';
      statusEl.style.color = 'var(--text-muted)';
      try {
        const info = await PharmacyDashboardAPI.getPharmacyInfo();
        const fill = (id, val) => { if (val) content.querySelector(id).value = val; };
        fill('#ph-name',     info.pharmacy_name);
        fill('#ph-phone',    info.pharmacy_phone);
        fill('#ph-fax',      info.pharmacy_fax);
        fill('#ph-email',    info.pharmacy_email);
        fill('#ph-website',  info.pharmacy_website);
        fill('#ph-address',  info.pharmacy_address);
        fill('#ph-city',     info.pharmacy_city);
        fill('#ph-province', info.pharmacy_province);
        fill('#ph-postal',   info.pharmacy_postal);
        fill('#ph-gst-number', info.pharmacy_gst_number);
        fill('#ph-pst-number', info.pharmacy_pst_number);
        statusEl.textContent = '✓ Fields filled from API — review and save.';
        statusEl.style.color = 'var(--success)';
      } catch(e) {
        statusEl.innerHTML = `✗ ${e.message}<br><small style="color:var(--text-muted);">
          Make sure your Cloudflare Worker exposes a <code>/getPharmacy</code> endpoint.</small>`;
        statusEl.style.color = 'var(--danger)';
      }
    });

    /* ── Logo upload ─────────────────────────────────────────── */
    let pendingLogo = logo; // tracks the in-memory logo before Save

    const refreshLogoPreview = (dataUrl) => {
      const box = content.querySelector('#logo-preview-box');
      if (dataUrl) {
        box.innerHTML = `<img id="logo-preview-img" src="${dataUrl}"
          style="max-width:100%;max-height:80px;object-fit:contain;" />`;
        content.querySelector('#btn-remove-logo').style.opacity = '1';
        content.querySelector('#btn-remove-logo').style.pointerEvents = 'auto';
      } else {
        box.innerHTML = `<span id="logo-placeholder"
          style="color:var(--text-muted);font-size:12px;text-align:center;line-height:1.5;">
          &#128247;<br>No logo<br><small>Click to upload</small></span>`;
        content.querySelector('#btn-remove-logo').style.opacity = '0.4';
        content.querySelector('#btn-remove-logo').style.pointerEvents = 'none';
      }
    };

    content.querySelector('#logo-preview-box').addEventListener('click', () =>
      content.querySelector('#ph-logo-file').click());
    content.querySelector('#btn-upload-logo').addEventListener('click', () =>
      content.querySelector('#ph-logo-file').click());

    content.querySelector('#ph-logo-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 500 * 1024) {
        alert('Logo file is too large (max 500 KB). Please resize the image and try again.');
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => {
        pendingLogo = ev.target.result;
        refreshLogoPreview(pendingLogo);
      };
      reader.readAsDataURL(file);
    });

    content.querySelector('#btn-remove-logo').addEventListener('click', () => {
      pendingLogo = '';
      content.querySelector('#ph-logo-file').value = '';
      refreshLogoPreview('');
    });

    /* ── Brand Kit ───────────────────────────────────────────── */
    const readBrandKit = () => {
      const kit = {};
      content.querySelectorAll('.bk-swatch').forEach(s => { kit[s.dataset.key] = s.value; });
      return kit;
    };
    const liveApplyBrand = () => {
      if (typeof applyBrandKit === 'function') applyBrandKit(readBrandKit());
    };
    content.querySelectorAll('.bk-swatch').forEach(s => {
      s.addEventListener('input', () => {
        const hex = s.closest('label').querySelector('.bk-hex');
        if (hex) hex.textContent = s.value;
        liveApplyBrand();   // preview the whole app instantly
      });
    });
    content.querySelector('#bk-reset')?.addEventListener('click', () => {
      content.querySelectorAll('.bk-swatch').forEach(s => {
        s.value = BK_DEFAULT[s.dataset.key];
        const hex = s.closest('label').querySelector('.bk-hex');
        if (hex) hex.textContent = s.value;
      });
      liveApplyBrand();
    });

    /* ── Save ────────────────────────────────────────────────── */
    content.querySelector('#btn-save-pharmacy').addEventListener('click', async () => {
      // Persist logo separately (not encrypted — not sensitive)
      if (pendingLogo) {
        localStorage.setItem('pharmacy_logo_data', pendingLogo);
      } else {
        localStorage.removeItem('pharmacy_logo_data');
      }

      await Config.setMany({
        pharmacy_name:        content.querySelector('#ph-name').value.trim(),
        branch_code:          content.querySelector('#ph-branch').value.trim(),
        pharmacy_phone:       content.querySelector('#ph-phone').value.trim(),
        pharmacy_fax:         content.querySelector('#ph-fax').value.trim(),
        pharmacy_email:       content.querySelector('#ph-email').value.trim(),
        pharmacy_website:     content.querySelector('#ph-website').value.trim(),
        pharmacy_address:     content.querySelector('#ph-address').value.trim(),
        pharmacy_city:        content.querySelector('#ph-city').value.trim(),
        pharmacy_province:    content.querySelector('#ph-province').value.trim().toUpperCase(),
        pharmacy_postal:      content.querySelector('#ph-postal').value.trim().toUpperCase(),
        pharmacy_gst_number:  content.querySelector('#ph-gst-number').value.trim(),
        pharmacy_pst_number:  content.querySelector('#ph-pst-number').value.trim(),
        tax_gst_enabled:      content.querySelector('#tax-gst-enabled').checked ? 'true' : 'false',
        tax_gst_rate:         content.querySelector('#tax-gst-rate').value.trim(),
        tax_pst_enabled:      content.querySelector('#tax-pst-enabled').checked ? 'true' : 'false',
        tax_pst_rate:         content.querySelector('#tax-pst-rate').value.trim(),
        receipt_header_msg:   content.querySelector('#ph-receipt-header').value.trim(),
        receipt_footer_msg:   content.querySelector('#ph-receipt-footer').value.trim(),
        brand_kit:            JSON.stringify(readBrandKit()),
      });
      // Apply brand kit immediately without page reload
      if (typeof applyBrandKit === 'function') applyBrandKit(readBrandKit());
      await Tax.loadRates();
      Audit.configChange('Pharmacy details updated');
      const status = content.querySelector('#pharmacy-save-status');
      status.textContent = 'Saved.';
      status.style.color = 'var(--success)';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });
  }

  /* ════════════════════════════════════════════════════════════
     Receipt Layout — full customisation with live preview
     ════════════════════════════════════════════════════════════ */
  async _renderReceipt(content) {
    const cfg = await Config.getAll();

    // Helper: get a setting with a default
    const get = (key, def) => (cfg[key] !== undefined && cfg[key] !== '') ? cfg[key] : def;

    content.innerHTML = `
      <div class="settings-section">
        <h3>Receipt Layout</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">
          Customise how receipts look for your pharmacy. Changes apply to all future receipts.
        </p>

        <div style="display:grid;grid-template-columns:1fr 260px;gap:24px;align-items:start;">

          <!-- ── Left: controls ── -->
          <div>

            <!-- Paper & Font -->
            <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;margin-bottom:16px;">
              <div style="font-weight:700;font-size:13px;margin-bottom:12px;text-transform:uppercase;
                          letter-spacing:.04em;color:var(--text-muted);">Paper & Font</div>

              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div class="form-group" style="margin:0;">
                  <label style="font-size:12px;">Paper Width</label>
                  <select id="rc-paper-width" style="margin-top:4px;">
                    <option value="58"  ${get('receipt_paper_width','80')==='58'  ? 'selected':''}>58 mm (narrow)</option>
                    <option value="72"  ${get('receipt_paper_width','80')==='72'  ? 'selected':''}>72 mm</option>
                    <option value="80"  ${get('receipt_paper_width','80')==='80'  ? 'selected':''}>80 mm (standard)</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0;">
                  <label style="font-size:12px;">Font Style</label>
                  <select id="rc-font" style="margin-top:4px;">
                    <option value="courier" ${get('receipt_font','courier')==='courier' ? 'selected':''}>Courier (monospace)</option>
                    <option value="arial"   ${get('receipt_font','courier')==='arial'   ? 'selected':''}>Arial (clean)</option>
                    <option value="system"  ${get('receipt_font','courier')==='system'  ? 'selected':''}>System default</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0;">
                  <label style="font-size:12px;">Font Size</label>
                  <select id="rc-font-size" style="margin-top:4px;">
                    <option value="10" ${get('receipt_font_size','11')==='10' ? 'selected':''}>Small (10px)</option>
                    <option value="11" ${get('receipt_font_size','11')==='11' ? 'selected':''}>Medium (11px)</option>
                    <option value="12" ${get('receipt_font_size','11')==='12' ? 'selected':''}>Large (12px)</option>
                  </select>
                </div>
              </div>

              <div class="form-group" style="margin-top:12px;margin-bottom:0;">
                <label style="font-size:12px;">Separator Style</label>
                <select id="rc-separator" style="margin-top:4px;max-width:220px;">
                  <option value="dashed" ${get('receipt_separator','dashed')==='dashed'  ? 'selected':''}>- - - - - (dashed)</option>
                  <option value="solid"  ${get('receipt_separator','dashed')==='solid'   ? 'selected':''}>────── (solid)</option>
                  <option value="stars"  ${get('receipt_separator','dashed')==='stars'   ? 'selected':''}>* * * * * (stars)</option>
                  <option value="equals" ${get('receipt_separator','dashed')==='equals'  ? 'selected':''}>= = = = = (equals)</option>
                </select>
              </div>
            </div>

            <!-- Header section -->
            <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;margin-bottom:16px;">
              <div style="font-weight:700;font-size:13px;margin-bottom:12px;text-transform:uppercase;
                          letter-spacing:.04em;color:var(--text-muted);">Header</div>
              <div style="display:flex;flex-direction:column;gap:10px;">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="rc-show-logo" ${get('receipt_show_logo','true')==='true' ? 'checked':''} />
                  Show pharmacy logo
                </label>
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="rc-show-header-msg" ${get('receipt_show_header_msg','true')==='true' ? 'checked':''} />
                  Show custom header message
                </label>
              </div>
              <div class="form-group" style="margin-top:12px;margin-bottom:0;">
                <label style="font-size:12px;">Receipt Title <span style="font-weight:400;color:var(--text-muted);">(blank = "RECEIPT")</span></label>
                <input type="text" id="rc-title" value="${get('receipt_title','')}"
                       placeholder="RECEIPT" maxlength="40" style="margin-top:4px;max-width:240px;" />
              </div>
            </div>

            <!-- Items & patient -->
            <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;margin-bottom:16px;">
              <div style="font-weight:700;font-size:13px;margin-bottom:12px;text-transform:uppercase;
                          letter-spacing:.04em;color:var(--text-muted);">Items & Patient</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="rc-show-patient-name" ${get('receipt_show_patient_name','true')==='true' ? 'checked':''} />
                  Patient name
                </label>
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="rc-show-patient-phn" ${get('receipt_show_patient_phn','false')==='true' ? 'checked':''} />
                  Patient PHN / ID <small style="color:var(--text-muted);">(privacy)</small>
                </label>
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="rc-show-rx-number" ${get('receipt_show_rx_number','true')==='true' ? 'checked':''} />
                  Rx number on each line
                </label>
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="rc-show-din" ${get('receipt_show_din','false')==='true' ? 'checked':''} />
                  DIN number
                </label>
              </div>
            </div>

            <!-- Totals & footer -->
            <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;margin-bottom:16px;">
              <div style="font-weight:700;font-size:13px;margin-bottom:12px;text-transform:uppercase;
                          letter-spacing:.04em;color:var(--text-muted);">Totals & Footer</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="rc-show-tax-detail" ${get('receipt_show_tax_detail','true')==='true' ? 'checked':''} />
                  GST / PST breakdown
                </label>
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="rc-show-staff" ${get('receipt_show_staff','true')==='true' ? 'checked':''} />
                  Staff name
                </label>
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="rc-show-txn-id" ${get('receipt_show_txn_id','true')==='true' ? 'checked':''} />
                  Transaction ID
                </label>
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="rc-show-footer-msg" ${get('receipt_show_footer_msg','true')==='true' ? 'checked':''} />
                  Show footer message
                </label>
              </div>
            </div>

            <button class="btn btn-primary" id="btn-save-receipt">Save Receipt Settings</button>
            <div id="receipt-save-status" style="margin-top:8px;font-size:13px;"></div>
          </div>

          <!-- ── Right: live preview ── -->
          <div style="position:sticky;top:16px;">
            <div style="font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em;
                        color:var(--text-muted);margin-bottom:8px;">Live Preview</div>
            <div style="border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;
                        background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.1);">
              <iframe id="receipt-preview-frame"
                      style="width:100%;height:480px;border:none;display:block;
                             transform-origin:top left;"
                      scrolling="auto"></iframe>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:center;">
              Sample preview — real data will vary
            </div>
          </div>

        </div>
      </div>`;

    /* ── Save ─────────────────────────────────────────────────── */
    const saveBtn  = content.querySelector('#btn-save-receipt');
    const statusEl = content.querySelector('#receipt-save-status');

    const getChecked = id => content.querySelector(id).checked ? 'true' : 'false';
    const getVal     = id => content.querySelector(id).value;

    const saveSettings = async () => {
      // Single atomic write — Config.set called 15× concurrently would race
      // (each does load-modify-save), so only the last would persist.
      await Config.setMany({
        receipt_paper_width:       getVal('#rc-paper-width'),
        receipt_font:              getVal('#rc-font'),
        receipt_font_size:         getVal('#rc-font-size'),
        receipt_separator:         getVal('#rc-separator'),
        receipt_title:             getVal('#rc-title'),
        receipt_show_logo:         getChecked('#rc-show-logo'),
        receipt_show_header_msg:   getChecked('#rc-show-header-msg'),
        receipt_show_patient_name: getChecked('#rc-show-patient-name'),
        receipt_show_patient_phn:  getChecked('#rc-show-patient-phn'),
        receipt_show_rx_number:    getChecked('#rc-show-rx-number'),
        receipt_show_din:          getChecked('#rc-show-din'),
        receipt_show_tax_detail:   getChecked('#rc-show-tax-detail'),
        receipt_show_staff:        getChecked('#rc-show-staff'),
        receipt_show_txn_id:       getChecked('#rc-show-txn-id'),
        receipt_show_footer_msg:   getChecked('#rc-show-footer-msg'),
      });
      statusEl.textContent = '✓ Saved';
      statusEl.style.color = 'var(--success)';
      setTimeout(() => { statusEl.textContent = ''; }, 2500);
    };

    saveBtn.addEventListener('click', saveSettings);

    /* ── Live preview ─────────────────────────────────────────── */
    const frame = content.querySelector('#receipt-preview-frame');

    const buildPreviewHtml = () => {
      const paperMm   = parseInt(getVal('#rc-paper-width')) || 80;
      const paperPx   = Math.round(paperMm * 3.78); // 96dpi approx
      const fontMap   = { courier: '"Courier New",Courier,monospace', arial: 'Arial,Helvetica,sans-serif', system: 'system-ui,sans-serif' };
      const fontFam   = fontMap[getVal('#rc-font')] || fontMap.courier;
      const fontSize  = parseInt(getVal('#rc-font-size')) || 11;
      const sepStyle  = getVal('#rc-separator');
      const sepMap    = { dashed:'border-top:1px dashed #000', solid:'border-top:1px solid #000', stars:'border-top:none', equals:'border-top:none' };
      const sepContent= { dashed:'', solid:'', stars:'* * * * * * * * * * * * * *', equals:'= = = = = = = = = = = = = =' };
      const sepCss    = sepMap[sepStyle] || sepMap.dashed;
      const sepTxt    = sepContent[sepStyle] || '';

      const title     = getVal('#rc-title').trim() || 'RECEIPT';
      const showLogo      = content.querySelector('#rc-show-logo').checked;
      const showHeaderMsg = content.querySelector('#rc-show-header-msg').checked;
      const showPatName   = content.querySelector('#rc-show-patient-name').checked;
      const showPatPhn    = content.querySelector('#rc-show-patient-phn').checked;
      const showRxNum     = content.querySelector('#rc-show-rx-number').checked;
      const showTax       = content.querySelector('#rc-show-tax-detail').checked;
      const showStaff     = content.querySelector('#rc-show-staff').checked;
      const showTxnId     = content.querySelector('#rc-show-txn-id').checked;
      const showFooter    = content.querySelector('#rc-show-footer-msg').checked;

      const logo = localStorage.getItem('pharmacy_logo_data') || '';

      const sep = sepTxt
        ? `<div style="text-align:center;font-size:${fontSize-2}px;letter-spacing:2px;margin:5px 0;color:#555;">${sepTxt}</div>`
        : `<div style="margin:5px 0;border:none;${sepCss};"></div>`;

      return `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>
          @page{size:${paperMm}mm auto;margin:0;}
          *{box-sizing:border-box;}
          html{width:${paperPx}px;}
          body{margin:0;padding:6px 8px;background:#fff;width:${paperPx}px;font-family:${fontFam};font-size:${fontSize}px;color:#000;}
          .rh{text-align:center;margin-bottom:6px;}
          .rpn{font-size:${fontSize+2}px;font-weight:bold;letter-spacing:1px;}
          .rhn{font-size:${fontSize-1}px;}
          .rtitle{text-align:center;font-size:${fontSize+1}px;font-weight:bold;letter-spacing:2px;margin:6px 0;}
          .ri{display:flex;justify-content:space-between;margin-bottom:3px;gap:4px;}
          .rin{flex:1;word-break:break-word;}
          .rip{white-space:nowrap;padding-left:4px;}
          .rrx{font-size:${fontSize-1}px;color:#555;margin:-2px 0 3px 6px;}
          .rt{margin-top:4px;}
          .rtl{display:flex;justify-content:space-between;margin-bottom:2px;}
          .rtl.grand{font-weight:bold;}
          .rf{text-align:center;margin-top:8px;font-size:${fontSize-1}px;line-height:1.5;}
          .dim{font-size:${fontSize-1}px;color:#555;}
        </style></head><body>
        <div>
          <div class="rh">
            ${showLogo && logo ? `<img src="${logo}" style="max-width:100%;max-height:36px;display:block;margin:0 auto 4px;" />` : ''}
            <div class="rpn">YOUR PHARMACY NAME</div>
            <div class="rhn">123 Main Street, City, Province</div>
            <div class="rhn">Tel: (555) 123-4567</div>
            <div class="rhn">GST#: 123456789 RT 0001</div>
            ${showHeaderMsg ? `<div class="rhn" style="margin-top:3px;font-style:italic;">Free delivery available!</div>` : ''}
          </div>
          ${sep}
          <div class="rtitle">${title}</div>
          ${sep}
          <div class="dim">
            ${showPatName ? '<div>Patient: <strong>John Smith</strong></div>' : ''}
            ${showPatPhn  ? '<div>PHN: 9876543210</div>' : ''}
            <div>Date: ${new Date().toLocaleString()}</div>
            ${showTxnId   ? '<div>Txn #1042</div>' : ''}
            ${showStaff   ? '<div>Staff: Sarah</div>' : ''}
          </div>
          ${sep}
          <div class="ri"><span class="rin">[Rx] Metformin 500mg [Qty:90]</span><span class="rip">$0.00</span></div>
          ${showRxNum ? '<div class="rrx">Rx# 60004-A</div>' : ''}
          <div class="ri"><span class="rin">Vitamin D 1000IU (x2)</span><span class="rip">$18.99</span></div>
          <div class="ri"><span class="rin">Saline Nasal Spray</span><span class="rip">$8.49</span></div>
          ${sep}
          <div class="rt">
            <div class="rtl"><span>Subtotal</span><span>$27.48</span></div>
            ${showTax ? '<div class="rtl"><span>GST (5%)</span><span>$1.37</span></div>' : ''}
            ${showTax ? '<div class="rtl"><span>PST (7%)</span><span>$1.92</span></div>' : ''}
            <div class="rtl grand"><span>TOTAL</span><span>$30.77</span></div>
            ${sep}
            <div class="rtl"><span>Paid (CASH)</span><span>$35.00</span></div>
            <div class="rtl"><span>Change</span><span>$4.23</span></div>
          </div>
          ${sep}
          <div class="rf">
            ${showFooter ? 'Thank you for choosing our pharmacy!<br>Follow us on social media.' : ''}
          </div>
        </div>
      </body></html>`;
    };

    const updatePreview = () => {
      const html = buildPreviewHtml();
      const paperMm = parseInt(getVal('#rc-paper-width')) || 80;
      const paperPx = Math.round(paperMm * 3.78);
      // Scale the preview to fit the 260px-wide panel
      const scale = Math.min(1, 248 / paperPx);
      frame.style.transform = `scale(${scale})`;
      frame.style.transformOrigin = 'top left';
      frame.style.width  = (248 / scale) + 'px';
      frame.style.height = '480px';
      const doc = frame.contentDocument || frame.contentWindow.document;
      doc.open(); doc.write(html); doc.close();
    };

    // Debounce preview updates
    let _previewTimer = null;
    const schedulePreview = () => {
      clearTimeout(_previewTimer);
      _previewTimer = setTimeout(updatePreview, 200);
    };

    content.querySelectorAll('select, input[type=checkbox], input[type=text]')
      .forEach(el => el.addEventListener('change', schedulePreview));
    content.querySelectorAll('input[type=text]')
      .forEach(el => el.addEventListener('input', schedulePreview));

    // Initial preview
    updatePreview();
  }

  _renderDateTime(content) {
    // Gather system info from the browser
    const tz         = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale     = navigator.language;
    const now        = new Date();
    const fmtDate    = d => d.toLocaleDateString(locale, { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const fmtTime    = d => d.toLocaleTimeString(locale);
    const fmtOffset  = d => {
      const off = -d.getTimezoneOffset();
      const sign = off >= 0 ? '+' : '-';
      const h    = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
      const m    = String(Math.abs(off) % 60).padStart(2, '0');
      return `UTC${sign}${h}:${m}`;
    };

    content.innerHTML = `
      <div class="settings-section">
        <h3>Date &amp; Time</h3>
        <p class="text-muted" style="font-size:13px;margin-bottom:20px;">
          The POS reads time directly from your computer's system clock. All receipts,
          transactions, and reports use the time shown here.
        </p>

        <!-- Live clock card -->
        <div style="background:var(--surface2);border-radius:var(--radius);padding:20px 24px;
                    margin-bottom:20px;display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div id="dt-clock" style="font-size:36px;font-weight:800;letter-spacing:-1px;font-variant-numeric:tabular-nums;">
              ${fmtTime(now)}
            </div>
            <div id="dt-date" style="font-size:14px;color:var(--text-muted);margin-top:4px;">
              ${fmtDate(now)}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
            <div style="display:flex;gap:10px;align-items:center;">
              <span style="color:var(--text-muted);width:80px;">Timezone</span>
              <strong id="dt-tz">${tz}</strong>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
              <span style="color:var(--text-muted);width:80px;">UTC Offset</span>
              <strong id="dt-offset">${fmtOffset(now)}</strong>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
              <span style="color:var(--text-muted);width:80px;">Locale</span>
              <strong>${locale}</strong>
            </div>
          </div>
        </div>

        <!-- Sync status -->
        <div class="alert alert-info" style="font-size:13px;margin-bottom:20px;">
          <strong>&#128274; Synced to system clock.</strong>
          The POS always uses your computer's current time and timezone automatically.
          To change the time or timezone, update it in your <strong>Mac System Settings → General → Date &amp; Time</strong>,
          then click <strong>Sync Now</strong> below to refresh.
        </div>

        <button class="btn btn-primary" id="btn-sync-time">&#8635; Sync Now</button>
        <div id="dt-sync-msg" style="margin-top:10px;font-size:13px;"></div>

        <hr style="margin:24px 0;" />

        <!-- How to change timezone on Mac -->
        <h4 style="margin-bottom:10px;font-size:14px;">How to change your timezone (Mac)</h4>
        <ol style="font-size:13px;color:var(--text-muted);line-height:2;padding-left:18px;margin:0;">
          <li>Open <strong>Apple menu  → System Settings</strong></li>
          <li>Go to <strong>General → Date &amp; Time</strong></li>
          <li>Turn off <em>"Set time zone automatically"</em> if you need to pick manually</li>
          <li>Select your city / timezone from the map or dropdown</li>
          <li>Come back here and click <strong>Sync Now</strong></li>
        </ol>

        <hr style="margin:24px 0;" />

        <!-- Format preview -->
        <h4 style="margin-bottom:12px;font-size:14px;">Format preview</h4>
        <table class="table" style="font-size:13px;max-width:480px;">
          <tbody>
            <tr><td style="color:var(--text-muted);">Receipt timestamp</td>
                <td><strong>${now.toLocaleString(locale)}</strong></td></tr>
            <tr><td style="color:var(--text-muted);">Date only</td>
                <td><strong>${now.toLocaleDateString(locale)}</strong></td></tr>
            <tr><td style="color:var(--text-muted);">Time only</td>
                <td><strong>${now.toLocaleTimeString(locale)}</strong></td></tr>
            <tr><td style="color:var(--text-muted);">Short (reports)</td>
                <td><strong>${now.toLocaleString(locale, { dateStyle:'short', timeStyle:'short' })}</strong></td></tr>
          </tbody>
        </table>
      </div>`;

    // Live clock tick
    const tick = () => {
      const d = new Date();
      const clockEl = content.querySelector('#dt-clock');
      const dateEl  = content.querySelector('#dt-date');
      const tzEl    = content.querySelector('#dt-tz');
      const offEl   = content.querySelector('#dt-offset');
      if (!clockEl) return; // tab was navigated away
      clockEl.textContent = fmtTime(d);
      dateEl.textContent  = fmtDate(d);
      tzEl.textContent    = Intl.DateTimeFormat().resolvedOptions().timeZone;
      offEl.textContent   = fmtOffset(d);
    };
    const tickInterval = setInterval(tick, 1000);
    // Stop ticking when a different tab is selected
    const observer = new MutationObserver(() => {
      if (!content.querySelector('#dt-clock')) clearInterval(tickInterval);
    });
    observer.observe(content, { childList: true });

    content.querySelector('#btn-sync-time').addEventListener('click', () => {
      const msg   = content.querySelector('#dt-sync-msg');
      const d     = new Date();
      const newTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      tick();
      msg.innerHTML = `<span style="color:var(--success);">&#10003; Synced —
        ${d.toLocaleString(navigator.language)} &nbsp;·&nbsp; ${newTz}</span>`;
      setTimeout(() => { if (msg) msg.textContent = ''; }, 5000);
      Audit.configChange(`Date/time sync confirmed — ${newTz}`);
    });
  }

  async _renderAPI(content) {
    const cfg = await Config.getAll();
    content.innerHTML = `
      <div class="settings-section">
        <h3>API Credentials</h3>
        <div class="alert alert-info">Credentials are encrypted with AES-256 and stored locally.</div>

        <h4 style="margin:16px 0 10px;font-size:14px;color:var(--text-muted);">McKesson PharmaClik</h4>
        <div class="form-group">
          <label>Username</label>
          <input type="text" id="mk-user" value="${cfg.mckesson_username||''}" autocomplete="off" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="mk-pass" value="${cfg.mckesson_password||''}" />
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Account # <span style="font-weight:400;color:var(--text-muted);">(for orders)</span></label>
            <input type="text" id="mk-account" value="${cfg.mckesson_account||''}"
                   placeholder="e.g. 123456" autocomplete="off" />
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">
              WinRx → Supplier → <strong>Acct#</strong>
            </div>
          </div>
          <div class="form-group">
            <label>Customer # <span style="font-weight:400;color:var(--text-muted);">(for invoices &amp; catalog)</span></label>
            <input type="text" id="mk-customer" value="${cfg.mckesson_customer||''}"
                   placeholder="e.g. 1234567" autocomplete="off" />
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">
              WinRx → Supplier → <strong>Customer#</strong>
            </div>
          </div>
        </div>

        <h4 style="margin:16px 0 10px;font-size:14px;color:var(--text-muted);">Clover — Network Pay Display</h4>
        <div class="alert alert-info" style="font-size:13px;">
          Enter your Clover device details below and click <strong>Save Clover Device</strong>.
          The payment bridge starts automatically inside the app — no separate service to run.
          Then use <strong>Pair with Device</strong>.
        </div>

        <div class="form-row" style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Clover Device IP <span style="font-weight:400;color:var(--text-muted);">(from Network Pay Display screen)</span></label>
            <input type="text" id="cl-device-ip" value="${cfg.clover_device_ip||''}"
                   placeholder="e.g. 192.168.0.155" style="font-family:monospace;" />
          </div>
          <div class="form-group">
            <label>Device Port</label>
            <input type="text" id="cl-device-port" value="${cfg.clover_device_port||'12345'}"
                   placeholder="12345" style="font-family:monospace;" />
          </div>
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>POS Station Name</label>
            <input type="text" id="cl-pos-id" value="${cfg.clover_pos_id||'PharmacyPOS'}"
                   placeholder="PharmacyPOS" />
          </div>
          <div class="form-group">
            <label>Service Port <span style="font-weight:400;color:var(--text-muted);">(default 3001)</span></label>
            <input type="text" id="cl-service-port" value="${cfg.clover_service_port||'3001'}"
                   placeholder="3001" style="font-family:monospace;" />
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
          <button class="btn btn-primary btn-sm" id="btn-save-clover-device">💾 Save Clover Device</button>
          <span id="clover-device-status" style="font-size:13px;"></span>
        </div>

        <div class="form-group">
          <label>Local Pay Service URL <span style="font-weight:400;color:var(--text-muted);">(auto-set from Service Port)</span></label>
          <div style="display:flex;gap:8px;align-items:flex-start;">
            <input type="text" id="cl-local-url" value="${cfg.clover_local_url||'http://localhost:3001'}"
                   placeholder="http://localhost:3001" style="flex:1;" />
            <button class="btn btn-outline btn-sm" id="btn-ping-clover" style="white-space:nowrap;">Test</button>
          </div>
          <div id="clover-ping-result" style="margin-top:6px;font-size:13px;"></div>
        </div>
        <div class="form-group">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" id="btn-clover-pair">&#128279; Pair with Device</button>
            <span id="clover-pair-status" style="font-size:13px;"></span>
          </div>
          <div class="text-muted mt-2" style="font-size:12px;">
            On the Clover device: open <strong>Network Pay Display</strong> → press <strong>Start</strong>,
            then click Pair here. Enter the manager password on the device — a 4-digit code will appear.
          </div>
        </div>

        <h4 style="margin:20px 0 10px;font-size:14px;color:var(--text-muted);">Document Storage (Receipt Upload)</h4>
        <div class="alert alert-info" style="font-size:13px;">
          After payment, the POS drops a PDF with a Code 128 barcode into the WinRx document inbox folder.
          WinRx reads the barcode and auto-attaches the receipt to the correct patient Rx record.
        </div>
        <div class="form-group">
          <label>WinRx Document Inbox Folder</label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="doc-folder-path" value="${cfg.doc_folder_path||''}"
                   placeholder="e.g. C:\\WinRx\\Documents\\Inbox" style="font-family:monospace;flex:1;" />
            <button class="btn btn-outline" data-browse="#doc-folder-path" style="white-space:nowrap;">📁 Browse</button>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">
            PDF files named <code>RCPT{RxNum}A.pdf</code> will be written here after each payment.
            The folder must exist and WinRx must be configured to watch it.
          </div>
        </div>

        <button class="btn btn-primary" id="btn-save-api">Save Settings</button>
        <div id="api-save-status" style="margin-top:8px;font-size:13px;"></div>
      </div>`;

    /* Save Clover device config → writes .env + restarts the in-app bridge */
    content.querySelector('#btn-save-clover-device')?.addEventListener('click', async () => {
      const statusEl = content.querySelector('#clover-device-status');
      const ip       = content.querySelector('#cl-device-ip').value.trim();
      const dport    = content.querySelector('#cl-device-port').value.trim() || '12345';
      const posId    = content.querySelector('#cl-pos-id').value.trim() || 'PharmacyPOS';
      const sport    = content.querySelector('#cl-service-port').value.trim() || '3001';

      if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        statusEl.textContent = 'Enter a valid device IP (e.g. 192.168.0.155).';
        statusEl.style.color = 'var(--danger)';
        return;
      }

      // Save to app config + keep the service URL in sync
      const svcUrl = `http://localhost:${sport}`;
      await Config.setMany({
        clover_device_ip:   ip,
        clover_device_port: dport,
        clover_pos_id:      posId,
        clover_service_port: sport,
        clover_local_url:   svcUrl,
      });
      content.querySelector('#cl-local-url').value = svcUrl;

      // Write .env + restart the bridge (desktop only)
      if (window.electronAPI?.saveCloverEnv) {
        statusEl.textContent = 'Saving & restarting payment bridge…';
        statusEl.style.color = 'var(--text-muted)';
        try {
          const res = await window.electronAPI.saveCloverEnv({
            CLOVER_DEVICE_IP: ip, CLOVER_DEVICE_PORT: dport,
            CLOVER_POS_ID: posId, PORT: sport,
          });
          if (res?.ok) {
            statusEl.textContent = '✓ Saved. Bridge restarting — wait ~5 s, then Pair with Device.';
            statusEl.style.color = 'var(--success)';
          } else {
            statusEl.textContent = '⚠ Saved config, but bridge restart failed: ' + (res?.error || 'unknown');
            statusEl.style.color = 'var(--warning)';
          }
        } catch(e) {
          statusEl.textContent = '⚠ Saved config, but: ' + e.message;
          statusEl.style.color = 'var(--warning)';
        }
      } else {
        statusEl.textContent = '✓ Saved (browser mode — start the bridge manually).';
        statusEl.style.color = 'var(--success)';
      }
    });

    content.querySelector('#btn-ping-clover').addEventListener('click', async () => {
      const resultEl = content.querySelector('#clover-ping-result');
      const url = content.querySelector('#cl-local-url').value.trim();
      if (!url) { resultEl.textContent = 'Enter a service URL first.'; resultEl.style.color = 'var(--danger)'; return; }
      resultEl.textContent = 'Testing…';
      resultEl.style.color = 'var(--text-muted)';
      try {
        await Config.set('clover_local_url', url);
        const data = await CloverAPI.ping();
        resultEl.textContent = data.ok ? `✓ Paired and ready (${data.status})` : `⚠ Service running — status: ${data.status}`;
        resultEl.style.color = data.ok ? 'var(--success)' : 'var(--warning)';
      } catch(e) {
        resultEl.textContent = `✗ Cannot reach service: ${e.message}`;
        resultEl.style.color = 'var(--danger)';
      }
    });

    content.querySelector('#btn-clover-pair').addEventListener('click', async () => {
      const svcUrl = content.querySelector('#cl-local-url').value.trim() || 'http://localhost:3001';
      await Config.set('clover_local_url', svcUrl);
      this._showCloverPairModal(svcUrl);
    });

    content.querySelector('#btn-save-api').addEventListener('click', async () => {
      await Config.setMany({
        mckesson_username: content.querySelector('#mk-user').value.trim(),
        mckesson_password: content.querySelector('#mk-pass').value,
        mckesson_account:  content.querySelector('#mk-account').value.trim(),
        mckesson_customer: content.querySelector('#mk-customer').value.trim(),
        clover_local_url:  content.querySelector('#cl-local-url').value.trim(),
        doc_folder_path:   content.querySelector('#doc-folder-path').value.trim(),
      });
      Audit.configChange('API settings updated');
      const status = content.querySelector('#api-save-status');
      status.textContent = 'Saved.';
      status.style.color = 'var(--success)';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });
  }

  _showCloverPairModal(svcUrl) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <h3>Pair with Clover Device</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div id="pair-step-start">
            <ol style="padding-left:18px;font-size:13px;line-height:1.8;">
              <li>On the Clover device, open <strong>Network Pay Display</strong></li>
              <li>Tap <strong>Start</strong> (if not already started)</li>
              <li>Tap <strong>Initiate Pairing</strong> on the device</li>
              <li>Enter the <strong>manager password</strong> on the Clover when prompted</li>
              <li>Click <strong>Start Pairing</strong> below — a code will appear here</li>
            </ol>
            <div id="pair-start-err" class="alert alert-danger" style="display:none;margin-top:8px;"></div>
          </div>
          <div id="pair-step-code" style="display:none;">
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">
              Enter this code on the <strong>Clover device screen</strong>:
            </p>
            <div style="text-align:center;margin:16px 0;">
              <div id="pair-code-display"
                   style="display:inline-block;font-size:48px;font-weight:800;letter-spacing:12px;
                          color:var(--primary);background:rgba(13,110,253,.08);
                          border:2px solid var(--primary);border-radius:12px;
                          padding:12px 28px;min-width:160px;">
                —
              </div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:8px;" id="pair-code-hint">
                Waiting for code from device…
              </div>
            </div>
            <div id="pair-code-err" class="alert alert-danger" style="display:none;margin-top:8px;"></div>
          </div>
          <div id="pair-step-done" style="display:none;text-align:center;padding:20px 0;">
            <div style="font-size:36px;">✓</div>
            <div style="font-size:15px;font-weight:600;color:var(--success);margin-top:8px;">Paired successfully!</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">Clover is ready to take payments.</div>
          </div>
        </div>
        <div class="modal-footer" id="pair-footer">
          <button class="btn btn-outline" id="pair-cancel">Cancel</button>
          <button class="btn btn-primary" id="pair-action">Start Pairing</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    let step        = 'start';
    let pollTimer   = null;

    const close = () => { clearInterval(pollTimer); modal.remove(); };
    const stepStart       = modal.querySelector('#pair-step-start');
    const stepCode        = modal.querySelector('#pair-step-code');
    const stepDone        = modal.querySelector('#pair-step-done');
    const startErr        = modal.querySelector('#pair-start-err');
    const codeErr         = modal.querySelector('#pair-code-err');
    const codeDisplay     = modal.querySelector('#pair-code-display');
    const codeHint        = modal.querySelector('#pair-code-hint');
    const actionBtn       = modal.querySelector('#pair-action');
    const footer          = modal.querySelector('#pair-footer');

    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#pair-cancel').addEventListener('click', close);

    const showDone = () => {
      clearInterval(pollTimer);
      step = 'done';
      stepCode.style.display  = 'none';
      stepStart.style.display = 'none';
      stepDone.style.display  = '';
      footer.innerHTML = '<button class="btn btn-primary" id="pair-close-done">Done</button>';
      modal.querySelector('#pair-close-done').addEventListener('click', close);
    };

    // Poll /clover/pair/status while showing code — detect when device confirms pairing
    const startPolling = () => {
      clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        try {
          const r = await fetch(`${svcUrl}/clover/pair/status`);
          const d = await r.json();
          if (d.paired) { showDone(); return; }
          if (d.pairingCode && codeDisplay.textContent !== d.pairingCode) {
            codeDisplay.textContent = d.pairingCode;
            codeHint.textContent    = 'Type this code on the Clover device screen';
          }
        } catch(_) {}
      }, 2000);
    };

    actionBtn.addEventListener('click', async () => {
      if (step !== 'start') return;
      actionBtn.disabled    = true;
      actionBtn.textContent = 'Connecting…';
      startErr.style.display = 'none';
      try {
        const r = await fetch(`${svcUrl}/clover/pair/start`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
        });
        const d = await r.json();
        if (d.status === 'paired') { showDone(); return; }

        // Move to code-display step
        step = 'code';
        stepStart.style.display = 'none';
        stepCode.style.display  = '';
        actionBtn.disabled      = true;
        actionBtn.textContent   = 'Waiting for device…';

        // If code already in response, show it immediately
        if (d.pairingCode) {
          codeDisplay.textContent = d.pairingCode;
          codeHint.textContent    = 'Type this code on the Clover device screen';
        }
        startPolling();

      } catch(e) {
        startErr.style.display = 'block';
        startErr.textContent   = 'Cannot reach the Clover payment bridge. Enter the device IP above and click "Save Clover Device" first (that starts the bridge). If it still fails, the app may need a rebuild.';
        actionBtn.disabled     = false;
        actionBtn.textContent  = 'Start Pairing';
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     Shelf Tags — printable price stickers / shelf labels
     ════════════════════════════════════════════════════════════ */
  /* ════════════════════════════════════════════════════════════
     Staff Name Tags / Badges — pharmacy name + employee + designation
     Two presets: name-badge label (2⅓×3⅜) and credit-card (3.375×2.125)
     ════════════════════════════════════════════════════════════ */
  async _renderNameTags(content) {
    const cfg   = await Config.getAll();
    const phName = cfg.pharmacy_name || 'Your Pharmacy';
    const logo   = localStorage.getItem('pharmacy_logo_data') || '';
    const staff  = DB.getAllStaff().filter(s => s.active);

    // Badge presets (mm)
    const PRESETS = {
      namebadge:  { name: 'Name-badge label (2⅓" × 3⅜")', w: 85.7, h: 59.3 },
      creditcard: { name: 'Credit-card (3.375" × 2.125")', w: 85.7, h: 54.0 },
    };

    content.innerHTML = `
      <div class="settings-section">
        <h3>Staff Name Tags</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">
          Print staff badges with the pharmacy name, employee name, and designation.
          Set each person's designation/title in <strong>Staff Management</strong>.
        </p>

        <div style="display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:start;">
          <div>
            <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;margin-bottom:14px;">
              <div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">Badge Size</div>
              <select id="nt-preset" style="width:100%;">
                ${Object.entries(PRESETS).map(([k,v]) => `<option value="${k}">${v.name}</option>`).join('')}
              </select>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
                <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
                  <input type="checkbox" id="nt-logo" ${logo?'checked':''} ${logo?'':'disabled'}/> Show logo
                </label>
                <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
                  <input type="checkbox" id="nt-license" checked/> Show license # (if any)
                </label>
              </div>
            </div>

            <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;margin-bottom:14px;">
              <div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">Staff</div>
              ${staff.length ? staff.map(s => `
                <label style="display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);">
                  <input type="checkbox" class="nt-staff" data-id="${s.staff_id}" />
                  <span style="flex:1;">${s.name}
                    <span style="color:var(--text-muted);font-size:11px;">— ${s.designation || Auth.roleLabel(s.role)}${s.license_number?` · Lic# ${s.license_number}`:''}</span>
                  </span>
                </label>`).join('')
                : '<div style="color:var(--text-muted);font-size:13px;">No staff found.</div>'}
              <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">
                Tip: set the <strong>Designation / Title</strong> for each person in Staff Management.
              </div>
            </div>

            <div style="display:flex;gap:8px;">
              <button class="btn btn-primary" id="nt-print">🖨 Print Selected</button>
              <span id="nt-count" style="align-self:center;font-size:13px;color:var(--text-muted);"></span>
            </div>
          </div>

          <div style="position:sticky;top:16px;">
            <div style="font-weight:600;font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Preview</div>
            <div id="nt-preview" style="border:2px solid var(--border);border-radius:var(--radius);
                 background:#fff;padding:10px;display:flex;align-items:center;justify-content:center;min-height:120px;"></div>
          </div>
        </div>
      </div>`;

    const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    // Build one badge's inner HTML
    const brand = window.BRAND_KIT || { primary:'#1e4031' };
    const badgeHtml = (s, fields, p) => {
      const desig = s.designation || Auth.roleLabel(s.role);
      const showLic = fields.license && s.license_number;
      const nameSize = p.h < 56 ? '17px' : '20px';
      return `
        <div style="height:100%;box-sizing:border-box;display:flex;flex-direction:column;
                    border:2px solid ${brand.primary};border-radius:6px;overflow:hidden;">
          <div style="background:${brand.primary};color:#fff;padding:5px 8px;display:flex;align-items:center;
                      justify-content:center;gap:6px;">
            ${fields.logo && logo ? `<img src="${logo}" style="max-height:16px;max-width:36px;">` : ''}
            <span style="font-size:11px;font-weight:700;letter-spacing:.5px;">${esc(phName).toUpperCase()}</span>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
                      text-align:center;padding:6px 10px;">
            <div style="font-size:${nameSize};font-weight:800;line-height:1.1;color:#111;">${esc(s.name)}</div>
            <div style="font-size:13px;color:${brand.primary};margin-top:2px;font-weight:600;">${esc(desig)}</div>
            ${showLic ? `<div style="font-size:10px;color:#666;margin-top:1px;">Lic# ${esc(s.license_number)}</div>` : ''}
          </div>
        </div>`;
    };

    const getFields = () => ({
      logo:    content.querySelector('#nt-logo').checked,
      license: content.querySelector('#nt-license').checked,
    });

    const refreshPreview = () => {
      const p = PRESETS[content.querySelector('#nt-preset').value];
      const sample = staff[0] || { name:'Jane Smith', designation:'Pharmacist', role:'MANAGER', license_number:'12345' };
      const scale = 3.0;
      content.querySelector('#nt-preview').innerHTML =
        `<div style="width:${p.w*scale}px;height:${p.h*scale}px;">${badgeHtml(sample, getFields(), p)}</div>`;
    };

    const updateCount = () => {
      const n = content.querySelectorAll('.nt-staff:checked').length;
      content.querySelector('#nt-count').textContent = n ? `${n} selected` : '';
    };

    content.querySelectorAll('input').forEach(el => el.addEventListener('change', () => { refreshPreview(); updateCount(); }));
    content.querySelector('#nt-preset').addEventListener('change', refreshPreview);

    content.querySelector('#nt-print').addEventListener('click', () => {
      const ids = [...content.querySelectorAll('.nt-staff:checked')].map(c => parseInt(c.dataset.id));
      if (!ids.length) { alert('Select at least one staff member.'); return; }
      const fields = getFields();
      const p = PRESETS[content.querySelector('#nt-preset').value];
      const chosen = staff.filter(s => ids.includes(s.staff_id));

      // One badge per page, sized exactly to the label — same model as Shelf Tags
      // so it prints correctly on a thermal label printer (one label per feed).
      const pages = chosen.map(s =>
        `<div style="width:${p.w}mm;height:${p.h}mm;overflow:hidden;page-break-after:always;">${badgeHtml(s, fields, p)}</div>`
      ).join('');
      const doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        @page{size:${p.w}mm ${p.h}mm;margin:0;}
        *{box-sizing:border-box;}
        html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;}
      </style></head><body>${pages}</body></html>`;

      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;left:-9999px;width:600px;height:800px;border:none;';
      document.body.appendChild(frame);
      frame.contentDocument.open(); frame.contentDocument.write(doc); frame.contentDocument.close();
      setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print();
        setTimeout(() => frame.remove(), 1000); }, 400);
    });

    refreshPreview();
  }

  async _renderShelfTags(content) {
    const presetOpts = Object.entries(ShelfTags.PRESETS)
      .map(([k,v]) => `<option value="${k}">${v.name}</option>`).join('');

    content.innerHTML = `
      <div class="settings-section">
        <h3>Shelf Tags / Price Stickers</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">
          Generate printable shelf tags with price, barcode, and product info.
          Works on any printer — use Avery label sheets or a thermal label printer.
        </p>

        <div style="display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:start;">

          <!-- LEFT: controls -->
          <div>
            <!-- Label size -->
            <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;margin-bottom:14px;">
              <div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">Label Size</div>
              <select id="st-preset" style="width:100%;">${presetOpts}</select>
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
                Avery sheets print on a normal printer. Thermal = single label on a roll printer.
              </div>
            </div>

            <!-- Fields to show -->
            <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;margin-bottom:14px;">
              <div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">Show on Tag</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                ${[
                  ['name','Product name',true],['price','Price',true],
                  ['barcode','Barcode',true],['unitPrice','Unit price ($/ea)',false],
                  ['sku','SKU / McKesson #',false],['din','DIN',false],
                  ['date','Date printed',false],['border','Border outline',true],
                ].map(([id,label,def]) => `
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                    <input type="checkbox" id="st-f-${id}" ${def?'checked':''} /> ${label}
                  </label>`).join('')}
              </div>
              <div style="margin-top:10px;">
                <label style="font-size:12px;">Barcode type</label>
                <select id="st-barcode-type" style="max-width:240px;margin-top:4px;">
                  <option value="auto">Auto (UPC/EAN if numeric, else Code 128)</option>
                  <option value="code128">Always Code 128</option>
                </select>
              </div>
            </div>

            <!-- Product selection -->
            <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;margin-bottom:14px;">
              <div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">Products</div>
              <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                <button class="btn btn-outline btn-sm" id="st-add-all">+ All custom products</button>
                <button class="btn btn-outline btn-sm" id="st-add-low">+ Low stock items</button>
                <button class="btn btn-outline btn-sm" id="st-clear">Clear</button>
              </div>
              <input type="text" id="st-search" placeholder="Search to add a product…" style="width:100%;" autocomplete="off" />
              <div id="st-search-results" style="display:none;max-height:160px;overflow-y:auto;
                   border:1px solid var(--border);border-radius:var(--radius);margin-top:6px;"></div>
              <div id="st-selected" style="margin-top:10px;max-height:220px;overflow-y:auto;"></div>
            </div>

            <div style="display:flex;gap:8px;">
              <button class="btn btn-primary" id="st-print">🖨 Print Tags</button>
              <button class="btn btn-outline" id="st-pdf">⬇ Save PDF</button>
              <span id="st-count" style="align-self:center;font-size:13px;color:var(--text-muted);"></span>
            </div>
          </div>

          <!-- RIGHT: live preview -->
          <div style="position:sticky;top:16px;">
            <div style="font-weight:600;font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Tag Preview</div>
            <div id="st-preview" style="border:2px solid var(--border);border-radius:var(--radius);
                 background:#fff;padding:10px;min-height:120px;display:flex;align-items:center;justify-content:center;">
              <span style="color:var(--text-muted);font-size:12px;">Add a product to preview</span>
            </div>
          </div>

        </div>
      </div>`;

    const selected = []; // {description, price, barcode, sku, din, packSize}

    const getFields = () => ({
      name:      content.querySelector('#st-f-name').checked,
      price:     content.querySelector('#st-f-price').checked,
      barcode:   content.querySelector('#st-f-barcode').checked,
      unitPrice: content.querySelector('#st-f-unitPrice').checked,
      sku:       content.querySelector('#st-f-sku').checked,
      din:       content.querySelector('#st-f-din').checked,
      date:      content.querySelector('#st-f-date').checked,
      border:    content.querySelector('#st-f-border').checked,
      barcodeType: content.querySelector('#st-barcode-type').value,
    });

    const toTag = p => ({
      description: p.description,
      price:       p.price != null ? p.price
                  : (p.price_override != null ? p.price_override
                  : (p.suggested_retail || p.regular_unit_price || 0)),
      barcode:     p.upc || p.upc_unit || p.gtin_unit || '',
      sku:         p.mckesson_item_no || '',
      din:         p.din || '',
      packSize:    p.pack_size || null,
    });

    const refreshPreview = () => {
      const preview = content.querySelector('#st-preview');
      const presetKey = content.querySelector('#st-preset').value;
      const p = ShelfTags.PRESETS[presetKey];
      const sample = selected[0] || { description:'Sample Product Name 500mg', price:9.99, barcode:'064589001926', sku:'123456', din:'02246789' };
      const fields = getFields();
      if (fields.unitPrice && sample.packSize) sample.unitPrice = ShelfTags.unitPriceStr(sample.price, sample.packSize, 'unit');
      // Render at ~3.5px/mm scale
      const scale = 3.5;
      preview.innerHTML = `<div style="width:${p.labelW*scale}px;height:${p.labelH*scale}px;
        border:1px dashed #bbb;background:#fff;">${ShelfTags.buildTagHtml(sample, fields, p)}</div>`;
    };

    const refreshSelected = () => {
      const el = content.querySelector('#st-selected');
      content.querySelector('#st-count').textContent =
        selected.length ? `${selected.length} tag${selected.length!==1?'s':''}` : '';
      if (!selected.length) { el.innerHTML = ''; refreshPreview(); return; }
      el.innerHTML = selected.map((s,i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;
             padding:5px 8px;border-bottom:1px solid var(--border);font-size:13px;">
          <span style="flex:1;">${s.description}</span>
          <span style="color:var(--text-muted);">$${Number(s.price||0).toFixed(2)}</span>
          <button class="btn btn-sm st-rm" data-i="${i}" style="color:var(--danger);background:none;border:none;cursor:pointer;">✕</button>
        </div>`).join('');
      el.querySelectorAll('.st-rm').forEach(b => b.addEventListener('click', () => {
        selected.splice(parseInt(b.dataset.i),1); refreshSelected();
      }));
      refreshPreview();
    };

    // Add all / low / clear
    content.querySelector('#st-add-all').addEventListener('click', () => {
      DB.getAllCustomProducts().forEach(p => selected.push(toTag(p)));
      refreshSelected();
    });
    content.querySelector('#st-add-low').addEventListener('click', () => {
      DB.getLowStockProducts().forEach(p => selected.push(toTag(p)));
      refreshSelected();
    });
    content.querySelector('#st-clear').addEventListener('click', () => {
      selected.length = 0; refreshSelected();
    });

    // Search
    const searchEl = content.querySelector('#st-search');
    const resEl    = content.querySelector('#st-search-results');
    let _t = null;
    searchEl.addEventListener('input', () => {
      clearTimeout(_t);
      _t = setTimeout(() => {
        const term = searchEl.value.trim();
        if (!term) { resEl.style.display='none'; return; }
        const customs = DB.getAllCustomProducts().filter(p =>
          (p.description||'').toLowerCase().includes(term.toLowerCase()) || (p.upc||'').includes(term));
        const catalog = (DB.searchProducts ? DB.searchProducts(term) : []).slice(0,10);
        const all = [...customs, ...catalog].slice(0,12);
        if (!all.length) { resEl.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:13px;">No matches.</div>'; resEl.style.display='block'; return; }
        resEl.innerHTML = all.map((p,i) => `
          <div class="st-res" data-i="${i}" style="padding:7px 10px;cursor:pointer;font-size:13px;
               ${i<all.length-1?'border-bottom:1px solid var(--border);':''}">
            ${p.description} <span style="color:var(--text-muted);">$${Number(p.price ?? p.price_override ?? p.suggested_retail ?? 0).toFixed(2)}</span>
          </div>`).join('');
        resEl.style.display = 'block';
        resEl.querySelectorAll('.st-res').forEach(d => d.addEventListener('click', () => {
          selected.push(toTag(all[parseInt(d.dataset.i)]));
          searchEl.value=''; resEl.style.display='none'; refreshSelected();
        }));
      }, 200);
    });

    // Field toggles refresh preview
    content.querySelectorAll('input[type=checkbox], #st-preset, #st-barcode-type')
      .forEach(el => el.addEventListener('change', refreshPreview));

    // Print / PDF
    const buildDoc = () => {
      const fields = getFields();
      const tags = selected.map(s => ({
        ...s,
        unitPrice: fields.unitPrice && s.packSize ? ShelfTags.unitPriceStr(s.price, s.packSize, 'unit') : '',
      }));
      return ShelfTags.buildSheet(tags, fields, content.querySelector('#st-preset').value);
    };

    content.querySelector('#st-print').addEventListener('click', () => {
      if (!selected.length) { alert('Add at least one product first.'); return; }
      const doc = buildDoc();
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;left:-9999px;width:900px;height:1200px;border:none;';
      document.body.appendChild(frame);
      frame.contentDocument.open(); frame.contentDocument.write(doc); frame.contentDocument.close();
      setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print();
        setTimeout(() => frame.remove(), 1000); }, 400);
    });

    content.querySelector('#st-pdf').addEventListener('click', async () => {
      if (!selected.length) { alert('Add at least one product first.'); return; }
      const doc = buildDoc();
      if (window.electronAPI?.generateA5Pdf) {
        const b64 = await window.electronAPI.generateA5Pdf(doc);
        if (b64) {
          const a = document.createElement('a');
          a.href = 'data:application/pdf;base64,' + b64;
          a.download = `shelf_tags_${new Date().toISOString().slice(0,10)}.pdf`;
          a.click();
          return;
        }
      }
      // Browser fallback — open print dialog
      const w = window.open('', '_blank');
      w.document.write(doc); w.document.close();
    });

    refreshPreview();
  }

  _renderProducts(content) {

    const stockBadge = (qty, threshold) => {
      if (qty === null || qty === undefined) return '<span style="color:var(--text-muted);font-size:12px;">—</span>';
      const isLow = threshold !== null && threshold !== undefined && qty <= threshold;
      const color = qty === 0 ? 'var(--danger)' : isLow ? '#856404' : 'var(--success)';
      const bg    = qty === 0 ? 'rgba(220,53,69,.1)' : isLow ? 'rgba(255,193,7,.15)' : 'rgba(25,135,84,.1)';
      const label = qty === 0 ? 'Out' : isLow ? 'Low' : 'OK';
      return `<span style="font-weight:700;color:${color};">${qty}</span>
              <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${bg};color:${color};margin-left:3px;">${label}</span>`;
    };

    const renderList = (term = '', filter = 'all') => {
      content.querySelector('#products-modal')?.remove();

      // ── Custom products ──
      let customs = DB.getAllCustomProducts();
      if (term) customs = customs.filter(p =>
        p.description.toLowerCase().includes(term.toLowerCase()) || (p.upc||'').includes(term));
      if (filter === 'low') customs = customs.filter(p =>
        p.qty_on_hand !== null && p.qty_threshold !== null && p.qty_on_hand <= p.qty_threshold);

      content.querySelector('#custom-list').innerHTML = customs.length === 0
        ? `<tr><td colspan="9" class="text-muted" style="padding:12px;">
             ${filter==='low' ? 'No low-stock custom products.' : 'No custom products yet.'}</td></tr>`
        : customs.map(p => `
          <tr>
            <td style="max-width:220px;">${p.description}</td>
            <td style="font-size:12px;font-family:monospace;">${p.upc||'—'}</td>
            <td>${Tax.fmt(p.price)}</td>
            <td style="text-align:center;">${p.gst_applicable?'✓':''}</td>
            <td style="text-align:center;">${p.pst_applicable?'✓':''}</td>
            <td style="text-align:center;">${stockBadge(p.qty_on_hand, p.qty_threshold)}</td>
            <td style="text-align:center;font-size:12px;color:var(--text-muted);">${p.qty_threshold??'—'}</td>
            <td style="font-size:12px;color:var(--text-muted);">${p.location||'—'}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-sm btn-outline" data-action="edit-custom" data-id="${p.custom_product_id}" style="margin-right:3px;">&#9998;</button>
              <button class="btn btn-sm btn-danger"  data-action="del-custom"  data-id="${p.custom_product_id}">&#10005;</button>
            </td>
          </tr>`).join('');

      // ── Catalog products ──
      const catalog = term.length >= 2 ? DB.searchProducts(term) : [];
      const filteredCatalog = filter === 'low'
        ? catalog.filter(p => p.qty_on_hand !== null && p.qty_threshold !== null && p.qty_on_hand <= p.qty_threshold)
        : catalog;

      content.querySelector('#catalog-list').innerHTML = !term
        ? `<tr><td colspan="9" class="text-muted" style="padding:12px;">Type at least 2 characters to search the McKesson catalog.</td></tr>`
        : filteredCatalog.length === 0
        ? `<tr><td colspan="9" class="text-muted" style="padding:12px;">No results for "${term}".</td></tr>`
        : filteredCatalog.map(p => `
          <tr>
            <td style="max-width:220px;">${p.description}</td>
            <td style="font-size:12px;font-family:monospace;">${p.upc_unit||p.gtin_unit||'—'}</td>
            <td>${p.price_override!=null ? `<strong>${Tax.fmt(p.price_override)}</strong>` : Tax.fmt(p.suggested_retail||0)}</td>
            <td style="text-align:center;">${p.gst_applicable?'✓':''}</td>
            <td style="text-align:center;">${p.pst_applicable?'✓':''}</td>
            <td style="text-align:center;">${stockBadge(p.qty_on_hand, p.qty_threshold)}</td>
            <td style="text-align:center;font-size:12px;color:var(--text-muted);">${p.qty_threshold??'—'}</td>
            <td style="font-size:12px;color:var(--text-muted);">${p.location||'—'}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-sm btn-outline" data-action="edit-catalog" data-id="${p.product_id}">&#9998;</button>
            </td>
          </tr>`).join('');

      // ── Event listeners ──
      content.querySelectorAll('[data-action="edit-custom"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = DB.getAllCustomProducts().find(x => x.custom_product_id === parseInt(btn.dataset.id));
          if (p) showProductModal({ ...p, _source: 'custom' });
        });
      });
      content.querySelectorAll('[data-action="del-custom"]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!confirm('Delete this custom product?')) return;
          DB.deleteCustomProduct(parseInt(btn.dataset.id));
          renderList(content.querySelector('#prod-search').value, content.querySelector('#prod-filter').value);
        });
      });
      content.querySelectorAll('[data-action="edit-catalog"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = DB.searchProducts(content.querySelector('#prod-search').value)
                      .find(x => x.product_id === parseInt(btn.dataset.id));
          if (p) showProductModal({ ...p, _source: 'catalog' });
        });
      });
    };

    const showProductModal = (p = null) => {
      const isNew     = !p;
      const isCatalog = p?._source === 'catalog';
      const title     = isNew ? 'Add Custom Product' : isCatalog ? `Edit Catalog Product` : 'Edit Custom Product';

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.id = 'products-modal';
      modal.innerHTML = `
        <div class="modal" style="max-width:500px;">
          <div class="modal-header">
            <h3>${title}</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">

            ${isCatalog ? `
              <div style="background:var(--surface2);border-radius:var(--radius);padding:8px 14px;margin-bottom:14px;font-size:12px;color:var(--text-muted);">
                McKesson# ${p.mckesson_item_no||'—'} &nbsp;·&nbsp; Sync price: ${Tax.fmt(p.suggested_retail||0)}
              </div>
              <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:14px;">
                <div class="form-group" style="margin:0;">
                  <label>Description</label>
                  <input type="text" id="mp-desc" value="${(p.description||'').replace(/"/g,'&quot;')}" placeholder="Product name" />
                </div>
                <div class="form-group" style="margin:0;">
                  <label>UPC / Barcode</label>
                  <input type="text" id="mp-upc" value="${(p.upc_unit||p.gtin_unit||'').replace(/"/g,'&quot;')}" placeholder="Optional" />
                </div>
              </div>` : ''}

            ${!isCatalog ? `
              <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
                <div class="form-group">
                  <label>Description <span style="color:var(--danger);">*</span></label>
                  <input type="text" id="mp-desc" value="${p?.description||''}" placeholder="Product name" />
                </div>
                <div class="form-group">
                  <label>UPC / Barcode</label>
                  <input type="text" id="mp-upc" value="${p?.upc||''}" placeholder="Optional" />
                </div>
              </div>
              <div class="form-group">
                <label>Price</label>
                <input type="number" id="mp-price" step="0.01" min="0" value="${p?.price??''}" placeholder="0.00" style="max-width:160px;" />
              </div>` : `
              <div class="form-group">
                <label>Price Override <span style="font-weight:400;color:var(--text-muted);">(leave blank to use sync price)</span></label>
                <input type="number" id="mp-price" step="0.01" min="0" value="${p?.price_override??''}" placeholder="${Tax.fmt(p?.suggested_retail||0)}" style="max-width:160px;" />
              </div>`}

            <div style="display:flex;gap:20px;margin-bottom:14px;">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" id="mp-gst" ${p?.gst_applicable?'checked':''} /> GST applicable
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" id="mp-pst" ${p?.pst_applicable?'checked':''} /> PST applicable
              </label>
            </div>

            <hr style="margin:0 0 14px;" />
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
              <div class="form-group">
                <label>Qty on Hand</label>
                <input type="number" id="mp-qty" step="1" min="0"
                  value="${p?.qty_on_hand??''}" placeholder="e.g. 48" />
              </div>
              <div class="form-group">
                <label>Reorder Threshold</label>
                <input type="number" id="mp-threshold" step="1" min="0"
                  value="${p?.qty_threshold??''}" placeholder="e.g. 10" />
                <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">Alert when on-hand ≤ this</div>
              </div>
              <div class="form-group">
                <label>Location</label>
                <input type="text" id="mp-location"
                  value="${p?.location||''}" placeholder="e.g. Aisle 3B" />
              </div>
            </div>

            <div class="form-group">
              <label>Internal Notes</label>
              <textarea id="mp-notes" rows="2" style="resize:vertical;"
                placeholder="Supplier info, storage instructions…">${p?.notes||''}</textarea>
            </div>

            <!-- Schedule / Controlled flag -->
            <div class="form-group" style="background:var(--surface2);border-radius:var(--radius);padding:12px 14px;">
              <label style="font-weight:700;display:block;margin-bottom:8px;">
                Schedule / Dispensing Category
              </label>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                ${[
                  ['none',     'None (Regular)',                     '',        'Regular OTC product'],
                  ['btc',      '🟡 BTC — Schedule II',               '#856404', 'Patient name optional'],
                  ['btc_ctrl', '🟠 Controlled BTC',                  '#a04000', 'Patient name required'],
                ].map(([val, label, color, hint]) => `
                  <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;
                                font-size:13px;margin-bottom:6px;">
                    <input type="radio" name="mp-schedule" value="${val}"
                      ${(p?.schedule_flag||'none')===val?'checked':''} style="margin-top:2px;" />
                    <span>
                      <span style="${color?`color:${color};font-weight:600;`:''}">${label}</span>
                      <span style="color:var(--text-muted);font-size:11px;margin-left:6px;">${hint}</span>
                    </span>
                  </label>`).join('')}
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">
                BTC = sold without Rx, pharmacist counsels patient.
                Controlled BTC = same but patient name is mandatory for every sale.
              </div>
            </div>

            <div id="mp-err" class="alert alert-danger" style="display:none;"></div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <button class="btn btn-outline" id="mp-cancel">Cancel</button>
            <button class="btn btn-primary" id="mp-save">Save</button>
          </div>
        </div>`;

      document.body.appendChild(modal);
      const close = () => modal.remove();
      modal.querySelector('.modal-close').addEventListener('click', close);
      modal.querySelector('#mp-cancel').addEventListener('click', close);

      modal.querySelector('#mp-save').addEventListener('click', () => {
        const errEl    = modal.querySelector('#mp-err');
        const priceVal = modal.querySelector('#mp-price').value;
        const price    = priceVal !== '' ? parseFloat(priceVal) : null;
        const qty      = modal.querySelector('#mp-qty').value !== '' ? parseFloat(modal.querySelector('#mp-qty').value) : null;
        const threshold= modal.querySelector('#mp-threshold').value !== '' ? parseFloat(modal.querySelector('#mp-threshold').value) : null;
        const gst      = modal.querySelector('#mp-gst').checked;
        const pst      = modal.querySelector('#mp-pst').checked;
        const location     = modal.querySelector('#mp-location').value.trim();
        const notes        = modal.querySelector('#mp-notes').value.trim();
        const scheduleFlag = modal.querySelector('input[name="mp-schedule"]:checked')?.value || 'none';
        const scheduleSave = scheduleFlag === 'none' ? null : scheduleFlag;

        if (isCatalog) {
          const desc = modal.querySelector('#mp-desc').value.trim();
          const upc  = modal.querySelector('#mp-upc').value.trim();
          DB.updateCatalogProduct(p.product_id, {
            description: desc || p.description, upc_unit: upc || null,
            price_override: price, gst_applicable: gst, pst_applicable: pst,
            qty_on_hand: qty, qty_threshold: threshold, location, notes,
            schedule_flag: scheduleSave,
          });
        } else {
          const desc = modal.querySelector('#mp-desc').value.trim();
          const upc  = modal.querySelector('#mp-upc').value.trim();
          if (!desc) { errEl.style.display='block'; errEl.textContent='Description is required.'; return; }
          if (p) {
            DB.updateCustomProduct(p.custom_product_id, {
              description: desc, upc, price: price ?? 0, gst_applicable: gst, pst_applicable: pst,
              qty_on_hand: qty, qty_threshold: threshold, location, notes,
              schedule_flag: scheduleSave,
            });
          } else {
            DB.saveCustomProduct({ description: desc, upc, price: price ?? 0, gst_applicable: gst,
              pst_applicable: pst, created_by: Auth.current()?.name, schedule_flag: scheduleSave });
          }
        }
        close();
        renderList(content.querySelector('#prod-search').value, content.querySelector('#prod-filter').value);
      });

      modal.querySelector(isCatalog ? '#mp-qty' : '#mp-desc').focus();
    };

    const exportCSV = () => {
      const customs = DB.getAllCustomProducts();
      const rows = [
        ['Source','Description','UPC','Price','Price Override','GST','PST','Qty on Hand','Reorder Threshold','Location','Notes'],
        ...customs.map(p => ['Custom', p.description, p.upc||'', p.price, '', p.gst_applicable?'Y':'N', p.pst_applicable?'Y':'N', p.qty_on_hand??'', p.qty_threshold??'', p.location||'', p.notes||'']),
      ];
      const csv = rows.map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
      _downloadBlob(new Blob([csv], { type: 'text/csv' }), `products_export_${_dateStr()}.csv`);
    };

    const lowCount = DB.getLowStockProducts().length;

    content.innerHTML = `
      <div class="settings-section">
        <h3>Products</h3>
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap;">
          <input type="text" id="prod-search" placeholder="Search products or catalog…" style="flex:1;min-width:200px;" />
          <select id="prod-filter" style="width:160px;">
            <option value="all">All products</option>
            <option value="low">Low / Out of stock ${lowCount>0?`(${lowCount})`:''}
            </option>
          </select>
          <button class="btn btn-primary btn-sm" id="btn-add-product">+ Add Custom</button>
          <button class="btn btn-outline btn-sm" id="btn-export-products">&#8659; Export CSV</button>
        </div>

        ${lowCount > 0 ? `
          <div class="alert alert-warning" style="font-size:13px;margin-bottom:14px;">
            &#9888; <strong>${lowCount} product${lowCount!==1?'s':''}</strong> at or below reorder threshold.
            <a href="#" id="btn-show-low" style="margin-left:8px;">View low stock</a>
          </div>` : ''}

        <h4 style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">Custom Products</h4>
        <div style="overflow-x:auto;margin-bottom:20px;">
          <table class="table" style="font-size:13px;">
            <thead><tr>
              <th>Description</th><th>UPC</th><th>Price</th>
              <th style="text-align:center;">GST</th><th style="text-align:center;">PST</th>
              <th style="text-align:center;">On Hand</th><th style="text-align:center;">Threshold</th>
              <th>Location</th><th></th>
            </tr></thead>
            <tbody id="custom-list"></tbody>
          </table>
        </div>

        <h4 style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">
          McKesson Catalog (${DB.getProductCount().toLocaleString()} items — search to browse &amp; edit)
        </h4>
        <div style="overflow-x:auto;">
          <table class="table" style="font-size:13px;">
            <thead><tr>
              <th>Description</th><th>UPC</th><th>Price</th>
              <th style="text-align:center;">GST</th><th style="text-align:center;">PST</th>
              <th style="text-align:center;">On Hand</th><th style="text-align:center;">Threshold</th>
              <th>Location</th><th></th>
            </tr></thead>
            <tbody id="catalog-list"></tbody>
          </table>
        </div>
      </div>`;

    content.querySelector('#prod-search').addEventListener('input', e =>
      renderList(e.target.value, content.querySelector('#prod-filter').value));
    content.querySelector('#prod-filter').addEventListener('change', e =>
      renderList(content.querySelector('#prod-search').value, e.target.value));
    content.querySelector('#btn-add-product').addEventListener('click', () => showProductModal(null));
    content.querySelector('#btn-export-products').addEventListener('click', exportCSV);
    content.querySelector('#btn-show-low')?.addEventListener('click', e => {
      e.preventDefault();
      content.querySelector('#prod-filter').value = 'low';
      renderList('', 'low');
    });
    renderList('');
  }

  _renderStaff(content) {
    const allStaff = DB.getAllStaff();
    content.innerHTML = `
      <div class="settings-section">
        <h3>Staff Management</h3>
        <div style="overflow-x:auto;">
          <table class="table" style="font-size:13px;">
            <thead>
              <tr>
                <th>Name</th>
                <th>Emp ID</th>
                <th>Role</th>
                <th>Email</th>
                <th>Status</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${allStaff.map(s => `
                <tr>
                  <td style="font-weight:600;">${s.name}</td>
                  <td style="font-family:monospace;font-size:12px;">${s.emp_id || '—'}</td>
                  <td><span class="badge badge-${s.role==='ADMIN'?'primary':s.role==='MANAGER'?'warning':'secondary'}" style="font-size:11px;">${Auth.roleLabel(s.role)}</span></td>
                  <td style="font-size:12px;">${s.email || '—'}</td>
                  <td><span class="badge badge-${s.active?'success':'danger'}" style="font-size:11px;">${s.active?'Active':'Inactive'}</span></td>
                  <td style="text-align:right;white-space:nowrap;">
                    <button class="btn btn-sm btn-outline" data-action="edit"       data-id="${s.staff_id}" style="margin-right:4px;">&#9998; Edit</button>
                    <button class="btn btn-sm btn-outline" data-action="pin"        data-id="${s.staff_id}" style="margin-right:4px;">Change PIN</button>
                    ${s.staff_id !== Auth.current()?.staff_id
                      ? `<button class="btn btn-sm btn-${s.active?'danger':'outline'}" data-action="${s.active?'deactivate':'reactivate'}" data-id="${s.staff_id}">${s.active?'Deactivate':'Reactivate'}</button>`
                      : '<span style="font-size:11px;color:var(--text-muted);">(you)</span>'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <hr style="margin:16px 0;" />
        <h4 style="margin-bottom:12px;font-size:14px;">Add New Staff</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Full Name <span style="color:var(--danger);">*</span></label>
            <input type="text" id="new-staff-name" placeholder="Full name" />
          </div>
          <div class="form-group">
            <label>Employee ID</label>
            <input type="text" id="new-staff-empid" placeholder="e.g. EMP-001" />
          </div>
          <div class="form-group">
            <label>PIN (4-8 digits) <span style="color:var(--danger);">*</span></label>
            <input type="password" id="new-staff-pin" placeholder="PIN" maxlength="8" inputmode="numeric" />
          </div>
          <div class="form-group">
            <label>Role</label>
            <select id="new-staff-role">
              <option value="CASHIER">Cashier</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="new-staff-email" placeholder="staff@example.com" />
          </div>
        </div>
        <button class="btn btn-primary" id="btn-add-staff">Add Staff Member</button>
        <div id="staff-msg" style="margin-top:8px;font-size:13px;"></div>
      </div>`;

    content.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = allStaff.find(x => x.staff_id === parseInt(btn.dataset.id));
        if (s) this._showEditStaffModal(s);
      });
    });

    content.querySelectorAll('[data-action="deactivate"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Deactivate this staff member?')) return;
        DB.deactivateStaff(parseInt(btn.dataset.id));
        Audit.configChange(`Staff deactivated: ID ${btn.dataset.id}`);
        this._renderTab('staff');
      });
    });

    content.querySelectorAll('[data-action="reactivate"]').forEach(btn => {
      btn.addEventListener('click', () => {
        DB.reactivateStaff(parseInt(btn.dataset.id));
        Audit.configChange(`Staff reactivated: ID ${btn.dataset.id}`);
        this._renderTab('staff');
      });
    });

    content.querySelectorAll('[data-action="pin"]').forEach(btn => {
      btn.addEventListener('click', () => this._showChangePINModal(parseInt(btn.dataset.id)));
    });

    content.querySelector('#btn-add-staff').addEventListener('click', async () => {
      const name  = content.querySelector('#new-staff-name').value.trim();
      const pin   = content.querySelector('#new-staff-pin').value;
      const role  = content.querySelector('#new-staff-role').value;
      const empId = content.querySelector('#new-staff-empid').value.trim();
      const email = content.querySelector('#new-staff-email').value.trim();
      const msg   = content.querySelector('#staff-msg');
      msg.textContent = '';
      if (!name) { msg.textContent = 'Name required.'; msg.style.color='var(--danger)'; return; }
      if (!/^\d{4,8}$/.test(pin)) { msg.textContent = 'PIN must be 4-8 digits.'; msg.style.color='var(--danger)'; return; }
      const hashed = await Auth.hashPin(pin);
      const staffId = DB.createStaff(name, hashed, role);
      DB.updateStaff(staffId, { name, role, emp_id: empId||null, email: email||null });
      Audit.configChange(`Staff created: ${name} (${role})${empId?' EMP:'+empId:''}`);
      msg.textContent = `${name} added successfully.`;
      msg.style.color = 'var(--success)';
      this._renderTab('staff');
    });
  }

  _showEditStaffModal(s) {
    const sigMode  = s.signoff_mode || 'pin';
    let   sigDefaults = {};
    try { sigDefaults = JSON.parse(s.checklist_defaults || '{}') || {}; } catch(_) {}
    const eligible = (typeof Checklists !== 'undefined' && Checklists.eligibleDefaultItems)
      ? Checklists.eligibleDefaultItems() : [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:520px;max-height:92vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h3>&#9998; Edit Staff — ${s.name}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group" style="grid-column:span 2;">
              <label>Full Name <span style="color:var(--danger);">*</span></label>
              <input id="es-name" type="text" value="${s.name}" />
            </div>
            <div class="form-group">
              <label>Employee ID</label>
              <input id="es-empid" type="text" value="${s.emp_id||''}" placeholder="e.g. EMP-001" />
            </div>
            <div class="form-group">
              <label>Role</label>
              <select id="es-role">
                <option value="CASHIER" ${s.role==='CASHIER' ?'selected':''}>Cashier</option>
                <option value="MANAGER" ${s.role==='MANAGER' ?'selected':''}>Manager</option>
                <option value="ADMIN"   ${s.role==='ADMIN'   ?'selected':''}>Admin</option>
              </select>
            </div>
            <div class="form-group">
              <label>Email</label>
              <input id="es-email" type="email" value="${s.email||''}" placeholder="staff@example.com" />
            </div>
            <div class="form-group">
              <label>Designation / Title <span style="font-weight:400;color:var(--text-muted);">(for name badge)</span></label>
              <input id="es-designation" type="text" value="${s.designation||''}" placeholder="e.g. Pharmacist, Pharmacy Assistant" />
            </div>
            <div class="form-group">
              <label>License # <span style="font-weight:400;color:var(--text-muted);">(pharmacists)</span></label>
              <input id="es-license" type="text" value="${s.license_number||''}" placeholder="e.g. 12345" />
            </div>
          </div>

          <hr style="margin:14px 0;border:none;border-top:1px solid var(--border);" />
          <div style="font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.03em;color:var(--text-muted);margin-bottom:8px;">
            Pharmacist Sign-Off <span style="font-weight:400;text-transform:none;">(for SOD/EOD &amp; counselling sign-offs)</span>
          </div>

          <div class="form-group">
            <label>Saved Signature <span style="font-weight:400;color:var(--text-muted);">— draw once; stamped on sign-off documents</span></label>
            <div style="border:1px dashed var(--border);border-radius:var(--radius);background:#fff;">
              <canvas id="es-sig" style="width:100%;height:120px;display:block;touch-action:none;cursor:crosshair;"></canvas>
            </div>
            <div style="margin-top:6px;">
              <button type="button" class="btn btn-outline btn-sm" id="es-sig-clear">Clear</button>
              <span style="font-size:12px;color:var(--text-muted);margin-left:6px;">You won't redraw this each time — it's stored on the profile.</span>
            </div>
          </div>

          <div class="form-group">
            <label>Sign-off mode</label>
            <label style="display:flex;gap:8px;font-size:13px;align-items:flex-start;cursor:pointer;margin-bottom:4px;">
              <input type="radio" name="es-mode" value="tick" ${sigMode==='tick'?'checked':''} style="margin-top:2px;" />
              <span><b>Tick to attest</b> — fastest. Use when you're signed in as yourself.</span>
            </label>
            <label style="display:flex;gap:8px;font-size:13px;align-items:flex-start;cursor:pointer;">
              <input type="radio" name="es-mode" value="pin" ${sigMode!=='tick'?'checked':''} style="margin-top:2px;" />
              <span><b>Require my PIN</b> — enter your login PIN at sign-off. Use on a shared terminal.</span>
            </label>
          </div>

          <div class="form-group">
            <label>Always pre-check these routine items
              <span style="font-weight:400;color:var(--text-muted);">— regulatory items always start unchecked</span></label>
            <div style="max-height:170px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius);padding:8px;">
              ${eligible.length ? eligible.map(it => `
                <label style="display:flex;gap:8px;font-size:12px;padding:3px 0;cursor:pointer;">
                  <input type="checkbox" class="es-default" data-id="${it.id}" ${sigDefaults[it.id]?'checked':''} />
                  <span>${it.label} <span style="color:var(--text-muted);">(${it.kind==='open'?'SOD':'EOD'})</span></span>
                </label>`).join('') : '<div style="font-size:12px;color:var(--text-muted);">No eligible items.</div>'}
            </div>
          </div>

          <div id="es-error" style="display:none;" class="alert alert-danger"></div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <button class="btn btn-outline" id="es-cancel">Cancel</button>
          <button class="btn btn-success" id="es-save">Save Changes</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#es-cancel').addEventListener('click', close);
    modal.querySelector('#es-name').focus();

    // Signature pad
    const sigPad = (typeof SignaturePad !== 'undefined')
      ? SignaturePad.attach(modal.querySelector('#es-sig')) : null;
    if (sigPad && s.signature) setTimeout(() => sigPad.load(s.signature), 30);
    modal.querySelector('#es-sig-clear')?.addEventListener('click', () => sigPad && sigPad.clear());

    modal.querySelector('#es-save').addEventListener('click', () => {
      const name  = modal.querySelector('#es-name').value.trim();
      const errEl = modal.querySelector('#es-error');
      if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display='block'; return; }

      const signature = sigPad ? (sigPad.toDataURL() || null) : (s.signature || null);
      const signoff_mode = (modal.querySelector('input[name="es-mode"]:checked')?.value) || 'pin';
      const defaults = {};
      modal.querySelectorAll('.es-default:checked').forEach(c => { defaults[c.dataset.id] = true; });

      DB.updateStaff(s.staff_id, {
        name,
        role:           modal.querySelector('#es-role').value,
        emp_id:         modal.querySelector('#es-empid').value.trim() || null,
        email:          modal.querySelector('#es-email').value.trim() || null,
        designation:    modal.querySelector('#es-designation').value.trim() || null,
        license_number: modal.querySelector('#es-license').value.trim() || null,
        signature,
        signoff_mode,
        checklist_defaults: JSON.stringify(defaults),
      });
      Audit.configChange(`Staff updated: ${name} (ID ${s.staff_id})`);
      close();
      this._renderTab('staff');
    });
  }

  _showChangePINModal(staffId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:360px;">
        <div class="modal-header"><h3>Change PIN</h3><button class="modal-close">&times;</button></div>
        <div class="modal-body">
          <div class="form-group">
            <label>New PIN (4-8 digits)</label>
            <input type="password" id="new-pin" placeholder="New PIN" maxlength="8" inputmode="numeric" />
          </div>
          <div class="form-group">
            <label>Confirm PIN</label>
            <input type="password" id="new-pin2" placeholder="Repeat PIN" maxlength="8" inputmode="numeric" />
          </div>
          <div id="cp-err" class="login-error"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="cp-cancel">Cancel</button>
          <button class="btn btn-primary" id="cp-save">Update PIN</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => document.body.removeChild(modal);
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#cp-cancel').addEventListener('click', close);
    modal.querySelector('#cp-save').addEventListener('click', async () => {
      const pin  = modal.querySelector('#new-pin').value;
      const pin2 = modal.querySelector('#new-pin2').value;
      const err  = modal.querySelector('#cp-err');
      if (!/^\d{4,8}$/.test(pin)) { err.textContent = 'PIN must be 4-8 digits.'; return; }
      if (pin !== pin2)            { err.textContent = 'PINs do not match.'; return; }
      const hashed = await Auth.hashPin(pin);
      DB.updateStaffPin(staffId, hashed);
      Audit.configChange(`PIN changed for staff ID ${staffId}`);
      close();
    });
  }

  async _renderQuickActions(content) {
    const COLOR_OPTIONS = [
      { value: 'default', label: 'Grey',   bg: '#e9ecef', fg: '#212529' },
      { value: 'blue',    label: 'Blue',   bg: '#0d6efd', fg: '#fff'    },
      { value: 'green',   label: 'Green',  bg: '#198754', fg: '#fff'    },
      { value: 'orange',  label: 'Orange', bg: '#fd7e14', fg: '#fff'    },
      { value: 'red',     label: 'Red',    bg: '#dc3545', fg: '#fff'    },
    ];

    const loadActions = async () => {
      const raw = await Config.get('quick_actions_json');
      try { return raw ? JSON.parse(raw) : []; } catch(e) { return []; }
    };
    const saveActions = async acts => Config.set('quick_actions_json', JSON.stringify(acts));
    const colorStyle  = c => {
      const opt = COLOR_OPTIONS.find(o => o.value === c) || COLOR_OPTIONS[0];
      return `background:${opt.bg};color:${opt.fg};`;
    };

    const renderList = async () => {
      const actions = await loadActions();
      const tbody = content.querySelector('#qa-list');
      if (!tbody) return;

      const discountDetail = a => {
        if (a.type !== 'discount') return '—';
        const val = a.discount_type === 'percent'
          ? `${a.discount_value}%` : Tax.fmt(a.discount_value || 0);
        const scope = a.discount_applies === 'last_item' ? 'last item' : 'cart';
        return `${val} off ${scope}${!a.discount_value ? ' (ask)' : ''}`;
      };

      tbody.innerHTML = actions.length === 0
        ? '<tr><td colspan="6" class="text-muted" style="padding:12px;">No quick actions yet. Add one below.</td></tr>'
        : actions.map((a, idx) => `
            <tr>
              <td>
                <span style="display:inline-block;padding:4px 12px;border-radius:6px;font-size:12px;
                             font-weight:600;${colorStyle(a.color)}">${a.label}</span>
              </td>
              <td style="font-size:11px;">
                <span style="padding:2px 7px;border-radius:4px;font-weight:600;
                  background:${a.type==='discount'?'rgba(220,53,69,.1)':'rgba(13,110,253,.1)'};
                  color:${a.type==='discount'?'var(--danger)':'var(--primary)'};">
                  ${a.type === 'discount' ? 'Discount' : 'Product'}
                </span>
              </td>
              <td style="font-size:13px;">${a.type === 'discount' ? discountDetail(a) : (a.description || a.label)}</td>
              <td>${a.type === 'discount' ? '—' : Tax.fmt(a.price || 0)}</td>
              <td style="font-size:12px;color:var(--text-muted);">
                ${a.type === 'discount' ? '—' : [a.gst ? 'GST' : '', a.pst ? 'PST' : ''].filter(Boolean).join(' ') || '—'}
              </td>
              <td style="white-space:nowrap;">
                <button class="btn btn-sm btn-outline" data-action="edit-qa" data-idx="${idx}">Edit</button>
                <button class="btn btn-sm btn-danger"  data-action="del-qa"  data-idx="${idx}" style="margin-left:4px;">Del</button>
              </td>
            </tr>`).join('');

      tbody.querySelectorAll('[data-action="del-qa"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this quick action button?')) return;
          const acts = await loadActions();
          acts.splice(parseInt(btn.dataset.idx), 1);
          await saveActions(acts);
          renderList();
        });
      });
      tbody.querySelectorAll('[data-action="edit-qa"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const acts = await loadActions();
          showModal(acts[parseInt(btn.dataset.idx)], parseInt(btn.dataset.idx));
        });
      });
    };

    const showModal = (existing = null, editIdx = -1) => {
      const selColor   = existing?.color || 'default';
      const selType    = existing?.type  || 'product';
      const discType   = existing?.discount_type   || 'flat';
      const discApply  = existing?.discount_applies || 'cart';
      const discVal    = existing?.discount_value ?? '';

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal" style="max-width:460px;">
          <div class="modal-header">
            <h3>${existing ? 'Edit' : 'Add'} Quick Action</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">

            <!-- Type toggle -->
            <div class="form-group">
              <label>Type</label>
              <div style="display:flex;gap:8px;margin-top:6px;">
                <label style="cursor:pointer;flex:1;">
                  <input type="radio" name="qa-type" value="product" ${selType==='product'?'checked':''} style="display:none;" />
                  <span class="qa-type-opt" data-val="product"
                    style="display:block;text-align:center;padding:8px;border-radius:6px;font-size:13px;font-weight:600;
                           border:2px solid ${selType==='product'?'var(--primary)':'var(--border)'};
                           background:${selType==='product'?'rgba(13,110,253,.08)':'var(--surface2)'};
                           color:${selType==='product'?'var(--primary)':'var(--text-muted)'};transition:all .15s;">
                    Product / Service
                  </span>
                </label>
                <label style="cursor:pointer;flex:1;">
                  <input type="radio" name="qa-type" value="discount" ${selType==='discount'?'checked':''} style="display:none;" />
                  <span class="qa-type-opt" data-val="discount"
                    style="display:block;text-align:center;padding:8px;border-radius:6px;font-size:13px;font-weight:600;
                           border:2px solid ${selType==='discount'?'var(--danger)':'var(--border)'};
                           background:${selType==='discount'?'rgba(220,53,69,.08)':'var(--surface2)'};
                           color:${selType==='discount'?'var(--danger)':'var(--text-muted)'};transition:all .15s;">
                    Discount
                  </span>
                </label>
              </div>
            </div>

            <!-- Button label (always shown) -->
            <div class="form-group">
              <label>Button Label <span style="font-weight:400;color:var(--text-muted);">(max 18 chars)</span></label>
              <input type="text" id="qa-label" value="${existing?.label || ''}"
                     placeholder="e.g. Senior 10%" maxlength="18" />
            </div>

            <!-- Product fields -->
            <div id="qa-product-fields">
              <div class="form-group">
                <label>Description <span style="font-weight:400;color:var(--text-muted);">(shown on receipt)</span></label>
                <input type="text" id="qa-desc" value="${existing?.description || ''}"
                       placeholder="e.g. Vitamin C 500mg 100 ct" />
              </div>
              <div class="form-group">
                <label>Price <span style="font-weight:400;color:var(--text-muted);">(leave 0 to ask at time of sale)</span></label>
                <input type="number" id="qa-price" value="${existing?.price ?? ''}"
                       step="0.01" min="0" placeholder="0.00" style="max-width:160px;" />
              </div>
              <div style="display:flex;gap:20px;margin-bottom:14px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" id="qa-gst" ${existing?.gst ? 'checked' : ''} /> GST applicable
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" id="qa-pst" ${existing?.pst ? 'checked' : ''} /> PST applicable
                </label>
              </div>
            </div>

            <!-- Discount fields -->
            <div id="qa-discount-fields" style="display:none;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
                <div class="form-group" style="margin:0;">
                  <label>Discount Type</label>
                  <select id="qa-disc-type" style="margin-top:6px;">
                    <option value="flat"    ${discType==='flat'   ?'selected':''}>Flat Amount ($)</option>
                    <option value="percent" ${discType==='percent'?'selected':''}>Percentage (%)</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0;">
                  <label>Apply To</label>
                  <select id="qa-disc-applies" style="margin-top:6px;">
                    <option value="cart"      ${discApply==='cart'     ?'selected':''}>Whole cart</option>
                    <option value="last_item" ${discApply==='last_item'?'selected':''}>Last item added</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label id="qa-disc-val-label">Amount ($) <span style="font-weight:400;color:var(--text-muted);">(leave 0 to ask at time of sale)</span></label>
                <input type="number" id="qa-disc-value" step="0.01" min="0"
                       value="${discVal}" placeholder="0" style="max-width:160px;" />
              </div>
              <div style="background:rgba(220,53,69,.06);border:1px solid rgba(220,53,69,.2);
                          border-radius:6px;padding:10px 12px;font-size:12px;color:var(--text-muted);">
                Discounts are added as negative line items on the cart. They do not affect tax calculations.
              </div>
            </div>

            <!-- Color picker (always shown) -->
            <hr style="margin:14px 0;" />
            <div class="form-group">
              <label>Button Color</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
                ${COLOR_OPTIONS.map(opt => `
                  <label style="cursor:pointer;" title="${opt.label}">
                    <input type="radio" name="qa-color" value="${opt.value}"
                           ${selColor === opt.value ? 'checked' : ''} style="display:none;" />
                    <span class="qa-color-swatch"
                          style="display:inline-block;padding:7px 16px;border-radius:6px;font-size:13px;
                                 font-weight:600;background:${opt.bg};color:${opt.fg};
                                 border:3px solid ${selColor === opt.value ? '#0d6efd' : 'transparent'};
                                 transition:border-color .15s;">
                      ${opt.label}
                    </span>
                  </label>`).join('')}
              </div>
            </div>
            <div id="qa-preview" style="margin-top:4px;">
              <label style="font-size:12px;color:var(--text-muted);">Preview</label>
              <div style="margin-top:4px;">
                <span id="qa-preview-btn" style="display:inline-block;padding:8px 18px;border-radius:6px;
                      font-size:13px;font-weight:600;${colorStyle(selColor)}">
                  ${existing?.label || 'Button'}
                </span>
              </div>
            </div>
            <div id="qa-err" class="alert alert-danger" style="display:none;margin-top:10px;"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="qa-cancel">Cancel</button>
            <button class="btn btn-primary" id="qa-save">Save Button</button>
          </div>
        </div>`;
      document.body.appendChild(modal);

      // Show/hide product vs discount fields
      const applyTypeUI = (type) => {
        modal.querySelector('#qa-product-fields').style.display  = type === 'product'  ? '' : 'none';
        modal.querySelector('#qa-discount-fields').style.display = type === 'discount' ? '' : 'none';
        modal.querySelectorAll('.qa-type-opt').forEach(span => {
          const isActive = span.dataset.val === type;
          const isDisc   = span.dataset.val === 'discount';
          span.style.borderColor  = isActive ? (isDisc ? 'var(--danger)' : 'var(--primary)') : 'var(--border)';
          span.style.background   = isActive ? (isDisc ? 'rgba(220,53,69,.08)' : 'rgba(13,110,253,.08)') : 'var(--surface2)';
          span.style.color        = isActive ? (isDisc ? 'var(--danger)' : 'var(--primary)') : 'var(--text-muted)';
        });
        modal.querySelector('#qa-label').placeholder = type === 'discount' ? 'e.g. Senior 10%' : 'e.g. Vitamin C';
      };
      applyTypeUI(selType);
      modal.querySelectorAll('[name="qa-type"]').forEach(r =>
        r.addEventListener('change', () => applyTypeUI(r.value)));

      // Update discount value label when type changes
      const discTypeEl = modal.querySelector('#qa-disc-type');
      const discValLbl = modal.querySelector('#qa-disc-val-label');
      discTypeEl.addEventListener('change', () => {
        discValLbl.childNodes[0].textContent =
          discTypeEl.value === 'percent' ? 'Percentage (%) ' : 'Amount ($) ';
      });

      // Live preview
      const preview = modal.querySelector('#qa-preview-btn');
      const updatePreview = () => {
        const color = modal.querySelector('[name="qa-color"]:checked')?.value || 'default';
        const label = modal.querySelector('#qa-label').value.trim() || 'Button';
        const opt   = COLOR_OPTIONS.find(o => o.value === color) || COLOR_OPTIONS[0];
        preview.style.cssText = `display:inline-block;padding:8px 18px;border-radius:6px;
          font-size:13px;font-weight:600;background:${opt.bg};color:${opt.fg};`;
        preview.textContent = label;
        modal.querySelectorAll('[name="qa-color"]').forEach(r => {
          const sw = r.parentElement.querySelector('.qa-color-swatch');
          sw.style.borderColor = r.checked ? '#0d6efd' : 'transparent';
        });
      };
      modal.querySelectorAll('[name="qa-color"]').forEach(r => r.addEventListener('change', updatePreview));
      modal.querySelector('#qa-label').addEventListener('input', updatePreview);

      const close = () => modal.remove();
      modal.querySelector('.modal-close').addEventListener('click', close);
      modal.querySelector('#qa-cancel').addEventListener('click', close);
      modal.querySelector('#qa-save').addEventListener('click', async () => {
        const label  = modal.querySelector('#qa-label').value.trim();
        const color  = modal.querySelector('[name="qa-color"]:checked')?.value || 'default';
        const type   = modal.querySelector('[name="qa-type"]:checked')?.value || 'product';
        const errEl  = modal.querySelector('#qa-err');
        if (!label) { errEl.style.display = 'block'; errEl.textContent = 'Button label is required.'; return; }

        let entry;
        if (type === 'discount') {
          const disc_type   = modal.querySelector('#qa-disc-type').value;
          const disc_applies= modal.querySelector('#qa-disc-applies').value;
          const disc_value  = parseFloat(modal.querySelector('#qa-disc-value').value) || 0;
          entry = { id: existing?.id || `qa_${Date.now()}`, label, color, type: 'discount',
                    discount_type: disc_type, discount_applies: disc_applies, discount_value: disc_value };
        } else {
          const desc  = modal.querySelector('#qa-desc').value.trim();
          const price = parseFloat(modal.querySelector('#qa-price').value) || 0;
          const gst   = modal.querySelector('#qa-gst').checked;
          const pst   = modal.querySelector('#qa-pst').checked;
          entry = { id: existing?.id || `qa_${Date.now()}`, label, description: desc || label,
                    price, gst, pst, color, type: 'product' };
        }

        const acts = await loadActions();
        if (editIdx >= 0) acts[editIdx] = entry;
        else acts.push(entry);
        await saveActions(acts);
        close();
        renderList();
      });
      modal.querySelector('#qa-label').focus();
    };

    content.innerHTML = `
      <div class="settings-section">
        <h3>Quick Action Buttons</h3>
        <div class="alert alert-info" style="font-size:13px;">
          These buttons appear on the POS screen under Quick Actions — one tap adds the item to cart instantly.
          Great for consultation fees, bag charges, or any frequently sold product.
        </div>
        <div style="margin-bottom:14px;">
          <button class="btn btn-primary btn-sm" id="btn-add-qa">+ Add Quick Action</button>
        </div>
        <div style="overflow-x:auto;">
          <table class="table" style="font-size:13px;">
            <thead>
              <tr><th>Button</th><th>Type</th><th>Description / Discount</th><th>Price</th><th>Tax</th><th></th></tr>
            </thead>
            <tbody id="qa-list"></tbody>
          </table>
        </div>
      </div>`;

    content.querySelector('#btn-add-qa').addEventListener('click', () => showModal());
    renderList();
  }

  _renderCatalog(content) {
    const count    = DB.getProductCount();
    const lastSync = DB.getLastSyncTime();
    content.innerHTML = `
      <div class="settings-section">
        <h3>McKesson Catalog Sync</h3>
        <div class="alert alert-info">
          Products in database: <strong>${count}</strong>
          ${lastSync ? `&bull; Last synced: ${new Date(lastSync).toLocaleString('en-CA')}` : ''}
        </div>
        <div class="alert alert-warning">
          <strong>CORS Note:</strong> SOAP calls to McKesson may be blocked by browser CORS policy.
          If sync fails, use the file upload option below, or configure a CORS proxy in API Credentials.
        </div>
        <div style="background:var(--surface2);padding:14px;border-radius:var(--radius);margin-bottom:14px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Sync Options</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="sync-new-items" checked /> Import new items
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="sync-prices" checked /> Update prices
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="sync-descriptions" checked /> Update descriptions
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="sync-tax-flags" checked /> Update GST/PST flags
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="sync-skip-disco" /> Skip discontinued items
            </label>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <button class="btn btn-primary" id="btn-sync-now">Sync via SOAP API</button>
        </div>
        <div class="sync-status" id="sync-log">Idle</div>
        <hr style="margin:16px 0;" />
        <h4 style="margin-bottom:10px;font-size:14px;">Manual Catalog Upload</h4>
        <p class="text-muted" style="font-size:13px;margin-bottom:10px;">
          If SOAP sync is unavailable, manually download the WEBCAT file from McKesson and upload it here.
        </p>
        <div class="form-group">
          <label>WEBCAT flat file</label>
          <input type="file" id="catalog-file" accept=".txt,.dat,.zip" />
        </div>
        <button class="btn btn-outline" id="btn-import-file">Import from File</button>
      </div>`;

    const log = content.querySelector('#sync-log');
    const appendLog = msg => { log.textContent += '\n' + msg; log.scrollTop = log.scrollHeight; };

    content.querySelector('#btn-sync-now').addEventListener('click', async () => {
      log.textContent = '';
      content.querySelector('#btn-sync-now').disabled = true;
      const opts = {
        newItems:     content.querySelector('#sync-new-items').checked,
        prices:       content.querySelector('#sync-prices').checked,
        descriptions: content.querySelector('#sync-descriptions').checked,
        taxFlags:     content.querySelector('#sync-tax-flags').checked,
        skipDisco:    content.querySelector('#sync-skip-disco').checked,
      };
      appendLog(`Sync options: ${Object.entries(opts).filter(([,v])=>v).map(([k])=>k).join(', ')}`);
      try {
        await McKessonAPI.runCatalogSync(appendLog, opts);
        Audit.configChange('McKesson catalog sync completed');
      } catch(e) {
        appendLog('ERROR: ' + e.message);
      }
      content.querySelector('#btn-sync-now').disabled = false;
    });

    content.querySelector('#btn-import-file').addEventListener('click', async () => {
      const file = content.querySelector('#catalog-file').files[0];
      if (!file) { alert('Select a file first.'); return; }
      log.textContent = '';
      const isZip = file.name.endsWith('.zip');
      let text;
      if (isZip) {
        appendLog('ZIP files: extract the flat file manually and upload the .txt/.dat file.');
        return;
      } else {
        text = await file.text();
      }
      try {
        await McKessonAPI.importFromFile(text, appendLog);
        Audit.configChange(`Catalog imported from file: ${file.name}`);
      } catch(e) {
        appendLog('ERROR: ' + e.message);
      }
    });
  }

  async _renderBarcode(content) {
    const profiles     = BarcodeParser.getProfileNames();
    const activeProfile = await Config.get('barcode_profile') || 'ProPharm Old';
    content.innerHTML = `
      <div class="settings-section">
        <h3>Barcode Parser Profiles</h3>
        <p class="text-muted" style="margin-bottom:12px;font-size:13px;">
          Select the label format that matches your prescription bag barcodes.
          Scan a test barcode below to verify parsing.
        </p>
        <div class="form-group">
          <label>Active Profile</label>
          <select id="barcode-profile">
            ${profiles.map(p => `<option value="${p}"${p===activeProfile?' selected':''}>${p}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" id="btn-save-profile">Save Profile</button>
        <hr style="margin:16px 0;" />
        <h4 style="margin-bottom:10px;font-size:14px;">Test Barcode</h4>
        <div class="input-group">
          <input type="text" id="test-barcode" placeholder="Scan or type a barcode" />
          <button class="btn btn-outline" id="btn-test">Parse</button>
        </div>
        <div id="test-result" style="margin-top:10px;font-size:13px;font-family:monospace;padding:10px;background:var(--surface2);border-radius:var(--radius);display:none;"></div>
        <div id="profile-msg" style="margin-top:8px;font-size:13px;"></div>
      </div>`;

    content.querySelector('#btn-save-profile').addEventListener('click', async () => {
      const profile = content.querySelector('#barcode-profile').value;
      await Config.set('barcode_profile', profile);
      Audit.configChange(`Barcode profile changed to: ${profile}`);
      const msg = content.querySelector('#profile-msg');
      msg.textContent = 'Profile saved.';
      msg.style.color = 'var(--success)';
      setTimeout(() => { msg.textContent = ''; }, 2000);
    });

    content.querySelector('#btn-test').addEventListener('click', async () => {
      const raw     = content.querySelector('#test-barcode').value;
      const profile = content.querySelector('#barcode-profile').value;
      const result  = await BarcodeParser.parse(raw, profile);
      const el      = content.querySelector('#test-result');
      el.style.display = 'block';
      el.textContent = result
        ? `Parsed OK:\n  Rx Number: ${result.rxNumber}\n  Branch Code: ${result.branchCode}`
        : 'Could not parse this barcode with the selected profile.';
    });
  }

  async _renderBtcFolder(content) {
    const saved = await Config.get('btc_records_folder') || '';
    content.innerHTML = `
      <div class="settings-section">
        <h3>BTC / Schedule II Records Folder</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">
          After each BTC (Behind the Counter) sale, a PDF record is automatically saved to this folder.
          Use it for your internal records and NAPRA audits. Patient name is optional and for your records only.
        </p>

        <div class="form-group" style="max-width:540px;">
          <label>Records Folder Path</label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="btc-folder-path" value="${saved}"
                   placeholder="e.g. C:\\Pharmacy Records\\BTC"
                   style="font-family:monospace;font-size:13px;flex:1;" />
            <button class="btn btn-outline" data-browse="#btc-folder-path" style="white-space:nowrap;">📁 Browse</button>
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
            The folder must already exist. Monthly subfolders are created automatically.
            Leave blank to disable auto-save.
          </div>
        </div>

        <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;
                    max-width:540px;margin-bottom:20px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px;">📁 File naming format</div>
          <code style="font-size:12px;color:var(--text-muted);">
            2026-06-14-14-30-22_DrugName_PharmacistRPh.pdf
          </code>
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">
            Each PDF contains: date/time, drug name, DIN, quantity, price, pharmacist, counselling confirmation, patient name/phone (if entered).
          </div>
        </div>

        <button class="btn btn-primary" id="btn-save-btc-folder">Save Folder Path</button>
        <div id="btc-folder-status" style="margin-top:8px;font-size:13px;"></div>

        <hr style="margin:24px 0;" />

        <h3>Shift Sign-Off Records (Opening / EOD)</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">
          Start-of-Day and End-of-Day checklists are saved as PDFs here and emailed to the
          recipients below. Leave blank to disable.
        </p>
        <div class="form-group" style="max-width:540px;">
          <label>Shift Records Folder Path</label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="shift-folder-path" value="${(await Config.get('shift_records_folder'))||''}"
                   placeholder="e.g. C:\\Pharmacy Records\\Shift" style="font-family:monospace;font-size:13px;flex:1;" />
            <button class="btn btn-outline" data-browse="#shift-folder-path" style="white-space:nowrap;">📁 Browse</button>
          </div>
        </div>
        <div class="form-group" style="max-width:540px;">
          <label>Email Recipients <span style="font-weight:400;color:var(--text-muted);">(comma-separated; blank = use Sales recipients)</span></label>
          <input type="text" id="shift-recipients" value="${(await Config.get('shift_records_recipients'))||''}"
                 placeholder="owner@pharmacy.ca, rph@pharmacy.ca" />
        </div>
        <button class="btn btn-primary" id="btn-save-shift-records">Save Shift Records Settings</button>
        <div id="shift-records-status" style="margin-top:8px;font-size:13px;"></div>
      </div>`;

    content.querySelector('#btn-save-btc-folder').addEventListener('click', async () => {
      const path   = content.querySelector('#btc-folder-path').value.trim();
      const status = content.querySelector('#btc-folder-status');
      await Config.set('btc_records_folder', path);
      status.textContent  = path ? `✓ Saved — PDFs will be saved to: ${path}` : '✓ Saved — auto-save disabled.';
      status.style.color  = 'var(--success)';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });

    content.querySelector('#btn-save-shift-records').addEventListener('click', async () => {
      const status = content.querySelector('#shift-records-status');
      await Config.setMany({
        shift_records_folder:     content.querySelector('#shift-folder-path').value.trim(),
        shift_records_recipients: content.querySelector('#shift-recipients').value.trim(),
      });
      status.textContent = '✓ Shift records settings saved.';
      status.style.color = 'var(--success)';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });
  }

  async _renderPrinter(content) {
    content.innerHTML = `
      <h2>Receipt Printer</h2>
      <hr />
      <div id="printer-status-banner" class="alert" style="display:none;margin-bottom:12px;"></div>
      <div id="printer-body">
        <span class="spinner"></span> Loading printers…
      </div>`;

    // Only available in the desktop app
    if (!window.electronAPI?.getPrinters) {
      content.querySelector('#printer-body').innerHTML = `
        <div class="alert alert-info">
          Printer selection is only available in the <strong>Pharmacy POS desktop app</strong>.<br>
          In the browser, receipts print via your browser's print dialog.
        </div>`;
      return;
    }

    let printers = [];
    try {
      printers = await window.electronAPI.getPrinters();
    } catch (e) {
      content.querySelector('#printer-body').innerHTML =
        `<div class="alert alert-danger">Could not load printer list: ${e.message}</div>`;
      return;
    }

    const saved = await Config.get('receipt_printer') || '';

    // Sort: default printer first, then alphabetical
    printers.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name));

    const options = [`<option value="">— None (show print dialog each time) —</option>`];
    for (const p of printers) {
      const label = p.name + (p.isDefault ? ' ✓ (Default)' : '');
      options.push(`<option value="${p.name}" ${p.name === saved ? 'selected' : ''}>${label}</option>`);
    }

    content.querySelector('#printer-body').innerHTML = `
      <p class="text-muted" style="font-size:13px;margin-bottom:16px;">
        Choose the printer used for receipts. When a printer is selected,
        receipts print immediately with no dialog.
      </p>
      <div class="form-group" style="max-width:420px;">
        <label>Receipt Printer</label>
        <select id="sel-printer"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);
                       border-radius:var(--radius);background:var(--surface2);
                       color:var(--text);font-size:13px;">
          ${options.join('')}
        </select>
        <div class="text-muted" style="font-size:12px;margin-top:6px;">
          ${printers.length === 0
            ? '⚠ No printers found. Install a printer driver in Windows first.'
            : `${printers.length} printer${printers.length !== 1 ? 's' : ''} found.`}
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
        <button class="btn btn-primary" id="btn-save-printer">Save Printer</button>
        <button class="btn btn-outline" id="btn-test-print"
                style="${!saved ? 'display:none;' : ''}">&#128438; Test Print</button>
      </div>`;

    const banner = content.querySelector('#printer-status-banner');
    const showMsg = (msg, type = 'success') => {
      banner.className = `alert alert-${type}`;
      banner.textContent = msg;
      banner.style.display = 'block';
      setTimeout(() => { banner.style.display = 'none'; }, 4000);
    };

    content.querySelector('#btn-save-printer').addEventListener('click', async () => {
      const name = content.querySelector('#sel-printer').value;
      await Config.set('receipt_printer', name || '');
      const testBtn = content.querySelector('#btn-test-print');
      testBtn.style.display = name ? '' : 'none';
      showMsg(name ? `Receipt printer set to: ${name}` : 'No printer selected — print dialog will be shown.', 'success');
    });

    content.querySelector('#btn-test-print')?.addEventListener('click', async () => {
      const name = content.querySelector('#sel-printer').value;
      if (!name) { showMsg('Select a printer first.', 'warning'); return; }
      const testHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>
          body{margin:0;padding:12px;font-family:'Courier New',monospace;font-size:13px;color:#000;background:#fff;}
          .center{text-align:center;}hr{border-top:1px dashed #000;margin:8px 0;}
        </style></head><body>
        <div class="center"><strong>PHARMACY POS</strong></div>
        <div class="center" style="font-size:11px;">Receipt Printer Test</div>
        <hr />
        <div>Printer: ${name}</div>
        <div>Time: ${new Date().toLocaleString()}</div>
        <hr />
        <div class="center" style="margin-top:8px;">✓ Printer is working correctly</div>
        </body></html>`;
      const result = await window.electronAPI.printReceiptHtml(testHtml, name);
      if (result?.ok) {
        showMsg('Test page sent to printer.', 'success');
      } else {
        showMsg(`Print failed: ${result?.reason || 'unknown error'}`, 'danger');
      }
    });
  }

  async _renderEmailReports(content) {
    const cfg = await Config.getAll();
    const svc = cfg.email_service || 'mailto';

    content.innerHTML = `
      <div class="settings-section">
        <h3>Email Reports</h3>

        <!-- ── Service selector ── -->
        <div style="background:var(--surface2);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;">
          <h4 style="margin:0 0 14px;font-size:14px;">Email Method</h4>
          <div class="form-group" style="margin-bottom:0;">
            <select id="er-service">
              <option value="mailto"   ${svc==='mailto'  ?'selected':''}>mailto: — open system mail client (no setup)</option>
              <option value="smtp"     ${svc==='smtp'    ?'selected':''}>SMTP — use your own mail server</option>
              <option value="resend"   ${svc==='resend'  ?'selected':''}>Resend API (free 3,000/month)</option>
              <option value="sendgrid" ${svc==='sendgrid'?'selected':''}>SendGrid API (free 100/day)</option>
              <option value="brevo"    ${svc==='brevo'   ?'selected':''}>Brevo / Sendinblue API (free 300/day)</option>
            </select>
          </div>
        </div>

        <!-- ── SMTP settings ── -->
        <div id="er-smtp-section" style="background:var(--surface2);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;${svc!=='smtp'?'display:none;':''}">
          <h4 style="margin:0 0 14px;font-size:14px;">SMTP Server</h4>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
            <div class="form-group">
              <label>SMTP Host <span style="color:var(--danger);">*</span></label>
              <input type="text" id="er-smtp-host" value="${cfg.smtp_host||''}"
                placeholder="smtp.gmail.com / mail.yourpharmacy.ca" />
            </div>
            <div class="form-group">
              <label>Port</label>
              <input type="number" id="er-smtp-port" value="${cfg.smtp_port||'587'}" placeholder="587" style="width:100%;" />
            </div>
          </div>
          <div class="form-group">
            <label>Encryption</label>
            <select id="er-smtp-enc">
              <option value="starttls" ${(cfg.smtp_encryption||'starttls')==='starttls'?'selected':''}>STARTTLS (port 587 — recommended)</option>
              <option value="ssl"      ${cfg.smtp_encryption==='ssl'     ?'selected':''}>SSL / TLS (port 465)</option>
              <option value="none"     ${cfg.smtp_encryption==='none'    ?'selected':''}>None (port 25 — not recommended)</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label>Username / Email <span style="color:var(--danger);">*</span></label>
              <input type="text" id="er-smtp-user" value="${cfg.smtp_username||''}"
                placeholder="reports@yourpharmacy.ca" autocomplete="username" />
            </div>
            <div class="form-group">
              <label>Password <span style="color:var(--danger);">*</span></label>
              <input type="password" id="er-smtp-pass" value="${cfg.smtp_password||''}"
                placeholder="SMTP password or app password" autocomplete="new-password" />
              <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">
                For Gmail use an App Password (requires 2FA). For Office 365 use your email password.
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label>From Email</label>
              <input type="email" id="er-smtp-from-email" value="${cfg.email_from_address||cfg.smtp_username||''}"
                placeholder="Same as username, or alias" />
              <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">Leave blank to use username.</div>
            </div>
            <div class="form-group">
              <label>Reply-To</label>
              <input type="email" id="er-smtp-reply-to" value="${cfg.email_reply_to||''}"
                placeholder="owner@yourpharmacy.ca (optional)" />
            </div>
          </div>
          <div class="alert alert-info" style="font-size:12px;margin-bottom:0;">
            <strong>Common SMTP settings:</strong><br>
            Gmail: host <code>smtp.gmail.com</code> port <code>587</code> STARTTLS — use an App Password<br>
            Office 365: host <code>smtp.office365.com</code> port <code>587</code> STARTTLS<br>
            Your own server: ask your IT / hosting provider for SMTP credentials
          </div>
        </div>

        <!-- ── API-based service settings ── -->
        <div id="er-api-section" style="background:var(--surface2);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;${svc==='mailto'||svc==='smtp'?'display:none;':''}">
          <h4 style="margin:0 0 14px;font-size:14px;">API Settings</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group" style="grid-column:span 2;">
              <label>API Key <span style="color:var(--danger);">*</span></label>
              <input type="password" id="er-apikey" value="${cfg.email_api_key||''}"
                placeholder="Paste your API key here" autocomplete="new-password" />
              <div id="er-apikey-hint" style="font-size:11px;color:var(--text-muted);margin-top:3px;"></div>
            </div>
            <div class="form-group">
              <label>From Email <span style="color:var(--danger);">*</span></label>
              <input type="email" id="er-from-email" value="${cfg.email_from_address||''}"
                placeholder="reports@yourpharmacy.ca" />
              <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">Must be verified with your provider.</div>
            </div>
            <div class="form-group">
              <label>Reply-To</label>
              <input type="email" id="er-reply-to" value="${cfg.email_reply_to||''}"
                placeholder="owner@yourpharmacy.ca (optional)" />
            </div>
          </div>
          <div id="er-guide"></div>
        </div>

        <!-- ── Common sender name ── -->
        <div style="background:var(--surface2);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;">
          <h4 style="margin:0 0 14px;font-size:14px;">Sender &amp; Recipients</h4>
          <div class="form-group">
            <label>Sender Name</label>
            <input type="text" id="er-sender" value="${cfg.email_sender_name||cfg.pharmacy_name||''}"
              placeholder="Pharmacy Name" style="max-width:300px;" />
          </div>
          <hr style="margin:12px 0;" />
          <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px;">
            Comma-separated recipients per report type.
          </p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label>Sales, Tax &amp; Method Reports</label>
              <input type="text" id="er-sales" value="${cfg.email_recipients_sales||''}"
                placeholder="accountant@example.com, owner@example.com" />
            </div>
            <div class="form-group">
              <label>Shift Reports</label>
              <input type="text" id="er-shifts" value="${cfg.email_recipients_shifts||''}"
                placeholder="manager@example.com" />
            </div>
            <div class="form-group">
              <label>Order Suggestions</label>
              <input type="text" id="er-orders" value="${cfg.email_recipients_orders||''}"
                placeholder="purchasing@example.com" />
            </div>
            <div class="form-group">
              <label>Products Sold</label>
              <input type="text" id="er-products" value="${cfg.email_recipients_products||''}"
                placeholder="owner@example.com" />
            </div>
          </div>
        </div>

        <!-- ── Save & Test ── -->
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-primary" id="btn-er-save">Save Settings</button>
          <input type="email" id="er-test-addr" placeholder="Test recipient email" style="width:220px;"
            value="${cfg.email_recipients_sales?.split(',')[0]?.trim()||''}" />
          <button class="btn btn-outline" id="btn-er-test">&#9993; Send Test Email</button>
        </div>
        <div id="er-msg" style="margin-top:10px;font-size:13px;min-height:20px;"></div>
      </div>`;

    const smtpSection = content.querySelector('#er-smtp-section');
    const apiSection  = content.querySelector('#er-api-section');
    const guideEl     = content.querySelector('#er-guide');
    const apiKeyHint  = content.querySelector('#er-apikey-hint');
    const msgEl       = content.querySelector('#er-msg');

    const API_HINTS = {
      resend:   'Get your key at resend.com → API Keys. Free tier: 3,000 emails/month.',
      sendgrid: 'Get your key at app.sendgrid.com → Settings → API Keys (Mail Send scope).',
      brevo:    'Get your key at app.brevo.com → Account → SMTP & API → API Keys.',
    };
    const API_GUIDES = {
      resend:   `<div class="alert alert-info" style="font-size:12px;margin:10px 0 0;">Resend: sign up → verify domain → create API key. From Email must match verified domain.</div>`,
      sendgrid: `<div class="alert alert-info" style="font-size:12px;margin:10px 0 0;">SendGrid: sign up → verify a sender → create API key with Mail Send permission.</div>`,
      brevo:    `<div class="alert alert-info" style="font-size:12px;margin:10px 0 0;">Brevo: sign up → Senders & IP → verify sender → Account → API Keys.</div>`,
    };

    const updateService = (val) => {
      smtpSection.style.display = val === 'smtp'   ? '' : 'none';
      apiSection.style.display  = !['mailto','smtp'].includes(val) ? '' : 'none';
      if (apiKeyHint) apiKeyHint.textContent = API_HINTS[val] || '';
      if (guideEl)    guideEl.innerHTML      = API_GUIDES[val] || '';
    };
    updateService(svc);
    content.querySelector('#er-service').addEventListener('change', e => updateService(e.target.value));

    // Auto-fill port when encryption changes
    content.querySelector('#er-smtp-enc')?.addEventListener('change', e => {
      const portMap = { starttls: '587', ssl: '465', none: '25' };
      content.querySelector('#er-smtp-port').value = portMap[e.target.value] || '587';
    });

    const collectConfig = () => ({
      email_service:             content.querySelector('#er-service').value,
      // SMTP
      smtp_host:                 content.querySelector('#er-smtp-host')?.value.trim()      || '',
      smtp_port:                 content.querySelector('#er-smtp-port')?.value.trim()      || '587',
      smtp_encryption:           content.querySelector('#er-smtp-enc')?.value              || 'starttls',
      smtp_username:             content.querySelector('#er-smtp-user')?.value.trim()      || '',
      smtp_password:             content.querySelector('#er-smtp-pass')?.value             || '',
      // API services
      email_api_key:             content.querySelector('#er-apikey')?.value.trim()         || '',
      // Common
      email_from_address:        content.querySelector('#er-smtp-from-email')?.value.trim()
                               || content.querySelector('#er-from-email')?.value.trim()    || '',
      email_reply_to:            content.querySelector('#er-smtp-reply-to')?.value.trim()
                               || content.querySelector('#er-reply-to')?.value.trim()      || '',
      email_sender_name:         content.querySelector('#er-sender').value.trim(),
      email_recipients_sales:    content.querySelector('#er-sales').value.trim(),
      email_recipients_shifts:   content.querySelector('#er-shifts').value.trim(),
      email_recipients_orders:   content.querySelector('#er-orders').value.trim(),
      email_recipients_products: content.querySelector('#er-products').value.trim(),
    });

    content.querySelector('#btn-er-save').addEventListener('click', async () => {
      msgEl.textContent = 'Saving…'; msgEl.style.color = 'var(--text-muted)';
      await Config.setMany(collectConfig());
      msgEl.textContent = '✓ Email settings saved.';
      msgEl.style.color = 'var(--success)';
    });

    content.querySelector('#btn-er-test').addEventListener('click', async () => {
      const addr = content.querySelector('#er-test-addr').value.trim();
      if (!addr) { msgEl.textContent = 'Enter a test recipient address.'; msgEl.style.color='var(--danger)'; return; }
      await Config.setMany(collectConfig());
      msgEl.textContent = 'Sending test email…'; msgEl.style.color = 'var(--text-muted)';
      try {
        const result = await EmailAPI.sendTest(addr);
        msgEl.textContent = result.method === 'mailto'
          ? 'Mail client opened — review and send.'
          : `✓ Test email sent to ${addr}. Check your inbox.`;
        msgEl.style.color = 'var(--success)';
      } catch(e) {
        msgEl.textContent = `✗ ${e.message}`;
        msgEl.style.color = 'var(--danger)';
      }
    });

    /* ── Automated Reports section (appended after save row) ── */
    const autoCfg = await Config.getAll();
    const autoPanel = document.createElement('div');
    autoPanel.innerHTML = `
      <div style="background:var(--surface2);border-radius:var(--radius);padding:16px 20px;margin-top:20px;">
        <h4 style="margin:0 0 14px;font-size:14px;">&#128337; Automated Reports</h4>
        <p style="font-size:12px;color:var(--text-muted);margin:0 0 16px;">
          Automatic reports are sent even when the app is open. Recipients default to the
          Sales &amp; Tax recipients above if the field is left blank.
        </p>

        <!-- Which report sections to include -->
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
                    padding:14px 16px;margin-bottom:16px;">
          <div style="font-weight:700;font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">
            Report Sections to Include
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            ${[
              ['summary',   'Sales Summary',          true,  true ],
              ['methods',   'By Payment Method',      true,  false],
              ['tax',       'Tax Breakdown',          true,  false],
              ['products',  'Top Products Sold',      false, false],
              ['btc',       'BTC / Controlled Log',   false, false],
              ['lowstock',  'Low Stock Alert',        false, false],
            ].map(([id,label,def,locked]) => `
              <label style="display:flex;align-items:center;gap:8px;cursor:${locked?'not-allowed':'pointer'};font-size:13px;${locked?'opacity:.7;':''}">
                <input type="checkbox" id="auto-rpt-${id}"
                  ${(autoCfg['auto_rpt_'+id]==='true' || (autoCfg['auto_rpt_'+id]===undefined && def))?'checked':''}
                  ${locked?'disabled checked':''} />
                ${label}${locked?' <span style="font-size:10px;color:var(--text-muted);">(always)</span>':''}
              </label>`).join('')}
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">
            These sections apply to both daily and monthly emails.
          </div>
        </div>

        <!-- Daily -->
        <div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <label class="toggle-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;">
              <input type="checkbox" id="auto-daily-on" ${autoCfg.auto_daily_enabled==='true'?'checked':''} />
              Daily Sales Report
            </label>
          </div>
          <div id="auto-daily-fields" style="${autoCfg.auto_daily_enabled!=='true'?'opacity:.5;pointer-events:none;':''}">
            <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
              <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:12px;">Send at (daily)</label>
                <input type="time" id="auto-daily-time" value="${autoCfg.auto_daily_time||'21:00'}"
                       style="width:130px;" />
              </div>
              <div class="form-group" style="margin-bottom:0;flex:1;min-width:200px;">
                <label style="font-size:12px;">Recipients (optional override)</label>
                <input type="text" id="auto-daily-recipients" value="${autoCfg.auto_daily_recipients||''}"
                       placeholder="Uses Sales recipients if blank" />
              </div>
              <button class="btn btn-outline btn-sm" id="btn-send-daily-now" style="white-space:nowrap;">
                &#9993; Send Now
              </button>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
              Sends the previous day's sales summary — so you always get a complete day.
            </div>
          </div>
        </div>

        <!-- Monthly -->
        <div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <label class="toggle-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;">
              <input type="checkbox" id="auto-monthly-on" ${autoCfg.auto_monthly_enabled==='true'?'checked':''} />
              Monthly Sales Report
            </label>
          </div>
          <div id="auto-monthly-fields" style="${autoCfg.auto_monthly_enabled!=='true'?'opacity:.5;pointer-events:none;':''}">
            <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
              <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:12px;">Send on day of month</label>
                <input type="number" id="auto-monthly-day" min="1" max="28"
                       value="${autoCfg.auto_monthly_day||'1'}" style="width:80px;" />
              </div>
              <div class="form-group" style="margin-bottom:0;flex:1;min-width:200px;">
                <label style="font-size:12px;">Recipients (optional override)</label>
                <input type="text" id="auto-monthly-recipients" value="${autoCfg.auto_monthly_recipients||''}"
                       placeholder="Uses Sales recipients if blank" />
              </div>
              <button class="btn btn-outline btn-sm" id="btn-send-monthly-now" style="white-space:nowrap;">
                &#9993; Send Now
              </button>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
              Sends the previous calendar month's full summary on the chosen day.
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button class="btn btn-primary btn-sm" id="btn-save-auto">Save Schedule</button>
          <div id="auto-msg" style="font-size:13px;"></div>
        </div>
      </div>`;

    content.querySelector('.settings-section').appendChild(autoPanel);

    /* Toggle enable/disable field dimming */
    const toggleFields = (checkId, fieldsId) => {
      const chk    = content.querySelector('#' + checkId);
      const fields = content.querySelector('#' + fieldsId);
      chk.addEventListener('change', () => {
        fields.style.opacity = chk.checked ? '1' : '0.5';
        fields.style.pointerEvents = chk.checked ? '' : 'none';
      });
    };
    toggleFields('auto-daily-on',   'auto-daily-fields');
    toggleFields('auto-monthly-on', 'auto-monthly-fields');

    const autoMsgEl = content.querySelector('#auto-msg');
    const showAutoMsg = (msg, ok = true) => {
      autoMsgEl.textContent = msg;
      autoMsgEl.style.color = ok ? 'var(--success)' : 'var(--danger)';
      setTimeout(() => { autoMsgEl.textContent = ''; }, 4000);
    };

    /* Save schedule */
    content.querySelector('#btn-save-auto').addEventListener('click', async () => {
      await Config.setMany({
        auto_daily_enabled:     content.querySelector('#auto-daily-on').checked ? 'true' : 'false',
        auto_daily_time:        content.querySelector('#auto-daily-time').value,
        auto_daily_recipients:  content.querySelector('#auto-daily-recipients').value.trim(),
        auto_monthly_enabled:   content.querySelector('#auto-monthly-on').checked ? 'true' : 'false',
        auto_monthly_day:       content.querySelector('#auto-monthly-day').value,
        auto_monthly_recipients: content.querySelector('#auto-monthly-recipients').value.trim(),
        // Report section selection
        auto_rpt_methods:  content.querySelector('#auto-rpt-methods').checked  ? 'true' : 'false',
        auto_rpt_tax:      content.querySelector('#auto-rpt-tax').checked      ? 'true' : 'false',
        auto_rpt_products: content.querySelector('#auto-rpt-products').checked ? 'true' : 'false',
        auto_rpt_btc:      content.querySelector('#auto-rpt-btc').checked      ? 'true' : 'false',
        auto_rpt_lowstock: content.querySelector('#auto-rpt-lowstock').checked ? 'true' : 'false',
      });
      showAutoMsg('✓ Schedule saved.');
    });

    /* Send Daily Now */
    content.querySelector('#btn-send-daily-now').addEventListener('click', async () => {
      const btn = content.querySelector('#btn-send-daily-now');
      btn.disabled = true; btn.textContent = 'Sending…';
      const recipients = content.querySelector('#auto-daily-recipients').value.trim()
                      || content.querySelector('#er-sales').value.trim();
      if (!recipients) { showAutoMsg('No recipients configured.', false); btn.disabled=false; btn.textContent='⊕ Send Now'; return; }
      const yesterday = localDateStr(new Date(Date.now() - 86400000));
      try {
        await Scheduler.sendDailyNow(yesterday, recipients);
        showAutoMsg(`✓ Daily report for ${yesterday} sent.`);
      } catch(e) {
        showAutoMsg(`✗ ${e.message}`, false);
      } finally {
        btn.disabled = false; btn.innerHTML = '&#9993; Send Now';
      }
    });

    /* Send Monthly Now */
    content.querySelector('#btn-send-monthly-now').addEventListener('click', async () => {
      const btn = content.querySelector('#btn-send-monthly-now');
      btn.disabled = true; btn.textContent = 'Sending…';
      const recipients = content.querySelector('#auto-monthly-recipients').value.trim()
                      || content.querySelector('#er-sales').value.trim();
      if (!recipients) { showAutoMsg('No recipients configured.', false); btn.disabled=false; btn.textContent='⊕ Send Now'; return; }
      const now = new Date();
      const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const month = now.getMonth() === 0 ? 12 : now.getMonth();
      try {
        await Scheduler.sendMonthlyNow(year, month, recipients);
        const mn = new Date(year, month-1, 1).toLocaleString('en-CA', { month:'long', year:'numeric' });
        showAutoMsg(`✓ Monthly report for ${mn} sent.`);
      } catch(e) {
        showAutoMsg(`✗ ${e.message}`, false);
      } finally {
        btn.disabled = false; btn.innerHTML = '&#9993; Send Now';
      }
    });
  }

  async _renderSQL(content) {
    // Only functional inside the Electron desktop app
    if (!window.electronAPI) {
      content.innerHTML = `
        <div class="settings-section">
          <h3>SQL Connection</h3>
          <div class="alert alert-info">
            SQL connection settings are only available in the <strong>Pharmacy POS desktop app</strong>.<br>
            You are currently using the browser version, which connects via the Cloudflare Worker configured
            under <strong>API Credentials</strong>.
          </div>
        </div>`;
      return;
    }

    // Load current config
    const cfg = await window.electronAPI.getSqlConfig();

    content.innerHTML = `
      <div class="settings-section">
        <h3>SQL Connection</h3>
        <div class="alert alert-info" style="font-size:13px;">
          Connect directly to your local WinRx SQL Server. Each pharmacy location can have different
          credentials stored in the app's data folder — no Cloudflare Worker needed.
        </div>

        <div id="sql-status-banner" style="margin-bottom:16px;padding:10px 14px;border-radius:6px;font-size:13px;
             background:${cfg.connected ? 'rgba(25,135,84,.1)' : 'rgba(220,53,69,.08)'};
             border:1px solid ${cfg.connected ? 'rgba(25,135,84,.3)' : 'rgba(220,53,69,.25)'};
             color:${cfg.connected ? 'var(--success)' : 'var(--danger)'};">
          ${cfg.connected
            ? `&#10003; Connected — ${cfg.server} / ${cfg.database}`
            : '&#10007; Not connected — enter credentials below and click Save &amp; Connect'}
        </div>

        <div class="form-group">
          <label>SQL Server <span style="font-weight:400;color:var(--text-muted);">(e.g. HOSTNAME\\SQLEXPRESS)</span></label>
          <input type="text" id="sql-server" value="${cfg.server || ''}"
                 placeholder="SERVER-PC\\SQLEXPRESS" />
        </div>
        <div class="form-group">
          <label>Database</label>
          <input type="text" id="sql-database" value="${cfg.database || 'winrxdata'}"
                 placeholder="winrxdata" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="sql-user" value="${cfg.user || ''}"
                   placeholder="SQL Server login" autocomplete="username" />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="sql-pass" value="${cfg.password || ''}"
                   placeholder="SQL Server password" autocomplete="new-password" />
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:4px;">
          <button class="btn btn-outline" id="btn-sql-test">&#9654; Test Connection</button>
          <button class="btn btn-primary" id="btn-sql-save">&#10003; Save &amp; Connect</button>
          <span id="sql-action-status" style="font-size:13px;"></span>
        </div>
        <div id="sql-test-result" style="margin-top:10px;font-size:13px;display:none;
             padding:8px 12px;border-radius:6px;"></div>

        <hr style="margin:20px 0;" />
        <div class="alert alert-info" style="font-size:12px;">
          <strong>Where is this saved?</strong> Credentials are stored in
          <code>%AppData%\\pharmacy-pos\\sql-config.json</code> on this PC. Each computer running
          the app can have its own SQL server connection — ideal for multi-location pharmacies.
        </div>
      </div>`;

    const statusEl  = content.querySelector('#sql-status-banner');
    const resultEl  = content.querySelector('#sql-test-result');
    const actionEl  = content.querySelector('#sql-action-status');

    const getFields = () => ({
      server:   content.querySelector('#sql-server').value.trim(),
      database: content.querySelector('#sql-database').value.trim() || 'winrxdata',
      user:     content.querySelector('#sql-user').value.trim(),
      password: content.querySelector('#sql-pass').value,
    });

    content.querySelector('#btn-sql-test').addEventListener('click', async () => {
      const cfg = getFields();
      if (!cfg.server || !cfg.user) {
        resultEl.style.display = 'block';
        resultEl.style.background = 'rgba(220,53,69,.08)';
        resultEl.style.border = '1px solid rgba(220,53,69,.25)';
        resultEl.style.color = 'var(--danger)';
        resultEl.textContent = 'Enter server and username before testing.';
        return;
      }
      resultEl.style.display = 'block';
      resultEl.style.background = 'rgba(13,110,253,.06)';
      resultEl.style.border = '1px solid rgba(13,110,253,.2)';
      resultEl.style.color = 'var(--text-muted)';
      resultEl.textContent = 'Testing connection…';
      const res = await window.electronAPI.testSqlConnection(cfg);
      resultEl.style.background = res.ok ? 'rgba(25,135,84,.08)' : 'rgba(220,53,69,.08)';
      resultEl.style.border      = res.ok ? '1px solid rgba(25,135,84,.3)' : '1px solid rgba(220,53,69,.25)';
      resultEl.style.color       = res.ok ? 'var(--success)' : 'var(--danger)';
      resultEl.textContent       = (res.ok ? '✓ ' : '✗ ') + res.message;
    });

    content.querySelector('#btn-sql-save').addEventListener('click', async () => {
      const cfg = getFields();
      if (!cfg.server || !cfg.user) {
        actionEl.style.color = 'var(--danger)';
        actionEl.textContent = 'Server and username are required.';
        return;
      }
      actionEl.style.color = 'var(--text-muted)';
      actionEl.textContent = 'Saving and connecting…';
      const res = await window.electronAPI.saveSqlConfig(cfg);
      actionEl.style.color = res.ok ? 'var(--success)' : 'var(--danger)';
      actionEl.textContent = (res.ok ? '✓ ' : '✗ ') + res.message;
      // Update the status banner
      statusEl.style.background = res.ok ? 'rgba(25,135,84,.1)' : 'rgba(220,53,69,.08)';
      statusEl.style.border      = res.ok ? '1px solid rgba(25,135,84,.3)' : '1px solid rgba(220,53,69,.25)';
      statusEl.style.color       = res.ok ? 'var(--success)' : 'var(--danger)';
      statusEl.textContent       = res.ok
        ? `✓ Connected — ${cfg.server} / ${cfg.database}`
        : `✗ Not connected — ${res.message}`;
      if (res.ok) Audit.configChange('SQL connection credentials updated');
    });
  }

  _renderBackup(content) {
    content.innerHTML = `
      <div class="settings-section">
        <h3>Database Backup</h3>
        <p class="text-muted" style="font-size:13px;margin-bottom:16px;">
          The database is stored in your browser's IndexedDB. Export it here for backup.
          To restore, use the import option.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
          <button class="btn btn-primary" id="btn-export">&#8659; Export Database (.sqlite)</button>
          <button class="btn btn-outline" id="btn-export-json">&#8659; Export All Data (.json)</button>
        </div>
        <hr style="margin:16px 0;" />

        <h4 style="margin-bottom:10px;font-size:14px;">Automatic Nightly Backup</h4>
        <p class="text-muted" style="font-size:13px;margin-bottom:12px;">
          Saves a <code>.sqlite</code> copy of the database to a folder every night.
          Point this at a OneDrive / network / external-drive folder (ideally on an
          encrypted/BitLocker location) so a copy lives off this PC.
        </p>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="auto-backup-enabled" style="width:auto;" />
          <label for="auto-backup-enabled" style="margin:0;">Enable automatic nightly backup</label>
        </div>
        <div class="form-group" style="max-width:160px;">
          <label>Time</label>
          <input type="time" id="auto-backup-time" value="23:30" />
        </div>
        <div class="form-group">
          <label>Backup folder</label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="auto-backup-folder" placeholder="e.g. D:\\PharmacyBackups" style="flex:1;" />
            <button class="btn btn-outline" data-browse="#auto-backup-folder">&#128193; Browse</button>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
          <button class="btn btn-primary" id="btn-save-backup">Save Backup Settings</button>
          <button class="btn btn-outline" id="btn-backup-now">&#128190; Back Up Now</button>
        </div>
        <div id="auto-backup-msg" style="margin-top:4px;font-size:13px;"></div>
        <hr style="margin:16px 0;" />
        <h4 style="margin-bottom:10px;font-size:14px;">Import / Restore</h4>
        <div class="alert alert-danger">
          <strong>Warning:</strong> Importing will overwrite your current database.
        </div>
        <div class="form-group">
          <label>Select .sqlite backup file</label>
          <input type="file" id="import-file" accept=".sqlite,.db" />
        </div>
        <button class="btn btn-danger" id="btn-import">Import & Restore</button>
        <div id="backup-msg" style="margin-top:8px;font-size:13px;"></div>
      </div>`;

    // ── Automatic nightly backup: load saved settings + wire controls ──
    (async () => {
      const enabled = (await Config.get('auto_backup_enabled')) === 'true';
      const time    = (await Config.get('auto_backup_time')) || '23:30';
      const folder  = (await Config.get('auto_backup_folder')) || '';
      const cb = content.querySelector('#auto-backup-enabled');
      const tm = content.querySelector('#auto-backup-time');
      const fd = content.querySelector('#auto-backup-folder');
      if (cb) cb.checked = enabled;
      if (tm) tm.value = time;
      if (fd) fd.value = folder;
    })();

    const backupMsg = content.querySelector('#auto-backup-msg');
    content.querySelector('#btn-save-backup')?.addEventListener('click', async () => {
      const enabled = content.querySelector('#auto-backup-enabled').checked;
      const time    = content.querySelector('#auto-backup-time').value || '23:30';
      const folder  = content.querySelector('#auto-backup-folder').value.trim();
      if (enabled && !folder) {
        backupMsg.textContent = 'Choose a backup folder first.'; backupMsg.style.color = 'var(--danger)'; return;
      }
      await Config.setMany({
        auto_backup_enabled: enabled ? 'true' : 'false',
        auto_backup_time:    time,
        auto_backup_folder:  folder,
      });
      Audit.configChange('Automatic backup settings updated');
      backupMsg.textContent = enabled
        ? `Saved. Nightly backup at ${time} → ${folder}`
        : 'Saved. Automatic backup is off.';
      backupMsg.style.color = 'var(--success)';
    });

    content.querySelector('#btn-backup-now')?.addEventListener('click', async () => {
      const folder = content.querySelector('#auto-backup-folder').value.trim();
      if (!folder) { backupMsg.textContent = 'Choose a backup folder first.'; backupMsg.style.color = 'var(--danger)'; return; }
      backupMsg.textContent = 'Backing up…'; backupMsg.style.color = 'var(--text-muted)';
      try {
        const res = await Scheduler.runBackupNow(folder);
        if (res && res.ok) {
          Audit.configChange('Manual database backup');
          backupMsg.textContent = `✓ Backed up to ${res.path}`; backupMsg.style.color = 'var(--success)';
        } else {
          backupMsg.textContent = 'Backup failed: ' + (res?.error || 'unknown error'); backupMsg.style.color = 'var(--danger)';
        }
      } catch(e) {
        backupMsg.textContent = 'Backup failed: ' + e.message; backupMsg.style.color = 'var(--danger)';
      }
    });

    content.querySelector('#btn-export').addEventListener('click', () => {
      try {
        const exported = DB.exportDb();
        if (!exported) { alert('Cannot export: database not initialised yet.'); return; }
        const blob = new Blob([exported], { type: 'application/octet-stream' });
        _downloadBlob(blob, `pharmacy_pos_backup_${_dateStr()}.sqlite`);
        Audit.configChange('Database exported (sqlite)');
      } catch(e) { alert('Export error: ' + e.message); }
    });

    content.querySelector('#btn-export-json').addEventListener('click', () => {
      try {
        const data = {
          exported_at:   new Date().toISOString(),
          patients:      DB.all('SELECT * FROM patients'),
          transactions:  DB.all('SELECT * FROM transactions'),
          items:         DB.all('SELECT * FROM transaction_items'),
          payments:      DB.all('SELECT * FROM payments'),
          custom_products: DB.all('SELECT * FROM custom_products'),
          staff:         DB.all('SELECT staff_id,name,role,active,created_at FROM staff'),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        _downloadBlob(blob, `pharmacy_pos_export_${_dateStr()}.json`);
        Audit.configChange('Database exported (JSON)');
      } catch(e) { alert('Export error: ' + e.message); }
    });

    content.querySelector('#btn-import').addEventListener('click', async () => {
      const file = content.querySelector('#import-file').files[0];
      const msg  = content.querySelector('#backup-msg');
      if (!file) { msg.textContent = 'Select a file first.'; msg.style.color='var(--danger)'; return; }
      if (!confirm('This will OVERWRITE your current database. Are you sure?')) return;
      try {
        const buf  = await file.arrayBuffer();
        const data = new Uint8Array(buf);
        // Save to IDB directly
        const idb   = await new Promise((res, rej) => {
          const r = indexedDB.open('PharmacyPOS', 1);
          r.onsuccess = e => res(e.target.result);
          r.onerror   = e => rej(e.target.error);
        });
        const tx    = idb.transaction('sqlite_store', 'readwrite');
        tx.objectStore('sqlite_store').put(data, 'pharmacy_pos_db');
        await new Promise(res => { tx.oncomplete = res; });
        Audit.configChange('Database restored from backup');
        msg.textContent = 'Restored. Reload the page to apply.';
        msg.style.color = 'var(--success)';
      } catch(e) {
        msg.textContent = 'Import failed: ' + e.message;
        msg.style.color = 'var(--danger)';
      }
    });
  }

  detach() {}
}

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _dateStr() {
  return localDateStr();
}
