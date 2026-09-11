/* ============================================================
   utils/ar.js — Accounts Receivable reconciliation engine.

   Owing = copay BILLED in WinRx − copay COLLECTED at the till
           + non-Rx items CHARGED to the account − manual payments/credits.

   Rules (1.4.9 — each one fixed a way money was being mis-credited):
   • Collected means money actually taken. A sale paid with the "AR (Account)"
     button collected nothing: its Rx copays stay owing, and its other items
     (OTC, tax) become a charge on the account. A refund inherits the payment
     mix of the sale it refunds.
   • A copay belongs to whoever owns that Rx in WinRx — not whoever the sale was
     linked to (a parent picking up a child's Rx), and even if no one was.
   • Rx numbers compare without padding / leading zeros; PHNs without spaces.
   • Every billed fill counts — no row cap (the POS pick list stops at 60).
   • POS money that matches no billed fill is never dropped: it becomes credit.
   • The patient page, statements and the dashboard all run _reconcile(), so
     they cannot disagree.
   Insurance never enters here — RECOPAY is always the patient's portion.
   ============================================================ */

const AR = (() => {

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  const dateOnly = v => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
  const todayStr = () => (typeof localDateStr === 'function' ? localDateStr() : new Date().toISOString().slice(0, 10));
  const ZERO_AGING = () => ({ d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 });

  function ageDays(d, asOf) {
    if (!d) return 0;
    const end = asOf ? new Date(asOf + 'T00:00:00') : new Date();
    return Math.max(0, Math.floor((end - new Date(d + 'T00:00:00')) / 86400000));
  }
  function bucketOf(days) {
    return days <= 30 ? 'd0_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus';
  }

  /* Rx "0050005", "50005", 50005.0 → "50005". Non-numeric references just trimmed. */
  function normRx(v) {
    const t = String(v ?? '').trim();
    return /^\d+(\.0+)?$/.test(t) ? String(parseInt(t, 10)) : t.toUpperCase();
  }
  /* "9876 543 210", "9876543210   " → "9876543210" */
  function normPhn(v) { return String(v ?? '').replace(/[\s-]/g, '').toUpperCase(); }

  function _ownerMap(o) {
    const m = {};
    Object.entries(o || {}).forEach(([rx, phn]) => { if (phn) m[normRx(rx)] = normPhn(phn); });
    return m;
  }

  /* Share (0–1) of a sale's total that was actually collected. Charged to the
     account (method AR) or left unpaid is not collected. */
  function cashShare(t, mixOf, depth = 0) {
    if (!t) return 1;
    if (String(t.transaction_type || '').toUpperCase() === 'REFUND') {
      const m = /Refund for Txn #(\d+)/.exec(t.notes || '');
      return m && depth < 3 ? cashShare(mixOf(parseInt(m[1], 10)), mixOf, depth + 1) : 1;
    }
    const total = Number(t.total_amount) || 0;
    if (total <= 0.005) return 1;                 // $0 / no-charge sale: nothing left owing from it
    return Math.max(0, Math.min(1, (Number(t.paid_other) || 0) / total));
  }

  /* POS facts for a date window, shaped for reconciliation. */
  function _posData(cutoff, asOf) {
    const raw  = DB.getArPosData(cutoff || null, asOf || null);
    const byId = {};
    raw.txns.forEach(t => { byId[t.transaction_id] = t; });
    const extra = {};
    const mixOf = id => byId[id] || (id in extra ? extra[id] : (extra[id] = DB.getTxnPaymentMix(id)));
    const share = {};
    raw.txns.forEach(t => { share[t.transaction_id] = cashShare(t, mixOf); });

    const lines = raw.lines.map(l => {
      const t = byId[l.transaction_id] || {};
      return {
        rx: l.rx_number == null ? '' : normRx(l.rx_number),
        settled: round2((Number(l.line_total) || 0) * (share[l.transaction_id] ?? 1)),
        txnId: l.transaction_id, patientId: t.patient_id || null, date: dateOnly(t.transaction_date),
      };
    }).filter(l => Math.abs(l.settled) > 0.005);

    // The non-Rx part of a sale (OTC, tax…) that was charged to the account or left
    // unpaid is owed by the linked patient. (Rx copays need no charge line — WinRx
    // already bills them; they simply stay uncollected.)
    const charges = [];
    raw.txns.forEach(t => {
      if (!t.patient_id) return;
      const nonRx = (Number(t.total_amount) || 0) - (Number(t.rx_total) || 0);
      const owed  = round2(nonRx * (1 - share[t.transaction_id]));
      if (Math.abs(owed) > 0.005) charges.push({ patientId: t.patient_id, key: 'TXN#' + t.transaction_id,
        txnId: t.transaction_id, date: dateOnly(t.transaction_date), amount: owed });
    });
    return { lines, charges };
  }

  /* Whose copay is this? The Rx's owner in WinRx; failing that, whoever the sale
     was linked to; failing that, nobody (reported as unattributed). */
  function _ownerKey(line, ownerOf, keyOfPatient) {
    if (line.rx) { const o = ownerOf(line.rx); if (o) return o; }
    return line.patientId ? (keyOfPatient(line.patientId) || null) : null;
  }

  /* THE reconciliation — behind the patient page, statements and the dashboard.
     fills:   [{ rx, copay, fillDate, count? }]  billed in WinRx
     credits: [{ rx, settled, date, txnId }]      POS money attributed to this patient
     charges: [{ key, txnId, date, amount }]      non-Rx items charged / left unpaid
     entries: ar_entries rows                     manual payments, credits, write-offs */
  function _reconcile({ fills, credits, charges, entries, asOf }) {
    const items = {};
    fills.forEach(f => {
      const it = items[f.rx] || (items[f.rx] = { key: f.rx, rxNumber: f.rx, label: `Rx #${f.rx}`, kind: 'rx', fillDate: f.fillDate, billed: 0 });
      it.billed = round2(it.billed + f.copay);
      if (f.fillDate && (!it.fillDate || f.fillDate < it.fillDate)) it.fillDate = f.fillDate;
    });

    let pool = 0;                                   // unapplied money → covers oldest balances, rest is credit
    charges.forEach(c => {
      if (c.amount > 0) items[c.key] = { key: c.key, rxNumber: c.key, label: `Charged to account — Txn #${c.txnId}`,
                                         kind: 'charge', fillDate: c.date, billed: round2(c.amount) };
      else pool = round2(pool - c.amount);          // refund of an account charge
    });

    const direct = {};
    let posPaid = 0, manualPaid = 0;
    credits.forEach(c => {
      posPaid = round2(posPaid + c.settled);
      if (c.rx && items[c.rx] && items[c.rx].kind === 'rx') direct[c.rx] = round2((direct[c.rx] || 0) + c.settled);
      else pool = round2(pool + c.settled);         // paid for an Rx with nothing billed now → credit, never dropped
    });
    entries.forEach(e => {
      const amt = Number(e.amount) || 0;
      manualPaid = round2(manualPaid + amt);
      const k = e.rx_number ? normRx(e.rx_number) : '';
      if (k && items[k]) direct[k] = round2((direct[k] || 0) + amt);
      else pool = round2(pool + amt);
    });

    const perRx = Object.values(items)
      .sort((a, b) => String(a.fillDate || '').localeCompare(String(b.fillDate || '')))
      .map(it => {
        let p = direct[it.key] || 0;
        if (p > it.billed) { pool = round2(pool + p - it.billed); p = it.billed; }
        if (p < 0)         { pool = round2(pool + p); p = 0; }
        return { ...it, paid: round2(p), owing: round2(it.billed - p) };
      });
    if (pool < -0.005) {                            // more refunded at the till than collected in this window
      perRx.push({ key: 'ADJ', rxNumber: 'ADJ', label: 'Refunded at the till', kind: 'adjustment',
                   fillDate: asOf || todayStr(), billed: round2(-pool), paid: 0, owing: round2(-pool) });
      pool = 0;
    }
    for (const r of perRx) {
      if (pool <= 0.005) break;
      if (r.owing <= 0) continue;
      const use = Math.min(pool, r.owing);
      r.paid = round2(r.paid + use); r.owing = round2(r.owing - use); pool = round2(pool - use);
    }

    const outstanding = perRx.filter(r => r.owing > 0.005);
    const billed = round2(perRx.reduce((s, r) => s + r.billed, 0));
    const owing  = round2(outstanding.reduce((s, r) => s + r.owing, 0));
    const aging  = ZERO_AGING();
    outstanding.forEach(r => { aging[bucketOf(ageDays(r.fillDate, asOf))] += r.owing; });
    Object.keys(aging).forEach(k => { aging[k] = round2(aging[k]); });
    return {
      billed, paid: round2(billed - owing), posPaid, manualPaid, owing,
      credit: round2(Math.max(0, pool)), outstanding, perRx, aging,
      fillCount: fills.reduce((s, f) => s + (f.count || 1), 0),
    };
  }

  /* Every local record for a PHN — a hand-typed "9876 543 210" and the WinRx
     record are the same person. */
  function _localIds(patient, key) {
    const ids = new Set(DB.getPatientsForAR().filter(p => normPhn(p.phn) === key).map(p => p.patient_id));
    if (patient.patient_id) ids.add(patient.patient_id);
    return ids;
  }

  /* Reconcile one patient. patient = { patient_id, phn }
     opts.cutoff = ignore anything before this date (pre-POS history); opts.asOf = balance on that date. */
  async function getPatientAR(patient, opts = {}) {
    const cutoff = opts.cutoff || '', asOf = opts.asOf || '';
    const key = normPhn(patient.phn);
    let w;
    try { w = await PharmacyDashboardAPI.getPatientBilled(key, cutoff, asOf); }
    catch (e) { return { error: 'WinRx unavailable: ' + e.message, patient_id: patient.patient_id, phn: patient.phn }; }

    const fills = (w?.fills || [])
      .map(f => ({ rx: normRx(f.RXNUM), copay: Number(f.RECOPAY) || 0, fillDate: dateOnly(f.REEFDATE) }))
      .filter(f => f.copay > 0);
    const owned = new Set((w?.rxNumbers || []).map(normRx));
    fills.forEach(f => owned.add(f.rx));
    const ids = _localIds(patient, key);
    const pos = _posData(cutoff, asOf);

    // Rx on this patient's sales that WinRx doesn't list as theirs — whose are they?
    const ask = [...new Set(pos.lines.filter(l => l.rx && ids.has(l.patientId) && !owned.has(l.rx)).map(l => l.rx))];
    let others = {};
    if (ask.length) {
      try { others = _ownerMap(await PharmacyDashboardAPI.getRxOwners(ask)); }
      catch (_) { /* unknown owner → stays with the linked patient */ }
    }
    const ownerOf = rx => (owned.has(rx) ? key : others[rx]);
    const keyOf   = id => (ids.has(id) ? key : 'OTHER');
    const credits = pos.lines.filter(l => _ownerKey(l, ownerOf, keyOf) === key);
    const charges = pos.charges.filter(c => ids.has(c.patientId));
    const entries = [...ids].flatMap(id => DB.getArEntries(id)).filter(e => !asOf || dateOnly(e.entry_date) <= asOf);

    const r = _reconcile({ fills, credits, charges, entries, asOf });
    return {
      patient_id: patient.patient_id, phn: patient.phn, ...r,
      fills: fills.map(f => ({ rxNumber: f.rx, copay: f.copay, fillDate: f.fillDate })),
      _detail: { credits, charges, entries },
    };
  }

  /* Patient statement: every charge and payment in date order with a running
     balance — it ends at exactly (owing − credit). Privacy-safe: "Rx #", never the drug. */
  async function getStatement(patient, opts = {}) {
    const ar = await getPatientAR(patient, opts);
    if (ar.error) return ar;
    const { credits, charges, entries } = ar._detail;
    const lines = [];
    ar.fills.forEach(f => lines.push({ date: f.fillDate, kind: 'charge', label: `Rx #${f.rxNumber}`, debit: f.copay, credit: 0 }));
    charges.forEach(c => lines.push(c.amount > 0
      ? { date: c.date, kind: 'charge', label: `Charged to account — Txn #${c.txnId}`, debit: c.amount, credit: 0 }
      : { date: c.date, kind: 'credit', label: `Account charge refunded — Txn #${c.txnId}`, debit: 0, credit: -c.amount }));
    credits.forEach(c => lines.push(c.settled >= 0
      ? { date: c.date, kind: 'payment', label: `Paid at the till${c.rx ? ' — Rx #' + c.rx : ''} (Txn #${c.txnId})`, debit: 0, credit: c.settled }
      : { date: c.date, kind: 'refund',  label: `Refunded at the till${c.rx ? ' — Rx #' + c.rx : ''} (Txn #${c.txnId})`, debit: -c.settled, credit: 0 }));
    entries.forEach(e => lines.push({ date: dateOnly(e.entry_date), kind: e.entry_type, label: _entryLabel(e), debit: 0, credit: Number(e.amount) || 0 }));
    lines.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    let bal = 0;
    lines.forEach(l => { bal = round2(bal + l.debit - l.credit); l.balance = bal; });
    return { ...ar, lines };
  }

  /* Dashboard: everyone who owes. One WinRx query for billed, one for the owners of
     Rx sold at the POS, then the SAME _reconcile() per patient as their own page. */
  async function getAROutstandingAll(opts = {}) {
    const cutoff = opts.cutoff || '', asOf = opts.asOf || '';
    let billedRows;
    try { billedRows = await PharmacyDashboardAPI.getAllBilledByRx(cutoff, asOf); }
    catch (e) { return { error: 'WinRx unavailable: ' + e.message, totalOutstanding: 0, count: 0, rows: [], aging: ZERO_AGING(), unmatched: 0, unattributed: 0 }; }

    const fillsBy = {}, owner = {}, winrxPhn = {};
    (billedRows || []).forEach(r => {
      const k = normPhn(r.PHN) || '(NO PHN)', rx = normRx(r.RXNUM);
      owner[rx] = k; winrxPhn[k] = String(r.PHN || '').trim() || '(no PHN in WinRx)';
      (fillsBy[k] = fillsBy[k] || []).push({ rx, copay: Number(r.Billed) || 0, fillDate: dateOnly(r.FirstFill), count: r.Fills || 1 });
    });

    const pos = _posData(cutoff, asOf);
    const unknown = [...new Set(pos.lines.map(l => l.rx).filter(rx => rx && !(rx in owner)))];
    let others = {};
    if (unknown.length) { try { others = _ownerMap(await PharmacyDashboardAPI.getRxOwners(unknown)); } catch (_) {} }
    const ownerOf = rx => owner[rx] || others[rx];

    const keyById = {}, localBy = {};
    DB.getPatientsForAR().forEach(p => {
      const k = normPhn(p.phn); keyById[p.patient_id] = k; (localBy[k] = localBy[k] || []).push(p);
    });
    const keyOf = id => keyById[id] || null;

    const creditsBy = {}, chargesBy = {}, entriesBy = {};
    let unattributed = 0;
    pos.lines.forEach(l => {
      const k = _ownerKey(l, ownerOf, keyOf);
      if (k) (creditsBy[k] = creditsBy[k] || []).push(l); else unattributed = round2(unattributed + l.settled);
    });
    pos.charges.forEach(c => { const k = keyOf(c.patientId); if (k) (chargesBy[k] = chargesBy[k] || []).push(c); });
    DB.getArEntriesAll().forEach(e => {
      const k = keyOf(e.patient_id);
      if (!k || (asOf && dateOnly(e.entry_date) > asOf)) return;
      (entriesBy[k] = entriesBy[k] || []).push(e);
    });

    const rows = [], aging = ZERO_AGING();
    let total = 0, unmatched = 0;
    for (const k of new Set([...Object.keys(fillsBy), ...Object.keys(chargesBy)])) {
      const r = _reconcile({ fills: fillsBy[k] || [], credits: creditsBy[k] || [], charges: chargesBy[k] || [], entries: entriesBy[k] || [], asOf });
      if (r.owing <= 0.005) continue;
      const locals = localBy[k] || [];
      const p = locals.find(x => x.ar_account_no) || locals.find(x => String(x.phn).trim() === winrxPhn[k]) || locals[0] || null;
      const shownPhn = p ? String(p.phn).trim() : (winrxPhn[k] || k);
      rows.push({
        phn: shownPhn, patient_id: p ? p.patient_id : null, acct: p ? (p.ar_account_no || '') : '',
        name: (p && `${p.given_name || ''} ${p.surname || ''}`.trim()) || shownPhn,
        billed: r.billed, paid: r.paid, owing: r.owing, credit: r.credit, fills: r.fillCount, aging: r.aging,
      });
      total += r.owing;
      Object.keys(aging).forEach(a => { aging[a] += r.aging[a]; });
      if (!p) unmatched += r.owing;
    }
    Object.keys(aging).forEach(a => { aging[a] = round2(aging[a]); });
    rows.sort((a, b) => b.owing - a.owing);
    return { totalOutstanding: round2(total), count: rows.length, rows, aging,
             unmatched: round2(unmatched), unattributed: round2(unattributed) };
  }

  /* POS-only balance — instant, and the fallback when WinRx can't be reached: what
     was charged to the account or left unpaid at the till, minus manual payments. */
  function posEstimate(patient) {
    const ids = _localIds(patient, normPhn(patient.phn));
    const raw = DB.getArPosData(null, null);
    const byId = {};
    raw.txns.forEach(t => { byId[t.transaction_id] = t; });
    const extra = {};
    const mixOf = id => byId[id] || (id in extra ? extra[id] : (extra[id] = DB.getTxnPaymentMix(id)));
    let sold = 0, collected = 0;
    raw.txns.filter(t => ids.has(t.patient_id)).forEach(t => {
      const tot = Number(t.total_amount) || 0;
      sold += tot; collected += tot * cashShare(t, mixOf);
    });
    const manual = [...ids].flatMap(id => DB.getArEntries(id)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const owing = round2(Math.max(0, sold - collected - manual));
    return { billed: round2(sold), paid: round2(collected + manual), owing, outstanding: owing };
  }

  /* Year-end AR package as of the fiscal year-end date. */
  async function getYearEndAR(opts = {}) {
    const dash = await getAROutstandingAll({ cutoff: opts.cutoff || '', asOf: opts.fyEnd || '' });
    if (dash.error) return { error: dash.error };
    return { asOf: opts.fyEnd || '', totalOutstanding: dash.totalOutstanding, count: dash.count,
             rows: dash.rows, aging: dash.aging, unmatched: dash.unmatched };
  }

  function _entryLabel(e) {
    const t = { payment: 'Payment', write_off: 'Bad-debt write-off', correction: 'Correction', credit: 'Credit' }[e.entry_type] || 'Adjustment';
    const m = e.method ? ` (${e.method}${e.reference ? ' #' + e.reference : ''})` : '';
    return t + m;
  }

  return { getPatientAR, getStatement, getAROutstandingAll, getYearEndAR, posEstimate, round2, normRx, normPhn };
})();
