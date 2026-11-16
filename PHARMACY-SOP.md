# Pharmacy POS — Standard Operating Procedure
### For Pharmacy Staff Use

**Version:** 1.0 — June 2026
**Applies to:** All staff using the Pharmacy POS system
**Roles covered:** Cashier, Manager, Admin

---

## Table of Contents

1. [Starting the System](#1-starting-the-system)
2. [Logging In](#2-logging-in)
3. [Processing a Prescription (Rx) Sale](#3-processing-a-prescription-rx-sale)
4. [Processing an OTC Sale](#4-processing-an-otc-sale)
5. [Processing a $0 / Covered Prescription](#5-processing-a-0--covered-prescription)
6. [Taking Payment — Cash](#6-taking-payment--cash)
7. [Taking Payment — Debit or Credit (Clover)](#7-taking-payment--debit-or-credit-clover)
8. [Taking Payment — Patient Account (AR)](#8-taking-payment--patient-account-ar)
9. [Pick Up Confirmation (RPh Sign-Off)](#9-pick-up-confirmation-rph-sign-off)
10. [Viewing Transaction History](#10-viewing-transaction-history)
11. [Voiding a Transaction](#11-voiding-a-transaction)
12. [Opening a Shift](#12-opening-a-shift)
13. [Closing a Shift](#13-closing-a-shift)
14. [End of Day](#14-end-of-day)
15. [What To Do If Something Goes Wrong](#15-what-to-do-if-something-goes-wrong)

---

## 1. Starting the System

### Every morning before opening:

**Step 1 — Start the Pharmacy POS**
- Double-click the **Pharmacy POS** icon on the Desktop

**Step 2 — Check the Clover status**
- Look at the top-right corner of the POS screen
- It should show a **green** Clover indicator
- If it shows **red**, see [Section 15 — Troubleshooting](#15-what-to-do-if-something-goes-wrong)

**Step 3 — Check the Clover terminal**
- Make sure the Clover device is powered on
- The **Network Pay Display** app must be open and showing on the Clover screen
- If the Clover screen is off or showing something else, tap the screen and open **Network Pay Display → Start**

**Step 4 — Customer display (if you have a second screen)**
- Open **Chrome** or **Edge** on the second monitor
- Go to `http://127.0.0.1:8082/customer-display.html`
- Press **F11** for fullscreen

---

## 2. Logging In

1. The POS opens to the **Login** screen
2. Enter your **4–8 digit PIN**
3. Press **Enter** or click **Login**
4. Your name and role appear in the top bar (e.g. `Sarah (Cashier)`)

> **Forgot your PIN?** Ask a Manager or Admin to reset it in Settings → Staff & Pharmacists.

> **Wrong PIN entered?** The system will lock for 30 seconds after several failed attempts. Wait and try again.

---

## 3. Processing a Prescription (Rx) Sale

### Step 1 — Load the patient

**Option A — Scan the Rx bag barcode**
- Point the barcode scanner at the Rx bag label
- The patient name, PHN, and prescription details load automatically from WinRx

**Option B — Search by patient name or PHN**
- Click the **Search Patient** field at the top
- Type the patient's name or PHN number
- Click the correct patient from the results

### Step 2 — Review the prescription

- Check that the **patient name** is correct
- Check the **Rx number** and medication name
- Check the **copay amount** (this is what the patient owes)

### Step 3 — Add more items if needed

- Scan additional Rx bags or OTC items
- Each item appears as a line in the cart on the left

### Step 4 — Check the total

- The **Total** shows at the bottom of the cart
- If a line item price needs to be changed, click the price to override it

### Step 5 — Proceed to payment

- Click **Cash**, **Card**, or **AR** depending on how the patient is paying
- See Sections 6, 7, or 8 for payment steps

---

## 4. Processing an OTC Sale

### Step 1 — Scan the barcode

- Point the scanner at the product barcode
- The product name and price load from the local catalog

### Step 2 — If the product doesn't scan

- Click **Add Item** (or the + button)
- Type the product name and price manually
- Click **Add**

### Step 3 — Adjust quantity if needed

- Click the quantity number next to the item to change it

### Step 4 — Proceed to payment

- Click **Cash**, **Card**, or **AR**

### Controlled / behind-the-counter (BTC) items

Some products stop you before payment with a **counselling popup**. This is a legal record —
it is not optional and it cannot be skipped.

1. The popup lists the item(s) and asks you to confirm the patient was **counselled**
2. Tick the counselling box
3. Enter the **patient name and phone**:
   - 🟡 **BTC** — name is optional
   - 🟠 **Controlled BTC** — name is **required**
4. Click through to payment as normal

A PDF record of the sale is filed automatically, and it is listed in
**Reports → BTC / Controlled Log**.

> **You may see this popup on more products than you used to.** Items that McKesson's
> catalogue marks as narcotic or controlled now flag themselves, instead of relying on
> someone having set the category by hand. If a product prompts that you do not expect, that
> is why — complete the counselling step as normal, and tell your Manager if it looks wrong.

---

## 5. Processing a $0 / Covered Prescription

Some prescriptions have a **$0 copay** — fully covered by the patient's drug plan. These still need to be recorded and signed off by the pharmacist.

1. Scan the Rx bag as normal
2. The cart shows **$0.00** total
3. Click **Charge Patient** (or the payment button)
4. The system **skips the payment screen automatically**
5. The **Pick Up Confirmation** screen appears immediately
6. Follow [Section 9](#9-pick-up-confirmation-rph-sign-off) to complete the sign-off

> **Why do this?** Even $0 transactions must be recorded for accountability. The Pick Up Confirmation PDF is sent to WinRx and attached to the patient record.

---

## 6. Taking Payment — Cash

1. Click **Cash** on the payment screen
2. The screen shows the **Amount Due**
3. Enter the amount the patient gives you (e.g. `20.00`)
4. The **Change Due** appears instantly (e.g. `$4.75`)
5. Give the patient their change
6. Click **Confirm Payment**
7. If the sale includes an Rx, the [Pick Up Confirmation](#9-pick-up-confirmation-rph-sign-off) screen appears — deal with that first
8. Then the receipt prompt asks how the patient wants their receipt — see [Choosing the receipt](#choosing-the-receipt)

---

## 7. Taking Payment — Debit or Credit (Clover)

1. Click **Card** on the payment screen
2. The amount is sent to the Clover terminal automatically
3. The Clover screen prompts the patient to **tap, insert, or swipe**
4. The patient completes the payment on the Clover device
5. The POS shows **Payment Approved** when done
6. If the sale includes an Rx, the [Pick Up Confirmation](#9-pick-up-confirmation-rph-sign-off) screen appears — deal with that first
7. Then the receipt prompt asks how the patient wants their receipt — see [Choosing the receipt](#choosing-the-receipt)

The printed receipt shows the card type and last 4 digits, how the card was read
(Chip / Contactless / Manual entry) and the authorisation code. The full card number is
never printed or stored.

> **If the Clover screen doesn't show the payment prompt:**
> - Check that the Clover status in the top bar is green
> - Cancel and try again
> - See [Section 15](#15-what-to-do-if-something-goes-wrong) if it keeps failing

> **If the customer wants to cancel:** Press **Cancel** on the Clover device, or click **Cancel Payment** in the POS, then wait a few seconds before retrying.

---

## 8. Taking Payment — Patient Account (AR)

AR (Accounts Receivable) charges the amount to the patient's account to be collected later — for example, a nursing home or care facility patient.

1. Click **AR** on the payment screen
2. Confirm the patient's name shown on screen
3. Click **Confirm**
4. The amount is added to the patient's account balance
5. If the sale includes an Rx, the [Pick Up Confirmation](#9-pick-up-confirmation-rph-sign-off) screen appears — deal with that first
6. Then the receipt prompt asks how the patient wants their receipt — see [Choosing the receipt](#choosing-the-receipt)

---

## 9. Pick Up Confirmation (RPh Sign-Off)

After every Rx sale (including $0 transactions), the **Pick Up Confirmation** screen appears. This is required for accountability.

### What to do:

1. The screen shows the patient name, Rx details, and total
2. Hand the signature pad or printed form to the **pharmacist**
3. The pharmacist checks:
   - **Counselling provided** (if required)
   - **Allergies reviewed**
4. The pharmacist **signs** in the signature box
5. Click **Save & Print PDF**
6. The PDF is automatically sent to the WinRx document inbox
7. WinRx attaches it to the patient's Rx record

> **If the pharmacist is not available:** Click **Skip** to complete the sale without the signature. The transaction is still recorded. The PDF can be printed later from Transaction History.

### Choosing the receipt

Once payment is taken — and after the Pick Up Confirmation, if there was one — a large box
appears in the middle of the screen:

> **How should they get the receipt?**
> **🖨 Print** · **✉ Email** · **📬 Both** · **✕ None**

- Ask the patient, then click the button — or press **P**, **E**, **B**, or **Esc** for none
- Just pressing **Enter** prints
- **If you do nothing, it prints by itself after 15 seconds.** A receipt is never missed
- **Email** only appears if email has been set up; you will be asked for the address
- Afterwards the bar at the bottom says what happened — *Printed*, *Emailed to …*, or a
  message if printing failed

If a patient comes back wanting a receipt later, use **📋 Find Paid Receipt** on the POS
screen. Nothing is lost by choosing None.

---

## 10. Viewing Transaction History

1. Click **History** on the main POS screen
2. Today's transactions appear in the list
3. To view a different date, use the **date picker** at the top
4. To search by Rx number, type in the **search box**
5. Click any transaction row to see full details

### Re-printing a receipt:

1. Find the transaction in History
2. Click the transaction row
3. Click **Reprint Receipt**

### Re-printing a Pick Up Confirmation PDF:

1. Find the transaction in History
2. Click the transaction row
3. Click **Print Pick Up Confirmation**

---

## 11. Voiding a Transaction

Voids are only available for **today's** transactions. You cannot void a transaction from a previous day.

1. Click **History**
2. Find the transaction to void
3. Click the transaction row
4. Click **Void Transaction**
5. Confirm when prompted
6. The void is recorded and the transaction is marked as **VOID** in the history

> **Important:** Voiding does not automatically refund a card payment on the Clover terminal. For card refunds, you must also process the refund directly on the Clover device. Ask a Manager if unsure.

---

## 12. Opening a Shift

At the start of each shift:

1. Click **Open Shift** on the POS home screen
2. Count the cash in the till by denomination:
   - Enter the number of each bill and coin
   - The system calculates the total float
3. Click **Confirm Opening Float**
4. The shift is now open and all transactions will be recorded to this shift

---

## 13. Closing a Shift

At the end of each shift:

1. Click **Close Shift**
2. Count all cash in the till by denomination
3. Enter the count in the closing float screen
4. The system shows:
   - **Expected cash** (opening float + all cash sales)
   - **Counted cash** (what you entered)
   - **Variance** (difference — should be $0.00)
5. If there is a variance, recount before confirming
6. Click **Confirm & Close Shift**
7. The shift report is generated — print or save it

---

## 14. End of Day

Before leaving at the end of the day:

- [ ] Close the current shift (Section 13)
- [ ] Print or email the shift report for records
- [ ] Make sure the last transaction Pick Up Confirmation was signed and sent
- [ ] Check that the Clover device screen shows **Network Pay Display** (leave it running overnight)
- [ ] Leave the Pharmacy POS running (or close it — it is safe to close and reopen)

---

## 15. What To Do If Something Goes Wrong

### Clover terminal shows red / "Not Connected"

1. Check the Clover device is powered on
2. Open **Network Pay Display** on the Clover device and tap **Start**
3. Wait 10 seconds — the POS reconnects automatically
4. If still red, restart the Pharmacy POS app
5. If still red after restart, check that the Clover and the pharmacy PC are on the **same Wi-Fi network**

### "A payment is already in progress" on Clover

1. Press **Cancel** on the Clover device touchscreen
2. Wait 10 seconds
3. Try the payment again in the POS

### Rx barcode not scanning / patient not found

1. Clean the barcode with a dry cloth — smudges cause scan failures
2. Try typing the Rx number manually in the patient search
3. Check the WinRx connection: **Settings → WinRx & McKesson → WinRx Connection** should show **Connected**
4. If WinRx shows disconnected, call IT support

### Receipt not printing

1. Did someone press **None** or **Esc** at the receipt prompt? Then it printed nothing on
   purpose — reprint from **📋 Find Paid Receipt**
2. Read the message at the bottom of the POS screen. *Print failed — printer offline* means
   the printer refused the job; *Print dialog opened* means no printer is selected
3. Check the receipt printer is powered on, has paper, and isn't jammed
4. In the POS, go to **Settings → Printing → Receipt Printer** and confirm the correct
   printer is selected, then use **Test Print**
5. Try a test page from Windows: **Settings → Printers & scanners → your printer → Print test page**

Nothing is ever lost by a failed print — every sale is saved and can be reprinted from
**📋 Find Paid Receipt**.

### POS screen frozen or not responding

1. Wait 10 seconds — the app may be processing
2. Press **Ctrl + Shift + R** to reload the app (your data is saved — this does not lose anything)
3. If still frozen, close and reopen the Pharmacy POS from the Desktop

### Cannot log in — PIN not accepted

1. Make sure Caps Lock is not on
2. Ask a Manager or Admin to reset your PIN in **Settings → Staff & Pharmacists**

### Wrong patient loaded by mistake

1. Click **Clear / New Transaction** before taking any payment
2. This removes all items from the cart without saving anything
3. Start fresh with the correct patient

---

## Quick Reference Card

> Cut out and keep at the till

| Task | Steps |
|---|---|
| **Rx sale** | Scan bag → check total → Cash / Card / AR → RPh signs Pick Up Confirmation → choose receipt |
| **OTC sale** | Scan barcode → Cash / Card / AR → choose receipt |
| **$0 Rx** | Scan bag → click Charge → RPh signs Pick Up Confirmation → choose receipt |
| **Receipt prompt** | **P** print · **E** email · **B** both · **Esc** none · prints by itself after 15s |
| **BTC / controlled item** | Counselling popup before payment → tick counselled → name (required if 🟠) |
| **Cash payment** | Click Cash → enter amount given → give change → Confirm |
| **Card payment** | Click Card → patient taps/inserts on Clover → approved automatically |
| **Void** | History → find transaction → Void (today only) |
| **Reprint receipt** | History → click transaction → Reprint Receipt |
| **Clover offline** | Open Network Pay Display on Clover → tap Start → wait 10 sec |

---

*For technical issues outside this guide, contact your Manager or the system administrator.*

*Pharmacy POS SOP — Version 1.1 — covers app version 1.4.16*
