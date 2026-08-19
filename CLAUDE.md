# CLAUDE.md — Project Context & Work Log

> **For Claude:** Read this first. It captures what this project is, what's been built,
> the conventions to follow, and key lessons learned. **Update this file** whenever you
> complete meaningful work (add to the Work Log, bump the version, note new gotchas).
> Keep it accurate — a future session relies on it to continue seamlessly.

---

## What This Project Is

A **Pharmacy POS** — a Windows desktop app (Electron) for a Canadian pharmacy.
Vanilla JS front-end + SQLite (sql.js/WASM), packaged as a Windows `.exe`.
Integrates with **WinRx** (dispensing system, via SQL Server) and **McKesson PharmaClik**
(wholesaler, via SOAP web services), and **Clover** (card terminal, via local WebSocket bridge).

The user (pharmacy owner) runs the **installed `.exe`** on Windows. The developer machine
is a Mac (this repo). **Claude cannot run the app** — the user tests on Windows and reports back.

---

## Critical Workflow Facts

- **User runs the packaged `.exe`**, NOT from source. So:
  - Changes to **`js/`, `css/`, `index.html`** live in `resources/app/` → take effect after rebuild (or manual file copy into the install folder).
  - Changes to **`electron-app/main.js`, `preload.js`** are sealed in `app.asar` → **require a rebuild**.
  - **When in doubt: rebuild.** Build command on Windows: `cd electron-app && BUILD-WINDOWS.bat`
- **Claude is on Mac, cannot run/preview the app.** Ignore "preview server" hook nudges — verify by `node --check` on edited JS files instead.
- After editing any `js/*.js`, **bump its `?v=N` query string in `index.html`** so the app doesn't serve a cached old copy.

---

## Versioning (started this convention)

- **Single source of truth:** `js/version.js` → `window.APP_VERSION`
- **Must stay in sync with** `electron-app/package.json` `"version"` (that names the installer `.exe`).
- Shown in-app on the **login screen** and **Settings top-right**.
- Scheme: `MAJOR.MINOR.PATCH`. Most builds = PATCH bump.
- **Current version: 1.4.3**
- When making a build, bump both files and note it in the Work Log below.

---

## Architecture / Key Files

```
pharmacy-pos/
├── index.html              # loads all JS (with ?v= cache-busting)
├── js/
│   ├── version.js          # APP_VERSION
│   ├── db.js               # SQLite schema + all DB functions
│   ├── config.js           # encrypted config store (AES); Config.get/set/setMany
│   ├── auth.js             # PIN login, lockout, roles
│   ├── app.js              # router
│   ├── screens/
│   │   ├── login.js        # PIN pad + first-run setup
│   │   ├── pos.js          # MAIN sales screen, payments, BTC popup, refunds (largest file)
│   │   ├── patient.js
│   │   ├── transaction.js
│   │   ├── settings.js     # ALL settings tabs (largest file)
│   │   └── reports.js      # reports + McKesson order/receive + BTC log
│   ├── api/
│   │   ├── mckesson.js     # SOAP: catalog/upload/invoices (via electronAPI.mckessonSoap)
│   │   ├── clover.js       # talks to local clover bridge
│   │   ├── pharmacy-dashboard.js  # WinRx lookups (via local SQL API or Cloudflare worker)
│   │   └── email.js
│   ├── utils/
│   │   ├── print.js        # receipts, A5 docs, Code128 barcode
│   │   ├── shelf-tags.js   # shelf price tags + EAN/UPC barcodes
│   │   ├── scheduler.js    # automated daily/monthly report emails
│   │   ├── tax.js, audit.js, report-print.js
│   └── parsers/            # barcode.js, webcat.js (McKesson catalog format)
├── electron-app/
│   ├── main.js             # Electron main: SQL conn, IPC handlers, Clover bridge spawn, McKesson SOAP, PDF/print
│   ├── preload.js          # exposes window.electronAPI.* to renderer
│   ├── package.json        # version + electron-builder config
│   └── icon.ico            # pharmacy logo (6 PNG-frame sizes incl 256)
├── clover-local-pay/
│   └── server.js           # WebSocket bridge to Clover Network Pay Display
├── README.md               # full user & setup guide
├── SQL-SETUP.md            # how to make the read-only SQL login
└── CLAUDE.md               # this file
```

---

## Key Lessons / Gotchas (don't re-learn these)

1. **McKesson uses TWO numbers** (from WinRx → Supplier screen):
   - **Account #** (e.g. 123456) → used for **order upload** (`AccountNumber`)
   - **Customer #** (e.g. 1234567) → used for **invoices & catalog** (`CustomerNumber`)
   - Config keys: `mckesson_account`, `mckesson_customer`. Mixing them up gives the
     confusing fault **"Invalid User Type"**.
2. **McKesson SOAP needs the correct SOAPAction** or the TIBCO ESB returns its WSDL instead
   of a result. Actions: `UploadOrderOp`, `AllNew`, `InvoiceByDate`, `getInvoices`, `getCatalog`.
   Element structure is case-sensitive (e.g. `ItemIDType`, `Action_Type` with underscore for ByDate).
   All SOAP runs through `window.electronAPI.mckessonSoap` (Node, no CORS).
3. **WinRx barcode** on receipts encodes only `RCPT{PHN}` in the bars; the human-readable
   label is `RCPT{PHN} - {GIVEN} {SURNAME} {DD-Mon-YYYY}`. Encoding the whole label breaks scanning.
   Parse DOB as a local date string (not `new Date()`) to avoid timezone day-shift.
4. **Config.set race condition:** calling `Config.set` many times concurrently (Promise.all)
   races — each does load-modify-save. Use **`Config.setMany({...})`** for multiple keys.
5. **Clover bridge** now runs IN-APP via `ELECTRON_RUN_AS_NODE=1` + `process.execPath`
   (no separate Node install, no shortcut). Device config is entered in Settings →
   written to `clover-local-pay/.env` via `electronAPI.saveCloverEnv` → bridge restarts.
6. **savePdfFile / mckessonSoap / saveCloverEnv** are IPC handlers in `main.js` exposed via
   `preload.js` → renderer calls `window.electronAPI.*`. New IPC = edit BOTH main.js and preload.js + rebuild.
7. **icon.ico** must be a real multi-size ICO with a 256×256 frame or electron-builder fails.
   Built via Python PIL writing PNG-compressed frames.
8. **`window.prompt()` does NOT work in Electron** (Chromium disables it → silent no-op/undefined).
   Never use it. Use an in-app modal. `alert()`/`confirm()` DO work. (This silently broke Hold + Email receipt.)
9. **DB encryption key MUST be stable & independent of the config/login passphrase.** The config key
   (`Config._cryptoKey`) changes mid-session (login flows call `unlock(...)`), so encrypting the DB with it
   locks you out next launch. Use `Config.getDbKey()` (fixed string + salt). `_loadFromIDB` has a recovery
   path that tries legacy keys then re-saves under the stable key. Don't reintroduce `Config.unlock(null)`.
10. **`??` vs `0`:** `a ?? b` keeps `a` when it's `0` (only falls back on null/undefined). Bit us on Rx copay
    (`getRxTx` 0 clobbered a good RECOPAY). Use `> 0` checks for prices, not `??`.

---

## What's Been Built (feature state)

**All working for a WinRx + McKesson + Clover pharmacy:**
- Phase 1: secure PIN login + lockout, no plaintext PINs in audit, inventory auto-deduct, allergy banner
- Phase 2: WinRx barcode fix, RPh sign-off (counselling + license), AR payment, discounts (preset/reason), cart hold/resume, receipt layout customization, white-label pharmacy details, app icon
- Phase 3: partial refunds (+ Clover auto-refund), BTC/Controlled substance flag + counselling popup + PDF records + searchable log w/ running balance + CSV; BTC has two tiers (BTC = name optional, Controlled BTC = name required)
- McKesson: catalog sync, order upload, invoice download + auto-receive (with OTC/BTC/Rx review screen — Rx skipped), Receive Stock manual entry, shelf-tag popup after receiving
- Shelf tags: Avery + thermal presets, real UPC/EAN-13 barcodes, live preview
- Reports: sales/tax/method/products/shifts/BTC; daily+monthly automated emails with selectable sections
- Clover: in-app bridge, Settings-based device config, pair, sale, refund, no Clover receipt prompt
- Docs: README.md (user guide), SQL-SETUP.md

**Known limits (by design):**
- Tied to WinRx for Rx lookup (other dispensing systems need new SQL mapping)
- Tied to McKesson for ordering (other wholesalers need new integration)
- Clover is the only INTEGRATED card terminal; others would use standalone/manual (a non-Clover
  fallback was discussed but NOT implemented — user said leave Clover code untouched)
- No DUR/drug-interaction checking; no auto-update

**Open / not done:**
- Cash drawer trigger: NOT implemented. Drawer connects via receipt printer (Xprinter XP-80) RJ11 port,
  opens via ESC/POS kick `1B 70 00 19 FA`. Options: (A) printer-driver auto-kick (no code),
  (B) app-triggered raw kick (needs raw printing on Windows). Awaiting user's printer test result + connection type (USB/Ethernet/Serial).
- McKesson invoice download returned "Invalid User Type" until Customer# fix — confirm stable.

---

## Work Log (newest first — append new entries here)

### 1.4.3 — (current)
- **Version bumped to 1.4.3 so the built-in updater can actually fire.** Some machines had `js/`
  copied in manually, so they *report* 1.4.2 while their `app.asar` + Clover bridge are still the old
  build. Publishing a `v1.4.2` release would make `_semverGt('1.4.2','1.4.2')` → false → "You're up to
  date", and the Clover manual-entry fix would never reach the terminal. Releasing as **v1.4.3** gets
  those mislabelled installs back onto the normal update path.
- **Updater asset matcher hardened.** `BUILD-WINDOWS.bat` emits **two** exes (NSIS `Pharmacy POS Setup
  <ver>.exe` *and* `PharmacyPOS-Portable.exe`). The old `find(a => a.name.endsWith('.exe'))` took
  whichever came first — if that was the portable, staff downloaded a standalone app that RUNS the new
  version **without upgrading the installed one**, leaving the old build in place and the update
  silently doing nothing. Now prefers `/setup/i`, then any non-portable exe, then falls back.
- **Reminder for releases: attach ONLY the Setup exe** (belt and braces with the matcher above).

**Publishing an update (developer task — these steps are deliberately NOT in the POS UI):**
1. Bump `js/version.js` + `electron-app/package.json` (keep in sync), bump `?v=` for edited `js/` files.
2. Windows: `cd electron-app && BUILD-WINDOWS.bat` → `electron-app\dist\Pharmacy POS Setup <ver>.exe`.
3. GitHub → Releases → Draft a new release → tag `v<ver>` → attach the **Setup** exe → Publish.
4. On each PC: Settings → Updates → Check for Updates → Download → run installer (NSIS `oneClick`).
   NB: the updater is a **notifier**, not an auto-updater — it opens the browser, a human runs the .exe.
   With **zero** releases published the GitHub API 404s; that's normal, not a fault.

### 1.4.2
- **Clover manual (keyed) card entry FIXED — the terminal never showed the manual-entry screen.**
  Root cause: `cardEntryMethods` is **not** a simple 4-bit flag. It is three masks OR'd together
  (clover-android-sdk `Intents.java`):
  `bits 0-3` base methods (mag=1 chip=2 tap=4 **manual=8**) | `bits 8-11` **KIOSK-mode** mask
  (mag=256 chip=512 tap=1024 **manual=2048**) | `bit 15` `KIOSK_MODE_CARD_ENTRY_MASK_SUPPLIED` (32768).
  Network Pay Display runs the device in **customer-facing kiosk mode**, so it reads the KIOSK mask —
  and if bit 15 is absent it **discards the whole mask** and falls back to its own defaults
  (swipe/chip/tap, no manual). `pos.js` was sending bare `8` for manual / `15` for normal → ignored.
  Correct values: **MANUAL 34824**, **DEFAULT 34567**, **ALL 36623**.
  - `pos.js` now sends `CloverAPI.CARD_ENTRY.MANUAL` / `.ALL` instead of `8` / `15`
    (also `_runCloverPayment` default param + the two "enter card number" message checks).
  - `js/api/clover.js` exports **`CloverAPI.CARD_ENTRY`** = { DEFAULT, MANUAL, ALL } — single source of truth.
  - `clover-local-pay/server.js`: constants rebuilt from the real bit math (the old MAG/ICC/NFC/DEFAULT/ALL
    all carried manual's kiosk bit 2048 and lacked their own 256/512/1024 — old `ALL` 34831 literally meant
    "all four normally, but **manual only** in kiosk mode"). Added **`normalizeCardEntry()`** so a bare base
    value from an older renderer is upgraded to a kiosk-valid mask instead of silently failing. TX_START log
    now prints the effective value + `manual ON/off`.
  - Removed **`allowManualCardEntry`** from `transactionSettings` — **no such field exists**; manual entry is
    controlled *only* through `cardEntryMethods`. (Real PayIntent field is `isAllowManualCardEntryOnMFD`.)
- **If the screen still doesn't appear after this build**, the remaining causes are device-side, not code:
  (a) manual entry not enabled in **Setup → Payments** on the terminal; (b) the option sits behind
  **"More Options"** on the customer screen; (c) merchant not boarded for keyed / card-not-present.
  Check `[clover] TX_START … cardEntryMethods:34824 (… manual ON)` in the log to confirm the app's half is right.
- NB: `transactionSettings.disablePrinting` is **also not a real field** (the SDK maps it to
  `cloverShouldHandleReceipts`, inverted). Left as-is — `disableReceiptSelection: true` is what actually
  suppresses the receipt prompt today, so behaviour is unchanged. Revisit only if the prompt reappears.
- `BUILD-WINDOWS.bat` no longer prints a hardcoded (stale) installer filename.
- **Settings → Updates cleaned up:** removed the developer "How to publish an update" block (staff
  shouldn't see "bump js/version.js"); the tab is now just version + Check for Updates + Download.
  Also fixed the check itself — GitHub returns **404 when a repo has no releases yet**, which the old
  code threw as a red "GitHub API returned 404" error (the intended "No releases published yet" branch
  was unreachable). 404 now reports normally. Repo is public; 404 = nothing published yet.
  **Publishing an update is a developer task — the steps live here in CLAUDE.md, not in the POS UI:**
  bump `js/version.js` + `electron-app/package.json` → `BUILD-WINDOWS.bat` → GitHub → Releases →
  Draft a new release → tag `v<version>` → attach `Pharmacy POS Setup <version>.exe` → Publish.

### 1.4.1
- **AR correctness + interactivity batch (refines 1.4.0 AR):**
  - **Per-Rx reconciliation:** AR now computes billed/paid/owing **per prescription** (`getPosRxPaidByRx`
    groups POS RX line-item dollars by Rx#). Fixes the over-credit bug where the old `getPosPaidForPatient`
    subtracted whole-transaction payments (OTC + tax). Paid now = **Rx copay collected only**. Handles partial
    pay (billed $10 / collected $9 → $1 standing balance).
  - **Aging on the dashboard** (was drill-in only) + **clickable** aging tiles → filter the table to that bucket;
    KPI tiles clickable (Total/Accounts = clear filter, Largest = open that statement); CSV respects the drill-down.
  - **Statement = interactive control panel:** From/To **date range**, per-Rx **Pay** / **Write off** buttons
    (pre-targeted, amount pre-filled), header **+ Record payment**, and an editable **Payments & adjustments**
    list (Edit/Del, Admin-gated for write-offs). New `reports.js` `_showArRecordModal` + `_showArEntryEditModal`.
  - `db.js`: `getPosRxPaidAmount`, `getPosRxPaidByRx`, `getArEntry/updateArEntry/deleteArEntry`,
    `getInventoryValuation` (retail), `getTotalCollectedInRange`.
- **Accounts Payable: decided NOT to build** — suppliers (McKesson etc.) **auto-debit from the bank**, so there's
  no due-date/payment tracking to manage; the accountant reconciles payables from the bank statement. Revisit only
  if a supplier moves to invoice-on-terms.

### 1.4.0
- **Brand Kit + UI refresh (token-based):** `css/style.css` `:root` reworked to a brand palette
  (green `#1e4031` primary, warm `#f4f3ee` bg, red `#c62f25`, amber `#e9a93c`), larger radius, softer
  shadows, focus rings. **Real checkbox fix**: the global `input{width:100%}` was stretching checkboxes
  → now `input:not([type=checkbox])…` + a dedicated 16px `accent-color` rule. `app.js` `applyBrandKit(kit)`
  sets CSS vars + a global `window.BRAND_KIT` (so print builders can read colours synchronously); legacy
  `applyThemeColour` kept. Settings → Pharmacy Details → **Brand Kit** (Background + Color 1/2/3 swatches,
  live preview, reset). Stored in Config `brand_kit` (JSON). Old single `theme_colour` picker removed.
- **Print-template theming:** name tags (brand header bar + border), shelf tags (name/price/border in brand),
  receipt + WinRx pickup doc headers in brand green — all via `window.BRAND_KIT`. NB: thermal printers are
  monochrome, so colour only shows on colour printers (name badges, the WinRx PDF).
- **Name tags now print thermal-style** (one badge per page `@page{size:WxH;margin:0}`, like shelf tags).
- **Accounts Receivable (Phases 1–3).** Model: **Owing = Σ REFILL.RECOPAY (WinRx, patient copay only —
  insurance never included) − (POS payments + manual ar_entries)**. WinRx records NO payments/balance, so
  the POS is the sole record of collection. Reconciliation is live-query (cache later if slow). Source of
  truth doc: `docs/winrx-ar-investigation.md`, plan in `docs/ar-ap-plan.md`.
  - `db.js`: `ar_entries` table (payment/write_off/correction/credit; method, reference, rx_number, reason,
    audit); `patients.ar_account_no` (+ `getNextArAccountNo` AR-0001, `setPatientArAccount`,
    `getPatientByArAccount`); `transaction_items.drug_name`; helpers `getPosPaidForPatient(asOf)`,
    `getArManualPaid(asOf)`, `getArEntryByReference`, `getArWriteOffs`, `getInventoryValuation` (RETAIL —
    no cost column), `getTotalCollectedInRange`.
  - `js/utils/ar.js`: `getPatientAR` (billed−paid, **Rx-targeted entries first then oldest-first**, aging,
    credit, as-of date), `getStatement` (privacy-safe `Rx #` ledger), `getAROutstandingAll` (dashboard),
    `getYearEndAR` (aging across owing patients as-of fiscal year-end).
  - WinRx: new `/getAllBilled` route in `main.js` (grouped `SUM(RECOPAY)`, Cutoff + AsOf) +
    `PharmacyDashboardAPI.getAllBilled`. **main.js change → rebuild required.**
  - UI: Reports **Accounts Receivable** tab (KPIs, patient/PHN/acct **search**, **Billed-from** cutoff +
    **As-of** date, who-owes table, statement drill-in, CSV); Reports **Year-End (Accountant)** tab (AR aging
    + bad debt written off + inventory + sales/tax, CSV + print). Patient profile: reconciled AR summary,
    **Record Payment / Adjustment** modal (Admin-only write-off w/ reason, reference de-dup, **Apply to Rx#**
    picker), **Assign AR #** button.
  - **Open / not done:** Phase 4 (monthly statements, overdue reminders, credit limit), Phase 5 (Accounts
    Payable: supplier invoices + McKesson import), facility/payer accounts (deferred as a filter),
    inventory **cost** field (valuation is retail until added).

### 1.3.0
- **Database encryption at rest + recovery (Option 1):** the SQLite blob is now AES-GCM encrypted
  in IndexedDB. Uses a **dedicated, stable DB key** derived from a fixed string + salt (`Config.getDbKey`),
  **independent of the login/config passphrase** — see the lesson below. `db.js` `_saveToIDB` encrypts,
  `_loadFromIDB` decrypts; legacy plaintext DBs auto-migrate (no `PEDB` magic header → load as-is, re-saved encrypted).
  New `config.js`: `getDbKey`, `deriveKeyFromPassphrase`, `encryptBytesWith/decryptBytesWith`, `isEncryptedBlob`.
  Recommend pairing with **BitLocker** (key is in source → protects against file/backup theft, not source-level attacker).
- **CRITICAL fix — "Could not decrypt the database" lockout:** first DB-encryption build tied the DB key to the
  *config* key, which **mutates mid-session** — `login.js` called `Config.unlock(null)` (passphrase "null") after PIN
  login, so saves were encrypted under a different key than startup tried. Fix: (1) dedicated stable DB key (above);
  (2) `_loadFromIDB` recovery tries legacy keys `['null','pharmacy-pos-config-v1','default_pos_2024']` then re-saves
  under the stable key; (3) `login.js` no longer calls `unlock(null)` (`if (pp) await Config.unlock(pp)`).
- **Electron `prompt()` fixes:** `window.prompt()` is disabled in Electron/Chromium → silently no-ops. Replaced with
  in-app modals: **Hold cart reason** (`_askHoldReason`) and **Email receipt address** (`_askEmailAddress`).
  This was the real cause of earlier "Hold not working". (`alert`/`confirm` still work.)
- **Nightly DB backup:** Settings → Backup → "Automatic Nightly Backup" (enable + time + folder + Back Up Now).
  Scheduler (`scheduler.js` `runBackupNow` + `_check`) writes a plaintext `.sqlite` (restorable via Import) to the
  folder once/day (`auto_last_backup` guard). Reuses the `save-pdf-file` IPC (auto `YYYY-MM/` subfolders). One file
  per day (overwrites within the same day); no auto-prune. Point folder at OneDrive/BitLocker location.
- **EOD/SOD checklists rebuilt to the PODSA regulation form** (`docs/eod-template-reference.md` = source of truth).
  New engine in `checklists.js`: section regulatory badges, per-item legal citations (notes), **RPh-initials** fields,
  **Yes/No** dropdowns (narcotic/wholesaler order received), **cold-chain temp log** (current/min/max + ranges +
  out-of-range auto-flags excursion, **required**), editable **daily metrics**, header (RPh on duty/tech/closing time),
  and a sign-off with **CPBC #**. PDF output matches.
- **Two-signature model + stored signatures + sign-off modes:**
  - Anyone (tech) can complete the checklist; the **Pharmacist on Duty counter-sign is the required gate** (removed the
    hard block that stopped non-RPh from ticking RPh items — pharmacist attestation covers them).
  - Per-staff **stored signature** (draw once, `staff.signature`), **`signoff_mode`** (`'tick'` | `'pin'`, default pin),
    and **`checklist_defaults`** (JSON: routine items to pre-check). New `db.js` columns + `getStaff`; `Auth.verifyPin`
    (session-safe bcrypt check); reusable `js/utils/signature-pad.js`.
  - Sign-off popups (EOD/SOD `checklists.js` + in-sale counselling `pos.js` `_showRphSignatureModal`) get a **"Sign as"
    pharmacist picker** → auto-fills name/CPBC/signature, gates by mode (PIN re-entry = **same login PIN** via verifyPin,
    or tick attestation), stamps stored signature on the PDF. Draw pad kept as manual fallback.
  - **Checklist default pre-checks**: routine (non-regulatory) items only — regulatory/PODSA/RPh/Yes-No/temp items
    ALWAYS start unchecked (`Checklists.eligibleDefaultItems`, `itemId`, `isRegulatory`). Set in Staff edit.
- **Rx popup copay = $0 fix:** `_showPendingRxPrompt` add handler used `rxData?.unit_price ?? r.copay` — `??` keeps a
  fetched **0** (doesn't fall back). Now honors the displayed copay (RECOPAY) when >0 and only calls `getRxTx` for
  "price on add" (copay 0) rows. (`_showPatientProfileModal` was already fine — uses `r.copay` directly.)
  NB: if a "price on add" row still lands $0 after this, `getRxTx` returns empty for that Rx/branch while
  `getPatientProfile` got a copay — a WinRx query mismatch to reconcile later.
- **Drug-name privacy:** Rx items no longer show the medication name **anywhere on screen** (cart, receipt,
  customer display, scan-selection popups all show `Rx #<num> [Qty:n]`). The real name is kept on the cart item as
  `item.drug_name` (NOT displayed) and persisted to a new `transaction_items.drug_name` column. Used ONLY for the
  legal **BTC log** (`item.drug_name || item.description`) and the internal **WinRx pickup docs** — `print.js`
  `buildItemRows(items, revealRx)` / `generateReceiptHTML(..., revealRx)` take a `revealRx` flag; `generateReceiptBase64`
  + `generateFolderDocBase64` pass `true` (real name), the customer receipt (`printReceipt`) passes false (privacy label).
- **Counselling checkboxes still OPTIONAL on the RPh sign-off** (user not yet decided to require them).

### 1.2.0
- **Retail polish batch ("Phase A"):**
  - **Cart quantity stepper** — OTC/Custom cart lines have −/+ to change qty (Rx stays 1 = per-fill copay). `_changeItemQty`.
  - **Hold cart with reason** — ⏸ Hold button parks the cart with a label to localStorage `pos_held_carts` (multiple). Top-bar "Held" button + count badge. `_holdCartWithReason`, `_showHeldCartsModal`, `_getHeldCarts/_setHeldCarts/_refreshHeldCount`. (Separate from the auto-lock single-cart hold which uses `pos_held_cart`.)
  - **Print Quote** — 📄 Quote button prints a "QUOTE / ESTIMATE" (items+amounts, no payment) for delivery/patient. `_printQuote` (hidden-iframe print).
  - **Empty-cart tiles** — when cart is empty: "⏸ Resume Held Cart" (count, shows only if held) + "📋 Find Paid Receipt". Rendered inside `_updateDisplay` empty branch.
  - **Find Paid Receipt** — enter txn# → shows details → 🖨 Reprint + ✉ Email Receipt. `_showFindReceiptModal`, `_emailReceipt` (uses Print.generateReceiptHTML + EmailAPI.send; prompts for address, prefills patient.email).
- **Staff Name Tags** — Settings → Name Tags. Two presets (name-badge 2⅓×3⅜, credit-card 3.375×2.125). Pharmacy name+logo + employee name + designation + optional license#. `_renderNameTags`. Added **Designation/Title + License#** fields to Staff edit; `DB.updateStaff` now dynamic (includes designation/license_number); `staff.designation` column added.
- **Settings nav regrouped** into 5 sections w/ headers: Pharmacy Setup / Connections / Products & Pricing / Printing & Labels / Records & Reports. Header rows use `['__hdr__','Label']` sentinel in the nav array.
- **📁 Browse buttons** on all folder-path fields (WinRx doc inbox, BTC, Shift records). IPC `pick-folder` (dialog.showOpenDialog openDirectory+createDirectory) in main.js + `electronAPI.pickFolder` in preload. Wired via delegated handler on `[data-browse]` (value = input selector).
- **Patient Rx popups — billed-only + date filter:** both `_showPatientProfileModal` and `_showPendingRxPrompt` default to "Today", filter Today/Week/All/date-picker, select-all-shown, running total. `getPatientProfile` now queries **REFILL** (actual billed fills: REQTY, RECOPAY, REEFDATE, excl. REREVDATE) instead of RX (all on file) — so only billed Rx show, with billed qty + real fill date.
- **Fixed invisible buttons:** `var(--accent)` was undefined in CSS → replaced with `var(--primary)` (3 spots in pos.js).

### 1.1.0
- **Billed-qty fix:** Rx qty now pulls the latest non-reversed fill's `REFILL.REQTY` (billed),
  not `RX.RXQTY` (prescribed total). Key WinRx schema: REFILL table keyed by `RERXNUM`,
  fill date `REEFDATE`, reversed fills have `REREVDATE` set. Copay still from TXNS.AMT
  (REFILL.RECOPAY available if we ever want exact per-fill copay). TXNS has NO qty column.
- **Patient Rx popup — date-wise selection:** Today / This Week / All / date-picker filter,
  "select all shown", running total in footer. Defaults to Today for same-day pickup billing.
- **Silent print margins fix:** receipts laid out to PRINTABLE width (80mm→72mm, 58→48) and
  page sized to measured content height with margins:none — fixes right-edge clipping on the XP-80.
- **Opening (SOD) + EOD checklists integrated:** trigger on shift open/close; two-signature model
  (completed-by + RPh counter-sign w/ license), RPh-only items gated to pharmacist login,
  cold-chain temps, auto-filled EOD metrics; saves PDF to "Shift Records" folder + emails a copy.
  Templates in js/utils/checklists.js (BC/NAPRA wording — make editable for other provinces later).
- Confirmed: patient NEVER sees drug cost or markup (RECOST/REUPCHG) — only copay + qty.
- BUILD-WINDOWS.bat now also `npm install`s the Clover bridge deps so they're always bundled.
- Stale Clover "(npm start)" error message → points to "Save Clover Device".

### 1.0.0
- Set up versioning: `js/version.js` + shown on login & settings. package.json stays in sync.
- Created CLAUDE.md (this file), README.md (full guide), SQL-SETUP.md.
- Clover device config moved into Settings (writes .env + restarts bridge in-app).
- Clover bridge auto-starts inside the .exe (ELECTRON_RUN_AS_NODE) — no more shortcut/.bat.
- McKesson: full integration working after Account#/Customer# split fix.
  Catalog (getCatalog), upload (UploadOrderOp), invoices (AllNew/InvoiceByDate/getInvoices) all via Electron SOAP bridge.
- McKesson invoice receive: OTC/BTC/Rx classification + review screen (Rx skipped); shelf-tag popup after receive.
- Phases 1–3 complete (see feature state above).

*(When you finish work, add a new dated entry above this line. Bump the version if you made a build.)*

---

## How a New Session Should Start

1. Read this file top to bottom.
2. Check **Current version** and the **Work Log** for the latest state.
3. Check **Open / not done** for what's pending.
4. Remember: user is on Windows running the `.exe`; you're on Mac and can't run it.
   Verify edits with `node --check`, bump `?v=` in index.html, and tell the user when a rebuild is needed.
5. When done, **update the Work Log and version** here.
