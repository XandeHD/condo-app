const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const mails = [];
let uuidN = 0;
const store = {};            // sheet name -> rows
const props = {};
const mkSheet = (name) => ({
  _name: name,
  getLastRow() { return store[name].length; },
  getDataRange() { return { getValues: () => store[name].map(r => r.slice()) }; },
  appendRow(a) { store[name].push(a.slice()); },
  getRange(r, c, nr, nc) {
    return {
      setValue(v) { store[name][r - 1][c - 1] = v; return this; },
      setValues(vs) { vs.forEach((row, i) => row.forEach((v, j) => { (store[name][r - 1 + i] = store[name][r - 1 + i] || [])[c - 1 + j] = v; })); return this; },
      setFontWeight() { return this; }
    };
  },
  setFrozenRows() {}
});
const sheets = {};
const ss = {
  getId: () => 'SHEET',
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
    getUuid: () => crypto.randomUUID()
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
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


module.exports = { ctx, run, mails, store, props };
