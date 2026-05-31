/* ============================================================
   audit.js — Audit logging helpers
   ============================================================ */

const Audit = (() => {
  function log(eventType, description, transactionId) {
    const pin = Auth.current()?.pin || null;
    DB.logEvent(pin, eventType, description, transactionId || null);
  }

  function sale(transactionId, description)   { log('SALE',    description, transactionId); }
  function refund(transactionId, description) { log('REFUND',  description, transactionId); }
  function search(description)                { log('SEARCH',  description); }
  function configChange(description)          { log('CONFIG_CHANGE', description); }

  return { log, sale, refund, search, configChange };
})();
