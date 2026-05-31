/* ============================================================
   tax.js — GST / PST calculations
   Rates are loaded from Config at startup via Tax.loadRates().
   Defaults to BC rates: GST 5%, PST 7%.
   ============================================================ */

const Tax = (() => {
  let _gstEnabled = true;
  let _gstRate    = 0.05;
  let _pstEnabled = true;
  let _pstRate    = 0.07;

  async function loadRates() {
    try {
      const gstEn   = await Config.get('tax_gst_enabled');
      const gstRate = await Config.get('tax_gst_rate');
      const pstEn   = await Config.get('tax_pst_enabled');
      const pstRate = await Config.get('tax_pst_rate');

      _gstEnabled = gstEn   !== 'false';
      _gstRate    = parseFloat(gstRate) > 0 ? parseFloat(gstRate) / 100 : 0.05;
      _pstEnabled = pstEn   !== 'false';
      _pstRate    = parseFloat(pstRate) > 0 ? parseFloat(pstRate) / 100 : 0.07;
    } catch (_) {
      // Config not yet unlocked; keep defaults
    }
  }

  function gstRate()    { return _gstRate; }
  function pstRate()    { return _pstRate; }
  function gstEnabled() { return _gstEnabled; }
  function pstEnabled() { return _pstEnabled; }

  function round2(n) { return Math.round(n * 100) / 100; }

  function calcItemTax(unitPrice, quantity, gstApplicable, pstApplicable) {
    const subtotal = round2(unitPrice * quantity);
    const gst = (gstApplicable && _gstEnabled) ? round2(subtotal * _gstRate) : 0;
    const pst = (pstApplicable && _pstEnabled) ? round2(subtotal * _pstRate) : 0;
    return { subtotal, gst, pst, total: round2(subtotal + gst + pst) };
  }

  function calcCartTotals(items) {
    let subtotal = 0, gst = 0, pst = 0;
    for (const item of items) {
      const t = calcItemTax(item.unit_price, item.quantity, item.gst_applicable, item.pst_applicable);
      subtotal += t.subtotal;
      gst      += t.gst;
      pst      += t.pst;
    }
    return {
      subtotal:     round2(subtotal),
      gst_amount:   round2(gst),
      pst_amount:   round2(pst),
      total_amount: round2(subtotal + gst + pst),
    };
  }

  function fmt(n) {
    return '$' + (Number(n) || 0).toFixed(2);
  }

  return { loadRates, gstRate, pstRate, gstEnabled, pstEnabled, calcItemTax, calcCartTotals, fmt, round2 };
})();

/* ── Date helpers (local time, not UTC) ──────────────────────────────
   Use these everywhere instead of new Date().toISOString() so that
   SQLite date() comparisons and date-picker defaults reflect the
   system clock, not the UTC offset.
   ------------------------------------------------------------------ */

/** Returns today's date as "YYYY-MM-DD" in local time. */
function localDateStr(d) {
  const dt = d instanceof Date ? d : new Date();
  const p = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** Returns an ISO-8601 timestamp in local time (no UTC offset).
 *  SQLite's date() / datetime() functions treat these as local. */
function localISOStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
