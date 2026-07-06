/* ============================================================
   pharmacy-dashboard.js — WinRx / Pharmacy Dashboard API
   v9 — uses a configurable website Cloudflare Worker
        (set via worker_url in Settings) which is
        already deployed and working. No wrangler needed.

   Call pattern:
     fetch('<workerUrl>/endpointName', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ PHARMACY_ID: 71, ...params })
     })

   No X-POS-Key or auth header required for this worker.
   ============================================================ */

const PharmacyDashboardAPI = (() => {

  const DEFAULT_PID = 71;

  // When running as Electron app with local WinRx SQL, main.js injects this global.
  // The local Express server handles all API routes directly from SQL Server —
  // no Cloudflare Worker or internet needed.
  function _localApi() {
    return (typeof window !== 'undefined' && window.__WINRX_LOCAL_API__) || null;
  }

  async function _base() {
    if (_localApi()) return _localApi();
    const url = await Config.get('worker_url');
    if (!url) throw new Error('Worker URL not configured. Go to Settings → API Credentials.');
    return url.replace(/\/$/, '');
  }

  async function _pid() {
    const id = await Config.get('pharmacy_id');
    return parseInt(id) || DEFAULT_PID;
  }

  async function _headers() {
    // Local SQL API needs no auth header
    if (_localApi()) return { 'Content-Type': 'application/json' };
    const h   = { 'Content-Type': 'application/json' };
    const key = await Config.get('pos_key');
    if (key) h['X-POS-Key'] = key;
    return h;
  }

  /* POST JSON to the POS worker */
  async function _call(endpoint, params = {}) {
    const base    = await _base();
    const pid     = await _pid();
    const headers = await _headers();

    const resp = await fetch(`${base}/${endpoint}`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ PHARMACY_ID: pid, ...params }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`API error ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  /* ── Patient lookups ──────────────────────────────────────── */

  async function getPatient(phn) {
    const data = await _call('getPatient', { PHN: String(phn), ExternalID: '' });
    return _normalizePatient(data);
  }

  async function getPatients({ dob, phone, name } = {}) {
    // PD requires Area (3 digits) + Phone (7 digits) separately
    let area = '', ph = (phone || '').replace(/\D/g, '');
    if (/^\d{10}$/.test(ph)) { area = ph.slice(0, 3); ph = ph.slice(3); }

    const data = await _call('getPatients', {
      DOB:   dob   || '',
      Area:  area,
      Phone: ph,
      NAME:  name  || '',
    });
    const list = Array.isArray(data) ? data : (data.patients || data.results || [data]);
    return list.map(_normalizePatient).filter(p => p?.phn);
  }

  async function getPatientProfile(phn) {
    return _call('getPatientProfile', { PHN: String(phn), ExternalID: '', Stopped: 'N' });
  }

  /* All-patient billed copay totals for the AR dashboard.
     Returns [{ PHN, fills, billed }]. cutoff = ISO date (optional). */
  async function getAllBilled(cutoff, asOf) {
    return _call('getAllBilled', { Cutoff: cutoff || '', AsOf: asOf || '' });
  }

  /* ── Rx transaction ───────────────────────────────────────── */

  async function getRxTx(rxNum, branchCode) {
    const data = await _call('getRxTx', { NUM: String(rxNum), BR: String(branchCode) });
    return _normalizeRxTx(data, rxNum, branchCode);
  }

  /* ── Pharmacy info ────────────────────────────────────────── */

  async function getPharmacyInfo() {
    // getStore returns pharmacy/branch details
    const data = await _call('getStore');
    return {
      pharmacy_name:       data.Branch        || data.PharmacyName   || data.Name       || '',
      pharmacy_phone:      data.PHONE         || data.Phone          || data.Telephone  || '',
      pharmacy_fax:        data.FAX           || data.Fax            || '',
      pharmacy_email:      data.EMAIL         || data.Email          || '',
      pharmacy_website:    data.URL           || data.Website        || '',
      pharmacy_address:    data.ADDR1         || data.Address        || data.Street     || '',
      pharmacy_city:       data.CITY          || data.City           || '',
      pharmacy_province:   data.PROV          || data.Province       || '',
      pharmacy_postal:     data.PC            || data.PostalCode     || '',
      pharmacy_gst_number: data.GST           || data.GSTNumber      || '',
      pharmacy_pst_number: data.PST           || data.PSTNumber      || '',
    };
  }

  /* ── Worker health check ──────────────────────────────────── */

  async function ping() {
    try {
      const base    = await _base();
      const headers = await _headers();
      const resp    = await fetch(`${base}/ping`, {
        method:  'POST',
        headers,
        body:    '{}',
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /* ── Normalization helpers ────────────────────────────────── */

  /* ── Send patient document (receipt PDF / HTML) ──────────────── */

  /**
   * Upload a receipt to the patient's documents in Pharmacy Dashboard.
   * Always routes via the Cloudflare Worker (even in local SQL mode) because
   * this is a write to PD, not a SQL read.
   * Silent failure — never blocks the POS.
   *
   * @param {string} phn         - Patient Health Number
   * @param {string} base64      - Base64-encoded document content
   * @param {string} [docType]   - 4-char document type (default "RCPT")
   * @returns {Promise<boolean>} - true if uploaded successfully
   */
  /* Save receipt to WinRx DOCUMENT table via local SQL endpoint.
     Only works when running in Electron with a local SQL connection.
     Silent failure — never blocks the POS. */
  async function saveDocument(phn, base64, docType = 'RCPT', staffName = '') {
    if (!phn || !base64) return false;
    if (!_localApi()) {
      console.info('saveDocument: no local SQL API — skipping receipt save');
      return false;
    }
    try {
      const tableOverride = await Config.get('doc_table_name') || '';
      const resp = await fetch(`${_localApi()}/saveDocument`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          PHN:           String(phn),
          DocumentType:  String(docType).slice(0, 4).toUpperCase(),
          DocumentImage: base64,
          UserId:        staffName || 'POS',
          TableOverride: tableOverride || undefined,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        const msg = json.error || `HTTP ${resp.status}`;
        console.warn(`saveDocument failed: ${msg}`, json);
        throw new Error(msg);
      }
      console.log(`saveDocument: receipt saved for PHN ${phn} → table: ${json.table || 'unknown'}`);
      return true;
    } catch (e) {
      console.warn('saveDocument error:', e.message);
      throw e;   // re-throw so modal can show the message
    }
  }

  /* ── getDrug ─────────────────────────────────────────────────── */

  async function getDrug(din) {
    const data = await _call('getDrug', { DIN: parseInt(din) || 0 });
    return data || null;
  }

  /* ── Normalization helpers ────────────────────────────────────── */

  // Full Pharmacy Dashboard getPatient / getPatients response field mapping.
  // Covers all fields from the PD API docs + local SQL equivalents.
  function _normalizePatient(d) {
    if (!d) return null;
    return {
      phn:         String(d.PHN        || d.phn          || ''),
      surname:     d.SURNAME    || d.LastName   || d.surname    || '',
      given_name:  d.GIVEN      || d.FirstName  || d.given_name || '',
      sex:         d.SEX        || d.sex        || null,          // M/F/U
      dob:         d.BIRTHDATE  || d.DOB        || d.dob        || null,
      // Address — PD returns ADDR1/ADDR2/ADDR3
      address:     d.ADDR1      || d.Address    || d.address    || d.STREET1 || null,
      address2:    d.ADDR2      || d.STREET2    || d.address2   || null,
      address3:    d.ADDR3      || d.address3   || null,
      city:        d.CITY       || d.City       || d.city       || null,
      province:    d.PROV       || d.Province   || d.province   || null,
      postal_code: d.PC         || d.PostalCode || d.postal_code || null,
      // Phone — PD splits area code and number
      area_code:   d.AREA       || d.AreaCode   || d.area_code  || null,
      phone:       d.PHONE      || d.Phone      || d.phone      || null,
      cell:        d.CELL       || d.Cell       || d.cell       || null,
      email:       d.EMAIL      || d.Email      || d.email      || null,
      allergies:   d.ALLERGY    || d.Allergies  || d.allergies  || null,
      facility:    d.FACILITY   || d.facility   || null,         // facility code
      route:       d.ROUTE      || d.route      || null,         // delivery route
      plans:       Array.isArray(d.PLANS) ? d.PLANS : [],        // insurance plans
    };
  }

  function _normalizeRxTx(d, rxNum, branchCode) {
    if (!d) return null;

    // RECOPAY = patient copay (total amount owing at counter)
    const copay = parseFloat(
      d.RECOPAY || d.Copay || d.copay || d.PatientAmount || d.patient_amount || 0
    ) || 0;

    // Drug name — PD returns DRUG field; local SQL also returns DRUG
    const drug = d.DRUG || d.DrugName  || d.drug_name  || d.Description || null;
    const din  = d.DIN  || d.din       || null;
    const phn  = d.PHN  || d.phn       || null;

    // Build description with drug name if available
    const fillQty = parseInt(d.REQTY || d.Quantity || 0) || 0;
    const desc    = drug
      ? (fillQty ? `${drug} [Qty:${fillQty}]` : drug)
      : `Rx ${rxNum}`;

    return {
      item_type:      'RX',
      rx_number:      String(rxNum),
      branch_code:    branchCode != null ? String(branchCode) : null,
      din,
      description:    desc,
      drug_name:      drug,
      quantity:       1,              // 1 billing unit; copay covers the whole fill
      unit_price:     copay,
      gst_applicable: false,
      pst_applicable: false,
      line_total:     copay,
      fill_qty:       fillQty,
      fill_date:      d.REEFDATE || d.fill_date || null,
      orig_date:      d.ORIGDATE || d.orig_date || null,
      days_supply:    parseInt(d.RXDAYS || 0) || null,
      refills_auth:   parseInt(d.RXLIM  || 0) || null,
      sig:            d.RXSIG    || null,        // prescriber directions
      cost:           parseFloat(d.RECOST  || 0) || 0,
      fee:            parseFloat(d.REFEE   || 0) || 0,
      upcharge:       parseFloat(d.REUPCHG || 0) || 0,
      compound_fee:   parseFloat(d.RECMPDCHG || 0) || 0,
      fill_user:      d.REUSERID || null,
      plan_id:        d.PLANID   || null,
      raw:            d,
      patient_phn:    phn,
      patient:        d.PATIENT || null,   // full patient object when joined directly from SQL
    };
  }

  /* Save a receipt PDF to the WinRx document inbox folder.
     filename: e.g. "RCPT60004A.pdf"
     base64:   PDF as base64 string */
  async function savePdfToFolder(base64, filename) {
    if (!_localApi()) return { ok: false, reason: 'no-local-api' };
    const folderPath = await Config.get('doc_folder_path');
    if (!folderPath) return { ok: false, reason: 'no-folder-configured' };
    try {
      const resp = await fetch(`${_localApi()}/save-pdf-file`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ base64, filename, folderPath }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) throw new Error(json.error || `HTTP ${resp.status}`);
      console.log(`savePdfToFolder: saved ${filename} → ${json.path}`);
      return { ok: true, path: json.path };
    } catch (e) {
      console.warn('savePdfToFolder error:', e.message);
      return { ok: false, reason: e.message };
    }
  }

  return { getPatient, getPatients, getPatientProfile, getAllBilled, getRxTx, getDrug, saveDocument, savePdfToFolder, ping, getPharmacyInfo };
  // v10: dedicated POS worker; POST + JSON body; X-POS-Key auth; PHARMACY_ID in body
})();
