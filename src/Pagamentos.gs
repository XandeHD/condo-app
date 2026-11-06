/**
 * Quotas (mensais, por fração e por ano) e pagamentos com comprovativo.
 * Todos os condóminos registam e veem. O Admin Master não tem acesso. Nada se apaga: anula-se com motivo.
 */

const MAX_FICHEIRO_B64 = 7 * 1024 * 1024;   // ~5 MB de ficheiro
const MIMES_OK = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const METODOS = ['Transferência', 'MB Way', 'Numerário', 'Cheque', 'Outro'];

/* ---------- Drive ---------- */

function pasta_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recria abaixo */ } }
  const f = DriveApp.createFolder('Condomínio Rua da Misericórdia 13/15/17 – Documentos');
  p.setProperty('FOLDER_ID', f.getId());
  return f;
}

function nomeSeguro_(n) {
  return String(n || 'ficheiro').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'ficheiro';
}

/** Grava um ficheiro (blob) no Drive e regista-o em Documentos. Devolve o id do documento. */
function guardarDoc_(blob, tipoRegisto, idRegisto, s) {
  const f = pasta_().createFile(blob);
  const id = Utilities.getUuid();
  append_('Documentos', { id: id, nome: blob.getName(), tipo_registo: tipoRegisto, id_registo: idRegisto, id_drive: f.getId(), enviado_por: s.email, data: Date.now() });
  return { id: id, driveId: f.getId() };
}

function docBase64_(idDoc) {
  const d = table_('Documentos').filter(function (x) { return x.id === idDoc; })[0];
  if (!d) throw new Error('Documento não encontrado.');
  const blob = DriveApp.getFileById(d.id_drive).getBlob();
  return { nome: d.nome, mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------- Quotas ---------- */

function anoValido_(ano) {
  ano = Number(ano);
  if (!(ano >= 2000 && ano <= 2100) || ano % 1 !== 0) throw new Error('Ano inválido.');
  return ano;
}

function valorValido_(v, nome) {
  const n = Math.round(Number(String(v == null ? '' : v).replace(',', '.')) * 100) / 100;
  if (!(n > 0) || n > 100000) throw new Error(nome + ' inválido.');
  return n;
}

function api_quotas(token, ano) {
  const s = requireSession_(token);
  requireMember_(s);
  ano = anoValido_(ano || new Date().getFullYear());
  const q = table_('Quotas').filter(function (r) { return Number(r.ano) === ano; });
  return {
    ano: ano,
    fracoes: table_('Fracoes').filter(function (f) { return isTrue_(f.ativa); }).map(function (f) {
      const r = q.filter(function (x) { return x.fracao === f.letra; })[0];
      return { letra: f.letra, nome: f.andar + ' ' + f.lado, tipo: f.tipo, valor: r ? Number(r.valor_mensal) : null, ref: r ? r.ref_reuniao : '', notas: r ? r.notas : '' };
    })
  };
}

function api_setQuota(token, ano, letra, valor, ref, notas, motivo) {
  const s = requireSession_(token);
  requireMember_(s);
  return withLock_(function () {
    ano = anoValido_(ano);
    if (!fracaoInfo_(letra)) throw new Error('Fração não encontrada.');
    valor = valorValido_(valor, 'O valor');
    ref = String(ref || '').trim().slice(0, 100);
    notas = String(notas || '').trim().slice(0, 200);
    const atual = table_('Quotas').filter(function (r) { return r.fracao === letra && Number(r.ano) === ano; })[0];
    if (atual && Number(atual.valor_mensal) !== valor) text_(motivo, 3, 200, 'O motivo da alteração');
    if (atual) {
      if (Number(atual.valor_mensal) === valor && atual.ref_reuniao === ref && atual.notas === notas) return { ok: true };
      update_('Quotas', atual._row, { valor_mensal: valor, ref_reuniao: ref, notas: notas });
    } else {
      append_('Quotas', { fracao: letra, ano: ano, valor_mensal: valor, ref_reuniao: ref, notas: notas });
    }
    audit_(s, 'Quotas', letra + '/' + ano, 'valor_mensal', atual ? Number(atual.valor_mensal) : '', valor, motivo || 'Primeira definição');
    aviso_('quota', 'Quota mensal da fração ' + letra + ' em ' + ano + ': ' + valor.toFixed(2) + ' € (definida por ' + s.email + ').', 'todos', s.email);
    return { ok: true };
  });
}

/* ---------- Pagamentos ---------- */

function mesesLista_(inicio, n) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(inicio || ''));
  n = Number(n);
  if (!m || !(n >= 1 && n <= 12) || n % 1 !== 0) throw new Error('Indica o mês inicial e o número de meses (1 a 12).');
  let ano = Number(m[1]), mes = Number(m[2]);
  if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) throw new Error('Mês inválido.');
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(ano + '-' + ('0' + mes).slice(-2));
    mes++; if (mes > 12) { mes = 1; ano++; }
  }
  return out;
}

function dataValida_(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
  if (!m) throw new Error('Data inválida.');
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  if (isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1) throw new Error('Data inválida.');
  if (d.getTime() > Date.now() + 2 * DAY_MS) throw new Error('A data do pagamento não pode ser no futuro.');
  return d.getTime();
}

function reciboAtivoDe_(idPagamento) {
  return table_('Recibos').filter(function (r) { return r.id_pagamento === idPagamento && !isTrue_(r.anulado); })[0];
}

function api_addPayment(token, letra, dataStr, valor, mesInicio, nMeses, metodo, notas, ficheiro) {
  const s = requireSession_(token);
  requireMember_(s);
  return withLock_(function () {
    if (!fracaoInfo_(letra)) throw new Error('Escolhe a fração.');
    const data = dataValida_(dataStr);
    valor = valorValido_(valor, 'O valor');
    const meses = mesesLista_(mesInicio, nMeses);
    if (METODOS.indexOf(metodo) < 0) throw new Error('Escolhe a forma de pagamento.');
    notas = String(notas || '').trim().slice(0, 200);
    if (!ficheiro || !ficheiro.base64) throw new Error('Anexa o comprovativo (PDF ou foto).');
    if (!MIMES_OK[ficheiro.mime]) throw new Error('O comprovativo tem de ser PDF, JPG, PNG ou WEBP.');
    if (String(ficheiro.base64).length > MAX_FICHEIRO_B64) throw new Error('O comprovativo é demasiado grande (máximo 5 MB).');

    const id = Utilities.getUuid();
    const nome = nomeSeguro_(ficheiro.nome).replace(/\.[^.]*$/, '') + '.' + MIMES_OK[ficheiro.mime];
    const blob = Utilities.newBlob(Utilities.base64Decode(ficheiro.base64), ficheiro.mime, 'Comprovativo ' + letra + ' ' + meses[0] + ' - ' + nome);
    const doc = guardarDoc_(blob, 'Pagamento', id, s);
    append_('Pagamentos', {
      id: id, fracao: letra, data: data, valor: valor, meses: meses.join(','), metodo: metodo, notas: notas,
      registado_por: s.email, emails_na_altura: emailsAtivos_(letra).map(function (e) { return e.email; }).join(','),
      id_documento: doc.id, anulado: false, motivo: ''
    });
    audit_(s, 'Pagamentos', id, 'registo', '', valor + ' € · fração ' + letra + ' · ' + meses.join(','), 'Pagamento registado');
    aviso_('pagamento', 'Pagamento de ' + valor.toFixed(2) + ' € registado na fração ' + letra + ' por ' + s.email + '.', 'fracao:' + letra, s.email);
    return { ok: true, id: id };
  });
}

function api_payments(token, letra) {
  const s = requireSession_(token);
  requireMember_(s);
  const recs = table_('Recibos');
  return table_('Pagamentos')
    .filter(function (p) { return !letra || p.fracao === letra; })
    .sort(function (a, b) { return Number(b.data) - Number(a.data); })
    .slice(0, 150)
    .map(function (p) {
      const r = recs.filter(function (x) { return x.id_pagamento === p.id && !isTrue_(x.anulado); })[0];
      return {
        id: p.id, fracao: p.fracao, data: Number(p.data), valor: Number(p.valor), meses: String(p.meses).split(','),
        metodo: p.metodo, notas: p.notas, registadoPor: p.registado_por, anulado: isTrue_(p.anulado), motivo: p.motivo,
        reciboKey: r ? reciboKey_(r) : '', reciboLabel: r ? reciboLabel_(r) : ''
      };
    });
}

function api_getProof(token, id) {
  const s = requireSession_(token);
  requireMember_(s);
  const p = table_('Pagamentos').filter(function (x) { return x.id === id; })[0];
  if (!p) throw new Error('Pagamento não encontrado.');
  audit_(s, 'Pagamentos', id, 'descarga', '', 'comprovativo', 'Descarga do comprovativo');
  return docBase64_(p.id_documento);
}

function api_annulPayment(token, id, motivo) {
  const s = requireSession_(token);
  requireMember_(s);
  return withLock_(function () {
    motivo = text_(motivo, 3, 200, 'O motivo');
    const p = table_('Pagamentos').filter(function (x) { return x.id === id; })[0];
    if (!p) throw new Error('Pagamento não encontrado.');
    if (isTrue_(p.anulado)) throw new Error('Este pagamento já está anulado.');
    if (reciboAtivoDe_(id)) throw new Error('Este pagamento tem recibo. Um administrador tem de anular primeiro o recibo.');
    update_('Pagamentos', p._row, { anulado: true, motivo: motivo });
    audit_(s, 'Pagamentos', id, 'anulado', false, true, motivo);
    aviso_('pagamento', 'Pagamento da fração ' + p.fracao + ' (' + Number(p.valor).toFixed(2) + ' €) anulado por ' + s.email + '. Motivo: ' + motivo, 'todos', s.email);
    return { ok: true };
  });
}
