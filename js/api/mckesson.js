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

  /* ── Catalog request via Electron SOAP bridge (Node, no CORS) ──
     Uses the same proven path as order upload. SOAPAction = getCatalog.
     Returns { status, b64 } where b64 is the base64 zip catalogue.   */
  async function _catalogRequestWS(format) {
    const user = await Config.get('mckesson_username');
    const pass = await Config.get('mckesson_password');
    // Catalog uses the CUSTOMER number (same as invoices), not the order Account#.
    const acct = (await Config.get('mckesson_customer') || await Config.get('mckesson_account') || '').replace(/\D/g,'');
    if (!user || !pass) throw new Error('McKesson username/password not set.');
    if (!acct)          throw new Error('McKesson Customer Number not set (Settings → API Credentials).');

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <CatalogueRequest xmlns="Mckesson/specification/schema/xsd/Catalog">
      <Authentication>
        <Username>${_xmlEsc(user)}</Username>
        <Password>${_xmlEsc(pass)}</Password>
      </Authentication>
      <Information>
        <CustomerNumber>${_xmlEsc(acct)}</CustomerNumber>
        <Format>${_xmlEsc(format || '6')}</Format>
        <Language>E</Language>
      </Information>
    </CatalogueRequest>
  </soapenv:Body>
</soapenv:Envelope>`;

    const doc = await _wsCall('getCatalog', xml);
    return {
      status: doc.getElementsByTagNameNS('*','RequestStatus')[0]?.textContent?.trim() || null,
      b64:    doc.getElementsByTagNameNS('*','Catalogue')[0]?.textContent?.trim() || null,
    };
  }

  /* Full catalog sync with polling.
     opts: { newItems, prices, descriptions, taxFlags, skipDisco } */
  async function runCatalogSync(onLog, opts = {}) {
    onLog = onLog || console.log;
    onLog('=== McKesson Catalog Sync Started ===');

    let requestId, b64data;

    // Preferred path: direct SOAP via Electron (no CORS, no worker proxy)
    if (window.electronAPI?.mckessonSoap) {
      onLog('Requesting catalogue via desktop SOAP bridge (getCatalog)…');
      let attempts = 0;
      while (attempts < 20 && !b64data) {
        const { status, b64 } = await _catalogRequestWS('6');
        if (b64) { b64data = b64; onLog('Catalogue received.'); break; }
        attempts++;
        onLog(`Catalogue not ready yet (status: ${status||'?'}). Waiting 60 s… [${attempts}/20]`);
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      }
      if (!b64data) throw new Error('Catalogue not received after polling. Try again later.');
      // Skip the old worker-based request/poll below
      onLog('Decoding catalogue…');
      const flatFile = await _decompressB64Zip(b64data);
      onLog(`Catalogue size: ${flatFile.length} chars`);
      onLog('Parsing WEBCAT V6…');
      const parsed = WebcatParser.parseFile(flatFile);
      onLog(`Parsed ${parsed.products.length} products (${parsed.skipped} skipped, ${parsed.total} lines)`);
      const {
        newItems = true, prices = true, descriptions = true,
        taxFlags = true, skipDisco = false,
      } = opts;
      const products = parsed.products
        .filter(p => !(skipDisco && p.product_status === 'D'));
      DB.upsertProductsSelective(products, { newItems, prices, descriptions, taxFlags });
      onLog(`Catalog sync complete. ${products.length} products processed.`);
      return { count: products.length };
    }

    // Fallback: legacy worker/SOAP path (browser mode)
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

  /* ════════════════════════════════════════════════════════════
     ORDER UPLOAD + INVOICE DOWNLOAD (Web Services, section 3)
     These run through the Electron main process (window.electronAPI
     .mckessonSoap) which makes the HTTPS call in Node — no CORS.
     ════════════════════════════════════════════════════════════ */
  // Operation endpoints (from WSDL soap:address). All operations route through
  // the ORDERS service; SOAPAction selects the operation.
  const WS_ENDPOINT = 'https://webservices.mckesson.ca/BusinessServices/ORDERS/Operation/UploadOrderMessage';
  const NS_ORDER    = 'Mckesson/specification/schema/xsd/OrderInformation';
  const NS_INVOICE  = 'Mckesson/specification/schema/xsd/InvoiceDownload';

  function _xmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }

  // Stores the last raw SOAP response for debugging (inspect via McKessonAPI._lastRaw)
  let _lastRaw = '';

  /* Low-level SOAP call via Electron main (Node, no CORS).
     soapAction MUST be set or the ESB returns its WSDL instead of a result. */
  async function _wsCall(soapAction, xml, endpoint) {
    if (!window.electronAPI?.mckessonSoap) {
      throw new Error('Web service calls require the desktop app (Electron). Use file upload/download in browser mode.');
    }
    console.log('[McKesson] → ' + soapAction + ' REQUEST:\n', xml);
    const res = await window.electronAPI.mckessonSoap({
      url: endpoint || WS_ENDPOINT, soapAction, xml,
    });
    if (res.error) throw new Error(res.error);
    _lastRaw = res.body || '';
    console.log('[McKesson] ← RESPONSE (HTTP ' + res.status + '):\n', _lastRaw);

    // If the body is a WSDL, the SOAPAction/endpoint didn't route the operation
    if (/wsdl:definitions|<definitions/i.test(_lastRaw)) {
      throw new Error('Service returned its WSDL instead of a result — the request was not routed. ' +
                      '(SOAPAction "' + soapAction + '" or endpoint may be wrong.)');
    }

    const doc = new DOMParser().parseFromString(res.body || '', 'text/xml');
    // Gather the most specific fault detail available
    const faultStr  = doc.getElementsByTagNameNS('*','faultstring')[0]?.textContent?.trim();
    const faultMsg  = doc.getElementsByTagNameNS('*','FaultMessage')[0]?.textContent?.trim()
                   || doc.getElementsByTagNameNS('*','faultMessage')[0]?.textContent?.trim();
    const faultCode = doc.getElementsByTagNameNS('*','FaultCode')[0]?.textContent?.trim()
                   || doc.getElementsByTagNameNS('*','faultcode')[0]?.textContent?.trim();
    const detail    = doc.getElementsByTagNameNS('*','detail')[0]?.textContent?.replace(/\s+/g,' ').trim();
    const hasFault  = doc.getElementsByTagNameNS('*','Fault')[0];

    if (!res.ok || hasFault || faultMsg) {
      const parts = [faultMsg, faultCode && `(${faultCode})`, faultStr && faultStr !== 'Fault' ? faultStr : null,
                     detail && detail.length < 400 ? detail : null].filter(Boolean);
      const full  = parts.join(' — ') ||
                    ((_lastRaw || '').replace(/>\s+</g,'><').slice(0, 500)) ||
                    `HTTP ${res.status}`;
      throw new Error(full);
    }
    return doc;
  }

  /* ── 3.1  Upload an order ──────────────────────────────────────
     items: [{ itemId, itemType ('D'|'G'|'U'|'C'), quantity, modality }]
       itemType D = McKesson item#, G = GTIN, U = UPC, C = custom
       modality  U = Unit (default), P = Pack, C = Case, D = Deal
     Returns confirmation number string.                            */
  async function uploadOrder({ items, poNumber } = {}) {
    const user = await Config.get('mckesson_username');
    const pass = await Config.get('mckesson_password');
    const acct = (await Config.get('mckesson_account') || '').replace(/\D/g,'');
    if (!user || !pass) throw new Error('McKesson username/password not set (Settings → API Credentials).');
    if (!acct)          throw new Error('McKesson Account Number not set (Settings → API Credentials).');
    if (!items?.length) throw new Error('No items to upload.');

    const itemXml = items.map(i => `
          <ItemInformation>
            <ItemID>${_xmlEsc(i.itemId)}</ItemID>
            <ItemIDType>${_xmlEsc(i.itemType || 'D')}</ItemIDType>
            <Quantity>${parseInt(i.quantity) || 1}</Quantity>
            <Modality>${_xmlEsc(i.modality || 'U')}</Modality>
          </ItemInformation>`).join('');

    // Default namespace on the root so all children are qualified (elementFormDefault=qualified)
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <OrderInformationRequest xmlns="${NS_ORDER}">
      <Authentication>
        <login>${_xmlEsc(user)}</login>
        <password>${_xmlEsc(pass)}</password>
      </Authentication>
      <OrderInformation>
        <Header>
          <AccountNumber>${_xmlEsc(acct)}</AccountNumber>
          <DistributorIdentifier>MBA</DistributorIdentifier>
          ${poNumber ? `<PurchaseOrder>${_xmlEsc(String(poNumber).slice(0,12))}</PurchaseOrder>` : ''}
        </Header>${itemXml}
      </OrderInformation>
    </OrderInformationRequest>
  </soapenv:Body>
</soapenv:Envelope>`;

    const doc = await _wsCall('UploadOrderOp', xml);
    // Try several likely tag names for the confirmation
    const conf = (doc.getElementsByTagNameNS('*','ConfirmationNumber')[0]
              ||  doc.getElementsByTagNameNS('*','confirmationNumber')[0]
              ||  doc.getElementsByTagNameNS('*','OrderConfirmation')[0]
              ||  doc.getElementsByTagNameNS('*','ConfirmationId')[0])
              ?.textContent?.trim();
    if (!conf) {
      const snippet = (_lastRaw || '').replace(/>\s+</g,'><').slice(0, 600);
      throw new Error('No confirmation number found in the response.\n\nMcKesson returned:\n' + (snippet || '(empty response)'));
    }
    return conf;
  }

  /* ── 3.2  Invoice download ─────────────────────────────────────
     Step 1: list invoices (RequestAllNew or RequestByDate)
     Step 2: GetInvoices for the actual line items
     Returns array of shipped line items across all invoices:
       [{ invoiceNumber, invoiceDate, itemNumber, upc, description,
          shippedQty, qtyPerPack }]                                  */
  // Remembers which DistributorIdentifier worked, so GetInvoices reuses it
  let _workingDistributor = null;

  async function _invoiceList({ allNew = true, startDate, endDate } = {}) {
    const user = await Config.get('mckesson_username');
    const pass = await Config.get('mckesson_password');
    // Invoices use the CUSTOMER number (WinRx "Customer#"), not the order Account#.
    // Fall back to account number if customer not set.
    const acct = (await Config.get('mckesson_customer') || await Config.get('mckesson_account') || '').replace(/\D/g,'');
    if (!user || !pass) throw new Error('McKesson username/password not set.');
    if (!acct)          throw new Error('McKesson Customer Number not set (Settings → API Credentials).');

    // Build the request for a given DistributorIdentifier value.
    // distVal '' means omit the element entirely.
    const buildXml = (distVal) => {
      const distEl = distVal ? `<DistributorIdentifier>${distVal}</DistributorIdentifier>` : '';
      let inner;
      if (allNew) {
        // InvoiceRequestAllNew > Action > ActionType > RequestAll
        inner = `<Action><ActionType><RequestAll>
              <CustomerNumber>${_xmlEsc(acct)}</CustomerNumber>
              ${distEl}
            </RequestAll></ActionType></Action>`;
      } else {
        // InvoiceRequestByDate > Action > Action_Type (underscore!) > RequestByDate
        inner = `<Action><Action_Type><RequestByDate>
              <CustomerNumber>${_xmlEsc(acct)}</CustomerNumber>
              ${distEl}
              <StartDate>${_xmlEsc(startDate)}</StartDate>
              <EndDate>${_xmlEsc(endDate)}</EndDate>
            </RequestByDate></Action_Type></Action>`;
      }
      const tag = allNew ? 'InvoiceRequestAllNew' : 'InvoiceRequestByDate';
      return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <${tag} xmlns="${NS_INVOICE}">
      <Authentication>
        <username>${_xmlEsc(user)}</username>
        <password>${_xmlEsc(pass)}</password>
      </Authentication>
      ${inner}
    </${tag}>
  </soapenv:Body>
</soapenv:Envelope>`;
    };

    // Try distributor variations automatically — McKesson returns the confusing
    // "Invalid User Type" when the distributor code doesn't match the account.
    const variations = ['MCK', 'MSD', ''];
    const action = allNew ? 'AllNew' : 'InvoiceByDate';
    let doc = null, lastErr = null;

    for (const dist of variations) {
      try {
        console.log(`[McKesson] Invoice list — trying DistributorIdentifier="${dist || '(omitted)'}"`);
        doc = await _wsCall(action, buildXml(dist));
        _workingDistributor = dist || 'MCK';
        console.log(`[McKesson] ✓ DistributorIdentifier="${dist || '(omitted)'}" accepted`);
        break;
      } catch (e) {
        lastErr = e;
        // Only keep trying on the "Invalid User Type" / role-style faults
        if (!/user type|invalid|role/i.test(e.message)) throw e;
        console.warn(`[McKesson] DistributorIdentifier="${dist || '(omitted)'}" rejected: ${e.message}`);
      }
    }
    if (!doc) {
      throw new Error('Invoice download rejected for all distributor codes (MCK/MSD/none).\n\n' +
                      'Last error: ' + (lastErr?.message || 'unknown') +
                      '\n\nThis usually means the web-service account needs the invoice-download role enabled by McKesson.');
    }

    const downloads = [...doc.getElementsByTagNameNS('*','InvoiceDownload')];
    return downloads.map(d => ({
      customerNumber: d.getElementsByTagNameNS('*','CustomerNumber')[0]?.textContent?.trim(),
      invoiceNumber:  d.getElementsByTagNameNS('*','InvoiceNumber')[0]?.textContent?.trim(),
      invoiceDate:    d.getElementsByTagNameNS('*','InvoiceDate')[0]?.textContent?.trim(),
      distributor:    d.getElementsByTagNameNS('*','DistributorIdentifier')[0]?.textContent?.trim() || _workingDistributor || 'MCK',
    })).filter(i => i.invoiceNumber);
  }

  async function _getInvoices(invoiceRefs) {
    const user = await Config.get('mckesson_username');
    const pass = await Config.get('mckesson_password');
    const acct = (await Config.get('mckesson_customer') || await Config.get('mckesson_account') || '').replace(/\D/g,'');

    // Max 10 per call per spec
    const batch = invoiceRefs.slice(0, 10);
    const infoXml = batch.map(r => `
      <InvoiceInformation>
        <CustomerNumber>${_xmlEsc(acct)}</CustomerNumber>
        <DistributorIdentifier>${_xmlEsc(r.distributor || 'MCK')}</DistributorIdentifier>
        <InvoiceNumber>${_xmlEsc(r.invoiceNumber)}</InvoiceNumber>
        <InvoiceDate>${_xmlEsc(r.invoiceDate)}</InvoiceDate>
      </InvoiceInformation>`).join('');

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <GetInvoices xmlns="${NS_INVOICE}">
      <Authentication>
        <username>${_xmlEsc(user)}</username>
        <password>${_xmlEsc(pass)}</password>
      </Authentication>
      ${infoXml}
    </GetInvoices>
  </soapenv:Body>
</soapenv:Envelope>`;

    const doc = await _wsCall('getInvoices', xml);
    const lineItems = [];
    [...doc.getElementsByTagNameNS('*','Invoice')].forEach(inv => {
      const invNum  = inv.getElementsByTagNameNS('*','InvoiceNumber')[0]?.textContent?.trim();
      const invDate = inv.getElementsByTagNameNS('*','InvoiceDate')[0]?.textContent?.trim();
      [...inv.getElementsByTagNameNS('*','ShippedItem')].forEach(si => {
        // Find UPC from GTINS where UnitOfMeasure=U
        let upc = null;
        [...si.getElementsByTagNameNS('*','GTIN')].forEach(g => {
          const uom = g.getElementsByTagNameNS('*','UnitOfMeasure')[0]?.textContent?.trim();
          const code= g.getElementsByTagNameNS('*','Code')[0]?.textContent?.trim();
          if (uom === 'U' && code) upc = code;
        });
        lineItems.push({
          invoiceNumber: invNum,
          invoiceDate:   invDate,
          itemNumber:    si.getElementsByTagNameNS('*','ItemNumber')[0]?.textContent?.trim(),
          description:   si.getElementsByTagNameNS('*','ItemDescriptionEn')[0]?.textContent?.trim(),
          shippedQty:    parseFloat(si.getElementsByTagNameNS('*','ShippedQuantity')[0]?.textContent) || 0,
          qtyPerPack:    parseInt(si.getElementsByTagNameNS('*','QuantityPerPack')[0]?.textContent) || 1,
          upc,
        });
      });
    });
    return lineItems;
  }

  /* Full invoice fetch — list then get details (up to 10 invoices) */
  async function downloadInvoices(opts = {}) {
    const list = await _invoiceList(opts);
    if (!list.length) return { invoices: [], lineItems: [] };
    const lineItems = await _getInvoices(list);
    return { invoices: list, lineItems };
  }

  return {
    runCatalogSync, importFromFile, catalogueRequest, checkRequestStatus,
    uploadOrder, downloadInvoices,
    get _lastRaw() { return _lastRaw; },   // for debugging the last SOAP response
  };
})();
