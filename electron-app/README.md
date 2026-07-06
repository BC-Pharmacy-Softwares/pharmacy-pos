# Pharmacy POS — Desktop App Guide

## What Is This?

Pharmacy POS is a point-of-sale system built for pharmacies running WinRx. It connects
directly to your local WinRx SQL Server database — no internet connection required for
patient lookups or Rx scanning.

---

## Installation (One Time)

1. Copy the installer file to the pharmacy computer:
   ```
   Pharmacy POS Setup 1.0.0.exe
   ```

2. Double-click the installer and follow the prompts.
   - It installs automatically with no questions asked.
   - A shortcut is created on the Desktop and Start Menu.

3. Launch **Pharmacy POS** from the Desktop shortcut.

---

## First-Time Setup

### Step 1 — Set Your SQL Connection

The app needs to connect to your WinRx SQL Server before it can look up patients or Rx numbers.

1. Open the app and log in with your Admin PIN.
2. Go to **Settings → SQL Connection**.
3. Fill in:
   - **SQL Server** — the computer name and instance, e.g. `SERVER-PC\SQLEXPRESS`
   - **Database** — usually `winrxdata`
   - **Username** — your SQL Server login username
   - **Password** — your SQL Server login password
4. Click **Test Connection** to verify it works.
5. Click **Save & Connect**.

> **Note:** The SQL Server must be on the same local network as the pharmacy computer.
> Each pharmacy location stores its own connection settings — they do not affect other locations.

---

### Step 2 — Fetch Pharmacy Details

1. Go to **Settings → Pharmacy Details**.
2. Click **Fetch from API** — this pulls your pharmacy name, address, phone, and email
   directly from WinRx and fills in the fields automatically.
3. Click **Save** at the bottom of the page.

These details appear on every printed receipt.

---

### Step 3 — Set the Barcode Profile

1. Go to **Settings → Barcode Profiles**.
2. Select **WinRx Other** if your Rx labels have 13-digit barcodes starting with `20`
   (e.g. `2057560026109`).
3. Select the appropriate profile for your label format if different.
4. Click **Save**.

---

### Step 4 — Set the Branch Code

1. Go to **Settings → API Credentials**.
2. Enter your **Branch Code** (e.g. `A`) — this is the location letter used in WinRx.
3. Click **Save Settings**.

---

## Daily Use

### Opening a Shift

Click **Open Shift** on the top bar before starting transactions.

---

### Scanning an Rx

1. Scan the barcode on the WinRx prescription label using a barcode scanner.
2. The system will:
   - Look up the Rx number in WinRx SQL
   - Pull the **patient name automatically** and link them to the transaction
   - Fill in the **copay amount** from the last fill record
3. Proceed to payment.

You can also type the Rx number manually in the scan box and press **Enter**.

---

### Searching for a Patient

1. Click **Patient (F2)** or press **F2**.
2. Type the patient's PHN, phone number, or name.
3. Click **Search Local** to search saved patients, or **Search API** to search WinRx directly.
4. Click on a patient to link them to the current transaction.

---

### Taking Payment

1. After all items are in the cart, click **Checkout**.
2. Select the payment method:
   - **Cash** — enter the amount tendered, change is calculated automatically
   - **Debit / Credit** — confirm the amount on the terminal
   - **AR / Account** — records a balance owing for the patient
3. The receipt prints automatically after payment is confirmed.

---

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F1 | New transaction |
| F2 | Search patient |
| ESC | Remove last cart item |

---

## Printing Receipts

The app prints to your default Windows printer. To use a thermal receipt printer:

1. Install the thermal printer driver in Windows.
2. Set it as the **Default Printer** in Windows Settings.
3. The receipt will automatically print at 80mm width.

---

## Backing Up Your Data

Transaction history and staff accounts are stored locally on this computer in an encrypted
database. To back up:

1. Go to **Settings → Backup**.
2. Click **Export Database (.sqlite)** or **Export All Data (.json)**.
3. Save the file to a USB drive or network share.

> **Tip:** Do this at the end of every week.

---

## Transferring Data to a New Computer

1. On the old computer: **Settings → Backup → Export Database (.sqlite)**
2. Install the app on the new computer and complete First-Time Setup (Steps 1–4 above).
3. On the new computer: **Settings → Backup → Import & Restore** — select the `.sqlite` file.

---

## Building a New Installer (For Developers)

Requirements: Windows PC with Node.js installed (https://nodejs.org).

1. Open Command Prompt and navigate to the `electron-app` folder:
   ```
   cd C:\PharmacyPOS\electron-app
   ```

2. Install dependencies (first time only):
   ```
   npm install
   ```

3. Build the installer:
   ```
   npm run build
   ```

4. The installer will be created at:
   ```
   electron-app\dist\Pharmacy POS Setup 1.0.0.exe
   ```

---

## Troubleshooting

### "SQL Connection failed"
- Make sure the WinRx SQL Server computer is turned on and connected to the same network.
- Verify the server name, username, and password in **Settings → SQL Connection**.
- In SQL Server Management Studio, confirm the login has access to the `winrxdata` database.
- Make sure **SQL Server Browser** service is running on the WinRx computer
  (Start → Services → SQL Server Browser → Start).

### Patient or Rx not found
- Confirm you are connected to SQL (**Settings → SQL Connection** should show ✓ Connected).
- Try typing the PHN or Rx number manually instead of scanning.
- Check that the patient exists in WinRx.

### Receipt not printing
- Check that the printer is set as the Default Printer in Windows.
- Try printing a test page from Windows Settings → Printers.

### App won't open / crashes on startup
- Right-click the Desktop shortcut and select **Run as Administrator**.
- Check that your antivirus is not blocking the app — add an exception for `Pharmacy POS.exe`.

### Need to reset the Admin PIN
- Contact your system administrator — PIN reset requires database access.

---

## Support

For technical issues, contact your pharmacy IT support or the software provider.

*Pharmacy POS*
