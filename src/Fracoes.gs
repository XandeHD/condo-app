/**
 * Frações e emails. Regra: cada fração só altera os seus próprios emails.
 * O Admin Master também pode, em impasse, com motivo obrigatório.
 */

function fracaoInfo_(letra) {
  const f = table_('Fracoes').filter(function (x) { return x.letra === letra; })[0];
  if (!f) return null;
  return { letra: f.letra, andar: f.andar, lado: f.lado, tipo: f.tipo, nome: f.andar + ' ' + f.lado };
}

function api_fracoes(token) {
  const s = requireSession_(token);
  const ativos = emailsAtivos_();
  return table_('Fracoes').filter(function (f) { return isTrue_(f.ativa); }).map(function (f) {
    return {
      letra: f.letra, andar: f.andar, lado: f.lado, tipo: f.tipo, nome: f.andar + ' ' + f.lado,
      nEmails: ativos.filter(function (e) { return e.fracao === f.letra; }).length,
      minha: s.fracao === f.letra
    };
  });
}

function api_fracao(token, letra) {
  const s = requireSession_(token);
  const info = fracaoInfo_(letra);
  if (!info) throw new Error('Fração não encontrada.');
  const todos = table_('Emails_Fracao').filter(function (r) { return r.fracao === letra; });
  const mapa = function (r) {
    return { email: r.email, desde: Number(r.data_inicio), ate: r.data_fim === '' ? null : Number(r.data_fim), alteradoPor: r.alterado_por };
  };
  const ativos = todos.filter(function (r) { return r.data_fim === ''; }).map(mapa);
  return {
    fracao: info,
    ativos: ativos,
    historico: todos.map(mapa).sort(function (a, b) { return b.desde - a.desde; }),
    podeEditar: s.fracao === letra || (s.isMaster && !!s.quem),
    podeAdicionar: ativos.length < MAX_EMAILS
  };
}

function assertCanEdit_(s, letra, motivo) {
  if (!fracaoInfo_(letra)) throw new Error('Fração não encontrada.');
  if (s.isMaster) {
    requireMaster_(s);
    text_(motivo, 3, 200, 'O motivo');
  } else if (s.fracao !== letra) {
    throw new Error('Só a própria fração pode alterar os seus emails.');
  }
}

function assertEmailLivre_(email) {
  if (isMaster_(email)) throw new Error('Este email é reservado ao Admin Master.');
  if (fracaoDe_(email)) throw new Error('Este email já está associado a uma fração.');
}

/** Fecha as ligações de um email que saiu da fração. */
function aposSaida_(email, letra, ator) {
  table_('Administradores').filter(function (r) { return r.email === email && r.ate === ''; })
    .forEach(function (r) {
      update_('Administradores', r._row, { ate: Date.now(), removido_por: 'Email saiu da fração', motivo: 'O email deixou de estar ativo na fração ' + letra });
      aviso_('administracao', 'Uma vaga de administrador ficou livre: o email saiu da fração ' + letra + '.', 'todos', ator);
    });
  table_('Dispositivos').filter(function (r) { return r.email === email && !isTrue_(r.revogado); })
    .forEach(function (r) { update_('Dispositivos', r._row, { revogado: true }); });
}

function inserirEmail_(ator, auditCtx, letra, email, motivo) {
  append_('Emails_Fracao', { fracao: letra, email: email, data_inicio: Date.now(), data_fim: '', alterado_por: ator });
  audit_(auditCtx, 'Emails_Fracao', letra, 'email_ativo', '', email, motivo);
}

function api_addEmail(token, letra, email, motivo) {
  const s = requireSession_(token);
  return withLock_(function () {
    assertCanEdit_(s, letra, motivo);
    email = validEmail_(email);
    assertEmailLivre_(email);
    if (emailsAtivos_(letra).length >= MAX_EMAILS) throw new Error('A fração já tem ' + MAX_EMAILS + ' emails ativos.');
    inserirEmail_(actor_(s), s, letra, email, motivo);
    aviso_('email', 'Foi adicionado um email à fração ' + letra + ' por ' + actor_(s) + '.', 'todos', actor_(s));
    sendMail_(email, 'Foste adicionado à fração ' + letra, 'Já podes entrar na app do condomínio com este email (recebes um código por email).');
    return { ok: true };
  });
}

function api_removeEmail(token, letra, email, motivo) {
  const s = requireSession_(token);
  return withLock_(function () {
    assertCanEdit_(s, letra, motivo);
    email = norm_(email);
    const ativos = emailsAtivos_(letra);
    const r = ativos.filter(function (x) { return x.email === email; })[0];
    if (!r) throw new Error('Esse email não está ativo nesta fração.');
    if (ativos.length <= 1) throw new Error('Uma fração não pode ficar sem emails. Troca por outro em vez de remover.');
    update_('Emails_Fracao', r._row, { data_fim: Date.now() });
    audit_(s, 'Emails_Fracao', letra, 'email_ativo', email, '', motivo);
    aposSaida_(email, letra, actor_(s));
    aviso_('email', 'Foi removido um email da fração ' + letra + ' por ' + actor_(s) + '.', 'todos', actor_(s));
    sendMail_(email, 'Já não estás associado à fração ' + letra, 'Este email deixou de ter acesso à app do condomínio.');
    return { ok: true };
  });
}

function api_replaceEmail(token, letra, antigo, novo, motivo) {
  const s = requireSession_(token);
  return withLock_(function () {
    assertCanEdit_(s, letra, motivo);
    antigo = norm_(antigo);
    novo = validEmail_(novo);
    const r = emailsAtivos_(letra).filter(function (x) { return x.email === antigo; })[0];
    if (!r) throw new Error('Esse email não está ativo nesta fração.');
    if (novo === antigo) throw new Error('O email novo é igual ao antigo.');
    assertEmailLivre_(novo);
    update_('Emails_Fracao', r._row, { data_fim: Date.now() });
    inserirEmail_(actor_(s), s, letra, novo, motivo);
    audit_(s, 'Emails_Fracao', letra, 'email_ativo', antigo, novo, motivo);
    aposSaida_(antigo, letra, actor_(s));
    aviso_('email', 'Um email da fração ' + letra + ' foi trocado por ' + actor_(s) + '.', 'todos', actor_(s));
    sendMail_(antigo, 'Já não estás associado à fração ' + letra, 'Este email deixou de ter acesso à app do condomínio.');
    sendMail_(novo, 'Foste adicionado à fração ' + letra, 'Já podes entrar na app do condomínio com este email (recebes um código por email).');
    return { ok: true };
  });
}
