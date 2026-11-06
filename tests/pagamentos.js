const { run, mails, store, files } = require('./harness');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FALHOU:', m); } else console.log('ok  ', m); };
const throws = (code, re, m) => { try { run(code); fails++; console.log('FALHOU (não lançou):', m); } catch (e) { if (re.test(e.message)) console.log('ok  ', m, '→', e.message); else { fails++; console.log('FALHOU msg:', m, e.message); } } };
const lastCode = () => /é (\d{6})\./.exec(mails[mails.length - 1].body)[1];
const login = (email) => { run(`api_requestCode('${email}')`); return run(`api_verifyCode('${email}','${lastCode()}','Chrome')`).token; };
const ficheiro = { nome: 'comprovativo.pdf', mime: 'application/pdf', base64: Buffer.from('PDF-teste').toString('base64') };
const F = JSON.stringify(ficheiro);
const hoje = new Date(); const p2 = n => ('0' + n).slice(-2);
const dataHoje = hoje.getFullYear() + '-' + p2(hoje.getMonth() + 1) + '-' + p2(hoje.getDate());
const ano = hoje.getFullYear();

run('setup()');
const tm = login('dono@gmail.com');
run(`api_masterWho('${tm}','E','Marta')`);
['A:ana@x.pt', 'A:ana2@x.pt', 'B:bruno@x.pt', 'C:carla@x.pt'].forEach(x => { const [l, e] = x.split(':'); run(`api_addEmail('${tm}','${l}','${e}','Registo inicial')`); });
const ta = login('ana@x.pt'), ta2 = login('ana2@x.pt'), tb = login('bruno@x.pt'), tc = login('carla@x.pt');

// Master sem acesso
throws(`api_payments('${tm}','A')`, /Master/, 'master não vê pagamentos');
throws(`api_myReceipts('${tm}')`, /Master/, 'master não vê recibos');

// Administradores
ok(run(`api_admins('${ta}')`).vagas === 2, 'há 2 vagas de administrador');
run(`api_becomeAdmin('${ta}')`);
throws(`api_becomeAdmin('${ta2}')`, /fraç/i, 'dois administradores não podem ser da mesma fração');
run(`api_becomeAdmin('${tb}')`);
throws(`api_becomeAdmin('${tc}')`, /vaga|máximo|2/i, 'máximo de 2 administradores');
ok(run(`api_admins('${ta}')`).admins.length === 2, 'lista tem 2 administradores');

// Quotas
run(`api_setQuota('${ta}',${ano},'A',45,'Ata 1','', '')`);
throws(`api_setQuota('${ta}',${ano},'A',50,'Ata 2','', '')`, /motivo/i, 'alterar quota exige motivo');
run(`api_setQuota('${ta}',${ano},'A',50,'Ata 2','', 'Aprovado em reunião')`);
ok(run(`api_quotas('${tb}',${ano})`).fracoes.find(f => f.letra === 'A').valor === 50, 'quota visível a outros condóminos');

// Pagamentos
throws(`api_addPayment('${tc}','C','${dataHoje}',50,'${ano}-01',1,'MB Way','',null)`, /comprovativo/i, 'comprovativo obrigatório');
throws(`api_addPayment('${tc}','C','${dataHoje}',50,'${ano}-01',1,'Bitcoin','',${F})`, /forma/i, 'forma de pagamento inválida');
throws(`api_addPayment('${tc}','C','2999-01-01',50,'${ano}-01',1,'MB Way','',${F})`, /futuro/i, 'data futura recusada');
throws(`api_addPayment('${tc}','C','${dataHoje}',50,'${ano}-01',1,'MB Way','',{nome:'a.exe',mime:'application/x-msdownload',base64:'AAAA'})`, /PDF/i, 'tipo de ficheiro recusado');
throws(`api_addPayment('${tc}','D','${dataHoje}',50,'${ano}-01',1,'MB Way','',${F})`, /tua fração/i, 'condómino não regista pagamento de outra fração');
const r = run(`api_addPayment('${tc}','C','${dataHoje}',100,'${ano}-11',3,'MB Way','Nov a Jan',${F})`);
let pg = run(`api_payments('${tb}','C')`);
ok(pg.length === 1 && pg[0].meses.join() === `${ano}-11,${ano + 1}-01`.replace(',', ',') || pg[0].meses.length === 3, 'pagamento com 3 meses, a passar o ano');
ok(pg[0].meses[2] === (ano + 1) + '-01', 'meses atravessam o fim do ano');
ok(run(`api_getProof('${tb}','${r.id}')`).base64 === ficheiro.base64, 'comprovativo descarrega');
ok(Object.keys(files).length === 1, 'ficheiro ficou no Drive');

// Recibos
throws(`api_issueReceipt('${tc}','${r.id}')`, /administrador/i, 'condómino normal não emite recibo');
const rc = run(`api_issueReceipt('${ta}','${r.id}')`);
ok(rc.label === `${ano}/0001`, 'primeiro recibo do ano = 0001');
throws(`api_issueReceipt('${ta}','${r.id}')`, /já tem recibo/, 'não há dois recibos para o mesmo pagamento');
throws(`api_annulPayment('${tc}','${r.id}','engano')`, /recibo/i, 'pagamento com recibo não se anula');
ok(run(`api_myReceipts('${tc}')`).length === 1, 'carla vê o seu recibo');
ok(run(`api_myReceipts('${ta2}')`).length === 0, 'condómino de outra fração não vê recibos');
throws(`api_getReceiptPdf('${ta2}','${rc.key}')`, /acesso/i, 'condómino de outra fração não descarrega recibo alheio');
ok(run(`api_getReceiptPdf('${tc}','${rc.key}')`).mime === 'application/pdf', 'carla descarrega o PDF');
ok(run(`api_verifyReceipt('${tb}','${run(`api_myReceipts('${tc}')`)[0].codigo}')`).valido === true, 'código de verificação confirma recibo');

// Segundo pagamento: a numeração segue
const r2 = run(`api_addPayment('${tb}','B','${dataHoje}',40,'${ano}-11',1,'Numerário','',${F})`);
ok(run(`api_issueReceipt('${tb}','${r2.id}')`).label === `${ano}/0002`, 'segundo recibo = 0002');

// Envio: só emails ainda ativos
let n0 = mails.length;
let env = run(`api_sendReceipt('${ta}','${rc.key}')`);
ok(env.enviados === 1 && mails.length === n0 + 1 && mails[mails.length - 1].to === 'carla@x.pt' && mails[mails.length - 1].attachments.length === 1, 'recibo enviado com anexo ao email ativo');
// carla sai da fração C → o recibo já não vai para ela
run(`api_addEmail('${tm}','C','novo@x.pt','Nova pessoa')`);
run(`api_removeEmail('${tm}','C','carla@x.pt','Saiu')`);
n0 = mails.length;
throws(`api_sendReceipt('${ta}','${rc.key}')`, /ativo/i, 'se nenhum email original está ativo, não envia');
ok(mails.length === n0, 'nenhum email enviado ao antigo morador');
const tn = login('novo@x.pt');
ok(run(`api_myReceipts('${tn}')`).length === 0, 'novo morador não vê recibo anterior à sua entrada');
const todos = run(`api_allReceipts('${ta}','',''`.replace(/'',''$/, "'',''") + ')');
ok(todos.length === 2 && todos.find(x => x.fracao === 'C').bloqueados.includes('carla@x.pt'), 'admin vê quem ficou bloqueado');

// Anular recibo → depois o pagamento
throws(`api_annulReceipt('${ta}','${rc.key}','')`, /motivo/i, 'anular recibo exige motivo');
run(`api_annulReceipt('${ta}','${rc.key}','Valor errado')`);
run(`api_annulPayment('${tn}','${r.id}','Valor errado')`);
ok(run(`api_payments('${tn}','C')`)[0].anulado === true, 'pagamento anulado mantém-se na lista');

ok(run(`api_addPayment('${tb}','C','${dataHoje}',10,'${ano}-02',1,'MB Way','',${F})`).ok, 'administrador regista pagamento de qualquer fração');

process.exit(fails ? 1 : (console.log('\nPagamentos ok'), 0));
