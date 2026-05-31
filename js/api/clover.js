/* ============================================================
   clover.js — Clover Local Pay Display integration
   Calls the clover-local-pay Node.js service running on this
   machine (default http://localhost:3001).
   Configure the URL in Settings → API Credentials → Clover.
   ============================================================ */

const CloverAPI = (() => {

  async function _baseUrl() {
    const url = await Config.get('clover_local_url');
    if (!url) throw new Error('Clover Local Pay service URL not configured. Go to Settings → API Credentials → Clover.');
    return url.replace(/\/$/, '');
  }

  /* POST JSON to the local service, with optional AbortSignal */
  async function _post(path, data = {}, signal = null) {
    const base = await _baseUrl();
    const opts = {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    };
    if (signal) opts.signal = signal;
    const resp = await fetch(`${base}${path}`, opts);
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw Object.assign(new Error(json.message || `HTTP ${resp.status}`), json);
    return json;
  }

  /* Check whether the local service URL is saved in settings */
  async function isConfigured() {
    const url = await Config.get('clover_local_url');
    return !!url;
  }

  /* Ping the local service + Clover device reachability */
  async function ping() {
    const base = await _baseUrl();
    const resp = await fetch(`${base}/clover/ping`);
    return resp.json();
  }

  /* Show cart on the customer-facing terminal display.
     All monetary values are strings per Clover display-order spec. */
  async function displayOrder(items, totals, orderId) {
    return _post('/clover/display-order', {
      orderId,
      subtotal: Tax.fmt(totals.subtotal),
      tax:      Tax.fmt(Tax.round2((totals.gst_amount || 0) + (totals.pst_amount || 0))),
      total:    Tax.fmt(totals.total_amount),
      lineItems: items.map(item => ({
        name:     item.description.substring(0, 64),
        price:    Tax.fmt(item.unit_price),
        quantity: item.quantity || 1,
      })),
    });
  }

  /* Trigger a payment on the terminal.
     amount — integer in cents (e.g. $13.50 → 1350)
     externalPaymentId — your unique order reference
     signal — AbortSignal so the UI cancel button can abort the fetch
     Returns { ok, paymentId, amount, cardType, last4, result } */
  async function sale(amountCents, externalPaymentId, signal = null, cardEntryMethods = 15) {
    return _post('/clover/sale', { amount: amountCents, externalPaymentId, cardEntryMethods }, signal);
  }

  /* Send cancel to the terminal — resets it to the welcome screen */
  async function cancel() {
    const base = await _baseUrl();
    await fetch(`${base}/clover/cancel`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    '{}',
    }).catch(() => {}); // best-effort — device may already be done
  }

  return { isConfigured, ping, displayOrder, sale, cancel };
})();
