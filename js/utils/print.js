/* ============================================================
   print.js  v26
   ============================================================
   TWO document types:

   1. THERMAL RECEIPT (80 mm)
      - printReceipt()            → prints at counter
      - generateReceiptBase64()   → PDF base64 for SQL INSERT
      - No barcode on thermal (clean customer receipt)

   2. FOLDER DOCUMENT (A5, 148 × 210 mm)
      - generateFolderDocBase64() → A5 PDF base64 for folder drop
      - Has Code 128B barcode (Canvas PNG) so WinRx auto-attaches it
      - Uses window.electronAPI.generateA5Pdf() IPC (main.js)
   ============================================================ */

const Print = (() => {

  /* ── Code 128B encoding ────────────────────────────────────
     WinRx document inbox uses Code 128, not Code 39.
     Each entry = [b1,s1,b2,s2,b3,s3] bar/space widths (units).
     Non-stop symbols: 6 elements totalling 11 units each.
     Start A=103, Start B=104, Start C=105.
     Stop = separate 7-element pattern totalling 13 units.   */
  const C128 = [
    [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3], // 0-3
    [1,2,1,3,2,2],[1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2], // 4-7
    [1,3,2,2,1,2],[2,2,1,2,1,3],[2,2,1,3,1,2],[2,3,1,2,1,2], // 8-11
    [1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],[1,1,3,2,2,2], // 12-15
    [1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2], // 16-19
    [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1], // 20-23
    [3,1,1,2,2,2],[3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2], // 24-27
    [3,2,2,1,1,2],[3,2,2,2,1,1],[2,1,2,1,2,3],[2,1,2,3,2,1], // 28-31
    [2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],[1,3,1,3,2,1], // 32-35
    [1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3], // 36-39
    [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1], // 40-43
    [1,3,2,1,3,1],[1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1], // 44-47
    [3,1,3,1,2,1],[2,1,1,3,3,1],[2,3,1,1,3,1],[2,1,3,1,1,3], // 48-51
    [2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],[3,1,1,3,2,1], // 52-55
    [3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1], // 56-59
    [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4], // 60-63
    [1,1,1,4,2,2],[1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2], // 64-67
    [1,4,1,2,2,1],[1,1,2,2,1,4],[1,1,2,4,1,2],[1,2,2,1,1,4], // 68-71
    [1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],[2,4,1,2,1,1], // 72-75
    [2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1], // 76-79
    [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2], // 80-83
    [1,2,4,1,1,2],[1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2], // 84-87
    [4,2,1,2,1,1],[2,1,2,1,4,1],[2,1,4,1,2,1],[4,1,2,1,2,1], // 88-91
    [1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],[1,1,4,1,1,3], // 92-95
    [1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1], // 96-99
    [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2], // 100-103 (103=START A)
    [2,1,1,2,1,4],[2,1,1,2,3,2],                               // 104=START B, 105=START C
  ];
  const C128_STOP = [2,3,3,1,1,1,2]; // 13 modules, 7 elements (bar-space-…-bar)

  /* ── Helpers ───────────────────────────────────────────────*/

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function safeImg(v) {
    return /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(String(v||'')) ? v : '';
  }

  /* Return the WinRx barcode value for the first Rx in items.
     Format: RCPT{rxNumber}A  e.g. "RCPT60004A"              */
  function getRxBarcodeValue(items) {
    const rx = (items||[]).find(i => i.item_type === 'RX' && i.rx_number);
    return rx ? ('RCPT' + rx.rx_number + 'A') : null;
  }

  /* ── Code 128B PNG (Canvas) ────────────────────────────────
     Generates a raster PNG via Canvas — embeds as a real bitmap
     in the PDF so any barcode reader (software or scanner) can
     read it reliably. SVG paths in PDFs are not scannable.

     mw   = module width in px (4 px ≈ 1 mm at 96 dpi)
     barH = bar height in px                                   */
  function code128png(text, mw, barH) {
    mw   = mw   || 4;
    barH = barH || 100;
    try {
      /* Build Code 128B symbol array */
      var data = [];
      for (var i = 0; i < text.length; i++) {
        var v = text.charCodeAt(i) - 32;
        if (v < 0 || v > 95) return null;
        data.push(v);
      }
      if (!data.length) return null;

      /* Check digit: START_B(104) + Σ(position × value) mod 103 */
      var check = 104;
      for (var i = 0; i < data.length; i++) check += (i + 1) * data[i];
      check = check % 103;

      /* All symbol patterns in sequence */
      var syms = [C128[104]];
      for (var i = 0; i < data.length; i++) syms.push(C128[data[i]]);
      syms.push(C128[check]);
      syms.push(C128_STOP);

      /* Calculate total barcode body width in modules */
      var bodyMods = 0;
      for (var s = 0; s < syms.length; s++)
        for (var m = 0; m < syms[s].length; m++) bodyMods += syms[s][m];

      var quiet  = 10;           // 10-module quiet zone each side
      var totalMods = quiet + bodyMods + quiet;
      var textH  = 20;           // px above barcode for text label
      var totalW = totalMods * mw;
      var totalH = textH + barH;

      var canvas = document.createElement('canvas');
      canvas.width  = totalW;
      canvas.height = totalH;
      var ctx = canvas.getContext('2d');

      /* White background */
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, totalW, totalH);

      /* Text label ABOVE barcode, left-aligned (matches WinRx format) */
      ctx.fillStyle = '#000000';
      ctx.font = '14px Arial,Helvetica,sans-serif';
      ctx.fillText(text, quiet * mw, 14);

      /* Draw bars */
      ctx.fillStyle = '#000000';
      var px = quiet * mw;
      for (var s = 0; s < syms.length; s++) {
        var pat = syms[s];
        for (var m = 0; m < pat.length; m++) {
          var w = pat[m] * mw;
          if (m % 2 === 0) ctx.fillRect(px, textH, w, barH); // even = bar
          px += w;
        }
      }

      return canvas.toDataURL('image/png');
    } catch (e) {
      console.warn('code128png failed:', e.message);
      return null;
    }
  }

  /* ── Pharmacy config ───────────────────────────────────────*/

  async function loadPharmacy() {
    var keys = [
      'pharmacy_name','pharmacy_address','pharmacy_city','pharmacy_province',
      'pharmacy_postal','pharmacy_phone','pharmacy_website','pharmacy_gst_number',
      'receipt_header_msg','receipt_footer_msg',
    ];
    var vals = await Promise.all(keys.map(function(k){ return Config.get(k); }));
    return {
      name:      vals[0] || 'Pharmacy POS',
      addrLine:  [vals[1],vals[2],vals[3],vals[4]].filter(Boolean).map(esc).join(', '),
      phone:     vals[5] || '',
      website:   vals[6] || '',
      gstNum:    vals[7] || '',
      headerMsg: vals[8] || '',
      footerMsg: vals[9] || '',
      logo:      safeImg(localStorage.getItem('pharmacy_logo_data') || ''),
    };
  }

  /* ── Shared HTML fragment builders ────────────────────────*/

  function buildItemRows(items) {
    var html = '';
    (items||[]).forEach(function(item) {
      var isRx  = item.item_type === 'RX';
      var isDsc = item.item_type === 'DISCOUNT';
      var badge = isRx ? '[Rx] ' : isDsc ? '[-] ' : '';
      var qty   = Number(item.quantity||1);
      html += '<div class="ri">' +
        '<span class="rin">' + badge + esc(item.description) + (qty>1?' x'+qty:'') + '</span>' +
        '<span class="rip">' + Tax.fmt(Number(item.line_total||0)) + '</span>' +
        '</div>';
      if (isRx && item.rx_number) {
        html += '<div class="rrx">Rx# ' + esc(item.rx_number) +
          (item.branch_code ? '-'+esc(item.branch_code) : '') + '</div>';
      }
    });
    return html;
  }

  function buildPaymentRows(payments) {
    return (payments||[]).map(function(p) {
      return '<div class="rtl"><span>Paid (' + esc(p.method) + ')</span>' +
             '<span>' + Tax.fmt(Number(p.amount||0)) + '</span></div>';
    }).join('');
  }

  function buildTotals(txn, payments) {
    var gstPct  = (Tax.gstRate()*100).toFixed(1).replace(/\.0$/,'');
    var pstPct  = (Tax.pstRate()*100).toFixed(1).replace(/\.0$/,'');
    var paid    = (payments||[]).reduce(function(s,p){ return s+Number(p.amount||0); }, 0);
    var hasCash = (payments||[]).some(function(p){ return String(p.method||'').toUpperCase()==='CASH'; });
    var change  = Tax.round2(paid - Number(txn.total_amount||0));
    var html =
      '<div class="rtl"><span>Subtotal</span><span>' + Tax.fmt(Number(txn.subtotal||0)) + '</span></div>' +
      (Number(txn.gst_amount||0)>0 ? '<div class="rtl"><span>GST (' + gstPct + '%)</span><span>' + Tax.fmt(Number(txn.gst_amount||0)) + '</span></div>' : '') +
      (Number(txn.pst_amount||0)>0 ? '<div class="rtl"><span>PST (' + pstPct + '%)</span><span>' + Tax.fmt(Number(txn.pst_amount||0)) + '</span></div>' : '') +
      '<div class="rtl grand"><span>TOTAL</span><span>' + Tax.fmt(Number(txn.total_amount||0)) + '</span></div>' +
      '<hr class="rd"/>' +
      buildPaymentRows(payments) +
      (hasCash && change > 0 ? '<div class="rtl"><span>Change</span><span>' + Tax.fmt(change) + '</span></div>' : '') +
      (Number(txn.balance_owing||0) > 0 ? '<div class="rtl" style="color:red;"><span>BALANCE OWING</span><span>' + Tax.fmt(Number(txn.balance_owing||0)) + '</span></div>' : '');
    return html;
  }

  function buildRphBlock(rphInfo) {
    if (!rphInfo) return '';
    var sig = safeImg(rphInfo.signatureDataUrl || '');
    return '<hr class="rd"/>' +
      '<div style="font-size:10px;margin:4px 0 6px;">' +
        '<div style="font-weight:bold;margin-bottom:' + (sig?'4px':'22px') + ';">' +
          'Counselling &amp; Allergy Checked by (RPh):' +
        '</div>' +
        (sig ? '<img src="' + sig + '" style="height:38px;max-width:100%;display:block;"/>' : '') +
        '<div style="border-top:1px solid #000;padding-top:2px;margin-top:' + (sig?'2px':'0') + ';">' +
          (esc(rphInfo.name)||'&nbsp;') +
        '</div>' +
      '</div>';
  }

  /* ══════════════════════════════════════════════════════════
     THERMAL RECEIPT (80 mm)
     No barcode — clean counter receipt for the customer.
     ══════════════════════════════════════════════════════════*/

  async function generateReceiptHTML(txn, items, payments, patient, rphInfo) {
    var ph   = await loadPharmacy();
    var date = new Date(txn.transaction_date).toLocaleString(navigator.language);
    return (
      '<div class="receipt">' +
        '<div class="rh">' +
          (ph.logo ? '<div><img src="' + ph.logo + '" style="max-width:100%;max-height:40px;height:auto;display:block;margin:0 auto 4px;" onerror="this.parentNode.style.display=\'none\'"/></div>' : '') +
          '<div class="rpn">' + esc(ph.name).toUpperCase() + '</div>' +
          (ph.addrLine  ? '<div>' + ph.addrLine + '</div>' : '') +
          (ph.phone     ? '<div>Tel: ' + esc(ph.phone) + '</div>' : '') +
          (ph.website   ? '<div>' + esc(ph.website) + '</div>' : '') +
          (ph.gstNum    ? '<div>GST#: ' + esc(ph.gstNum) + '</div>' : '') +
          (ph.headerMsg ? '<div>' + esc(ph.headerMsg) + '</div>' : '') +
        '</div>' +
        '<hr class="rd"/>' +
        '<div style="font-size:11px;margin-bottom:6px;">' +
          (patient ? '<div>' + esc(patient.given_name) + ' ' + esc(patient.surname) + '</div>' : '') +
          '<div>Date: ' + esc(date) + '</div>' +
          '<div>Txn #' + esc(txn.transaction_id) + (txn.staff_pin ? ' &nbsp; Staff: ' + esc(txn.staff_pin) : '') + '</div>' +
        '</div>' +
        '<hr class="rd"/>' +
        buildItemRows(items) +
        '<hr class="rd"/>' +
        '<div class="rt">' + buildTotals(txn, payments) + '</div>' +
        buildRphBlock(rphInfo) +
        '<hr class="rd"/>' +
        '<div class="rf">' +
          (ph.footerMsg ? '<div>' + esc(ph.footerMsg) + '</div>' : '<div>Thank you for choosing ' + esc(ph.name) + '!</div>') +
        '</div>' +
      '</div>'
    );
  }

  function wrapThermal(body) {
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=302,initial-scale=1.0,maximum-scale=1.0">' +
      '<style>' +
      '@page{size:80mm auto;margin:0;}' +
      '*{box-sizing:border-box;}html{width:302px;}' +
      'body{margin:0;padding:6px 8px;background:#fff;width:302px;overflow:hidden;}' +
      '.receipt{font-family:"Courier New",Courier,monospace;font-size:11px;width:286px;color:#000;word-wrap:break-word;overflow-wrap:break-word;}' +
      '.rh{text-align:center;margin-bottom:8px;}.rh div{font-size:10px;}.rpn{font-size:13px;font-weight:bold;letter-spacing:1px;}' +
      '.rd{border:none;border-top:1px dashed #000;margin:6px 0;}' +
      '.ri{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3px;gap:4px;}' +
      '.rin{flex:1;white-space:normal;word-break:break-word;overflow-wrap:break-word;line-height:1.3;min-width:0;}' +
      '.rip{white-space:nowrap;flex-shrink:0;padding-left:4px;}' +
      '.rrx{font-size:10px;color:#555;margin:-2px 0 3px 6px;}' +
      '.rt{margin-top:4px;}.rtl{display:flex;justify-content:space-between;margin-bottom:2px;}' +
      '.rtl.grand{font-weight:bold;font-size:12px;margin-top:3px;}' +
      '.rf{text-align:center;margin-top:8px;font-size:10px;line-height:1.4;}' +
      '</style></head><body>' + body + '</body></html>';
  }

  /* Print thermal receipt at the counter */
  async function printReceipt(txn, items, payments, patient) {
    var html    = await generateReceiptHTML(txn, items, payments, patient, null);
    var fullDoc = wrapThermal(html);

    if (window.electronAPI && window.electronAPI.printReceiptHtml) {
      var printerName = await Config.get('receipt_printer');
      if (printerName) {
        try {
          var result = await window.electronAPI.printReceiptHtml(fullDoc, printerName);
          if (result && result.ok) return;
          console.warn('Silent print failed:', result && result.reason, '— falling back to dialog');
        } catch (e) {
          console.warn('printReceiptHtml error:', e.message, '— falling back to dialog');
        }
      }
    }

    /* Print via browser dialog — inject an iframe with the full styled document
       so the thermal CSS (@page 80mm, .rf, .rd, etc.) is applied correctly.     */
    var frame = document.getElementById('receipt-print-frame');
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.id    = 'receipt-print-frame';
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:302px;height:800px;border:none;';
    document.body.appendChild(frame);
    frame.contentDocument.open();
    frame.contentDocument.write(fullDoc);
    frame.contentDocument.close();
    setTimeout(function() {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(function() { frame.remove(); }, 1000);
    }, 300);
  }

  /* Generate 80 mm receipt as base64 PDF — for SQL INSERT into WinRx */
  async function generateReceiptBase64(txn, items, payments, patient, rphInfo) {
    try {
      var html    = await generateReceiptHTML(txn, items, payments, patient, rphInfo || null);
      var fullDoc = wrapThermal(html);
      var bcVal   = getRxBarcodeValue(items);
      var fname   = bcVal ? (bcVal + '.pdf') : ('TXN' + txn.transaction_id + '.pdf');

      if (window.electronAPI && window.electronAPI.generateReceiptPdf) {
        var b64 = await window.electronAPI.generateReceiptPdf(fullDoc);
        if (b64) return { base64: b64, mimeType: 'application/pdf', filename: fname };
      }
      var fb = btoa(unescape(encodeURIComponent(fullDoc)));
      return { base64: fb, mimeType: 'text/html', filename: fname.replace(/\.pdf$/i, '.html') };
    } catch (e) {
      console.warn('generateReceiptBase64 failed:', e.message);
      return null;
    }
  }

  /* ══════════════════════════════════════════════════════════
     FOLDER DOCUMENT (A5, 148 × 210 mm)
     Has large Code 39 barcode. WinRx reads it and attaches
     the PDF to the correct patient Rx record automatically.
     ══════════════════════════════════════════════════════════*/

  async function buildFolderDocHTML(txn, items, payments, patient, rphInfo) {
    var ph    = await loadPharmacy();
    var date  = new Date(txn.transaction_date).toLocaleString(navigator.language);
    var bcVal = getRxBarcodeValue(items);
    var bcImg = bcVal ? code128png(bcVal, 4, 100) : null;
    var bc    = bcImg ? '<img src="' + bcImg + '" style="display:block;max-width:100%;height:auto;" />' : '';

    return (
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#000;">' +

        /* Pharmacy header */
        '<div style="text-align:center;margin-bottom:12px;">' +
          (ph.logo ? '<img src="' + ph.logo + '" style="max-height:55px;margin-bottom:6px;" onerror="this.style.display=\'none\'"/><br/>' : '') +
          '<div style="font-size:14pt;font-weight:bold;letter-spacing:1px;">' + esc(ph.name).toUpperCase() + '</div>' +
          (ph.addrLine ? '<div style="font-size:9pt;margin-top:2px;">' + ph.addrLine + '</div>' : '') +
          (ph.phone    ? '<div style="font-size:9pt;">Tel: ' + esc(ph.phone) + '</div>' : '') +
          (ph.gstNum   ? '<div style="font-size:9pt;">GST#: ' + esc(ph.gstNum) + '</div>' : '') +
        '</div>' +

        /* Document title */
        '<div style="text-align:center;font-size:13pt;font-weight:bold;letter-spacing:.5px;' +
             'margin:8px 0 10px;text-transform:uppercase;">Pick Up Confirmation</div>' +

        '<hr style="border:1px solid #000;margin:8px 0;"/>' +

        /* Barcode — Canvas PNG raster so PDF/barcode scanners can read it */
        (bc ?
          '<div style="text-align:center;margin:14px 0 12px;">' + bc + '</div>' +
          '<hr style="border:1px solid #000;margin:8px 0;"/>'
        : '') +

        /* Patient + transaction info */
        '<table style="width:100%;font-size:10pt;border-collapse:collapse;margin-bottom:8px;">' +
          '<tr>' +
            '<td style="vertical-align:top;width:55%;">' +
              (patient ?
                '<strong>' + esc(patient.given_name) + ' ' + esc(patient.surname) + '</strong>' +
                (patient.phn ? '<br/>PHN: ' + esc(patient.phn) : '')
              : '') +
            '</td>' +
            '<td style="vertical-align:top;text-align:right;width:45%;">' +
              '<div>Date: ' + esc(date) + '</div>' +
              '<div>Txn #' + esc(txn.transaction_id) + '</div>' +
              (txn.staff_pin ? '<div>Staff: ' + esc(txn.staff_pin) + '</div>' : '') +
            '</td>' +
          '</tr>' +
        '</table>' +

        '<hr style="border-top:1px dashed #000;margin:6px 0;"/>' +

        /* Items */
        '<div class="ri-wrap">' + buildItemRows(items) + '</div>' +

        '<hr style="border-top:1px dashed #000;margin:6px 0;"/>' +

        /* Totals */
        '<div class="rt">' + buildTotals(txn, payments) + '</div>' +

        /* RPh signature */
        buildRphBlock(rphInfo || null) +

        '<hr style="border:1px solid #000;margin:12px 0 8px;"/>' +
        '<div style="text-align:center;font-size:9pt;color:#444;">' +
          (ph.footerMsg ? esc(ph.footerMsg) : 'No returns accepted as per CPBC ByLaws') +
        '</div>' +
      '</div>'
    );
  }

  function wrapA5(body) {
    /* Use CSS @page for sizing — avoids pixel/DPI mismatch when Chromium
       renders to PDF. Content uses 100% width so it adapts to whatever
       page width the PDF renderer resolves A5 to.                        */
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<style>' +
      '@page{size:A5 portrait;margin:12mm;}' +
      '*{box-sizing:border-box;margin:0;padding:0;}' +
      'html,body{background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#000;width:100%;}' +
      '.ri{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;gap:8px;}' +
      '.rin{flex:1;word-break:break-word;overflow-wrap:break-word;line-height:1.4;}' +
      '.rip{white-space:nowrap;flex-shrink:0;padding-left:6px;}' +
      '.rrx{font-size:9pt;color:#555;margin:-3px 0 4px 10px;}' +
      '.rd{border:none;border-top:1px dashed #000;margin:5px 0;}' +
      '.rtl{display:flex;justify-content:space-between;margin-bottom:3px;}' +
      '.rtl.grand{font-weight:bold;font-size:13pt;margin-top:4px;}' +
      '.rt{font-size:10pt;}' +
      '</style></head><body>' + body + '</body></html>';
  }

  /* Generate A5 PDF with barcode — for WinRx document inbox folder */
  async function generateFolderDocBase64(txn, items, payments, patient, rphInfo) {
    try {
      var html    = await buildFolderDocHTML(txn, items, payments, patient, rphInfo || null);
      var fullDoc = wrapA5(html);
      var bcVal   = getRxBarcodeValue(items);
      var fname   = bcVal ? (bcVal + '.pdf') : ('TXN' + txn.transaction_id + '.pdf');

      /* Use the dedicated A5 IPC handler — NOT generate-receipt-pdf which is hardcoded to 80mm */
      if (window.electronAPI && window.electronAPI.generateA5Pdf) {
        var b64 = await window.electronAPI.generateA5Pdf(fullDoc);
        if (b64) return { base64: b64, mimeType: 'application/pdf', filename: fname };
      }
      /* Fallback if IPC not available (browser / older build) */
      var fb = btoa(unescape(encodeURIComponent(fullDoc)));
      return { base64: fb, mimeType: 'text/html', filename: fname.replace(/\.pdf$/i, '.html') };
    } catch (e) {
      console.warn('generateFolderDocBase64 failed:', e.message);
      return null;
    }
  }

  /* ── Public API ────────────────────────────────────────────*/
  return {
    generateReceiptHTML,
    printReceipt,
    generateReceiptBase64,
    generateFolderDocBase64,
    getRxBarcodeValue,
  };

})();
