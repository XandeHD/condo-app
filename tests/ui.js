// Teste de interface: corre a página real (jsdom) contra o código do servidor simulado.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const { ctx, run, mails } = require('./harness');
const vm = require('vm');

run('setup()');
const manualHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'manual.html'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8').replace(/<link[^>]+googleapis[^>]*>/, '').replace("<?!= include_('manual') ?>", () => manualHtml);
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://x.test/', pretendToBeVisual: true, beforeParse(win) {
  win.scrollTo = () => {};
  const mk = (ok, ko) => new Proxy({}, {
    get(_, name) {
      if (name === 'withSuccessHandler') return (f) => mk(f, ko);
      if (name === 'withFailureHandler') return (f) => mk(ok, f);
      return (...args) => setTimeout(() => {
        try { const fn = vm.runInContext(String(name), ctx); const r = fn(...args); ok && ok(JSON.parse(JSON.stringify(r === undefined ? null : r))); }
        catch (e) { ko && ko(e); }
      }, 0);
    }
  });
  win.google = { script: { run: mk() } };
} });
const w = dom.window, d = w.document;
const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FALHOU:', m); } else console.log('ok  ', m); };
const text = () => d.getElementById('app').textContent.replace(/\s+/g, ' ');
const click = async (sel) => { const e = typeof sel === 'string' ? d.querySelector(sel) : sel; if (!e) throw new Error('Não encontrei ' + sel); e.click(); await wait(); };
const submit = async (sel) => { d.querySelector(sel).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(60); };
const byText = (sel, t) => Array.from(d.querySelectorAll(sel)).find(e => e.textContent.trim().includes(t));
const fill = (sel, v) => { const e = d.querySelector(sel); e.value = v; };

(async () => {
  await wait(80);
  ok(/Entrar/.test(text()) && d.querySelector('#email'), 'abre no ecrã de entrada');

  // Manual público (sem login) e completo
  await click('#manual');
  ok(/Manual da app/.test(text()) && !d.querySelector('nav.barra'), 'manual abre sem login');
  ok(/Admin Master \(chave de emergência\)/.test(text()) && /Quem pode o quê/.test(text()), 'manual sem login mostra a parte do Master e quem pode o quê');
  ok(/30 dias/.test(text()) && /6 meses/.test(text()), 'manual indica as sessões de 6 meses e 30 dias');
  fill('#q', 'impasse'); d.querySelector('#q').dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(d.querySelectorAll('[data-t]:not([hidden])').length >= 2 && d.querySelector('#s-dispositivos').hidden, 'pesquisa filtra secções');
  ok(/Administradores/.test(text()) && /2 vagas/.test(text()) && /Convocatórias/.test(text()) && /Recibos/.test(text()), 'manual documenta administradores, convocatórias e recibos');
  ok(d.querySelectorAll('.chip.aviso').length === w.MANUAL.secoes.filter(x => x.estado === 'breve').length, 'só as secções ainda não programadas levam a etiqueta "Em breve na app"');
  ok(d.querySelector('#imp'), 'botão de imprimir existe');
  await click('#v');
  ok(d.querySelector('#email'), 'voltar do manual regressa à entrada');

  // Master entra
  fill('#email', 'dono@gmail.com'); await submit('#f');
  ok(/Introduz o código/.test(text()), 'passa ao passo do código');
  const code = /é (\d{6})\./.exec(mails[mails.length - 1].body)[1];
  fill('#code', code); await submit('#f');
  ok(/Quem és\?/.test(text()), 'master é perguntado "Quem és?"');
  await click('[data-l="E"]'); fill('#nome', 'Marta'); await submit('#f');
  ok(/O que precisas de fazer/.test(text()) && /Marta, fração E/.test(text()), 'início do master mostra quem declarou');

  // Master adiciona emails à fração D
  await click('[data-go="fracoes"]');
  await click('[data-l="D"]');
  ok(/Fração D/.test(text()) && byText('button', 'Adicionar email'), 'detalhe da fração D com botão adicionar');
  await click('#add');
  d.querySelector('.folha input[name=email]').value = 'ana@exemplo.pt';
  d.querySelector('.folha input[name=motivo]').value = 'Primeiro registo';
  await click('[data-ok]'); await wait(80);
  ok(/ana@exemplo.pt/.test(text()), 'email adicionado aparece na lista');

  // Sair do master, entrar como ana
  await click('[data-nav="sair"]'); await wait(60);
  ok(d.querySelector('#email'), 'master terminou sessão');
  fill('#email', 'ana@exemplo.pt'); await submit('#f');
  fill('#code', /é (\d{6})\./.exec(mails[mails.length - 1].body)[1]); await submit('#f');
  await wait(150);
  ok(/Sessão da fração D/.test(text()) && /Atividade recente/.test(text()), 'ana entra e vê o início com atividade recente');
  ok(['inicio','fracoes','pagamentos','obras','resumo'].every(k => d.querySelector('[data-nav="'+k+'"]')), 'menu com os 5 separadores do design');
  ok(!/Quem és/.test(text()), 'condómino não passa por "Quem és?"');

  // Fração alheia é só leitura
  await click('[data-nav="fracoes"]'); await wait(60);
  await click('[data-l="G"]');
  ok(/Só a própria fração pode alterar/.test(text()) && !d.querySelector('#add') && !d.querySelector('[data-trocar]'), 'fração alheia sem botões de editar');

  // Pedido de entrada pelo ecrã público
  await click('[data-nav="inicio"]'); await wait(80);
  await click('[data-go="dispositivos"]'); await wait(80);
  ok(/Dispositivos ligados/.test(text()) && /Ativo agora/.test(text()), 'lista de dispositivos');
  // Pagamentos, quotas, recibos, administração, obras, resumo
  await click('[data-nav="pagamentos"]'); await wait(120);
  ok(/Pagamentos/.test(text()) && /quotas pagas/.test(text()) && d.querySelectorAll('.rowf').length === 8 && d.querySelector('#novo'), 'pagamentos: vista mensal com 8 frações');
  await click('#novo');
  ok(d.querySelector('.folha input[type=file]') && d.querySelector('.folha select[name=metodo]'), 'formulário de pagamento tem ficheiro e forma de pagamento');
  await click('[data-x]');
  await click('[data-go="quotas"]'); await wait(120);
  ok(/Quotas/.test(text()) && /Por definir/.test(text()), 'ecrã de quotas');
  await click('#v'); await wait(60);
  await click('[data-nav="inicio"]'); await wait(80);
  await click('[data-go="administracao"]'); await wait(120);
  ok(/Nomear-me administrador/.test(text()) && /Vaga livre/.test(text()), 'administração: vagas livres e botão de nomear');
  await click('#ser'); await wait(150);
  ok(/Sair do cargo de administrador/.test(text()) && /Enviar convocatória/.test(text()) && /Tu/.test(text()), 'ana tornou-se administradora e vê a convocatória');
  await click('[data-go="convocatoria"]'); await wait(120);
  ok(/Nova convocatória/.test(text()) && d.querySelector('#assunto') && /Enviar a todas as frações/.test(text()), 'ecrã de convocatória');
  await click('#v'); await wait(60);
  await click('[data-go="recibosadmin"]'); await wait(120);
  ok(/Todos os recibos/.test(text()) && d.querySelector('#verif'), 'todos os recibos (administrador)');
  await click('[data-nav="obras"]'); await wait(120);
  ok(/Obras e problemas/.test(text()) && d.querySelector('#novo') && /Registar obra/.test(text()), 'obras: separador com botão de registar');
  await click('[data-tab="problemas"]'); await wait(120);
  ok(/Reportar problema/.test(text()), 'problemas: separador com botão de reportar');
  await click('[data-nav="resumo"]'); await wait(120);
  ok(/Resumo anual/.test(text()) && /Cobrado/.test(text()) && d.querySelectorAll('.gr').length === 9, 'resumo anual com 8 frações');
  await click('[data-nav="inicio"]'); await wait(120);
  ok(/Em débito/.test(text()) && /Problemas abertos/.test(text()) && /Obras em curso/.test(text()), 'início tem os 4 números do design');
  console.log(fails ? `\n${fails} falhas` : '\nUI ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERRO', e.message); process.exit(1); });
