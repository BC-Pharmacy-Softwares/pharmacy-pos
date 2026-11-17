/* ============================================================
   moneris.js — Moneris Core Semi-Integrated (V400c / V400m)

   HOW THIS TALKS TO THE TERMINAL
   The POS opens a TCP socket to the terminal on the local network and
   writes a request; the terminal runs the card and writes a reply back.
   That part is documented by Moneris: set the terminal's "Listening Port"
   and give it a STATIC IP, and put the POS on the same network
   (Ethernet, USB or Wi-Fi).

   WHY THE MESSAGE FORMAT IS A SETTING, NOT CODE
   Moneris does not publish the Core Semi-Integrated message format — it
   comes with your integration package from Moneris. So this driver does
   NOT hard-code a guess. The request template, the amount format and the
   response field positions are all configurable in
   Settings → Card Terminal, and every byte sent and received is written
   to the terminal log (card numbers redacted) so the first real
   transaction shows you exactly what to put in those boxes.

   That is deliberate. In 1.4.11 and 1.4.12 two releases were spent
   guessing at Clover's payload shape before 1.4.13 read a real one off
   the wire and fixed it in an afternoon. Log first, guess never.

   Until the format is confirmed, Settings → Card Terminal →
   "Standalone terminal (any brand)" takes card payments on ANY device.
   ============================================================ */

const MonerisAPI = (() => {

  const DEFAULTS = {
    port:          '',          // read it off the terminal's Listening Port field
    ecr:           'POS1',
    tmpl_sale:     '{ecr}|PURCHASE|{amount}|{ref}',
    tmpl_refund:   '{ecr}|REFUND|{amount}|{ref}',
    terminator:    '\\n',
    amount_format: 'dollars',   // 'dollars' (13.50) or 'cents' (1350)
    resp_sep:      '|',
    resp_approved_idx:   '1',
    resp_approved_value: 'APPROVED',
    resp_auth_idx:       '2',
    resp_ref_idx:        '3',
    resp_last4_idx:      '4',
    resp_card_idx:       '5',
    timeout_s:     '120',
    // A reply is complete after this much silence. Replies of at most
    // ack_max_len bytes are bare acknowledgements: the terminal ACKs at once
    // and sends the real result after the card is run.
    idle_ms:       '800',
    ack_max_len:   '1',
  };

  const cfgKey = k => `moneris_${k}`;

  async function _cfg() {
    const out = {};
    for (const k of Object.keys(DEFAULTS)) {
      const v = await Config.get(cfgKey(k));
      // A blank terminator is a real choice (a framed protocol ends with its
      // own \x03), so only a never-saved one falls back to the default.
      const unset = v === null || v === undefined || (v === '' && k !== 'terminator');
      out[k] = unset ? DEFAULTS[k] : v;
    }
    out.host = (await Config.get('moneris_host')) || '';
    return out;
  }

  async function isConfigured() {
    const host = await Config.get('moneris_host');
    const port = await Config.get('moneris_port');
    return !!(host && String(host).trim() && port && String(port).trim());
  }

  /* "\n" typed into a settings box arrives as a backslash and an n. */
  function _unescape(s) {
    return String(s ?? '')
      .replace(/\\r/g, '\r').replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t').replace(/\\x02/gi, '\x02')
      .replace(/\\x03/gi, '\x03').replace(/\\0/g, '\0');
  }

  function _amount(cents, format) {
    const n = Math.round(Number(cents) || 0);
    return format === 'cents' ? String(n) : (n / 100).toFixed(2);
  }

  /* The template is unescaped BEFORE the values go in, so "\x02" typed in the
     settings box becomes the real control byte while a reference that happens
     to contain a backslash is sent exactly as it is. */
  function buildRequest(tmpl, { ecr, amount, ref }) {
    return _unescape(tmpl)
      .replace(/\{ecr\}/g,    ecr    ?? '')
      .replace(/\{amount\}/g, amount ?? '')
      .replace(/\{ref\}/g,    ref    ?? '');
  }

  /* A reply is either JSON (if it starts with '{') or separated fields whose
     positions the integrator sets. Anything we cannot read comes back null
     rather than a wrong value — a receipt with no auth code is recoverable,
     a receipt with the WRONG auth code is not. */
  function parseResponse(raw, cfg) {
    const text = String(raw ?? '').trim();
    if (!text) return { ok: false, approved: false, reason: 'The terminal sent no reply.', raw: text };

    if (text.startsWith('{')) {
      let j = null;
      try { j = JSON.parse(text); } catch (_) {
        return { ok: false, approved: false, reason: 'The terminal replied with JSON the POS could not read.', raw: text };
      }
      // Only an explicit word counts. A numeric code like "00" is NOT assumed
      // to mean approved — guessing wrong here would record an unpaid sale as paid.
      const approved = /^(approved|approval)$/i.test(
        String(j.result ?? j.status ?? '').trim());
      return {
        ok: approved, approved,
        authCode:  j.authCode ?? j.auth_code ?? j.authorizationCode ?? null,
        reference: j.referenceNumber ?? j.reference ?? j.rrn ?? j.transactionId ?? null,
        last4:     _last4(j.last4 ?? j.maskedPan ?? j.cardNumber ?? null),
        cardType:  j.cardType ?? j.brand ?? j.cardBrand ?? null,
        reason:    approved ? null : (j.message ?? j.errorMessage ?? 'The terminal declined the card.'),
        raw: text,
      };
    }

    const sep    = _unescape(cfg.resp_sep) || '|';
    const parts  = text.split(sep).map(s => s.trim());
    const at     = (idx) => {
      const i = parseInt(idx, 10);
      return Number.isInteger(i) && i >= 0 && i < parts.length ? parts[i] : null;
    };
    const verdict  = at(cfg.resp_approved_idx);
    const approved = verdict !== null &&
      verdict.toUpperCase() === String(cfg.resp_approved_value || '').toUpperCase();
    return {
      ok: approved, approved,
      authCode:  at(cfg.resp_auth_idx),
      reference: at(cfg.resp_ref_idx),
      last4:     _last4(at(cfg.resp_last4_idx)),
      cardType:  at(cfg.resp_card_idx),
      reason:    approved
        ? null
        : (verdict ? `The terminal replied "${verdict}".` : 'The terminal reply did not match the expected format.'),
      raw: text,
    };
  }

  /* Only ever keep the last 4 digits. A full PAN must not reach the database,
     the receipt or the log — same rule as the Clover bridge. */
  function _last4(v) {
    if (v === null || v === undefined) return null;
    const digits = String(v).replace(/\D/g, '');
    if (!digits) return null;
    return digits.slice(-4);
  }

  async function _send(payload, timeoutMs, signal) {
    if (!window.electronAPI?.terminalSocket) {
      throw new Error('Moneris terminals need the desktop app — this is not available in a browser.');
    }
    const cfg = await _cfg();
    if (!cfg.host || !cfg.port) {
      throw new Error('The Moneris terminal address is not set. Go to Settings → Card Terminal.');
    }
    const res = await window.electronAPI.terminalSocket({
      host: String(cfg.host).trim(),
      port: parseInt(cfg.port, 10),
      data: payload,
      timeoutMs,
      idleMs:    parseInt(cfg.idle_ms, 10) || 800,
      ackMaxLen: parseInt(cfg.ack_max_len, 10) || 0,
      label: 'moneris',
    });
    if (res?.cancelled || signal?.aborted) {
      throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    }
    if (!res?.ok) throw new Error(res?.message || 'Could not reach the Moneris terminal.');
    return res.data;
  }

  /* Opens the socket and closes it. Confirms the address, the port and that
     the terminal is listening — nothing more, and it takes no payment. */
  async function ping() {
    const cfg = await _cfg();
    if (!window.electronAPI?.terminalSocket) {
      return { ok: false, message: 'Only available in the desktop app.' };
    }
    const res = await window.electronAPI.terminalSocket({
      host: String(cfg.host).trim(),
      port: parseInt(cfg.port, 10),
      data: null,                 // connect only
      timeoutMs: 5000,
      label: 'moneris-ping',
    });
    return res?.ok
      ? { ok: true, message: `Connected to ${cfg.host}:${cfg.port}.` }
      : { ok: false, message: res?.message || 'Could not connect.' };
  }

  async function sale(amountCents, externalId, signal = null, opts = {}) {
    const cfg  = await _cfg();
    const body = buildRequest(cfg.tmpl_sale, {
      ecr: cfg.ecr, amount: _amount(amountCents, cfg.amount_format), ref: externalId,
    }) + _unescape(cfg.terminator);

    const raw = await _send(body, (parseInt(cfg.timeout_s, 10) || 120) * 1000, signal);
    const r   = parseResponse(raw, cfg);
    if (!r.approved) throw new Error(r.reason || 'The card was declined.');

    return {
      ok: true,
      paymentId: r.reference || null,
      amount:    Math.round(Number(amountCents) || 0),
      cardType:  r.cardType || null,
      last4:     r.last4 || null,
      // Same shape print.js already renders for Clover, so a Moneris receipt
      // prints its card block through the existing code.
      card: (r.cardType || r.last4 || r.authCode) ? {
        cardType: r.cardType || null,
        last4:    r.last4    || null,
        authCode: r.authCode || null,
        referenceId: r.reference || null,
        entryType: opts.manualEntry ? 'MANUAL' : null,
      } : null,
      result: 'APPROVED',
    };
  }

  /* Moneris refunds are keyed by the original reference where the terminal
     supports it; without one it is an independent (unlinked) refund. */
  async function refund(amountCents, originalRef = null, signal = null) {
    const cfg  = await _cfg();
    const body = buildRequest(cfg.tmpl_refund, {
      ecr: cfg.ecr, amount: _amount(amountCents, cfg.amount_format),
      ref: originalRef || Date.now().toString(36),
    }) + _unescape(cfg.terminator);

    const raw = await _send(body, (parseInt(cfg.timeout_s, 10) || 120) * 1000, signal);
    const r   = parseResponse(raw, cfg);
    if (!r.approved) throw new Error(r.reason || 'The terminal refused the refund.');
    return {
      ok: true,
      refundId: r.reference || null,
      amount:   Math.round(Number(amountCents) || 0),
      result:   'APPROVED',
    };
  }

  /* Core Semi-Integrated has no documented "cancel the transaction in
     progress" message, and inventing one could cancel the wrong thing. So the
     POS only STOPS WAITING — the card prompt is cancelled on the terminal's own
     keypad, and the till tells staff so (see pos.js). */
  async function cancel() {
    try { await window.electronAPI?.terminalSocketCancel?.(); } catch (_) {}
  }

  return { isConfigured, ping, sale, refund, cancel,
           buildRequest, parseResponse, DEFAULTS, _amount, _unescape, _last4 };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MonerisAPI;
