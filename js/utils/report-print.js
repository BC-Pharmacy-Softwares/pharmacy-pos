/* ============================================================
   utils/report-print.js — Full-page report printing
   Opens a standalone print window (NOT the 80mm thermal receipt
   printer). Uses the browser's system print dialog so the user
   can pick any installed printer, paper size, and copies.
   ============================================================ */

const ReportPrint = (() => {

  /* Build @page CSS for the chosen paper size + orientation */
  function _pageCSS(opts) {
    const sizes = { letter: '8.5in 11in', a4: '210mm 297mm', legal: '8.5in 14in' };
    const size  = sizes[opts.paperSize] || sizes.letter;
    return `@page { size: ${size} ${opts.orientation || 'portrait'}; margin: 0.7in; }`;
  }

  /* Body + table styles, colour-scheme aware */
  function _bodyCSS(opts) {
    const mono    = opts.colorScheme === 'mono';
    const primary = mono ? '#111'    : '#1d4ed8';
    const accent  = mono ? '#444'    : '#1e40af';
    const headBg  = mono ? '#e0e0e0' : '#dbeafe';
    const rowAlt  = mono ? '#f5f5f5' : '#f8faff';
    const footBg  = mono ? '#d8d8d8' : '#eff6ff';
    const kpiBg   = mono ? '#f0f0f0' : '#eff6ff';
    const fs      = opts.fontSize || 13;

    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: Arial, Helvetica, sans-serif;
        font-size: ${fs}px;
        color: #111;
        background: #fff;
        padding: 0;
      }
      /* ── Header ── */
      .rpt-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid ${primary};
        padding-bottom: 12px;
        margin-bottom: 22px;
      }
      .rpt-pharmacy-name {
        font-size: ${fs + 4}px;
        font-weight: 700;
        color: ${primary};
        letter-spacing: 0.4px;
      }
      .rpt-pharmacy-details {
        font-size: ${fs - 2}px;
        color: #555;
        margin-top: 4px;
        line-height: 1.5;
      }
      .rpt-title-block { text-align: right; }
      .rpt-report-title {
        font-size: ${fs + 3}px;
        font-weight: 700;
        color: ${primary};
      }
      .rpt-subtitle {
        font-size: ${fs - 1}px;
        color: #555;
        margin-top: 3px;
        line-height: 1.4;
      }
      /* ── KPI boxes ── */
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: 10px;
        margin-bottom: 18px;
      }
      .kpi-box {
        background: ${kpiBg};
        border: 1px solid ${mono ? '#ccc' : '#bfdbfe'};
        border-radius: 6px;
        padding: 10px 12px;
        text-align: center;
      }
      .kpi-label { font-size: ${fs - 2}px; color: #666; margin-bottom: 4px; }
      .kpi-value { font-size: ${fs + 4}px; font-weight: 700; color: ${primary}; }
      /* ── Sections ── */
      .rpt-section { margin-bottom: 22px; }
      .rpt-section-title {
        font-size: ${fs + 1}px;
        font-weight: 700;
        color: ${accent};
        border-bottom: 1px solid ${mono ? '#bbb' : '#93c5fd'};
        padding-bottom: 5px;
        margin-bottom: 10px;
      }
      /* ── Tables ── */
      table { width: 100%; border-collapse: collapse; font-size: ${fs - 1}px; }
      thead th {
        background: ${headBg};
        color: ${accent};
        padding: 7px 10px;
        text-align: left;
        font-weight: 700;
        border-bottom: 2px solid ${mono ? '#aaa' : '#93c5fd'};
        white-space: nowrap;
      }
      tbody tr:nth-child(even) { background: ${rowAlt}; }
      tbody td { padding: 6px 10px; border-bottom: 1px solid #eee; }
      tfoot td {
        padding: 8px 10px;
        font-weight: 700;
        border-top: 2px solid #666;
        background: ${footBg};
      }
      .text-right  { text-align: right !important; }
      .text-center { text-align: center !important; }
      /* ── Footer ── */
      .rpt-footer {
        margin-top: 28px;
        padding-top: 8px;
        border-top: 1px solid #ddd;
        font-size: ${fs - 2}px;
        color: #999;
        display: flex;
        justify-content: space-between;
      }
      /* ── Print overrides ── */
      @media print {
        body { background: #fff !important; }
        .no-print { display: none !important; }
        .rpt-section { page-break-inside: avoid; }
      }`;
  }

  /* Build the complete standalone HTML document */
  async function _buildDoc(sections, meta, opts) {
    const name    = await Config.get('pharmacy_name')       || 'Pharmacy POS';
    const address = await Config.get('pharmacy_address')    || '';
    const city    = await Config.get('pharmacy_city')       || '';
    const prov    = await Config.get('pharmacy_province')   || '';
    const phone   = await Config.get('pharmacy_phone')      || '';
    const gstNum  = await Config.get('pharmacy_gst_number') || '';
    const pstNum  = await Config.get('pharmacy_pst_number') || '';

    const addrLine  = [address, city, prov].filter(Boolean).join(', ');
    const generated = new Date().toLocaleString(navigator.language);

    /* Header block */
    const headerHTML = `
      <div class="rpt-header">
        <div>
          <div class="rpt-pharmacy-name">${(meta.pharmacyName || name).toUpperCase()}</div>
          <div class="rpt-pharmacy-details">
            ${addrLine ? addrLine + '<br>' : ''}
            ${phone   ? 'Tel: ' + phone   : ''}
            ${gstNum  ? ' &nbsp;·&nbsp; GST#: ' + gstNum : ''}
            ${pstNum  ? ' &nbsp;·&nbsp; PST#: ' + pstNum : ''}
          </div>
        </div>
        <div class="rpt-title-block">
          <div class="rpt-report-title">${meta.title || 'Report'}</div>
          ${meta.period        ? `<div class="rpt-subtitle">Period: ${meta.period}</div>`         : ''}
          ${meta.customHeader  ? `<div class="rpt-subtitle">${meta.customHeader}</div>`           : ''}
          <div class="rpt-subtitle">Generated: ${generated}</div>
        </div>
      </div>`;

    /* Sections */
    const sectionsHTML = sections.map(sec => {
      if (!sec || sec.skip) return '';

      if (sec.type === 'kpis') {
        return `<div class="rpt-section">
          ${sec.title ? `<div class="rpt-section-title">${sec.title}</div>` : ''}
          <div class="kpi-grid">
            ${sec.items.map(([label, val]) => `
              <div class="kpi-box">
                <div class="kpi-label">${label}</div>
                <div class="kpi-value">${val}</div>
              </div>`).join('')}
          </div>
        </div>`;
      }

      if (sec.type === 'table') {
        const ths = (sec.headers || []).map(h => {
          const right = typeof h === 'object' ? h.right : false;
          const label = typeof h === 'object' ? h.label : h;
          return `<th${right ? ' class="text-right"' : ''}>${label}</th>`;
        }).join('');
        const thead = ths ? `<thead><tr>${ths}</tr></thead>` : '';

        const tds = row => (sec.headers || row.map(() => ({}))).map((h, i) => {
          const right = typeof h === 'object' ? h.right : false;
          return `<td${right ? ' class="text-right"' : ''}>${row[i] ?? ''}</td>`;
        }).join('');
        const tbody = `<tbody>${sec.rows.map(r => `<tr>${tds(r)}</tr>`).join('')}</tbody>`;

        const tfoot = sec.footer ? `<tfoot><tr>${sec.footer.map((cell, i) => {
          const right = typeof (sec.headers?.[i]) === 'object' ? sec.headers[i].right : false;
          return `<td${right ? ' class="text-right"' : ''}>${cell}</td>`;
        }).join('')}</tr></tfoot>` : '';

        return `<div class="rpt-section">
          ${sec.title ? `<div class="rpt-section-title">${sec.title}</div>` : ''}
          <table>${thead}${tbody}${tfoot}</table>
        </div>`;
      }

      if (sec.type === 'html') {
        return `<div class="rpt-section">
          ${sec.title ? `<div class="rpt-section-title">${sec.title}</div>` : ''}
          ${sec.html}
        </div>`;
      }

      return '';
    }).join('');

    /* Footer */
    const footerHTML = `
      <div class="rpt-footer">
        <span>${name} &mdash; Pharmacy POS</span>
        <span>${generated}</span>
      </div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${meta.title || 'Report'}</title>
  <style>
    ${_pageCSS(opts)}
    ${_bodyCSS(opts)}
  </style>
</head>
<body>
  ${headerHTML}
  ${sectionsHTML}
  ${footerHTML}
  <script>
    window.addEventListener('load', () => setTimeout(() => window.print(), 250));
  </script>
</body>
</html>`;
  }

  /* ── Public API ─────────────────────────────────────────────── */

  /**
   * Open a print window for a structured report.
   *
   * @param {Array}  sections  - Array of section objects ({ type, title, items/rows/headers/footer/html })
   * @param {Object} meta      - { title, period, customHeader, pharmacyName }
   * @param {Object} opts      - { paperSize, orientation, colorScheme, fontSize }
   */
  async function printReport(sections, meta = {}, opts = {}) {
    const options = {
      paperSize:   opts.paperSize   || 'letter',
      orientation: opts.orientation || 'portrait',
      colorScheme: opts.colorScheme || 'color',
      fontSize:    opts.fontSize    || 13,
    };

    const doc = await _buildDoc(sections, meta, options);
    const win = window.open('', '_blank', 'width=960,height=760,menubar=no,toolbar=no');
    if (!win) {
      alert('Pop-up blocked.\nPlease allow pop-ups for this app to print reports.');
      return;
    }
    win.document.write(doc);
    win.document.close();
  }

  /**
   * Render a print-options toolbar HTML string.
   * Caller inserts this into the DOM, then calls collectPrintOpts(el) to read values.
   */
  function printOptsHTML(id = 'print-opts') {
    return `
      <div id="${id}" style="background:var(--surface2);border:1px solid var(--border);
            border-radius:var(--radius);padding:12px 16px;margin-bottom:12px;
            display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:13px;">
        <strong style="white-space:nowrap;">&#128438; Print Options</strong>
        <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
          Paper
          <select class="po-paper" style="padding:4px 6px;border:1px solid var(--border);
                  border-radius:4px;background:var(--surface);color:var(--text);">
            <option value="letter">Letter (8.5×11)</option>
            <option value="a4">A4</option>
            <option value="legal">Legal (8.5×14)</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
          Orientation
          <select class="po-orient" style="padding:4px 6px;border:1px solid var(--border);
                  border-radius:4px;background:var(--surface);color:var(--text);">
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
          Colour
          <select class="po-color" style="padding:4px 6px;border:1px solid var(--border);
                  border-radius:4px;background:var(--surface);color:var(--text);">
            <option value="color">Colour</option>
            <option value="mono">Black &amp; White</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
          Font size
          <select class="po-fontsize" style="padding:4px 6px;border:1px solid var(--border);
                  border-radius:4px;background:var(--surface);color:var(--text);">
            <option value="11">Small</option>
            <option value="13" selected>Medium</option>
            <option value="15">Large</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:6px;flex:1;min-width:160px;white-space:nowrap;">
          Header note
          <input type="text" class="po-header" placeholder="Optional note on printout"
                 style="flex:1;padding:4px 8px;border:1px solid var(--border);
                        border-radius:4px;background:var(--surface);color:var(--text);font-size:12px;" />
        </label>
      </div>`;
  }

  /** Read the current values from a printOptsHTML panel */
  function collectPrintOpts(container) {
    const q = sel => container.querySelector(sel);
    return {
      paperSize:    q('.po-paper')?.value    || 'letter',
      orientation:  q('.po-orient')?.value   || 'portrait',
      colorScheme:  q('.po-color')?.value    || 'color',
      fontSize:     parseInt(q('.po-fontsize')?.value) || 13,
      customHeader: q('.po-header')?.value   || '',
    };
  }

  return { printReport, printOptsHTML, collectPrintOpts };
})();
