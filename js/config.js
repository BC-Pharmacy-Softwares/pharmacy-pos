/* ============================================================
   config.js — Encrypted config storage via Web Crypto API (AES-GCM)
   Master key derived from a setup passphrase using PBKDF2.
   ============================================================ */

const Config = (() => {
  const SALT_KEY = 'pos_config_salt';
  const DATA_KEY = 'pos_config_data';
  let _cryptoKey = null;

  function _b64ToBytes(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }
  function _bytesToB64(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  }

  async function _deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /* Call once during setup or on app start with stored salt */
  async function unlock(passphrase) {
    let salt;
    const storedSalt = localStorage.getItem(SALT_KEY);
    if (storedSalt) {
      salt = _b64ToBytes(storedSalt);
    } else {
      salt = crypto.getRandomValues(new Uint8Array(16));
      localStorage.setItem(SALT_KEY, _bytesToB64(salt));
    }
    _cryptoKey = await _deriveKey(passphrase, salt);
  }

  function isUnlocked() { return _cryptoKey !== null; }

  async function _encrypt(plaintext) {
    if (!_cryptoKey) throw new Error('Config not unlocked');
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, _cryptoKey, enc.encode(plaintext)
    );
    return _bytesToB64(iv) + '.' + _bytesToB64(ciphertext);
  }

  async function _decrypt(token) {
    if (!_cryptoKey) throw new Error('Config not unlocked');
    const [ivB64, ctB64] = token.split('.');
    const iv         = _b64ToBytes(ivB64);
    const ciphertext = _b64ToBytes(ctB64);
    const plaintext  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _cryptoKey, ciphertext);
    return new TextDecoder().decode(plaintext);
  }

  async function _loadAll() {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return {};
    try {
      const decrypted = await _decrypt(raw);
      return JSON.parse(decrypted);
    } catch { return {}; }
  }

  async function _saveAll(obj) {
    const json      = JSON.stringify(obj);
    const encrypted = await _encrypt(json);
    localStorage.setItem(DATA_KEY, encrypted);
  }

  async function get(key) {
    const all = await _loadAll();
    return all[key] ?? null;
  }

  async function set(key, value) {
    const all = await _loadAll();
    all[key] = value;
    await _saveAll(all);
  }

  async function getAll() {
    return _loadAll();
  }

  async function setMany(obj) {
    const all = await _loadAll();
    Object.assign(all, obj);
    await _saveAll(all);
  }

  function isConfigured() {
    return !!localStorage.getItem(DATA_KEY);
  }

  return { unlock, isUnlocked, isConfigured, get, set, getAll, setMany };
})();
