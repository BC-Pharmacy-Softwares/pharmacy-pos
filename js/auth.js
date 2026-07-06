/* ============================================================
   auth.js — Staff authentication, session management, auto-lock
   ============================================================ */

const Auth = (() => {
  const AUTO_LOCK_MS    = 5 * 60 * 1000; // 5 minutes
  const MAX_FAILURES    = 5;
  const LOCKOUT_MS      = 30 * 1000;     // 30-second lockout after 5 bad PINs
  let _currentStaff     = null;
  let _lockTimer        = null;
  let _onLock           = null;
  let _failedAttempts   = 0;
  let _lockedUntil      = 0;

  function setLockCallback(fn) { _onLock = fn; }

  function _resetTimer() {
    clearTimeout(_lockTimer);
    _lockTimer = setTimeout(() => {
      if (_currentStaff) {
        DB.logEvent(_currentStaff.name, 'LOGOUT', 'Auto-lock after inactivity');
        // Give the active POS screen a chance to hold its cart before navigating away
        if (typeof window !== 'undefined' && window._posHoldCart) {
          try { window._posHoldCart(); } catch(_) {}
        }
        _currentStaff = null;
        if (_onLock) _onLock();
      }
    }, AUTO_LOCK_MS);
  }

  /* Reset inactivity timer on any user action */
  function touch() { if (_currentStaff) _resetTimer(); }

  /* Returns null on success, or an error string on failure / lockout */
  async function login(pin) {
    const now = Date.now();
    if (now < _lockedUntil) {
      const secsLeft = Math.ceil((_lockedUntil - now) / 1000);
      return { error: `Too many failed attempts. Try again in ${secsLeft}s.` };
    }

    const allStaff = DB.getStaffByPin();
    for (const s of allStaff) {
      const match = await bcrypt.compare(pin, s.pin);
      if (match && s.active) {
        _failedAttempts = 0;
        _currentStaff   = s;
        _resetTimer();
        DB.logEvent(s.name, 'LOGIN', `Staff login: ${s.name}`);
        return { staff: s };
      }
    }

    _failedAttempts++;
    if (_failedAttempts >= MAX_FAILURES) {
      _lockedUntil    = Date.now() + LOCKOUT_MS;
      _failedAttempts = 0;
      DB.logEvent(null, 'LOGIN_LOCKOUT', `PIN lockout after ${MAX_FAILURES} failed attempts`);
      return { error: `Too many failed attempts. Locked for 30 seconds.` };
    }

    DB.logEvent(null, 'LOGIN_FAIL', `Failed PIN attempt (${_failedAttempts}/${MAX_FAILURES})`);
    return { staff: null };
  }

  function logout() {
    if (_currentStaff) DB.logEvent(_currentStaff.name, 'LOGOUT', 'Manual logout');
    _currentStaff = null;
    clearTimeout(_lockTimer);
  }

  function current() { return _currentStaff; }
  function isLoggedIn() { return _currentStaff !== null; }

  /* ADMIN = super-admin tier (API creds, staff mgmt, backup) */
  function isAdmin() { return _currentStaff?.role === 'ADMIN'; }

  /* MANAGER = mid tier — all settings except the 3 protected ones.
     isManager() returns true for both MANAGER and ADMIN (higher includes lower). */
  function isManager() {
    const r = _currentStaff?.role;
    return r === 'MANAGER' || r === 'ADMIN';
  }

  /* Role display label */
  function roleLabel(role) {
    if (role === 'ADMIN')   return 'Admin';
    if (role === 'MANAGER') return 'Manager';
    return 'Cashier';
  }

  async function hashPin(pin) {
    return bcrypt.hash(pin, 10);
  }

  /* Verify a PIN against a specific staff member WITHOUT changing the current
     session — used for sign-off counter-signatures on a shared terminal. */
  async function verifyPin(staffId, pin) {
    if (!pin) return false;
    const s = DB.getStaff(staffId);
    if (!s || !s.active) return false;
    try { return await bcrypt.compare(pin, s.pin); }
    catch { return false; }
  }

  async function createInitialAdmin(name, pin) {
    const hashed = await hashPin(pin);
    return DB.createStaff(name, hashed, 'ADMIN');
  }

  return { setLockCallback, touch, login, logout, current, isLoggedIn, isAdmin, isManager, roleLabel, hashPin, verifyPin, createInitialAdmin };
})();
