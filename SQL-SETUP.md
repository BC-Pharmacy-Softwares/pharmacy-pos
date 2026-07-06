# SQL Setup — Read-Only Login for Pharmacy POS

The Pharmacy POS connects to your **WinRx SQL Server** to look up patients and
prescriptions. It only ever **reads** data — it never writes to WinRx. This guide
creates a dedicated **read-only** SQL login for the POS.

> Hand this to your IT admin or whoever manages SQL Server. Takes ~5 minutes.

---

## Before You Start

- You need **SQL Server Management Studio (SSMS)** and an account that can create logins
  (sysadmin, e.g. `sa` or your Windows admin login).
- Confirm the **WinRx database name** (commonly `winrxdata`) — check under
  **Databases** in SSMS.

---

## Step 1 — Confirm SQL Authentication Is Allowed

The POS uses a SQL username/password, so the server must allow **Mixed Mode**.

1. In SSMS, right-click the **server name** (very top) → **Properties**
2. Open the **Security** page
3. Confirm **"SQL Server and Windows Authentication mode"** is selected
4. If you had to change it → right-click the server → **Restart** (required for the change to apply)

---

## Step 2 — Create the Login (Script Method — Recommended)

1. In SSMS, click **New Query**
2. Paste the script below — **change the password** and the **database name** if yours differs
3. Press **F5** to run

```sql
-- 1. Create the login (server level)
CREATE LOGIN pos_user
  WITH PASSWORD = 'Strong#Password2026',
  CHECK_POLICY = ON;

-- 2. Switch to the WinRx database (use YOUR database name)
USE winrxdata;

-- 3. Create a database user for the login
CREATE USER pos_user FOR LOGIN pos_user;

-- 4. Grant READ-ONLY access (SELECT on all tables)
ALTER ROLE db_datareader ADD MEMBER pos_user;
```

Done. The login `pos_user` can now read WinRx data and nothing else.

---

## Step 2 (Alternative) — GUI Method

If you prefer clicking instead of scripting:

1. SSMS → expand **Security → Logins**
2. Right-click **Logins → New Login…**
3. **Login name:** `pos_user`
4. Select **SQL Server authentication**
5. Set a **password**; **uncheck** "User must change password at next login"
6. Go to the **User Mapping** page (left)
7. Tick your **winrxdata** database
8. In the lower box, tick **`db_datareader`**
9. Click **OK**

---

## Step 3 — Find the Server Name

The POS needs the exact server/instance name. In SSMS run:

```sql
SELECT @@SERVERNAME;
```

The result is what goes in the POS **Server** field. Examples:
- `SERVER-PC\SQLEXPRESS` (named instance)
- `192.168.1.50` (IP address)
- `WINRX-SERVER` (hostname)

---

## Step 4 — (Optional) Verify the Login Can Read WinRx

Test that the new login actually has access. In SSMS, open a **New Query**,
connect **as `pos_user`** (or run with `EXECUTE AS`), and try:

```sql
USE winrxdata;
SELECT TOP 5 PANUM, PAGIVEN, PASURNAME FROM PATIENT;
SELECT TOP 5 RXNUM, RXPANUM FROM RX;
```

If rows come back, the login is set up correctly.

---

## Step 5 — Enter It in the POS

In Pharmacy POS → **Settings → SQL Connection**:

| Field | Value |
|-------|-------|
| Server | result of `SELECT @@SERVERNAME` (e.g. `SERVER-PC\SQLEXPRESS`) |
| Database | `winrxdata` |
| Username | `pos_user` |
| Password | the password you set |

Click **Test Connection** → should show **Connected** → **Save**.

---

## Notes & Troubleshooting

| Problem | Fix |
|---------|-----|
| "Login failed for user 'pos_user'" | Wrong password, or Mixed Mode not enabled (Step 1) |
| "Cannot open database winrxdata" | The database name is wrong, or User Mapping wasn't set (Step 2) |
| Can connect but no patients found | Login lacks `db_datareader`, or wrong database |
| Can't reach server at all | Firewall — open **TCP 1433**; for named instances also **UDP 1434**. Test with `Test-NetConnection -ComputerName <server> -Port 1433` |
| Named instance won't connect | Ensure **SQL Server Browser** service is running |

---

## Security Notes

- The POS login is **read-only** (`db_datareader`) — it cannot modify or delete WinRx data.
- Use a **strong password** — it's stored encrypted on the POS PC.
- Each POS PC can use the **same** `pos_user` login, or you can create one per station.

---

*Pharmacy POS — SQL Setup Guide*
