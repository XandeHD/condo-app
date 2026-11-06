/**
 * Recibos de quitação (NÃO são faturas). Só os Administradores emitem, enviam e anulam.
 * Numeração sequencial por ano (ano/NNNN), nunca reutilizada (os anulados contam).
 * Cada recibo guarda os emails da fração à data da emissão (emails_na_altura):
 * só esses emails o veem, e o envio só vai para os que ainda estão ativos na fração.
 */

function reciboKey_(r) { return r.ano + '-' + r.numero; }
function reciboLabel_(r) { return r.ano + '/' + ('000' + r.numero).slice(-4); }

function reciboPorKey_(key) {
  const m = /^(\d{4})-(\d+)$/.exec(String(key || ''));
  if (!m) throw new Error('Recibo inválido.');
  const r = table_('Recibos').filter(function (x) { return String(x.ano) === m[1] && String(x.numero) === String(Number(m[2])); })[0];
  if (!r) throw new Error('Recibo não encontrado.');
  return r;
}

function listaEmails_(txt) {
  return String(txt || '').split(',').map(function (e) { return norm_(e); }).filter(Boolean);
}

function reciboPublico_(r) {
  const ativos = emailsAtivos_(r.fracao).map(function (e) { return e.email; });
  const destinos = listaEmails_(r.emails_na_altura).filter(function (e) { return ativos.indexOf(e) >= 0; });
  const bloqueados = listaEmails_(r.emails_na_altura).filter(function (e) { return ativos.indexOf(e) < 0; });
  return {
    key: reciboKey_(r), label: reciboLabel_(r), fracao: r.fracao, data: Number(r.data), valor: Number(r.valor),
    periodo: r.periodo, forma: r.forma_pagamento, emitidoPor: r.emitido_por, codigo: r.codigo_verificacao,
    anulado: isTrue_(r.anulado), motivo: r.motivo_anulacao, destinos: destinos, bloqueados: bloqueados
  };
}

function podeVerRecibo_(s, r) {
  return isAdmin_(s.email) || (r.fracao === s.fracao && listaEmails_(r.emails_na_altura).indexOf(s.email) >= 0);
}

function periodoTexto_(meses) {
  const l = String(meses).split(',');
  return l.length === 1 ? l[0] : l[0] + ' a ' + l[l.length - 1];
}

function esc_(t) {
  return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

function reciboHtml_(r, nomePredio, nipc) {
  const dataTxt = Utilities.formatDate(new Date(Number(r.data)), 'Europe/Lisbon', 'dd/MM/yyyy');
  return '<html><body style="font-family:Arial,sans-serif;color:#222;padding:24px">' +
    '<h2 style="margin:0">' + esc_(nomePredio) + '</h2>' +
    (nipc ? '<div>NIPC: ' + esc_(nipc) + '</div>' : '') +
    '<h1 style="margin:24px 0 4px">Recibo de quitação n.º ' + esc_(reciboLabel_(r)) + '</h1>' +
    '<div style="color:#666;margin-bottom:16px">Este documento é um recibo de quitação de quotas do condomínio. Não é uma fatura.</div>' +
    '<table style="border-collapse:collapse;width:100%">' +
    '<tr><td style="padding:6px;border:1px solid #ccc">Fração</td><td style="padding:6px;border:1px solid #ccc">' + esc_(r.fracao) + '</td></tr>' +
    '<tr><td style="padding:6px;border:1px solid #ccc">Data do pagamento</td><td style="padding:6px;border:1px solid #ccc">' + dataTxt + '</td></tr>' +
    '<tr><td style="padding:6px;border:1px solid #ccc">Período</td><td style="padding:6px;border:1px solid #ccc">' + esc_(r.periodo) + '</td></tr>' +
    '<tr><td style="padding:6px;border:1px solid #ccc">Forma de pagamento</td><td style="padding:6px;border:1px solid #ccc">' + esc_(r.forma_pagamento) + '</td></tr>' +
    '<tr><td style="padding:6px;border:1px solid #ccc"><b>Valor recebido</b></td><td style="padding:6px;border:1px solid #ccc"><b>' + Number(r.valor).toFixed(2) + ' €</b></td></tr>' +
    '</table>' +
    '<p style="margin-top:24px">Emitido por: ' + esc_(r.emitido_por) + '<br>Código de verificação: <b>' + esc_(r.codigo_verificacao) + '</b></p>' +
    '</body></html>';
}

function api_issueReceipt(token, idPagamento) {
  const s = requireSession_(token);
  requireAdmin_(s);
  return withLock_(function () {
    const p = table_('Pagamentos').filter(function (x) { return x.id === idPagamento; })[0];
    if (!p) throw new Error('Pagamento não encontrado.');
    if (isTrue_(p.anulado)) throw new Error('Não se emite recibo de um pagamento anulado.');
    if (reciboAtivoDe_(idPagamento)) throw new Error('Este pagamento já tem recibo.');

    const ano = new Date(Number(p.data)).getFullYear();
    const todos = table_('Recibos').filter(function (r) { return Number(r.ano) === ano; });
    const numero = todos.reduce(function (m, r) { return Math.max(m, Number(r.numero)); }, 0) + 1;
    const emails = emailsAtivos_(p.fracao).map(function (e) { return e.email; });
    if (!emails.length) throw new Error('A fração não tem emails ativos.');
    const codigo = hash_(ano + '-' + numero + '-' + idPagamento + '-' + Date.now()).slice(0, 8).toUpperCase();

    const rec = {
      numero: numero, ano: ano, id_pagamento: idPagamento, fracao: p.fracao, data: Number(p.data), valor: Number(p.valor),
      periodo: periodoTexto_(p.meses), forma_pagamento: p.metodo, emitido_por: s.email, emails_na_altura: emails.join(','),
      codigo_verificacao: codigo, id_pdf: '', anulado: false, motivo_anulacao: ''
    };
    const html = reciboHtml_(rec, cfg_('nome_predio') || 'Condomínio Rua da Misericórdia 13/15/17', cfg_('nipc'));
    const pdf = Utilities.newBlob(html, 'text/html', 'Recibo ' + reciboLabel_(rec) + '.html').getAs('application/pdf').setName('Recibo ' + ano + '-' + ('000' + numero).slice(-4) + '.pdf');
    const doc = guardarDoc_(pdf, 'Recibo', ano + '-' + numero, s);
    rec.id_pdf = doc.id;
    append_('Recibos', rec);
    audit_(s, 'Recibos', ano + '-' + numero, 'emissao', '', reciboLabel_(rec), 'Recibo emitido');
    aviso_('recibo', 'Recibo ' + reciboLabel_(rec) + ' emitido para a fração ' + p.fracao + '.', 'fracao:' + p.fracao, s.email);
    return { ok: true, key: reciboKey_(rec), label: reciboLabel_(rec) };
  });
}

function api_myReceipts(token) {
  const s = requireSession_(token);
  requireMember_(s);
  return table_('Recibos')
    .filter(function (r) { return podeVerRecibo_(s, r); })
    .sort(function (a, b) { return Number(b.data) - Number(a.data); })
    .map(function (r) { const x = reciboPublico_(r); delete x.destinos; delete x.bloqueados; return x; });
}

function api_allReceipts(token, mes, letra) {
  const s = requireSession_(token);
  requireAdmin_(s);
  return table_('Recibos')
    .filter(function (r) {
      if (letra && r.fracao !== letra) return false;
      if (mes && Utilities.formatDate(new Date(Number(r.data)), 'Europe/Lisbon', 'yyyy-MM') !== mes) return false;
      return true;
    })
    .sort(function (a, b) { return Number(b.data) - Number(a.data); })
    .slice(0, 200)
    .map(reciboPublico_);
}

function api_getReceiptPdf(token, key) {
  const s = requireSession_(token);
  requireMember_(s);
  const r = reciboPorKey_(key);
  if (!podeVerRecibo_(s, r)) throw new Error('Não tens acesso a este recibo.');
  audit_(s, 'Recibos', key, 'descarga', '', 'pdf', 'Descarga do recibo');
  return docBase64_(r.id_pdf);
}

function api_verifyReceipt(token, codigo) {
  const s = requireSession_(token);
  requireMember_(s);
  const c = String(codigo || '').trim().toUpperCase();
  if (c.length < 6) throw new Error('Código inválido.');
  const r = table_('Recibos').filter(function (x) { return String(x.codigo_verificacao).toUpperCase() === c; })[0];
  if (!r) return { valido: false };
  return { valido: !isTrue_(r.anulado), anulado: isTrue_(r.anulado), label: reciboLabel_(r), fracao: r.fracao, valor: Number(r.valor), periodo: r.periodo };
}

function api_sendReceipt(token, key) {
  const s = requireSession_(token);
  requireAdmin_(s);
  const r = reciboPorKey_(key);
  if (isTrue_(r.anulado)) throw new Error('Recibo anulado.');
  const destinos = reciboPublico_(r).destinos;
  if (!destinos.length) throw new Error('Nenhum dos emails deste recibo está ainda ativo na fração. Não foi enviado.');
  const pdf = DriveApp.getFileById(table_('Documentos').filter(function (d) { return d.id === r.id_pdf; })[0].id_drive).getBlob();
  let enviados = 0;
  destinos.forEach(function (e) {
    if (sendMail_(e, 'Recibo ' + reciboLabel_(r), 'Em anexo o recibo de quitação ' + reciboLabel_(r) + ' da fração ' + r.fracao + '.', [pdf])) enviados++;
  });
  audit_(s, 'Recibos', key, 'envio', '', destinos.join(','), 'Recibo enviado por email');
  return { ok: true, enviados: enviados, destinos: destinos };
}

function api_annulReceipt(token, key, motivo) {
  const s = requireSession_(token);
  requireAdmin_(s);
  return withLock_(function () {
    motivo = text_(motivo, 3, 200, 'O motivo');
    const r = reciboPorKey_(key);
    if (isTrue_(r.anulado)) throw new Error('Este recibo já está anulado.');
    update_('Recibos', r._row, { anulado: true, motivo_anulacao: motivo });
    audit_(s, 'Recibos', key, 'anulado', false, true, motivo);
    aviso_('recibo', 'Recibo ' + reciboLabel_(r) + ' anulado por ' + s.email + '. Motivo: ' + motivo, 'fracao:' + r.fracao, s.email);
    return { ok: true };
  });
}
