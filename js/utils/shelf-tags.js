/* ============================================================
   shelf-tags.js — Shelf price tag / sticker generator
   Generates printable label sheets (Avery presets, thermal,
   or custom) with barcode, price, name, unit price, SKU, etc.
   Reuses Print.code128png for barcodes; adds EAN-13/UPC-A.
   ============================================================ */

const ShelfTags = (() => {

  /* ── Label sheet presets ──────────────────────────────────
     All dimensions in mm. Sheet = Letter (215.9 × 279.4 mm).
     cols/rows + label size + gaps + page margins.            */
  const PRESETS = {
    avery5160: {
      name: 'Avery 5160 — 1" × 2⅝" (30/sheet)',
      labelW: 66.7, labelH: 25.4, cols: 3, rows: 10,
      marginTop: 12.7, marginLeft: 4.7, gapX: 3.0, gapY: 0,
      page: 'Letter',
    },
    avery5163: {
      name: 'Avery 5163 — 2" × 4" (10/sheet)',
      labelW: 101.6, labelH: 50.8, cols: 2, rows: 5,
      marginTop: 12.7, marginLeft: 4.7, gapX: 3.0, gapY: 0,
      page: 'Letter',
    },
    avery5164: {
      name: 'Avery 5164 — 3⅓" × 4" (6/sheet)',
      labelW: 101.6, labelH: 84.7, cols: 2, rows: 3,
      marginTop: 12.7, marginLeft: 4.7, gapX: 3.0, gapY: 0,
      page: 'Letter',
    },
    avery5167: {
      name: 'Avery 5167 — ½" × 1¾" (80/sheet, tiny)',
      labelW: 44.4, labelH: 12.7, cols: 4, rows: 20,
      marginTop: 12.7, marginLeft: 7.1, gapX: 7.9, gapY: 0,
      page: 'Letter',
    },
    shelf_small: {
      name: 'Shelf edge strip — 1.5" × 1" (40/sheet)',
      labelW: 38.1, labelH: 25.4, cols: 5, rows: 8,
      marginTop: 12.7, marginLeft: 6, gapX: 3, gapY: 1,
      page: 'Letter',
    },
    thermal_small: {
      name: 'Thermal roll — 1" × 1.5" (single)',
      labelW: 38.1, labelH: 25.4, cols: 1, rows: 1,
      marginTop: 1, marginLeft: 1, gapX: 0, gapY: 0,
      page: 'custom', pageW: 40, pageH: 27,
    },
    thermal_med: {
      name: 'Thermal roll — 2¼" × 1¼" (single)',
      labelW: 57.2, labelH: 31.8, cols: 1, rows: 1,
      marginTop: 1, marginLeft: 1, gapX: 0, gapY: 0,
      page: 'custom', pageW: 60, pageH: 34,
    },
  };

  /* ── EAN-13 / UPC-A barcode (Canvas PNG) ───────────────────
     UPC-A is EAN-13 with leading 0. Renders proper retail
     barcode that any scanner reads. Falls back to Code 128
     for non-numeric / wrong-length codes.                     */
  const EAN_L = ['0001101','0011001','0010011','0111101','0100011',
                 '0110001','0101111','0111011','0110111','0001011'];
  const EAN_G = ['0100111','0110011','0011011','0100001','0011101',
                 '0111001','0000101','0010001','0001001','0010111'];
  const EAN_R = ['1110010','1100110','1101100','1000010','1011100',
                 '1001110','1010000','1000100','1001000','1110100'];
  // First-digit parity pattern for EAN-13 (which of L/G to use in left half)
  const EAN_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG',
                      'LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  function _ean13Checksum(digits12) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(digits12[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return (10 - (sum % 10)) % 10;
  }

  /* Returns data-URL PNG of an EAN-13 / UPC-A barcode, or null */
  function eanBarcodePng(raw, moduleW, barH) {
    moduleW = moduleW || 2;
    barH    = barH || 60;
    let digits = String(raw || '').replace(/\D/g, '');

    // UPC-A (12) → pad to EAN-13 with leading zero
    if (digits.length === 12) digits = '0' + digits;
    // 11 digits → assume UPC-A missing check digit; compute below after pad
    if (digits.length !== 13) return null; // not a valid EAN-13/UPC-A

    // Validate / fix checksum
    const body12 = digits.slice(0, 12);
    const check  = _ean13Checksum(body12);
    digits = body12 + check;

    const first  = parseInt(digits[0]);
    const left   = digits.slice(1, 7);
    const right  = digits.slice(7, 13);
    const parity = EAN_PARITY[first];

    // Build module string
    let bits = '101'; // start guard
    for (let i = 0; i < 6; i++) {
      const d = parseInt(left[i]);
      bits += (parity[i] === 'L') ? EAN_L[d] : EAN_G[d];
    }
    bits += '01010'; // center guard
    for (let i = 0; i < 6; i++) {
      bits += EAN_R[parseInt(right[i])];
    }
    bits += '101'; // end guard

    const quiet  = 9; // modules of quiet zone each side
    const totalMods = quiet + bits.length + quiet;
    const textH  = 14;
    const W = totalMods * moduleW;
    const H = barH + textH;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000';

    let x = quiet * moduleW;
    // Guard bars extend slightly lower (standard EAN look)
    const guardExtra = 6;
    const guardPos = new Set();
    [0,1,2, 45,46,47,48,49, 92,93,94].forEach(p => guardPos.add(p));
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] === '1') {
        const extra = guardPos.has(i) ? guardExtra : 0;
        ctx.fillRect(x, 0, moduleW, barH + extra);
      }
      x += moduleW;
    }
    // Human-readable digits under barcode
    ctx.fillStyle = '#000';
    ctx.font = `${textH-2}px "Courier New",monospace`;
    ctx.fillText(digits, quiet * moduleW, H - 1);

    return canvas.toDataURL('image/png');
  }

  /* Pick best barcode renderer for a code */
  function barcodeFor(code, opts = {}) {
    const clean = String(code || '').replace(/\s/g, '');
    if (!clean) return null;
    const digits = clean.replace(/\D/g, '');
    // Try EAN-13/UPC-A for 11/12/13-digit numeric codes
    if (opts.type !== 'code128' &&
        (digits.length === 13 || digits.length === 12 || digits.length === 11) &&
        digits === clean) {
      const png = eanBarcodePng(digits, opts.moduleW || 2, opts.barH || 60);
      if (png) return png;
    }
    // Fallback to Code 128 (handles any alphanumeric, e.g. SKUs)
    if (window.Print && Print.code128png) {
      return Print.code128png(clean, opts.moduleW || 2, opts.barH || 50, clean);
    }
    return null;
  }

  /* ── Compute unit price string ─────────────────────────────
     e.g. price 12.99, packSize 100 → "$0.13 / unit"          */
  function unitPriceStr(price, packSize, unitLabel) {
    if (!packSize || packSize <= 0) return '';
    const per = price / packSize;
    return `$${per.toFixed(per < 0.1 ? 3 : 2)} / ${unitLabel || 'unit'}`;
  }

  /* ── Build a single tag's inner HTML ───────────────────────
     tag = { description, price, barcode, sku, din, unitPrice }
     fields = which fields to show                             */
  function buildTagHtml(tag, fields, preset) {
    const esc = s => String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    // Scale font to label height
    const small  = preset.labelH < 20;
    const nameSize  = small ? '7pt'  : '9pt';
    const priceSize = small ? '13pt' : preset.labelH < 40 ? '20pt' : '26pt';
    const metaSize  = small ? '6pt'  : '7pt';

    const brand = (typeof window !== 'undefined' && window.BRAND_KIT) ? window.BRAND_KIT : { primary:'#1e4031' };

    let bc = '';
    if (fields.barcode && tag.barcode) {
      const img = barcodeFor(tag.barcode, {
        moduleW: small ? 1 : 2,
        barH:    small ? 24 : 40,
        type:    fields.barcodeType,
      });
      if (img) bc = `<img src="${img}" style="max-width:100%;max-height:${small?22:46}px;display:block;margin:1px auto 0;" />`;
    }

    return `
      <div style="height:100%;box-sizing:border-box;padding:${small?'2px 3px':'4px 7px'};
                  display:flex;flex-direction:column;justify-content:space-between;
                  ${fields.border ? `border:1px solid ${brand.primary};` : ''}overflow:hidden;">
        ${fields.name ? `<div style="font-size:${nameSize};font-weight:600;line-height:1.1;color:${brand.primary};
            overflow:hidden;text-overflow:ellipsis;
            display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">
            ${esc(tag.description)}</div>` : ''}

        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:4px;">
          ${fields.price ? `<div style="font-size:${priceSize};font-weight:800;line-height:1;color:${brand.primary};">
              $${Number(tag.price||0).toFixed(2)}</div>` : '<div></div>'}
          ${fields.unitPrice && tag.unitPrice
            ? `<div style="font-size:${metaSize};color:#333;text-align:right;">${esc(tag.unitPrice)}</div>` : ''}
        </div>

        ${bc}

        ${(fields.sku && tag.sku) || (fields.din && tag.din) || fields.date ? `
          <div style="font-size:${metaSize};color:#555;display:flex;justify-content:space-between;gap:4px;">
            <span>${fields.sku && tag.sku ? 'SKU '+esc(tag.sku) : ''}${fields.din && tag.din ? ' DIN '+esc(tag.din) : ''}</span>
            ${fields.date ? `<span>${new Date().toLocaleDateString('en-CA')}</span>` : ''}
          </div>` : ''}
      </div>`;
  }

  /* ── Build the full printable sheet HTML ───────────────────
     tags  = array of tag objects
     fields = field toggles
     presetKey = key in PRESETS                                */
  function buildSheet(tags, fields, presetKey) {
    const p = PRESETS[presetKey] || PRESETS.avery5163;
    const perPage = p.cols * p.rows;

    const pageCss = p.page === 'custom'
      ? `@page{size:${p.pageW}mm ${p.pageH}mm;margin:0;}`
      : `@page{size:Letter;margin:0;}`;

    // Each tag is absolutely positioned in a CSS grid per page
    let pagesHtml = '';
    for (let i = 0; i < tags.length; i += perPage) {
      const pageTags = tags.slice(i, i + perPage);
      const cells = pageTags.map((tag, idx) => {
        const col = idx % p.cols;
        const row = Math.floor(idx / p.cols);
        const x = p.marginLeft + col * (p.labelW + p.gapX);
        const y = p.marginTop  + row * (p.labelH + p.gapY);
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;
                    width:${p.labelW}mm;height:${p.labelH}mm;">
                  ${buildTagHtml(tag, fields, p)}
                </div>`;
      }).join('');
      pagesHtml += `<div style="position:relative;width:100%;height:100%;
                      page-break-after:always;">${cells}</div>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        ${pageCss}
        *{box-sizing:border-box;}
        html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#000;}
      </style></head><body>${pagesHtml}</body></html>`;
  }

  return { PRESETS, buildSheet, buildTagHtml, barcodeFor, eanBarcodePng, unitPriceStr };
})();
