/* ============================================================
   auth.js — Staff authentication, session management, auto-lock
   ============================================================ */

const Auth = (() => {
  const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes
  let _currentStaff = null;
  let _lockTimer    = null;
  let _onLock       = null;

  function setLockCallback(fn) { _onLock = fn; }

  function _resetTimer() {
    clearTimeout(_lockTimer);
    _lockTimer = setTimeout(() => {
      if (_currentStaff) {
        DB.logEvent(_currentStaff.pin, 'LOGOUT', 'Auto-lock after inactivity');
        _currentStaff = null;
        if (_onLock) _onLock();
      }
    }, AUTO_LOCK_MS);
  }

  /* Reset inactivity timer on any user action */
  function touch() { if (_currentStaff) _resetTimer(); }

  async function login(pin) {
    const allStaff = DB.getStaffByPin();
    for (const s of allStaff) {
      const match = await bcrypt.compare(pin, s.pin);
      if (match && s.active) {
        _currentStaff = s;
        _resetTimer();
        DB.logEvent(s.pin, 'LOGIN', `Staff login: ${s.name}`);
        return s;
      }
    }
    DB.logEvent(null, 'LOGIN', `Failed PIN attempt`);
    return null;
  }

  function logout() {
    if (_currentStaff) DB.logEvent(_currentStaff.pin, 'LOGOUT', 'Manual logout');
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

  async function createInitialAdmin(name, pin) {
    const hashed = await hashPin(pin);
    return DB.createStaff(name, hashed, 'ADMIN');
  }

  return { setLockCallback, touch, login, logout, current, isLoggedIn, isAdmin, isManager, roleLabel, hashPin, createInitialAdmin };
})();
