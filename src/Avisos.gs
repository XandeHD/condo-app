/**
 * Avisos dentro da app (substituem a maior parte dos emails) e registo de auditoria.
 * destinatario: "todos", um email, ou "fracao:X".
 */

function aviso_(tipo, texto, destinatario, criadoPor) {
  append_('Avisos', { id: Utilities.getUuid(), data: Date.now(), tipo: tipo, texto: texto, destinatario: destinatario, criado_por: criadoPor || '', lido_por: '' });
}

function avisoVisivel_(a, s) {
  return a.destinatario === 'todos' || a.destinatario === s.email || (!!s.fracao && a.destinatario === 'fracao:' + s.fracao);
}

function avisosVisiveis_(s) {
  return table_('Avisos')
    .filter(function (a) { return avisoVisivel_(a, s); })
    .sort(function (a, b) { return Number(b.data) - Number(a.data); })
    .slice(0, 50)
    .map(function (a) {
      return {
        _row: a._row, id: a.id, data: Number(a.data), tipo: a.tipo, texto: a.texto, criadoPor: a.criado_por,
        lido: String(a.lido_por).split(',').indexOf(s.email) >= 0, _lido_por: String(a.lido_por)
      };
    });
}

function api_avisos(token) {
  const s = requireSession_(token);
  return avisosVisiveis_(s).map(function (a) {
    return { id: a.id, data: a.data, tipo: a.tipo, texto: a.texto, criadoPor: a.criadoPor, lido: a.lido };
  });
}

function api_markAvisosRead(token) {
  const s = requireSession_(token);
  return withLock_(function () {
    avisosVisiveis_(s).filter(function (a) { return !a.lido; }).forEach(function (a) {
      update_('Avisos', a._row, { lido_por: a._lido_por ? a._lido_por + ',' + s.email : s.email });
    });
    return { ok: true };
  });
}

/**
 * Registo imutável. "ctx" é a sessão ({email, quem}) ou null para ações públicas.
 * Para o Admin Master guarda também quem declarou ser.
 */
function audit_(ctx, tabela, idRegisto, campo, antes, depois, motivo) {
  append_('Auditoria', {
    data_hora: Date.now(),
    utilizador: ctx ? ctx.email : 'visitante',
    utilizador_declarado: ctx && ctx.quem ? ctx.quem : '',
    tabela: tabela, id_registo: idRegisto, campo: campo, antes: antes, depois: depois, motivo: motivo || ''
  });
}
