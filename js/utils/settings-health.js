/* ============================================================
   settings-health.js — "Is the POS set up properly?" + deep links

   SettingsHealth.check() → a list of problems. Used by the Settings
     sidebar badges, the Settings Overview page, and the ⚠ count on
     the POS "⚙ Settings" button.
       level 'warn'  — something is silently not working: records not
                       saved, email can't send, backups off, sign-offs
                       can't use a pharmacist's PIN/signature.
       level 'setup' — an optional feature simply isn't configured.
     Keep 'warn' for real problems: it is what shows on the POS button,
     and a badge that is always on gets ignored.

   SettingsLink turns a "Settings → …" phrase inside an error message
     into a link that opens that exact setting (and flashes the field).
   ============================================================ */

const SettingsHealth = (() => {
  const FOLDERS = [
    { key: 'shift_records_folder', field: '#fd-shift',  name: 'Opening & closing sign-off folder' },
    { key: 'btc_records_folder',   field: '#fd-btc',    name: 'BTC records folder' },
    { key: 'doc_folder_path',      field: '#fd-doc',    name: 'WinRx document inbox folder' },
    { key: 'auto_backup_folder',   field: '#fd-backup', name: 'Nightly backup folder' },
  ];

  /* Ask the desktop app whether a folder exists and can be written to.
     Cached ~60 s so clicking around Settings doesn't hit the disk each time.
     Returns null when it can't tell (browser, or a build without the IPC). */
  const _cache = new Map();                      // path → { at, res }
  async function checkFolder(p, { fresh = false } = {}) {
    if (!p || !window.electronAPI?.checkFolder) return null;
    const hit = _cache.get(p);
    if (!fresh && hit && Date.now() - hit.at < 60000) return hit.res;
    let res = null;
    try { res = await window.electronAPI.checkFolder(p); } catch (_) {}
    _cache.set(p, { at: Date.now(), res });
    return res;
  }

  /* Can the POS actually send email? Only SMTP works from the desktop app:
     Resend/SendGrid/Brevo need a Worker URL there is no setting for. */
  function emailProblem(c) {
    const svc = c.email_service || 'mailto';
    if (svc === 'mailto') return 'Email is not set up — reports and sign-offs are not being emailed.';
    if (svc === 'smtp') {
      return (c.smtp_host && c.smtp_username && c.smtp_password)
        ? '' : 'SMTP email details are incomplete — emails will fail.';
    }
    return c.worker_url ? '' : `Email is set to ${svc}, which can't send from this version — choose SMTP instead.`;
  }

  async function check({ fresh = false } = {}) {
    const c   = await Config.getAll();
    const out = [];
    const add = (tab, level, msg, field = '') => out.push({ tab, level, msg, field });

    if (!c.pharmacy_name)
      add('pharmacy', 'warn', 'Pharmacy name is missing — it prints on receipts and sign-offs.', '#ph-name');

    const staff = (DB.getAllStaff ? DB.getAllStaff() : []).filter(s => s.active);
    if (!staff.some(s => s.license_number))
      add('staff', 'warn', 'No pharmacist has a License # — sign-offs can only be typed by hand, with no PIN or saved signature.');

    if (!c.clover_device_ip) add('clover', 'setup', 'Card terminal is not set up.', '#cl-device-ip');

    if (window.electronAPI?.getSqlConfig) {
      try {
        const sq = await window.electronAPI.getSqlConfig();
        if (!sq?.connected) add('sql', 'warn', 'WinRx is not connected — patient and prescription lookups won\'t work.', '#sql-server');
      } catch (_) {}
    }

    if (!c.mckesson_username || !c.mckesson_password) {
      add('mckesson', 'setup', 'McKesson login is not entered.', '#mk-user');
    } else {
      if (!c.mckesson_account)  add('mckesson', 'warn', 'McKesson Account # is missing — order uploads will fail.', '#mk-account');
      if (!c.mckesson_customer) add('mckesson', 'warn', 'McKesson Customer # is missing — invoices and catalog sync will fail.', '#mk-customer');
    }

    if (window.electronAPI && !c.receipt_printer)
      add('printer', 'setup', 'No receipt printer chosen — the print dialog appears for every receipt.', '#sel-printer');

    const em = emailProblem(c);
    if (em) add('emailreports', 'warn', em, '#er-service');
    if (!c.shift_records_recipients && !c.email_recipients_sales)
      add('emailreports', 'warn', 'No one is set to receive opening & closing sign-offs.', '#er-signoff');

    if (!c.shift_records_folder) add('folders', 'warn',  'Opening & closing sign-offs are not being saved as PDFs.', '#fd-shift');
    if (!c.btc_records_folder)   add('folders', 'warn',  'BTC sale records are not being saved as PDFs.', '#fd-btc');
    if (!c.doc_folder_path)      add('folders', 'setup', 'WinRx document inbox is not set — receipts are not sent to WinRx.', '#fd-doc');

    if (c.auto_backup_enabled !== 'true') add('backup', 'warn', 'Nightly backup is off.', '#auto-backup-enabled');
    else if (!c.auto_backup_folder)       add('folders', 'warn', 'Nightly backup is on but has no folder to save to.', '#fd-backup');

    // Folders that are set: do they still exist, and can we write to them?
    const res = await Promise.all(FOLDERS.map(f => checkFolder(c[f.key], { fresh })));
    FOLDERS.forEach((f, i) => {
      const r = res[i];
      if (!r || !c[f.key]) return;
      if (!r.exists || !r.isDir) add('folders', 'warn', `${f.name} not found: ${c[f.key]}`, f.field);
      else if (!r.writable)      add('folders', 'warn', `${f.name}: the POS isn't allowed to save files there (${c[f.key]})`, f.field);
    });

    return out;
  }

  return { check, checkFolder, FOLDERS };
})();


const SettingsLink = (() => {
  // Longest phrases first, so "… → McKesson Login" wins over a shorter prefix
  const MAP = [
    ['Settings → Email & Reports → Opening & Closing Sign-offs', 'emailreports', '#er-signoff'],
    ['Settings → Folders & Backup → Save Folders',               'folders',      ''],
    ['Settings → WinRx & McKesson → McKesson Login',             'mckesson',     '#mk-user'],
    ['Settings → WinRx & McKesson → WinRx Connection',           'sql',          '#sql-server'],
    ['Settings → Folders & Backup',                              'folders',      ''],
    ['Settings → Email & Reports',                               'emailreports', '#er-service'],
    ['Settings → Card Terminal',                                 'clover',       '#cl-device-ip'],
  ];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const canOpen = () => typeof Auth !== 'undefined' && Auth.isManager();   // cashiers can't open Settings

  function find(text) {
    const s = String(text ?? '');
    for (const [phrase, tab, field] of MAP) {
      const i = s.indexOf(phrase);
      if (i !== -1) return { i, phrase, tab, field };
    }
    return null;
  }

  /* Plain text → safe HTML, with the first "Settings → …" phrase made
     clickable. `field` overrides which field gets highlighted. */
  function linkify(text, field) {
    const s = String(text ?? '');
    const m = find(s);
    if (!m || !canOpen()) return esc(s);
    return esc(s.slice(0, m.i)) +
      `<a href="#" class="settings-link" data-settings-tab="${m.tab}" data-settings-field="${esc(field ?? m.field)}">${esc(m.phrase)}</a>` +
      esc(s.slice(m.i + m.phrase.length));
  }

  /* Open Settings at a page (and field) from anywhere. Holds an in-progress
     POS cart first — the same thing auto-lock does — and closes popups. */
  function go(tab, field = '') {
    if (!window.App?.navigate) return;
    const cur = window.App.current?.();
    if (cur && typeof cur._holdCart === 'function') cur._holdCart();
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
    window.App.navigate('settings', { tab, field });
  }

  /* For alert()-style errors: offer to jump straight to the setting. */
  function alertOrGo(text, field) {
    const m = find(text);
    if (!m || !canOpen()) { alert(text); return; }
    if (confirm(`${text}\n\nOpen that setting now?`)) go(m.tab, field ?? m.field);
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-settings-tab]');
    if (!a) return;
    e.preventDefault();
    go(a.dataset.settingsTab, a.dataset.settingsField || '');
  });

  return { linkify, go, alertOrGo };
})();
