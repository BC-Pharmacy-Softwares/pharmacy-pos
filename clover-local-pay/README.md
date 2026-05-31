# Clover Local Pay — Setup & Operations Guide

This service connects the Pharmacy POS to your Clover payment terminal over the local network.
**No internet required for payments.** The Clover device handles all card capture — card numbers never pass through this computer.

---

## Before You Start — What You Need

| Item | Details |
|---|---|
| **Clover device** | Flex, Mini, or Station (must support Network Pay Display) |
| **Network Pay Display app** | Pre-installed on most Clover devices; if not, install from the Clover App Market |
| **Same network** | The pharmacy PC and the Clover terminal must be on the same Wi-Fi or LAN |
| **Node.js** | Free download from [nodejs.org](https://nodejs.org) — install the **LTS** version |

---

## Step 1 — Prepare the Clover Device

1. On the Clover terminal, find and open the **Network Pay Display** app
   - It may be on the home screen or in the app drawer
2. Tap **Start**
3. The screen now shows the device's **IP address** — for example: `192.168.0.155`
4. **Write down this IP address** — you need it in Step 3

> Keep the **Network Pay Display** app open and running on the Clover screen at all times while the POS is in use. If it closes, payments will stop working.

---

## Step 2 — Install Node.js (first time only)

1. Go to **https://nodejs.org** on the pharmacy PC
2. Click the large **LTS** button (left side — the stable version)
3. Run the downloaded installer
4. Click **Next** through all the default options — do not change anything
5. When installation finishes, open **Command Prompt** and verify:
   ```
   node --version
   ```
   You should see something like `v20.x.x` — if you do, Node.js is installed correctly

---

## Step 3 — Create the Configuration File

The service needs to know your Clover device's IP address. This is stored in a file called `.env`.

1. Open **File Explorer**
2. Navigate to the `clover-local-pay` folder inside your pharmacy POS folder:
   ```
   C:\PharmacyPOS\clover-local-pay\
   ```
3. Look for a file called **`.env.example`**
   - If you can't see it: click **View** in the File Explorer toolbar → tick **Hidden items**
4. **Right-click** `.env.example` → **Copy**
5. **Right-click** in the same folder → **Paste**
6. Rename the pasted file from `.env.example - Copy` to exactly **`.env`** (no extension, just `.env`)
   - Windows may warn you about changing the extension — click **Yes**
7. **Right-click** the `.env` file → **Open with** → **Notepad**
8. You will see:
   ```
   CLOVER_DEVICE_IP=192.168.1.100
   CLOVER_DEVICE_PORT=12345
   CLOVER_POS_ID=PharmacyPOS
   PORT=3001
   ```
9. Change `192.168.1.100` to the **IP address you wrote down** from the Clover screen (Step 1)
   - Example: `CLOVER_DEVICE_IP=192.168.0.155`
10. Leave all other lines exactly as they are
11. Click **File → Save**, then close Notepad

---

## Step 4 — Install Dependencies (first time only)

1. Open **Command Prompt**
   - Press **Win + R**, type `cmd`, press Enter
2. Type the following and press Enter:
   ```
   cd C:\PharmacyPOS\clover-local-pay
   ```
3. Then type:
   ```
   npm install
   ```
4. Wait for it to finish — you will see a line like `added 42 packages` when done
   - This only needs to be done **once**. You do not need to repeat it every day.

---

## Step 5 — Start the Clover Service

1. Open **Command Prompt** (or use the same one from Step 4)
2. Navigate to the folder:
   ```
   cd C:\PharmacyPOS\clover-local-pay
   ```
3. Start the service:
   ```
   node server.js
   ```
4. You should see:
   ```
   ┌─────────────────────────────────────────────┐
   │  Clover Local Pay  (Network Pay Display)    │
   │  http://localhost:3001                      │
   └─────────────────────────────────────────────┘
   → Device: wss://192.168.0.155:12345/remote_pay
   → POS ID: PharmacyPOS

   [clover] Connecting to wss://192.168.0.155:12345/remote_pay
   [clover] Connected — sending PAIRING_REQUEST
   ```

> **Keep this Command Prompt window open** while using the POS. If you close it, card payments will stop working.

---

## Step 6 — Pair with the Clover Device (first time only)

Pairing links this computer to the Clover terminal. You only do this once — the pairing is saved automatically.

1. Open the Pharmacy POS app on the PC
2. Log in as **Admin** (or Manager)
3. Go to **Settings → API Credentials**
4. Scroll down to the **Clover** section
5. Make sure the **Service URL** shows `http://localhost:3001`
6. Click **Test Connection** — it should show a green tick
7. Click **Pair with Device**
8. Click **Start Pairing**
9. **Watch the Clover screen** — a **4-digit code** will appear within a few seconds
10. Type that code into the POS pairing dialog and click **Confirm Code**
11. The POS shows **"Paired successfully!"**

In the Command Prompt window you should see:
```
[clover] ✓ Pairing successful — waiting for device DISCOVERY_REQUEST…
[clover] ✓ Device ready
```

**Pairing is now complete.** The pairing token is saved — next time you start the service it reconnects automatically without needing to pair again.

---

## Daily Startup Procedure

Every day before using the POS, you need these two things running:

### 1. Start the Clover service

Open Command Prompt and run:
```
cd C:\PharmacyPOS\clover-local-pay
node server.js
```

Wait until you see `[clover] ✓ Device ready` in the window.

### 2. Open the Pharmacy POS

Launch the **Pharmacy POS** desktop app (or go to `http://localhost:8082` in the browser version).

When both are running, the Clover status in the POS will show **green / Ready**.

---

## Auto-Start on Windows Boot (Optional)

To start the Clover service automatically every time Windows starts:

1. Press **Win + R**, type `shell:startup`, press Enter — the Startup folder opens
2. Right-click inside the folder → **New → Shortcut**
3. In the "Type the location" box, paste:
   ```
   cmd /k "cd /d C:\PharmacyPOS\clover-local-pay && node server.js"
   ```
4. Click **Next**
5. Name the shortcut: `Clover Service`
6. Click **Finish**

The Clover service will now start automatically when Windows boots. A Command Prompt window will appear — **do not close it**.

---

## Taking a Payment

When the Clover service is running and paired:

1. Ring up items in the POS as normal
2. Click **Charge Patient**
3. Select **Debit** or **Credit**
4. The Clover screen prompts the customer to **tap, insert, or swipe**
5. When approved, the POS shows the payment confirmation automatically

---

## Re-Pairing (if needed)

You need to re-pair if:
- The Clover terminal was replaced or factory-reset
- Pairing shows as broken in the POS

Steps:
1. In the POS, go to **Settings → API Credentials → Clover**
2. Click **Forget Pairing**
3. Restart the Clover service (close and reopen the Command Prompt window)
4. Follow **Step 6** above again

---

## Troubleshooting

### "Missing required .env value: CLOVER_DEVICE_IP"

The `.env` file is missing or in the wrong location.
- Make sure you copied `.env.example` to `.env` (not `.env.txt`)
- Make sure the `.env` file is inside `C:\PharmacyPOS\clover-local-pay\`

---

### Service window shows "WS error" or keeps reconnecting

```
[clover] WS error: connect ECONNREFUSED
[clover] WebSocket closed.
```

- **Is Network Pay Display open on the Clover screen?** Open it and tap Start
- **Is the IP address correct?** Check the IP shown on the Clover screen and compare it to your `.env` file
- **Same network?** The PC and Clover terminal must be on the same Wi-Fi or LAN — not one on Wi-Fi and one on Ethernet to a different router

---

### Service says "Connected" but pairing code never appears on Clover

- Restart the **Network Pay Display** app on the Clover device (close it, reopen it, tap Start)
- Then click **Pair with Device** in the POS again

---

### "Code was incorrect"

- The code on the Clover screen is time-limited (about 60 seconds)
- If it expired, click **Pair with Device** again to get a fresh code
- Enter the code quickly after you see it

---

### Customer taps card but payment hangs / never completes

1. Check the Command Prompt window for error messages
2. In the POS, click **Cancel Payment** if the button is available
3. Wait 10 seconds, then try the payment again
4. If the Clover screen is frozen, restart the **Network Pay Display** app on the device

---

### POS shows "Clover not paired" even though you paired before

The pairing token may have expired (Clover resets tokens periodically):
1. In the POS → **Settings → API Credentials → Clover → Forget Pairing**
2. Restart the service (close and reopen the Command Prompt)
3. Re-pair using **Step 6**

---

### "A payment is already in progress"

A previous payment request is still open on the terminal:
- Press **Cancel** on the Clover device screen
- Or click **Cancel Payment** in the POS if the option appears
- Wait a few seconds and try again

---

### Port 3001 already in use

Another program is using port 3001:
1. Open `.env` in Notepad
2. Change `PORT=3001` to `PORT=3002`
3. In the POS, go to **Settings → API Credentials → Clover Service URL** and change it to `http://localhost:3002`
4. Restart the Clover service

---

## What the Terminal Window Messages Mean

| Message | Meaning |
|---|---|
| `[clover] Connecting to wss://...` | Service is trying to reach the Clover device |
| `[clover] Connected — sending PAIRING_REQUEST` | Connection established, checking pairing |
| `[clover] ✓ Pairing successful` | Pairing token accepted by the device |
| `[clover] ✓ Device ready` | Clover is fully ready to take payments |
| `[clover] → sending TX_START` | A payment has been sent to the terminal |
| `FINISH_OK` | Payment approved |
| `FINISH_CANCEL` | Customer cancelled on the terminal |
| `FINISH_FAIL` | Payment declined or failed |
| `[clover] WebSocket closed.` | Lost connection to the Clover device |
| `[clover] Auto-reconnecting…` | Service is trying to reconnect automatically |

---

## Security Notes

- Card numbers **never** pass through this service or this computer — all card data is handled exclusively by the Clover terminal
- This service only receives: payment amount, approval status, card type (Visa/MC), and last 4 digits for the receipt
- Keep the `.env` file private — do not share it or email it
- This service must only run on the pharmacy PC — do not open port 3001 to the internet
