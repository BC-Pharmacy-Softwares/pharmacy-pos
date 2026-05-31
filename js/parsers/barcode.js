/* ============================================================
   barcode.js — Rx barcode parsing
   Multiple parser profiles; active profile set in config.

   parse() returns:
     { rxNumber, branchCode }           — normal Rx, do API lookup
     { rxNumber, branchCode, price }    — Positec-style, price embedded in barcode
     null                               — not an Rx barcode for this profile
   ============================================================ */

const BarcodeParser = (() => {

  /* Each profile: parse(raw) → { rxNumber, branchCode[, price] } | null */
  const PROFILES = {

    /* ProPharm Old: "A53817" or "53817A" or pure digits.
       Branch code = single alpha character. */
    'ProPharm Old': function(raw) {
      raw = raw.trim();
      let m = raw.match(/^([A-Za-z])(\d+)$/);
      if (m) return { branchCode: m[1].toUpperCase(), rxNumber: m[2] };
      m = raw.match(/^(\d+)([A-Za-z])$/);
      if (m) return { branchCode: m[2].toUpperCase(), rxNumber: m[1] };
      m = raw.match(/^(\d+)$/);
      if (m) return { branchCode: null, rxNumber: m[1] };
      return null;
    },

    /* ProPharm New: "RX-NNNNN-B" or "NNNNN-B" */
    'ProPharm New': function(raw) {
      raw = raw.trim().replace(/^RX-?/i, '');
      const m = raw.match(/^(\d+)-([A-Za-z])$/);
      if (m) return { rxNumber: m[1], branchCode: m[2].toUpperCase() };
      const m2 = raw.match(/^(\d+)$/);
      if (m2) return { rxNumber: m2[1], branchCode: null };
      return null;
    },

    /* Positec Old: 1–3 leading letters + digits, last 7 digits = copay in cents.
       Example: K01478720010866
         → prefix  K0147872   (reference / Rx number area)
         → price   0010866    → 10866 ÷ 100 = $108.66
       The prefix encoding is proprietary; we extract price automatically and
       use the digit portion of the prefix as the Rx reference number. */
    'Positec Old': function(raw) {
      raw = raw.trim();
      // Must start with 1–3 letters then at least 8+ digits (7 price + ≥1 ref)
      const m = raw.match(/^([A-Za-z]{1,3})(\d{8,})$/);
      if (!m) return null;
      const allDigits  = m[2];
      const priceStr   = allDigits.slice(-7);          // last 7 digits
      const refDigits  = allDigits.slice(0, -7);       // everything before price
      const price      = parseInt(priceStr, 10) / 100; // cents → dollars
      // Use the digit portion of prefix as Rx reference (best we can do without decoding)
      const rxNumber   = refDigits || allDigits;
      return { rxNumber, branchCode: null, price };
    },

    /* WinRx Other: EAN-13 in-store format — 13 digits starting with "20"
       Structure: 20 + RRRRR (Rx, 5 digits) + PPPPP (price cents, 5 digits) + C (check digit)
       Example: 2057560026109
         → prefix  20
         → rxNum   57560
         → price   02610 → $26.10
         → check   9  (ignored)
       Branch code comes from Settings (branch_code config). */
    'WinRx Other': function(raw) {
      raw = raw.trim();
      const m = raw.match(/^20(\d{5})(\d{5})\d$/);
      if (!m) return null;
      const rxNumber = m[1].replace(/^0+/, '') || m[1]; // strip leading zeros
      const price    = parseInt(m[2], 10) / 100;         // cents → dollars
      return { rxNumber, branchCode: null, price };
    },

    /* Generic: extract any digit sequence, first alpha as branch */
    'Generic': function(raw) {
      raw = raw.trim();
      const digits = raw.match(/\d+/)?.[0] || null;
      const alpha  = raw.match(/[A-Za-z]/)?.[0]?.toUpperCase() || null;
      if (digits) return { rxNumber: digits, branchCode: alpha };
      return null;
    },
  };

  function getProfileNames() { return Object.keys(PROFILES); }

  async function parse(raw, profileName) {
    if (!raw) return null;
    const profile = profileName || await Config.get('barcode_profile') || 'ProPharm Old';
    const fn = PROFILES[profile] || PROFILES['ProPharm Old'];
    const result = fn(raw);
    if (result && !result.branchCode) {
      result.branchCode = await Config.get('branch_code') || 'A';
    }
    return result;
  }

  /* Quick check: does this barcode look like any Rx format?
     Also catches Positec (letter-prefix + many digits). */
  function looksLikeRx(raw) {
    if (!raw) return false;
    raw = raw.trim();
    // Standard short Rx: optional alpha, 4–8 digits, optional alpha
    if (/^[A-Za-z]?\d{4,8}[A-Za-z]?$/.test(raw)) return true;
    // Positec-style: 1–3 letters then 8+ digits (e.g. K01478720010866)
    if (/^[A-Za-z]{1,3}\d{8,}$/.test(raw)) return true;
    // WinRx Other: 13-digit EAN-13 starting with 20
    if (/^20\d{11}$/.test(raw)) return true;
    return false;
  }

  return { parse, getProfileNames, looksLikeRx };
})();
