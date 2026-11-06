/**
 * Obras, problemas e comentários. Qualquer condómino (menos o Master) regista e comenta.
 * Nada se apaga: obras e problemas mudam de estado e as alterações ficam na auditoria.
 */

const OBRA_ESTADOS = ['Em curso', 'Concluída'];
const PRIORIDADES = ['Alta', 'Média', 'Baixa'];
const PROBLEMA_ESTADOS = ['Aberto', 'Em tratamento', 'Resolvido'];

function dataLivre_(str, nome, obrigatoria) {
  if (!str) { if (obrigatoria) throw new Error(nome + ' é obrigatória.'); return ''; }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str));
  if (!m) throw new Error(nome + ' inválida.');
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  if (isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 || d.getFullYear() < 2000 || d.getFullYear() > 2100) throw new Error(nome + ' inválida.');
  return d.getTime();
}

function contar_(tipo) {
  const n = {};
  table_('Documentos').forEach(function (d) { if (d.tipo_registo === tipo) n[d.id_registo] = (n[d.id_registo] || 0) + 1; });
  return n;
}

function api_obras(token) {
  const s = requireSession_(token);
  requireMember_(s);
  const docs = contar_('Obra');
  return table_('Obras').sort(function (a, b) { return Number(b.data_inicio || 0) - Number(a.data_inicio || 0); }).map(function (o) {
    return {
      id: o.id, titulo: o.titulo, descricao: o.descricao, fornecedor: o.fornecedor, estado: o.estado,
      inicio: o.data_inicio === '' ? null : Number(o.data_inicio), fim: o.data_fim === '' ? null : Number(o.data_fim),
      custo: o.custo === '' ? null : Number(o.custo), garantia: o.garantia_ate, docs: docs[o.id] || 0
    };
  });
}

function api_addObra(token, titulo, descricao, fornecedor, inicio, custo, garantia, ficheiro) {
  const s = requireSession_(token);
  requireMember_(s);
  return withLock_(function () {
    titulo = text_(titulo, 3, 100, 'O título');
    descricao = String(descricao || '').trim().slice(0, 500);
    fornecedor = String(fornecedor || '').trim().slice(0, 100);
    const ini = dataLivre_(inicio, 'A data de início', true);
    let c = '';
    if (custo !== '' && custo != null) c = valorValido_(custo, 'O custo');
    if (garantia && !/^\d{4}-\d{2}$/.test(garantia)) throw new Error('Garantia inválida.');
    const id = Utilities.getUuid();
    append_('Obras', { id: id, titulo: titulo, descricao: descricao, fornecedor: fornecedor, data_inicio: ini, data_fim: '', custo: c, estado: 'Em curso', garantia_ate: garantia || '' });
    if (ficheiro && ficheiro.base64) anexar_(s, 'Obra', id, ficheiro);
    audit_(s, 'Obras', id, 'registo', '', titulo, 'Obra registada');
    aviso_('obra', 'Nova obra registada pela fração ' + s.fracao + ': ' + titulo + '.', 'todos', s.email);
    return { ok: true, id: id };
  });
}

function api_concluirObra(token, id, fim, custo, garantia) {
  const s = requireSession_(token);
  requireMember_(s);
  return withLock_(function () {
    const o = table_('Obras').filter(function (x) { return x.id === id; })[0];
    if (!o) throw new Error('Obra não encontrada.');
    if (o.estado === 'Concluída') throw new Error('Esta obra já está concluída.');
    const patch = { estado: 'Concluída', data_fim: dataLivre_(fim, 'A data de conclusão', true) };
    if (custo !== '' && custo != null) patch.custo = valorValido_(custo, 'O custo');
    if (garantia) { if (!/^\d{4}-\d{2}$/.test(garantia)) throw new Error('Garantia inválida.'); patch.garantia_ate = garantia; }
    update_('Obras', o._row, patch);
    audit_(s, 'Obras', id, 'estado', o.estado, 'Concluída', 'Obra concluída');
    aviso_('obra', 'Obra concluída: ' + o.titulo + '.', 'todos', s.email);
    return { ok: true };
  });
}

/** Guarda um ficheiro (PDF/foto) ligado a um registo. */
function anexar_(s, tipo, idRegisto, ficheiro) {
  if (!MIMES_OK[ficheiro.mime]) throw new Error('O ficheiro tem de ser PDF, JPG, PNG ou WEBP.');
  if (String(ficheiro.base64).length > MAX_FICHEIRO_B64) throw new Error('O ficheiro é demasiado grande (máximo 5 MB).');
  const nome = nomeSeguro_(ficheiro.nome).replace(/\.[^.]*$/, '') + '.' + MIMES_OK[ficheiro.mime];
  return guardarDoc_(Utilities.newBlob(Utilities.base64Decode(ficheiro.base64), ficheiro.mime, nome), tipo, idRegisto, s);
}

function api_addDoc(token, tipo, idRegisto, ficheiro) {
  const s = requireSession_(token);
  requireMember_(s);
  if (['Obra', 'Problema'].indexOf(tipo) < 0) throw new Error('Tipo inválido.');
  if (!ficheiro || !ficheiro.base64) throw new Error('Escolhe um ficheiro.');
  const existe = table_(tipo === 'Obra' ? 'Obras' : 'Problemas').some(function (x) { return x.id === idRegisto; });
  if (!existe) throw new Error('Registo não encontrado.');
  anexar_(s, tipo, idRegisto, ficheiro);
  audit_(s, tipo === 'Obra' ? 'Obras' : 'Problemas', idRegisto, 'documento', '', ficheiro.nome, 'Documento adicionado');
  return { ok: true };
}

function api_docs(token, tipo, idRegisto) {
  const s = requireSession_(token);
  requireMember_(s);
  return table_('Documentos').filter(function (d) { return d.tipo_registo === tipo && d.id_registo === idRegisto; })
    .map(function (d) { return { id: d.id, nome: d.nome, data: Number(d.data), enviadoPor: d.enviado_por }; });
}

function api_getDoc(token, idDoc) {
  const s = requireSession_(token);
  requireMember_(s);
  const d = table_('Documentos').filter(function (x) { return x.id === idDoc; })[0];
  if (!d || ['Obra', 'Problema', 'Convocatoria'].indexOf(d.tipo_registo) < 0) throw new Error('Documento não encontrado.');
  return docBase64_(idDoc);
}

/* ---------- Problemas ---------- */

function api_problemas(token) {
  const s = requireSession_(token);
  requireMember_(s);
  const cs = {};
  table_('Comentarios').forEach(function (c) { if (c.tipo_registo === 'Problema') cs[c.id_registo] = (cs[c.id_registo] || 0) + 1; });
  const docs = contar_('Problema');
  const peso = { 'Alta': 0, 'Média': 1, 'Baixa': 2 };
  return table_('Problemas').sort(function (a, b) {
    return (peso[a.prioridade] - peso[b.prioridade]) || (Number(b.data) - Number(a.data));
  }).map(function (p) {
    return { id: p.id, titulo: p.titulo, descricao: p.descricao, local: p.local, prioridade: p.prioridade, estado: p.estado, fracao: p.reportado_por, data: Number(p.data), comentarios: cs[p.id] || 0, docs: docs[p.id] || 0 };
  });
}

function api_addProblema(token, titulo, descricao, local, prioridade) {
  const s = requireSession_(token);
  requireMember_(s);
  return withLock_(function () {
    titulo = text_(titulo, 3, 100, 'O título');
    local = text_(local, 2, 100, 'O local');
    descricao = String(descricao || '').trim().slice(0, 500);
    if (PRIORIDADES.indexOf(prioridade) < 0) throw new Error('Escolhe a prioridade.');
    const id = Utilities.getUuid();
    append_('Problemas', { id: id, titulo: titulo, descricao: descricao, local: local, prioridade: prioridade, estado: 'Aberto', reportado_por: s.fracao, data: Date.now(), id_obra: '' });
    audit_(s, 'Problemas', id, 'registo', '', titulo, 'Problema reportado');
    aviso_('problema', 'Problema reportado pela fração ' + s.fracao + ': ' + titulo + ' (prioridade ' + prioridade.toLowerCase() + ').', 'todos', s.email);
    return { ok: true, id: id };
  });
}

function api_setProblema(token, id, estado) {
  const s = requireSession_(token);
  requireMember_(s);
  return withLock_(function () {
    if (PROBLEMA_ESTADOS.indexOf(estado) < 0) throw new Error('Estado inválido.');
    const p = table_('Problemas').filter(function (x) { return x.id === id; })[0];
    if (!p) throw new Error('Problema não encontrado.');
    if (p.estado === estado) return { ok: true };
    update_('Problemas', p._row, { estado: estado });
    audit_(s, 'Problemas', id, 'estado', p.estado, estado, 'Estado alterado');
    aviso_('problema', 'Problema "' + p.titulo + '": ' + estado.toLowerCase() + ' (por ' + s.email + ').', 'todos', s.email);
    return { ok: true };
  });
}

function api_comments(token, tipo, id) {
  const s = requireSession_(token);
  requireMember_(s);
  return table_('Comentarios').filter(function (c) { return c.tipo_registo === tipo && c.id_registo === id; })
    .sort(function (a, b) { return Number(a.data) - Number(b.data); })
    .map(function (c) { return { autor: c.autor, fracao: fracaoDe_(c.autor), data: Number(c.data), texto: c.texto }; });
}

function api_addComment(token, tipo, id, texto) {
  const s = requireSession_(token);
  requireMember_(s);
  if (['Problema', 'Obra'].indexOf(tipo) < 0) throw new Error('Tipo inválido.');
  texto = text_(texto, 1, 400, 'O comentário');
  append_('Comentarios', { id: Utilities.getUuid(), tipo_registo: tipo, id_registo: id, autor: s.email, data: Date.now(), texto: texto });
  return { ok: true };
}
