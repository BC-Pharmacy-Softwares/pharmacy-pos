/**
 * preload.js — Electron context bridge
 * Exposes safe IPC methods to the renderer (Settings screen) for SQL config management.
 * contextIsolation: true means the renderer cannot access Node APIs directly.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Returns current SQL config (password redacted) */
  getSqlConfig: () => ipcRenderer.invoke('get-sql-config'),

  /** Test a connection without saving — returns { ok, message } */
  testSqlConnection: (config) => ipcRenderer.invoke('test-sql-connection', config),

  /** Save config to sql-config.json and reconnect — returns { ok, message } */
  saveSqlConfig: (config) => ipcRenderer.invoke('save-sql-config', config),

  /** Render a full HTML document to PDF and return base64 string (or null on failure) */
  generateReceiptPdf: (htmlDocument) => ipcRenderer.invoke('generate-receipt-pdf', htmlDocument),

  /** Render an HTML document to A5 PDF (148×210mm) — for WinRx document inbox */
  generateA5Pdf: (htmlDocument) => ipcRenderer.invoke('generate-a5-pdf', htmlDocument),

  /** Returns list of installed printers: [{ name, isDefault, status }] */
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  /** Print a standalone HTML document silently to the named printer — returns { ok, reason } */
  printReceiptHtml: (html, printerName, paperMm) => ipcRenderer.invoke('print-receipt-html', { html, printerName, paperMm }),

  /** Send email directly via nodemailer (no Cloudflare Worker) — returns { ok, error? } */
  sendEmail: (params) => ipcRenderer.invoke('send-email', params),

  /** Save a base64 PDF to a local folder path — returns { ok, path?, error? } */
  savePdfFile: (params) => ipcRenderer.invoke('save-pdf-file', params),

  /** Make a McKesson PharmaClik SOAP call (runs in Node, no CORS) — returns { ok, status, body } */
  mckessonSoap: (params) => ipcRenderer.invoke('mckesson-soap', params),

  /** Write Clover .env from Settings and restart the bridge — returns { ok, error? } */
  saveCloverEnv: (vals) => ipcRenderer.invoke('save-clover-env', vals),

  /** Open the native folder picker — returns { ok, path?, canceled? } */
  pickFolder: (current) => ipcRenderer.invoke('pick-folder', { current }),

  /** Open a URL in the system default browser */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
