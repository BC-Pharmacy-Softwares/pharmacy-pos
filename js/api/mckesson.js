/* ============================================================
   mckesson.js — McKesson PharmaClik SOAP API client
   WSDL: https://webservices.mckesson.ca/BusinessServices/ORDERS/
         Service/intfOrders-service.serviceagent?wsdl
   Catalog Format: Version 6, fixed-width flat file, English

   NOTE: SOAP calls from a browser to McKesson will likely be
   blocked by CORS. Configure a cors_proxy in settings to route
   through a local proxy, or trigger sync from the Settings screen
   after configuring the proxy URL.
   ============================================================ */

const McKessonAPI = (() => {
  const SOAP_ENDPOINT = 'https://webservices.mckesson.ca/BusinessServices/ORDERS/Service/intfOrders-service.serviceagent';
  const POLL_INTERVAL_MS = 60000; // 60 seconds per spec

  async function _endpoint() {
    const workerUrl = await Config.get('worker_url');
    if (workerUrl) return workerUrl.replace(/\/$/, '') + '/mckesson-soap';
    return SOAP_ENDPOINT; // fallback — will CORS-fail in browser without Worker
  }

  async function _creds() {
    const user = await Config.get('mckesson_username');
    const pass = await Config.get('mckesson_password');
    if (!user || !pass) throw new Error('McKesson credentials not configured');
    return { user, pass };
  }

  function _envelope(body) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ord="http://mckesson.com/orders">
  <soapenv:Header/>
  <soapenv:Body>
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  async function _soap(action, body) {
    const endpoint = await _endpoint();
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction':   `"${action}"`,
      },
      body: _envelope(body),
    });
    if (!resp.ok) throw new Error(`McKesson SOAP error ${resp.status}: ${resp.statusText}`);
    const text = await resp.text();
    return new DOMParser().parseFromString(text, 'text/xml');
  }

  function _getEl(doc, tagName) {
    return doc.getElementsByTagNameNS('*', tagName)[0]?.textContent?.trim() || null;
  }

  /* Step 1: Request catalog */
  async function catalogueRequest(onLog) {
    const { user, pass } = await _creds();
    onLog?.('Sending CatalogueRequest to McKesson...');

    const xml = await _soap('CatalogueRequest', `
      <ord:CatalogueRequest>
        <ord:Username>${user}</ord:Username>
        <ord:Password>${pass}</ord:Password>
        <ord:CatalogFormat>6</ord:CatalogFormat>
        <ord:Language>E</ord:Language>
      </ord:CatalogueRequest>`);

    const requestId = _getEl(xml, 'RequestId') || _getEl(xml, 'requestId');
    const status    = _getEl(xml, 'Status') || _getEl(xml, 'status');
    onLog?.(`Request submitted. ID: ${requestId}, Status: ${status}`);
    return { requestId, status };
  }

  /* Step 2: Poll for RequestStatus=Catalog */
  async function checkRequestStatus(requestId, onLog) {
    const { user, pass } = await _creds();
    const xml = await _soap('RequestStatus', `
      <ord:RequestStatus>
        <ord:Username>${user}</ord:Username>
        <ord:Password>${pass}</ord:Password>
        <ord:RequestId>${requestId}</ord:RequestId>
      </ord:RequestStatus>`);

    const status  = _getEl(xml, 'RequestStatus') || _getEl(xml, 'Status');
    const url     = _getEl(xml, 'DownloadUrl') || _getEl(xml, 'CatalogUrl');
    const b64data = _getEl(xml, 'CatalogData') || _getEl(xml, 'Data');
    onLog?.(`Poll status: ${status}`);
    return { status, url, b64data };
  }

  /* Step 3: Decode base64 zip → extract flat file */
  async function _decompressB64Zip(b64data) {
    const binary = atob(b64data);
    const bytes  = Uint8Array.from(binary, c => c.charCodeAt(0));

    // Use DecompressionStream if available (modern browsers)
    if (typeof DecompressionStream !== 'undefined') {
      // Try to extract first file from ZIP
      const zipText = await _extractZipText(bytes);
      return zipText;
    }
    // Fallback: treat as plain text (some endpoints return gzip not zip)
    return new TextDecoder('latin1').decode(bytes);
  }

  async function _extractZipText(bytes) {
    // Minimal ZIP parser: find first local file header (PK\x03\x04)
    const sig = [0x50, 0x4B, 0x03, 0x04];
    let offset = -1;
    for (let i = 0; i < bytes.length - 4; i++) {
      if (bytes[i]===sig[0] && bytes[i+1]===sig[1] && bytes[i+2]===sig[2] && bytes[i+3]===sig[3]) {
        offset = i;
        break;
      }
    }
    if (offset === -1) {
      // Not a zip, try as raw text
      return new TextDecoder('latin1').decode(bytes);
    }
    // Read local file header to find data offset
    const filenameLen  = bytes[offset+26] | (bytes[offset+27]<<8);
    const extraLen     = bytes[offset+28] | (bytes[offset+29]<<8);
    const compSize     = bytes[offset+18] | (bytes[offset+19]<<8) |
                         (bytes[offset+20]<<16) | (bytes[offset+21]<<24);
    const compression  = bytes[offset+8] | (bytes[offset+9]<<8);
    const dataOffset   = offset + 30 + filenameLen + extraLen;
    const compData     = bytes.slice(dataOffset, dataOffset + compSize);

    if (compression === 0) {
      return new TextDecoder('latin1').decode(compData);
    } else if (compression === 8) {
      // DEFLATE
      const ds     = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();
      writer.write(compData);
      writer.close();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const merged = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
      let pos = 0;
      for (const c of chunks) { merged.set(c, pos); pos += c.length; }
      return new TextDecoder('latin1').decode(merged);
    }
    throw new Error(`Unsupported ZIP compression method: ${compression}`);
  }

  /* Full catalog sync with polling.
     opts: { newItems, prices, descriptions, taxFlags, skipDisco } */
  async function runCatalogSync(onLog, opts = {}) {
    onLog = onLog || console.log;
    onLog('=== McKesson Catalog Sync Started ===');

    let requestId, b64data;

    // Step 1: Request
    const req = await catalogueRequest(onLog);
    requestId = req.requestId;
    if (!requestId) {
      // Some endpoints return data immediately
      b64data = req.b64data;
    }

    // Step 2: Poll until ready
    if (!b64data) {
      let attempts = 0;
      const maxAttempts = 30; // 30 minutes max
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        attempts++;
        onLog(`Polling attempt ${attempts}/${maxAttempts}...`);
        const poll = await checkRequestStatus(requestId, onLog);
        if (poll.status === 'Catalog' || poll.status === 'Ready' || poll.status === 'Complete') {
          b64data = poll.b64data;
          if (!b64data && poll.url) {
            onLog(`Downloading from URL: ${poll.url}`);
            const dlResp = await fetch(poll.url);
            const text   = await dlResp.text();
            b64data      = btoa(text);
          }
          break;
        }
        if (poll.status === 'Error' || poll.status === 'Failed') {
          throw new Error(`McKesson returned error status: ${poll.status}`);
        }
      }
    }

    if (!b64data) throw new Error('Catalog data not received after polling');

    // Step 3: Decode
    onLog('Decoding catalog data...');
    const flatFile = await _decompressB64Zip(b64data);
    onLog(`Catalog file size: ${flatFile.length} chars`);

    // Step 4: Parse
    onLog('Parsing WEBCAT Version 6 flat file...');
    const { products: allParsed, skipped, total } = WebcatParser.parseFile(flatFile);
    onLog(`Parsed ${allParsed.length} products (${skipped} skipped, ${total} total lines)`);

    // Step 4b: Apply sync options filter
    const {
      newItems     = true,
      prices       = true,
      descriptions = true,
      taxFlags     = true,
      skipDisco    = false,
    } = opts;

    // If not doing a full update, we need to selectively update existing records
    const products = allParsed.map(p => ({
      ...p,
      _skipDisco: skipDisco && p.product_status === 'D',
    })).filter(p => !p._skipDisco);

    // Build a selective upsert based on chosen options
    DB.upsertProductsSelective(products, { newItems, prices, descriptions, taxFlags });
    onLog(`Catalog sync complete. ${products.length} products processed.`);
    return { count: products.length };
  }

  /* For manual flat file upload (fallback when SOAP is blocked) */
  async function importFromFile(text, onLog) {
    onLog = onLog || console.log;
    onLog('Parsing uploaded WEBCAT file...');
    const { products, skipped, total } = WebcatParser.parseFile(text);
    onLog(`Parsed ${products.length} products (${skipped} skipped, ${total} total lines)`);
    onLog('Saving to database...');
    DB.upsertProducts(products);
    onLog(`Import complete. ${products.length} products saved.`);
    return { count: products.length };
  }

  return { runCatalogSync, importFromFile, catalogueRequest, checkRequestStatus };
})();
