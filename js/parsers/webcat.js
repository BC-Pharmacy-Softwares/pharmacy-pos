/* ============================================================
   webcat.js — McKesson PharmaClik WEBCAT Version 6 flat-file parser

   Layout: "Version 6 — General and Regular Pricing File Format",
   Third-Party System Integration Document (Nov 2021) §2.4.2.1.
   Positions below are 1-based inclusive, exactly as printed in the spec.

   A catalogue file may contain MORE THAN ONE record format (spec §2.4.2.1
   "Record ID"):
     'P' = product record  (396 chars)
     'S' = specials / promotions record (345 chars, §2.4.2.2 — different layout)
   Only 'P' records are products. Parsing an 'S' record as a product used to
   overwrite the real product row with promotion fields, blanking its DIN,
   GTIN and prices — see CLAUDE.md 1.4.10.
   ============================================================ */

const WebcatParser = (() => {

  const PRODUCT_LEN = 396;   // length of a complete 'P' record
  const REC_PRODUCT = 'P';
  const REC_SPECIAL = 'S';

  /* Field definitions from the spec (1-based, inclusive) */
  const FIELDS = {
    record_id:           [1,     1],
    item_no:             [2,     7],
    description:         [8,    57],
    last_update:         [58,   65],
    family_group:        [91,   94],
    drug_caution:        [95,  102],
    narcotic_indicator:  [103, 103],
    upc_package:         [104, 104],
    upc_vendor:          [105, 111],
    upc_product_unit:    [112, 116],
    din:                 [127, 134],
    product_format:      [135, 143],
    strength:            [153, 162],
    product_form:        [163, 177],
    generic_desc:        [184, 213],
    gst_indicator:       [230, 230],
    pst_indicator:       [231, 231],
    // "Regular Unit Price" is the unit COST price for this customer
    // (spec §2.4.2.1 recording details) — NOT a retail price.
    regular_unit_price:  [239, 245],   // 7,2
    suggested_retail:    [332, 338],   // 7,2
    product_status:      [352, 352],   // A = available, D = disco by mfr, T = disco by distributor
    unit_modality:       [353, 353],
    gtin_unit:           [355, 368],
    gtin_pack:           [369, 382],
    gtin_case:           [383, 396],
  };

  /* 1-based inclusive -> 0-based substring. `shift` handles a file whose
     record-ID column has been stripped: every field then starts one character
     earlier. Short lines yield '' rather than a wrong value, and the caller
     decides whether that is acceptable. */
  function _extract(line, start, end, shift = 0) {
    const from = start + shift;
    if (from < 1 || line.length < from) return '';
    return line.substring(from - 1, end + shift).trim();
  }

  /* WEBCAT prices are "7,2" — 7 characters with 2 implied decimals.
     "0001250" = 12.50. Absent prices are zero-filled, which is NOT the same
     as a genuine price of 0.00, so they come back as null. Any non-numeric
     content means the line is misaligned — return null rather than a number
     that would silently become a shelf price. */
  function _parsePrice(raw) {
    const str = String(raw == null ? '' : raw).trim();
    if (!str) return null;
    if (!/^[0-9]+$/.test(str)) return null;
    if (/^0+$/.test(str)) return null;          // zero-filled = not supplied
    return parseInt(str, 10) / 100;
  }

  /* GST/HST and PST indicators: Y = Yes, N = No, F = Forced, blank.
     'F' means the tax is forced ON for this product, so it IS taxable. */
  function _taxFlag(raw) {
    const v = String(raw || '').trim().toUpperCase();
    return v === 'Y' || v === 'F';
  }

  /* Narcotic indicator (spec §2.4.2.1 recording details):
       'C'   = controlled drug (includes narcotic-controlled)
       'N'   = narcotic, non-controlled   <-- still a narcotic
       blank = neither a narcotic nor a controlled drug
     'N' does NOT mean "no". Use this helper everywhere instead of comparing
     the raw letter, which is how narcotics came to be treated as ordinary OTC. */
  function narcoticClass(indicator) {
    const v = String(indicator || '').trim().toUpperCase();
    if (v === 'C') return 'controlled';
    if (v === 'N') return 'narcotic';
    return null;
  }
  function isNarcotic(indicator) { return narcoticClass(indicator) !== null; }

  /* The UPC is stored as three separate fields (spec positions 104, 105-111,
     112-116). Join them, and treat an all-zero result as absent — otherwise
     every product without a UPC shares the key "0000000000000".
     NB the spec says the GTIN field has replaced the UPC; GTIN is preferred
     for scanning and is parsed separately below. */
  function _upc(line, shift) {
    const pkg    = _extract(line, ...FIELDS.upc_package,      shift);
    const vendor = _extract(line, ...FIELDS.upc_vendor,       shift);
    const unit   = _extract(line, ...FIELDS.upc_product_unit, shift);
    const joined = `${pkg}${vendor}${unit}`.trim();
    if (!joined || /^0+$/.test(joined)) return null;
    return joined;
  }

  function _digitsOrNull(raw) {
    const v = String(raw || '').trim();
    if (!v || /^0+$/.test(v)) return null;
    return v;
  }

  /* Parse one 'P' record. Returns null if the line is not a product record.
     `noRecordId` is for a file whose record-ID column has been stripped: the
     check is skipped and every field is read one character earlier. The
     numeric item-number test below is what stops a misread line being stored
     as a product. */
  function parseLine(line, noRecordId = false) {
    if (!line) return null;
    const text = line.replace(/[\r\n]+$/, '');
    if (!text.trim()) return null;

    const shift = noRecordId ? -1 : 0;

    if (!noRecordId && text.charAt(0).toUpperCase() !== REC_PRODUCT) {
      return null;                              // 'S' specials and anything else
    }

    const item_no = _extract(text, ...FIELDS.item_no, shift);
    if (!item_no || !/^[0-9]+$/.test(item_no)) return null;

    return {
      mckesson_item_no:   item_no,
      description:        _extract(text, ...FIELDS.description, shift) || 'Unknown',
      upc_unit:           _upc(text, shift),
      gtin_unit:          _digitsOrNull(_extract(text, ...FIELDS.gtin_unit, shift)),
      gtin_pack:          _digitsOrNull(_extract(text, ...FIELDS.gtin_pack, shift)),
      gtin_case:          _digitsOrNull(_extract(text, ...FIELDS.gtin_case, shift)),
      din:                _extract(text, ...FIELDS.din, shift) || null,
      suggested_retail:   _parsePrice(_extract(text, ...FIELDS.suggested_retail, shift)),
      // Cost price, kept under its historical column name. Never use it as a
      // selling price — see CLAUDE.md 1.4.10.
      regular_unit_price: _parsePrice(_extract(text, ...FIELDS.regular_unit_price, shift)),
      gst_applicable:     _taxFlag(_extract(text, ...FIELDS.gst_indicator, shift)),
      pst_applicable:     _taxFlag(_extract(text, ...FIELDS.pst_indicator, shift)),
      narcotic_indicator: _extract(text, ...FIELDS.narcotic_indicator, shift) || null,
      product_status:     _extract(text, ...FIELDS.product_status, shift) || 'A',
      unit_modality:      _extract(text, ...FIELDS.unit_modality, shift) || null,
      strength:           _extract(text, ...FIELDS.strength, shift) || null,
      product_form:       _extract(text, ...FIELDS.product_form, shift) || null,
      last_update:        _digitsOrNull(_extract(text, ...FIELDS.last_update, shift)),
      // Flags a line that is too short to hold every field, so the caller can
      // report it instead of silently storing nulls for price and GTIN.
      _truncated:         text.length < (PRODUCT_LEN + shift),
    };
  }

  /* Decide whether this file uses the spec's record-ID column.
     Defensive: if no line starts with 'P' or 'S', the export is non-standard
     (or the column was stripped). Rather than importing zero products we fall
     back to treating every line as a product and say so in the result. */
  function _detectLayout(lines) {
    let withId = 0, checked = 0;
    for (const raw of lines) {
      const t = raw.replace(/[\r\n]+$/, '');
      if (!t.trim()) continue;
      const c = t.charAt(0).toUpperCase();
      if (c === REC_PRODUCT || c === REC_SPECIAL) withId++;
      if (++checked >= 200) break;
    }
    if (!checked) return 'empty';
    return (withId / checked) >= 0.5 ? 'record-id' : 'no-record-id';
  }

  function parseFile(text) {
    // Handle CRLF, LF and bare CR line endings.
    const lines    = String(text || '').split(/\r\n|\n|\r/);
    const layout   = _detectLayout(lines);
    const assume   = layout === 'no-record-id';

    const products  = [];
    const seen      = new Map();   // item_no -> index in products
    let specials    = 0;
    let skipped     = 0;
    let truncated   = 0;
    let duplicates  = 0;
    let blank       = 0;

    for (const raw of lines) {
      const line = raw.replace(/[\r\n]+$/, '');
      if (!line.trim()) { blank++; continue; }

      if (!assume && line.charAt(0).toUpperCase() === REC_SPECIAL) { specials++; continue; }

      const p = parseLine(line, assume);
      if (!p) { skipped++; continue; }
      if (p._truncated) truncated++;

      // Last record for an item wins, but count the collision so a file that
      // lists an item twice is visible rather than silent.
      if (seen.has(p.mckesson_item_no)) {
        duplicates++;
        products[seen.get(p.mckesson_item_no)] = p;
      } else {
        seen.set(p.mckesson_item_no, products.length);
        products.push(p);
      }
    }

    return {
      products, skipped, specials, truncated, duplicates,
      total: lines.length - blank,
      layout,
    };
  }

  return { parseLine, parseFile, narcoticClass, isNarcotic, PRODUCT_LEN, FIELDS };
})();

/* Node (test harness) — harmless in the browser */
if (typeof module !== 'undefined' && module.exports) module.exports = WebcatParser;
