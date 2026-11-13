/* Clover payload -> receipt card block.
   Run:  node tests/clover-payload.test.js

   The fixture mirrors the STRUCTURE of a real Network Pay Display FINISH_OK
   message — nested JSON strings, hex-encoded application label, forbidden
   fields present — with every value replaced by a test value. */

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const srv = fs.readFileSync(path.join(ROOT, 'clover-local-pay/server.js'), 'utf8');
const bridge = new Function(
  srv.slice(srv.indexOf('// Key names we refuse'), srv.indexOf('function handleMessage')) +
  '; return { cardDetails, redactForLog, parseMaybeJson, decodeHexLabel };')();

const psrc = fs.readFileSync(path.join(ROOT, 'js/utils/print.js'), 'utf8');
const esc  = v => String(v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const Tax  = { fmt: n => '$' + Number(n||0).toFixed(2) };
const print = new Function('esc','Tax',
  psrc.slice(psrc.indexOf('function _cardBlock'), psrc.indexOf('function buildTotals')) +
  '; return { _cardBlock };')(esc, Tax);

let passed = 0, failed = 0;
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`); }
};

/* `payment` is a JSON STRING inside the already-parsed payload, and
   `cardTransaction.extra.card` is a third level of nesting. Parsing only the
   outer layer gave a string with no .id and no .cardTransaction — no card block
   on the receipt, and a null clover_payment_id that forced every refund down
   the unlinked path. */
const innerPayment = {
  id: 'TESTPAYMENT01', result: 'SUCCESS', amount: 1, tipAmount: 0,
  cardTransaction: {
    authCode: 'A11111', cardType: 'VISA', last4: '4242',
    first6: '411111',                                  // must never be captured
    cardholderName: 'TEST CARDHOLDER',                 // must never be captured
    expirationDate: '203012', token: 'tok_test',       // must never be captured
    extra: {
      applicationLabel: '4D617374657263617264',        // hex for "Mastercard"
      cvmResult: 'NO_CVM_REQUIRED', exp: '1230',
      applicationIdentifier: 'A0000000041010',
      card: JSON.stringify({ BanknetData: 'XYZ', FinAuthInd: '1' }),
    },
    referenceId: '631700000000', transactionNo: '005018',
    state: 'CLOSED', entryType: 'EMV_CONTACTLESS', type: 'AUTH',
  },
  tender: { label: 'Credit Card', labelKey: 'com.clover.tender.credit_card' },
};
const payload = { payment: JSON.stringify(innerPayment), method: 'FINISH_OK', version: 1 };

console.log('\nnested JSON payload');
check('payload.payment arrives as a string', typeof payload.payment, 'string');
const payment = bridge.parseMaybeJson(payload.payment) || {};
check('it parses to an object',  typeof payment, 'object');
check('payment id is recovered', payment.id, 'TESTPAYMENT01');

console.log('\ncard details');
const card = bridge.cardDetails(payment, payment);
check('card type',      card.cardType,      'VISA');
check('last 4',         card.last4,         '4242');
check('entry type',     card.entryType,     'EMV_CONTACTLESS');
check('auth code',      card.authCode,      'A11111');
check('reference',      card.referenceId,   '631700000000');
check('transaction no', card.transactionNo, '005018');
check('AID',            card.aid,           'A0000000041010');
check('tender label',   card.tenderLabel,   'Credit Card');
check('hex application label is decoded', card.appLabel, 'Mastercard');
check('decodeHexLabel leaves plain text alone', bridge.decodeHexLabel('VISA CREDIT'), 'VISA CREDIT');

console.log('\ncardholder data is never captured');
const blob = JSON.stringify(card);
check('no first6',          blob.includes('411111'), false);
check('no expiry',          blob.includes('203012'), false);
check('no short exp',       /"1230"/.test(blob),     false);
check('no cardholder name', blob.includes('TEST CARDHOLDER'), false);
check('no token',           blob.includes('tok_test'), false);

console.log('\nthe bridge log is safe to send for support');
const redacted = JSON.stringify(bridge.redactForLog({ payment: innerPayment }));
check('first6 redacted',          redacted.includes('411111'), false);
check('cardholder name redacted', redacted.includes('TEST CARDHOLDER'), false);
check('something survives',       redacted.includes('A11111'), true);

console.log('\nreceipt rendering');
const block = print._cardBlock({ card_details: JSON.stringify(card) });
check('block is produced',     block.length > 0, true);
check('shows masked last 4',   block.includes('**** **** **** 4242'), true);
check('shows the auth code',   block.includes('A11111'), true);
check('entry type is readable', block.includes('Contactless'), true);
check('cash line prints nothing', print._cardBlock({ method:'CASH', amount:5 }), '');
check('malformed JSON survives',  print._cardBlock({ card_details:'{not json' }), '');

console.log('\na payload with no card data prints nothing');
check('bare payment -> null',       bridge.cardDetails({ id:'X', amount:1 }, { id:'X', amount:1 }), null);
check('tip alone is not details',   bridge.cardDetails({ tipAmount:0 }, { tipAmount:0 }), null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
