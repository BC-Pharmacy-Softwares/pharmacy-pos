/**
 * clover-local-pay / server.js  (Network Pay Display — WebSocket)
 *
 * Connects to the Clover device via WebSocket (Network Pay Display app).
 * No OAuth token needed — pairs with a 6-digit code shown on the device screen.
 *
 * Setup:
 *   1. On Clover: open "Network Pay Display" app → press Start
 *   2. Copy .env.example → .env, set CLOVER_DEVICE_IP
 *   3. npm start
 *   4. In POS Settings → API Credentials → Clover → click "Pair with Device"
 */

'use strict';

require('dotenv').config();

const express   = require('express');
const WebSocket = require('ws');
const fs        = require('fs');
const path      = require('path');
const { v4: uuidv4 } = require('uuid');

const {
  CLOVER_DEVICE_IP,
  CLOVER_DEVICE_PORT = '12345',
  CLOVER_POS_ID      = 'PharmacyPOS',
  PORT               = '3001',
} = process.env;

if (!CLOVER_DEVICE_IP) {
  console.error('[ERROR] Missing required .env value: CLOVER_DEVICE_IP');
  console.error('        Copy .env.example to .env and set CLOVER_DEVICE_IP to your device IP.');
  console.error('        (Shown on Clover device: Network Pay Display app)');
  process.exit(1);
}

const WSS_URL     = `wss://${CLOVER_DEVICE_IP}:${CLOVER_DEVICE_PORT}/remote_pay`;
const TOKEN_FILE  = path.join(__dirname, '.clover-token');
const APP_ID          = 'com.pharmacypos.register';
// packageName expected by the Clover Network Pay Display WebSocket router.
// From Clover SDK source (WebSocketCloverDeviceConfiguration.getMessagePackageName):
// uses underscore between 'remote' and 'protocol' — NOT the same as the device's own
// broadcast app package (which uses dots). This is a routing tag, not an Android pkg name.
const MSG_PACKAGE     = 'com.clover.remote_protocol_broadcast.app';

// ── State ─────────────────────────────────────────────────────────────────

let ws                  = null;
let pairingStatus       = 'disconnected'; // disconnected | connecting | awaiting_code | paired | ready
let pairingCodeToShow   = null;  // 4-digit code sent by device for user to enter ON the Clover
let authToken           = null;
let pendingPairCb       = null;  // {resolve, reject} waiting for PAIRING_RESPONSE
let pendingSale         = null;  // {resolve, reject, timer}
let reconnectTimer      = null;

// ── Token persistence ─────────────────────────────────────────────────────

function loadToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      authToken = fs.readFileSync(TOKEN_FILE, 'utf8').trim() || null;
      if (authToken) console.log('[clover] Saved pairing token loaded.');
    }
  } catch (_) {}
}

function saveToken(token) {
  authToken = token;
  try { fs.writeFileSync(TOKEN_FILE, token, 'utf8'); } catch (_) {}
  console.log('[clover] Pairing token saved.');
}

function clearToken() {
  authToken = null;
  try { fs.unlinkSync(TOKEN_FILE); } catch (_) {}
}

// ── WebSocket helpers ─────────────────────────────────────────────────────

function wsSend(method, payload = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  const msg = {
    id:          uuidv4(),
    type:        'MSG_REQUEST',
    packageName: MSG_PACKAGE,   // from Clover SDK: com.clover.remote_protocol_broadcast.app
    method,
    version:     1,
    payload:     JSON.stringify(payload),
  };
  console.log('[clover] → sending', method);
  ws.send(JSON.stringify(msg));
  return true;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (pairingStatus !== 'paired' && pairingStatus !== 'connecting') {
      console.log('[clover] Auto-reconnecting…');
      connect();
    }
  }, 5000);
}

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

  pairingStatus = 'connecting';
  console.log(`[clover] Connecting to ${WSS_URL}`);

  ws = new WebSocket(WSS_URL, {
    rejectUnauthorized: false,   // Clover uses a self-signed cert on the local network
  });

  ws.on('open', () => {
    console.log('[clover] Connected — sending PAIRING_REQUEST');
    // Use wsSend so PAIRING_REQUEST gets the same packageName as all other messages
    wsSend('PAIRING_REQUEST', {
      applicationId:        APP_ID,
      name:                 CLOVER_POS_ID,
      serialNumber:         CLOVER_POS_ID,
      authenticationToken:  authToken || null,
      supportsShowOnDevice: true,
    });
  });

  ws.on('message', (raw) => {
    const text = raw.toString('utf8');
    let msg;
    try { msg = JSON.parse(text); } catch (_) { return; }
    // Log full raw message for debugging (truncated)
    const preview = text.length > 300 ? text.substring(0, 300) + '…' : text;
    if (msg.method !== 'ACK') console.log('[clover] RAW ←', preview);
    // Clover sends payload as a JSON string — parse it
    let payload = msg.payload;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) {}
    }
    handleMessage(msg.method, payload || {});
  });

  ws.on('close', () => {
    console.log('[clover] WebSocket closed.');
    if (pendingSale) {
      clearTimeout(pendingSale.timer);
      pendingSale.reject(Object.assign(new Error('Clover device disconnected.'), { code: 'DISCONNECTED' }));
      pendingSale = null;
    }
    if (pairingStatus === 'awaiting_code') {
      pairingStatus = 'disconnected';
      console.log('[clover] Waiting for code to be entered on Clover screen — reconnecting in 8s…');
      setTimeout(() => {
        if (pairingCodeToShow) connect();
      }, 8000);
    } else if (pairingStatus === 'paired' || pairingStatus === 'ready') {
      pairingStatus = 'disconnected';
      scheduleReconnect();
    } else {
      pairingStatus = 'disconnected';
    }
  });

  ws.on('error', err => {
    console.error('[clover] WS error:', err.message);
    // 'close' fires after 'error', so reconnect is handled there
  });
}

// ── Incoming message handler ──────────────────────────────────────────────

function handleMessage(method, payload) {
  console.log('[clover] ←', method);

  switch (method) {
    case 'PAIRING_CODE': {
      // Device is sending us the code — user must type this on the Clover screen
      const code = payload.code || payload.pairingCode || payload.pairing_code || '';
      pairingCodeToShow = String(code).trim();
      pairingStatus     = 'awaiting_code';
      console.log(`[clover] *** Show this code to the user → enter it on the Clover device: ${pairingCodeToShow} ***`);
      if (pendingPairCb) {
        pendingPairCb.resolve({ status: 'awaiting_code', pairingCode: pairingCodeToShow });
        pendingPairCb = null;
      }
      break;
    }

    case 'DISCOVERY_REQUEST': {
      // Device is asking what capabilities our POS supports — reply with DISCOVERY_RESPONSE
      console.log('[clover] Device sent DISCOVERY_REQUEST — replying with DISCOVERY_RESPONSE');
      wsSend('DISCOVERY_RESPONSE', {
        applicationId:              APP_ID,
        supportsAcks:               true,
        supportsVaultCards:         false,
        supportsTipAdjust:          false,
        supportsManualRefunds:      false,
        supportsMultiPayToken:      false,
        supportsRemoteConfirmation: false,
        supportsNakedCredit:        false,
        supportsSelectCheckout:     false,
        supportsCustomActivity:     false,
      });
      pairingStatus = 'ready';
      console.log('[clover] ✓ Device ready');
      break;
    }

    case 'DISCOVERY_RESPONSE': {
      // Shouldn't normally arrive, but handle defensively
      pairingStatus = 'ready';
      console.log('[clover] ✓ Device ready (DISCOVERY_RESPONSE received)');
      break;
    }

    case 'PAIRING_RESPONSE': {
      const respCode = (payload.pairingState || payload.code || '').toUpperCase();
      if (respCode === 'PAIRED' || respCode === 'OK') {
        pairingStatus     = 'paired';
        pairingCodeToShow = null;
        if (payload.authenticationToken) saveToken(payload.authenticationToken);
        console.log('[clover] ✓ Pairing successful — waiting for device DISCOVERY_REQUEST…');
        // Do NOT initiate DISCOVERY_REQUEST — the device sends it to us.
        // We respond with DISCOVERY_RESPONSE when it arrives (see case below).
        if (pendingPairCb) { pendingPairCb.resolve({ status: 'paired' }); pendingPairCb = null; }
      } else if (respCode === 'FAILED' || respCode === 'FAIL') {
        pairingStatus     = 'disconnected';
        pairingCodeToShow = null;
        clearToken();
        console.log('[clover] ✗ Pairing failed — try again');
        if (pendingPairCb) { pendingPairCb.reject(new Error('Pairing failed. Try again.')); pendingPairCb = null; }
      }
      // Other states (INITIAL etc.) — device is still initialising, wait for PAIRING_CODE
      break;
    }

    case 'FINISH_OK': {
      if (!pendingSale) break;
      clearTimeout(pendingSale.timer);
      const payment = payload.payment || {};
      pendingSale.resolve({
        ok:        true,
        paymentId: payment.id,
        amount:    payment.amount,
        cardType:  payment.cardTransaction?.cardType || null,
        last4:     payment.cardTransaction?.last4    || null,
        result:    'SUCCESS',
      });
      pendingSale = null;
      break;
    }

    case 'FINISH_CANCEL': {
      if (!pendingSale) break;
      clearTimeout(pendingSale.timer);
      pendingSale.reject(Object.assign(
        new Error('Payment was cancelled on the terminal.'),
        { code: 'PAYMENT_CANCELLED' }
      ));
      pendingSale = null;
      break;
    }

    case 'FINISH_FAIL': {
      console.error('[clover] FINISH_FAIL:', JSON.stringify(payload));
      if (!pendingSale) break;
      clearTimeout(pendingSale.timer);
      const reason = payload.reason || payload.message || payload.result || 'Payment failed on terminal.';
      pendingSale.reject(Object.assign(new Error(reason), { code: 'PAYMENT_FAILED' }));
      pendingSale = null;
      break;
    }

    case 'REMOTE_ERROR': {
      console.error('[clover] REMOTE_ERROR:', JSON.stringify(payload));
      if (pendingSale) {
        clearTimeout(pendingSale.timer);
        pendingSale.reject(Object.assign(
          new Error(payload.message || payload.cause || 'Remote error from Clover device.'),
          { code: 'REMOTE_ERROR' }
        ));
        pendingSale = null;
      }
      break;
    }
  }
}

// ── Express ───────────────────────────────────────────────────────────────

const app = express();

// Allow the POS browser (any localhost port) to call this service
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Ping / status ─────────────────────────────────────────────────────────

app.get('/clover/ping', (req, res) => {
  res.json({ ok: pairingStatus === 'ready' || pairingStatus === 'paired', status: pairingStatus, device: WSS_URL });
});

app.get('/clover/pair/status', (req, res) => {
  res.json({
    status:      pairingStatus,
    paired:      pairingStatus === 'paired',
    pairingCode: pairingCodeToShow || null,  // 4-digit code for user to enter on Clover
  });
});

// ── Pairing ───────────────────────────────────────────────────────────────

// Step 1 — POS calls this to initiate pairing. Connect if not already connected.
// After this returns, the Clover screen will show a 6-digit code.
app.post('/clover/pair/start', (req, res) => {
  if (pairingStatus === 'paired') {
    return res.json({ ok: true, status: 'paired', message: 'Already paired.' });
  }
  // Disconnect cleanly before reconnecting
  if (ws) { ws.terminate(); ws = null; }
  authToken         = null;
  pairingCodeToShow = null;

  // Wait up to 20s for PAIRING_CODE from device
  const timer = setTimeout(() => {
    pendingPairCb = null;
    res.json({ ok: true, status: 'connecting', pairingCode: null,
               message: 'Connecting… check the Clover screen for a code.' });
  }, 20_000);

  pendingPairCb = {
    resolve: (result) => {
      clearTimeout(timer);
      res.json({ ok: true, ...result });
    },
    reject: (err) => {
      clearTimeout(timer);
      res.status(500).json({ ok: false, message: err.message });
    },
  };

  connect();
});

// Step 2 — User reads the code from the Clover screen and submits it here.
app.post('/clover/pair/code', (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!code) return res.status(400).json({ ok: false, message: 'code is required.' });

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ ok: false, message: 'Not connected to device. Start pairing first.' });
  }
  if (pairingStatus !== 'awaiting_code') {
    return res.json({ ok: true, status: pairingStatus, message: 'Already in state: ' + pairingStatus });
  }

  wsSend('PAIRING_CODE', { code });
  pairingStatus = 'connecting'; // waiting for PAIRING_RESPONSE

  const timer = setTimeout(() => {
    pendingPairCb = null;
    res.status(504).json({ ok: false, message: 'Timed out waiting for device. Try pairing again.' });
  }, 15_000);

  pendingPairCb = {
    resolve: (outcome) => {
      clearTimeout(timer);
      if (outcome === 'awaiting_code') {
        res.status(401).json({ ok: false, message: 'Code was incorrect. Check the Clover screen and try again.' });
      } else {
        res.json({ ok: true, status: 'paired', message: 'Paired successfully!' });
      }
    },
    reject: () => {
      clearTimeout(timer);
      res.status(500).json({ ok: false, message: 'Pairing failed.' });
    },
  };
});

// Forget pairing (force re-pair next time)
app.post('/clover/pair/forget', (req, res) => {
  clearToken();
  if (ws) { ws.terminate(); ws = null; }
  pairingStatus = 'disconnected';
  res.json({ ok: true, message: 'Pairing forgotten. Restart the service to re-pair.' });
});

// ── Display order on Clover screen ────────────────────────────────────────

app.post('/clover/display-order', (req, res) => {
  if (pairingStatus !== 'paired') {
    return res.status(503).json({ ok: false, message: 'Clover not paired.' });
  }

  const { subtotal, tax, total, lineItems = [] } = req.body;
  const toCents = v => Math.round(parseFloat(v) * 100);

  wsSend('SHOW_ORDER_SCREEN', {
    order: {
      lineItems: lineItems.map((item, i) => ({
        id:            String(i + 1),
        name:          String(item.name || '').substring(0, 64),
        price:         toCents(item.price),
        quantity:      String(item.quantity || 1),
        unitQty:       1000,
        unitName:      'unit',
        discounts:     [],
        modifications: [],
      })),
    },
    subtotal: toCents(subtotal),
    tax:      toCents(tax),
    total:    toCents(total),
  });

  res.json({ ok: true });
});

// ── Sale ──────────────────────────────────────────────────────────────────

app.post('/clover/sale', (req, res) => {
  const { amount, externalPaymentId, cardEntryMethods = 15 } = req.body;

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ ok: false, message: '"amount" must be a positive integer (cents).' });
  }
  if (!externalPaymentId) {
    return res.status(400).json({ ok: false, message: '"externalPaymentId" is required.' });
  }
  if (pairingStatus !== 'ready' && pairingStatus !== 'paired') {
    return res.status(503).json({
      ok: false, code: 'NOT_PAIRED',
      message: `Clover not ready (status: ${pairingStatus}). Go to Settings → API Credentials → Clover to pair.`,
    });
  }
  if (pendingSale) {
    return res.status(409).json({ ok: false, message: 'A payment is already in progress on the terminal.' });
  }

  const timer = setTimeout(() => {
    pendingSale = null;
    wsSend('CANCEL_PAYMENT', {});
    res.status(504).json({ ok: false, code: 'TIMEOUT', message: 'Payment timed out after 90 seconds.' });
  }, 90_000);

  pendingSale = {
    resolve: result => res.json(result),
    reject:  err    => {
      const status = err.code === 'PAYMENT_CANCELLED' ? 422 : 500;
      res.status(status).json({ ok: false, code: err.code || 'ERROR', message: err.message });
    },
    timer,
  };

  wsSend('TX_START', {
    payIntent: {
      action:            'SALE',
      amount,
      tipAmount:         0,
      tippableAmount:    amount,
      taxAmount:         0,
      externalPaymentId,
      // 1=swipe  2=chip  4=tap  8=manual  → 15 = accept all
      cardEntryMethods:  typeof cardEntryMethods === 'number' ? cardEntryMethods : 15,
      disableCashback:   true,
      tipMode:           'NO_TIP',
      transactionSettings: {
        // false = device can retry on chip-read failure (insert→retry flow)
        disableRestartTransactionOnFailure: false,
        promptForSignature:                 false,
        signatureEntryLocation:             'NONE',
        signatureThreshold:                 0,
      },
    },
  });

  console.log(`[clover] TX_START → ${amount}¢  id:${externalPaymentId}  cardEntryMethods:${cardEntryMethods}`);
});

// ── Cancel ────────────────────────────────────────────────────────────────

app.post('/clover/cancel', (req, res) => {
  wsSend('CANCEL_PAYMENT', {});
  if (pendingSale) {
    clearTimeout(pendingSale.timer);
    pendingSale.reject(Object.assign(new Error('Cancelled by POS.'), { code: 'CANCELLED_BY_POS' }));
    pendingSale = null;
  }
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────

const port = parseInt(PORT);
app.listen(port, () => {
  console.log('');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│  Clover Local Pay  (Network Pay Display)    │');
  console.log(`│  http://localhost:${port}                      │`);
  console.log('└─────────────────────────────────────────────┘');
  console.log(`→ Device: ${WSS_URL}`);
  console.log(`→ POS ID: ${CLOVER_POS_ID}`);
  console.log('');
  loadToken();
  connect();
});
