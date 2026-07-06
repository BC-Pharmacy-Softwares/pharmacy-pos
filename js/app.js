/* ============================================================
   app.js — Application controller / router
   Initializes DB, handles screen navigation, wires auto-lock.
   ============================================================ */

(async function main() {
  const container = document.getElementById('screen-container');
  let currentScreen = null;

  function _clear() {
    if (currentScreen?.detach) currentScreen.detach();
    container.innerHTML = '';
    currentScreen = null;
  }

  function navigate(screen, params = {}) {
    _clear();
    let el;
    switch (screen) {
      case 'login': {
        const s = new LoginScreen(staff => navigate('pos'));
        currentScreen = s;
        el = s.render();
        break;
      }
      case 'pos': {
        const s = new POSScreen({ onNavigate: navigate });
        currentScreen = s;
        el = s.render();
        if (params.linkPatient) s.setPatient(params.linkPatient);
        break;
      }
      case 'patient': {
        const s = new PatientScreen({ onNavigate: navigate });
        currentScreen = s;
        el = s.render(params);
        if (params.selectedPatient) {
          // Pre-select patient in the results
          setTimeout(() => s._renderProfile(params.selectedPatient), 100);
        }
        break;
      }
      case 'transaction': {
        const s = new TransactionScreen({ onNavigate: navigate });
        currentScreen = s;
        el = s.render(params);
        break;
      }
      case 'settings': {
        const s = new SettingsScreen({ onNavigate: navigate });
        currentScreen = s;
        el = s.render(params);
        break;
      }
      case 'reports': {
        const s = new ReportsScreen({ onNavigate: navigate });
        currentScreen = s;
        el = s.render(params);
        break;
      }
      default:
        navigate('login');
        return;
    }
    container.appendChild(el);
  }

  // Show loading screen
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;
                background:linear-gradient(135deg,#1e3a5f,#0d6efd);color:#fff;">
      <div style="font-size:28px;font-weight:800;">Pharmacy POS</div>
      <div class="spinner" style="border-color:rgba(255,255,255,.3);border-top-color:#fff;width:32px;height:32px;"></div>
      <div id="load-msg" style="font-size:14px;opacity:.8;">Initializing database...</div>
    </div>`;

  try {
    // Unlock config encryption — must happen before any Config.get/set calls.
    // Uses a fixed passphrase; the POS login PIN is the actual access control.
    await Config.unlock('pharmacy-pos-config-v1');

    // Initialize DB
    await DB.init();
    await Tax.loadRates();
    document.getElementById('load-msg').textContent = 'Ready.';

    // Apply saved Brand Kit (falls back to legacy single theme colour)
    const savedKit = await Config.get('brand_kit');
    if (savedKit) {
      applyBrandKit(typeof savedKit === 'string' ? JSON.parse(savedKit) : savedKit);
    } else {
      const savedColour = await Config.get('theme_colour');
      if (savedColour) applyThemeColour(savedColour);
    }

    // Start automated report scheduler (daily + monthly emails)
    Scheduler.start();

    // Wire auto-lock
    Auth.setLockCallback(() => navigate('login'));

    // Reset inactivity timer on any user interaction
    ['click','keydown','mousemove','touchstart'].forEach(evt => {
      document.addEventListener(evt, () => Auth.touch(), { passive: true });
    });

    // Start at login
    navigate('login');

  } catch(e) {
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;
                  gap:16px;padding:32px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:var(--danger);">Initialization Error</div>
        <div style="max-width:500px;color:var(--text-muted);">${e.message}</div>
        <div style="max-width:500px;font-size:13px;color:var(--text-muted);">
          Make sure you have run <strong>setup.bat</strong> (Windows) or <strong>setup.sh</strong> (Mac/Linux)
          to download required libraries, and that you are serving the app via a local HTTP server
          (not opening index.html directly as a file://).
        </div>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>`;
  }
})();

/* Darken/lighten a hex by a delta per channel (±0–255). */
function _shade(hex, delta) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return '#' + hex.slice(1).match(/.{2}/g)
    .map(c => Math.min(255, Math.max(0, parseInt(c, 16) + delta)).toString(16).padStart(2, '0'))
    .join('');
}

/* Apply a single hex colour as the primary (legacy theme-colour path). */
function applyThemeColour(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  const root = document.documentElement;
  root.style.setProperty('--primary',     hex);
  root.style.setProperty('--primary-dk',  _shade(hex, -38));
  root.style.setProperty('--primary-soft', _shade(hex, 200));
}

/* Global brand colours — readable synchronously by print builders (which emit
   standalone HTML that doesn't inherit the app's CSS variables). */
window.BRAND_KIT = { background:'#f4f3ee', primary:'#1e4031', danger:'#c62f25', warning:'#e9a93c' };

/* Apply a full Brand Kit. kit = { background, primary, danger, warning, extras:[] }.
   Any field omitted falls back to the CSS default. */
function applyBrandKit(kit) {
  if (!kit || typeof kit !== 'object') return;
  ['background','primary','danger','warning','success'].forEach(k => {
    if (kit[k] && /^#[0-9a-f]{6}$/i.test(kit[k])) window.BRAND_KIT[k] = kit[k];
  });
  const root = document.documentElement;
  const set = (v, val) => { if (val && /^#[0-9a-f]{6}$/i.test(val)) root.style.setProperty(v, val); };
  if (kit.primary) {
    set('--primary', kit.primary);
    set('--primary-dk',   _shade(kit.primary, -38));
    set('--primary-soft', _shade(kit.primary, 200));
  }
  set('--bg', kit.background);
  if (kit.background) set('--surface2', _shade(kit.background, 6));
  set('--danger',  kit.danger);
  set('--warning', kit.warning);
  if (kit.success) set('--success', kit.success);
}
