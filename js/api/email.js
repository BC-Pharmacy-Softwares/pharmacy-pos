/* ============================================================
   api/email.js — Email sending via Cloudflare Worker relay
   Supported services: resend, sendgrid, brevo, mailto (fallback)
   ============================================================ */

const EmailAPI = (() => {

  async function getConfig() {
    const keys = ['email_service','email_api_key','email_from_address','email_sender_name',
                  'email_reply_to','worker_url','pos_key','smtp_host','smtp_port','smtp_encryption',
                  'smtp_username','smtp_password'];
    const vals = await Promise.all(keys.map(k => Config.get(k)));
    const cfg  = Object.fromEntries(keys.map((k,i) => [k, vals[i] || '']));
    cfg.email_service = cfg.email_service || 'mailto';
    return cfg;
  }

  /* Send a single email. Throws on error. */
  async function send({ to, subject, htmlBody, textBody }) {
    const cfg = await getConfig();

    // ── mailto fallback (no server needed) ──────────────────────
    if (cfg.email_service === 'mailto') {
      const body   = (textBody || '').substring(0, 1800);
      const mailto = `mailto:${encodeURIComponent(to)}` +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`;
      window.open(mailto, '_self');
      return { ok: true, method: 'mailto' };
    }

    const fromEmail = cfg.email_from_address || cfg.smtp_username;
    const fromName  = cfg.email_sender_name  || 'Pharmacy POS';

    // ── SMTP in Electron: send directly via nodemailer (no Worker) ─
    if (cfg.email_service === 'smtp' && window.electronAPI?.sendEmail) {
      if (!cfg.smtp_host)     throw new Error('SMTP host not configured. Go to Settings → Email Reports.');
      if (!cfg.smtp_username) throw new Error('SMTP username not configured. Go to Settings → Email Reports.');
      if (!cfg.smtp_password) throw new Error('SMTP password not configured. Go to Settings → Email Reports.');

      const result = await window.electronAPI.sendEmail({
        smtpHost:       cfg.smtp_host,
        smtpPort:       cfg.smtp_port       || '587',
        smtpEncryption: cfg.smtp_encryption || 'starttls',
        smtpUser:       cfg.smtp_username,
        smtpPass:       cfg.smtp_password,
        fromEmail:      fromEmail || cfg.smtp_username,
        fromName,
        replyTo:        cfg.email_reply_to  || '',
        to, subject, htmlBody, textBody,
      });

      if (!result.ok) throw new Error(result.error || 'SMTP send failed.');
      return { ok: true, method: 'smtp-direct' };
    }

    // ── API services / browser SMTP: route via Cloudflare Worker ──
    if (!cfg.worker_url) throw new Error('Worker URL not configured. Go to Settings → API Credentials.');

    let payload;
    if (cfg.email_service === 'smtp') {
      if (!cfg.smtp_host)     throw new Error('SMTP host not configured. Go to Settings → Email Reports.');
      if (!cfg.smtp_username) throw new Error('SMTP username not configured. Go to Settings → Email Reports.');
      if (!cfg.smtp_password) throw new Error('SMTP password not configured. Go to Settings → Email Reports.');
      payload = {
        service:    'smtp',
        to, subject, htmlBody, textBody,
        fromEmail, fromName,
        replyTo:    cfg.email_reply_to || '',
        smtpHost:   cfg.smtp_host,
        smtpPort:   cfg.smtp_port || '587',
        smtpEnc:    cfg.smtp_encryption || 'starttls',
        smtpUser:   cfg.smtp_username,
        smtpPass:   cfg.smtp_password,
      };
    } else {
      if (!cfg.email_api_key)  throw new Error('Email API key not configured. Go to Settings → Email Reports.');
      if (!fromEmail)          throw new Error('From address not configured. Go to Settings → Email Reports.');
      payload = {
        service:   cfg.email_service,
        to, subject, htmlBody, textBody,
        fromEmail, fromName,
        replyTo:   cfg.email_reply_to || '',
        apiKey:    cfg.email_api_key,
      };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (cfg.pos_key) headers['X-POS-Key'] = cfg.pos_key;
    const resp = await fetch(`${cfg.worker_url.replace(/\/$/, '')}/sendEmail`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Email failed (HTTP ${resp.status})`);
    return data;
  }

  /* Convenience: look up recipient list from config key, then send. */
  async function sendReport({ recipientKey, subject, htmlBody, textBody }) {
    const to = (await Config.get(recipientKey)) || '';
    if (!to) throw new Error('No recipients configured for this report. Go to Settings → Email Reports.');
    return send({ to, subject, htmlBody, textBody });
  }

  /* Send a test email to the given address */
  async function sendTest(toAddress) {
    const pharmacyName = (await Config.get('pharmacy_name')) || 'Pharmacy POS';
    return send({
      to:        toAddress,
      subject:   `Test Email from ${pharmacyName}`,
      htmlBody:  buildEmailHTML({
        title:    'Test Email',
        subtitle: 'Your email settings are working correctly.',
        sections: [{ rows: [['Status', '✓ Email delivery confirmed'],
                             ['Service', (await getConfig()).email_service.toUpperCase()]] }],
      }),
      textBody: `Test email from ${pharmacyName}.\n\nYour email settings are working correctly.`,
    });
  }

  /* ── HTML email template builder ────────────────────────────── */
  function buildEmailHTML({ title, subtitle = '', sections = [], pharmacyName = '', date = '' }) {
    const name = pharmacyName || 'Pharmacy POS';
    const dt   = date || new Date().toLocaleString('en-CA');

    const sectionHTML = sections.map(sec => {
      const header = sec.heading ? `<h3 style="margin:20px 0 8px;font-size:15px;color:#1e293b;">${sec.heading}</h3>` : '';

      if (sec.kpis) {
        const kpiCells = sec.kpis.map(([label, val]) => `
          <td style="width:${Math.floor(100/sec.kpis.length)}%;padding:12px 10px;text-align:center;background:#f8fafc;border-radius:6px;">
            <div style="font-size:11px;color:#64748b;margin-bottom:4px;">${label}</div>
            <div style="font-size:18px;font-weight:700;color:#0f172a;">${val}</div>
          </td>`).join('<td style="width:8px;"></td>');
        return `${header}<table width="100%" cellpadding="0" cellspacing="0"><tr>${kpiCells}</tr></table>`;
      }

      if (sec.rows) {
        const isHeaderRow = r => r.length > 0 && r._header;
        const thead = sec.headers
          ? `<thead><tr>${sec.headers.map(h => `<th style="padding:8px 10px;background:#f1f5f9;font-size:12px;text-align:left;border-bottom:2px solid #e2e8f0;">${h}</th>`).join('')}</tr></thead>`
          : '';
        const tbody = sec.rows.map(r => {
          const cells = Array.isArray(r[0]) ? r : r.map ? r : [r];
          return `<tr>${(Array.isArray(r[0]) ? r[0] : r).map((cell, ci) => `<td style="padding:7px 10px;font-size:13px;border-bottom:1px solid #f1f5f9;${ci===0?'color:#374151;':'font-weight:600;text-align:right;'}">${cell}</td>`).join('')}</tr>`;
        }).join('');
        return `${header}<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">${thead}<tbody>${tbody}</tbody></table>`;
      }

      if (sec.html) return `${header}${sec.html}`;
      return '';
    }).join('<div style="height:20px;"></div>');

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
  <tr>
    <td style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:28px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.3px;">${name.toUpperCase()}</h1>
      <p style="margin:6px 0 0;color:#93c5fd;font-size:15px;font-weight:600;">${title}</p>
      ${subtitle ? `<p style="margin:4px 0 0;color:#bfdbfe;font-size:12px;">${subtitle}</p>` : ''}
    </td>
  </tr>
  <tr>
    <td style="padding:28px 32px;">
      ${sectionHTML}
    </td>
  </tr>
  <tr>
    <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Generated by Pharmacy POS &nbsp;·&nbsp; ${dt}</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  }

  return { send, sendReport, sendTest, getConfig, buildEmailHTML };
})();
