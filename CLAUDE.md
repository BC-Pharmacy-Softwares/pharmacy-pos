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
- **Releases are built by GitHub (since 1.4.9).** Pushing a tag `v<version>` runs
  `.github/workflows/release.yml` on a Windows runner: it checks the tag matches `js/version.js` +
  `electron-app/package.json`, downloads `lib/` (git-ignored), `npm ci`s both packages, builds the
  **Setup exe only**, and publishes the GitHub Release that **Settings → About & Updates → Check for
  Updates** reads. So a release from the Mac is: bump both version files → commit → push `main` →
  `git tag v<ver> && git push origin v<ver>`. `BUILD-WINDOWS.bat` still works as a manual fallback.
- **Claude is on Mac, cannot run/preview the app.** Ignore "preview server" hook nudges — verify by `node --check` on edited JS files instead.
- After editing any `js/*.js`, **bump its `?v=N` query string in `index.html`** so the app doesn't serve a cached old copy.

---

## Versioning (started this convention)

- **Single source of truth:** `js/version.js` → `window.APP_VERSION`
- **Must stay in sync with** `electron-app/package.json` `"version"` (that names the installer `.exe`).
- Shown in-app on the **login screen** and **Settings top-right**.
- Scheme: `MAJOR.MINOR.PATCH`. Most builds = PATCH bump.
- **Current version: 1.4.13**
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
│   │   ├── settings-health.js  # SettingsHealth (setup checks) + SettingsLink (error → setting deep links)
│   │   ├── tax.js, audit.js, report-print.js
│   └── parsers/            # barcode.js, webcat.js (McKesson catalog format)
├── electron-app/
│   ├── main.js             # Electron main: SQL conn, IPC handlers, Clover bridge spawn, McKesson SOAP, PDF/print
│   ├── preload.js          # exposes window.electronAPI.* to renderer
│   ├── package.json        # version + electron-builder config
│   └── icon.ico            # pharmacy logo (6 PNG-frame sizes incl 256)
├── clover-local-pay/
│   └── server.js           # WebSocket bridge to Clover Network Pay Display
├── .github/workflows/
│   └── release.yml         # tag v<ver> → builds the Windows installer → publishes the GitHub Release
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
11. **Settings nav is data-driven — adding a setting means touching THREE things** (top of `settings.js`):
    `SETTINGS_NAV` (which group/page, `admin`/`desktop` flags, the one-line `about`), `SETTINGS_SEARCH`
    (one entry per findable setting: `t`, `tab`, `sel` = the field's `#id`, `k` = extra keywords), and the
    `_renderTab` switch. A setting missing from `SETTINGS_SEARCH` still works but **can't be found by search**.
    Also: **Reports reuses `.settings-nav` / `.settings-body` / `.settings-nav-item`** — new Settings styles must be
    scoped under `.settings-v2` or they leak into Reports. Error messages that say "Settings → X" must use the new
    names (Card Terminal, WinRx & McKesson → McKesson Login, Folders & Backup, Email & Reports) — and any NEW
    "Settings → …" phrase must be added to `SettingsLink`'s `MAP` in `settings-health.js`, or it won't become a link.
    New "is this set up?" checks go in `SettingsHealth.check()`. Use level **`warn`** only for things that are
    silently failing (records not saved, email can't send, backups off) — `warn` is what the POS ⚙ button counts,
    and a badge that's always lit gets ignored. Optional/unused features are **`setup`**.
12. **AR rules (1.4.9) — `js/utils/ar.js` `_reconcile()` is the ONLY place AR is computed** (patient page,
    statements, dashboard, the payment screen's "Current balance"). Don't add a second calculation — that is
    how the old app came to show two different balances. The rules: *collected* = money actually taken
    (`payments.method = 'AR'` is a charge, not a payment; a refund inherits its sale's payment mix via the
    `Refund for Txn #N` note); a copay belongs to **the Rx's owner in WinRx** (`/getRxOwners`), not the
    sale's linked patient; Rx numbers compare via `AR.normRx` (no leading zeros), PHNs via `AR.normPhn`;
    unmatched POS money becomes credit, never dropped. **`/getPatientProfile` is `TOP 60` — it's for the POS
    pick list only; AR must use `/getPatientBilled` (uncapped).**
13. **WEBCAT catalogue files mix record types — ALWAYS check position 1.** `P` = product (396 chars),
    `S` = specials/promotions (345 chars, a completely different layout, spec §2.4.2.2). Both carry the item
    number at 2–7, so parsing an `S` row as a product **overwrites the real product** via
    `ON CONFLICT(mckesson_item_no) DO UPDATE` — description becomes `REG00120…`, DIN/GTIN/prices go NULL.
    Three more field traps in the same spec (§2.4.2.1), all of which bit us:
    **GST/PST `F` = "Forced" means the tax APPLIES** (only `N`/blank are untaxed);
    **narcotic `N` = "narcotic, non-controlled" — it does NOT mean "no"** (`C` = controlled, blank = neither),
    so never write `narcotic_indicator !== 'N'` — use `WebcatParser.isNarcotic()` / `.narcoticClass()`;
    and **`regular_unit_price` is McKesson's unit COST**, never a retail price — don't put it in a price
    `COALESCE`. The UPC is three fields (104, 105–111, 112–116), and the spec says prefer GTIN anyway.
    Tests: `node tests/webcat.test.js` (needs `lib/`).
14. **`lib/sql-wasm.js`, `lib/sql-wasm.wasm`, `lib/bcrypt.min.js` are git-ignored** (the setup scripts
    download them). Any build from a fresh checkout — e.g. the release workflow — must download them first
    (sql.js 1.10.2, bcryptjs 2.4.3) or the app ships without its database engine and won't start.

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
- Settings (1.4.8): task-based navigation + search, Overview with setup health checks, ⚠ badges (sidebar + POS
  button), error messages that deep-link to the fix, real folder checks + Open folder, one Receipt Design page,
  SMTP-only Email with Gmail/Outlook quick setup
- Opening & Closing (SOD/EOD) log viewer in Reports, stale-open-shift warning (1.4.6+)
- AR reconciliation rebuilt (1.4.9): charges to AR stay owing, copays credited to the Rx's owner, no fill cap,
  one calculation everywhere; releases published automatically from a git tag
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

### 1.4.13 — (current)
**ROOT CAUSE FOUND — Clover nests JSON inside JSON, and the bridge only parsed the outer layer.**
Found by reading an actual `FINISH_OK` payload off the terminal (the log added in 1.4.12 is what made this
possible). **⚠ `server.js` changed → rebuild.**
- The RemoteMessage envelope's `payload` is a JSON string — already parsed. But **`payment` INSIDE it is
  *also* a JSON string**, and `cardTransaction.extra.card` is a third level. The bridge did
  `payload.payment || {}`, so `payment` was a **string**: no `.cardTransaction`, no `.id`. Two consequences,
  one of them serious:
  - `cardDetails()` saw a string, found nothing, returned null → **no card block on any receipt**. This was
    never about field names; 1.4.11's and 1.4.12's alias hunting were both chasing the wrong thing.
  - **`payment.id` was undefined, so `clover_payment_id` has been stored as NULL for every card sale ever.**
    `pos.js:1171` picks the refund path with `!!cardPayment?.clover_payment_id`, so **every refund has
    silently used the UNLINKED path** — the one behind the 1.4.4 double-refund and the 1.4.5 wrong-sign
    charge. Linked refunds have never actually run. Fixed as a side-effect of parsing the payment properly.
- **`parseMaybeJson()`** applied to `payload.payment` / `.credit` / `.refund`, to `cardTransaction`, to
  `extra`, and inside `searchCardFields()` so the walker descends into nested JSON strings as well as objects.
- **EMV application label is hex-encoded ASCII** — `4D617374657263617264` = "Mastercard". New
  `decodeHexLabel()` decodes it when the value plainly is hex and the result is printable, else leaves it be.
- **Forbidden keys extended** from what the real payload actually contained: `exp`, `token`,
  `expirationDate`, `vaultedCard` — alongside pan/first6/track/cvv/cardholderName. Verified against the real
  message that first6 `558490`, expiry `203012` and `exp` `1230` reach neither the stored object nor the log.
- **The RAW logger was useless and is fixed.** It truncated every message at **300 characters**, and Clover's
  envelope opens with a run of nulls (`asyncInfo`, `attachment`, `attachmentEncoding`…), so the cap was spent
  on boilerplate and cut off the payload — often the `method` too. Now logs `method=` explicitly and allows
  8 KB. *This truncation is why 1.4.12's "send me the log line" step appeared to find nothing.*
- **Tests — `node tests/clover-payload.test.js` (29 assertions).** Fixture mirrors the real message's
  STRUCTURE (nested JSON strings, hex label, forbidden fields present) with every value replaced by a test
  value — no real cardholder data in the repo. Covers the nested parse, every rendered field, the hex decode,
  that forbidden data reaches neither the object nor the redacted log, and that cardless payloads print nothing.
- **Verified against the real captured payload**: `paymentId` recovered (`BDE01FX7V63TG`), full block renders
  (MC ****0182, Contactless, auth 05047E, ref 631700584684, trans 005018, Mastercard, AID A0000000041010,
  NO_CVM_REQUIRED), no PAN/expiry leakage.
- `?v=`: `version.js`(18). No renderer logic changed — `print.js`, `db.js`, `pos.js` untouched since 1.4.11.

### 1.4.12
**Reported: card details still not printing on 1.4.11.** Confirmed on the floor with v1.4.11 installed, so
not a stale build. **⚠ `main.js` + `preload.js` + `server.js` changed → REBUILD REQUIRED.**
- **ROOT CAUSE — 1.4.11 read the card fields from ONE place.** `cardDetails()` took them from
  `payment.cardTransaction.*`, which is the **Android SDK's** `Payment`/`CardTransaction` model. Network Pay
  Display serialises its WebSocket payload differently and the shape varies by firmware, so when the fields
  sat anywhere else the function returned null and the receipt printed no card block. Reproduced by running
  the real `cardDetails()` against payload shapes: bare payment → null, fields flat on `payment` → null,
  fields nested under another key → null. The renderer and the DB column were fine all along.
- **Fix — try the documented location first, then search the whole payload by field name.** New
  `searchCardFields()` walks the payload breadth-first (depth ≤ 6, ≤ 2000 nodes, cycle-safe so a odd payload
  cannot hang the bridge mid-sale), matching key names normalised to lowercase alphanumerics, so
  `card_number`, `cardNumber` and `CARD-NUMBER` all compare equal. Aliases cover the common spellings
  (`cardType`/`cardBrand`/`brand`, `last4`/`lastFour`, `authCode`/`approvalCode`/`authorizationCode`,
  `referenceId`/`rrn`, `entryType`/`entryMode`, …). Verified: flat, nested-under-another-name and
  deeply-nested-with-a-masked-PAN payloads all now produce a full card block.
- **A tip alone is no longer "card details".** 1.4.11 returned `{"tipAmount":0}` for a payload with no card
  fields, which stored a row and printed an empty block. Now at least one *identifying* field is required,
  else it returns null and nothing prints.
- **PCI, tightened.** An explicit `FORBIDDEN_KEYS` set (pan, cardNumber, track1/2/3, first6, bin, cvv, cid,
  pin, expiry, cardholderName, …) is never read **and never descended into**, wherever it appears. A masked
  PAN is reduced to its trailing 4 digits; a `last4` that arrives longer than 4 chars is trimmed the same way.
  Verified against a payload deliberately carrying a full PAN, first6, track2 and CVV — none reached the
  stored object.
- **The bridge log existed but went nowhere.** `main.js` spawned it with `stdio: 'ignore'`, so every line it
  printed — including the payment payload — was discarded, and a card fault could not be diagnosed at all.
  Now written to **`clover-bridge.log` in userData**, truncated past 2 MB, with a `=== bridge started ===`
  banner per launch. New `getCloverLogPath()` + `get-clover-log-path` IPC + `electronAPI.getCloverLogPath`;
  **Settings → Card Terminal** shows the path with an **Open folder** button (search entry added, per
  gotcha 11). Payload logging goes through **`redactForLog()`**, which replaces forbidden values with
  `[redacted]` — so the log is safe to send for support. Verified the redaction keeps a planted PAN and CVV
  out of the written line.
- **Not yet confirmed against the real terminal** — the field-name search is built from the plausible
  spellings, not from a captured payload. If a card sale still prints no block on 1.4.12, the log now holds
  the exact message and the aliases can be mapped to it directly. That is what the logging is for.
- `?v=`: `version.js`(17), `settings.js`(61). `print.js`/`db.js`/`pos.js` unchanged from 1.4.11.

### 1.4.11
**Clover card/auth details on the receipt, and the committed WinRx password removed.**
**⚠ `clover-local-pay/server.js` changed → rebuild (or copy it into `resources/app/`).**
- **Receipts now print the card details the terminal returns.** The bridge only ever surfaced
  `cardType` and `last4`, and `buildPaymentRows` printed neither — a card receipt showed just
  "Paid (CARD) $38.47". New **`cardDetails()`** in `server.js` reads `Payment.cardTransaction` and the
  tender, returning brand, last 4, entry method, auth code, reference (RRN), transaction #, EMV app label,
  AID, CVM and tip. Returned as `card` on sale, manual-refund and linked-refund results.
- **Stored, not just displayed:** new `payments.card_details` column (JSON, added via the ALTER list so
  existing installs migrate silently). `DB.addPayment` accepts an object or a string. Both POS payment
  paths (split and single) pass `cardDetails` through.
- **`print.js` `_cardBlock()`** renders it indented under its payment line, on thermal and A5 receipts.
  Every field is optional, so cash/AR lines print nothing, pre-1.4.11 card sales still print normally, and
  malformed JSON is swallowed rather than breaking the receipt.
- **PCI:** the capture is an explicit allow-list of 12 fields. **`last4` only — `first6`, the full PAN and
  track data are never read**, so nothing stored or printed is protected cardholder data.
- Verified in Node: a 5-line payment mix (chip VISA with full EMV data, cash, contactless MC, a legacy card
  row with no details, AR) renders correctly; cash/AR print no card block; malformed and empty JSON print
  nothing; the column migration is idempotent and leaves existing rows NULL.

**SECURITY — the WinRx SQL Server password was committed to git.** `electron-app/sql-config.json` was
tracked with a real `server`/`user`/`password` since `50a1d63` (and again in `a129075`).
- `git rm --cached`'d, added to `.gitignore`, and replaced with a tracked
  **`electron-app/sql-config.example.json`**. The local file is untouched, so running from source still works.
- **Good news — it was never shipped.** electron-builder's `files` lists only `main.js`/`preload.js`/
  `package.json`/`node_modules`, and `extraResources` excludes `electron-app/**`, so the installer never
  contained it. `getSqlConfigPath()` checks `%AppData%` first and returns null if nothing is found, so
  removing it from the repo changes nothing at runtime.
- **STILL OUTSTANDING (owner action):** the password is in public git history, so it must be **rotated in
  SQL Server** — removing the file does not unpublish it. History rewrite (`git filter-repo` + force-push)
  was NOT run; it rewrites published history and needs an explicit decision.
- `?v=`: `version.js`(16), `db.js`(35), `print.js`(36), `pos.js`(85).

### 1.4.10
**Reported: "WEBCAT file not being read or being imported properly."** Confirmed against McKesson's
*Third-Party System Integration Document* (Nov 2021) §2.4.2. The field POSITIONS in `webcat.js` were all
correct; everything around them was not. Each fault below was reproduced by running the real parser and the
real `upsertProducts` in Node against spec-exact 396-char `P` and 345-char `S` records.
- **CRITICAL — promotion (`S`) records were imported as products and destroyed the real rows.** `parseLine`
  never looked at position 1 (Record ID). An `S` record carries the same item number at 2–7, so the upsert's
  `ON CONFLICT DO UPDATE` overwrote the product: description became `REG0012020240101…`, and DIN, GTIN,
  suggested retail and cost were all set to NULL. The log still said "Parsed N products, 0 skipped", which is
  why it looked like it had worked.
- **`upsertProductsSelective` with `newItems:false` threw every time and then poisoned the database.**
  It built the UPDATE by string-replacing `excluded.` away, producing self-assignments
  (`suggested_retail=suggested_retail`) and binding 10 values into 2 placeholders →
  `column index out of range`. Because `BEGIN` had already run and `COMMIT` never did, **the transaction was
  left open** and every later write failed with `cannot start a transaction within a transaction` until the
  app restarted. Rewritten around a `[column, getter]` list so placeholders and values cannot drift apart,
  and all catalogue writes now go through **`_inTransaction()`**, which ROLLBACKs on error.
- **GST/PST `F` (Forced) was read as not taxable** (`=== 'Y'` only) → tax silently under-collected on those
  items. Now `Y` or `F` → taxable.
- **Narcotics imported as ordinary OTC.** Spec: `C` = controlled, **`N` = narcotic non-controlled**,
  blank = neither. `pos.js` and `reports.js` both tested `narcotic_indicator !== 'N'`, so every plain
  narcotic fell through. *Also* the POS mapped a match to `_schedule_flag:'narcotic'` — **a value nothing
  acts on**: no badge (`pos.js` ~546), no counselling popup (~1643), no BTC log. So controlled drugs were
  silently skipping the popup too. Now mapped onto the live tiers: `C` → `btc_ctrl` (patient name required),
  `N` → `btc` (name optional). **Expect the counselling popup on more items after this update — that is the
  point.** New helpers `WebcatParser.narcoticClass()` / `.isNarcotic()` are the single place this is decided.
- **Items with no suggested retail price were sold at McKesson's COST.** Spec: "Regular Unit Price — the
  regular unit *cost* price for this customer." `pos.js` `_addOTCItem` and `db.js` `getLowStockProducts` both
  COALESCEd down to it. Removed from both price chains; such an item now lands at $0.00 with a red
  **"NO RETAIL PRICE SET"** status instead of quietly going out at zero margin.
- **UPC was malformed.** Positions 104 / 105–111 / 112–116 are three fields read as one, so every product
  without a UPC stored `"0000000000000"` — thousands of rows sharing a lookup key. Now joined properly and
  null when absent. (Spec: the GTIN field has replaced the UPC; GTIN unit/pack/case are all parsed now.)
- **Truncated and CRLF lines.** The only guard was `length < 100` (a real `P` record is 396), so a short line
  silently yielded null price and null GTIN while `skipped` stayed 0. Lines are now split on CRLF/LF/CR,
  short lines are counted and reported, and duplicate item numbers are counted (last record wins).
- **Import log is honest now** (`_logParse` in `mckesson.js`): products parsed, promotion records skipped,
  duplicates, truncated lines, unrecognised lines, and an explicit ERROR when nothing parsed.
- **Defensive:** if no line starts with `P`/`S` the file is treated as having no record-ID column and every
  field is read one character earlier (`parseLine(line, true)`), rather than importing zero products. A file
  that is neither layout imports nothing — the numeric item-number check rejects it — instead of garbage.
- **Tests added — `node tests/webcat.test.js` (52 assertions, needs `lib/`).** `tests/webcat-fixtures.js`
  builds spec-exact records. Covers record-type separation, the S-overwrite regression, tax `F`, the narcotic
  tiers, 7,2 price scaling, UPC joining, CRLF, truncation, the headerless fallback (real field values, not
  just a count), junk input, duplicates, the `newItems:false` path, and that a failed write rolls back.
  **First automated tests in the repo** — see the review note about 21k untested lines.
- **Not verified against a real McKesson file** — no sample was available. All fixtures are built from the
  spec. Worth re-running `tests/webcat.test.js` plus one real catalogue import before relying on it.
- `?v=`: `version.js`(15), `db.js`(34), `webcat.js`(4), `mckesson.js`(13), `pos.js`(84), `reports.js`(29).
  **`main.js`/`preload.js` untouched** — but rebuild anyway so `app.asar` and `js/` stay in step.

### 1.4.9
**Reported: "check if AR is getting properly connected to patients."** It wasn't. Patients were matched
WinRx↔POS by PHN correctly in the simple case, but money was mis-credited or dropped in common cases. Every
failure below was reproduced by running the real AR code against a fake WinRx that mirrored its SQL:
- **CRITICAL — a copay "charged to AR" counted as collected.** The 🧾 AR (Account) button saves a normal payment
  line with `method='AR'` (status PAID); AR summed every Rx line on any non-reversed sale and never looked at
  the method. $12.50 charged → AR said $0 owing, and the payment screen said **"No outstanding balance"**
  (`getPatientARSummary` also counted AR lines as paid). The charge-account patients AR exists for were invisible.
- **Per-patient billed capped at 60 fills** — AR used `/getPatientProfile` (`TOP 60 … ORDER BY REEFDATE DESC`,
  built for the POS pick list). 80 unpaid $5 fills → $300 not $400, and the missing $100 was the *oldest*
  (90+ days). The dashboard's uncapped total was then overwritten by the capped figure.
- **Money credited by the sale's linked patient, not the Rx's owner.** Parent picks up child's Rx → child still
  owed $15 and the parent got nothing either (dropped). A sale with no patient linked was never credited.
- **POS payments silently dropped** when the Rx # didn't exactly match a billed fill: leading zeros from the
  ProPharm Old (default) / ProPharm New / Generic barcode profiles (`0050005` vs `50005`), reversed fills, >60.
- **Dashboard and patient page disagreed** — two different paid totals (one ignored refund lines), so a patient
  who owed could be **missing from the dashboard** while their own page showed a balance.
- **PHNs not trimmed on import** (`mapPatient` / `_normalizePatient`) while the dashboard trimmed WinRx's —
  a padded PHN would never match. *Probable, not confirmed* (depends on WinRx's PANUM column type).
- **POS "quick customer" creation threw** `Wrong API use: tried to bind a value of an unknown type (undefined)`:
  `upsertPatient` passed missing fields as `undefined` to sql.js. (All other patient-save paths set every field.)

**Fix — one reconciliation, used everywhere (`ar.js` rewritten around `_reconcile()`):**
- *Collected* = `line_total × (non-AR payments ÷ sale total)`. AR-charged / unpaid Rx stays owing; the non-Rx
  part (OTC, tax) of an AR-charged or unpaid sale becomes a **charge line** on the account (`TXN#<id>`).
  A refund inherits its original sale's mix (parsed from its `Refund for Txn #N` note).
- A copay is credited to the **Rx's owner in WinRx**; failing that, the linked patient; failing that it's
  reported as *unattributed*. POS money matching no billed fill → **credit** (never dropped).
- Rx numbers normalised (`AR.normRx`), PHNs normalised (`AR.normPhn`); all local records sharing a PHN are one
  patient (a hand-typed "123 456 789" and the WinRx record).
- Statements now include till payments, charges and refunds, and end at exactly owing − credit.
- `AR.posEstimate()` — instant POS-only figure (shown first, and when WinRx is offline).
- **main.js**: `mapPatient` trims PHN; new `/getPatientBilled` (uncapped fills + every Rx the patient owns),
  `/getAllBilledByRx` (dashboard, per patient per Rx), `/getRxOwners` (chunked 500 params/query, numbers only).
- **db.js**: `upsertPatient` trims PHN, defaults missing fields to null (quick customer fixed), finds padded /
  spaced records (`_findPatientRow`); one-time migration trims padded PHNs; `getArPosData`, `getTxnPaymentMix`,
  `getPatientsForAR`, `getArEntriesAll` replace `getPatientARSummary` / `getPosPaidForPatient` /
  `getPosRxPaidAmount` / `getPosRxPaidByRx` / `getPosPaidRxForPatient`.
- **UI**: payment screen shows the real balance when 🧾 AR is chosen; AR dashboard + Record Payment import a
  WinRx-only patient on click (no more "look them up first"); statement rows use item labels; a note shows
  amounts owed by patients not yet in the POS and unattributed till copays.
- **Assumption:** Rx numbers are unique within the pharmacy (single branch "A"). Multi-branch would need the
  branch code in the owner lookup.
- **Expect balances to rise after this update** for patients who were charged to AR — that's money genuinely
  owed that the old code hid.
- **Verified:** the real `main.js` route code in Node with a fake SQL pool (PHN trimmed, no `TOP`, 1,200 Rx →
  3 queries of ≤500 params, junk filtered, leading zeros looked up as numbers); browser run of the real engine +
  DB with WinRx faked to mirror the new SQL — charged to AR $12.50 owed; family pickup child/parent 0/0; unlinked
  0; leading-zero 0; padded PHN 0; refund $10 (both views); 80 fills $400 with $310 in 90+; OTC charged $21 via
  a charge line; AR-charged Rx refunded+reversed 0; split cash/AR owes exactly the $15 charged; paid-but-unbilled
  → $10 credit; spaced duplicate record = same patient; quick customer saves; **dashboard == patient page and
  statement == owing − credit for every patient**; payment screen "Current balance: $12.50"; Reports → AR
  imported a WinRx-only patient on click and opened their statement; zero console errors.
- **Release pipeline added** (`.github/workflows/release.yml`) — see Critical Workflow Facts. Found while
  writing it: `lib/` is git-ignored, so a clean-checkout build would have shipped without sql.js; the workflow
  downloads it. `package.json` build filter now excludes `.github/**`; `.gitignore` adds `electron-app/node_modules/`
  + `electron-app/dist/`.
- `?v=`: `version.js`(14), `db.js`(33), `ar.js`(8), `pharmacy-dashboard.js`(21), `reports.js`(28), `patient.js`(14),
  `pos.js`(83). **`main.js` changed → rebuild required** (the release workflow does it). README section 8 + version.

### 1.4.8
*Ships the whole Settings redesign — Phase 1 (navigation + search), Phase 2 (setup health, Overview, error deep
links, folder check) and Phase 3 (below). **`main.js` + `preload.js` changed in Phase 2 → REBUILD REQUIRED.**
`README.md` (the user guide) and `PHARMACY-SOP.md` updated to the new Settings names.*

**Phase 3 — one receipt page; Email that can actually be set up**
- **Receipt pages merged.** Header/footer messages moved from Business Details to **Printing → Receipt Design**,
  under their existing on/off switches, beside the live preview. The **logo stays in Business Details** — it's
  branding, also used on name badges (`pos.js`, `print.js`; stored in localStorage `pharmacy_logo_data`, not
  Config); Receipt Design shows the current logo with a "Change logo →" deep link. Business Details' save no
  longer writes `receipt_header_msg`/`receipt_footer_msg` (it would have read the removed textareas).
- **BUG FIXED — the Receipt Design "live preview" never showed your header/footer.** It always rendered canned
  text ("Free delivery available!" / "Thank you for choosing our pharmacy! Follow us on social media."), whatever
  was saved. Now it uses the typed text and **mirrors `print.js` exactly**: printed as-is (line breaks are NOT
  kept), and a blank footer prints "Thank you for choosing <pharmacy name>!" (the help text under the box says
  so). Textareas now trigger preview updates (the listeners only covered `select`/`input`).
- **Email:** the method dropdown is now **"Send from your email account (SMTP) — recommended"** / **"Not set up —
  can't send automatically"**. Resend/SendGrid/Brevo are no longer offered (they need `worker_url`, which has no
  field) — shown only if already selected, labelled "can't send from this version", with a warning in the API
  section; `API_HINTS`/`API_GUIDES` removed. `email.js` still supports them, untouched.
- **Quick setup** buttons — Gmail / Outlook.com / Microsoft 365 / Other — fill host/port/encryption, switch the
  method to SMTP and show that provider's tips (Gmail: App Password steps). **They live in the always-visible
  Email Method box** — first placed inside the SMTP section, but that section is hidden exactly when a pharmacy
  most needs them ("Not set up"). Same reason the "SMTP server & password" search entry points at `#er-service`.
  A saved account shows its provider's tips on load, only while SMTP is selected.
- ⚠ **The Microsoft wording is a caution, not verified against current policy**: the tips say Microsoft has
  been switching off password sign-in for other apps and M365 needs SMTP AUTH allowed by IT. If Outlook/M365
  users report sign-in failures on Send Test Email, that's the likely cause — Gmail + App Password is the
  known-good path.
- "Not set up" shows a warning that automatic reports and sign-offs can't be sent. **Send Test Email refuses on
  "Not set up"** — the mailto branch does `window.open(mailto…, '_self')`, which would hand the POS window over.
- Search: header/footer entries now point at Receipt Design; new "Gmail / Outlook email setup" entry.
  63 entries, every target verified to exist in its render function.
- Verified in a browser run: v1.4.8 everywhere; Business Details has no header/footer boxes, still saves
  (header text kept), its link lands on + flashes `#rc-header-msg`; Receipt Design prefilled, preview shows the
  real header + blank-footer default with the canned text gone, live on typing, header switch hides it, Save
  writes both keys, logo link flashes the upload box; Email on "Not set up" offers only two methods, shows the
  warning + visible Gmail button, Test refused with `window.open` never called; Gmail → smtp + `smtp.gmail.com`
  587 STARTTLS + tips + focus on username, saved, tips re-shown on reopen; legacy `resend` shown labelled with
  the warning and flagged by SettingsHealth; search "footer"/"gmail" land on + flash the right fields (Gmail
  button visible while not set up); zero console errors. One fix from that run: provider tips only while SMTP
  is selected.
- Version **1.4.8** (`js/version.js`, `electron-app/package.json`); `?v=`: `settings.js`(60), `style.css`(10),
  `version.js`(13).

**Phase 2 — setup health, Overview page, error deep links, folder check**
**⚠ `main.js` + `preload.js` changed (two new IPC handlers) → REBUILD REQUIRED.** Copying `js/` alone gives the
Overview/badges/links, but not the folder check or 📂 Open (both degrade gracefully: "Set", no Open button).
- **New `js/utils/settings-health.js`** (loaded right after `audit.js`):
  - **`SettingsHealth.check()`** → `[{ tab, level, msg, field }]`. `warn` = silently failing: pharmacy name missing,
    no staff with a License #, WinRx not connected (desktop), McKesson Account #/Customer # missing when a login is
    entered, email can't send (`mailto`, incomplete SMTP, or Resend/SendGrid/Brevo with no `worker_url`), nobody
    receives sign-offs, sign-off/BTC folder unset, nightly backup off / on-with-no-folder, **a set folder that no
    longer exists or can't be written**. `setup` = optional: Clover, McKesson login, receipt printer, WinRx inbox.
    Folder checks cached ~60 s (`checkFolder(p, { fresh })`) so clicking around doesn't hit the disk.
  - **`SettingsLink`** — `linkify(text, field?)` turns the first "Settings → …" phrase in a message into a link
    (HTML-escaped; plain text for Cashiers, who can't open Settings); `go(tab, field)` opens Settings there, **holding
    an in-progress POS cart first** (same as auto-lock) and closing popups; `alertOrGo(text)` replaces `alert()` with
    "…Open that setting now?". One document-level click listener handles every `[data-settings-tab]` link.
- **Settings opens on 🏠 Overview** (`_renderHome`): banner ("⚠ N things need attention" / "✓ Nothing needs
  attention"), each problem with **Fix →** (opens the page and flashes the field; "🔒 Ask an Admin" where locked),
  a tile per group (✓ All set / ⚠ N need attention / ○ N not set up), optional features collapsed, search tip.
- **Sidebar badges** (`_refreshHealth` → `_applyBadges`): ⚠ N on pages and group headings for `warn`, a grey • on
  pages with only `setup` (group headings never show `setup`, so an unused feature doesn't shout). Re-checked on
  every page open and on **`config-changed`** — `config.js` `_saveAll` now fires that event on every save.
  Listener removed in `detach()` (+ `_detached` guard for in-flight checks).
- **POS "⚙ Settings ⚠ N"** (`_refreshSettingsBadge`) — `warn` only, Managers/Admins only; hover lists them.
- **Errors that now link to the fix:** sign-off warnings (folder → `#fd-shift`, recipients → `#er-signoff`), POS
  status bar (`_setStatus(type, msg, field)` linkifies any "Settings →"; BTC → `#fd-btc`), Clover-not-set-up in
  the payment modal, WinRx pickup upload failure (`#fd-doc`; also stopped it naming the setting twice), Email test
  errors, Reports invoice download + report-email errors, and the three McKesson `alert()`s → `alertOrGo`.
- **`window.App = { navigate, current }`** exposed from `app.js` (was private) so `SettingsLink.go` can navigate.
- **Save Folders:** each set folder is really checked — ✓ Folder found / ⚠ Folder not found (drive or OneDrive
  disconnected?) / ⚠ path is a file / ⚠ POS isn't allowed to save there; re-checked 600 ms after typing or Browse.
  **📂 Open** per row (also on folders a Manager can't edit — it's read-only).
- **`main.js`:** `check-folder` → `fs.promises.stat` + a **real test write** of a zero-byte `.pos-write-test-*`
  file, then deletes it (on Windows `access(W_OK)` ignores folder ACLs); every step times out at 4 s because a
  disconnected network/OneDrive path can hang. `open-folder` → **directories only** before `shell.openPath`
  (which would otherwise launch a *file* typed into Settings). `preload.js`: `checkFolder`, `openFolder`.
- Verified: the real `main.js` handler code run in Node with Electron stubbed — missing → ENOENT, file → not a
  folder, good → writable, chmod-500 folder → EACCES/not writable, **no probe file left behind**, Open refused for
  a file / missing / empty path and `shell.openPath` reached only for the real folder. Browser run: POS "⚙ Settings
  ⚠ 7" + tooltip on a fresh install; Settings lands on Overview (7 issues, tiles, 3 optional); sidebar badges;
  Fix → lands on + flashes `#fd-shift`; Save Folders statuses with a stubbed checker (found / not allowed / not
  found), Open on a missing folder reports it, badge re-computed after Save; Email test error links to
  `#er-service`; deep link from the POS **held the cart** and closed the popup; both sign-off warning links
  land on the right fields; `alertOrGo` → `#mk-account`; Cashier gets plain text and no badge; zero console
  errors. Two fixes from that run: dropped the "→" appended after link text (read as another path step), and
  kept folder-name casing ("BTC", not "btc").
- `?v=`: `settings-health.js`(2, new), `style.css`(9), `config.js`(6), `app.js`(10), `checklists.js`(8),
  `pos.js`(82), `settings.js`(57), `reports.js`(27).

**Phase 1 — Settings navigation rebuilt**
**Reported: "setting navigation is really tough to find settings."** Agreed with the user first (proposal, then
"where would the paths be?", then go). The old 17 tabs were grouped by *code module*, so things hid under names that
didn't match: Clover pairing + the WinRx inbox folder under **API Credentials**, the opening/closing sign-off folder +
recipients under **BTC Records**, pharmacist License # buried in the Staff edit popup, WinRx called "SQL Connection".
- **8 task-based groups** (`SETTINGS_NAV`): 🏪 My Pharmacy · 👥 Staff & Pharmacists · 💳 Card Terminal ·
  🔗 WinRx & McKesson · 🛒 Products & Checkout · 🖨️ Printing · 📧 Email & Reports · 📁 Folders & Backup, + About & Updates.
  One-page groups render as a single row; others get a heading with indented pages.
- **Search box** finds individual *settings*, not just pages (`SETTINGS_SEARCH`, 61 entries). Picking a result (or
  Enter) opens the page, scrolls to the field, **flashes and focuses it** (`_highlight` polls ≤2 s because several
  pages render async). All 61 `sel` targets verified to exist in their render functions.
- **Breadcrumb + one-line "what this page is for"** above every page (`#settings-intro`).
- **API Credentials split** → `_renderClover` (Card Terminal) + `_renderMcKesson` (McKesson Login); markup/handlers
  copied verbatim. The Clover "Local Pay Service URL" used to be saved by the tab's shared Save button, which no longer
  exists → now saves on `change`.
- **All four folder paths on one page** — new `_renderFolders` (**Save Folders**): WinRx inbox (`doc_folder_path`),
  BTC (`btc_records_folder`), sign-offs (`shift_records_folder`), nightly backup (`auto_backup_folder`), each with
  what-goes-here text and a live ✓ Set / ⚠ Not set status stating the consequence. **Permissions preserved:** the inbox
  and backup folders were Admin-only before, so Managers see them disabled and Save never writes them.
  `_renderBtcFolder` deleted. Dropped its claim that "monthly subfolders are created automatically" — false since
  commit `5872e3f` (`save-pdf-file` writes straight into the folder).
- **Backup & Restore** no longer has its own folder field (one place per setting): shows the path read-only with a
  "Change in Save Folders →" link; Save/Back Up Now read the folder from Config.
- **Email & Reports** gained **Opening & Closing Sign-offs** recipients (`shift_records_recipients`, was on the BTC
  tab). The existing "Shift Reports" field relabelled **Shift Cash Reports** to stop the two being confused.
- **Cross-page links** via `data-goto` / `data-goto-field` (delegated). `render(params)` now honours
  `{ tab, field }`; `SETTINGS_TAB_ALIASES` maps old ids `api`→`clover`, `btcfolder`→`folders`.
- ⚙ button on the POS top bar now reads **⚙ Settings**.
- **~25 messages across 9 files** rewritten from "Settings → API Credentials / BTC Records / Records / Email Reports"
  to the new names — including the 1.4.7 checklist warnings, which named a "Records" tab that never existed.
- **Found, not fixed — Email "Worker URL" is a dead end.** Resend/SendGrid/Brevo require `worker_url`, which has **no
  field anywhere** in Settings (read in `email.js`, `mckesson.js`, `pharmacy-dashboard.js`; never written). Only
  **SMTP** can send from the desktop app. The error now says so honestly instead of pointing at a tab. Phase 3 plan:
  hide the three options + add a Gmail/Outlook SMTP preset. `pharmacy-dashboard.js`'s identical message only fires
  when WinRx isn't connected → now says "WinRx is not connected → WinRx & McKesson → WinRx Connection".
- Catalog page's "CORS note … configure a CORS proxy in API Credentials" now shows **only in browser mode** — desktop
  SOAP goes through Node (`electronAPI.mckessonSoap`), and no proxy setting ever existed.
- Verified in a browser run: nav/intro render, search (clover → 4 hits, "path" → all 4 folders, no-match hint),
  Enter opens Card Terminal + flashes/focuses the IP field, Save Folders live status + save, Backup shows the folder
  and its link lands on + flashes `#fd-backup`, sign-off recipients save, old deep links alias correctly; as Manager
  → staff/clover/mckesson/backup locked, inbox + backup folders read-only (2 Browse buttons, not 4); **Reports
  untouched** (200px nav, no search, no `settings-v2`); zero console errors.
- Phases 2 and 3 followed in the same release — see above.
- `?v=` bumped: `style.css`(7), `checklists.js`(7), `pharmacy-dashboard.js`(20), `mckesson.js`(12), `clover.js`(6),
  `email.js`(5), `pos.js`(81), `settings.js`(56), `reports.js`(26). `scheduler.js` comment-only, not bumped.
  **`main.js`/`preload.js` untouched.**

### 1.4.7

*Ships everything below. **1.4.6 was never built or released** — it only ever existed on this branch —
so both parts go out together as 1.4.7. Nothing on any PC reports 1.4.6.*


**Part 2 — reported from the floor: "not capturing shift open/close, not getting any emails."**
The saved PDFs told the story: last `OPEN_` was 2026-08-11, last `CLOSE_` was 2026-08-05, and it was
2026-09-10. So it worked, then stopped dead. Three separate faults:

- **ROOT CAUSE — a shift left OPEN silently switches both checklists off, forever.**
  `_showShiftModal()` branches on `DB.getActiveShift()`: if a shift is open you get the *active shift*
  modal, so the **Open Shift flow — and with it the SOD checklist — never runs again**. And the EOD
  checklist only fires from *closing* a shift. So one un-closed shift kills BOTH records indefinitely.
  It was invisible because **the indicator showed only the time** — `Shift · 09:00` looks completely
  normal on a shift that has been open for a month (`_showActiveShiftModal` likewise showed
  `Opened 09:00`, and a `742h 22m` duration that reads as noise). Reproduced exactly: inserted an
  OPEN shift dated 2026-08-11 and the old UI showed nothing wrong.
  Fixes in `pos.js`: new **`_shiftAgeDays()`**; the indicator turns **red** and reads
  **"Shift open since Aug 11 (30d)"**; `_showActiveShiftModal` gets a red stale banner, a dated
  "Opened", and a `30d 22h` duration; new **`_checkStaleShift()`** runs on POS load and nags
  once per day (localStorage `pos_stale_shift_nag`) offering to close it.
  `db.js`: **`openShift` now refuses to stack a second OPEN shift** (returns the existing id —
  `getActiveShift` only ever returns the newest, so a second one would orphan the first and its EOD
  sign-off could never be filed). Added **`DB.getStaleShifts()`**.
  **NB: deliberately NOT auto-closing stale shifts** — closing requires a counted cash drawer, and
  fabricating that would corrupt the reconciliation. Staff must close it.
- **Email failures were completely invisible.** `_saveAndEmail` ended with
  `EmailAPI.send({...}).catch(()=>{})` — every error swallowed — and if **no recipient was configured
  it didn't even attempt a send and said nothing**. Either way the modal showed a green "✓ Saved".
  Now `_saveAndEmail` returns `{ pdfPath, pdfNote, emailNote, ok }` and the modal prints exactly what
  did and didn't happen ("No email recipients set (Settings → Records → Shift Sign-Off Records)",
  "Email failed: Worker URL not configured…"). **The sign-off still saves to the log either way** —
  only the reporting changed.
- **`email_service` defaults to `'mailto'`, which cannot send unattended — and would have hijacked
  the POS.** `EmailAPI.send`'s mailto branch calls `window.open(mailto…, '_self')`, i.e. it navigates
  the renderer away from the running app mid-shift. `_saveAndEmail` now refuses that branch and reports
  it instead. **If they never picked a service in Settings → Email Reports, this alone explains
  "no emails".**
- **PDF filenames were stamped in UTC, so evening closings were filed under the NEXT day.**
  `now.toISOString()` → a 17:02 PDT close on Jul 30 was written as `CLOSE_2026-07-31-00-02-00.pdf`.
  Visible right in their folder: that file, and `CLOSE_2026-08-01-00-00-42.pdf` (actually Jul 31).
  Roughly every close after ~5 PM local was misdated. Now built from `getFullYear/getMonth/getDate` +
  local h/m/s. **The DB was always correct** (`addShiftChecklist` uses `localISOStr()`); only the
  filename lied.
- Verified in a real browser run: reproduced the 30-day open shift → red indicator + nag text, stale
  banner, close-shift → EOD checklist appeared, both email-failure branches reported (and `window.open`
  confirmed NOT called), `openShift` double-call returned the same id with one OPEN row, and the
  filename came out local (`CLOSE_2026-09-10-07-27-16`) vs UTC (`…-14-27-19`).
- `?v=` bumped again: `db.js`(32), `checklists.js`(6), `pos.js`(80).

**Part 1 — Opening & Closing log viewer (original 1.4.6 work):**
- **Opening / Closing (SOD & EOD) logs were write-only — you could file a checklist but never read one back.**
  `DB.getShiftChecklists()` existed and was exported, but **nothing in the app ever called it**. Completed
  sign-offs went into `shift_checklists` + a PDF on disk and then vanished from the UI: no way to review,
  reprint, or show an inspector a past record. Fixed with a new **Reports → Opening & Closing Logs** tab
  (`reports.js` `_renderChecklistLogs`).
  - Table per record: date/time, SOD/EOD badge, completed-by + role, RPh counter-sign + CPBC #,
    items checked `n/total` (flags **incomplete**), cold-chain readings with an **EXCURSION** badge,
    sign-off method (PIN-verified / attestation), notes, **View**.
  - **View** re-renders the record exactly as filed and prints it (hidden-iframe print → Save as PDF).
  - **Missing-sign-off detector:** any day with sales or an opened shift is a trading day and needs BOTH an
    opening and a closing record; gaps are listed in a red banner (PODSA s.23.9). Days with no trading are
    not flagged.
  - Date range + Today / This Month / All Time, and **CSV export** (incl. temps + excursion + PDF path).
- **You can now file a checklist on demand.** Previously `Checklists.show()` was reachable *only* from
  shift open / shift close, so "Skip for now" — or simply not using the shift feature — meant that day's
  regulatory record could never be created. The new tab has **▶ Run Opening Checklist** / **▶ Run Closing
  Checklist** buttons that open the same modal any time.
- **`checklists.js` refactor:** the printable HTML builder is split out as **`Checklists.buildHtml(kind, data,
  {date})`** — pure, works from the stored `data` blob alone, so the viewer reprints an old record with its
  ORIGINAL date rather than today's. `_saveAndEmail` now returns the saved PDF path and `show()` stamps it
  onto the row via new **`DB.setShiftChecklistPdf`** (`pdf_path` was a column nothing ever wrote).
  New DB helpers: `getShiftChecklistsAll`, `getShiftChecklist`, `setShiftChecklistPdf`.
- **CRASH FIX — the BTC / Controlled Log tab rendered blank.** `_renderBtcLog` had a stray dead block
  (`if (!logs.length) {...}`) sitting in the *method* body just after the `renderTable` closure ended, where
  `logs` is not in scope. Non-strict script → **`ReferenceError: logs is not defined`**, thrown *before*
  `content.innerHTML` was ever assigned, so the whole tab was empty every time. Block deleted.
- **Gotcha found — the "Sign as" pharmacist picker is empty unless a staff member has a CPBC license #.**
  `checklists.js` selects pharmacists with `p.license_number || p.role === 'PHARMACIST'`, but **there is no
  PHARMACIST role in this app** (roles are ADMIN / MANAGER / CASHIER only — see `Auth.roleLabel` and the
  Settings → Staff dropdown). So `license_number` is the *only* thing that makes someone appear. With it
  blank the dropdown shows just "Other / type manually…", which silently disables stored signatures and
  PIN sign-off and forces typed-name + attestation. **Fix is data, not code: set each pharmacist's
  License # in Settings → Staff.** Left the `role === 'PHARMACIST'` clause in place (harmless, forward-looking).
- Verified by actually running the front-end (static server + browser, no Electron): first-run setup, seeded
  records, tab render, gap banner, View/print modal, CSV export, and a full Complete & Save round-trip
  (row inserted, no errors; PDF/email correctly skipped with no `electronAPI`).
- Bumped `?v=` for `version.js`(11), `db.js`(31), `checklists.js`(5), `reports.js`(25).
  **`main.js`/`preload.js` untouched — but rebuild anyway so `app.asar` and `js/` stay in step.**

### 1.4.5
- **CRITICAL — an unlinked Clover refund CHARGED the customer instead of refunding them.**
  Reported from the floor: "I needed to refund $1, it pushed $1 to the device instead of -$1."
  Exactly right, and there were **two** faults in the same payload:
  1. **`amount` was positive.** Clover's SDK sends `setAmount(-Math.abs(amount))` for a manual refund.
  2. **`transactionType` was missing entirely.** This is the field the device switches on:
     `PAYMENT` = charge the card, `CREDIT` = refund it. With it absent the device defaults to
     **PAYMENT**, so the "refund" ran as a plain sale and took another $1 off the customer.
  The old payload sent **`action: 'MANUAL_REFUND'`** instead — but `PayIntent.action` is an Android
  **Intent action string** (`clover.intent.action.PAY`), *not* a transaction type, so the device ignored
  it. Fixed to `transactionType:'CREDIT'` + `amount: -Math.abs(amount)`, matching
  `CloverConnector.manualRefund()`.
- **The two refund paths differ in sign — don't "normalise" them:**
  - **Linked** (`REFUND_REQUEST`, when the sale stored a `clover_payment_id`): amount **positive**,
    `paymentId` required, `orderId` optional. This path was already correct.
  - **Manual/unlinked** (`TX_START` + `transactionType:'CREDIT'`): amount **negative**.
  `FINISH_OK` now reports `Math.abs(credit.amount)` so callers don't have to care which path ran.
- **Sale path deliberately untouched.** It still sends `action:'SALE'` with no `transactionType`;
  that works because the device defaults to `PAYMENT`. Adding an explicit `transactionType:'PAYMENT'`
  would be more correct but risks a working money path for no behavioural gain — leave it unless
  something breaks.
- **Combined with 1.4.4:** an unlinked refund previously charged the customer, *then* stalled 90s and
  told staff to refund manually. Worst case the customer was down the refund amount and staff refunded
  by hand on top. Anyone who ran an unlinked refund on ≤1.4.4 should reconcile those transactions.

### 1.4.4
- **CRITICAL — Clover manual refund could refund the customer TWICE.** `server.js` `handleMessage`
  opened `case 'FINISH_OK'` with `if (!pendingSale) break;`. A **MANUAL_REFUND** (unlinked — used when
  the original sale has no stored `clover_payment_id`) is started with **TX_START** and completes via
  **FINISH_OK carrying a `credit` object**; only LINKED refunds come back as `REFUND_RESPONSE`
  (which was handled). So the device really did refund the card, the bridge kept waiting, the 90s timer
  fired → `504 TIMEOUT` + `CANCEL_PAYMENT`, and `pos.js` showed *"Card terminal error … process card
  refund manually on Clover"* — inviting staff to refund an already-refunded customer.
  Fixed: `FINISH_OK` now resolves `pendingRefund` first (from `payload.credit`), then falls through to
  the sale path unchanged.
- **Refund paths, for reference:** linked = `REFUND_REQUEST` → `REFUND_RESPONSE` (preferred, used when
  the sale stored a Clover payment id); manual/unlinked = `TX_START` `MANUAL_REFUND` → `FINISH_OK`
  + `credit`. Docs: "the ManualRefundResponse will have a Credit object".
- **Still open (NOT fixed — flagged only):** `pos.js` `_showPartialRefundModal` picks the card payment
  with `payments.find(...)`, so on a **split payment across two cards only the first is refunded** to the
  terminal; the remainder is silently left to staff. Also, a non-cancel Clover error still writes the
  refund record (deliberate — stops a terminal glitch losing paperwork).
- Version bumped to 1.4.4. **This build is installed MANUALLY on the POS PC** (dev machine is a Mac);
  the in-app updater still has no published GitHub release to find.

### 1.4.3
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
