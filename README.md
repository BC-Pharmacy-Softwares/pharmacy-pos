# Pharmacy POS — Complete User & Setup Guide

A point-of-sale system for pharmacies. It rings up prescriptions and OTC products,
takes payments, keeps compliance records, tracks patient accounts, talks to WinRx and
McKesson, and prints receipts, shelf tags, and reports — all from one Windows app.

> **Version 1.4.5.** The installed version is shown on the login screen and at the
> top-right of Settings. Check it before reporting a problem.

---

## Table of Contents

1. [What This POS Does](#1-what-this-pos-does)
2. [Installing on a New Computer](#2-installing-on-a-new-computer)
3. [First-Time Setup (First Launch)](#3-first-time-setup-first-launch)
4. [Settings — What to Enter & Where](#4-settings--what-to-enter--where)
5. [Daily Use](#5-daily-use)
6. [Taking Payments](#6-taking-payments)
7. [Prescriptions & Controlled Items (BTC)](#7-prescriptions--controlled-items-btc)
8. [Patient Accounts (Accounts Receivable)](#8-patient-accounts-accounts-receivable)
9. [Refunds & Voids](#9-refunds--voids)
10. [Shift Checklists (Opening & End of Day)](#10-shift-checklists-opening--end-of-day)
11. [McKesson — Ordering & Receiving](#11-mckesson--ordering--receiving)
12. [Reports & Automated Emails](#12-reports--automated-emails)
13. [Shelf Tags & Name Tags](#13-shelf-tags--name-tags)
14. [Backup & Data Security](#14-backup--data-security)
15. [Updating the App](#15-updating-the-app)
16. [Paths & Numbers Cheat-Sheet](#16-paths--numbers-cheat-sheet)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. What This POS Does

| Area | What it does |
|------|--------------|
| **Sales** | Scan Rx barcodes or OTC products, manual entry, custom items, discounts, quantity steppers |
| **Patients** | Auto-links the patient from a scanned Rx (via WinRx), shows allergy warnings |
| **Payments** | Cash (with 5¢ rounding), Clover card terminal, manual card entry, insurance, patient account, split payments |
| **Accounts** | Tracks what each patient owes vs. paid, with statements, aging, and write-offs |
| **Compliance** | Pharmacist sign-off + counselling, BTC/controlled logging, PODSA opening & closing checklists |
| **Inventory** | Auto-deducts stock on each sale, low-stock alerts, receive stock |
| **WinRx** | Looks up patients & Rx, pushes pick-up confirmation PDFs to the WinRx document inbox |
| **McKesson** | Catalog sync, order upload, invoice download & auto-receive |
| **Reports** | Sales, tax, methods, products, shifts, BTC log, accounts receivable, year-end — printable, emailed, CSV |
| **Printing** | 80mm receipts, A5 pick-up confirmations, shelf price tags, staff name badges |

### Patient privacy

Medication names are **never shown on screen or on the customer receipt**. The cart,
customer display, and printed receipt all show `Rx #60004` instead of the drug name.
The real name is kept internally and appears only where the law requires it — the
BTC/controlled log and the internal WinRx pick-up document.

Patients also never see drug cost or markup — only their copay and quantity.

---

## 2. Installing on a New Computer

You only need **one file**: `Pharmacy POS Setup 1.4.5.exe` (the installer).

### Steps
1. Copy the installer to the new PC (USB or network share)
2. Double-click it
3. If Windows shows **"Windows protected your PC"** → click **More info → Run anyway**
   (This is normal — the app isn't code-signed with a paid certificate. It is safe.)
4. The app installs and creates a **Desktop** and **Start menu** shortcut
5. Launch **Pharmacy POS**

> **Everything is bundled** — no Node.js, no separate Clover service, no extra files needed.

> The build also produces `PharmacyPOS-Portable.exe`. That one **runs** the app without
> installing it — useful for testing, but it does **not** upgrade an existing install.
> For a normal install or update, always use the **Setup** exe.

### What gets installed where

| Item | Location |
|------|----------|
| App program files | `C:\Users\<you>\AppData\Local\Programs\Pharmacy POS\` |
| Your data (database, settings) | `C:\Users\<you>\AppData\Roaming\pharmacy-pos\` |

> Your data lives in AppData\Roaming and is **never touched by updates** — reinstalling
> or updating never erases it.

---

## 3. First-Time Setup (First Launch)

On first launch the app shows a **setup screen**:

1. **Admin Name** — e.g. your name or "Manager"
2. **PIN** — 4–8 digits (this is your login)
3. **Confirm PIN**
4. **Config passphrase** — 6+ characters

Click **Create Admin & Continue**. You're now logged in as Admin.

> **Important:** after creating the admin, **close and reopen the app once** before
> entering settings. Configure everything in the fresh session.

Next, go through **Settings** (gear icon) and fill in each section below.

### Security behaviour

- **Auto-lock** after 5 minutes idle. Any cart in progress is held and offered back on return.
- **5 wrong PINs** locks the pad for 30 seconds.
- PINs are stored hashed (bcrypt) — never in plain text, never in the audit log.

---

## 4. Settings — What to Enter & Where

Open **Settings** (⚙ gear icon, top-right). Sections are grouped on the left.

| Group | Sections |
|-------|----------|
| **Pharmacy Setup** | Pharmacy Details · Date & Time · Staff Management *(Admin)* |
| **Connections** | SQL Connection · API Credentials *(Admin)* · Catalog Sync |
| **Products & Pricing** | Products · Quick Actions · Barcode Profiles |
| **Printing & Labels** | Receipt Printer · Receipt Layout · Shelf Tags · Name Tags |
| **Records & Reports** | BTC Records · Email Reports · Backup *(Admin)* · Updates |

**Cashiers** cannot open Settings at all. **Managers** see everything except
API Credentials, Staff Management, and Backup — those are **Admin only**.

### 4a. Pharmacy Details
The basics that appear on receipts and reports.

| Field | Example |
|-------|---------|
| Pharmacy Name | Your pharmacy name |
| Branch Code | `A` (prints as `Rx# 60004-A`) |
| Phone, Fax, Email, Website | Your contact info |
| Address, City, Province, Postal | Your location |
| GST Registration Number | Your CRA GST # |
| PST Registration Number | If applicable |
| **Tax Rates** | GST % and PST % — turn each on/off and set the rate |
| **Logo** | Upload a PNG/JPG (shown on receipts) |
| **Brand Kit** | Background + three brand colours, with live preview and reset |

> **Brand Kit** replaces the old single "App Colour Theme" picker. It re-colours the
> whole app plus name badges, shelf tags, and document headers. Thermal receipt printers
> are monochrome, so colour only appears on colour printers (name badges, the A5 PDF).

### 4b. Receipt Layout
Customise how receipts print.

- **Paper width**: 58 / 72 / 80 mm
- **Font** style & size, **separator** style (dashed/solid/stars)
- **Receipt title** (e.g. "RECEIPT")
- Toggles: show logo, patient name, PHN, Rx number, DIN, tax breakdown, staff name, footer
- A **live preview** updates as you change settings

### 4c. SQL Connection (WinRx) — *desktop only*
Connects the POS to your WinRx database for patient/Rx lookup.

| Field | Example |
|-------|---------|
| Server | `SERVER-PC\SQLEXPRESS` or `192.168.1.50` |
| Database | `winrxdata` |
| Username | `pos_user` (a read-only SQL login — see note) |
| Password | the SQL login's password |

Click **Test Connection** → should say Connected → **Save**.

> **Creating the SQL login:** See **`SQL-SETUP.md`** for step-by-step instructions
> (a read-only `db_datareader` login on the WinRx database). Hand it to your IT admin.

### 4d. API Credentials *(Admin only)*

**McKesson PharmaClik** — for catalog, ordering, and receiving:

| Field | Where to find it | Example |
|-------|-----------------|---------|
| Username | Your PharmaClik web services login | `rph@yourpharmacy.ca` |
| Password | Your PharmaClik web services password | •••••• |
| **Account #** | WinRx → Supplier → **Acct#** (used for orders) | `123456` |
| **Customer #** | WinRx → Supplier → **Customer#** (used for invoices & catalog) | `1234567` |

> ⚠️ **Two different numbers!** Orders use Account#, invoices & catalog use Customer#.
> Both are on your WinRx supplier screen. Swapping them causes "Invalid User Type".

**Clover — Network Pay Display** (skip if you don't use Clover):

| Field | Where to find it | Example |
|-------|-----------------|---------|
| Clover Device IP | On the Clover device: Network Pay Display screen | `192.168.0.155` |
| Device Port | Usually default | `12345` |
| POS Station Name | Any name (matters only with multiple tills) | `PharmacyPOS` |
| Service Port | Default | `3001` |

Click **Save Clover Device** → the payment bridge restarts automatically →
click **Pair with Device** → enter the 4-digit code shown on the Clover screen.

**Document Storage (WinRx pick-up confirmations):**

| Field | Example |
|-------|---------|
| WinRx Document Inbox Folder | `C:\WinRx\Documents\Inbox` |

After the pharmacist signs off an Rx pickup, an A5 PDF with a WinRx-readable barcode
is dropped here. Use **📁 Browse** to pick the folder rather than typing it.

### 4e. BTC Records — *desktop only*
Where Behind-the-Counter / controlled sale PDFs are saved.

| Field | Example |
|-------|---------|
| Records Folder Path | `C:\Pharmacy Records\BTC` |

The folder must already exist. PDFs are written **directly into it** — no subfolders.

### 4f. Receipt Printer — *desktop only*
Select your 80mm thermal printer from the dropdown → **Save** → **Test Print**.
When selected, receipts print silently (no dialog).

### 4g. Staff Management *(Admin only)*
Add staff with their own PIN and role:

- **Cashier** — POS only, no Settings
- **Manager** — all settings except API Credentials / Staff / Backup
- **Admin** — everything

Per-staff fields worth filling in:

- **Designation / Title** and **License #** — printed on name badges and RPh sign-offs
- **Stored signature** — draw it once; it's then stamped on sign-offs automatically
- **Sign-off mode** — `PIN` (re-enter your login PIN to sign) or `Tick` (attestation only)
- **Checklist defaults** — routine checklist items to pre-tick for this person

> Regulatory, PODSA, pharmacist-only, and temperature items **never** pre-tick,
> regardless of defaults.

### 4h. Email Reports
SMTP settings to email reports (e.g. Zoho, Gmail, Office 365):

- SMTP Host, Port, Encryption, Username, Password, From/Reply-To
- **Automated Reports**: enable Daily and/or Monthly, set send time, pick which
  report sections to include (Sales, Methods, Tax, Products, BTC, Low Stock)

> Automated reports only send **while the app is running**. If the PC is off at the
> scheduled time, that day's email is skipped.

### 4i. Catalog Sync, Products, Quick Actions, Barcode Profiles
- **Catalog Sync** — pull the McKesson product catalogue (Sync via SOAP API)
- **Products** — add/edit products, prices, stock, low-stock threshold, **Schedule flag**
- **Quick Actions** — custom buttons on the POS screen
- **Barcode Profiles** — how Rx barcodes are parsed (ProPharm, Positec, WinRx, Generic)

---

## 5. Daily Use

### Starting the day
1. Launch **Pharmacy POS** → log in with your PIN
2. The Clover indicator (top bar) turns green when the terminal is ready
3. Click **Shift** → open a shift and enter the opening cash float
4. Complete the **Opening Checklist** when it appears (see section 10)

### Ringing up a sale
| Action | How |
|--------|-----|
| Scan an Rx | Scan the barcode — patient auto-links, copay fills in |
| Scan an OTC product | Scan the UPC |
| Add manually | Quick Actions → Manual OTC / Manual Rx / Custom Items |
| Change quantity | **−/+** on the cart line (OTC only; Rx stays 1 = one copay) |
| Correct a price | Click the price on the cart line |
| Link a patient | Top bar → Patient (F2) |
| Apply a discount | **% Discount** (whole cart or one item, with reason) |
| Park a sale | **⏸ Hold** — give it a label, resume later from **Held Carts** |
| Print an estimate | **📄 Quote** — items and totals, no payment taken |
| Remove last item | Press **ESC** |
| New transaction | Press **F1** |

If the patient has **allergies**, a yellow ⚠️ banner shows above the Charge button.

### Other tools on the POS screen
- **📋 Find Paid Receipt** — look up a transaction number to reprint or email the receipt
- **⏸ Held Carts** — resume anything parked earlier (the badge shows how many)
- **👁 Customer Display** — opens a second window facing the customer

### Keyboard shortcuts
- **F1** = new transaction
- **F2** = search patient
- **ESC** = remove last item

---

## 6. Taking Payments

Click **Charge Patient**. Choose a method:

| Method | Behaviour |
|--------|-----------|
| **Cash** | Enter tendered amount → shows change (with 5¢ rounding) |
| **Debit / Credit** | Sends amount to the Clover terminal, waits for approval |
| **Manual Card Entry** | Card-not-present — staff key the card number on the Clover device |
| **Insurance** | Records an insurance payment |
| **AR (Account)** | Charges to the patient's account (requires a linked patient) |
| **Split** | Add multiple payment lines until the total is covered |

A **receipt prints automatically**. For Rx pickups, the **pharmacist sign-off** screen
appears (counselling checklist + signature) and an A5 PDF is filed to WinRx.

> **Manual Card Entry** also has to be enabled on the terminal itself:
> **Setup → Payments** on the Clover device. On the customer screen the option may sit
> behind a **More Options** button. Your merchant account must also be approved for
> keyed / card-not-present transactions.

---

## 7. Prescriptions & Controlled Items (BTC)

### Marking a product as controlled
Settings → Products → edit the product → **Schedule / Dispensing Category**:
- **None** — regular product
- **🟡 BTC — Schedule II** — sold without Rx, patient name optional
- **🟠 Controlled BTC** — patient name **required**

### Selling a BTC item
When a BTC item is in the cart and you click Charge:
1. A **counselling popup** appears (before payment)
2. Tick the counselling checkboxes (must confirm counselled)
3. Optionally (or mandatorily for Controlled BTC) enter patient name + phone
4. Proceed to payment

Each BTC sale is logged and a PDF record is saved to your BTC folder.
View the full log: **Reports → BTC / Controlled Log** (searchable, running balance,
CSV export, with a "Record Stock Received" option for accountability).

---

## 8. Patient Accounts (Accounts Receivable)

For patients who pick up now and pay later.

**How the balance is worked out:** WinRx records what was **billed** (the patient copay
on each fill) but never records what was **collected** — so the POS is the only record of
payment. Owing = copay billed in WinRx − (payments taken at the till + manual entries).
Insurance is never included; only the patient's own portion.

### On a patient's profile
Patients screen → find the patient:

- **Balance summary** — billed, paid, owing, and any credit on account
- **Assign AR #** — gives the patient a friendly account number (`AR-0001`)
- **+ Record Payment / Adjustment** — for money that didn't come through the till
  (e-transfer, cheque, payment link). You can target a specific Rx, and a reference
  number prevents the same payment being entered twice.

### The dashboard
**Reports → Accounts Receivable**:

- Total outstanding, number of accounts, and **aging** (0–30 / 31–60 / 61–90 / 90+ days)
- Click any aging tile to filter the list to just those accounts
- Search by name, PHN, or account number
- **Billed from** — ignore fills before a cutoff date (useful when you first start using AR)
- **As of** — see what the balance *was* on a past date
- Click a patient for their **statement**: every fill and payment in date order with a
  running balance, plus per-Rx **Pay** and **Write off** buttons
- CSV export respects whatever filter is active

> Statements show `Rx #60004`, never the medication name.

Write-offs are **Admin only** and require a reason. They appear in the year-end
report as bad debt.

---

## 9. Refunds & Voids

**History** (top bar) → find the transaction:
- **Void** — reverses a whole transaction (today's only, Admin). Does **not** touch the card terminal.
- **↩ Return** — partial refund: tick which items to return, give a reason → **Process Refund**.

### What happens on a Return
1. If the original sale was paid by card, the refund is sent to the **Clover terminal automatically**
2. The refund record is created
3. A refund receipt prints

Cancelling on the terminal aborts the whole thing — no record is created, nothing is refunded.

> **Split payments across two cards:** only the **first** card is refunded to the terminal.
> If a customer paid with two cards, refund the remainder on the Clover device yourself.

> **If the terminal reports an error**, the refund record is still saved so the paperwork isn't
> lost — but the money has *not* moved. Check the Clover device before refunding again, so the
> customer isn't refunded twice.

---

## 10. Shift Checklists (Opening & End of Day)

The checklists follow the **BC PODSA** regulatory form. Opening appears when you open a
shift; End of Day appears when you close it.

**What they capture:**
- Pharmacist on duty, assistant/tech, and the time
- Section-by-section regulatory items with the legal citation shown
- **Pharmacist-initial** fields on items that require them
- Yes/No items (narcotic count, wholesaler order received)
- **Cold-chain temperature log** — fridge and freezer, current/min/max. Required.
  Out-of-range readings automatically flag an excursion.
- Daily metrics (auto-filled at close, editable)
- Sign-off with name and **CPBC #**

**Who can complete it:** anyone — including a technician. The **pharmacist counter-signature
is the required gate**, and that attestation covers the pharmacist-only items.

**Signing:** pick your name from the **Sign as** list to auto-fill your name, CPBC #, and
stored signature. Depending on your sign-off mode you'll either re-enter your login PIN or
tick an attestation. A draw pad is always available as a fallback.

Each completed checklist is saved as a PDF to your Shift Records folder and emailed.

---

## 11. McKesson — Ordering & Receiving

### Catalog sync (get products)
Settings → **Catalog Sync** → **Sync via SOAP API**. Pulls the latest products,
prices, and item numbers. (Uses your Customer #.)

### Placing an order
**Reports → Order Suggestions**:
1. POS suggests reorder quantities based on your sales
2. Adjust quantities / McKesson # if needed
3. Choose:
   - **↑ Upload to PharmaClik** — sends the order directly (uses Account #), or
   - **PharmaClik Order (.ord)** — downloads a file you upload in PharmaClik manually
4. After ordering, items are marked "ordered" (hidden 30 days)

### Receiving stock
**Reports → Order Suggestions → Receive Stock**:
- **⬇ Download Invoices** — pull new invoices (or by date range) → review screen shows
  matched items classified as OTC / BTC / Rx → **OTC + BTC pre-selected, Rx skipped**
  (Rx is managed in WinRx) → Receive → stock updates
- **Manual entry** — search a product, type the quantity received
- After receiving, a popup offers to **print shelf tags** for the received products

> If invoice download says "Invalid User Type", your Customer # is wrong or McKesson
> hasn't enabled invoice download for the web-services account.

---

## 12. Reports & Automated Emails

**Reports** (top bar):

| Report | What it shows |
|--------|---------------|
| **Sales Summary** | Transactions, gross sales, tax, voids |
| **Tax Report** | GST/PST collected |
| **By Method** | Cash vs card vs account |
| **Products Sold** | Quantity and revenue per product |
| **Order Suggestions** | Reorder list + McKesson ordering/receiving |
| **Shift Reports** | Per-shift totals, cash movements, expected vs counted |
| **BTC / Controlled Log** | Legal dispensing log with running balance |
| **Accounts Receivable** | Who owes what, aging, statements (section 8) |
| **Year-End (Accountant)** | AR aging, bad debt written off, inventory, sales & tax |

Each has date filters, **Print**, **Export CSV**, and **Email** options.

**Automated emails** (Settings → Email Reports):
- Daily report at a set time (previous day's sales)
- Monthly report on a set day
- Choose which sections to include
- Sent automatically **while the app is running**

> **Year-End** is the one to hand your accountant. Note that inventory is valued at
> **retail** — there's no cost field in the product records yet.

---

## 13. Shelf Tags & Name Tags

### Shelf price tags
Settings → **Shelf Tags**:
1. Pick a **label size** (Avery 5160/5163/5164, shelf strips, or thermal roll)
2. Choose what to show (name, price, barcode, unit price, SKU, DIN, date)
3. Add products (search, "all custom", or "low stock")
4. **Print Tags** or **Save PDF**

Tags use real **UPC/EAN barcodes** so they scan at the till.
Tags can also be printed right after receiving stock (popup prompt).

### Staff name badges
Settings → **Name Tags**: pick a preset (name badge 2⅓×3⅜" or credit-card 3.375×2.125"),
and it prints the pharmacy name and logo with the employee's name, designation, and
licence number. Badges print one per page, thermal-style, in your Brand Kit colours.

---

## 14. Backup & Data Security

### Encryption at rest
The database is **AES-encrypted** on disk. That protects a stolen laptop, backup drive, or
copied file. Pair it with **BitLocker** on the PC for full-disk protection.

### Automatic nightly backup
Settings → **Backup** → **Automatic Nightly Backup**:
- Turn it on, set a time, and choose a folder (**📁 Browse**)
- Writes one `.sqlite` file per day, overwriting within the same day
- Old files are never auto-deleted — prune them yourself occasionally
- **Back Up Now** runs it immediately

> Point the folder at OneDrive, a network share, or a BitLocker-protected drive so the
> backup isn't sitting on the same disk as the original.
>
> The nightly backup only runs **while the app is running**.

### Manual export / restore
Settings → **Backup**:
- **⬇ Export Database (.sqlite)** — the real backup format
- **⬇ Export All Data (.json)** — a readable data dump, for inspection or migration
- **Import & Restore** — accepts a **`.sqlite`** file only, and **overwrites everything**

> Restore expects `.sqlite`, not the `.json` export. Keep the `.sqlite` files.

---

## 15. Updating the App

Settings → **Updates** shows the installed version and a **Check for Updates** button.

It is a **notifier, not an auto-updater**. It checks GitHub for a newer release and, if
there is one, gives you a **Download** button that opens your browser. You then run the
downloaded installer — it replaces the app and keeps all your data.

**To update a PC:**
1. Settings → **Updates** → **Check for Updates**
2. If it says *Update available*, click **Download**
3. Run the downloaded `Pharmacy POS Setup <version>.exe`
4. Reopen the app and confirm the new version on the login screen

If it says *"No releases published yet"*, there's genuinely nothing newer to install —
that's not an error.

> Publishing a new release is a developer task, not a staff one. Those steps live in
> `CLAUDE.md`, deliberately kept out of the POS screens.

---

## 16. Paths & Numbers Cheat-Sheet

Keep these handy when setting up a pharmacy:

| What | Where to find it | Goes in |
|------|-----------------|---------|
| SQL Server name | SSMS → `SELECT @@SERVERNAME` | Settings → SQL Connection |
| WinRx database name | usually `winrxdata` | Settings → SQL Connection |
| SQL login + password | created in SSMS (read-only) | Settings → SQL Connection |
| McKesson **Account #** | WinRx → Supplier → Acct# | Settings → API → McKesson |
| McKesson **Customer #** | WinRx → Supplier → Customer# | Settings → API → McKesson |
| McKesson web login | your PharmaClik credentials | Settings → API → McKesson |
| Clover device IP | Clover → Network Pay Display screen | Settings → API → Clover |
| WinRx document inbox | the folder WinRx watches | Settings → API → Document Storage |
| BTC records folder | any folder you create | Settings → BTC Records |
| Shift records folder | any folder you create | Settings → Email Reports |
| Nightly backup folder | OneDrive / network / encrypted drive | Settings → Backup |
| Thermal printer | Windows installed printer | Settings → Receipt Printer |
| Pharmacist CPBC # | the pharmacist's licence | Settings → Staff Management |

---

## 17. Troubleshooting

### App shows a white/blank screen
Press **Ctrl + Shift + R** to reload. If it persists, press **Ctrl + Shift + I** →
Console tab → read the red error.

### Can't connect to WinRx SQL
- Confirm Server/Database/Username/Password in Settings → SQL Connection
- In PowerShell: `Test-NetConnection -ComputerName <server> -Port 1433`
- Make sure SQL Server allows **SQL Authentication** (Mixed Mode)

### Clover not connecting / red indicator
- Open **Network Pay Display** on the Clover device and press Start
- Settings → Clover → confirm the device IP matches → Save → Pair with Device
- Both the PC and Clover must be on the same network

### Manual Card Entry doesn't show the keypad
1. On the Clover device: **Setup → Payments** → make sure manual card entry is enabled
2. On the customer screen, check behind a **More Options** button
3. Confirm your merchant account is approved for keyed / card-not-present transactions
4. Make sure the PC is on the current app version — this needed a fix in 1.4.3

### McKesson "Invalid User Type"
- Check you entered the **Customer #** (not Account #) for invoices/catalog
- If still failing, McKesson must enable invoice download for your web-services account

### Receipt prints blank / wrong size
- Settings → Receipt Printer → select the correct thermal printer
- Settings → Receipt Layout → confirm paper width (usually 80mm)

### Rx copay shows $0.00
The Rx was found but WinRx returned no copay for that Rx/branch combination.
Click the price on the cart line to enter it manually and continue the sale.

### BTC PDF not saving
- Settings → BTC Records → set a valid folder path that **already exists** on this PC
- If it says the app needs a rebuild, the install is out of date — update it

### Automated report or nightly backup didn't run
Both only run while the app is open. If the PC was off or the app closed at the
scheduled time, that run is skipped — it does not catch up later.

### "Check for Updates" says it can't check
A 404 means no release has been published yet, which is normal. Any other error is
usually no internet or a firewall blocking `api.github.com`.

### Refund seems to hang, then says it failed
Check the Clover device **before** retrying — if the terminal shows the refund went through,
the customer has already been refunded and running it again will refund them twice.
A 90-second stall followed by a failure message was a bug fixed in **1.4.4**; if you still
see it, the PC is on an older build and needs updating.

### Barcode scanned twice
The scanner is adding an extra Enter. Disable the "suffix" in the scanner's settings.

### Data missing after Windows user change
Data is in `C:\Users\<username>\AppData\Roaming\pharmacy-pos\`.
Copy it from the old account to the new one.

---

## Quick Start Checklist (New Install)

- [ ] Install `Pharmacy POS Setup <version>.exe`
- [ ] Create Admin PIN + config passphrase, then **restart the app**
- [ ] Settings → Pharmacy Details (name, tax, logo, Brand Kit)
- [ ] Settings → SQL Connection (WinRx) → Test → Save
- [ ] Settings → API → McKesson (Account #, Customer #, login)
- [ ] Settings → API → Clover (device IP) → Save → Pair *(if using Clover)*
- [ ] Settings → API → Document inbox folder
- [ ] Settings → BTC Records folder
- [ ] Settings → Receipt Printer → select → Test Print
- [ ] Settings → Staff Management → add staff, PINs, licences, signatures
- [ ] Settings → Email Reports → SMTP + automated reports
- [ ] Settings → Backup → nightly backup folder → **Back Up Now** to test
- [ ] Catalog Sync → pull products
- [ ] Open a shift → complete the opening checklist → ring a test sale

---

*Pharmacy POS — User & Setup Guide · v1.4.5*
