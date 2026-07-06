# Data Mapping Reference — WinRx ⇄ Pharmacy POS

> Reference for how data is structured and mapped across the two databases this
> system touches. Compiled from read-only SQL investigation of `winrxdata` and
> the POS schema in `js/db.js`. **Documentation only — describes data, changes no code.**
>
> Two separate databases:
> 1. **WinRx** — SQL Server `PILL4ME-PCY\SQLEXPRESS`, database **`winrxdata`** (the dispensing
>    system; source of truth for prescriptions, fills, billing). Read-only from the app.
> 2. **POS** — local SQLite (sql.js) persisted in IndexedDB, AES-encrypted at rest. Source of
>    truth for **payments collected, AR adjustments, OTC sales, BTC log, checklists**.

---

## 1. WinRx (`winrxdata`) — tables & columns the system uses

### PATIENT — patient demographics
| Column | Meaning |
|---|---|
| `PANUM` | **PHN** (patient key; join key everywhere). Stored with possible whitespace → `LTRIM(RTRIM())`. |
| `PAGIVEN` / `PASURNAME` | given / surname |
| `PABIRTH` | date of birth |
| `PAHOME` / `PACELL` / `PAEMAIL` | phone / cell / email |
| `PAADDR1` / `PACITY` / `PAPROV` / `PAPC` | address / city / province / postal code |
| `PAALLERGY` | allergies |

### RX — prescription master (one row per Rx)
| Column | Meaning |
|---|---|
| `RXNUM` | **Rx number** (key). Numeric (queried as float). |
| `RXPANUM` | PHN (links Rx → PATIENT.PANUM) |
| `RXDIN` / `DIN` | drug identification number |
| `DRUG` | drug name (via join to `DRUG.DGDESC`) |
| `RXQTY` | **prescribed total** qty (NOT the per-fill billed qty — see REFILL) |
| `RXDAYS` | days supply · `RXLIM` refill limit · `ORIGDATE` original date · `RXSIG` directions |
| `RXDRFAX` | prescriber fax number |

### REFILL — actual dispensed/billed fills (one row per fill) ★ key table for billing
| Column | Meaning |
|---|---|
| `RERXNUM` | Rx number (→ RX.RXNUM) |
| `REQTY` | **billed/dispensed qty** for this fill (use this, not RXQTY) |
| `RECOPAY` | **patient copay** — the patient's portion. **This is the AR "billed" amount.** Insurance is NOT here. |
| `REEFDATE` | fill (effective) date |
| `REREVDATE` | set when the fill is **reversed** → exclude `WHERE REREVDATE IS NULL` |

### TXNS — adjudication/transaction amounts
| Column | Meaning |
|---|---|
| `RX` | Rx number |
| `AMT` | amount (may include plan/insurance portion — **do not use for AR**; use REFILL.RECOPAY) |
| `ADJDATE` | adjudication date · `PLANID` plan |

### DRUG — drug catalog
`DGDIN` (DIN, join key) · `DGDESC` (drug description/name).

### BRANCH — pharmacy/store info
`BRID` `BRDESC` `BRADDR1` `BRPROV` `BRPC` `BRPHONE` `BREMAIL`.

### DOCTOR / ERX — prescriber & e-prescribing
`DOCTOR.DRFAX` (prescriber fax) · `ERX.XFAX` (eRx fax).

---

## 2. WinRx fax subsystem (SRFax-based)

WinRx faxes through **SRFax** (cloud fax service), file-based. No SQL "send queue" to insert into — WinRx calls the SRFax API and logs results.

| Table | Role |
|---|---|
| `SRFAX` | SRFax account config (`SRFAXSETTING1/2/3` nvarchar(100) = credentials) |
| `WINMAIL_RECEIVED` | **inbound fax inbox** (see below) |
| `WINMAIL_RECEIVEDLOG` | inbound log |
| `WINMAIL_SENDLOG` | outbound log (`FILENAME`, `SRFaxFileName`, `SRFaxID`) |
| `WINMAIL_CONTACTS` | fax contacts |
| `NETWORK.NWFAX*` | fax settings/status (`NWFAXLASTSENT`, `NWFAXMESSAGEID`, …) |

**`WINMAIL_RECEIVED` columns:** `EntryDate(20)` · `Message(text)` · `Guid(36)` · `NAME(50)` ·
`FAXNUM(50)` (sender) · `PAGES(5)` · `FILENAME(200)` (local fax file) · `ID(int, likely identity)` ·
`Note(200)` · `SRFaxID(100)` · `SRFaxFileName(300)` · `Unread(int)` (1=new) · `FaxPHN(13)` (patient link).
Model: fax PDF stored as a **file** in a fax folder, linked to a patient by `FaxPHN`.
Fax fields elsewhere: `DOCTOR.DRFAX`, `RX.RXDRFAX`, `ERX.XFAX`, `PHARMACIES.FAX`, `ADAPTTXNS.FAX`.

---

## 3. WinRx document push (how the POS attaches receipts)

Two mechanisms (in `electron-app/main.js`):
1. **SQL insert** (`/saveDocument`): auto-discovers a table with a **PHN column + large image/text column**,
   then `INSERT INTO <table>(phnCol, imageCol, typeCol, dateCol, descCol, userCol) VALUES(...)`. `docType='RCPT'`.
2. **Folder drop** (`/save-pdf-file`): writes an A5 PDF (with `RCPT{PHN}` barcode) to a watched WinRx inbox folder.

---

## 4. POS SQLite schema (local; `js/db.js`)

### patients (local cache of WinRx patients + POS-only fields)
`patient_id` PK · `phn` (= WinRx PANUM, unique) · `surname` `given_name` `dob` `phone` `cell`
`email` `address` `city` `province` `postal_code` `allergies` · **`ar_account_no`** (AR account, e.g. AR-0001).

### transactions (a POS sale)
`transaction_id` PK · `patient_id` → patients · `transaction_date` · `transaction_type`
· `status` (`PENDING`/`PARTIAL`/`PAID`/`REVERSED`) · `subtotal` `gst_amount` `pst_amount` `total_amount`
· `amount_paid` `balance_owing` · `staff_pin` `notes` `clover_order_id`.

### transaction_items (line items)
`item_id` PK · `transaction_id` → transactions · `item_type` (`RX`/`OTC`/`CUSTOM`/`DISCOUNT`)
· **`rx_number`** (= WinRx RXNUM for Rx lines — the join key for reconciliation) · `branch_code` · `din` `upc`
· `description` (patient-facing label; for Rx = "Rx #…", privacy-safe) · **`drug_name`** (real med name, internal only)
· `quantity` `unit_price` `gst_applicable` `pst_applicable` `line_total`.

### payments (money collected at the till)
`payment_id` PK · `transaction_id` → transactions · `payment_date` · `amount` · `method` · `clover_payment_id`
· `staff_pin` `notes`.

### ar_entries (manual AR — payments/adjustments NOT through the till)
`ar_id` PK · `patient_id` · `entry_date` · `amount` · `entry_type` (`payment`/`write_off`/`correction`/`credit`)
· `method` · `reference` (de-dup) · `rx_number` (optional targeting) · `branch_code` · `reason` (write-off) · `note` · `staff_name`.

### products / custom_products (inventory & OTC)
`products`: `mckesson_item_no` `description` `upc_unit` `gtin_unit` `din` `suggested_retail`
`regular_unit_price` `price_override`* `qty_on_hand`* `qty_threshold`* `schedule_flag`* `narcotic_indicator` …
`custom_products`: `description` `upc` `price` `qty_on_hand`* … (*added via ALTER). **No acquisition-cost column** (inventory valuation is RETAIL).

### staff
`staff_id` `name` `pin`(bcrypt) `role` `emp_id` `email` `phone` `license_number` `designation`
· **`signature`** (PNG data-URL) · **`signoff_mode`** (`tick`/`pin`) · **`checklist_defaults`** (JSON).

### btc_log (controlled/BTC dispensing log)
`log_type`(`sale`/`received`) `sale_date` `drug_name` `din` `quantity` `price` `pharmacist_name`
`counselled` `patient_name` `patient_phone` `transaction_id` `schedule_flag` `supplier` `lot_number` `notes`.

### shift_checklists (SOD/EOD)
`kind`(`open`/`close`) `checklist_date` `shift_id` `completed_by` `rph_name` `rph_license` `data`(JSON) `pdf_path`.

---

## 5. Cross-system mappings (the important part)

### Join key
**Patient:** `winrxdata.PATIENT.PANUM` = `winrxdata.RX.RXPANUM` = POS `patients.phn`.
**Prescription:** `winrxdata.RX.RXNUM` = `winrxdata.REFILL.RERXNUM` = POS `transaction_items.rx_number`.
(Trim whitespace on PHN; Rx# matching has a refill-ambiguity caveat — see §6.)

### Accounts Receivable (copay billed vs collected)
| Concept | Source |
|---|---|
| **Billed** (patient owes) | `Σ REFILL.RECOPAY` where `REREVDATE IS NULL` (WinRx) — patient copay only |
| **Paid at POS** | `Σ transaction_items.line_total` where `item_type='RX'` on non-reversed sales (POS) |
| **Paid manually** | `Σ ar_entries.amount` (POS) |
| **Owing** | Billed − (POS Rx paid + manual) |

> WinRx records **no payments and no balance** — the POS is the sole record of collection.
> Insurance never enters AR (`RECOPAY` is the patient portion; ignore `TXNS.AMT`).

### Prescription billed vs picked up (planned report)
| Concept | Source |
|---|---|
| **Billed/filled** | `REFILL` fills (WinRx) |
| **Picked up** | Rx# present on a completed POS sale (`transaction_items.rx_number`) — *regardless of $ (covers $0 copays)* |
| **Uncollected (will-call)** | Billed in WinRx but no POS line → still in will-call |

> Open question: does WinRx natively track a pickup/sold/will-call status? If yes, reconcile
> WinRx-billed vs WinRx-pickup (more authoritative). Check `REFILL` columns + `%PICK%/%SOLD%/%WILLCALL%`.

---

## 6. Gotchas / caveats (don't re-learn these)

- **`RECOPAY` (REFILL) = patient copay = AR "billed".** Never use `TXNS.AMT` (may include insurance).
- **Use `REFILL.REQTY`** for billed qty, not `RX.RXQTY` (prescribed total).
- **Exclude reversed fills** (`REREVDATE IS NULL`).
- **PHN whitespace:** always `LTRIM(RTRIM())` when matching PANUM/RXPANUM.
- **Rx# refill ambiguity:** the same `RXNUM` can have multiple fills over time; POS line items don't store the
  WinRx fill date, so per-fill precision is approximate (Rx#-level matching). Fine for AR/will-call reports.
- **POS must capture every pickup/payment** for reconciliation to be accurate (incl. $0-copay Rx rung through the till).
- **Inventory cost:** no cost column in POS products → valuation is **retail**, not cost.
- **`drug_name` is internal-only** (privacy): on-screen/receipts show "Rx #…"; real name kept for BTC log + WinRx docs.
- **Fax = SRFax, file-based** (no SQL send queue). Inbound = file in folder + `WINMAIL_RECEIVED` row.

---

## 7. Read-only discovery queries (re-runnable)
```sql
USE winrxdata;
-- all tables / columns
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='<T>' ORDER BY ORDINAL_POSITION;
-- find columns by concept
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME LIKE '%FAX%';
```
