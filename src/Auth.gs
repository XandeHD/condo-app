/**
 * Login por email + código de 6 dígitos, sessões por dispositivo.
 * Todas as funções api_* são chamadas pelo browser (google.script.run).
 */

function emailsAtivos_(letra) {
  return table_('Emails_Fracao').filter(function (r) {
    return r.data_fim === '' && (letra === undefined || r.fracao === letra);
  });
}

function fracaoDe_(email) {
  const r = emailsAtivos_().filter(function (x) { return x.email === email; })[0];
  return r ? r.fracao : '';
}

function isMaster_(email) {
  const m = norm_(cfg_('email_master'));
  return !!m && m === email;
}

function isAdmin_(email) {
  return table_('Administradores').some(function (r) { return r.email === email && r.ate === ''; });
}

function dispositivoId_(d) { return String(d.token_hash).slice(0, 12); }

/** Valida o token e devolve o contexto da sessão. */
function requireSession_(token) {
  if (!token) throw new Error('Sessão expirada. Entra outra vez.');
  const h = hash_(token);
  const d = table_('Dispositivos').filter(function (r) {
    return r.token_hash === h && !isTrue_(r.revogado);
  })[0];
  if (!d) throw new Error('Sessão expirada. Entra outra vez.');
  const idle = Date.now() - Number(d.ultimo_uso);
  const email = d.email;
  const master = isMaster_(email);
  const dias = master ? SESSION_DAYS_MASTER : SESSION_DAYS;
  if (idle > dias * DAY_MS) throw new Error('Sessão expirada. Entra outra vez.');
  if (idle > 60 * MIN_MS) update_('Dispositivos', d._row, { ultimo_uso: Date.now() });
  return {
    email: email,
    fracao: master ? '' : fracaoDe_(email),
    isMaster: master,
    quem: d.quem || '',
    deviceRow: d._row,
    deviceId: dispositivoId_(d)
  };
}

function requireMaster_(s) {
  if (!s.isMaster) throw new Error('Só o Admin Master pode fazer isto.');
  if (!s.quem) throw new Error('Diz-nos primeiro quem és.');
}

function actor_(s) {
  if (!s) return 'visitante';
  return s.isMaster ? 'Admin Master (' + s.quem + ')' : s.email;
}

/** Pede um código. Responde sempre igual, para não revelar que emails existem. */
function api_requestCode(email) {
  email = validEmail_(email);
  return withLock_(function () {
    if (!isMaster_(email) && !fracaoDe_(email)) return { ok: true };
    const t = Date.now();
    const todos = table_('Codigos_Login');
    const recentes = todos.filter(function (r) { return Number(r.validade) - CODE_MIN * MIN_MS > t - 60 * MIN_MS; });
    if (recentes.length >= 40) throw new Error('Muitos pedidos de código. Tenta daqui a pouco.');
    if (recentes.filter(function (r) { return r.email === email; }).length >= 5) {
      throw new Error('Já enviámos vários códigos. Espera alguns minutos.');
    }
    todos.filter(function (r) { return r.email === email && !isTrue_(r.usado); })
      .forEach(function (r) { update_('Codigos_Login', r._row, { usado: true }); });
    const code = code6_();
    append_('Codigos_Login', { email: email, codigo_hash: hash_(email + ':' + code), validade: t + CODE_MIN * MIN_MS, usado: false, tentativas: 0 });
    sendMail_(email, 'O teu código de entrada: ' + code,
      'O teu código é ' + code + '.\n\nÉ válido durante ' + CODE_MIN + ' minutos e só pode ser usado uma vez.\n' +
      'Se não foste tu, ignora este email.');
    return { ok: true };
  });
}

/** Troca o código por uma sessão neste dispositivo. */
function api_verifyCode(email, code, deviceName) {
  email = validEmail_(email);
  code = String(code || '').replace(/\D/g, '');
  return withLock_(function () {
    const t = Date.now();
    const rows = table_('Codigos_Login').filter(function (r) {
      return r.email === email && !isTrue_(r.usado) && Number(r.validade) > t;
    });
    const row = rows[rows.length - 1];
    if (!row) throw new Error('Código inválido ou expirado. Pede um novo.');
    if (Number(row.tentativas) >= CODE_MAX_TRIES) {
      update_('Codigos_Login', row._row, { usado: true });
      throw new Error('Demasiadas tentativas. Pede um novo código.');
    }
    if (hash_(email + ':' + code) !== row.codigo_hash) {
      update_('Codigos_Login', row._row, { tentativas: Number(row.tentativas) + 1 });
      throw new Error('Código errado.');
    }
    update_('Codigos_Login', row._row, { usado: true });

    const token = newToken_();
    const anteriores = table_('Dispositivos').filter(function (r) { return r.email === email; });
    append_('Dispositivos', {
      email: email, token_hash: hash_(token), nome_dispositivo: String(deviceName || 'Dispositivo').slice(0, 60),
      criado_em: t, ultimo_uso: t, revogado: false, quem: ''
    });
    if (anteriores.length > 0) {
      const frac = isMaster_(email) ? '' : fracaoDe_(email);
      aviso_('dispositivo',
        frac ? 'Novo dispositivo a entrar na fração ' + frac + ' (' + String(deviceName || 'Dispositivo').slice(0, 60) + '). Não foste tu? Termina a sessão em Dispositivos.'
             : 'O Admin Master iniciou sessão num dispositivo novo.',
        frac ? 'fracao:' + frac : 'todos', email);
    }
    return { token: token };
  });
}

function api_logout(token) {
  const s = requireSession_(token);
  update_('Dispositivos', s.deviceRow, { revogado: true });
  return { ok: true };
}

/** Só para o Admin Master: declara quem é (fica no registo de tudo o que fizer). */
function api_masterWho(token, letra, nome) {
  const s = requireSession_(token);
  if (!s.isMaster) throw new Error('Só o Admin Master faz isto.');
  letra = String(letra || '').toUpperCase();
  if (!table_('Fracoes').some(function (f) { return f.letra === letra; })) throw new Error('Escolhe a tua fração.');
  nome = text_(nome, 2, 40, 'O nome');
  const quem = nome + ', fração ' + letra;
  update_('Dispositivos', s.deviceRow, { quem: quem });
  aviso_('master', 'O Admin Master entrou (' + quem + ').', 'todos', 'Admin Master (' + quem + ')');
  audit_({ email: s.email, quem: quem }, 'Dispositivos', s.deviceId, 'quem', '', quem, 'Login do Admin Master');
  return { ok: true, quem: quem };
}

function api_me(token) {
  const s = requireSession_(token);
  const avisos = avisosVisiveis_(s);
  const out = {
    email: s.email,
    fracao: s.fracao,
    isMaster: s.isMaster,
    quem: s.quem,
    needsWho: s.isMaster && !s.quem,
    isAdmin: s.isMaster ? false : isAdmin_(s.email),
    avisosNaoLidos: avisos.filter(function (a) { return !a.lido; }).length,
    pedidosPendentes: pedidosVisiveis_(s).length
  };
  if (s.fracao) out.fracaoInfo = fracaoInfo_(s.fracao);
  return out;
}

function api_devices(token) {
  const s = requireSession_(token);
  return table_('Dispositivos')
    .filter(function (r) { return r.email === s.email; })
    .sort(function (a, b) { return Number(b.ultimo_uso) - Number(a.ultimo_uso); })
    .map(function (r) {
      return { id: dispositivoId_(r), nome: r.nome_dispositivo, ultimoUso: Number(r.ultimo_uso), revogado: isTrue_(r.revogado), este: dispositivoId_(r) === s.deviceId };
    });
}

function api_endDevice(token, id) {
  const s = requireSession_(token);
  const d = table_('Dispositivos').filter(function (r) { return r.email === s.email && dispositivoId_(r) === id; })[0];
  if (!d) throw new Error('Dispositivo não encontrado.');
  update_('Dispositivos', d._row, { revogado: true });
  return { ok: true };
}
