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
      </div>
      <div class="settings-body">
        <div class="settings-nav">
          ${[
            ['pharmacy',     'Pharmacy Details',  false, false],
            ['datetime',     'Date & Time',       false, false],
            ['api',          'API Credentials',   false, true ],  // Admin only
            ['sql',          'SQL Connection',    true,  false],  // desktop only
            ['staff',        'Staff Management',  false, true ],  // Admin only
            ['products',     'Products',          false, false],
            ['quickactions', 'Quick Actions',     false, false],
            ['catalog',      'Catalog Sync',      false, false],
            ['barcode',      'Barcode Profiles',  false, false],
            ['printer',      'Receipt Printer',   true,  false],  // desktop only
            ['emailreports', 'Email Reports',     false, false],
            ['backup',       'Backup',            false, true ],  // Admin only
          ].filter(([, , desktopOnly]) => !desktopOnly || !!window.electronAPI)
           .map(([id, label, , adminOnly]) => {
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

    this._renderTab(this._activeTab);
    return this._el;
  }

  _renderTab(tab) {
    const content = this._el.querySelector('#settings-content');
    switch (tab) {
      case 'pharmacy':     this._renderPharmacy(content);     break;
      case 'datetime':     this._renderDateTime(content);     break;
      case 'api':          this._renderAPI(content);          break;
      case 'staff':        this._renderStaff(content);        break;
      case 'products':     this._renderProducts(content);     break;
      case 'quickactions': this._renderQuickActions(content); break;
      case 'catalog':      this._renderCatalog(content);      break;
      case 'sql':     if (window.electronAPI) this._renderSQL(content);     break;
      case 'barcode':      this._renderBarcode(content);      break;
      case 'printer': if (window.electronAPI) this._renderPrinter(content); break;
      case 'emailreports': this._renderEmailReports(content);  break;
      case 'backup':       this._renderBackup(content);       break;
    }
  }

  async _renderPharmacy(content) {
    const cfg       = await Config.getAll();
    const logo      = localStorage.getItem('pharmacy_logo_data') || '';
    const headerMsg = cfg.receipt_header_msg || '';
    const footerMsg = cfg.receipt_footer_msg || '';

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
            <input type="text" id="ph-name" value="${cfg.pharmacy_name||''}" placeholder="e.g. Pill4Me Pharmacy" />
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
            <input type="text" id="ph-province" value="${cfg.pharmacy_province||'BC'}" maxlength="2" placeholder="BC" />
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

        <!-- Appearance -->
        <div class="settings-section-title" style="margin-top:28px;">Appearance</div>
        <div class="form-row">
          <div class="form-group" style="flex:1;">
            <label>App Colour Theme</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px;" id="colour-presets">
              ${[
                ['#0d6efd','Blue (default)'],['#198754','Green'],['#6f42c1','Purple'],
                ['#dc3545','Red'],['#0dcaf0','Teal'],['#fd7e14','Orange'],['#212529','Dark'],
              ].map(([c,label]) => `
                <button type="button" data-colour="${c}" title="${label}"
                  style="width:30px;height:30px;border-radius:50%;background:${c};border:3px solid transparent;
                  cursor:pointer;transition:border-color .15s;"
                  class="colour-preset-btn"></button>
              `).join('')}
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                <input type="color" id="ph-colour-custom" value="${cfg.theme_colour||'#0d6efd'}"
                  style="width:30px;height:30px;border:none;padding:0;cursor:pointer;border-radius:50%;" />
                Custom
              </label>
            </div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:10px;">
              <span style="font-size:13px;color:var(--text-muted);">Preview:</span>
              <button class="btn btn-primary" id="colour-preview-btn" style="pointer-events:none;">Button</button>
              <span id="colour-preview-hex" style="font-size:12px;color:var(--text-muted);font-family:monospace;">${cfg.theme_colour||'#0d6efd'}</span>
            </div>
          </div>
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

    /* ── Colour theme picker ─────────────────────────────────── */
    const colourInput   = content.querySelector('#ph-colour-custom');
    const previewBtn    = content.querySelector('#colour-preview-btn');
    const previewHex    = content.querySelector('#colour-preview-hex');

    const applyPreview = (hex) => {
      colourInput.value = hex;
      previewHex.textContent = hex;
      previewBtn.style.background = hex;
      // Highlight selected preset
      content.querySelectorAll('.colour-preset-btn').forEach(b => {
        b.style.borderColor = b.dataset.colour === hex ? '#000' : 'transparent';
      });
    };

    // Preset colour buttons
    content.querySelectorAll('.colour-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => applyPreview(btn.dataset.colour));
    });

    // Custom colour picker
    colourInput.addEventListener('input', () => applyPreview(colourInput.value));

    // Highlight current colour on load
    applyPreview(cfg.theme_colour || '#0d6efd');

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
        theme_colour:         colourInput.value,
      });
      // Apply theme immediately without page reload
      if (typeof applyThemeColour === 'function') applyThemeColour(colourInput.value);
      await Tax.loadRates();
      Audit.configChange('Pharmacy details updated');
      const status = content.querySelector('#pharmacy-save-status');
      status.textContent = 'Saved.';
      status.style.color = 'var(--success)';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });
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

        <h4 style="margin:16px 0 10px;font-size:14px;color:var(--text-muted);">Clover — Network Pay Display</h4>
        <div class="alert alert-info" style="font-size:13px;">
          Start the <strong>clover-local-pay</strong> service first:<br/>
          <code style="user-select:all;">cd pharmacy-pos/clover-local-pay &amp;&amp; npm install &amp;&amp; npm start</code><br/>
          Then use the <strong>Pair with Device</strong> button below — no OAuth token needed.
        </div>
        <div class="form-group">
          <label>Local Pay Service URL</label>
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
          <input type="text" id="doc-folder-path" value="${cfg.doc_folder_path||''}"
                 placeholder="e.g. C:\\WinRx\\Documents\\Inbox" style="font-family:monospace;width:100%;" />
          <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">
            PDF files named <code>RCPT{RxNum}A.pdf</code> will be written here after each payment.
            The folder must exist and WinRx must be configured to watch it.
          </div>
        </div>

        <button class="btn btn-primary" id="btn-save-api">Save Settings</button>
        <div id="api-save-status" style="margin-top:8px;font-size:13px;"></div>
      </div>`;

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
        startErr.textContent   = 'Cannot reach the clover-local-pay service. Make sure it is running (npm start).';
        actionBtn.disabled     = false;
        actionBtn.textContent  = 'Start Pairing';
      }
    });
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
        const location = modal.querySelector('#mp-location').value.trim();
        const notes    = modal.querySelector('#mp-notes').value.trim();

        if (isCatalog) {
          const desc = modal.querySelector('#mp-desc').value.trim();
          const upc  = modal.querySelector('#mp-upc').value.trim();
          DB.updateCatalogProduct(p.product_id, {
            description: desc || p.description, upc_unit: upc || null,
            price_override: price, gst_applicable: gst, pst_applicable: pst,
            qty_on_hand: qty, qty_threshold: threshold, location, notes,
          });
        } else {
          const desc = modal.querySelector('#mp-desc').value.trim();
          const upc  = modal.querySelector('#mp-upc').value.trim();
          if (!desc) { errEl.style.display='block'; errEl.textContent='Description is required.'; return; }
          if (p) {
            DB.updateCustomProduct(p.custom_product_id, {
              description: desc, upc, price: price ?? 0, gst_applicable: gst, pst_applicable: pst,
              qty_on_hand: qty, qty_threshold: threshold, location, notes,
            });
          } else {
            DB.saveCustomProduct({ description: desc, upc, price: price ?? 0, gst_applicable: gst, pst_applicable: pst, created_by: Auth.current()?.name });
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
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:460px;">
        <div class="modal-header">
          <h3>&#9998; Edit Staff — ${s.name}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
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

    modal.querySelector('#es-save').addEventListener('click', () => {
      const name  = modal.querySelector('#es-name').value.trim();
      const errEl = modal.querySelector('#es-error');
      if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display='block'; return; }
      DB.updateStaff(s.staff_id, {
        name,
        role:   modal.querySelector('#es-role').value,
        emp_id: modal.querySelector('#es-empid').value.trim() || null,
        email:  modal.querySelector('#es-email').value.trim() || null,
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
                 placeholder="PILL4ME-PCY\\SQLEXPRESS" />
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
