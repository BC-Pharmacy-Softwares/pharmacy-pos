# Pharmacy POS — Installation & Setup Guide

A pharmacy point-of-sale system built for Windows. All data is stored locally — no cloud subscription or internet required for daily use. Connects to WinRx/Pharmacy Dashboard over your local network and processes card payments through a Clover terminal.

---

## Table of Contents

1. [What You Need](#1-what-you-need)
2. [Option A — Windows Desktop App (Recommended)](#2-option-a--windows-desktop-app-recommended)
3. [Option B — Browser Mode (Testing / Non-Windows)](#3-option-b--browser-mode-testing--non-windows)
4. [First-Time Setup After Installing](#4-first-time-setup-after-installing)
5. [WinRx SQL Connection](#5-winrx-sql-connection)
6. [Clover Payment Terminal](#6-clover-payment-terminal)
7. [Receipt Printer](#7-receipt-printer)
8. [Customer Display (Second Screen)](#8-customer-display-second-screen)
9. [Daily Startup](#9-daily-startup)
10. [Roles & Permissions](#10-roles--permissions)
11. [Updating the Software](#11-updating-the-software)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What You Need

| Requirement | Details |
|---|---|
| **Computer** | Windows 10 64-bit (version 1903 or later) or Windows 11 |
| **RAM** | 4 GB minimum |
| **Disk space** | 500 MB free |
| **Network** | Must be on the same local network as WinRx server and Clover terminal |
| **Clover device** | Flex, Mini, or Station with **Network Pay Display** app installed |
| **Node.js** | Only needed for Option B (browser mode) — not required for the desktop app |

---

## 2. Option A — Windows Desktop App (Recommended)

This is the best option for a pharmacy PC. Everything is packaged into a single installer — no Node.js, no Command Prompt, no browser required.

### Step 1 — Build the installer (do this once on the development machine)

On the Mac or PC that has the source code:

```
cd pharmacy-pos\electron-app
BUILD-WINDOWS.bat
```

> On Mac, run this instead:
> ```
> cd pharmacy-pos/electron-app
> npm install
> npm run build
> ```

The installer is created at:
```
electron-app\dist\Pharmacy POS Setup 1.0.0.exe
```

### Step 2 — Copy the installer to the pharmacy PC

Copy the `Pharmacy POS Setup 1.0.0.exe` file to the pharmacy PC using a USB drive or network share.

### Step 3 — Install on the pharmacy PC

1. Double-click **`Pharmacy POS Setup 1.0.0.exe`**
2. Windows may show a "Windows protected your PC" warning — click **More info → Run anyway**
   (This appears because the app is not code-signed with a paid certificate — it is safe)
3. The installer runs and creates a **Pharmacy POS** shortcut on the Desktop and in the Start menu
4. Launch **Pharmacy POS** from the Desktop shortcut

The app opens directly as a full-screen window. No browser or Command Prompt is needed.

### What gets installed and where

| Item | Location |
|---|---|
| App files | `C:\Users\<you>\AppData\Local\Programs\Pharmacy POS\` |
| Your data (database) | `C:\Users\<you>\AppData\Roaming\pharmacy-pos\` |
| Clover settings | `C:\Users\<you>\AppData\Local\Programs\Pharmacy POS\resources\app\clover-local-pay\` |

> **Your data is always safe when updating.** The database lives in `AppData\Roaming` and is never touched by the installer.

---

## 3. Option B — Browser Mode (Testing / Non-Windows)

Use this if you are testing on a Mac, or if you cannot run the Electron installer.

### Requirements

Install **Node.js LTS** from [https://nodejs.org](https://nodejs.org) — click the large LTS button and run the installer.

### First-time setup (run once)

In the `pharmacy-pos` folder, double-click **`setup.bat`**

This downloads required libraries (`sql-wasm.js`, `bcrypt.min.js`) and installs the Clover bridge dependencies. Requires an internet connection.

### Starting the POS

Double-click **`start.bat`**

This opens `http://localhost:8082` in your browser and starts the Clover bridge automatically in the background.

### Limitations in browser mode

- No silent printing — a print dialog always appears
- No A5 PDF generation for Pick Up Confirmations
- WinRx SQL Server connection requires a separate local Express server (not started automatically)

---

## 4. First-Time Setup After Installing

### 4a — Log in with the default Admin PIN

The POS ships with one built-in Admin account:

| | |
|---|---|
| **PIN** | `1234` |
| **Role** | Admin |

**Change this PIN immediately** — go to **Settings → Staff Management** → click the Admin row → **Change PIN**.

### 4b — Pharmacy details

Go to **Settings → Pharmacy Details** and fill in:

- Pharmacy name
- Branch code — e.g. `A` (prints as `Rx# 60004-A` on receipts)
- Address, city, province, postal code
- Phone number
- GST registration number
- Receipt header message (e.g. "Thank you for choosing our pharmacy")
- Receipt footer message (e.g. opening hours, website)
- Logo — upload a PNG or JPG, shown at the top of every receipt

### 4c — Tax rates

Go to **Settings → Tax** and confirm the GST and PST rates are correct for your province.

### 4d — Add staff

Go to **Settings → Staff Management → Add Staff**:

- Enter the staff member's name
- Choose a PIN (4–8 digits)
- Select a role — see [Section 10](#10-roles--permissions) for what each role can access

---

## 5. WinRx SQL Connection

This allows the POS to look up patients and Rx details live from the WinRx database when you scan a prescription barcode.

### What you need from your IT admin or WinRx administrator

| Item | Example |
|---|---|
| SQL Server IP or hostname | `192.168.1.50` or `WINRX-SERVER\SQLEXPRESS` |
| Database name | `WinRx` |
| SQL username | `pos_user` |
| SQL password | (set by your IT admin) |

The SQL user only needs **read-only** access to the WinRx tables. Ask your admin to grant SELECT permission.

### Setting up the connection

1. In the POS, go to **Settings → API Credentials** (requires Admin role)
2. Find the **WinRx SQL Connection** section
3. Enter Server, Database, Username, and Password
4. Click **Test Connection** — it should show **Connected**
5. Click **Save**

The connection credentials are saved to:
```
C:\Users\<you>\AppData\Roaming\pharmacy-pos\sql-config.json
```

### When the connection is active

- Scanning an Rx barcode auto-fills patient name, PHN, and prescription details from WinRx
- Patient search works against the live WinRx database
- The Pick Up Confirmation PDF is automatically pushed to the WinRx document inbox

### If the SQL server is unreachable

The POS continues to work using its local database. You can still process OTC sales and manually entered items. Patient lookups will only find patients already saved locally.

---

## 6. Clover Payment Terminal

### 6a — Prepare the Clover device

1. On the Clover terminal, open the **Network Pay Display** app (may be on home screen or in the app drawer)
2. Tap **Start**
3. The device shows its **IP address** — for example `192.168.0.155` — write this down

Keep **Network Pay Display** open on the Clover screen at all times while the POS is in use.

### 6b — Set the device IP address

You need to tell the POS bridge what IP address your Clover is on.

**For the desktop app (Option A):**

1. Open File Explorer and navigate to:
   ```
   C:\Users\<you>\AppData\Local\Programs\Pharmacy POS\resources\app\clover-local-pay\
   ```
   > Tip: If you can't see AppData, click **View → Show → Hidden items** in File Explorer
2. Look for a file named **`.env.example`**
3. Right-click `.env.example` → **Copy**, then right-click in the same folder → **Paste**
4. Rename the pasted copy to exactly **`.env`** (no extension — click Yes if Windows warns you)
5. Right-click `.env` → **Open with → Notepad**
6. Change the IP address to match your Clover device:
   ```
   CLOVER_DEVICE_IP=192.168.0.155
   CLOVER_DEVICE_PORT=12345
   CLOVER_POS_ID=PharmacyPOS
   PORT=3001
   ```
7. Save and close Notepad

**For browser mode (Option B):**

The `.env` file is in the `clover-local-pay\` folder inside the `pharmacy-pos` folder. Follow the same steps above.

### 6c — Start the Clover bridge

**Desktop app:** The Clover bridge starts automatically when you launch Pharmacy POS — no extra step needed.

**Browser mode:** The Clover bridge starts automatically when you double-click `start.bat`. If you need to start it separately, double-click `clover-local-pay\npm-start.bat`.

### 6d — Pair with the Clover device (first time only)

Pairing links this PC to the Clover terminal. You only do this once — the pairing is saved permanently.

1. In the POS, go to **Settings → API Credentials** (Admin role required)
2. Scroll to the **Clover** section
3. Make sure **Service URL** shows `http://localhost:3001`
4. Click **Test Connection** — should show a green tick
5. Click **Pair with Device → Start Pairing**
6. Watch the Clover screen — a **4-digit code** appears within a few seconds
7. Enter that code in the POS pairing dialog and click **Confirm Code**
8. The POS shows **"Paired successfully!"**

Pairing is saved and reconnects automatically every time the service starts.

### 6e — Re-pairing (if needed)

You only need to re-pair if the Clover terminal was factory-reset or pairing shows as broken.

1. Go to **Settings → API Credentials → Clover → Forget Pairing**
2. Restart the POS app
3. Follow Step 6d again

---

## 7. Receipt Printer

The POS is formatted for an **80 mm thermal receipt printer**.

### Setting up the printer

1. Connect the printer via USB (or set a static IP for network printers)
2. Install the manufacturer's driver — usually found on their website or on a CD in the box
3. In Windows, go to **Settings → Printers & scanners** and confirm the printer appears
4. In the POS, go to **Settings → Receipt Printer**
5. Select your printer from the dropdown → click **Save**
6. Click **Test Print** to verify

When a printer is selected, receipts print silently with no dialog box.

### If you don't have a printer selected

The Windows print dialog appears. In that dialog:
- Set **Scale** to `100%` (not Fit to Page)
- Set **Margins** to Minimum or None
- Turn off **Headers and footers**

---

## 8. Customer Display (Second Screen)

Shows the live cart on a second monitor facing the customer as items are scanned.

### Setup

1. Connect a second monitor to the PC
2. Open **Pharmacy POS** normally on the main screen
3. Open a **Chrome** or **Edge** browser on the second monitor
4. Go to: `http://127.0.0.1:8082/customer-display.html`
5. Press **F11** to make it fullscreen on the second monitor

The display updates instantly using the browser's BroadcastChannel — no extra configuration needed. Both windows must be on the same PC.

---

## 9. Daily Startup

### Desktop app (Option A)

1. Double-click **Pharmacy POS** on the Desktop
2. Log in with your PIN
3. If using the customer display, open it on the second screen (see Section 8)
4. Wait for the Clover indicator in the top bar to show **green / Ready**

That's it — nothing else to start. The Clover bridge runs inside the app.

### Browser mode (Option B)

1. Double-click **`start.bat`** in the `pharmacy-pos` folder
2. The browser opens automatically at `http://localhost:8082`
3. Log in and wait for Clover to show Ready

Keep the `start.bat` Command Prompt window open while the POS is in use. Closing it stops the server.

---

## 10. Roles & Permissions

The POS has three access levels:

| Role | What they can do |
|---|---|
| **Admin** | Everything — including API Credentials, Staff Management, and Backup |
| **Manager** | All settings except API Credentials, Staff Management, and Backup |
| **Cashier** | POS screen only — cannot access Settings |

Admin-only sections are marked with a 🔒 lock icon in Settings. A Manager clicking a locked section sees "Admin Access Required."

Assign roles when adding or editing staff in **Settings → Staff Management** (Admin required).

---

## 11. Updating the Software

### How to update

1. On the development machine, make the code changes
2. Rebuild the installer:
   ```
   cd pharmacy-pos\electron-app
   BUILD-WINDOWS.bat
   ```
3. Copy the new `Pharmacy POS Setup 1.0.0.exe` to the pharmacy PC
4. Double-click the installer — it updates in-place

Your data, settings, and Clover pairing are all preserved during updates.

### After updating

If anything looks wrong after an update, press **Ctrl + Shift + R** inside the POS window to force a full reload and clear any cached scripts.

---

## 12. Troubleshooting

### App won't open / shows a white screen

- Right-click the Desktop shortcut → **Run as administrator**, then close and reopen normally
- Uninstall and reinstall the app — your data will not be lost
- Press **Ctrl + Shift + I** to open developer tools — check the Console tab for error messages

### "Cannot connect to WinRx SQL Server"

Test the connection from PowerShell:
```
Test-NetConnection -ComputerName 192.168.1.50 -Port 1433
```
Should show `TcpTestSucceeded : True`. If not:
- Ask IT to confirm port 1433 is open to this PC
- If using a named instance (e.g. `SERVER\SQLEXPRESS`), UDP port 1434 must also be open
- Verify the username and password are correct in **Settings → API Credentials**

### Patient / Rx not found when scanning

- Check that WinRx SQL Connection shows **Connected** in Settings
- Try manually typing the Rx number in the patient search box
- Confirm the barcode is readable — test it with any barcode scanner app on your phone

### Clover status is red / "Not reachable"

- Check that **Network Pay Display** is open on the Clover device
- Confirm the IP address in `.env` matches what the Clover device currently shows (it may change if DHCP reassigned it — consider setting a static IP on the Clover)
- Make sure the PC and Clover terminal are on the **same network** (same Wi-Fi or LAN — not one on guest Wi-Fi and one on the main network)
- Restart the POS app

### Clover bridge exits immediately when started manually

This happens when running from inside `Program Files` as Administrator and Node.js was installed for regular user only (common on Windows).

Use `npm-start.bat` (not `start-clover.bat`) — it calls `npm start` which is always in the system PATH even as Administrator.

If the problem persists, reinstall Node.js at [nodejs.org](https://nodejs.org) and on the install screen tick **"Install for all users"**.

### Clover shows "Connected" but pairing code never appears on device

- Restart **Network Pay Display** on the Clover device (close it, open it, tap Start)
- Click **Pair with Device** in the POS again

### "Code was incorrect" during pairing

The code expires after about 60 seconds. Click **Pair with Device** again to get a fresh code, and enter it quickly.

### Receipt prints blank or cuts off content

- Confirm the correct thermal printer is selected in **Settings → Receipt Printer**
- For the print dialog: set Scale = 100%, Margins = Minimum, turn off Headers & Footers
- Press **Ctrl + Shift + R** to reload the app, then retry

### Pick Up Confirmation PDF not appearing in WinRx document inbox

- Confirm Pharmacy Dashboard API credentials are set in **Settings → API Credentials**
- Check that the document inbox folder path is correct in WinRx
- The PDF is only generated for transactions that include at least one Rx line item

### WinRx cannot scan the barcode from the PDF

- The barcode must be **Code 128B rendered as a PNG** (not SVG) — this is the format used in print.js v24 and later
- Confirm you are running the latest version of the app (rebuild from source if in doubt)
- Check that the Electron app generated the PDF (browser mode generates HTML only)

### Barcode scanner adds an item twice

The scanner is likely appending an extra Enter keystroke. In the scanner's programming guide, disable the "suffix" or set it to nothing. Press **Ctrl + Shift + R** to reload the app after changing scanner settings.

### Data appears missing after a Windows update or user account change

The database is stored in:
```
C:\Users\<username>\AppData\Roaming\pharmacy-pos\
```
If the app is now running under a different Windows user account, the data is in the old account's AppData folder. Copy the `pharmacy-pos` folder from the old account's `AppData\Roaming` to the new account's.

Use **Settings → Backup → Export** regularly to keep a backup JSON file in a safe location.

### "Port 3001 already in use" (Clover bridge)

Another application is using port 3001:
1. Open `.env` in Notepad
2. Change `PORT=3001` to `PORT=3002`
3. In the POS, go to **Settings → API Credentials → Clover Service URL** and change it to `http://localhost:3002`
4. Restart the app

---

## Quick Reference

### Default Admin PIN
`1234` — change immediately after first login via **Settings → Staff Management**

### Key file locations (desktop app)

| File | Location |
|---|---|
| App data & database | `%AppData%\pharmacy-pos\` |
| Clover `.env` config | `%LocalAppData%\Programs\Pharmacy POS\resources\app\clover-local-pay\.env` |
| Clover pairing token | `%LocalAppData%\Programs\Pharmacy POS\resources\app\clover-local-pay\.clover-token` |
| WinRx SQL credentials | `%AppData%\pharmacy-pos\sql-config.json` |

### Daily checklist

- [ ] Pharmacy POS is open and logged in
- [ ] Clover indicator shows **green / Ready** in the top bar
- [ ] Network Pay Display app is running on the Clover device
- [ ] Customer display is open on the second screen (if used)
- [ ] Shift is opened with cash float counted

---

*Pharmacy POS — last updated May 2026*
