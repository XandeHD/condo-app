// Pré-visualização local: serve a app real com o servidor simulado (dados de exemplo) para tirar capturas.
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');
const { ctx, run, mails } = require('./harness');
const lastCode = () => /é (\d{6})\./.exec(mails[mails.length - 1].body)[1];
const login = (email) => { run(`api_requestCode('${email}')`); return run(`api_verifyCode('${email}','${lastCode()}','Chrome')`).token; };
run('setup()');
const tm = login('dono@gmail.com'); run(`api_masterWho('${tm}','E','Marta')`);
[['A','loja.a@x.pt'],['B','bruno@x.pt'],['C','carla@x.pt'],['D','ana@exemplo.pt'],['D','pedro@exemplo.pt'],['E','eva@x.pt'],['F','carlos@x.pt'],['G','rui@exemplo.pt'],['H','hugo@x.pt']].forEach(([l,e]) => run(`api_addEmail('${tm}','${l}','${e}','Registo')`));
const ta = login('ana@exemplo.pt'), tr = login('rui@exemplo.pt'), tb = login('bruno@x.pt');
run(`api_becomeAdmin('${tr}')`);
const d = new Date(), ano = d.getFullYear(), mes = d.getMonth() + 1, p2 = n => ('0' + n).slice(-2);
const hoje = `${ano}-${p2(mes)}-${p2(d.getDate())}`;
['A:35','B:35','C:50','D:50','E:50','F:50','G:50','H:50'].forEach(x => { const [l,v] = x.split(':'); run(`api_setQuota('${ta}',${ano},'${l}',${v},'Assembleia','','')`); });
const f = JSON.stringify({ nome: 'c.pdf', mime: 'application/pdf', base64: 'UERG' });
const pay = (t, l, v, n) => run(`api_addPayment('${t}','${l}','${hoje}',${v},'${ano}-${p2(mes)}',${n},'Transferência','',${f})`);
const p1 = pay(ta, 'D', 50, 1); pay(tb, 'B', 35, 1); pay(tr, 'G', 100, 2);
run(`api_issueReceipt('${tr}','${p1.id}')`);
const o = run(`api_addObra('${tr}','Reparação do telhado','Telhas novas','Telhados Lda','${hoje}','1200','2028-10',null)`);
run(`api_addObra('${tr}','Pintura das escadas','','','2025-05-10','2400','2027-06',null)`);
run(`api_concluirObra('${tr}', '${run(`api_obras('${tr}')`).find(x=>x.titulo==='Pintura das escadas').id}','2025-06-20','2400','2027-06')`);
const pr = run(`api_addProblema('${tr}','Infiltração na garagem','','Garagem · junto à rampa','Alta')`);
run(`api_addProblema('${tr}','Luz da escada fundida','','2º andar · escada','Média')`);
run(`api_addProblema('${tb}','Porta de entrada a ranger','','Entrada do prédio','Baixa')`);
run(`api_addComment('${ta}','Problema','${pr.id}','Já chamei o canalizador')`);
const manualHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'manual.html'), 'utf8');
const stub = `<script>window.google={script:{run:(function mk(ok,ko){return new Proxy({},{get(_,n){if(n==='withSuccessHandler')return f=>mk(f,ko);if(n==='withFailureHandler')return f=>mk(ok,f);return (...a)=>{fetch('/rpc',{method:'POST',body:JSON.stringify({fn:n,args:a})}).then(r=>r.json()).then(r=>r.error?ko&&ko({message:r.error}):ok&&ok(r.value));};}});})()}};</script>`;
const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8').replace("<?!= include_('manual') ?>", () => manualHtml).replace('<body>', '<body>' + stub);
http.createServer((req, res) => {
  if (req.method === 'POST') { let b = ''; req.on('data', c => b += c); req.on('end', () => { const { fn, args } = JSON.parse(b); let out; try { const v = vm.runInContext(fn, ctx)(...args); out = { value: JSON.parse(JSON.stringify(v === undefined ? null : v)) }; } catch (e) { out = { error: e.message }; } res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out)); }); return; }
  if (req.url === '/tokens') { res.end(JSON.stringify({ ana: ta, rui: tr, master: tm })); return; }
  res.setHeader('content-type', 'text/html'); res.end(page);
}).listen(8765, () => console.log('preview em http://localhost:8765'));
