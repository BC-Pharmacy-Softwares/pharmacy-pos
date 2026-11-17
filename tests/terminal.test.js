/* Card terminal choice: the Terminal facade, the Moneris driver, and the
   socket in main.js that carries Moneris messages.
   Run:  node tests/terminal.test.js

   What matters here:
     • An existing install (no terminal_type saved) must still be Clover, and
       the Clover driver must receive exactly the calls it always did.
     • A selected-but-unconfigured terminal reports "off", never "auto".
     • The Moneris driver keeps ONLY the last 4 digits, whatever the terminal
       sends, and a reply it cannot read is a failure — never a silent approval.
     • The socket refuses anything that is not a local network address, never
       writes a card number to its log, and does not mistake the terminal's
       one-byte acknowledgement for the result. */

const fs   = require('fs');
const net  = require('net');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let passed = 0, failed = 0;
const check = (name, cond) => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`); }
};
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`); }
};
const throwsAsync = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

/* ── Globals the browser modules expect ─────────────────────────────────── */
let store = {};
global.Config = {
  get: async k => (k in store ? store[k] : null),
  set: async (k, v) => { store[k] = v; },
};
let socketCalls = [], socketReply = null, cancelCalls = 0;
global.window = {
  electronAPI: {
    terminalSocket: async (opts) => { socketCalls.push(opts); return typeof socketReply === 'function' ? socketReply(opts) : socketReply; },
    terminalSocketCancel: async () => { cancelCalls++; return { ok: true }; },
  },
};
const cloverCalls = [];
global.CloverAPI = {
  CARD_ENTRY: { DEFAULT: 34567, MANUAL: 34824, ALL: 36623 },
  isConfigured: async () => !!store.clover_local_url,
  sale:    async (...a) => { cloverCalls.push(['sale', ...a]);    return { ok: true, paymentId: 'CLV1', amount: a[0] }; },
  refund:  async (...a) => { cloverCalls.push(['refund', ...a]);  return { ok: true, refundId: 'R1', amount: a[0] }; },
  cancel:  async ()     => { cloverCalls.push(['cancel']); },
  ping:    async ()     => ({ ok: true, status: 'READY' }),
  displayOrder: async (...a) => { cloverCalls.push(['displayOrder', ...a]); },
};
global.MonerisAPI = require(path.join(ROOT, 'js/api/moneris.js'));
const Terminal    = require(path.join(ROOT, 'js/api/terminal.js'));
const Moneris     = global.MonerisAPI;

/* ── The real socket code, lifted out of main.js ────────────────────────── */
const mainSrc = fs.readFileSync(path.join(ROOT, 'electron-app/main.js'), 'utf8');
const block   = mainSrc.slice(mainSrc.indexOf('/* TERMINAL-SOCKET-BEGIN'), mainSrc.indexOf('/* TERMINAL-SOCKET-END */'));
const Sock    = new Function(block + '; return { isPrivateIPv4, redactForTerminalLog, terminalSocketExchange };')();

/* A throwaway terminal on 127.0.0.1. `behave(socket, received)` plays the device. */
const fakeTerminal = (behave) => new Promise((resolve) => {
  const server = net.createServer((sock) => {
    sock.on('data', (d) => behave(sock, d.toString('latin1')));
    sock.on('error', () => {});
    if (behave.onConnect) behave.onConnect(sock);
  });
  server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
});

(async () => {

  /* ═══ Terminal facade ═══════════════════════════════════════════════════ */
  console.log('\nexisting installs stay on Clover');
  store = { clover_local_url: 'http://localhost:3001' };
  eq('no terminal_type saved → clover', await Terminal.type(), 'clover');
  eq('and it is automatic',             await Terminal.mode(), 'auto');
  store.terminal_type = 'something-unknown';
  eq('an unrecognised value falls back to clover', await Terminal.type(), 'clover');

  console.log('\nClover receives exactly what it always did');
  store = { clover_local_url: 'http://localhost:3001', terminal_type: 'clover' };
  cloverCalls.length = 0;
  const opts = await Terminal.cardEntryOpts(false);
  eq('normal sale uses Clover\'s ALL mask',   opts.cardEntryMethods, 36623);
  eq('manual entry uses Clover\'s MANUAL mask', (await Terminal.cardEntryOpts(true)).cardEntryMethods, 34824);
  const cs = await Terminal.sale(1350, 'ext1', null, opts);
  eq('sale routed to the Clover driver', cloverCalls[0].slice(0, 3), ['sale', 1350, 'ext1']);
  eq('result passed through untouched',  cs.paymentId, 'CLV1');
  await Terminal.refund(500, 'CLV1');
  eq('refund routed with the payment id', cloverCalls[1].slice(0, 3), ['refund', 500, 'CLV1']);
  await Terminal.displayOrder([], {}, 'o1');
  eq('customer display still driven',     cloverCalls[2][0], 'displayOrder');

  console.log('\na terminal that is chosen but not set up is "off", not "auto"');
  store = { terminal_type: 'clover' };                       // no clover_local_url
  eq('unconfigured Clover',  await Terminal.mode(), 'off');
  store = { terminal_type: 'moneris' };
  eq('unconfigured Moneris', await Terminal.mode(), 'off');
  store = { terminal_type: 'moneris', moneris_host: '192.168.0.60' };
  eq('Moneris with no port', await Terminal.mode(), 'off');
  store = { terminal_type: 'moneris', moneris_host: '192.168.0.60', moneris_port: '8443' };
  eq('Moneris fully addressed', await Terminal.mode(), 'auto');

  console.log('\nstandalone and none');
  store = { terminal_type: 'standalone' };
  eq('standalone is manual',            await Terminal.mode(), 'manual');
  eq('standalone needs no setup',       await Terminal.isConfigured(), true);
  eq('standalone has no driver',        await Terminal.driver(), null);
  check('standalone cannot auto-refund', (await Terminal.caps()).autoRefund === false);
  check('a sale through it is refused, not faked',
    /No card terminal/.test((await throwsAsync(() => Terminal.sale(100, 'x')))?.message || ''));
  store = { terminal_type: 'none' };
  eq('none is off', await Terminal.mode(), 'off');
  cloverCalls.length = 0;
  await Terminal.displayOrder([], {}, 'o1');
  await Terminal.cancel();
  eq('display + cancel are harmless no-ops with no terminal', cloverCalls.length, 0);

  console.log('\nevery type is described for the Settings page');
  eq('four terminal types', Terminal.all().map(t => t.id), ['clover', 'moneris', 'standalone', 'none']);
  check('each has a label, a blurb and a mode',
    Terminal.all().every(t => t.label && t.blurb && ['auto', 'manual', 'off'].includes(t.mode)));

  /* ═══ Moneris driver ════════════════════════════════════════════════════ */
  console.log('\nMoneris request building');
  eq('placeholders filled',
    Moneris.buildRequest('{ecr}|PURCHASE|{amount}|{ref}', { ecr: 'POS1', amount: '13.50', ref: 'abc' }),
    'POS1|PURCHASE|13.50|abc');
  eq('control characters typed in the template are converted',
    Moneris.buildRequest('\\x02{amount}\\x03', { amount: '1.00' }), '\x021.00\x03');
  eq('but a value containing a backslash is sent as-is',
    Moneris.buildRequest('{ref}', { ref: 'a\\nb' }), 'a\\nb');
  eq('a placeholder used twice',
    Moneris.buildRequest('{ref}:{ref}', { ref: 'z' }), 'z:z');
  eq('amount in dollars', Moneris._amount(1350, 'dollars'), '13.50');
  eq('amount in cents',   Moneris._amount(1350, 'cents'), '1350');
  eq('one cent',          Moneris._amount(1, 'dollars'), '0.01');
  eq('escapes typed in a settings box', Moneris._unescape('\\x02A\\x03\\r\\n'), '\x02A\x03\r\n');

  console.log('\nreading a separated reply');
  const cfg = { ...Moneris.DEFAULTS };
  const ok  = Moneris.parseResponse('POS1|APPROVED|123456|REF789|************4242|VISA', cfg);
  eq('approved',        ok.approved, true);
  eq('auth code',       ok.authCode, '123456');
  eq('reference',       ok.reference, 'REF789');
  eq('only the last 4', ok.last4, '4242');
  eq('card type',       ok.cardType, 'VISA');
  const pan = Moneris.parseResponse('POS1|APPROVED|1|R|4111111111111111|VISA', cfg);
  eq('a FULL card number is cut to its last 4', pan.last4, '1111');
  const dec = Moneris.parseResponse('POS1|DECLINED|||', cfg);
  eq('declined is not approved', dec.approved, false);
  check('and says what the terminal replied', /DECLINED/.test(dec.reason));
  eq('approval match ignores case',
    Moneris.parseResponse('POS1|approved|1|R', cfg).approved, true);
  eq('a short reply yields nulls, not wrong values',
    Moneris.parseResponse('POS1|APPROVED', cfg).authCode, null);
  eq('an empty reply is a failure', Moneris.parseResponse('', cfg).approved, false);
  eq('garbage is a failure, never an approval',
    Moneris.parseResponse('\x06\x15??', cfg).approved, false);
  eq('a custom separator and positions',
    Moneris.parseResponse('00,AUTH9,OK', { ...cfg, resp_sep: ',', resp_approved_idx: '2',
      resp_approved_value: 'OK', resp_auth_idx: '1' }).authCode, 'AUTH9');

  console.log('\nreading a JSON reply');
  const j = Moneris.parseResponse(JSON.stringify({ result: 'APPROVED', authCode: 'A1',
    referenceNumber: 'R9', maskedPan: '4111********1111', cardType: 'VISA' }), cfg);
  eq('approved',      j.approved, true);
  eq('auth code',     j.authCode, 'A1');
  eq('last 4 only',   j.last4, '1111');
  eq('declined JSON', Moneris.parseResponse('{"result":"DECLINED","message":"Insufficient funds"}', cfg).reason,
     'Insufficient funds');
  eq('broken JSON is a failure', Moneris.parseResponse('{"result":', cfg).approved, false);
  eq('a numeric code is NOT assumed to mean approved',
    Moneris.parseResponse('{"responseCode":"00"}', cfg).approved, false);

  console.log('\nMoneris sale and refund through the socket');
  store = { terminal_type: 'moneris', moneris_host: '192.168.0.60', moneris_port: '8443', moneris_ecr: 'TILL2' };
  socketCalls = [];
  socketReply = { ok: true, data: 'TILL2|APPROVED|654321|MREF1|4242|MC' };
  const sale = await Terminal.sale(2599, 'ext9', null, { manualEntry: false });
  eq('sent to the configured address', [socketCalls[0].host, socketCalls[0].port], ['192.168.0.60', 8443]);
  eq('the exact request',              socketCalls[0].data, 'TILL2|PURCHASE|25.99|ext9\n');
  eq('acknowledgement length passed',  socketCalls[0].ackMaxLen, 1);
  eq('normalised result — amount in cents', sale.amount, 2599);
  eq('reference becomes the payment id',    sale.paymentId, 'MREF1');
  eq('card block in the shape the receipt prints',
    sale.card, { cardType: 'MC', last4: '4242', authCode: '654321', referenceId: 'MREF1', entryType: null });

  // A framed protocol supplies its own end byte and wants NO terminator added.
  store.moneris_terminator = '';
  store.moneris_tmpl_sale  = '\\x02{amount}\\x03';
  socketCalls = [];
  await Terminal.sale(100, 'e');
  eq('a blank terminator is honoured, and typed \\x02 / \\x03 become real control bytes',
    socketCalls[0].data, '\x021.00\x03');
  delete store.moneris_terminator; delete store.moneris_tmpl_sale;

  socketCalls = [];
  await Terminal.refund(500, 'MREF1');
  eq('refund request carries the original reference', socketCalls[0].data, 'TILL2|REFUND|5.00|MREF1\n');

  socketReply = { ok: true, data: 'TILL2|DECLINED|||' };
  check('a decline throws — it is never recorded as paid',
    !!(await throwsAsync(() => Terminal.sale(100, 'x'))));
  socketReply = { ok: false, message: 'The terminal did not answer in time.' };
  check('a timeout surfaces the socket message',
    /did not answer/.test((await throwsAsync(() => Terminal.sale(100, 'x')))?.message || ''));
  socketReply = { ok: false, cancelled: true };
  eq('a cancel is an AbortError, so the till closes quietly',
    (await throwsAsync(() => Terminal.sale(100, 'x')))?.name, 'AbortError');
  cancelCalls = 0;
  await Terminal.cancel();
  eq('cancel tells the socket to stop waiting', cancelCalls, 1);

  socketReply = { ok: true, data: '' };
  const ping = await Terminal.ping();
  eq('ping connects without sending anything', socketCalls[socketCalls.length - 1].data, null);
  eq('and reports success', ping.ok, true);

  /* ═══ The socket in main.js ═════════════════════════════════════════════ */
  console.log('\nonly local network addresses are allowed');
  ['10.0.0.5', '192.168.1.20', '172.16.0.1', '172.31.255.254', '127.0.0.1', '169.254.3.4']
    .forEach(ip => check(`${ip} allowed`, Sock.isPrivateIPv4(ip)));
  ['8.8.8.8', '172.32.0.1', '172.15.0.1', '192.169.0.1', 'moneris.com', '192.168.1', '999.1.1.1', '', null,
   '192.168.0.1.evil.com', '10.0.0.5:80']
    .forEach(ip => check(`${JSON.stringify(ip)} refused`, !Sock.isPrivateIPv4(ip)));

  console.log('\nthe log never holds a card number');
  eq('16 digits reduced to last 4', Sock.redactForTerminalLog('PAN=4111111111111111|OK'), 'PAN=[card ****1111]|OK');
  eq('short numbers left alone',    Sock.redactForTerminalLog('AMT=1350|AUTH=123456'), 'AMT=1350|AUTH=123456');
  eq('control bytes made visible',  Sock.redactForTerminalLog('\x02A\x03\n'), '\\x02A\\x03\\x0a');

  const logLines = [];
  const log = l => logLines.push(l);
  const exchange = (o, hooks) => Sock.terminalSocketExchange(net, { idleMs: 120, timeoutMs: 1500, ...o }, log, hooks);

  console.log('\nrefusals happen before any connection');
  const r1 = await exchange({ host: '8.8.8.8', port: 80, data: 'x' });
  eq('public address refused', r1.ok, false);
  check('with a message naming the fix', /local network IP/.test(r1.message));
  eq('bad port refused', (await exchange({ host: '127.0.0.1', port: 0, data: 'x' })).ok, false);

  console.log('\na normal exchange');
  let t = await fakeTerminal((sock, got) => sock.write('ECHO:' + got));
  const r2 = await exchange({ host: '127.0.0.1', port: t.port, data: 'POS1|PURCHASE|13.50|a\n' });
  eq('reply returned', r2, { ok: true, data: 'ECHO:POS1|PURCHASE|13.50|a\n' });
  check('the send was logged', logLines.some(l => /SEND POS1\|PURCHASE/.test(l)));
  check('the reply was logged', logLines.some(l => /RECV ECHO:/.test(l)));
  t.server.close();

  console.log('\nan acknowledgement is not mistaken for the result');
  t = await fakeTerminal((sock) => {
    sock.write('\x06');                                         // ACK at once
    setTimeout(() => sock.write('POS1|APPROVED|1|R'), 400);     // result after the card is run
  });
  const r3 = await exchange({ host: '127.0.0.1', port: t.port, data: 'x', ackMaxLen: 1 });
  eq('the real result is returned', r3.data, 'POS1|APPROVED|1|R');
  check('the ACK was logged as an ACK', logLines.some(l => /ACK  \\x06/.test(l)));
  t.server.close();

  t = await fakeTerminal((sock) => {
    sock.write('\x06');
    setTimeout(() => sock.write('POS1|APPROVED|1|R'), 400);
  });
  const r3b = await exchange({ host: '127.0.0.1', port: t.port, data: 'x', ackMaxLen: 0 });
  eq('with ACK handling off, the ACK IS the reply (why the setting exists)', r3b.data, '\x06');
  t.server.close();

  console.log('\ncard numbers in a real reply stay out of the log');
  logLines.length = 0;
  t = await fakeTerminal((sock) => sock.write('APPROVED|5555444433332222|MC'));
  const r4 = await exchange({ host: '127.0.0.1', port: t.port, data: 'x' });
  check('the caller still gets the raw reply to parse', /5555444433332222/.test(r4.data));
  check('the log does not', !logLines.some(l => /5555444433332222/.test(l)));
  check('the log keeps the last 4', logLines.some(l => /\*\*\*\*2222/.test(l)));
  t.server.close();

  console.log('\nfailure modes resolve with a message — they never hang or throw');
  t = await fakeTerminal(() => { /* never answers */ });
  const r5 = await exchange({ host: '127.0.0.1', port: t.port, data: 'x', timeoutMs: 1000 });
  eq('a silent terminal times out', r5.ok, false);
  check('and warns to check the terminal before retrying', /Check the transaction on the terminal/.test(r5.message));
  t.server.close();

  const closed = await fakeTerminal(() => {});
  const deadPort = closed.port;
  await new Promise(r => closed.server.close(r));
  const r6 = await exchange({ host: '127.0.0.1', port: deadPort, data: 'x' });
  eq('nothing listening → refused', r6.ok, false);
  check('with advice about the port', /refused the connection/.test(r6.message));

  t = await fakeTerminal((sock) => sock.end());
  const r7 = await exchange({ host: '127.0.0.1', port: t.port, data: 'x' });
  eq('closed without replying is a failure', r7.ok, false);
  t.server.close();

  t = await fakeTerminal((sock) => sock.end('POS1|APPROVED|1|R'));
  const r8 = await exchange({ host: '127.0.0.1', port: t.port, data: 'x' });
  eq('a reply followed by a close is still returned', r8.data, 'POS1|APPROVED|1|R');
  t.server.close();

  console.log('\nconnection test and cancel');
  let gotData = false;
  t = await fakeTerminal(() => { gotData = true; });
  const r9 = await exchange({ host: '127.0.0.1', port: t.port, data: null });
  eq('connect-only succeeds', r9.ok, true);
  await new Promise(r => setTimeout(r, 100));
  eq('and sent the terminal nothing', gotData, false);
  t.server.close();

  t = await fakeTerminal(() => {});
  let handle = null;
  const pending = exchange({ host: '127.0.0.1', port: t.port, data: 'x', timeoutMs: 5000 }, { onSocket: h => { handle = h; } });
  await new Promise(r => setTimeout(r, 150));
  handle.cancel();
  const r10 = await pending;
  eq('cancel resolves at once', [r10.ok, r10.cancelled], [false, true]);
  t.server.close();

  /* ═══ The till ══════════════════════════════════════════════════════════ */
  console.log('\nthe till routes by terminal, and the Clover path is intact');
  const pos = fs.readFileSync(path.join(ROOT, 'js/screens/pos.js'), 'utf8');
  check('non-Clover terminals leave _runCloverPayment before any Clover call',
    pos.indexOf("if (terminalType !== 'clover') {") > pos.indexOf('async _runCloverPayment(') &&
    pos.indexOf("if (terminalType !== 'clover') {") < pos.indexOf('const configured = await CloverAPI.isConfigured();'));
  check('Clover sale call unchanged',
    pos.includes('await CloverAPI.sale(Math.round(totals.total_amount * 100), externalId, controller.signal, cardEntryMethods);'));
  check('Clover refund call unchanged',
    /CloverAPI\.refund\(\s*refundAmtCents,\s*cardPayment\.clover_payment_id \|\| null\s*\)/.test(pos));
  check('Clover refund only runs when the terminal is Clover',
    pos.includes("if (terminalType === 'clover' && cardPayment && refundAmtCents > 0) {"));
  check('a standalone refund is confirmed before any record is saved',
    pos.indexOf('Refund stopped. No record created.') < pos.indexOf('DB.createRefundTransaction(txnId, returnItems'));
  check('a failed terminal reply offers "record it" rather than only retry',
    pos.includes('Terminal shows APPROVED — record it'));
  check('the standalone form keeps only 4 digits',
    pos.includes("last4El.value.replace(/\\D/g, '').slice(-4)"));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
