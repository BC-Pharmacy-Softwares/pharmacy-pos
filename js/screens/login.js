/* ============================================================
   screens/login.js — Login (PIN pad) + first-run setup
   ============================================================ */

class LoginScreen {
  constructor(onLogin) {
    this._onLogin  = onLogin;
    this._pin      = '';
    this._el       = null;
    this._isSetup  = false;
    this._setupStep = 0; // 0=name 1=pin 2=confirm
    this._setupData = {};
  }

  render() {
    this._el = document.createElement('div');
    this._el.className = 'login-screen';

    const isFirstRun = !DB.hasAnyStaff();
    if (isFirstRun) {
      this._renderSetup();
    } else {
      this._renderPinPad();
    }
    return this._el;
  }

  async _renderSetup() {
    this._isSetup = true;
    const appName = (await Config.get('pharmacy_name')) || 'Pharmacy POS';
    this._el.innerHTML = `
      <div class="login-card" style="width:400px;">
        <div class="login-logo">${appName}</div>
        <div class="login-sub">First-time setup — create admin account</div>
        <div id="setup-form">
          <div class="form-group">
            <label>Admin Name</label>
            <input type="text" id="setup-name" placeholder="e.g. Manager" autocomplete="off" />
          </div>
          <div class="form-group">
            <label>PIN (4–8 digits)</label>
            <input type="password" id="setup-pin" placeholder="Enter PIN" maxlength="8" inputmode="numeric" autocomplete="off" />
          </div>
          <div class="form-group">
            <label>Confirm PIN</label>
            <input type="password" id="setup-pin2" placeholder="Repeat PIN" maxlength="8" inputmode="numeric" autocomplete="off" />
          </div>
          <div class="form-group">
            <label>Config passphrase (encrypts API credentials)</label>
            <input type="password" id="setup-pass" placeholder="Choose a passphrase" autocomplete="new-password" />
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="setup-submit">Create Admin & Continue</button>
          <div class="login-error" id="setup-error"></div>
        </div>
      </div>`;
    this._attachSetup();
  }

  _attachSetup() {
    const btn = this._el.querySelector('#setup-submit');
    const err = this._el.querySelector('#setup-error');
    btn.addEventListener('click', async () => {
      const name  = this._el.querySelector('#setup-name').value.trim();
      const pin   = this._el.querySelector('#setup-pin').value;
      const pin2  = this._el.querySelector('#setup-pin2').value;
      const pass  = this._el.querySelector('#setup-pass').value;
      err.textContent = '';

      if (!name) { err.textContent = 'Please enter a name.'; return; }
      if (!/^\d{4,8}$/.test(pin)) { err.textContent = 'PIN must be 4-8 digits.'; return; }
      if (pin !== pin2) { err.textContent = 'PINs do not match.'; return; }
      if (!pass || pass.length < 6) { err.textContent = 'Passphrase must be at least 6 characters.'; return; }

      btn.disabled = true;
      btn.textContent = 'Creating...';
      try {
        await Config.unlock(pass);
        await Auth.createInitialAdmin(name, pin);
        const staff = await Auth.login(pin);
        this._onLogin(staff);
      } catch(e) {
        err.textContent = 'Setup failed: ' + e.message;
        btn.disabled = false;
        btn.textContent = 'Create Admin & Continue';
      }
    });
  }

  async _renderPinPad() {
    this._pin = '';
    const appName = (await Config.get('pharmacy_name')) || 'Pharmacy POS';
    this._el.innerHTML = `
      <div class="login-card">
        <div class="login-logo">${appName}</div>
        <div class="login-sub">Enter your PIN to sign in</div>
        <div class="pin-display" id="pin-display">&#8212;</div>
        <div class="pin-pad">
          ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-btn" data-digit="${n}">${n}</button>`).join('')}
          <button class="pin-btn clear" id="pin-clear">C</button>
          <button class="pin-btn" data-digit="0">0</button>
          <button class="pin-btn backspace" id="pin-back">⌫</button>
        </div>
        <button class="btn btn-primary btn-block btn-lg" id="pin-submit">Sign In</button>
        <div class="login-error" id="pin-error"></div>
        <div class="setup-prompt">
          First time? <a id="setup-link">Set up config passphrase</a>
        </div>
      </div>`;
    this._attachPinPad();
  }

  _attachPinPad() {
    const display = this._el.querySelector('#pin-display');
    const errEl   = this._el.querySelector('#pin-error');

    const updateDisplay = () => {
      display.textContent = this._pin.length === 0 ? '—' : '●'.repeat(this._pin.length);
    };

    this._el.querySelectorAll('[data-digit]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._pin.length < 8) { this._pin += btn.dataset.digit; updateDisplay(); }
        errEl.textContent = '';
        Auth.touch();
      });
    });

    this._el.querySelector('#pin-clear').addEventListener('click', () => {
      this._pin = ''; updateDisplay(); errEl.textContent = '';
    });
    this._el.querySelector('#pin-back').addEventListener('click', () => {
      this._pin = this._pin.slice(0, -1); updateDisplay();
    });

    const doLogin = async () => {
      if (!this._pin) { errEl.textContent = 'Enter your PIN.'; return; }
      errEl.textContent = '';
      const staff = await Auth.login(this._pin);
      if (staff) {
        await Config.unlock(await this._promptPassphrase(staff));
        this._onLogin(staff);
      } else {
        errEl.textContent = 'Incorrect PIN.';
        this._pin = '';
        updateDisplay();
      }
    };

    this._el.querySelector('#pin-submit').addEventListener('click', doLogin);

    document.addEventListener('keydown', this._keyHandler = e => {
      if (e.key >= '0' && e.key <= '9' && this._pin.length < 8) {
        this._pin += e.key; updateDisplay();
      } else if (e.key === 'Backspace') {
        this._pin = this._pin.slice(0, -1); updateDisplay();
      } else if (e.key === 'Enter') {
        doLogin();
      } else if (e.key === 'Escape') {
        this._pin = ''; updateDisplay();
      }
    });

    this._el.querySelector('#setup-link')?.addEventListener('click', () => {
      this._showPassphraseSetup();
    });
  }

  async _promptPassphrase(staff) {
    // If config is already unlocked (fresh setup), return
    if (Config.isUnlocked()) return null;
    // If config has no data yet, use a default passphrase derived from pin
    if (!Config.isConfigured()) {
      await Config.unlock('default_pos_2024');
      return null;
    }
    // Prompt for passphrase
    return new Promise(resolve => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal" style="max-width:360px;">
          <div class="modal-header"><h3>Config Passphrase</h3></div>
          <div class="modal-body">
            <div class="form-group">
              <label>Enter your config passphrase to unlock API settings</label>
              <input type="password" id="pp-input" placeholder="Passphrase" autocomplete="current-password" />
            </div>
            <div id="pp-error" class="login-error"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" id="pp-ok">Unlock</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const input = modal.querySelector('#pp-input');
      const errEl = modal.querySelector('#pp-error');
      input.focus();
      const ok = async () => {
        const pass = input.value;
        if (!pass) { errEl.textContent = 'Required.'; return; }
        try {
          await Config.unlock(pass);
          document.body.removeChild(modal);
          resolve(pass);
        } catch {
          errEl.textContent = 'Incorrect passphrase.';
        }
      };
      modal.querySelector('#pp-ok').addEventListener('click', ok);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    });
  }

  _showPassphraseSetup() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:360px;">
        <div class="modal-header"><h3>Set Config Passphrase</h3></div>
        <div class="modal-body">
          <p class="text-muted mb-3">This passphrase encrypts your API credentials stored locally.</p>
          <div class="form-group">
            <label>New Passphrase</label>
            <input type="password" id="pp-new" placeholder="At least 6 characters" />
          </div>
          <div id="pp-err" class="login-error"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="pp-cancel">Cancel</button>
          <button class="btn btn-primary" id="pp-save">Set Passphrase</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#pp-cancel').addEventListener('click', () => document.body.removeChild(modal));
    modal.querySelector('#pp-save').addEventListener('click', async () => {
      const val = modal.querySelector('#pp-new').value;
      if (!val || val.length < 6) { modal.querySelector('#pp-err').textContent = 'Min 6 characters.'; return; }
      await Config.unlock(val);
      document.body.removeChild(modal);
    });
  }

  detach() {
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
  }
}
