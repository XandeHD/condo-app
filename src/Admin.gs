/**
 * Administradores do condomínio: 2 vagas, de frações diferentes.
 * Qualquer condómino se pode nomear enquanto houver vaga; sai quando quiser;
 * um administrador pode remover o outro; o Admin Master só em caso grave, com motivo.
 */

const MAX_ADMINS = 2;

function adminsAtivos_() {
  return table_('Administradores').filter(function (r) { return r.ate === ''; });
}

function requireMember_(s) {
  if (s.isMaster) throw new Error('O Admin Master não tem acesso a esta área.');
  if (!s.fracao) throw new Error('Esta conta não pertence a nenhuma fração.');
}

function requireAdmin_(s) {
  requireMember_(s);
  if (!isAdmin_(s.email)) throw new Error('Só os administradores podem fazer isto.');
}

function api_admins(token) {
  const s = requireSession_(token);
  const ativos = adminsAtivos_();
  const souAdmin = !s.isMaster && ativos.some(function (a) { return a.email === s.email; });
  const fracaoOcupada = !!s.fracao && ativos.some(function (a) { return a.fracao === s.fracao; });
  const vagas = MAX_ADMINS - ativos.length;
  let motivoNao = '';
  if (!s.isMaster && !souAdmin) {
    if (vagas <= 0) motivoNao = 'As 2 vagas estão ocupadas.';
    else if (fracaoOcupada) motivoNao = 'A tua fração já tem um administrador. Os 2 têm de ser de frações diferentes.';
  }
  return {
    admins: ativos.map(function (a) { return { email: a.email, fracao: a.fracao, desde: Number(a.desde) }; }),
    vagas: vagas,
    souAdmin: souAdmin,
    podeNomear: !s.isMaster && !souAdmin && !motivoNao,
    motivoNaoNomear: motivoNao,
    podeRemover: souAdmin || (s.isMaster && !!s.quem)
  };
}

function api_becomeAdmin(token) {
  const s = requireSession_(token);
  requireMember_(s);
  return withLock_(function () {
    const ativos = adminsAtivos_();
    if (ativos.some(function (a) { return a.email === s.email; })) throw new Error('Já és administrador.');
    if (ativos.length >= MAX_ADMINS) throw new Error('As 2 vagas de administrador estão ocupadas.');
    if (ativos.some(function (a) { return a.fracao === s.fracao; })) {
      throw new Error('A tua fração já tem um administrador. Os 2 administradores têm de ser de frações diferentes.');
    }
    append_('Administradores', { email: s.email, fracao: s.fracao, desde: Date.now(), ate: '', nomeado_por: s.email, removido_por: '', motivo: '' });
    audit_(s, 'Administradores', s.email, 'cargo', '', 'administrador', 'Nomeação');
    aviso_('administracao', 'A fração ' + s.fracao + ' tem agora um administrador (' + s.email + ').', 'todos', s.email);
    return { ok: true };
  });
}

function api_leaveAdmin(token) {
  const s = requireSession_(token);
  requireMember_(s);
  return withLock_(function () {
    const r = adminsAtivos_().filter(function (a) { return a.email === s.email; })[0];
    if (!r) throw new Error('Não és administrador.');
    update_('Administradores', r._row, { ate: Date.now(), removido_por: s.email, motivo: 'Saiu do cargo' });
    audit_(s, 'Administradores', s.email, 'cargo', 'administrador', '', 'Saiu do cargo');
    aviso_('administracao', 'O administrador da fração ' + r.fracao + ' saiu do cargo. Há uma vaga livre.', 'todos', s.email);
    return { ok: true };
  });
}

/** Um administrador remove o outro. O Admin Master remove qualquer um, com motivo. */
function api_removeAdmin(token, email, motivo) {
  const s = requireSession_(token);
  return withLock_(function () {
    email = norm_(email);
    const r = adminsAtivos_().filter(function (a) { return a.email === email; })[0];
    if (!r) throw new Error('Esse email não é administrador.');
    if (s.isMaster) {
      requireMaster_(s);
      motivo = text_(motivo, 3, 200, 'O motivo');
    } else {
      requireAdmin_(s);
      if (email === s.email) throw new Error('Para saíres do cargo usa "Sair do cargo".');
      motivo = String(motivo || '').trim().slice(0, 200) || 'Removido pelo outro administrador';
    }
    update_('Administradores', r._row, { ate: Date.now(), removido_por: actor_(s), motivo: motivo });
    audit_(s, 'Administradores', email, 'cargo', 'administrador', '', motivo);
    aviso_('administracao', actor_(s) + ' removeu o administrador da fração ' + r.fracao + '. Motivo: ' + motivo, 'todos', actor_(s));
    sendMail_(email, 'Deixaste de ser administrador', 'Foste removido do cargo de administrador do condomínio por ' + actor_(s) + '.\nMotivo: ' + motivo);
    return { ok: true };
  });
}
