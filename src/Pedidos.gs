/**
 * Pedidos de entrada.
 * Rotina: quem já está na fração aprova. Impasse: o Admin Master decide.
 */

function emImpasse_(p) {
  return emailsAtivos_(p.fracao).length === 0 || (Date.now() - Number(p.data)) > IMPASSE_DAYS * DAY_MS;
}

/** Pedido público (ainda sem sessão). */
function api_requestEntry(email, letra) {
  email = validEmail_(email);
  letra = String(letra || '').toUpperCase();
  return withLock_(function () {
    if (!fracaoInfo_(letra)) throw new Error('Escolhe a tua fração.');
    if (isMaster_(email) || fracaoDe_(email)) throw new Error('Este email já tem acesso. Usa "Entrar".');
    const pendentes = table_('Pedidos_Entrada').filter(function (p) { return p.estado === 'pendente'; });
    if (pendentes.some(function (p) { return p.email === email; })) throw new Error('Já tens um pedido pendente.');
    if (pendentes.length >= 40) throw new Error('Há demasiados pedidos pendentes. Tenta mais tarde.');
    append_('Pedidos_Entrada', { id: Utilities.getUuid(), email: email, fracao: letra, data: Date.now(), estado: 'pendente', decidido_por: '', data_decisao: '', motivo: '' });
    audit_(null, 'Pedidos_Entrada', email, 'pedido', '', letra, 'Pedido de entrada');
    aviso_('pedido', 'Há um novo pedido de entrada na fração ' + letra + '.', 'fracao:' + letra, 'visitante');
    emailsAtivos_(letra).forEach(function (e) {
      sendMail_(e.email, 'Pedido de entrada na fração ' + letra, 'Alguém pediu para entrar na fração ' + letra + '. Abre a app, em Pedidos, para aprovar ou recusar.');
    });
    return { ok: true };
  });
}

function pedidosVisiveis_(s) {
  const pend = table_('Pedidos_Entrada').filter(function (p) { return p.estado === 'pendente'; });
  if (s.isMaster) return pend.filter(emImpasse_);
  return pend.filter(function (p) { return p.fracao === s.fracao; });
}

function api_pendingRequests(token) {
  const s = requireSession_(token);
  return pedidosVisiveis_(s).map(function (p) {
    const semEmails = emailsAtivos_(p.fracao).length === 0;
    return {
      id: p.id, email: p.email, fracao: p.fracao, data: Number(p.data),
      motivoImpasse: s.isMaster ? (semEmails ? 'Fração sem email válido' : 'Sem resposta há mais de ' + IMPASSE_DAYS + ' dias') : ''
    };
  });
}

function api_decideRequest(token, id, aprovar, motivo) {
  const s = requireSession_(token);
  return withLock_(function () {
    const p = table_('Pedidos_Entrada').filter(function (x) { return x.id === id && x.estado === 'pendente'; })[0];
    if (!p) throw new Error('Pedido não encontrado ou já decidido.');
    if (s.isMaster) {
      requireMaster_(s);
      text_(motivo, 3, 200, 'O motivo');
      if (!emImpasse_(p)) throw new Error('Este pedido ainda não está em impasse: a própria fração decide.');
    } else if (s.fracao !== p.fracao) {
      throw new Error('Só a própria fração decide este pedido.');
    }
    if (aprovar) {
      assertEmailLivre_(p.email);
      if (emailsAtivos_(p.fracao).length >= MAX_EMAILS) throw new Error('A fração já tem ' + MAX_EMAILS + ' emails. Remove ou troca um primeiro.');
      inserirEmail_(actor_(s), s, p.fracao, p.email, 'Pedido de entrada aprovado');
    }
    update_('Pedidos_Entrada', p._row, {
      estado: aprovar ? 'aprovado' : 'recusado', decidido_por: actor_(s), data_decisao: Date.now(), motivo: String(motivo || '').slice(0, 200)
    });
    audit_(s, 'Pedidos_Entrada', p.id, 'estado', 'pendente', aprovar ? 'aprovado' : 'recusado', motivo || '');
    aviso_('pedido', 'Pedido de ' + p.email + ' para a fração ' + p.fracao + ' ' + (aprovar ? 'aprovado' : 'recusado') + ' por ' + actor_(s) + '.', 'todos', actor_(s));
    sendMail_(p.email, aprovar ? 'O teu pedido foi aprovado' : 'O teu pedido foi recusado',
      aprovar ? 'Já podes entrar na app do condomínio: pede um código com este email.' : 'O teu pedido de entrada na fração ' + p.fracao + ' foi recusado.');
    return { ok: true };
  });
}
