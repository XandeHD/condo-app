const { run, mails, store, files } = require('./harness');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FALHOU:', m); } else console.log('ok  ', m); };
const throws = (code, re, m) => { try { run(code); fails++; console.log('FALHOU (não lançou):', m); } catch (e) { if (re.test(e.message)) console.log('ok  ', m, '→', e.message); else { fails++; console.log('FALHOU msg:', m, e.message); } } };
const lastCode = () => /é (\d{6})\./.exec(mails[mails.length - 1].body)[1];
const login = (email) => { run(`api_requestCode('${email}')`); return run(`api_verifyCode('${email}','${lastCode()}','Chrome')`).token; };
const pdf = JSON.stringify({ nome: 'conv.pdf', mime: 'application/pdf', base64: Buffer.from('PDF').toString('base64') });
const img = JSON.stringify({ nome: 'foto.jpg', mime: 'image/jpeg', base64: Buffer.from('IMG').toString('base64') });
const d = new Date(); const ano = d.getFullYear(), mes = d.getMonth() + 1; const p2 = n => ('0' + n).slice(-2);
const hoje = `${ano}-${p2(mes)}-${p2(d.getDate())}`;
const mesStr = `${ano}-${p2(mes)}`;

run('setup()');
const tm = login('dono@gmail.com'); run(`api_masterWho('${tm}','E','Marta')`);
[['A', 'ana@x.pt'], ['B', 'bruno@x.pt'], ['C', 'carla@x.pt'], ['C', 'carla2@x.pt']].forEach(([l, e]) => run(`api_addEmail('${tm}','${l}','${e}','Registo')`));
const ta = login('ana@x.pt'), tb = login('bruno@x.pt'), tc = login('carla@x.pt');
run(`api_becomeAdmin('${ta}')`);

// quotas e resumo
run(`api_setQuota('${ta}',${ano},'A',35,'Ata','','')`);
run(`api_setQuota('${ta}',${ano},'C',50,'Ata','','')`);
let m = run(`api_pagamentosMes('${tb}',${ano},${mes})`);
ok(m.linhas.length === 8 && m.nPagas === 0, 'mês sem pagamentos: 0 pagas');
ok(m.linhas.find(l => l.letra === 'A').estado === 'porpagar', 'mês atual sem pagamento = por pagar');
ok(m.linhas.find(l => l.letra === 'B').estado === 'semquota', 'sem quota definida = por definir');
const f = JSON.stringify({ nome: 'c.pdf', mime: 'application/pdf', base64: 'UERG' });
run(`api_addPayment('${tc}','C','${hoje}',100,'${mesStr}',2,'MB Way','',${f})`);
m = run(`api_pagamentosMes('${tb}',${ano},${mes})`);
ok(m.nPagas === 1 && m.linhas.find(l => l.letra === 'C').estado === 'pago' && m.recebido === 50, 'pagamento de 2 meses reparte-se: 50 € neste mês');
const mesAnt = mes > 1 ? mes - 1 : null;
if (mesAnt) { const ant = run(`api_pagamentosMes('${tb}',${ano},${mesAnt})`); ok(ant.linhas.find(l => l.letra === 'A').estado === 'atraso', 'mês anterior sem pagamento = em atraso'); }
let r = run(`api_resumo('${tb}',${ano})`);
ok(r.linhas.length === 8 && r.cobrado === 100, 'resumo: cobrado = 100');
ok(r.linhas.find(l => l.letra === 'A').debito === 35 * mes, 'resumo: A deve as quotas até ao mês atual');
let h = run(`api_home('${tb}')`);
ok(h.pagasMes === 1 && h.nFracoes === 8 && h.vagasAdmin === 1, 'início: pagas no mês e vagas de admin');
throws(`api_home('${tm}')`, /Master/, 'master não usa o início de condómino');

// obras
throws(`api_addObra('${tb}','ab','','','${hoje}','','',null)`, /título/i, 'obra: título curto');
const o = run(`api_addObra('${tb}','Reparação do telhado','Telhas','Telhados Lda','${hoje}','1200,50','2028-10',${img})`);
let obras = run(`api_obras('${tc}')`);
ok(obras.length === 1 && obras[0].estado === 'Em curso' && obras[0].custo === 1200.5 && obras[0].docs === 1, 'obra registada com custo e 1 documento');
ok(run(`api_getDoc('${tc}','${run(`api_docs('${tc}','Obra','${o.id}')`)[0].id}')`).mime === 'image/jpeg', 'documento da obra descarrega');
run(`api_concluirObra('${tb}','${o.id}','${hoje}','1300','2029-01')`);
ok(run(`api_obras('${tc}')`)[0].estado === 'Concluída' && run(`api_obras('${tc}')`)[0].custo === 1300, 'obra concluída com novo custo');
throws(`api_concluirObra('${tb}','${o.id}','${hoje}','','')`, /já está/, 'não se conclui duas vezes');
ok(run(`api_home('${tb}')`).obrasEmCurso === 0, 'início: 0 obras em curso');

// problemas
throws(`api_addProblema('${tc}','Luz fundida','','x','Urgente')`, /prioridade|local/i, 'problema: validações');
const p1 = run(`api_addProblema('${tc}','Luz da escada fundida','2º andar','2º andar · escada','Média')`);
const p2r = run(`api_addProblema('${tb}','Infiltração na garagem','','Garagem','Alta')`);
let ps = run(`api_problemas('${ta}')`);
ok(ps.length === 2 && ps[0].prioridade === 'Alta' && ps[0].fracao === 'B', 'problemas ordenados por prioridade, com a fração');
run(`api_addComment('${ta}','Problema','${p2r.id}','Já chamei o canalizador')`);
ok(run(`api_problemas('${ta}')`)[0].comentarios === 1 && run(`api_comments('${ta}','Problema','${p2r.id}')`)[0].fracao === 'A', 'comentário contado e com fração');
ok(run(`api_home('${tb}')`).problemasAbertos === 2 && run(`api_home('${tb}')`).problemasAltos === 1, 'início conta problemas abertos e altos');
run(`api_setProblema('${tc}','${p1.id}','Resolvido')`);
ok(run(`api_home('${tb}')`).problemasAbertos === 1, 'resolvido deixa de contar como aberto');
throws(`api_setProblema('${tc}','${p1.id}','Feito')`, /inválido/i, 'estado inválido');

// convocatórias
throws(`api_sendConvocatoria('${tb}','Assembleia 2026','',${pdf})`, /administrador/i, 'só administradores enviam convocatória');
const info = run(`api_convocatoriaInfo('${ta}')`);
ok(info.souAdmin && info.nEmails === 4 && info.nFracoes === 3 && info.emails.length === 4, 'info: 4 emails em 3 frações, lista só para admin');
ok(run(`api_convocatoriaInfo('${tb}')`).emails.length === 0, 'condómino normal não vê a lista de emails');
throws(`api_sendConvocatoria('${ta}','Assembleia 2026','',${img})`, /PDF/, 'convocatória exige PDF');
const n0 = mails.length;
const c = run(`api_sendConvocatoria('${ta}','Assembleia 2026','12/12 às 19h, hall',${pdf})`);
ok(c.enviados === 4 && mails.length === n0 + 4, 'convocatória enviada a 4 emails');
ok(mails[mails.length - 1].replyTo === 'ana@x.pt' && mails[mails.length - 1].attachments.length === 1, 'respostas vão para o administrador, com PDF anexado');
ok(run(`api_convocatoriaInfo('${tb}')`).historico[0].n === 4, 'histórico guarda o nº de emails');

// administração: registo
const ad = run(`api_admins('${tb}')`);
ok(ad.admins[0].eu === false && ad.registo.length >= 1, 'administração: registo visível e marca "eu"');

// cache: escrita invalida leitura
const antes = run(`api_obras('${tb}')`).length;
run(`api_addObra('${tb}','Pintura das escadas','','','${hoje}','','',null)`);
ok(run(`api_obras('${tb}')`).length === antes + 1, 'cache é invalidada ao escrever');

process.exit(fails ? 1 : (console.log('\nMódulos ok'), 0));
