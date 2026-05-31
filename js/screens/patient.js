/* ============================================================
   screens/patient.js — Patient Search & AR Profile
   ============================================================ */

class PatientScreen {
  constructor({ onNavigate }) {
    this._onNavigate = onNavigate;
    this._el          = null;
    this._results     = [];
    this._selected    = null;
    this._searching   = false;
  }

  render(params = {}) {
    this._params = params;
    this._el = document.createElement('div');
    this._el.className = 'patient-screen';
    this._el.innerHTML = `
      <div class="topbar">
        <button class="btn btn-outline btn-sm" id="btn-back">&#8592; Back</button>
        <span style="font-weight:600;font-size:15px;margin-left:8px;">Patient Search &amp; AR Profile</span>
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button class="btn btn-outline btn-sm" id="btn-lock">Lock</button>
        </div>
      </div>
      <div class="patient-body">
        <!-- Search panel -->
        <div class="patient-search-panel">
          <div class="patient-search-header">
            <h3>Search Patient</h3>
            <div class="form-group" style="margin:0;">
              <input type="text" id="search-input" placeholder="Name, PHN, or phone..." autocomplete="off" />
            </div>
            <div style="margin-top:8px;display:flex;gap:6px;">
              <button class="btn btn-primary btn-sm" style="width:100%;" id="btn-local-search">&#128269; Search</button>
            </div>
            <div style="margin-top:8px;">
              <button class="btn btn-success btn-sm" style="width:100%;" id="btn-new-customer">&#43; New Customer Profile</button>
            </div>
            <div class="text-muted mt-2" id="search-status" style="font-size:12px;min-height:16px;"></div>
          </div>
          <div class="patient-results" id="patient-results">
            <div style="padding:20px;color:var(--text-muted);font-size:13px;">
              Search by name, PHN, or phone number.
            </div>
          </div>
        </div>

        <!-- Profile panel -->
        <div class="patient-profile-panel">
          <div class="patient-profile-content" id="profile-content">
            <div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-muted);">
              Select a patient to view their profile
            </div>
          </div>
        </div>
      </div>`;

    this._attach();
    return this._el;
  }

  _attach() {
    this._el.querySelector('#btn-back').addEventListener('click', () => {
      this._onNavigate(this._params?.returnToPos ? 'pos' : 'pos');
    });
    this._el.querySelector('#btn-lock').addEventListener('click', () => { Auth.logout(); this._onNavigate('login'); });

    const input = this._el.querySelector('#search-input');
    this._el.querySelector('#btn-local-search').addEventListener('click', () => this._localSearch(input.value.trim()));
    this._el.querySelector('#btn-new-customer').addEventListener('click', () => this._showProfileModal(null));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') this._localSearch(input.value.trim());
    });
    input.focus();
  }

  _localSearch(term) {
    if (!term) return;
    Auth.touch();
    Audit.search(`Patient search: "${term}"`);
    const results = DB.searchPatients(term);
    this._results = results;
    this._renderResults(results);
    this._setStatus(`${results.length} local result${results.length !== 1 ? 's' : ''}`);
  }

  /**
   * Returns true if the term looks like a 10-digit NANP phone number.
   * Strips common formatting chars first, then checks if the first 3 digits
   * match a known Canadian/US area code.
   * PHNs in BC start with 9 — NANP area codes can start with any digit 2-9,
   * but common Canadian codes are in this list.
   */
  _looksLikePhone(term) {
    const digits = term.replace(/[\s\-\(\)\.]/g, '');
    if (!/^\d{10}$/.test(digits)) return false;
    // If the input had non-digit formatting characters it's almost certainly a phone
    if (/[\s\-\(\)\.]/.test(term)) return true;
    // Known Canadian/US area codes (not exhaustive but covers common cases)
    const AREA_CODES = new Set([
      '200','201','202','203','204','205','206','207','208','209',
      '210','212','213','214','215','216','217','218','219','220',
      '223','224','225','226','228','229','231','234','236','239',
      '240','242','248','249','250','251','252','253','254','256',
      '260','262','267','268','269','270','272','276','279','281',
      '289','301','302','303','304','305','306','307','308','309',
      '310','312','313','314','315','316','317','318','319','320',
      '321','323','325','326','327','330','331','332','334','336',
      '337','339','340','341','343','345','346','347','351','352',
      '360','361','364','365','367','380','385','386','387',
      '400','401','402','403','404','405','406','407','408','409',
      '410','412','413','414','415','416','417','418','419','423',
      '424','425','430','431','432','434','435','437','438','440',
      '442','443','445','447','448','450','458','463','464','469',
      '470','473','475','478','479','480','484',
      '500','501','502','503','504','505','506','507','508','509',
      '510','512','513','514','515','516','517','518','519','520',
      '530','531','534','539','540','541','548','551','559','561',
      '562','563','564','567','570','571','573','574','575','578',
      '579','580','581','585','586','587',
      '600','601','602','603','604','605','606','607','608','609',
      '610','612','613','614','615','616','617','618','619','620',
      '623','626','628','629','630','631','636','639','641','646',
      '647','650','651','656','657','659','660','661','662','667',
      '669','671','672','678','680','681','682','689',
      '700','701','702','703','704','705','706','707','708','709',
      '712','713','714','715','716','717','718','719','720','724',
      '725','726','727','730','731','732','734','737','740','742',
      '743','747','752','754','757','758','760','762','763','765',
      '767','769','770','772','773','774','775','778','779','780',
      '781','782','784','785','786','787',
      '800','801','802','803','804','805','806','807','808','809',
      '810','812','813','814','815','816','817','818','819','820',
      '825','828','829','830','831','832','833','835','838','843',
      '845','847','848','850','854','856','857','858','859','860',
      '862','863','864','865','867','868','869','870','872','873',
      '876','878',
      '900','901','902','903','904','905','906','907','908','909',
      '910','912','913','914','915','916','917','918','919','920',
      '925','928','929','930','931','934','936','937','938','939',
      '940','941','943','945','947','948','949','951','952','954',
      '956','959','970','971','972','973','975','978','979','980',
      '984','985','986','989',
    ]);
    return AREA_CODES.has(digits.slice(0, 3));
  }

  _renderResults(results) {
    const container = this._el.querySelector('#patient-results');
    if (results.length === 0) {
      container.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:13px;">No results found.</div>';
      return;
    }
    container.innerHTML = results.map((p, i) => `
      <div class="patient-result-item" data-idx="${i}">
        <div class="patient-result-name">${p.given_name} ${p.surname}</div>
        <div class="patient-result-detail">
          PHN: ${p.phn}
          ${p.dob ? ` &bull; DOB: ${p.dob}` : ''}
          ${p.phone ? ` &bull; ${p.phone}` : ''}
        </div>
      </div>`).join('');
    container.querySelectorAll('.patient-result-item').forEach(el => {
      el.addEventListener('click', () => {
        container.querySelectorAll('.patient-result-item').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        const p = results[parseInt(el.dataset.idx)];
        this._selected = p;
        this._renderProfile(p);
      });
    });
  }

  async _renderProfile(patient) {
    const content = this._el.querySelector('#profile-content');
    content.innerHTML = '<div style="padding:20px;"><span class="spinner"></span> Loading...</div>';

    try {
      // Fetch fresh from API if possible
      try {
        const fresh = await PharmacyDashboardAPI.getPatient(patient.phn);
        if (fresh?.phn) {
          DB.upsertPatient(fresh);
          patient = DB.getPatientByPhn(patient.phn) || patient;
        }
      } catch { /* use local data */ }

      const ar      = DB.getPatientARSummary(patient.patient_id);
      const txns    = DB.getTransactionsForPatient(patient.patient_id);

      content.innerHTML = `
        <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <h3 style="font-size:18px;">${patient.given_name} ${patient.surname}</h3>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-outline btn-sm" id="btn-edit-patient">&#9998; Edit</button>
            ${this._params?.returnToPos
              ? `<button class="btn btn-primary" id="btn-link-pos">Link to Current Transaction</button>`
              : ''}
          </div>
        </div>

        <!-- Contact Info -->
        <div class="patient-info-grid">
          <div class="patient-info-box">
            <div class="patient-info-label">PHN</div>
            <div class="patient-info-value">${patient.phn}</div>
          </div>
          <div class="patient-info-box">
            <div class="patient-info-label">Date of Birth</div>
            <div class="patient-info-value">${patient.dob || '—'}</div>
          </div>
          <div class="patient-info-box">
            <div class="patient-info-label">Phone</div>
            <div class="patient-info-value">${patient.phone || patient.cell || '—'}</div>
          </div>
          <div class="patient-info-box" style="grid-column:span 2;">
            <div class="patient-info-label">Address</div>
            <div class="patient-info-value" style="font-size:13px;">
              ${[patient.address, patient.city, patient.province, patient.postal_code].filter(Boolean).join(', ') || '—'}
            </div>
          </div>
          <div class="patient-info-box">
            <div class="patient-info-label">Allergies</div>
            <div class="patient-info-value" style="font-size:13px;color:${patient.allergies ? 'var(--danger)' : 'inherit'};">
              ${patient.allergies || 'None on file'}
            </div>
          </div>
        </div>

        <!-- AR Summary -->
        <div class="ar-summary">
          <div class="ar-box">
            <div class="ar-box-label">Total Billed</div>
            <div class="ar-box-value">${Tax.fmt(ar.billed)}</div>
          </div>
          <div class="ar-box paid">
            <div class="ar-box-label">Total Paid</div>
            <div class="ar-box-value">${Tax.fmt(ar.paid)}</div>
          </div>
          <div class="ar-box owing">
            <div class="ar-box-label">Balance Owing</div>
            <div class="ar-box-value">${Tax.fmt(ar.outstanding)}</div>
          </div>
        </div>

        <!-- Transaction History -->
        <div class="card">
          <div class="card-header">Purchase History</div>
          <div style="overflow-x:auto;">
            ${txns.length === 0
              ? '<div style="padding:16px;color:var(--text-muted);font-size:13px;">No transactions on file.</div>'
              : `<table class="table" id="txn-table" style="width:100%;">
                  <thead>
                    <tr>
                      <th style="width:28px;"></th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${txns.map(t => `
                      <tr data-id="${t.transaction_id}" class="txn-summary-row"
                          style="cursor:pointer;" title="Click to see items">
                        <td style="color:var(--text-muted);font-size:11px;">&#9654;</td>
                        <td>${new Date(t.transaction_date).toLocaleDateString(navigator.language)}</td>
                        <td>${t.transaction_type}</td>
                        <td>${Tax.fmt(t.total_amount)}</td>
                        <td>${Tax.fmt(t.amount_paid)}</td>
                        <td class="${t.balance_owing > 0 ? 'text-danger fw-bold' : ''}">${Tax.fmt(t.balance_owing)}</td>
                        <td><span class="badge badge-${t.status.toLowerCase()}">${t.status}</span></td>
                      </tr>`).join('')}
                  </tbody>
                </table>`}
          </div>
        </div>`;

      content.querySelector('#btn-edit-patient')?.addEventListener('click', () => {
        this._showProfileModal(patient);
      });
      content.querySelector('#btn-link-pos')?.addEventListener('click', () => {
        this._onNavigate('pos', { linkPatient: patient });
      });

      // Expandable transaction rows — click to show purchased items inline
      content.querySelector('#txn-table')?.querySelectorAll('tr.txn-summary-row').forEach(row => {
        row.addEventListener('click', () => {
          const txnId     = parseInt(row.dataset.id);
          const chevron   = row.querySelector('td:first-child');
          const nextRow   = row.nextElementSibling;
          const isOpen    = nextRow?.classList.contains('txn-detail-row');

          // Collapse any open detail row
          content.querySelectorAll('.txn-detail-row').forEach(r => r.remove());
          content.querySelectorAll('.txn-summary-row').forEach(r => {
            const ch = r.querySelector('td:first-child');
            if (ch) { ch.textContent = '▶'; ch.style.transform = ''; }
          });

          if (isOpen) return; // was open → now closed, done

          // Rotate chevron on the clicked row
          if (chevron) { chevron.textContent = '▼'; }

          // Load items from DB and build detail row
          const items    = DB.getItemsForTransaction(txnId);
          const payments = DB.getPaymentsForTransaction(txnId);
          const detail   = document.createElement('tr');
          detail.className = 'txn-detail-row';
          detail.style.cssText = 'background:var(--surface2);';

          const itemsHtml = items.length === 0
            ? '<p style="color:var(--text-muted);font-size:12px;margin:0;">No items on file.</p>'
            : `<table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:10px;">
                <thead>
                  <tr style="color:var(--text-muted);">
                    <th style="text-align:left;padding:3px 6px 3px 0;font-weight:600;">Item</th>
                    <th style="text-align:right;padding:3px 6px;font-weight:600;">Qty</th>
                    <th style="text-align:right;padding:3px 6px;font-weight:600;">Price</th>
                    <th style="text-align:right;padding:3px 0;font-weight:600;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map(it => `
                    <tr style="border-top:1px solid var(--border);">
                      <td style="padding:5px 6px 5px 0;">
                        <span class="badge badge-${it.item_type === 'RX' ? 'rx' : it.item_type === 'OTC' ? 'otc' : 'custom'}"
                              style="font-size:10px;margin-right:4px;">${it.item_type}</span>
                        ${it.description}
                        ${it.rx_number ? `<span style="color:var(--text-muted);font-size:11px;margin-left:4px;">Rx#${it.rx_number}</span>` : ''}
                      </td>
                      <td style="text-align:right;padding:5px 6px;">${it.quantity}</td>
                      <td style="text-align:right;padding:5px 6px;">${Tax.fmt(it.unit_price)}</td>
                      <td style="text-align:right;padding:5px 0;">${Tax.fmt(it.line_total)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>`;

          const payHtml = payments.length > 0
            ? `<div style="font-size:12px;color:var(--text-muted);">
                Paid via: ${payments.map(p => `${p.method} ${Tax.fmt(p.amount)}`).join(', ')}
               </div>`
            : '';

          detail.innerHTML = `
            <td colspan="7" style="padding:10px 16px;">
              ${itemsHtml}
              ${payHtml}
              <div style="margin-top:10px;">
                <button class="btn btn-outline btn-sm btn-full-txn" data-id="${txnId}">
                  &#128196; Open Full Transaction
                </button>
              </div>
            </td>`;

          row.insertAdjacentElement('afterend', detail);
          detail.querySelector('.btn-full-txn').addEventListener('click', () => {
            this._onNavigate('transaction', { transactionId: txnId, patient });
          });
        });
      });
    } catch(e) {
      content.innerHTML = `<div class="alert alert-danger">Error loading profile: ${e.message}</div>`;
    }
  }

  _showProfileModal(existing) {
    const isEdit = !!existing;
    const v = f => existing?.[f] || '';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>${isEdit ? '&#9998; Edit Customer Profile' : '&#43; New Customer Profile'}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">

            <div class="form-group" style="grid-column:span 2;">
              <label>PHN / Customer ID <span style="color:var(--danger);">*</span></label>
              <input id="cp-phn" type="text" value="${v('phn')}" placeholder="e.g. 9876543210 or CUST-001"
                     ${isEdit ? 'readonly style="background:var(--surface2);color:var(--text-muted);"' : ''} />
              <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">
                Must be unique. Use PHN for pharmacy patients or any ID for retail customers.
              </div>
            </div>

            <div class="form-group">
              <label>First Name <span style="color:var(--danger);">*</span></label>
              <input id="cp-given" type="text" value="${v('given_name')}" placeholder="Given name" />
            </div>
            <div class="form-group">
              <label>Last Name <span style="color:var(--danger);">*</span></label>
              <input id="cp-surname" type="text" value="${v('surname')}" placeholder="Surname" />
            </div>

            <div class="form-group">
              <label>Date of Birth</label>
              <input id="cp-dob" type="date" value="${v('dob')}" />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input id="cp-email" type="email" value="${v('email')}" placeholder="email@example.com" />
            </div>

            <div class="form-group">
              <label>Phone</label>
              <input id="cp-phone" type="tel" value="${v('phone')}" placeholder="Home / work" />
            </div>
            <div class="form-group">
              <label>Cell</label>
              <input id="cp-cell" type="tel" value="${v('cell')}" placeholder="Mobile" />
            </div>

            <div class="form-group" style="grid-column:span 2;">
              <label>Address</label>
              <input id="cp-address" type="text" value="${v('address')}" placeholder="Street address" />
            </div>

            <div class="form-group">
              <label>City</label>
              <input id="cp-city" type="text" value="${v('city')}" placeholder="City" />
            </div>
            <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div>
                <label>Province</label>
                <input id="cp-province" type="text" value="${v('province')}" placeholder="BC" maxlength="3" style="text-transform:uppercase;" />
              </div>
              <div>
                <label>Postal Code</label>
                <input id="cp-postal" type="text" value="${v('postal_code')}" placeholder="V1A 2B3" maxlength="7" style="text-transform:uppercase;" />
              </div>
            </div>

            <div class="form-group" style="grid-column:span 2;">
              <label style="color:var(--danger);">&#9888; Allergies</label>
              <textarea id="cp-allergies" rows="2" style="resize:vertical;"
                placeholder="List known allergies, or leave blank if none...">${v('allergies')}</textarea>
            </div>

          </div>
          <div id="cp-error" style="display:none;" class="alert alert-danger" style="margin-top:8px;"></div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <button class="btn btn-outline" id="cp-cancel">Cancel</button>
          <button class="btn btn-success" id="cp-save">${isEdit ? 'Save Changes' : 'Create Profile'}</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#cp-cancel').addEventListener('click', close);

    // Auto-uppercase province/postal
    ['cp-province','cp-postal'].forEach(id => {
      modal.querySelector(`#${id}`).addEventListener('input', e => {
        const pos = e.target.selectionStart;
        e.target.value = e.target.value.toUpperCase();
        e.target.setSelectionRange(pos, pos);
      });
    });

    modal.querySelector('#cp-save').addEventListener('click', () => {
      const errorEl = modal.querySelector('#cp-error');
      const phn       = modal.querySelector('#cp-phn').value.trim();
      const given     = modal.querySelector('#cp-given').value.trim();
      const surname   = modal.querySelector('#cp-surname').value.trim();

      if (!phn || !given || !surname) {
        errorEl.textContent = 'PHN/Customer ID, First Name, and Last Name are required.';
        errorEl.style.display = 'block';
        return;
      }

      // Check uniqueness on create
      if (!isEdit) {
        const exists = DB.getPatientByPhn(phn);
        if (exists) {
          errorEl.textContent = `A profile with PHN/ID "${phn}" already exists.`;
          errorEl.style.display = 'block';
          return;
        }
      }

      const data = {
        phn,
        given_name:   given,
        surname,
        dob:          modal.querySelector('#cp-dob').value      || null,
        email:        modal.querySelector('#cp-email').value.trim()    || null,
        phone:        modal.querySelector('#cp-phone').value.trim()    || null,
        cell:         modal.querySelector('#cp-cell').value.trim()     || null,
        address:      modal.querySelector('#cp-address').value.trim()  || null,
        city:         modal.querySelector('#cp-city').value.trim()     || null,
        province:     modal.querySelector('#cp-province').value.trim() || null,
        postal_code:  modal.querySelector('#cp-postal').value.trim()   || null,
        allergies:    modal.querySelector('#cp-allergies').value.trim()|| null,
      };

      DB.upsertPatient(data);
      Audit.configChange(`${isEdit ? 'Updated' : 'Created'} customer profile: ${given} ${surname} (${phn})`);
      close();

      // Refresh search results and show the new/updated profile
      const saved = DB.getPatientByPhn(phn);
      if (saved) {
        this._results = [saved, ...this._results.filter(r => r.phn !== phn)];
        this._renderResults(this._results);
        this._selected = saved;
        this._renderProfile(saved);
      }
    });

    // Focus first editable field
    setTimeout(() => {
      (isEdit
        ? modal.querySelector('#cp-given')
        : modal.querySelector('#cp-phn')
      ).focus();
    }, 50);
  }

  _setStatus(msg) {
    const el = this._el.querySelector('#search-status');
    if (el) el.textContent = msg;
  }

  detach() {}
}
