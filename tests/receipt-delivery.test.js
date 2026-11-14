/* Post-sale receipt delivery — what gets reported for each outcome.
   Run:  node tests/receipt-delivery.test.js

   Pulls the real _deliverReceipt out of pos.js and drives it with stubbed
   Print / email results, so the wording staff see is actually asserted. */

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const src   = fs.readFileSync(path.join(ROOT, 'js/screens/pos.js'), 'utf8');
const start = src.indexOf('  async _deliverReceipt(saved, patient, action) {');
const end   = src.indexOf('\n  }', src.indexOf("if (notes.length) this._setStatus")) + 4;
if (start === -1 || end < start) { console.error('could not locate _deliverReceipt'); process.exit(1); }
const body = src.slice(start, end);

let passed = 0, failed = 0;
const check = (name, actual, expected) => {
  const ok = expected instanceof RegExp ? expected.test(actual) : actual === expected;
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}\n         expected ${expected}\n         actual   ${JSON.stringify(actual)}`); }
};

/* Build a harness object carrying the real method. */
function harness({ print, email }) {
  const calls = { status: null, printed: 0, emailed: 0 };
  const obj = {
    _setStatus: (type, msg) => { calls.status = { type, msg }; },
    _emailReceipt: async () => { calls.emailed++; return email; },
    calls,
  };
  const Print = { printReceipt: async () => { calls.printed++; if (print instanceof Error) throw print; return print; } };
  const Tax = { fmt: n => '$' + Number(n||0).toFixed(2) };
  obj._deliverReceipt = new Function('Print', 'Tax', `return (${body.replace(/^\s*async _deliverReceipt/, 'async function _deliverReceipt')});`)(Print, Tax);
  return obj;
}
const saved = { txn: { transaction_id: 1, total_amount: 10 }, items: [], payments: [] };

(async () => {
  console.log('\nprint outcomes');
  let h = harness({ print: { ok: true, via: 'printer' } });
  await h._deliverReceipt.call(h, saved, null, 'print');
  check('silent print -> "Printed"', h.calls.status.msg, 'Printed');
  check('  reported as success',     h.calls.status.type, 'success');

  h = harness({ print: { ok: true, via: 'dialog', reason: 'no receipt printer is set' } });
  await h._deliverReceipt.call(h, saved, null, 'print');
  check('dialog fallback is flagged, not silent', h.calls.status.msg, /Print dialog opened — no receipt printer is set/);
  check('  reported as error',                    h.calls.status.type, 'error');

  h = harness({ print: { ok: false, reason: 'printer offline' } });
  await h._deliverReceipt.call(h, saved, null, 'print');
  check('failure names the reason', h.calls.status.msg, 'Print failed — printer offline');
  check('  reported as error',      h.calls.status.type, 'error');

  h = harness({ print: new Error('boom') });
  await h._deliverReceipt.call(h, saved, null, 'print');
  check('a thrown print is caught, not swallowed', h.calls.status.msg, 'Print failed — boom');

  console.log('\nemail outcomes');
  h = harness({ email: { ok: true, addr: 'a@b.ca' } });
  await h._deliverReceipt.call(h, saved, null, 'email');
  check('success names the address', h.calls.status.msg, 'Emailed to a@b.ca');
  check('print not attempted',       h.calls.printed, 0);

  h = harness({ email: { ok: false, error: 'SMTP auth failed' } });
  await h._deliverReceipt.call(h, saved, null, 'email');
  check('failure names the reason', h.calls.status.msg, 'Email failed — SMTP auth failed');

  h = harness({ email: { ok: false, cancelled: true } });
  await h._deliverReceipt.call(h, saved, null, 'email');
  check('cancelling is not an error', h.calls.status.msg, 'Email cancelled');
  check('  not reported as error',    h.calls.status.type, 'success');

  console.log('\n"Both"');
  h = harness({ print: { ok: true, via: 'printer' }, email: { ok: true, addr: 'a@b.ca' } });
  await h._deliverReceipt.call(h, saved, null, 'both');
  check('prints once',           h.calls.printed, 1);
  check('emails once',           h.calls.emailed, 1);
  check('reports both outcomes', h.calls.status.msg, 'Printed · Emailed to a@b.ca');

  h = harness({ print: { ok: false, reason: 'printer offline' }, email: { ok: true, addr: 'a@b.ca' } });
  await h._deliverReceipt.call(h, saved, null, 'both');
  check('one failure still reports the success too', h.calls.status.msg, 'Print failed — printer offline · Emailed to a@b.ca');
  check('  whole thing flagged as error',            h.calls.status.type, 'error');
  check('email still sent despite print failing',    h.calls.emailed, 1);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
