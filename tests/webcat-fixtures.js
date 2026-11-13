/* Builds spec-exact WEBCAT Version 6 records for the tests.
   Layout per McKesson PharmaClik "Third-Party System Integration Document"
   (Nov 2021) §2.4.2.1 (product, 396 chars) and §2.4.2.2 (specials, 345 chars). */

function pad(s, n, numeric) {
  s = String(s == null ? '' : s);
  if (s.length > n) return s.slice(0, n);
  return numeric ? s.padStart(n, '0') : s.padEnd(n, ' ');
}

/* o: { item, desc, narc, din, gst, pst, regUnit, srp, gtin, status,
        upcPkg, upcVendor, upcUnit, strength, form, unitMod } */
function buildProduct(o = {}) {
  const f = [];
  f.push('P');                                   // 1       Record ID
  f.push(pad(o.item || '000001', 6, true));      // 2-7     Item Number
  f.push(pad(o.desc || 'ITEM', 50));             // 8-57    Item Description
  f.push(pad(o.lastUpdate || '20240115', 8, true)); // 58-65 Last Update
  f.push(pad('', 10, true));                     // 66-75   Cust supplier prod no
  f.push(pad('', 15, true));                     // 76-90   Cust product no
  f.push(pad('', 4, true));                      // 91-94   Product Family Group
  f.push(pad(o.caution || '', 8));               // 95-102  Drug caution code
  f.push(pad(o.narc == null ? ' ' : o.narc, 1)); // 103     Narcotic indicator
  f.push(pad(o.upcPkg || '0', 1, true));         // 104     UPC package code
  f.push(pad(o.upcVendor || '0', 7, true));      // 105-111 UPC vendor code
  f.push(pad(o.upcUnit || '0', 5, true));        // 112-116 UPC product code (unit)
  f.push(pad('', 5, true));                      // 117-121 UPC (case)
  f.push(pad('', 5, true));                      // 122-126 UPC (pack)
  f.push(pad(o.din || '', 8));                   // 127-134 DIN
  f.push(pad(o.format || '', 9));                // 135-143 Product Format
  f.push(pad('', 6, true));                      // 144-149 Supplier Product Format
  f.push(pad('', 3));                            // 150-152 Province Tobacco code
  f.push(pad(o.strength || '', 10));             // 153-162 Product Strength
  f.push(pad(o.form || '', 15));                 // 163-177 Product Form
  f.push(pad('', 6, true));                      // 178-183 Generic product number
  f.push(pad(o.generic || '', 30));              // 184-213 Generic product desc
  f.push(pad('', 6, true));                      // 214-219 Therapeutic Class
  f.push(pad('', 10));                           // 220-229 Supplier Product number
  f.push(pad(o.gst == null ? 'N' : o.gst, 1));   // 230     GST/HST Indicator
  f.push(pad(o.pst == null ? 'N' : o.pst, 1));   // 231     PST Indicator
  f.push(pad('', 3));                            // 232-234 Distribution Center
  f.push(pad('', 4));                            // 235-238 Supplier Code
  f.push(pad(o.regUnit || '0', 7, true));        // 239-245 Regular Unit Price (COST)
  f.push(pad('N', 1));                           // 246     Disc ind
  f.push(pad('0', 7, true));                     // 247-253 Regular Case Price
  f.push(pad('N', 1));                           // 254     Disc ind
  f.push(pad('1', 5, true));                     // 255-259 MSQ
  f.push(pad('1', 5, true));                     // 260-264 Unit Qty / Case
  f.push(pad('0', 7, true));                     // 265-271 Reg unit price min qty
  f.push(pad('0', 7, true));                     // 272-278 Reg case price min qty
  f.push(pad('0', 7, true));                     // 279-285 Discount Rate
  f.push(pad('0', 7, true));                     // 286-292 Special Unit Price
  f.push(pad('N', 1));                           // 293     Disc ind
  f.push(pad('0', 3, true));                     // 294-296 Min qty special
  f.push(pad('0', 7, true));                     // 297-303 Special Case Price
  f.push(pad('N', 1));                           // 304     Disc ind
  f.push(pad('0', 8, true));                     // 305-312 Special Start Date
  f.push(pad('0', 8, true));                     // 313-320 Special End Date
  f.push(pad('0', 8, true));                     // 321-328 Special Dating
  f.push(pad('0', 3, true));                     // 329-331 Special Dating Days
  f.push(pad(o.srp || '0', 7, true));            // 332-338 Suggested Retail Price
  f.push(pad('0', 7, true));                     // 339-345 Base price for SRP
  f.push(pad('', 6, true));                      // 346-351 Client number
  f.push(pad(o.status || 'A', 1));               // 352     Product status
  f.push(pad(o.unitMod || 'U', 1));              // 353     Unit modality
  f.push(pad('', 1));                            // 354     Case modality
  f.push(pad(o.gtin || '', 14, true));           // 355-368 GTIN (unit)
  f.push(pad('', 14, true));                     // 369-382 GTIN (pack)
  f.push(pad('', 14, true));                     // 383-396 GTIN (case)
  return f.join('');
}

/* A specials/promotions record for the same item number (§2.4.2.2) */
function buildSpecial(item) {
  let s = 'S' + pad(item, 6, true) + pad('REG', 3) + pad('00120', 5, true)
        + pad('20240101', 8, true) + pad('20240131', 8, true)
        + pad('20240101', 8, true) + pad('20240131', 8, true)
        + pad('A', 1) + pad('FLYER DEAL', 12)
        + pad('0', 4, true) + pad('0', 8, true) + pad('0', 3, true)
        + pad('0000225', 7, true) + pad('N', 1)
        + pad('0000000', 7, true) + pad('N', 1)
        + pad('012', 3, true) + pad('Y', 1) + pad('0000399', 7, true);
  return s.padEnd(344, ' ') + '0';               // 103-344 blanks, 345 = '0'
}

module.exports = { buildProduct, buildSpecial, pad };
