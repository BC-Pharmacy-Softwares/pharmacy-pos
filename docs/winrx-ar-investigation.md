# Step 0 — WinRx AR Investigation (READ-ONLY)

> **Goal:** decide how "billed / owing" is sourced for the Accounts Receivable feature:
> **(A)** WinRx already stores a patient AR balance we can read directly (simplest), or
> **(B)** we compute billed by summing patient copays (`REFILL.RECOPAY`) ourselves.
>
> **This is investigation only — no app code changes.** Run these in SQL Server
> Management Studio (SSMS) or `sqlcmd` against the WinRx database, using the
> **read-only** login from `SQL-SETUP.md`.

## Safety rules
- **Read-only.** Only the `SELECT` statements below. Never INSERT/UPDATE/DELETE/ALTER/DROP.
- **PHI:** results may contain patient data. When reporting back, **redact names/PHN** —
  paste only counts, column names, and amounts, or replace identifiers with `Patient A`.
- Prefer running against a **backup/test copy** if one exists.
- Every query is `TOP`-limited or aggregate, so they're cheap.

## Schema already confirmed (from the app's working queries)
- `PATIENT` — `PANUM` (PHN), `PAGIVEN`, `PASURNAME`, `PAEMAIL`, `PAHOME`, `PACELL` …
- `RX` — `RXNUM`, `RXPANUM` (PHN), `RXDIN`, `DRUG`/join to `DRUG.DGDESC`
- `REFILL` — `RERXNUM` (Rx#), `REQTY` (billed qty), **`RECOPAY`** (patient copay), `REEFDATE` (fill date), `REREVDATE` (set when reversed)
- `TXNS` — `RX` (Rx#), **`AMT`** (amount), `ADJDATE`, `PLANID`
- `DRUG` — `DGDIN`, `DGDESC`

---

## Q1 — Does WinRx have a dedicated AR / balance / account table?
```sql
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND (TABLE_NAME LIKE '%AR%'        OR TABLE_NAME LIKE '%BAL%'
    OR TABLE_NAME LIKE '%ACCT%'      OR TABLE_NAME LIKE '%ACCOUNT%'
    OR TABLE_NAME LIKE '%CHARGE%'    OR TABLE_NAME LIKE '%LEDGER%'
    OR TABLE_NAME LIKE '%PAYMENT%'   OR TABLE_NAME LIKE '%RECEIV%'
    OR TABLE_NAME LIKE '%OWING%'     OR TABLE_NAME LIKE '%STATEMENT%'
    OR TABLE_NAME LIKE '%CREDIT%'    OR TABLE_NAME LIKE '%TENDER%')
ORDER BY TABLE_NAME;
```
**Report back:** the full list of table names returned (these names aren't PHI).

## Q2 — Does the PATIENT row carry a balance / owing field?
```sql
-- (a) likely-named columns
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'PATIENT'
  AND (COLUMN_NAME LIKE '%BAL%'    OR COLUMN_NAME LIKE '%OWE%'
    OR COLUMN_NAME LIKE '%OWING%'  OR COLUMN_NAME LIKE '%AR%'
    OR COLUMN_NAME LIKE '%CHARGE%' OR COLUMN_NAME LIKE '%CREDIT%'
    OR COLUMN_NAME LIKE '%ACCT%'   OR COLUMN_NAME LIKE '%DEBT%');

-- (b) full PATIENT column list to scan by eye
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'PATIENT'
ORDER BY ORDINAL_POSITION;
```
**Report back:** any balance-looking columns from (a); and from (b), anything that
looks financial (running balance, account #, statement date).

## Q3 — Does WinRx record *payments/collection* (not just billing)?
```sql
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'TXNS'
ORDER BY ORDINAL_POSITION;

SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'REFILL'
ORDER BY ORDINAL_POSITION;
```
**Report back:** the column lists. We're looking for anything meaning "paid / collected /
balance / patient-portion vs plan-portion" — that tells us whether WinRx knows what was
*collected*, or only what was *billed* (we expect: billing only; collection lives in the POS).

## Q4 — Confirm RECOPAY is the patient portion (sample, redact)
Pick one charge-account patient's PHN and run:
```sql
DECLARE @phn VARCHAR(20) = '<PHN_HERE>';

SELECT TOP 50
  rf.RERXNUM  AS RxNum,
  rf.REQTY    AS Qty,
  rf.RECOPAY  AS PatientCopay,
  rf.REEFDATE AS FillDate
FROM REFILL rf
JOIN RX r ON r.RXNUM = rf.RERXNUM
WHERE r.RXPANUM = @phn
  AND rf.REREVDATE IS NULL
ORDER BY rf.REEFDATE DESC;
```
**Report back:** do the `PatientCopay` values match what that patient is actually charged
at the counter? (Yes = `RECOPAY` is our "billed" source.)

## Q5 — Sample total billed for a patient over a period (the AR math)
```sql
DECLARE @phn VARCHAR(20) = '<PHN_HERE>';

SELECT
  COUNT(*)          AS Fills,
  SUM(rf.RECOPAY)   AS TotalCopayBilled
FROM REFILL rf
JOIN RX r ON r.RXNUM = rf.RERXNUM
WHERE r.RXPANUM = @phn
  AND rf.REREVDATE IS NULL
  AND rf.REEFDATE >= '2025-01-01';   -- adjust to a cutoff date
```
**Report back:** the two numbers (Fills, TotalCopayBilled). This is exactly the "billed"
side of `Owing = billed − paid`.

## Q6 — RECOPAY (REFILL) vs AMT (TXNS) — which is the collectible amount?
```sql
SELECT TOP 20
  t.RX           AS RxNum,
  t.AMT          AS TxnsAmt,
  t.ADJDATE      AS TxnDate,
  rf.RECOPAY     AS RefillCopay,
  rf.REEFDATE    AS FillDate
FROM TXNS t
LEFT JOIN REFILL rf ON rf.RERXNUM = t.RX AND rf.REREVDATE IS NULL
WHERE t.RX IN (
  SELECT TOP 10 RERXNUM FROM REFILL WHERE REREVDATE IS NULL ORDER BY REEFDATE DESC
)
ORDER BY t.ADJDATE DESC;
```
**Report back:** do `TxnsAmt` and `RefillCopay` agree? If they differ, note how (e.g. TXNS
may include plan/insurance portion; REFILL.RECOPAY is the patient portion).

## Q7 — All-patient billed, grouped by patient (powers the AR dashboard)
Confirmed finding: **WinRx records no payments and no balance** — it only bills.
So "billed" must be summed from `REFILL.RECOPAY`, grouped by patient. This query is
exactly what the AR dashboard will run:
```sql
SELECT TOP 50
  r.RXPANUM        AS PHN,
  COUNT(*)         AS Fills,
  SUM(rf.RECOPAY)  AS TotalBilled
FROM REFILL rf
JOIN RX r ON r.RXNUM = rf.RERXNUM
WHERE rf.REREVDATE IS NULL
  AND rf.REEFDATE >= '2025-01-01'   -- cutoff date
GROUP BY r.RXPANUM
HAVING SUM(rf.RECOPAY) > 0
ORDER BY TotalBilled DESC;
```
**Report back (redacted):** roughly how many patients come back, and whether it runs
quickly (this sizes whether we query WinRx live or mirror it locally). Replace PHNs with
"Patient A/B/C" — I only need the counts and the speed.

> **Only Q4, Q5, Q6, Q7 still matter** — Q1–Q3 are answered (no payment/balance in WinRx).

---

## What the answers decide
| Finding | AR "billed" source |
|---|---|
| WinRx has a patient balance/AR table (Q1/Q2) | **Read it directly** (model B → simplest) |
| No AR table; `RECOPAY` is the patient copay (Q4/Q5) | **Sum `REFILL.RECOPAY`** per patient (model A) |
| `TXNS.AMT` ≠ `RECOPAY` | use `RECOPAY` (patient portion) for AR, not `AMT` |

Once we know this, Phase 1 (AR data layer) can be written against the right source.
Paste back the redacted results (table/column lists + the sample totals) and I'll lock the query design.
```
