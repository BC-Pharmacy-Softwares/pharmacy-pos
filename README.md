# Pharmacy POS — Complete User & Setup Guide

A point-of-sale system for pharmacies. It rings up prescriptions and OTC products,
takes payments, keeps compliance records, talks to WinRx and McKesson, and prints
receipts, shelf tags, and reports — all from one Windows app.

---

## Table of Contents

1. [What This POS Does](#1-what-this-pos-does)
2. [Installing on a New Computer](#2-installing-on-a-new-computer)
3. [First-Time Setup (First Launch)](#3-first-time-setup-first-launch)
4. [Settings — What to Enter & Where](#4-settings--what-to-enter--where)
5. [Daily Use](#5-daily-use)
6. [Taking Payments](#6-taking-payments)
7. [Prescriptions & Controlled Items (BTC)](#7-prescriptions--controlled-items-btc)
8. [Refunds & Voids](#8-refunds--voids)
9. [McKesson — Ordering & Receiving](#9-mckesson--ordering--receiving)
10. [Reports & Automated Emails](#10-reports--automated-emails)
11. [Shelf Price Tags](#11-shelf-price-tags)
12. [Backup](#12-backup)
13. [Paths & Numbers Cheat-Sheet](#13-paths--numbers-cheat-sheet)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What This POS Does

| Area | What it does |
|------|--------------|
| **Sales** | Scan Rx barcodes or OTC products, manual entry, custom items, discounts |
| **Patients** | Auto-links the patient from a scanned Rx (via WinRx), shows allergy warnings |
| **Payments** | Cash (with change), Clover card terminal, debit/credit, insurance, AR/account, split payments |
| **Compliance** | Pharmacist sign-off + counselling checklist, BTC/controlled substance logging |
| **Inventory** | Auto-deducts stock on each sale, low-stock alerts, receive stock |
| **WinRx** | Looks up patients & Rx, pushes receipt PDFs to the WinRx document inbox |
| **McKesson** | Catalog sync, order upload, invoice download & auto-receive |
| **Reports** | Daily/monthly sales, tax, products, shifts, BTC log — printable, emailed, CSV export |
| **Printing** | 80mm receipts, A5 pick-up confirmations, shelf price tags |

---

## 2. Installing on a New Computer

You only need **one file**: `Pharmacy POS Setup 1.0.0.exe` (the installer).

### Steps
1. Copy `Pharmacy POS Setup 1.0.0.exe` to the new PC (USB or network share)
2. Double-click it
3. If Windows shows **"Windows protected your PC"** → click **More info → Run anyway**
   (This is normal — the app isn't code-signed with a paid certificate. It is safe.)
4. The app installs and creates a **Desktop** and **Start menu** shortcut
5. Launch **Pharmacy POS**

> **Everything is bundled** — no Node.js, no separate Clover service, no extra files needed.

### What gets installed where

| Item | Location |
|------|----------|
| App program files | `C:\Users\<you>\AppData\Local\Programs\Pharmacy POS\` |
| Your data (database) | `C:\Users\<you>\AppData\Roaming\pharmacy-pos\` |

> Your data lives in AppData\Roaming and is **never touched by updates** — reinstalling never erases it.

---

## 3. First-Time Setup (First Launch)

On first launch the app shows a **setup screen**:

1. **Admin Name** — e.g. your name or "Manager"
2. **PIN** — 4–8 digits (this is your login)
3. **Confirm PIN**
4. **Config passphrase** — encrypts the API credentials stored on this PC (pick any phrase, 6+ chars, and remember it)

Click **Create Admin & Continue**. You're now logged in as Admin.

Next, go through **Settings** (gear icon) and fill in each section below.

---

## 4. Settings — What to Enter & Where

Open **Settings** (⚙ gear icon, top-right). Sections are on the left.

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
| App Colour Theme | Optional branding colour |

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
> Both are on your WinRx supplier screen.

**Clover — Network Pay Display** (skip if you don't use Clover):

| Field | Where to find it | Example |
|-------|-----------------|---------|
| Clover Device IP | On the Clover device: Network Pay Display screen | `192.168.0.155` |
| Device Port | Usually default | `12345` |
| POS Station Name | Any name (matters only with multiple tills) | `PharmacyPOS` |
| Service Port | Default | `3001` |

Click **Save Clover Device** → the payment bridge restarts automatically →
click **Pair with Device** → enter the 4-digit code shown on the Clover screen.

**Document Storage (WinRx receipt upload):**

| Field | Example |
|-------|---------|
| WinRx Document Inbox Folder | `C:\WinRx\Documents\Inbox` |

After each Rx payment, a PDF receipt (with a barcode WinRx reads) is dropped here.

### 4e. BTC Records — *desktop only*
Where Behind-the-Counter / controlled sale PDFs are saved.

| Field | Example |
|-------|---------|
| Records Folder Path | `C:\Pharmacy Records\BTC` |

The folder must exist. Monthly subfolders are created automatically.

### 4f. Receipt Printer — *desktop only*
Select your 80mm thermal printer from the dropdown → **Save** → **Test Print**.
When selected, receipts print silently (no dialog).

### 4g. Staff Management *(Admin only)*
Add staff with their own PIN and role:
- **Cashier** — POS only
- **Manager** — all settings except API/Staff/Backup
- **Admin** — everything
- Pharmacists: add their **license number** here (used on RPh sign-off)

### 4h. Email Reports
SMTP settings to email reports (e.g. Zoho, Gmail, Office 365):
- SMTP Host, Port, Encryption, Username, Password, From/Reply-To
- **Automated Reports**: enable Daily and/or Monthly, set send time, pick which
  report sections to include (Sales, Tax, Products, BTC, Low Stock)

### 4i. Catalog Sync, Products, Shelf Tags, Quick Actions, Barcode Profiles
- **Catalog Sync** — pull the McKesson product catalogue (Sync via SOAP API)
- **Products** — add/edit products, prices, stock, **Schedule flag** (None/BTC/Controlled BTC)
- **Shelf Tags** — print price stickers (see section 11)
- **Quick Actions** — custom buttons on the POS screen
- **Barcode Profiles** — how Rx barcodes are parsed

---

## 5. Daily Use

### Starting the day
1. Launch **Pharmacy POS** → log in with your PIN
2. The Clover indicator (top bar) turns green when the terminal is ready
3. Open a **Shift** (click the Shift button) and enter the opening cash float

### Ringing up a sale
| Action | How |
|--------|-----|
| Scan an Rx | Scan the barcode — patient auto-links, copay fills in |
| Scan an OTC product | Scan the UPC |
| Add manually | Quick Actions → Manual OTC / Manual Rx / Custom Items |
| Link a patient | Top bar → Patient (F2) or click "link" |
| Apply a discount | **% Discount** button (cart or single item, with reason) |
| Remove last item | Press **ESC** |
| New transaction | Press **F1** |

If the patient has **allergies**, a yellow ⚠️ banner shows above the Charge button.

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
| **Manual Card Entry** | Card-not-present entry on the Clover device |
| **Insurance** | Records an insurance payment |
| **AR (Account)** | Charges to the patient's account; shows current balance |
| **Split** | Add multiple payment lines until the total is covered |

A **receipt prints automatically**. For Rx pickups, the **RPh sign-off** screen appears
(counselling checklist + signature) and a PDF is filed to WinRx.

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
View the full log: **Reports → BTC / Controlled Log** (searchable, CSV export,
with a "Record Stock Received" option for accountability).

---

## 8. Refunds & Voids

**History** (top bar) → find the transaction:
- **Void** — reverses a whole transaction (today's only, Admin)
- **↩ Return** — partial refund: tick which items to return → refund receipt prints.
  If the original payment was a Clover card, the refund is sent to the terminal automatically.

---

## 9. McKesson — Ordering & Receiving

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

## 10. Reports & Automated Emails

**Reports** (top bar):
- **Sales Summary**, **Tax Report**, **By Method**, **Products Sold**,
  **Order Suggestions**, **Shift Reports**, **BTC / Controlled Log**
- Each has date filters, **Print**, **Export CSV**, and **Email** options

**Automated emails** (Settings → Email Reports):
- Daily report at a set time (previous day's sales)
- Monthly report on a set day
- Choose which sections to include
- Sent automatically while the app is running

---

## 11. Shelf Price Tags

Settings → **Shelf Tags**:
1. Pick a **label size** (Avery 5160/5163/5164, shelf strips, or thermal roll)
2. Choose what to show (name, price, barcode, unit price, SKU, DIN, date)
3. Add products (search, "all custom", or "low stock")
4. **Print Tags** or **Save PDF**

Tags use real **UPC/EAN barcodes** so they scan at the till.
Tags can also be printed right after receiving stock (popup prompt).

---

## 12. Backup

Settings → **Backup**:
- **Export** — saves your whole database to a JSON file. Do this regularly and keep
  a copy somewhere safe (network drive, USB).
- **Import** — restores from an export file.

> Your live data is in `%AppData%\pharmacy-pos\`. Back it up before major changes.

---

## 13. Paths & Numbers Cheat-Sheet

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
| Thermal printer | Windows installed printer | Settings → Receipt Printer |

---

## 14. Troubleshooting

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

### McKesson "Invalid User Type"
- Check you entered the **Customer #** (not Account #) for invoices/catalog
- If still failing, McKesson must enable invoice download for your web-services account

### Receipt prints blank / wrong size
- Settings → Receipt Printer → select the correct thermal printer
- Settings → Receipt Layout → confirm paper width (usually 80mm)

### BTC PDF not saving
- Settings → BTC Records → set a valid folder path that exists on this PC

### Barcode scanned twice
- The scanner is adding an extra Enter. Disable the "suffix" in the scanner's settings.

### Data missing after Windows user change
- Data is in `C:\Users\<username>\AppData\Roaming\pharmacy-pos\`.
  Copy it from the old account to the new one.

---

## Quick Start Checklist (New Install)

- [ ] Install `Pharmacy POS Setup.exe`
- [ ] Create Admin PIN + config passphrase
- [ ] Settings → Pharmacy Details (name, tax, logo)
- [ ] Settings → SQL Connection (WinRx) → Test → Save
- [ ] Settings → API → McKesson (Account #, Customer #, login)
- [ ] Settings → API → Clover (device IP) → Save → Pair *(if using Clover)*
- [ ] Settings → API → Document inbox folder
- [ ] Settings → BTC Records folder
- [ ] Settings → Receipt Printer → select → Test Print
- [ ] Settings → Staff Management → add staff + PINs
- [ ] Settings → Email Reports → SMTP + automated reports
- [ ] Catalog Sync → pull products
- [ ] Open a shift → ring a test sale

---

*Pharmacy POS — User & Setup Guide*
