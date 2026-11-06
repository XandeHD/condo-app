const { run, mails, store } = require('./harness');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FALHOU:', m); } else console.log('ok  ', m); };
const throws = (code, re, m) => { try { run(code); fails++; console.log('FALHOU (não lançou):', m); } catch (e) { if (re.test(e.message)) console.log('ok  ', m, '→', e.message); else { fails++; console.log('FALHOU msg:', m, e.message); } } };
const lastCode = () => { const m = mails[mails.length - 1]; return /é (\d{6})\./.exec(m.body)[1]; };
const login = (email, dev) => { run(`api_requestCode('${email}')`); const c = lastCode(); return run(`api_verifyCode('${email}','${c}','${dev||'Chrome'}')`).token; };

run('setup()');
ok(store.Fracoes.length === 9, 'setup cria 8 frações');
ok(store.Config.some(r => r[0] === 'email_master' && r[1] === 'dono@gmail.com'), 'master = email de quem corre o setup (minúsculas)');
run('setup()'); ok(store.Fracoes.length === 9, 'setup é idempotente');

// Email desconhecido: resposta igual, nenhum email enviado
const n0 = mails.length; run("api_requestCode('estranho@x.pt')"); ok(mails.length === n0, 'email desconhecido não recebe código');

// Master entra
const tm = login('dono@gmail.com', 'Chrome · Windows');
let me = run(`api_me('${tm}')`);
ok(me.isMaster && me.needsWho, 'master precisa de dizer quem é');
throws(`api_addEmail('${tm}','D','ana@exemplo.pt','teste')`, /quem/i, 'master sem "quem" não edita');
run(`api_masterWho('${tm}','E','Marta')`);
throws(`api_addEmail('${tm}','D','ana@exemplo.pt','')`, /motivo/i, 'master precisa de motivo');
run(`api_addEmail('${tm}','D','ana@exemplo.pt','Primeiro registo')`);
run(`api_addEmail('${tm}','D','pedro@exemplo.pt','Primeiro registo')`);
throws(`api_addEmail('${tm}','D','outro@exemplo.pt','x y z')`, /2 emails/, 'máximo 2 emails por fração');
run(`api_addEmail('${tm}','G','rui@exemplo.pt','Primeiro registo')`);
throws(`api_addEmail('${tm}','H','ana@exemplo.pt','dup')`, /já está/, 'email único entre frações');
throws(`api_addEmail('${tm}','H','dono@gmail.com','master')`, /reservado/, 'email do master não vai para fração');
ok(store.Auditoria.some(r => r[2] === 'Marta, fração E'), 'auditoria guarda "quem" do master');

// Condómino D
const ta = login('ana@exemplo.pt');
me = run(`api_me('${ta}')`);
ok(!me.isMaster && me.fracao === 'D', 'ana pertence à fração D');
throws(`api_addEmail('${ta}','G','x@exemplo.pt','')`, /própria fração/, 'D não altera emails de G');
throws(`api_replaceEmail('${ta}','G','rui@exemplo.pt','x@exemplo.pt','')`, /própria fração/, 'D não troca emails de G');
run(`api_replaceEmail('${ta}','D','pedro@exemplo.pt','pedro2@exemplo.pt','Mudou de email')`);
let f = run(`api_fracao('${ta}','D')`);
ok(f.ativos.length === 2 && f.ativos.some(e => e.email === 'pedro2@exemplo.pt'), 'troca de email na própria fração');
ok(f.historico.length === 3 && f.historico.some(e => e.email === 'pedro@exemplo.pt' && e.ate), 'histórico guarda o email antigo com data de fim');
f = run(`api_fracao('${ta}','G')`); ok(f.podeEditar === false, 'fração alheia é só leitura');
const tg0 = login('rui@exemplo.pt');
throws(`api_removeEmail('${tg0}','G','rui@exemplo.pt','')`, /sem emails/, 'não deixa a fração com 0 emails');

// Pedido de entrada
run("api_requestEntry('novo@exemplo.pt','D')");
throws("api_requestEntry('novo@exemplo.pt','D')", /pendente/, 'pedido duplicado bloqueado');
const tg = login('rui@exemplo.pt');
ok(run(`api_pendingRequests('${tg}')`).length === 0, 'G não vê pedidos da D');
throws(`api_decideRequest('${tg}','${run(`api_pendingRequests('${login('pedro2@exemplo.pt')}')`)[0].id}',true,'')`, /própria fração/, 'G não decide pedidos da D');
const tp = login('pedro2@exemplo.pt');
const pend = run(`api_pendingRequests('${tp}')`);
ok(pend.length === 1, 'D vê o seu pedido pendente');
throws(`api_decideRequest('${tp}','${pend[0].id}',true,'')`, /2 emails/, 'aprovar com fração cheia pede espaço');

// Master só decide em impasse
run(`api_replaceEmail('${tp}','D','pedro2@exemplo.pt','pedro3@exemplo.pt','')`);
const tm2 = login('dono@gmail.com'); run(`api_masterWho('${tm2}','E','Marta')`);
throws(`api_decideRequest('${tm2}','${pend[0].id}',true,'motivo teste')`, /impasse/, 'master não decide fora de impasse');

// Remover email de D para ter espaço: remove pedro3 (D fica com ana)
const ta2 = login('ana@exemplo.pt');
run(`api_removeEmail('${ta2}','D','pedro3@exemplo.pt','Já não mora cá')`);
ok(run(`api_devices('${login('ana@exemplo.pt')}')`).length >= 2, 'ana tem dispositivos');
run(`api_decideRequest('${ta2}','${pend[0].id}',true,'')`);
ok(run(`api_me('${login('novo@exemplo.pt')}')`).fracao === 'D', 'pedido aprovado dá acesso à fração D');

// Sessão revogada ao sair da fração
throws(`api_me('${tp}')`, /expirada/, 'email removido perde a sessão');

// Impasse: fração H sem emails
run("api_requestEntry('marta@exemplo.pt','H')");
const ph = run(`api_pendingRequests('${tm2}')`);
ok(ph.length === 1 && /sem email válido/i.test(ph[0].motivoImpasse), 'master vê pedido em impasse (fração sem emails)');
throws(`api_decideRequest('${tm2}','${ph[0].id}',true,'')`, /motivo/i, 'master precisa de motivo ao decidir');
run(`api_decideRequest('${tm2}','${ph[0].id}',true,'Fração sem emails após venda')`);
ok(run(`api_me('${login('marta@exemplo.pt')}')`).fracao === 'H', 'master aprovou pedido em impasse');

// Código: tentativas
run("api_requestCode('ana@exemplo.pt')");
for (let i = 0; i < 5; i++) { try { run("api_verifyCode('ana@exemplo.pt','000000','x')"); } catch (e) {} }
throws(`api_verifyCode('ana@exemplo.pt','${lastCode()}','x')`, /tentativas|inválido/i, 'código bloqueia após 5 tentativas');

// Avisos
const av = run(`api_avisos('${ta2}')`);
ok(av.length > 0 && av.some(a => /Admin Master/.test(a.texto)), 'avisos incluem ações do master');
const nao = run(`api_me('${ta2}')`).avisosNaoLidos; run(`api_markAvisosRead('${ta2}')`);
ok(nao > 0 && run(`api_me('${ta2}')`).avisosNaoLidos === 0, 'marcar avisos como lidos');

// Fórmulas neutralizadas
run(`api_masterWho('${tm2}','E','=1+1')`).quem;
ok(!store.Dispositivos.some(r => String(r[6]).startsWith('=')), 'texto livre não vira fórmula');

// Terminar dispositivo
const devs = run(`api_devices('${ta2}')`);
const outro = devs.find(d => !d.este && !d.revogado);
run(`api_endDevice('${ta2}','${outro.id}')`);
ok(run(`api_devices('${ta2}')`).find(d => d.id === outro.id).revogado, 'terminar sessão noutro dispositivo');
console.log(fails ? `\n${fails} falhas` : '\nTudo ok');
process.exit(fails ? 1 : 0);
