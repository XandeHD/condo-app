/**
 * Convocatórias: só administradores enviam; todos veem o histórico.
 * Vai um email por destinatário (ninguém vê os outros), com o PDF anexado.
 * As respostas vão para o administrador que enviou.
 */

function emailsTodasFracoes_() {
  const ativas = {};
  fracoesAtivas_().forEach(function (f) { ativas[f.letra] = true; });
  return emailsAtivos_().filter(function (e) { return ativas[e.fracao]; });
}

function api_convocatoriaInfo(token) {
  const s = requireSession_(token);
  requireMember_(s);
  const lista = emailsTodasFracoes_();
  const fr = {};
  lista.forEach(function (e) { fr[e.fracao] = true; });
  const hist = table_('Convocatorias').sort(function (a, b) { return Number(b.data_envio) - Number(a.data_envio); }).slice(0, 20).map(function (c) {
    return { id: c.id, data: Number(c.data_envio), enviadoPor: c.enviado_por, fracao: fracaoDe_(c.enviado_por), assunto: c.assunto, n: Number(c.n_emails), idDocumento: c.id_documento };
  });
  return { souAdmin: isAdmin_(s.email), nEmails: lista.length, nFracoes: Object.keys(fr).length, emails: isAdmin_(s.email) ? lista.map(function (e) { return { fracao: e.fracao, email: e.email }; }) : [], historico: hist };
}

function api_sendConvocatoria(token, assunto, reuniao, ficheiro) {
  const s = requireSession_(token);
  requireAdmin_(s);
  return withLock_(function () {
    assunto = text_(assunto, 3, 120, 'O assunto');
    reuniao = String(reuniao || '').trim().slice(0, 200);
    if (!ficheiro || !ficheiro.base64) throw new Error('Carrega o documento da convocatória (PDF).');
    if (ficheiro.mime !== 'application/pdf') throw new Error('A convocatória tem de ser um PDF.');
    if (String(ficheiro.base64).length > MAX_FICHEIRO_B64) throw new Error('O PDF é demasiado grande (máximo 5 MB).');
    const lista = emailsTodasFracoes_();
    if (!lista.length) throw new Error('Não há emails ativos para enviar.');
    const id = Utilities.getUuid();
    const nome = nomeSeguro_(ficheiro.nome).replace(/\.[^.]*$/, '') + '.pdf';
    const blob = Utilities.newBlob(Utilities.base64Decode(ficheiro.base64), 'application/pdf', nome);
    const doc = guardarDoc_(blob, 'Convocatoria', id, s);
    const corpo = 'Está convocado(a) para: ' + assunto + '.\n' + (reuniao ? 'Reunião: ' + reuniao + '.\n' : '') +
      '\nEm anexo o documento da convocatória.\nPara responder, responda a este email: a resposta segue para ' + s.email + '.\n' +
      'Pedimos que confirme a receção.';
    const enviados = [];
    lista.forEach(function (e) {
      if (sendMail_(e.email, 'Convocatória: ' + assunto, corpo, [blob], s.email)) enviados.push(e.email);
    });
    if (!enviados.length) throw new Error('Não foi possível enviar nenhum email. Tenta mais tarde.');
    append_('Convocatorias', { id: id, data_envio: Date.now(), enviado_por: s.email, assunto: assunto, mensagem: reuniao, id_documento: doc.id, destinatarios: enviados.join(','), n_emails: enviados.length });
    audit_(s, 'Convocatorias', id, 'envio', '', enviados.length + ' emails', 'Convocatória enviada');
    aviso_('convocatoria', 'Convocatória enviada: ' + assunto + (reuniao ? ' (' + reuniao + ')' : '') + '.', 'todos', s.email);
    return { ok: true, enviados: enviados.length, falhas: lista.length - enviados.length };
  });
}
