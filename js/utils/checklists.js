/* ============================================================
   checklists.js — Start-of-Day (SOD) & End-of-Day (EOD) sign-offs
   Renders a regulatory checklist modal (BC / PODSA), captures
   header fields, checks (+RPh initials), Yes/No items, a cold-chain
   temperature log (with ranges + excursion flag), editable daily
   metrics, notes, and a pharmacist sign-off (name + CPBC #).
   Then: saves a PDF to the configured folder, emails a copy, and
   logs the completion to the DB.

   Source of truth for the EOD layout: docs/eod-template-reference.md
   Reuses: window.electronAPI.savePdfFile / generateA5Pdf / generateReceiptPdf,
           EmailAPI.send, DB.addShiftChecklist, Auth, Config, Tax.
   ============================================================ */

const Checklists = (() => {

  /* ── Templates ─────────────────────────────────────────────
     section: { title, badge?, items:[ item ] }
     item types:
       { label, note?, rph?, initials? }      → checkbox row (initials adds an RPh-initials input)
       { type:'yesno', key, label, note? }     → Yes/No dropdown row
     temps: { note?, fields:[{key,label,range?,ph?,required?,lo?,hi?}], excursion? }
     metrics: [{ key, label, prefix?, default? }]   (editable inputs)
     header: [{ key, label, ph? }]
  */

  const TEMPLATES = {
    open: {
      title: 'Start of Day — Opening Checklist',
      header: [
        { key: 'rph_on_duty', label: 'Pharmacist on Duty (RPh)', ph: 'Full name' },
        { key: 'tech',        label: 'Pharmacy Assistant / Tech', ph: 'Full name' },
        { key: 'open_time',   label: 'Opening Time', time: true },
      ],
      sections: [
        { title: 'Security & Premises', items: [
          { label: 'Alarm disarmed; premises secure, no signs of tampering' },
          { label: 'Narcotic safe / controlled storage intact (visual check)', rph: true },
          { label: 'Open sign turned ON' },
        ]},
        { title: 'Systems Ready', items: [
          { label: 'WinRx running' },
          { label: 'POS running' },
          { label: 'Receipt printer / fax online' },
          { label: 'Network / internet up' },
          { label: 'Clover terminal ready (if used)' },
        ]},
        { title: 'Overnight Review', items: [
          { label: 'Faxes / voicemails reviewed' },
          { label: 'Fridge alarm log checked — no overnight excursion' },
        ]},
        { title: 'Cash', items: [
          { label: 'Opening float counted and confirmed' },
        ]},
      ],
      temps: {
        badge: 'PODSA s.23.9 — Required Daily',
        note: 'Record fridge & freezer at opening. Fridge: +2 to +8 °C | Freezer: −25 to −10 °C.',
        fields: [
          { key: 'fridge_current',  label: 'Fridge — current temp',  range: '2–8°C',       ph: 'e.g. 4',   required: true, lo: 2,   hi: 8 },
          { key: 'freezer_current', label: 'Freezer — current temp', range: '−25 to −10°C', ph: 'e.g. −18', required: true, lo: -25, hi: -10 },
        ],
        excursion: true,
      },
      metrics: [],
    },

    close: {
      title: 'End of Day Sign-Off',
      subtitle: 'Daily Closing Checklist & Operations Record',
      header: [
        { key: 'rph_on_duty',  label: 'Pharmacist on Duty (RPh)', ph: 'Full name' },
        { key: 'tech',         label: 'Pharmacy Assistant / Tech', ph: 'Full name' },
        { key: 'closing_time', label: 'Closing Time', time: true },
      ],
      sections: [
        { title: 'Security & Physical Premises', badge: 'PODSA s.26 — Required', items: [
          { label: 'Security camera system checked for proper operation',
            note: 'Required daily per s.26(1)(b)(ii) — verify date/time stamp is active and footage is archiving (30-day minimum)' },
          { label: 'Dispensary monitored alarm armed',
            note: 'Required per s.26(2)(a)(i) when pharmacy is closed' },
          { label: 'Schedule I, II & controlled substances secured behind physical barriers', rph: true,
            note: 'Required per s.26(2)(a)(ii) — not just locked, must be physically inaccessible to non-licensees' },
          { label: 'Schedule IA drugs confirmed in time-delay safe (minimum 5-minute delay lock)', rph: true,
            note: 'Required per s.26(1)(a) — safe must be locked, secured in place, heavy-duty metal' },
          { label: 'Cash counted, excess cash secured in safe, safe locked and confirmed',
            note: 'Record closing float in metrics section below' },
          { label: 'All personal health information secured — no PHI left on counter, desk, or printer',
            note: 'PHI must be inaccessible per s.26(2)(a)(ii)' },
          { label: 'Dispensing counter cleared — no pending prescriptions left unattended' },
          { label: 'Open sign confirmed OFF (smart plug auto-off verified or manually confirmed)',
            note: 'Auto-scheduled 9 AM – 5 PM via smart plug — verify it turned off' },
        ]},
        { title: 'Narcotics, Controlled & Targeted Substances', badge: 'PODSA s.23.8 — Required', items: [
          { label: 'Controlled, targeted & narcotic dispenses report printed from WinRx — RPh reviewed running balance, signed and filed in narcotic binder',
            note: 'WinRx maintains the electronic perpetual log. Daily printout is your physical audit trail. Retain 3 years per s.23.8(10).',
            rph: true, initials: true },
          { label: 'No unexplained discrepancies in narcotic running balance', rph: true,
            note: 'Discrepancies require a narcotic incident report, investigation, and manager sign-off per s.23.8(8)(c)' },
          { label: 'Narcotic storage area locked and secure' },
          { type: 'yesno', key: 'narc_order_received', label: 'Narcotic / controlled drug order received from wholesaler today?' },
        ]},
        { title: 'Wholesaler Stock Receiving', items: [
          { type: 'yesno', key: 'wholesaler_order_received', label: 'General wholesaler order received today?' },
        ]},
        { title: 'Dispensing & Blister Packs', items: [
          { label: 'Scheduled / auto-refill billing processed — no unprocessed billings remaining in WinRx queue' },
          { label: 'Blister packs — accuracy checked, pharmacist final check completed and initialled', rph: true, initials: true,
            note: 'Document any corrections or returned packs in notes below' },
          { label: 'Uncollected prescriptions returned to will-call / filed appropriately' },
          { label: 'Patient returns processed — non-reusable drugs set aside for destruction',
            note: 'Per s.22 — returned drugs must not be re-dispensed unless sealed in original container with legible lot/expiry' },
        ]},
        { title: 'Systems & Equipment', items: [
          { label: 'WinRx end-of-day process completed — daily reports generated and saved' },
          { label: 'Fax / printer queue cleared — no prescription documents left in tray or on screen' },
          { label: 'All workstation screens locked or logged out' },
        ]},
      ],
      temps: {
        badge: 'PODSA s.23.9 — Required Daily',
        note: 'Must record at opening AND closing each working day. Fridge: +2 to +8 °C | Freezer: −25 to −10 °C.',
        fields: [
          { key: 'fridge_current',  label: 'Fridge — current temp',  range: '2–8°C',       ph: 'e.g. 4',   required: true, lo: 2,   hi: 8 },
          { key: 'fridge_min',      label: 'Fridge — min today',      ph: 'min',            required: true, lo: 2,   hi: 8 },
          { key: 'fridge_max',      label: 'Fridge — max today',      ph: 'max',            required: true, lo: 2,   hi: 8 },
          { key: 'freezer_current', label: 'Freezer — current temp', range: '−25 to −10°C', ph: 'e.g. −18', required: true, lo: -25, hi: -10 },
        ],
        excursion: true,
      },
      metrics: [
        { key: 'google_reviews', label: 'Google Reviews',    default: '0' },
        { key: 'portal_signups', label: 'Portal Sign-ups',   default: '0' },
        { key: 'new_patients',   label: 'New Patients',       default: '0' },
        { key: 'transfers_out',  label: 'Transfers Out',      default: '0' },
        { key: 'transfers_in',   label: 'Transfers In',       default: '0' },
        { key: 'total_rx',       label: 'Total Rx Dispensed', default: '0' },
        { key: 'closing_float',  label: 'Closing Float ($)',  default: '0.00', prefix: '$' },
        { key: 'injections',     label: 'Injections / Vaccines', default: '0' },
      ],
    },
  };

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function nowTime(){ const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }

  /* Stable id for a checklist item (used to remember per-staff default-checks). */
  function itemId(it){ return it.id || String(it.label||it.key||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,64); }

  /* A check item is "regulatory" — and therefore NOT eligible to be pre-checked —
     if it is RPh-flagged, a Yes/No item, or lives in a section with a regulatory badge. */
  function isRegulatory(sec, it){ return !!(sec.badge || it.rph || it.type === 'yesno'); }

  /* Items a staff member may set to default-checked: routine (non-regulatory) checkboxes. */
  function eligibleDefaultItems(){
    const seen = new Set(); const out = [];
    ['open','close'].forEach(kind => {
      (TEMPLATES[kind]?.sections || []).forEach(sec => {
        sec.items.forEach(it => {
          if (it.type === 'yesno') return;
          if (isRegulatory(sec, it)) return;
          const id = itemId(it);
          if (seen.has(id)) return;
          seen.add(id);
          out.push({ id, label: it.label, kind });
        });
      });
    });
    return out;
  }

  /* ── Render the checklist modal ──────────────────────────── */
  function show(kind, { shift_id, onDone } = {}) {
    const tpl = TEMPLATES[kind];
    if (!tpl) return;
    const staff   = Auth.current();
    const isRph   = staff && (staff.license_number || (staff.role === 'PHARMACIST'));

    // Per-staff default-checks (routine items only; regulatory items always start unchecked)
    let myDefaults = {};
    try { myDefaults = JSON.parse(staff?.checklist_defaults || '{}') || {}; } catch(_) {}

    // Pharmacists available to counter-sign (have a license #), + a quick lookup map
    const pharmacists = (DB.getAllStaff ? DB.getAllStaff() : [])
      .filter(p => p.active && (p.license_number || p.role === 'PHARMACIST'));
    const pharmMap = {};
    pharmacists.forEach(p => { pharmMap[p.staff_id] = {
      name: p.name, cpbc: p.license_number || '', mode: p.signoff_mode || 'pin', signature: p.signature || '',
    }; });

    // Count only checkbox items for progress
    const checkItems = tpl.sections.flatMap(s => s.items.filter(it => it.type !== 'yesno'));
    const total      = checkItems.length;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '9700';

    /* Header fields */
    const headerHtml = (tpl.header || []).map(h => `
      <div>
        <label style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:var(--text-muted);">${esc(h.label)}</label>
        <input ${h.time ? 'type="time"' : 'type="text"'} class="cl-hdr" data-key="${h.key}"
               value="${h.time ? nowTime() : (h.key==='rph_on_duty' && isRph ? esc(staff.name) : '')}"
               placeholder="${esc(h.ph||'')}" style="width:100%;margin-top:3px;" />
      </div>`).join('');

    /* Sections */
    const sectionsHtml = tpl.sections.map((sec, si) => {
      const rows = sec.items.map((it, ii) => {
        if (it.type === 'yesno') {
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px;">
              <span style="flex:1;">⚠️ ${esc(it.label)}
                ${it.note?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${esc(it.note)}</div>`:''}</span>
              <select class="cl-yesno" data-key="${esc(it.key)}" style="width:90px;">
                <option value="No" selected>No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>`;
        }
        const preCheck = !isRegulatory(sec, it) && !!myDefaults[itemId(it)];
        return `
          <div style="border-bottom:1px solid var(--border);padding:7px 0;">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13px;">
              <input type="checkbox" class="cl-item" data-s="${si}" data-i="${ii}" ${preCheck ? 'checked' : ''}
                     ${it.rph ? 'data-rph="1"' : ''} style="margin-top:2px;width:16px;height:16px;flex-shrink:0;" />
              <span style="flex:1;">
                ${esc(it.label)}
                ${it.rph ? '<span class="badge" style="background:#e7f0ff;color:#0d4ea8;font-size:10px;margin-left:4px;">RPh</span>' : ''}
                ${it.note?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${esc(it.note)}</div>`:''}
              </span>
            </label>
            ${it.initials?`<div style="margin:4px 0 2px 26px;font-size:12px;color:var(--text-muted);">
              RPh initials: <input type="text" class="cl-initials" data-s="${si}" data-i="${ii}" maxlength="6"
              placeholder="Initials" style="width:90px;display:inline-block;" /></div>`:''}
          </div>`;
      }).join('');
      return `
        <div style="margin-bottom:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="font-weight:700;font-size:13px;color:var(--text);text-transform:uppercase;letter-spacing:.03em;">${esc(sec.title)}</div>
            ${sec.badge?`<span style="font-size:10px;color:#b02a37;border:1px solid #f1aeb5;border-radius:10px;padding:1px 8px;white-space:nowrap;">${esc(sec.badge)}</span>`:''}
          </div>
          ${rows}
        </div>`;
    }).join('');

    /* Cold-chain temperature log */
    const t = tpl.temps;
    const tempsHtml = (t && t.fields && t.fields.length) ? `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <div style="font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.03em;">🌡 Cold Chain Temperature Log</div>
          ${t.badge?`<span style="font-size:10px;color:#b02a37;border:1px solid #f1aeb5;border-radius:10px;padding:1px 8px;white-space:nowrap;">${esc(t.badge)}</span>`:''}
        </div>
        ${t.note?`<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">${esc(t.note)}</div>`:''}
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
          ${t.fields.map(f => `
            <div>
              <label style="font-size:12px;color:var(--text-muted);">${esc(f.label)}${f.required?' <span style="color:var(--danger);">*</span>':''}
                ${f.range?`<span style="opacity:.7;">(${esc(f.range)})</span>`:''}</label>
              <input type="number" step="0.1" class="cl-temp" data-key="${esc(f.key)}"
                     data-lo="${f.lo??''}" data-hi="${f.hi??''}" placeholder="${esc(f.ph||'')}"
                     style="width:100%;margin-top:3px;" />
            </div>`).join('')}
          ${t.excursion?`
            <div style="grid-column:1 / -1;display:flex;align-items:center;gap:10px;margin-top:2px;">
              <span style="font-size:13px;flex:1;">Temperature excursion today?</span>
              <select id="cl-excursion" style="width:120px;">
                <option value="No" selected>No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>`:''}
        </div>
        <div id="cl-temp-warn" style="display:none;font-size:12px;color:#b02a37;margin-top:6px;"></div>
      </div>` : '';

    /* Daily metrics (editable) */
    const metricsHtml = (tpl.metrics && tpl.metrics.length) ? `
      <div style="margin-bottom:16px;">
        <div style="font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px;">📊 Daily Metrics</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
          ${tpl.metrics.map(m => `
            <div style="background:var(--surface2);border-radius:var(--radius);padding:8px 10px;">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px;">${esc(m.label)}</div>
              <input type="${m.prefix?'text':'number'}" class="cl-metric" data-key="${esc(m.key)}"
                     value="${esc(m.default||'')}" style="width:100%;font-weight:700;" />
            </div>`).join('')}
        </div>
      </div>` : '';

    overlay.innerHTML = `
      <div class="modal" style="max-width:620px;max-height:92vh;display:flex;flex-direction:column;">
        <div class="modal-header" style="background:${kind==='open'?'#d1e7dd':'#fff3cd'};">
          <div>
            <h3 style="color:${kind==='open'?'#0a3622':'#856404'};margin:0;">${esc(tpl.title)}</h3>
            ${tpl.subtitle?`<div style="font-size:12px;color:#856404;opacity:.8;">${esc(tpl.subtitle)} — ${esc(new Date().toLocaleDateString('en-CA',{weekday:'long',year:'numeric',month:'long',day:'numeric'}))}</div>`:''}
          </div>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;">
          ${headerHtml?`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;">${headerHtml}</div>`:''}

          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px;">
            <span>Checklist progress</span><span id="cl-prog">0 / ${total}</span>
          </div>
          <div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden;margin-bottom:16px;">
            <div id="cl-bar" style="height:100%;width:0;background:var(--success);transition:width .2s;"></div>
          </div>

          ${sectionsHtml}
          ${tempsHtml}
          ${metricsHtml}

          <div style="margin-bottom:16px;">
            <div style="font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;">📝 Incidents, Notes & Follow-ups</div>
            <textarea id="cl-notes" rows="3" style="width:100%;resize:vertical;"
              placeholder="Drug incidents, near misses, patient complaints, equipment issues, discrepancies investigated, items to follow up tomorrow…"></textarea>
          </div>

          <!-- Sign-off: completed by (opener) + Pharmacist on Duty counter-sign -->
          <div style="background:var(--surface2);border-radius:var(--radius);padding:12px 14px;">
            <div style="font-size:13px;margin-bottom:10px;">
              Completed by: <strong>${esc(staff?.name || '')}</strong>
              <span style="color:var(--text-muted);">(${esc(Auth.roleLabel ? Auth.roleLabel(staff?.role) : (staff?.role||''))})</span>
            </div>
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">✍ Pharmacist on Duty — Counter-Sign (required)</div>

            <div class="form-group" style="margin-bottom:10px;">
              <label style="font-size:11px;text-transform:uppercase;color:var(--text-muted);">Sign as</label>
              <select id="cl-rph-select" style="width:100%;margin-top:3px;">
                ${pharmacists.map(p => `<option value="${p.staff_id}" ${(isRph && staff.staff_id===p.staff_id)?'selected':''}>${esc(p.name)}${p.license_number?` — CPBC ${esc(p.license_number)}`:''}</option>`).join('')}
                <option value="">Other / type manually…</option>
              </select>
            </div>

            <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;">
              <div>
                <label style="font-size:11px;text-transform:uppercase;color:var(--text-muted);">RPh Full Name</label>
                <input id="cl-rph-name" type="text" value="" placeholder="Full legal name" style="width:100%;margin-top:3px;" />
              </div>
              <div>
                <label style="font-size:11px;text-transform:uppercase;color:var(--text-muted);">CPBC #</label>
                <input id="cl-rph-lic" type="text" value="" placeholder="CPBC #" style="width:100%;margin-top:3px;" />
              </div>
              <div>
                <label style="font-size:11px;text-transform:uppercase;color:var(--text-muted);">Sign-off Time</label>
                <input id="cl-signoff-time" type="time" value="${nowTime()}" style="width:100%;margin-top:3px;" />
              </div>
            </div>

            <div id="cl-sig-row" style="display:none;align-items:center;gap:10px;margin-top:10px;">
              <span style="font-size:12px;color:var(--text-muted);">Signature:</span>
              <img id="cl-sig-img" alt="" style="height:46px;max-width:240px;background:#fff;border:1px solid var(--border);border-radius:4px;" />
            </div>

            <div id="cl-pin-row" style="display:none;margin-top:10px;">
              <label style="font-size:11px;text-transform:uppercase;color:var(--text-muted);">Enter your PIN to sign</label><br>
              <input id="cl-rph-pin" type="password" inputmode="numeric" maxlength="8" placeholder="PIN" style="width:160px;margin-top:3px;" />
            </div>

            <label id="cl-attest-row" style="display:flex;align-items:flex-start;gap:8px;margin-top:10px;font-size:13px;cursor:pointer;">
              <input type="checkbox" id="cl-attest" style="margin-top:2px;" />
              <span>Pharmacist on duty attests this checklist — including all RPh-verified items — has been reviewed and verified.</span>
            </label>
          </div>

          <div id="cl-err" class="alert alert-danger" style="display:none;margin-top:10px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="cl-skip">Skip for now</button>
          <button class="btn btn-success" id="cl-save">Complete &amp; Save</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', () => { close(); onDone && onDone(); });
    overlay.querySelector('#cl-skip').addEventListener('click', () => { close(); onDone && onDone(); });

    // Pharmacist picker → fill name/CPBC, show signature, choose PIN vs tick by their mode
    const selEl    = overlay.querySelector('#cl-rph-select');
    const nameEl   = overlay.querySelector('#cl-rph-name');
    const licEl    = overlay.querySelector('#cl-rph-lic');
    const pinRow   = overlay.querySelector('#cl-pin-row');
    const attestRow= overlay.querySelector('#cl-attest-row');
    const sigRow   = overlay.querySelector('#cl-sig-row');
    const sigImg   = overlay.querySelector('#cl-sig-img');
    const applyRphSelection = () => {
      const p = pharmMap[selEl.value];
      if (p) {
        nameEl.value = p.name; licEl.value = p.cpbc;
        nameEl.readOnly = true; licEl.readOnly = true;
        if (p.signature) { sigImg.src = p.signature; sigRow.style.display = 'flex'; } else { sigRow.style.display = 'none'; }
        const pin = p.mode === 'pin';
        pinRow.style.display    = pin ? 'block' : 'none';
        attestRow.style.display = pin ? 'none'  : 'flex';
      } else {
        // Manual entry / no stored signature → typed name + CPBC + attestation
        nameEl.readOnly = false; licEl.readOnly = false;
        sigRow.style.display = 'none';
        pinRow.style.display = 'none'; attestRow.style.display = 'flex';
      }
    };
    selEl.addEventListener('change', applyRphSelection);
    applyRphSelection();

    const cbs = [...overlay.querySelectorAll('.cl-item')];
    const updateProg = () => {
      const n = cbs.filter(c => c.checked).length;
      overlay.querySelector('#cl-prog').textContent = `${n} / ${total}`;
      overlay.querySelector('#cl-bar').style.width = total ? Math.round(n/total*100) + '%' : '0%';
    };
    // Anyone (e.g. a tech) may complete the checklist; RPh-flagged items are
    // verified by the Pharmacist on Duty's required counter-sign at the bottom.
    cbs.forEach(c => c.addEventListener('change', () => {
      overlay.querySelector('#cl-err').style.display = 'none';
      updateProg();
    }));

    // Live out-of-range check on temps → auto-suggest excursion = Yes
    const tempInputs = [...overlay.querySelectorAll('.cl-temp')];
    const excursionSel = overlay.querySelector('#cl-excursion');
    const tempWarn = overlay.querySelector('#cl-temp-warn');
    const checkTemps = () => {
      let outOfRange = [];
      tempInputs.forEach(inp => {
        const v = parseFloat(inp.value);
        const lo = inp.dataset.lo === '' ? null : parseFloat(inp.dataset.lo);
        const hi = inp.dataset.hi === '' ? null : parseFloat(inp.dataset.hi);
        const bad = !isNaN(v) && ((lo!=null && v<lo) || (hi!=null && v>hi));
        inp.style.borderColor = bad ? 'var(--danger)' : '';
        if (bad) outOfRange.push(inp.dataset.key.replace(/_/g,' '));
      });
      if (tempWarn) {
        if (outOfRange.length) {
          tempWarn.style.display = 'block';
          tempWarn.textContent = `⚠ Out of range: ${outOfRange.join(', ')}. Set "Temperature excursion today?" to Yes and document in notes.`;
          if (excursionSel && excursionSel.value === 'No') excursionSel.value = 'Yes';
        } else {
          tempWarn.style.display = 'none';
        }
      }
    };
    tempInputs.forEach(inp => inp.addEventListener('input', checkTemps));

    overlay.querySelector('#cl-save').addEventListener('click', async function() {
      const err = overlay.querySelector('#cl-err');
      const showErr = (msg) => { err.style.display='block'; err.textContent=msg; err.scrollIntoView({block:'nearest'}); };
      const rphName = overlay.querySelector('#cl-rph-name').value.trim();
      const rphLic  = overlay.querySelector('#cl-rph-lic').value.trim();
      const selId   = selEl.value;
      const selPh   = pharmMap[selId] || null;
      const mode    = selPh ? selPh.mode : 'tick';   // manual entry uses attestation
      const checkedCount = cbs.filter(c => c.checked).length;

      // Required: cold-chain temps
      const temps = {};
      let missingTemp = false;
      overlay.querySelectorAll('.cl-temp').forEach(inp => {
        const val = inp.value.trim();
        temps[inp.dataset.key] = val;
        const field = (tpl.temps.fields||[]).find(f => f.key === inp.dataset.key);
        if (field && field.required && val === '') missingTemp = true;
      });
      if (missingTemp) { showErr('Cold-chain temperatures are required (PODSA s.23.9). Please record all fridge/freezer readings.'); return; }

      if (checkedCount < total) {
        if (!confirm(`${total - checkedCount} checklist item(s) are unchecked. Save anyway?`)) return;
      }
      if (!rphName || !rphLic) { showErr('Pharmacist full name and CPBC registration # are required to sign off.'); return; }

      // Authentication gate: PIN re-entry, or attestation tick
      if (selPh && mode === 'pin') {
        const pin = overlay.querySelector('#cl-rph-pin').value.trim();
        if (!pin) { showErr(`Enter ${rphName}'s PIN to sign off.`); return; }
        const ok = await Auth.verifyPin(parseInt(selId), pin);
        if (!ok) { showErr('Incorrect PIN — could not verify the pharmacist.'); return; }
      } else {
        if (!overlay.querySelector('#cl-attest').checked) {
          showErr('The pharmacist attestation checkbox must be ticked to sign off.'); return;
        }
      }
      const signatureImg = selPh ? selPh.signature : '';

      // Gather everything
      const items = tpl.sections.flatMap((s,si) => s.items
        .filter(it => it.type !== 'yesno')
        .map((it,localIdx) => {
          // recover the original index within the section
          const ii = s.items.indexOf(it);
          const cb = overlay.querySelector(`.cl-item[data-s="${si}"][data-i="${ii}"]`);
          const initEl = overlay.querySelector(`.cl-initials[data-s="${si}"][data-i="${ii}"]`);
          return {
            section: s.title, label: it.label, rph: !!it.rph,
            checked: cb ? cb.checked : false,
            initials: initEl ? initEl.value.trim() : undefined,
          };
        }));

      const yesno = [];
      overlay.querySelectorAll('.cl-yesno').forEach(sel => {
        // find label
        let label = sel.dataset.key;
        tpl.sections.forEach(s => s.items.forEach(it => { if (it.key === sel.dataset.key) label = it.label; }));
        yesno.push({ key: sel.dataset.key, label, value: sel.value });
      });

      if (excursionSel) temps.excursion = excursionSel.value;

      const metrics = {};
      overlay.querySelectorAll('.cl-metric').forEach(inp => { metrics[inp.dataset.key] = inp.value.trim(); });

      const header = {};
      overlay.querySelectorAll('.cl-hdr').forEach(inp => { header[inp.dataset.key] = inp.value.trim(); });

      const notes = overlay.querySelector('#cl-notes').value.trim();
      const signoff = {
        completed_by: staff?.name || '',
        completed_by_role: (Auth.roleLabel ? Auth.roleLabel(staff?.role) : (staff?.role||'')),
        rph_name: rphName, cpbc: rphLic, time: overlay.querySelector('#cl-signoff-time').value,
        method: (selPh && mode === 'pin') ? 'PIN-verified' : 'attestation',
        signature: signatureImg || '',
      };

      const data = { header, items, yesno, temps, metrics, notes, signoff };
      const btn = this; btn.disabled = true; btn.textContent = 'Saving…';

      try {
        const id = DB.addShiftChecklist({
          kind, shift_id, completed_by: staff?.name || null,
          rph_name: rphName, rph_license: rphLic, data,
        });
        await _saveAndEmail(kind, tpl, data, staff);
        btn.textContent = '✓ Saved';
        btn.style.background = 'var(--success)';
        setTimeout(() => { close(); onDone && onDone(); }, 900);
      } catch(e) {
        showErr('Saved to log, but PDF/email step failed: ' + e.message);
        btn.disabled = false; btn.textContent = 'Complete & Save';
      }
    });

    updateProg();
  }

  /* ── Build printable HTML, save PDF to folder, email a copy ── */
  async function _saveAndEmail(kind, tpl, data, staff) {
    const cfg  = await Config.getAll();
    const name = cfg.pharmacy_name || 'Pharmacy';
    const now  = new Date();
    const dateStr = now.toLocaleDateString('en-CA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    const cell = (s, b) => `<td style="padding:4px 8px;border:1px solid #ddd;${b?'font-weight:700;':''}">${esc(s)}</td>`;
    const kv   = (k,v) => `<tr>${cell(k)}${cell(v)}</tr>`;

    // Header
    const h = data.header || {};
    const headerRows = (tpl.header||[]).map(f => kv(f.label, h[f.key]||'—')).join('');

    // Sections (checks + initials)
    const sectionsHtml = tpl.sections.map(sec => {
      const itemRows = sec.items.map(it => {
        if (it.type === 'yesno') {
          const ans = (data.yesno||[]).find(y => y.key === it.key);
          return `<tr><td style="padding:3px 8px;border:1px solid #eee;width:28px;">—</td>`+
                 `<td style="padding:3px 8px;border:1px solid #eee;">${esc(it.label)} <b>${esc(ans?ans.value:'No')}</b></td></tr>`;
        }
        const rec = (data.items||[]).find(x => x.label === it.label);
        const init = rec && rec.initials ? ` <span style="color:#555;">[init: ${esc(rec.initials)}]</span>` : '';
        return `<tr><td style="padding:3px 8px;border:1px solid #eee;width:28px;">${rec&&rec.checked?'☑':'☐'}</td>`+
               `<td style="padding:3px 8px;border:1px solid #eee;">${esc(it.label)}${it.rph?' <b>(RPh)</b>':''}${init}</td></tr>`;
      }).join('');
      return `<h4 style="margin:14px 0 4px;">${esc(sec.title)}${sec.badge?` <span style="font-weight:400;color:#b02a37;font-size:9pt;">[${esc(sec.badge)}]</span>`:''}</h4>
              <table style="width:100%;border-collapse:collapse;font-size:9.5pt;"><tbody>${itemRows}</tbody></table>`;
    }).join('');

    // Temps
    const t = data.temps || {};
    const tempLabel = { fridge_current:'Fridge — current', fridge_min:'Fridge — min today', fridge_max:'Fridge — max today', freezer_current:'Freezer — current' };
    const tempRows = (tpl.temps.fields||[]).map(f => kv(tempLabel[f.key]||f.key.replace(/_/g,' '), (t[f.key]||'—')+(t[f.key]?' °C':''))).join('')
      + (tpl.temps.excursion ? kv('Temperature excursion today?', t.excursion||'No') : '');

    // Metrics
    const metricRows = (tpl.metrics||[]).map(m => kv(m.label, (m.prefix||'')+(data.metrics?.[m.key]??''))).join('');

    const so = data.signoff || {};
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      @page{size:Letter;margin:14mm;}
      body{font-family:Arial,sans-serif;font-size:10.5pt;color:#000;}
      h2{margin:0 0 2px;} h3{margin:0 0 10px;color:#555;font-weight:400;font-size:11pt;}
      h4{margin:14px 0 4px;font-size:10.5pt;}
      table{width:100%;border-collapse:collapse;margin:4px 0 10px;font-size:9.5pt;}
      .sig{margin-top:18px;border-top:2px solid #000;padding-top:8px;font-size:10pt;}
    </style></head><body>
      <h2>${esc(name)} — ${esc(tpl.title)}</h2>
      <h3>${esc(tpl.subtitle?tpl.subtitle+' · ':'')}${esc(dateStr)}</h3>
      <table><tbody>${headerRows}</tbody></table>
      ${sectionsHtml}
      <h4>Cold Chain Temperature Log <span style="font-weight:400;color:#b02a37;font-size:9pt;">[PODSA s.23.9]</span></h4>
      <table><tbody>${tempRows}</tbody></table>
      ${metricRows?`<h4>Daily Metrics</h4><table><tbody>${metricRows}</tbody></table>`:''}
      ${data.notes?`<h4>Incidents, Notes & Follow-ups</h4><p style="font-size:10pt;white-space:pre-wrap;">${esc(data.notes)}</p>`:''}
      <div class="sig">
        Completed by: <b>${esc(so.completed_by||'')}</b>${so.completed_by_role?` <span style="color:#666;">(${esc(so.completed_by_role)})</span>`:''}<br>
        <b>Pharmacist on Duty — counter-sign:</b> <b>${esc(so.rph_name||'')}</b> &nbsp; CPBC #: <b>${esc(so.cpbc||'')}</b> &nbsp; Time: ${esc(so.time||'')}<br>
        ${so.signature?`<img src="${so.signature}" alt="signature" style="height:48px;margin-top:4px;" /><br>`:''}
        <span style="color:#666;">Signed via ${esc(so.method||'attestation')} · Generated ${esc(now.toLocaleString('en-CA'))}</span>
      </div>
    </body></html>`;

    // Save PDF to the configured shift-records folder
    const folder = cfg.shift_records_folder || '';
    if (folder && window.electronAPI?.savePdfFile && (window.electronAPI?.generateA5Pdf || window.electronAPI?.generateReceiptPdf)) {
      const gen = window.electronAPI.generateA5Pdf || window.electronAPI.generateReceiptPdf;
      const b64 = await gen(html);
      if (b64) {
        const stamp = now.toISOString().slice(0,19).replace(/[T:]/g,'-');
        await window.electronAPI.savePdfFile({
          base64: b64, filename: `${kind.toUpperCase()}_${stamp}.pdf`, folderPath: folder,
        });
      }
    }

    // Email a copy
    const to = cfg.shift_records_recipients || cfg.email_recipients_sales || '';
    if (to && typeof EmailAPI !== 'undefined' && EmailAPI.send) {
      await EmailAPI.send({
        to, subject: `${tpl.title} — ${name} — ${now.toLocaleDateString('en-CA')}`,
        htmlBody: html, textBody: tpl.title + ' completed ' + now.toLocaleString('en-CA'),
      }).catch(()=>{});
    }
  }

  return { show, TEMPLATES, eligibleDefaultItems, itemId };
})();
