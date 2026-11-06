/**
 * Cria (ou completa) as folhas da base de dados e os dados iniciais.
 * Corre uma vez a partir do editor do Apps Script: escolher "setup" e clicar em Executar.
 * É seguro voltar a correr: nunca apaga nem sobrescreve dados.
 *
 * O email de quem corre o setup fica como Admin Master. Com ele entras na app e adicionas
 * os emails de cada fração (Admin Master pode editar emails de frações).
 */

const SCHEMA = {
  Fracoes: ['letra', 'andar', 'lado', 'tipo', 'ativa'],
  Emails_Fracao: ['fracao', 'email', 'data_inicio', 'data_fim', 'alterado_por'],
  Pedidos_Entrada: ['id', 'email', 'fracao', 'data', 'estado', 'decidido_por', 'data_decisao', 'motivo'],
  Dispositivos: ['email', 'token_hash', 'nome_dispositivo', 'criado_em', 'ultimo_uso', 'revogado', 'quem'],
  Avisos: ['id', 'data', 'tipo', 'texto', 'destinatario', 'criado_por', 'lido_por'],
  Administradores: ['email', 'fracao', 'desde', 'ate', 'nomeado_por', 'removido_por', 'motivo'],
  Convocatorias: ['id', 'data_envio', 'enviado_por', 'assunto', 'mensagem', 'id_documento', 'destinatarios', 'n_emails'],
  Quotas: ['fracao', 'ano', 'valor_mensal', 'ref_reuniao', 'notas'],
  Pagamentos: ['id', 'fracao', 'data', 'valor', 'meses', 'metodo', 'notas', 'registado_por', 'emails_na_altura', 'id_documento', 'anulado', 'motivo'],
  Recibos: ['numero', 'ano', 'id_pagamento', 'fracao', 'data', 'valor', 'periodo', 'forma_pagamento', 'emitido_por', 'emails_na_altura', 'codigo_verificacao', 'id_pdf', 'anulado', 'motivo_anulacao'],
  Despesas: ['id', 'data', 'categoria', 'fornecedor', 'valor', 'descricao', 'estado', 'id_obra', 'registado_por', 'id_documento'],
  Obras: ['id', 'titulo', 'descricao', 'fornecedor', 'data_inicio', 'data_fim', 'custo', 'estado', 'garantia_ate'],
  Problemas: ['id', 'titulo', 'descricao', 'local', 'prioridade', 'estado', 'reportado_por', 'data', 'id_obra'],
  Comentarios: ['id', 'tipo_registo', 'id_registo', 'autor', 'data', 'texto'],
  Documentos: ['id', 'nome', 'tipo_registo', 'id_registo', 'id_drive', 'enviado_por', 'data'],
  Auditoria: ['data_hora', 'utilizador', 'utilizador_declarado', 'tabela', 'id_registo', 'campo', 'antes', 'depois', 'motivo'],
  Codigos_Login: ['email', 'codigo_hash', 'validade', 'usado', 'tentativas'],
  Config: ['chave', 'valor']
};

const FRACOES_INICIAIS = [
  ['A', 'R/C', 'Esq.', 'loja', true],
  ['B', 'R/C', 'Dto.', 'loja', true],
  ['C', '1º', 'Dto.', 'habitação', true],
  ['D', '1º', 'Esq.', 'habitação', true],
  ['E', '2º', 'Dto.', 'habitação', true],
  ['F', '2º', 'Esq.', 'habitação', true],
  ['G', '3º', 'Dto.', 'habitação', true],
  ['H', '3º', 'Esq.', 'habitação', true]
];

function setup() {
  const props = PropertiesService.getScriptProperties();
  // 1) Script ligado a uma Sheet; 2) Sheet já criada por um setup anterior; 3) cria uma Sheet nova.
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss && props.getProperty('SHEET_ID')) ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  if (!ss) ss = SpreadsheetApp.create('Condomínio Rua da Misericórdia 13/15/17 – Dados');
  props.setProperty('SHEET_ID', ss.getId());
  if (!props.getProperty('SALT')) props.setProperty('SALT', Utilities.getUuid() + Utilities.getUuid());

  Object.keys(SCHEMA).forEach(function (nome) {
    let sh = ss.getSheetByName(nome);
    if (!sh) sh = ss.insertSheet(nome);
    const cab = SCHEMA[nome];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });

  seed_(ss.getSheetByName('Fracoes'), FRACOES_INICIAIS);
  seed_(ss.getSheetByName('Config'), [
    ['nome_predio', 'Condomínio Rua da Misericórdia 13/15/17'],
    ['nipc', ''],
    ['email_master', (Session.getEffectiveUser().getEmail() || '').toLowerCase()]
  ]);

  const padrao = ss.getSheetByName('Folha1') || ss.getSheetByName('Sheet1');
  if (padrao && ss.getSheets().length > 1 && padrao.getLastRow() === 0) ss.deleteSheet(padrao);

  datasLegiveis_(ss);
  limparTudo_();
  Logger.log('Setup concluído. Admin Master: ' + Session.getEffectiveUser().getEmail() + ' · Sheet: ' + ss.getUrl());
}

/** Converte os números gigantes (milissegundos) já guardados em datas verdadeiras e formata as colunas. Seguro de repetir. */
function datasLegiveis_(ss) {
  try { ss.setSpreadsheetTimeZone('Europe/Lisbon'); } catch (e) { /* sem permissão: segue */ }
  Object.keys(COLUNAS_DATA_).forEach(function (nome) {
    const sh = ss.getSheetByName(nome);
    if (!sh) return;
    COLUNAS_DATA_[nome].forEach(function (col) {
      const c = SCHEMA[nome].indexOf(col) + 1, n = sh.getMaxRows() - 1;
      if (c < 1 || n < 1) return;
      const rng = sh.getRange(2, c, n, 1);
      rng.setNumberFormat(FORMATO_DATA_);
      const vals = rng.getValues();
      let mudou = false;
      vals.forEach(function (r) { if (typeof r[0] === 'number' && r[0] > 1e11) { r[0] = new Date(r[0]); mudou = true; } });
      if (mudou) rng.setValues(vals);
    });
    sh.autoResizeColumns(1, SCHEMA[nome].length);
  });
}

/** Só escreve as linhas iniciais se a folha ainda não tiver dados. */
function seed_(sh, linhas) {
  if (sh.getLastRow() > 1) return;
  sh.getRange(2, 1, linhas.length, linhas[0].length).setValues(linhas);
}
