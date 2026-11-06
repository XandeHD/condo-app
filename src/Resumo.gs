/**
 * Números para o Início, a vista mensal de Pagamentos e o Resumo anual.
 * Pagamento multi-mês: o valor reparte-se por igual pelos meses pagos.
 * Em débito = quota devida até ao mês atual − pago (nunca negativo).
 */

function p2_(n) { return ('0' + n).slice(-2); }
function mesAtual_() { return Utilities.formatDate(new Date(), 'Europe/Lisbon', 'yyyy-MM'); }
function r2_(n) { return Math.round(n * 100) / 100; }

/** Quantos meses do ano já "venceram" (12 em anos passados, 0 em anos futuros). */
function mesesVencidos_(ano) {
  const a = mesAtual_();
  const ay = Number(a.slice(0, 4)), am = Number(a.slice(5, 7));
  return ano < ay ? 12 : (ano === ay ? am : 0);
}

/** { 'A': { '2026-11': 50, ... } } com os pagamentos não anulados. */
function pagoPorMes_() {
  const out = {};
  table_('Pagamentos').forEach(function (p) {
    if (isTrue_(p.anulado)) return;
    const meses = String(p.meses).split(',').filter(Boolean);
    if (!meses.length) return;
    const parte = Number(p.valor) / meses.length;
    out[p.fracao] = out[p.fracao] || {};
    meses.forEach(function (m) { out[p.fracao][m] = (out[p.fracao][m] || 0) + parte; });
  });
  return out;
}

function quotasDoAno_(ano) {
  const out = {};
  table_('Quotas').forEach(function (q) { if (Number(q.ano) === ano) out[q.fracao] = Number(q.valor_mensal); });
  return out;
}

function fracoesAtivas_() {
  return table_('Fracoes').filter(function (f) { return isTrue_(f.ativa); });
}

/** Linha de resumo de uma fração num ano. */
function resumoFracao_(f, ano, quotas, pago) {
  const q = quotas[f.letra];
  const mapa = pago[f.letra] || {};
  let pagoAno = 0, pagoVenc = 0;
  const venc = mesesVencidos_(ano);
  for (let m = 1; m <= 12; m++) {
    const v = mapa[ano + '-' + p2_(m)] || 0;
    pagoAno += v;
    if (m <= venc) pagoVenc += v;
  }
  const devido = q ? r2_(q * venc) : 0;
  return { letra: f.letra, nome: f.andar + ' ' + f.lado, quota: devido, pago: r2_(pagoAno), debito: q ? r2_(Math.max(0, devido - pagoVenc)) : 0, semQuota: !q };
}

function api_resumo(token, ano) {
  const s = requireSession_(token);
  requireMember_(s);
  ano = anoValido_(ano || Number(mesAtual_().slice(0, 4)));
  const quotas = quotasDoAno_(ano), pago = pagoPorMes_();
  const linhas = fracoesAtivas_().map(function (f) { return resumoFracao_(f, ano, quotas, pago); });
  return {
    ano: ano, linhas: linhas,
    cobrado: r2_(linhas.reduce(function (t, l) { return t + l.pago; }, 0)),
    emDebito: r2_(linhas.reduce(function (t, l) { return t + l.debito; }, 0)),
    emDia: linhas.filter(function (l) { return !l.semQuota && l.debito === 0; }).length,
    total: linhas.length
  };
}

/** Vista mensal: estado de cada fração num mês. */
function api_pagamentosMes(token, ano, mes) {
  const s = requireSession_(token);
  requireMember_(s);
  ano = anoValido_(ano); mes = Number(mes);
  if (!(mes >= 1 && mes <= 12) || mes % 1 !== 0) throw new Error('Mês inválido.');
  const chave = ano + '-' + p2_(mes);
  const quotas = quotasDoAno_(ano), pago = pagoPorMes_(), atual = mesAtual_();
  const linhas = fracoesAtivas_().map(function (f) {
    const q = quotas[f.letra], mapa = pago[f.letra] || {};
    const pagoMes = mapa[chave] || 0;
    let estado, nota, valor = null;
    if (pagoMes > 0) { estado = 'pago'; nota = 'Comprovativo anexado'; valor = r2_(pagoMes); }
    else if (!q) { estado = 'semquota'; nota = 'Quota por definir'; }
    else {
      valor = q;
      let falta = 0;
      for (let m = 1; m <= mes; m++) if (!(mapa[ano + '-' + p2_(m)] > 0)) falta++;
      if (chave < atual) { estado = 'atraso'; nota = falta + (falta === 1 ? ' mês em falta' : ' meses em falta'); }
      else { estado = 'porpagar'; nota = f.tipo === 'loja' ? 'Quota de loja' : 'Quota do mês'; }
    }
    return { letra: f.letra, nome: f.andar + ' ' + f.lado, estado: estado, nota: nota, valor: valor };
  });
  const pagas = linhas.filter(function (l) { return l.estado === 'pago'; });
  const esperado = linhas.reduce(function (t, l) { return t + (l.valor || 0); }, 0);
  return {
    ano: ano, mes: mes, linhas: linhas, nPagas: pagas.length, total: linhas.length,
    recebido: r2_(pagas.reduce(function (t, l) { return t + l.valor; }, 0)), esperado: r2_(esperado)
  };
}

/** Tudo o que o Início precisa numa só chamada. */
function api_home(token) {
  const s = requireSession_(token);
  requireMember_(s);
  const ano = Number(mesAtual_().slice(0, 4)), mes = Number(mesAtual_().slice(5, 7));
  const quotas = quotasDoAno_(ano), pago = pagoPorMes_(), fr = fracoesAtivas_();
  const linhas = fr.map(function (f) { return resumoFracao_(f, ano, quotas, pago); });
  const chave = ano + '-' + p2_(mes);
  const pagasMes = fr.filter(function (f) { return ((pago[f.letra] || {})[chave] || 0) > 0; }).length;
  const abertos = table_('Problemas').filter(function (p) { return p.estado !== 'Resolvido'; });
  const obras = table_('Obras').filter(function (o) { return o.estado === 'Em curso'; });
  const avisos = avisosVisiveis_(s).slice(0, 4).map(function (a) {
    const l = fracaoDe_(a.criadoPor);
    return { letra: l || (a.criadoPor ? '•' : '!'), texto: a.texto, data: a.data, tipo: a.tipo };
  });
  return {
    emDebito: r2_(linhas.reduce(function (t, l) { return t + l.debito; }, 0)),
    nEmDebito: linhas.filter(function (l) { return l.debito > 0; }).length,
    nFracoes: fr.length,
    pagasMes: pagasMes, mes: mes, ano: ano,
    problemasAbertos: abertos.length,
    problemasAltos: abertos.filter(function (p) { return p.prioridade === 'Alta'; }).length,
    obrasEmCurso: obras.length,
    vagasAdmin: MAX_ADMINS - adminsAtivos_().length,
    atividade: avisos
  };
}
