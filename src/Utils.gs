/**
 * Utilitários partilhados: acesso à Sheet, hashes, validações.
 * Funções que terminam em "_" são privadas (não ficam acessíveis ao browser).
 */

const CODE_MIN = 10;          // validade do código de login (minutos)
const CODE_MAX_TRIES = 5;     // tentativas por código
const SESSION_DAYS = 180;     // sessão por dispositivo (6 meses sem usar)
const SESSION_DAYS_MASTER = 30; // Admin Master: chave partilhada, sessão mais curta
const IMPASSE_DAYS = 7;       // pedido sem resposta passa a impasse (master)
const MAX_EMAILS = 2;         // emails ativos por fração
const MIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MIN_MS;

let SALT_ = null;

let SS_ = null;      // Sheet aberta (só 1 vez por pedido: abrir é a parte mais lenta)
const MEMO_ = {};    // folhas já lidas neste pedido
const CACHE_TTL_ = 120;                        // segundos de cache entre pedidos
const SEM_CACHE_ = { Codigos_Login: true };    // nunca em cache (segurança)

function db_() {
  if (SS_) return SS_;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('A app ainda não foi configurada. Corre setup() no editor do Apps Script.');
  SS_ = SpreadsheetApp.openById(id);
  return SS_;
}

/** Limpa tudo (usado pelo setup, que escreve diretamente nas folhas). */
function limparTudo_() {
  SS_ = null;
  Object.keys(MEMO_).forEach(function (k) { delete MEMO_[k]; });
  Object.keys(SCHEMA).forEach(function (k) { try { CacheService.getScriptCache().remove('T:' + k); } catch (e) { /* ok */ } });
}

/** Esquece o que está em memória/cache de uma folha (chamado em cada escrita). */
// A chave da cache leva uma "versão" que muda a cada escrita. Assim, uma leitura que começou
// antes da escrita e acaba depois não consegue pôr dados velhos na cache que os outros vão ler.
function versao_(nome) {
  try {
    const c = CacheService.getScriptCache(), k = 'V:' + nome;
    let v = c.get(k);
    if (!v) { v = String(Date.now()) + Math.floor(Math.random() * 1000); c.put(k, v, 21600); }
    return v;
  } catch (e) { return '0'; }
}

function invalidar_(nome) {
  delete MEMO_[nome];
  try { CacheService.getScriptCache().put('V:' + nome, String(Date.now()) + Math.floor(Math.random() * 1000), 21600); } catch (e) { /* cache é só um acelerador */ }
}

// Colunas com data/hora. Na Sheet ficam como datas verdadeiras (legíveis); no código continuam a ser milissegundos.
const COLUNAS_DATA_ = {
  Emails_Fracao: ['data_inicio', 'data_fim'], Pedidos_Entrada: ['data', 'data_decisao'], Dispositivos: ['criado_em', 'ultimo_uso'],
  Avisos: ['data'], Administradores: ['desde', 'ate'], Convocatorias: ['data_envio'], Pagamentos: ['data'], Recibos: ['data'],
  Despesas: ['data'], Obras: ['data_inicio', 'data_fim'], Problemas: ['data'], Comentarios: ['data'], Documentos: ['data'],
  Auditoria: ['data_hora'], Codigos_Login: ['validade']
};
// Colunas com texto do tipo "2026-11": a Sheet tende a transformá-lo numa data, por isso guardam-se como texto
// e, se mesmo assim vier uma data, converte-se de volta para "aaaa-mm".
const COLUNAS_MES_ = { Pagamentos: ['meses'], Recibos: ['periodo'], Obras: ['garantia_ate'] };
const FORMATO_DATA_ = 'dd/mm/yyyy hh:mm';

function val_(nome, col, v) {
  const cols = COLUNAS_DATA_[nome];
  if (cols && cols.indexOf(col) >= 0 && typeof v === 'number' && v > 1e11) return new Date(v);
  return safe_(v);
}

function lerFolha_(nome) {
  const sh = db_().getSheetByName(nome);
  if (!sh) throw new Error('Folha em falta: ' + nome);
  const v = sh.getDataRange().getValues();
  const head = v[0];
  return v.slice(1).map(function (r, i) {
    const o = { _row: i + 2 };
    const mes = COLUNAS_MES_[nome] || [];
    head.forEach(function (h, j) {
      const x = r[j];
      if (x instanceof Date) o[h] = mes.indexOf(h) >= 0 ? Utilities.formatDate(x, 'Europe/Lisbon', 'yyyy-MM') : x.getTime();
      else o[h] = x;
    });
    return o;
  });
}

/** Lê uma folha inteira como lista de objetos. _row é o número da linha na folha. */
function table_(nome) {
  if (MEMO_[nome]) return MEMO_[nome].slice();
  let rows = null;
  const chave = 'T:' + nome + ':' + (SEM_CACHE_[nome] ? '' : versao_(nome));
  if (!SEM_CACHE_[nome]) {
    try { const c = CacheService.getScriptCache().get(chave); if (c) rows = JSON.parse(c); } catch (e) { rows = null; }
  }
  if (!rows) {
    rows = lerFolha_(nome);
    if (!SEM_CACHE_[nome]) {
      try { CacheService.getScriptCache().put(chave, JSON.stringify(rows), CACHE_TTL_); } catch (e) { /* demasiado grande: segue sem cache */ }
    }
  }
  MEMO_[nome] = rows;
  return rows.slice();
}

/** Impede que texto livre seja interpretado como fórmula pela Sheet. */
function safe_(v) {
  return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? ' ' + v : v;
}

function append_(nome, obj) {
  const head = SCHEMA[nome];
  if (!head) throw new Error('Folha desconhecida: ' + nome);
  db_().getSheetByName(nome).appendRow(head.map(function (h) {
    return obj[h] === undefined ? '' : val_(nome, h, obj[h]);
  }));
  invalidar_(nome);
}

function update_(nome, row, patch) {
  const head = SCHEMA[nome];
  const sh = db_().getSheetByName(nome);
  const keys = Object.keys(patch);
  keys.forEach(function (k) { if (head.indexOf(k) < 0) throw new Error('Coluna desconhecida: ' + nome + '.' + k); });
  if (keys.length === 1) {
    sh.getRange(row, head.indexOf(keys[0]) + 1).setValue(val_(nome, keys[0], patch[keys[0]]));
  } else {
    // uma só escrita para a linha inteira (várias escritas pequenas são lentas)
    const rng = sh.getRange(row, 1, 1, head.length);
    const vals = rng.getValues();
    keys.forEach(function (k) { vals[0][head.indexOf(k)] = val_(nome, k, patch[k]); });
    rng.setValues(vals);
  }
  invalidar_(nome);
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

/** Envia um email. Devolve true/false (nunca lança), para o chamador poder avisar se falhou. */
function sendMail_(to, subject, body, anexos, replyTo) {
  try {
    const msg = { to: to, subject: '[Condomínio] ' + subject, body: body, name: 'Condomínio Rua da Misericórdia 13/15/17' };
    if (anexos && anexos.length) msg.attachments = anexos;
    if (replyTo) msg.replyTo = replyTo;
    MailApp.sendEmail(msg);
    return true;
  } catch (e) {
    console.error('Falha a enviar email para ' + to + ': ' + e.message);
    return false;
  }
}
