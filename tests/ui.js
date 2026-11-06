// Teste de interface: corre a página real (jsdom) contra o código do servidor simulado.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const { ctx, run, mails } = require('./harness');
const vm = require('vm');

run('setup()');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8').replace(/<link[^>]+googleapis[^>]*>/, '');
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
  ok(/Olá/.test(text()) && /Fração D/.test(text()), 'ana entra e vê a sua fração');
  ok(!/Quem és/.test(text()), 'condómino não passa por "Quem és?"');

  // Fração alheia é só leitura
  await click('[data-nav="fracoes"]'); await wait(60);
  await click('[data-l="G"]');
  ok(/Só a própria fração pode alterar/.test(text()) && !d.querySelector('#add') && !d.querySelector('[data-trocar]'), 'fração alheia sem botões de editar');

  // Pedido de entrada pelo ecrã público
  await click('[data-nav="dispositivos"]'); await wait(60);
  ok(/Dispositivos ligados/.test(text()) && /Ativo agora/.test(text()), 'lista de dispositivos');
  console.log(fails ? `\n${fails} falhas` : '\nUI ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERRO', e.message); process.exit(1); });
