/* ============================================================
   webcat.js — McKesson WEBCAT Version 6 fixed-width flat file parser
   Positions are 1-based per spec; we convert to 0-based for substring.
   ============================================================ */

const WebcatParser = (() => {

  /* Field definitions from spec (positions are 1-based inclusive) */
  const FIELDS = {
    item_no:           [2,   7],
    description:       [8,   57],
    narcotic_indicator:[103, 103],
    upc_unit:          [104, 116],
    din:               [127, 134],
    gst_indicator:     [230, 230],
    pst_indicator:     [231, 231],
    regular_unit_price:[239, 245],
    suggested_retail:  [332, 338],
    gtin_unit:         [355, 368],
    product_status:    [352, 352],
  };

  function _extract(line, start, end) {
    // Convert 1-based to 0-based
    return line.substring(start - 1, end).trim();
  }

  function _parsePrice(raw) {
    const n = parseFloat(raw);
    return isNaN(n) ? null : n / 100; // WEBCAT stores prices as cents? Adjust if needed
    // Actually WEBCAT typically stores as 7-char with 2 implied decimals: "0012995" = $129.95
    // Adjust: if raw looks like integer cents
  }

  function _parsePrice2(raw) {
    // WEBCAT V6: price fields are 7 chars, implied 2 decimal places
    const str = raw.replace(/\s/g, '').replace(/[^0-9]/g, '');
    if (!str || str === '0000000') return null;
    return parseFloat(str) / 100;
  }

  function parseLine(line) {
    if (!line || line.length < 100) return null;

    const item_no     = _extract(line, ...FIELDS.item_no);
    if (!item_no) return null;

    const description = _extract(line, ...FIELDS.description);
    const upc_unit    = _extract(line, ...FIELDS.upc_unit);
    const gtin_unit   = _extract(line, ...FIELDS.gtin_unit);
    const din         = _extract(line, ...FIELDS.din);
    const narcotic    = _extract(line, ...FIELDS.narcotic_indicator);
    const gst_flag    = _extract(line, ...FIELDS.gst_indicator);
    const pst_flag    = _extract(line, ...FIELDS.pst_indicator);
    const status      = _extract(line, ...FIELDS.product_status);

    const retail_raw  = line.length >= FIELDS.suggested_retail[1]
      ? _extract(line, ...FIELDS.suggested_retail) : '';
    const cost_raw    = line.length >= FIELDS.regular_unit_price[1]
      ? _extract(line, ...FIELDS.regular_unit_price) : '';

    return {
      mckesson_item_no:   item_no,
      description:        description || 'Unknown',
      upc_unit:           upc_unit || null,
      gtin_unit:          gtin_unit || null,
      din:                din || null,
      suggested_retail:   _parsePrice2(retail_raw),
      regular_unit_price: _parsePrice2(cost_raw),
      gst_applicable:     gst_flag === 'Y' || gst_flag === '1',
      pst_applicable:     pst_flag === 'Y' || pst_flag === '1',
      narcotic_indicator: narcotic || null,
      product_status:     status || 'A',
    };
  }

  function parseFile(text) {
    const lines    = text.split('\n');
    const products = [];
    let   skipped  = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      const p = parseLine(line);
      if (p) products.push(p);
      else    skipped++;
    }

    return { products, skipped, total: lines.length };
  }

  return { parseLine, parseFile };
})();
