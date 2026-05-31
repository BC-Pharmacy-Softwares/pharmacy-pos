/**
 * Pharmacy POS — Cloudflare Worker
 *
 * Acts as a secure proxy between the POS browser and external APIs.
 * All API credentials live here as Worker secrets — never in the POS code.
 *
 * Required secrets (set once via: wrangler secret put <NAME>)
 *   WINRX_API_TOKEN  — Authorization token from pharmacydashboard.ca
 *   POS_KEY          — Shared secret; POS sends this as X-POS-Key header
 *
 * Deploy: wrangler deploy  (from the pos-worker/ folder)
 *
 * ── How it works ────────────────────────────────────────────────────
 * The POS sends:
 *   POST /getPatient
 *   { "PHARMACY_ID": 71, "PHN": "9876543210", "ExternalID": "" }
 *
 * The Worker adds the Authorization header and forwards to:
 *   POST https://www.pharmacydashboard.ca/api/getPatient/
 *   Authorization: TOKEN xxxx
 *   { "PHARMACY_ID": 71, "PHN": "9876543210", "ExternalID": "" }
 *
 * ── Endpoints ───────────────────────────────────────────────────────
 *   POST /ping                — health check
 *   POST /getPatient          — patient demographics by PHN
 *   POST /getPatients         — patient search by DOB + phone
 *   POST /getPatientProfile   — active Rx list by PHN
 *   POST /getRxTx             — fill history + copay by Rx number
 *   POST /getStore            — pharmacy info
 *   POST /mckesson-soap       — McKesson SOAP proxy (catalog sync)
 *   POST /sendEmail           — email proxy (SMTP / Resend / SendGrid / Brevo)
 */

const PD_BASE = 'https://www.pharmacydashboard.ca/api';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-POS-Key',
};

export default {
  async fetch(request, env) {

    // ── CORS preflight ─────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── All real requests must be POST ─────────────────────────────
    if (request.method !== 'POST') {
      return json({ error: 'POST required' }, 405);
    }

    // ── Auth: every request must carry the POS key ─────────────────
    const posKey = request.headers.get('X-POS-Key');
    if (!posKey || posKey !== env.POS_KEY) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const path = new URL(request.url).pathname.replace(/\/$/, '');

    // ── Route ──────────────────────────────────────────────────────
    switch (path) {
      case '/ping':
        return json({ ok: true });

      // ── Pharmacy Dashboard (WinRx) — read endpoints ───────────
      case '/getPatient':
      case '/getPatients':
      case '/getPatientProfile':
      case '/getRxTx':
      case '/getStore':
        return forwardToPD(path.slice(1), request, env, 'GET');

      // ── Pharmacy Dashboard (WinRx) — write endpoints ──────────
      case '/sendPatientDocument':
        return forwardToPD('sendPatientDocument', request, env, 'POST');

      // ── McKesson SOAP proxy ────────────────────────────────────
      case '/mckesson-soap':
        return handleMcKessonSoap(request);

      // ── Email proxy ────────────────────────────────────────────
      case '/sendEmail':
        return handleSendEmail(request);

      default:
        return json({ error: 'Unknown endpoint: ' + path }, 404);
    }
  },
};

// ── Pharmacy Dashboard proxy ───────────────────────────────────────
//
// The POS sends the full JSON body (PHARMACY_ID, PHN, etc.) already formed.
// We just add the Authorization header and forward to PD.

async function forwardToPD(endpoint, request, env, method = 'GET') {
  let body;
  try {
    body = await request.text();
    JSON.parse(body); // validate JSON
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  let resp;
  try {
    // PD read endpoints use GET with JSON body; write endpoints (sendPatientDocument) use POST
    resp = await fetch(`${PD_BASE}/${endpoint}/`, {
      method,
      headers: {
        'Authorization': `TOKEN ${env.WINRX_API_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body,
    });
  } catch (e) {
    return json({ error: 'Failed to reach Pharmacy Dashboard: ' + e.message }, 502);
  }

  const text = await resp.text();
  if (!resp.ok) {
    return json(
      { error: `Pharmacy Dashboard error ${resp.status}`, detail: text },
      resp.status
    );
  }

  return new Response(text, {
    status:  200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── McKesson SOAP proxy ────────────────────────────────────────────

async function handleMcKessonSoap(request) {
  const body       = await request.text();
  const soapAction = request.headers.get('SOAPAction') || '';

  try {
    const resp = await fetch(
      'https://webservices.mckesson.ca/BusinessServices/ORDERS/Service/intfOrders-service.serviceagent',
      {
        method:  'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction':   soapAction,
        },
        body,
      }
    );
    const text = await resp.text();
    return new Response(text, {
      status:  resp.status,
      headers: { ...CORS, 'Content-Type': 'text/xml; charset=utf-8' },
    });
  } catch (e) {
    return json({ error: 'Failed to reach McKesson: ' + e.message }, 502);
  }
}

// ── Email proxy ────────────────────────────────────────────────────

async function handleSendEmail(request) {
  let p;
  try { p = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const toList = (p.to || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!toList.length) return json({ error: 'No recipients' }, 400);

  if (p.service === 'smtp')     return handleSmtpSend({ ...p, toList });
  if (p.service === 'resend')   return handleResend(p, toList);
  if (p.service === 'sendgrid') return handleSendGrid(p, toList);
  if (p.service === 'brevo')    return handleBrevo(p, toList);

  return json({ error: 'Unknown email service: ' + p.service }, 400);
}

async function handleResend(p, toList) {
  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      from:     `${p.fromName} <${p.fromEmail}>`,
      to:       toList,
      reply_to: p.replyTo || undefined,
      subject:  p.subject,
      html:     p.htmlBody || '',
      text:     p.textBody || '',
    }),
  });
  const d = await r.json();
  if (!r.ok) return json({ error: d.message || 'Resend error' }, 400);
  return json({ ok: true, id: d.id });
}

async function handleSendGrid(p, toList) {
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method:  'POST',
    headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      from:             { email: p.fromEmail, name: p.fromName },
      reply_to:         p.replyTo ? { email: p.replyTo } : undefined,
      personalizations: [{ to: toList.map(e => ({ email: e })) }],
      subject:          p.subject,
      content:          [
        { type: 'text/plain', value: p.textBody || ' ' },
        { type: 'text/html',  value: p.htmlBody || '' },
      ],
    }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    return json({ error: (d.errors || []).map(e => e.message).join('; ') || 'SendGrid error' }, 400);
  }
  return json({ ok: true });
}

async function handleBrevo(p, toList) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: { 'api-key': p.apiKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      sender:      { email: p.fromEmail, name: p.fromName },
      replyTo:     p.replyTo ? { email: p.replyTo } : undefined,
      to:          toList.map(e => ({ email: e })),
      subject:     p.subject,
      htmlContent: p.htmlBody || '',
      textContent: p.textBody || '',
    }),
  });
  const d = await r.json();
  if (!r.ok) return json({ error: d.message || 'Brevo error' }, 400);
  return json({ ok: true, messageId: d.messageId });
}

// ── SMTP send (requires nodejs_compat in wrangler.toml) ───────────

async function handleSmtpSend({ smtpHost, smtpPort, smtpEnc, smtpUser, smtpPass,
                                 fromEmail, fromName, replyTo, toList, subject,
                                 htmlBody, textBody }) {
  const { connect } = await import('cloudflare:sockets');

  const port   = parseInt(smtpPort) || 587;
  const useSSL = smtpEnc === 'ssl' || port === 465;
  const useTLS = smtpEnc === 'starttls' || (port === 587 && smtpEnc !== 'none');

  const enc = new TextEncoder(), dec = new TextDecoder();
  let buf = '';

  let socket = connect(
    { hostname: smtpHost, port },
    { secureTransport: useSSL ? 'on' : 'off', allowHalfOpen: true }
  );
  let writer = socket.writable.getWriter();
  let reader = socket.readable.getReader();

  async function recv() {
    while (true) {
      const lines = buf.split('\r\n');
      for (let i = 0; i < lines.length; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const code = parseInt(lines[i]);
          buf = lines.slice(i + 1).join('\r\n');
          return code;
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('SMTP connection closed unexpectedly');
      buf += dec.decode(value);
    }
  }

  async function send(str)  { await writer.write(enc.encode(str + '\r\n')); }
  async function cmd(str)   { await send(str); return recv(); }
  function b64(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }

  try {
    if (await recv() !== 220) throw new Error('Bad SMTP greeting');

    let code = await cmd('EHLO pos.worker');
    if (code !== 250) throw new Error(`EHLO failed: ${code}`);

    if (useTLS) {
      code = await cmd('STARTTLS');
      if (code !== 220) throw new Error(`STARTTLS rejected: ${code}`);
      writer.releaseLock(); reader.releaseLock();
      const tls = socket.startTls();
      writer = tls.writable.getWriter();
      reader = tls.readable.getReader();
      buf    = '';
      code   = await cmd('EHLO pos.worker');
      if (code !== 250) throw new Error(`EHLO after TLS failed: ${code}`);
    }

    code = await cmd('AUTH LOGIN');
    if (code !== 334) throw new Error(`AUTH LOGIN failed: ${code}`);
    code = await cmd(b64(smtpUser));
    if (code !== 334) throw new Error(`SMTP username rejected: ${code}`);
    code = await cmd(b64(smtpPass));
    if (code !== 235) throw new Error('SMTP authentication failed — check username/password');

    code = await cmd(`MAIL FROM:<${fromEmail || smtpUser}>`);
    if (code !== 250) throw new Error(`MAIL FROM failed: ${code}`);

    for (const to of toList) {
      code = await cmd(`RCPT TO:<${to}>`);
      if (code !== 250 && code !== 251) throw new Error(`RCPT TO <${to}> rejected: ${code}`);
    }

    code = await cmd('DATA');
    if (code !== 354) throw new Error(`DATA failed: ${code}`);

    const boundary = `_pos_${Date.now().toString(36)}`;
    const from     = fromName ? `${fromName} <${fromEmail || smtpUser}>` : (fromEmail || smtpUser);
    const msgLines = [
      `From: ${from}`,
      `To: ${toList.join(', ')}`,
      `Subject: =?UTF-8?B?${b64(subject)}?=`,
      replyTo ? `Reply-To: ${replyTo}` : null,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      b64(textBody || ''),
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      b64(htmlBody || ''),
      ``,
      `--${boundary}--`,
    ].filter(l => l !== null);

    const raw = msgLines.map(l => l.startsWith('.') ? '.' + l : l).join('\r\n');
    await send(raw);
    await send('.');

    code = await recv();
    if (code !== 250) throw new Error(`Message rejected by server: ${code}`);

    await send('QUIT');
    return json({ ok: true });

  } finally {
    try { writer.releaseLock(); } catch {}
  }
}

// ── Utility ───────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
