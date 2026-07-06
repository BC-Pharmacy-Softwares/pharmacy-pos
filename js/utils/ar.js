/* ============================================================
   utils/ar.js — Accounts Receivable reconciliation engine.

   Patient AR = copay billed (WinRx) − collected (POS + manual entries).
     billed  : sum of REFILL.RECOPAY from WinRx (via PharmacyDashboardAPI)
     paid    : DB.getPosPaidForPatient + DB.getArManualPaid
     owing   : billed − paid, allocated OLDEST-FIRST across billed fills
   Insurance never enters here — RECOPAY is always the patient's portion.
   ============================================================ */

const AR = (() => {

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function ageDays(d) { return d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0; }
  function bucketOf(days) {
    return days <= 30 ? 'd0_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus';
  }

  /* Reconcile one patient.
     patient = { patient_id, phn }
     opts.cutoff = ISO date string — ignore fills billed before it (pre-POS history). */
  async function getPatientAR(patient, opts = {}) {
    const cutoff = opts.cutoff ? new Date(opts.cutoff) : null;
    const asOf   = opts.asOf   ? new Date(opts.asOf)   : null;

    // ── Billed (WinRx) ──
    let fills = [];
    try {
      const profile = await PharmacyDashboardAPI.getPatientProfile(patient.phn);
      fills = (profile || [])
        .map(r => ({
          rxNumber: String(r.RXNUM || r.rxNumber || ''),
          copay:    parseFloat(r.RECOPAY || r.copay || 0) || 0,
          fillDate: r.REEFDATE || r.fillDate || null,
        }))
        .filter(f => f.copay > 0
          && (!cutoff || (f.fillDate && new Date(f.fillDate) >= cutoff))
          && (!asOf   || (f.fillDate && new Date(f.fillDate) <= asOf)))
        .sort((a, b) => new Date(a.fillDate || 0) - new Date(b.fillDate || 0)); // oldest first
    } catch (e) {
      return { error: 'WinRx unavailable: ' + e.message, patient_id: patient.patient_id, phn: patient.phn };
    }

    // ── Group billed by Rx# (sum copays per Rx; keep the oldest fill date) ──
    const byRx = {};
    fills.forEach(f => {
      if (!byRx[f.rxNumber]) byRx[f.rxNumber] = { rxNumber: f.rxNumber, billed: 0, fillDate: f.fillDate };
      byRx[f.rxNumber].billed = round2(byRx[f.rxNumber].billed + f.copay);
      if (f.fillDate && (!byRx[f.rxNumber].fillDate || new Date(f.fillDate) < new Date(byRx[f.rxNumber].fillDate)))
        byRx[f.rxNumber].fillDate = f.fillDate;
    });
    const rxList = Object.values(byRx).sort((a, b) => new Date(a.fillDate || 0) - new Date(b.fillDate || 0));
    const billed = round2(rxList.reduce((s, r) => s + r.billed, 0));

    // ── Paid sources, bounded by the as-of date ──
    const posByRx = patient.patient_id ? DB.getPosRxPaidByRx(patient.patient_id, opts.asOf || null) : {};
    const posPaid = patient.patient_id ? DB.getPosRxPaidAmount(patient.patient_id, opts.asOf || null) : 0;
    const entries = (patient.patient_id ? DB.getArEntries(patient.patient_id) : [])
      .filter(e => !asOf || (e.entry_date && new Date(e.entry_date) <= asOf));
    const targetedByRx = {};
    let untargetedManual = 0;
    let manualPaid = 0;
    entries.forEach(e => {
      manualPaid += e.amount;
      if (e.rx_number) targetedByRx[String(e.rx_number)] = (targetedByRx[String(e.rx_number)] || 0) + e.amount;
      else untargetedManual += e.amount;
    });

    // ── Per-Rx: apply POS-collected + Rx-targeted manual to that Rx first ──
    let pool = untargetedManual;
    const perRx = rxList.map(r => {
      const directPaid = (posByRx[r.rxNumber] || 0) + (targetedByRx[r.rxNumber] || 0);
      let paidRx = directPaid;
      if (paidRx > r.billed) { pool += round2(paidRx - r.billed); paidRx = r.billed; }
      return { rxNumber: r.rxNumber, fillDate: r.fillDate, billed: r.billed, paid: round2(paidRx), owing: round2(r.billed - paidRx) };
    });
    // ── Untargeted manual pool covers remaining balances oldest-first ──
    for (const r of perRx) {
      if (r.owing <= 0) continue;
      if (pool >= r.owing) { pool = round2(pool - r.owing); r.paid = round2(r.paid + r.owing); r.owing = 0; }
      else { r.paid = round2(r.paid + pool); r.owing = round2(r.owing - pool); pool = 0; }
    }

    const outstanding = perRx.filter(r => r.owing > 0.005);
    const owing  = round2(outstanding.reduce((s, r) => s + r.owing, 0));
    const paid   = round2(billed - owing);
    const credit = pool > 0 ? round2(pool) : 0;  // overpayment → credit on account

    // ── Aging by fill date ──
    const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    outstanding.forEach(r => { aging[bucketOf(ageDays(r.fillDate))] += r.owing; });
    Object.keys(aging).forEach(k => { aging[k] = round2(aging[k]); });

    return {
      patient_id: patient.patient_id, phn: patient.phn,
      billed, paid, posPaid: round2(posPaid), manualPaid: round2(manualPaid),
      owing, credit, outstanding, perRx, aging, fills,
    };
  }

  /* Patient statement = billed fills (debits) + manual entries (credits) in date
     order with a running balance. Privacy-safe: shows "Rx #", never the drug name. */
  async function getStatement(patient, opts = {}) {
    const ar = await getPatientAR(patient, opts);
    if (ar.error) return ar;
    const lines = [];
    ar.fills.forEach(f => lines.push({
      date: f.fillDate, kind: 'charge', label: `Rx #${f.rxNumber}`, debit: f.copay, credit: 0,
    }));
    DB.getArEntries(patient.patient_id).forEach(e => lines.push({
      date: e.entry_date, kind: e.entry_type,
      label: _entryLabel(e), debit: 0, credit: e.amount,
    }));
    lines.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    let bal = 0;
    lines.forEach(l => { bal = round2(bal + l.debit - l.credit); l.balance = bal; });
    return { ...ar, lines };
  }

  /* Dashboard: every patient who owes (billed − paid > 0), across the whole pharmacy.
     One grouped WinRx query for billed; local POS + manual for paid. */
  async function getAROutstandingAll(opts = {}) {
    const cutoff = opts.cutoff || '';
    const asOf   = opts.asOf   || '';
    let billedList;
    try {
      billedList = await PharmacyDashboardAPI.getAllBilled(cutoff, asOf);
    } catch (e) {
      return { error: 'WinRx unavailable: ' + e.message, totalOutstanding: 0, count: 0, rows: [] };
    }
    const rows = [];
    const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    let totalOutstanding = 0;
    let unmatched = 0;
    for (const b of (billedList || [])) {
      const phn       = String(b.PHN || '').trim();
      const patient   = phn ? DB.getPatientByPhn(phn) : null;
      const pid       = patient ? patient.patient_id : null;
      // Fast local pass (Rx copays collected + manual) to skip fully-paid patients.
      const posPaid   = pid ? DB.getPosRxPaidAmount(pid, asOf || null) : 0;
      const manualPaid= pid ? DB.getArManualPaid(pid, asOf || null) : 0;
      const owingFast = round2((Number(b.billed) || 0) - posPaid - manualPaid);
      if (owingFast <= 0.005) continue;

      const row = {
        phn, patient_id: pid,
        acct: patient ? (patient.ar_account_no || '') : '',
        name: patient ? `${patient.given_name || ''} ${patient.surname || ''}`.trim() : phn,
        billed: round2(b.billed), paid: round2(posPaid + manualPaid), owing: owingFast, fills: b.fills || 0,
        aging: { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
      };
      // Aging only for the (small) owing set → per-patient WinRx reconcile.
      if (opts.withAging !== false && pid) {
        try {
          const pa = await getPatientAR({ patient_id: pid, phn }, { cutoff, asOf });
          if (pa && !pa.error && pa.aging) {
            row.owing = pa.owing; row.paid = pa.paid; row.aging = pa.aging;
            Object.keys(aging).forEach(k => { aging[k] += pa.aging[k] || 0; });
          } else unmatched += owingFast;
        } catch (_) { unmatched += owingFast; }
      } else { unmatched += owingFast; }
      rows.push(row);
      totalOutstanding += row.owing;
    }
    Object.keys(aging).forEach(k => { aging[k] = round2(aging[k]); });
    rows.sort((a, b) => b.owing - a.owing);
    return { totalOutstanding: round2(totalOutstanding), count: rows.length, rows, aging, unmatched: round2(unmatched) };
  }

  /* Year-end AR package as of the fiscal year-end date. Reuses the dashboard
     reconciliation (which already computes aging for owing patients). */
  async function getYearEndAR(opts = {}) {
    const cutoff = opts.cutoff || '';
    const fyEnd  = opts.fyEnd  || '';
    const dash = await getAROutstandingAll({ cutoff, asOf: fyEnd });
    if (dash.error) return { error: dash.error };
    return { asOf: fyEnd, totalOutstanding: dash.totalOutstanding, count: dash.count,
             rows: dash.rows, aging: dash.aging, unmatched: dash.unmatched };
  }

  function _entryLabel(e) {
    const t = { payment: 'Payment', write_off: 'Bad-debt write-off', correction: 'Correction', credit: 'Credit' }[e.entry_type] || 'Adjustment';
    const m = e.method ? ` (${e.method}${e.reference ? ' #' + e.reference : ''})` : '';
    return t + m;
  }

  return { getPatientAR, getStatement, getAROutstandingAll, getYearEndAR, round2 };
})();
