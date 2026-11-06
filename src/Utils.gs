/**
 * Utilitários partilhados: acesso à Sheet, hashes, validações.
 * Funções que terminam em "_" são privadas (não ficam acessíveis ao browser).
 */

const CODE_MIN = 10;          // validade do código de login (minutos)
const CODE_MAX_TRIES = 5;     // tentativas por código
const SESSION_DAYS = 180;     // sessão por dispositivo (6 meses sem usar)
const IMPASSE_DAYS = 7;       // pedido sem resposta passa a impasse (master)
const MAX_EMAILS = 2;         // emails ativos por fração
const MIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MIN_MS;

let SALT_ = null;

function db_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('A app ainda não foi configurada. Corre setup() no editor do Apps Script.');
  return SpreadsheetApp.openById(id);
}

/** Lê uma folha inteira como lista de objetos. _row é o número da linha na folha. */
function table_(nome) {
  const sh = db_().getSheetByName(nome);
  if (!sh) throw new Error('Folha em falta: ' + nome);
  const v = sh.getDataRange().getValues();
  const head = v[0];
  return v.slice(1).map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  });
}

/** Impede que texto livre seja interpretado como fórmula pela Sheet. */
function safe_(v) {
  return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? ' ' + v : v;
}

function append_(nome, obj) {
  const head = SCHEMA[nome];
  if (!head) throw new Error('Folha desconhecida: ' + nome);
  db_().getSheetByName(nome).appendRow(head.map(function (h) {
    return obj[h] === undefined ? '' : safe_(obj[h]);
  }));
}

function update_(nome, row, patch) {
  const head = SCHEMA[nome];
  const sh = db_().getSheetByName(nome);
  Object.keys(patch).forEach(function (k) {
    const c = head.indexOf(k);
    if (c < 0) throw new Error('Coluna desconhecida: ' + nome + '.' + k);
    sh.getRange(row, c + 1).setValue(safe_(patch[k]));
  });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function cfg_(chave) {
  const r = table_('Config').filter(function (x) { return x.chave === chave; })[0];
  return r ? String(r.valor) : '';
}

function salt_() {
  if (SALT_ === null) SALT_ = PropertiesService.getScriptProperties().getProperty('SALT') || '';
  return SALT_;
}

function hash_(s) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt_() + ':' + s, Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function newToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/** Código de 6 dígitos a partir de UUID aleatório. */
function code6_() {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + Date.now());
  const n = (((d[0] & 0x7f) << 24) | ((d[1] & 0xff) << 16) | ((d[2] & 0xff) << 8) | (d[3] & 0xff)) % 900000;
  return String(100000 + n);
}

function isTrue_(v) { return v === true || v === 'TRUE' || v === 'true'; }

function norm_(e) { return String(e || '').trim().toLowerCase(); }

function validEmail_(e) {
  const x = norm_(e);
  if (!/^[a-z0-9][a-z0-9._%+\-]*@[a-z0-9][a-z0-9.\-]*\.[a-z]{2,}$/.test(x) || x.length > 120) {
    throw new Error('Email inválido.');
  }
  return x;
}

function text_(v, min, max, nome) {
  const s = String(v || '').trim();
  if (s.length < min) throw new Error(nome + ' é obrigatório.');
  return s.slice(0, max);
}

function sendMail_(to, subject, body) {
  try {
    MailApp.sendEmail({ to: to, subject: '[Condomínio] ' + subject, body: body, name: 'Condomínio Rua da Misericórdia 13/15/17' });
  } catch (e) {
    console.error('Falha a enviar email para ' + to + ': ' + e.message);
  }
}
