const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const mails = [];
let uuidN = 0;
const store = {};            // sheet name -> rows
const props = {};
const mkSheet = (name) => ({
  _name: name,
  getLastRow() { return store[name].length; },
  getMaxRows() { return store[name].length; },
  autoResizeColumns() {},
  getDataRange() { return { getValues: () => store[name].map(r => r.slice()) }; },
  appendRow(a) { store[name].push(a.slice()); },
  getRange(r, c, nr, nc) {
    return {
      setValue(v) { store[name][r - 1][c - 1] = v; return this; },
      setValues(vs) { vs.forEach((row, i) => row.forEach((v, j) => { (store[name][r - 1 + i] = store[name][r - 1 + i] || [])[c - 1 + j] = v; })); return this; },
      getValues() { const out = []; for (let i = 0; i < (nr || 1); i++) { const row = store[name][r - 1 + i] || []; out.push(nc ? row.slice(c - 1, c - 1 + nc) : row.slice(0, row.length)); } return out; },
      setNumberFormat() { return this; },
      setFontWeight() { return this; }
    };
  },
  setFrozenRows() {}
});
const cache = {}; const files = {}; let fileN = 0;
const mkBlob = (data, mime, name) => { const b = { _d: data, _m: mime, _n: name,
  getName: () => b._n, setName: (n) => { b._n = n; return b; }, getContentType: () => b._m,
  getBytes: () => (typeof b._d === 'string' ? Array.from(Buffer.from(b._d)) : b._d),
  getAs: (m) => mkBlob(b._d, m, b._n) }; return b; };
const sheets = {};
const ss = {
  getId: () => 'SHEET',
  setSpreadsheetTimeZone() {},
  getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET',
  getSheetByName: (n) => (store[n] ? (sheets[n] = sheets[n] || mkSheet(n)) : null),
  insertSheet: (n) => { store[n] = []; return ss.getSheetByName(n); },
  getSheets: () => Object.keys(store).map(n => ss.getSheetByName(n)),
  deleteSheet() {}
};
const ctx = {
  console, Date, Math, String, Number, Object, Array, Error, JSON,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()),
    getUuid: () => crypto.randomUUID(),
    formatDate: (d, tz, fmt) => { const x = new Date(d); const p = n => ('0' + n).slice(-2); return fmt.replace('yyyy', x.getFullYear()).replace('MM', p(x.getMonth() + 1)).replace('dd', p(x.getDate())); },
    base64Encode: (b) => Buffer.from(b).toString('base64'),
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
    newBlob: (data, mime, name) => mkBlob(data, mime, name)
  },
  DriveApp: {
    createFolder: (n) => ({ getId: () => 'FOLDER', createFile: (blob) => { const id = 'F' + (++fileN); files[id] = blob; return { getId: () => id }; } }),
    getFolderById: () => ({ getId: () => 'FOLDER', createFile: (blob) => { const id = 'F' + (++fileN); files[id] = blob; return { getId: () => id }; } }),
    getFileById: (id) => ({ getBlob: () => files[id] })
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: k => (cache[k] === undefined ? null : cache[k]), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  MailApp: { sendEmail: (m) => mails.push(m) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'Dono@Gmail.com' }) },
  HtmlService: {}, Logger: { log() {} }
};
vm.createContext(ctx);
const src = fs.readdirSync(require('path').join(__dirname,'..','src')).filter(f => f.endsWith('.gs')).map(f => fs.readFileSync(require('path').join(__dirname,'..','src',f), 'utf8')).join('\n');
vm.runInContext(src, ctx);
const run = (code) => vm.runInContext(code, ctx);


module.exports = { ctx, run, mails, store, props, files };
