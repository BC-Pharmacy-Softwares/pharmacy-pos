/* The catalogue import's tax breakdown.
   Run:  node tests/catalog-tax-log.test.js

   Tax flags are two single characters in the WEBCAT file (GST at 230, PST at
   231). If that layout ever shifts they are the first fields to go wrong and
   the last anyone would notice — the import succeeds and the till quietly
   stops charging GST. These assertions cover what the log says about them. */

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const WebcatParser = require(path.join(ROOT, 'js/parsers/webcat.js'));
const { buildProduct } = require('./webcat-fixtures.js');

// Pull the real _logParse + _logTaxBreakdown out of mckesson.js
const src = fs.readFileSync(path.join(ROOT, 'js/api/mckesson.js'), 'utf8');
const slice = src.slice(src.indexOf('  function _logParse'), src.indexOf('  /* Full catalog sync with polling.'));
const makeLogger = new Function('WebcatParser', 'Tax', slice + '; return { _logParse, _logTaxBreakdown };');
// Tax is the real module's shape: what Settings → Taxes has switched on.
const loggerWith = (gstEnabled, pstEnabled) =>
  makeLogger(WebcatParser, { gstEnabled: () => gstEnabled, pstEnabled: () => pstEnabled })._logParse;
const _logParse = loggerWith(true, true);

let passed = 0, failed = 0;
const check = (name, cond) => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`); }
};
const runImport = (records, logParse = _logParse) => {
  const lines = [];
  logParse(m => lines.push(m), WebcatParser.parseFile(records.join('\n')));
  return lines.join('\n');
};

console.log('\na normal catalogue');
const normal = runImport([
  buildProduct({ item: '1', gst: 'Y', pst: 'N', srp: '0000500', gtin: '1' }),
  buildProduct({ item: '2', gst: 'Y', pst: 'Y', srp: '0001000', gtin: '2' }),
  buildProduct({ item: '3', gst: 'N', pst: 'N', srp: '0002000', gtin: '3' }),
  buildProduct({ item: '4', gst: 'F', pst: 'F', srp: '0001000', gtin: '4' }),
]);
check('reports the GST count',      /3 GST \(75%\)/.test(normal));
check('reports the PST count',      /2 PST \(50%\)/.test(normal));
check('counts items with both',     /2 both/.test(normal));
check('counts untaxed items',       /1 untaxed \(25%\)/.test(normal));
check('no WARNING on a normal file', !/WARNING/.test(normal));

console.log('\na catalogue where NOT ONE item is GST-taxable');
const noGst = runImport([
  buildProduct({ item: '1', gst: 'N', pst: 'N', srp: '0000500', gtin: '1' }),
  buildProduct({ item: '2', gst: 'N', pst: 'N', srp: '0001000', gtin: '2' }),
]);
check('warns loudly',                    /WARNING: not one product is marked GST-taxable/.test(noGst));
check('says what the consequence is',    /Nothing will be charged GST/.test(noGst));
check('points at the likely cause',      /file layout differs from the V6 spec/.test(noGst));

console.log('\na catalogue that is suspiciously untaxed but not empty');
const mostly = runImport(
  Array.from({ length: 20 }, (_, i) =>
    buildProduct({ item: String(i + 1), gst: i === 0 ? 'Y' : 'N', pst: 'N', srp: '0000500', gtin: String(i + 1) }))
);
check('flags the high untaxed share', /95% of products came back untaxed/.test(mostly));
check('suggests a spot-check',        /Spot-check a few in Settings/.test(mostly));
check('does not use the no-GST wording', !/not one product is marked/.test(mostly));

console.log('\n"Forced" still counts as taxable (the 1.4.10 regression)');
const forced = runImport([buildProduct({ item: '1', gst: 'F', pst: 'F', srp: '0001000', gtin: '1' })]);
check('F is counted as GST', /1 GST \(100%\)/.test(forced));
check('and as PST',          /1 PST \(100%\)/.test(forced));
check('no false alarm',      !/WARNING/.test(forced));

console.log('\nwhat the till will actually charge (Settings → Taxes)');
const pstOffRecords = [
  buildProduct({ item: '1', gst: 'Y', pst: 'Y', srp: '0001000', gtin: '1' }),
  buildProduct({ item: '2', gst: 'Y', pst: 'N', srp: '0000500', gtin: '2' }),
];
const pstOff = runImport(pstOffRecords, loggerWith(true, false));
check('says PST flags are ignored when PST is off', /PST is switched OFF[\s\S]*ignored at the till/.test(pstOff));
const pstOn = runImport(pstOffRecords, loggerWith(true, true));
check('warns a GST-only pharmacy when PST is on',   /PST is switched ON[\s\S]*will be charged PST as well as GST/.test(pstOn));
const gstOff = runImport(pstOffRecords, loggerWith(false, true));
check('says so when GST itself is switched off',    /GST is switched OFF/.test(gstOff));
const noPstItems = runImport([buildProduct({ item: '1', gst: 'Y', pst: 'N', srp: '0000500', gtin: '1' })], loggerWith(true, true));
check('no PST note when the file has no PST items', !/PST is switched/.test(noPstItems));

console.log('\nedge cases');
const empty = runImport(['this is not a webcat file']);
check('a file with no products still reports the error', /ERROR: no products parsed/.test(empty));
check('and prints no tax line at all',                   !/Tax flags read/.test(empty));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
