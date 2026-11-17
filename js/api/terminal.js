/* ============================================================
   terminal.js — which card terminal this pharmacy uses.

   Until 1.4.19 the POS could only talk to Clover: DEBIT, CREDIT and
   Manual Card Entry all called CloverAPI directly, and with no Clover
   configured they dead-ended on "The card terminal is not set up".
   A pharmacy on Moneris, Square or a bank terminal could not take a card
   payment AT ALL — not even by hand.

   This module is the one place the POS asks "what terminal is this, and
   what can it do?". Drivers behind it:

     clover     — the existing Clover Network Pay Display bridge, UNCHANGED.
     moneris    — Moneris Core Semi-Integrated (V400c / V400m) over the LAN.
                  Transport is real; the MESSAGE FORMAT is configurable
                  because Moneris does not publish it — see moneris.js.
     standalone — any terminal at all. The POS does not talk to it; staff
                  run the card on the terminal and confirm here. Always works.
     none       — no card payments.

   Config key: `terminal_type`. It defaults to 'clover', so every existing
   install behaves exactly as it did before this file existed.
   ============================================================ */

const Terminal = (() => {

  /* mode drives what the POS does at the till:
       auto   — the POS sends the amount to the terminal and waits
       manual — staff run the card themselves, then confirm in the POS
       off    — card payments are not available                        */
  const TYPES = {
    clover: {
      label: 'Clover',
      short: 'Clover',
      blurb: 'Clover Network Pay Display over the local network.',
      mode:  'auto',
      caps:  { customerDisplay: true, autoRefund: true, linkedRefund: true, manualEntry: true },
    },
    moneris: {
      label: 'Moneris Core (Semi-Integrated)',
      short: 'Moneris',
      blurb: 'V400c / V400m countertop terminal over Ethernet, USB or Wi-Fi.',
      mode:  'auto',
      caps:  { customerDisplay: false, autoRefund: true, linkedRefund: true, manualEntry: true },
    },
    standalone: {
      label: 'Standalone terminal (any brand)',
      short: 'card terminal',
      blurb: 'Staff run the card on the terminal, then confirm the amount here.',
      mode:  'manual',
      caps:  { customerDisplay: false, autoRefund: false, linkedRefund: false, manualEntry: false },
    },
    none: {
      label: 'No card terminal',
      short: 'card terminal',
      blurb: 'Cash, Insurance and AR only — the card buttons are hidden.',
      mode:  'off',
      caps:  { customerDisplay: false, autoRefund: false, linkedRefund: false, manualEntry: false },
    },
  };

  const DEFAULT_TYPE = 'clover';

  async function type() {
    const t = await Config.get('terminal_type');
    return TYPES[t] ? t : DEFAULT_TYPE;
  }

  function info(t) { return TYPES[t] || TYPES[DEFAULT_TYPE]; }
  function all()   { return Object.keys(TYPES).map(id => ({ id, ...TYPES[id] })); }

  async function label()  { return info(await type()).label; }
  async function shortLabel() { return info(await type()).short; }
  async function caps()   { return info(await type()).caps; }

  /* 'auto' | 'manual' | 'off'. A driver that is selected but not yet set up
     reports 'off', so the POS says "not set up" rather than hanging on a
     terminal that was never configured. */
  async function mode() {
    const t = await type();
    const m = info(t).mode;
    if (m === 'auto' && !(await isConfigured())) return 'off';
    return m;
  }

  /* The driver object for the selected type, or null for manual/off. */
  async function driver() {
    switch (await type()) {
      case 'clover':  return typeof CloverAPI  !== 'undefined' ? CloverAPI  : null;
      case 'moneris': return typeof MonerisAPI !== 'undefined' ? MonerisAPI : null;
      default:        return null;
    }
  }

  async function isConfigured() {
    const t = await type();
    if (t === 'standalone') return true;      // nothing to configure
    if (t === 'none')       return false;
    const d = await driver();
    if (!d) return false;
    try { return await d.isConfigured(); } catch (_) { return false; }
  }

  /* ── Operations. Each returns the SAME shape whichever driver ran, so the
        POS never branches on vendor:
          sale   → { ok, paymentId, amount (cents), cardType, last4, card, result }
          refund → { ok, refundId, amount (cents), result }                      */

  async function sale(amountCents, externalId, signal = null, opts = {}) {
    const d = await driver();
    if (!d) throw new Error('No card terminal is set up. Go to Settings → Card Terminal.');
    return d.sale(amountCents, externalId, signal, opts);
  }

  async function refund(amountCents, originalRef = null, signal = null) {
    const d = await driver();
    if (!d) throw new Error('No card terminal is set up. Go to Settings → Card Terminal.');
    return d.refund(amountCents, originalRef, signal);
  }

  /* Best-effort. A terminal that cannot be cancelled remotely (or a driver
     that has already finished) must never break the sale path. */
  async function cancel() {
    const d = await driver();
    if (!d || !d.cancel) return;
    try { await d.cancel(); } catch (_) {}
  }

  async function ping() {
    const d = await driver();
    if (!d || !d.ping) throw new Error('This terminal has no connection test.');
    return d.ping();
  }

  /* Only Clover shows the cart on a customer-facing screen. Calling this on a
     terminal without one is a no-op, not an error. */
  async function displayOrder(items, totals, orderId) {
    const t = await type();
    if (!info(t).caps.customerDisplay) return;
    const d = await driver();
    if (!d || !d.displayOrder) return;
    try { await d.displayOrder(items, totals, orderId); } catch (_) {}
  }

  /* Card entry hint for a "card not present" sale. Clover needs its kiosk-mode
     bit mask (see clover.js); other drivers take the plain flag. */
  async function cardEntryOpts(manualEntry) {
    const t = await type();
    if (t === 'clover' && typeof CloverAPI !== 'undefined') {
      return { cardEntryMethods: manualEntry ? CloverAPI.CARD_ENTRY.MANUAL : CloverAPI.CARD_ENTRY.ALL,
               manualEntry: !!manualEntry };
    }
    return { manualEntry: !!manualEntry };
  }

  return { TYPES, all, info, type, label, shortLabel, caps, mode, driver, isConfigured,
           sale, refund, cancel, ping, displayOrder, cardEntryOpts, DEFAULT_TYPE };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Terminal;
