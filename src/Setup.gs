/**
 * Cria (ou completa) as folhas da base de dados e os dados iniciais.
 * Corre uma vez a partir do editor do Apps Script: escolher "setup" e clicar em Executar.
 * É seguro voltar a correr: nunca apaga nem sobrescreve dados.
 */

const SCHEMA = {
  Fracoes: ['letra', 'andar', 'lado', 'tipo', 'ativa'],
  Emails_Fracao: ['fracao', 'email', 'data_inicio', 'data_fim', 'alterado_por'],
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
  Auditoria: ['data_hora', 'utilizador', 'tabela', 'id_registo', 'campo', 'antes', 'depois', 'motivo'],
  Codigos_Login: ['email', 'codigo_hash', 'validade', 'usado'],
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

const CONFIG_INICIAL = [
  ['nome_predio', 'Condomínio Rua da Misericórdia 13/15/17'],
  ['nipc', ''],
  ['email_master', '']
];

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());

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
  seed_(ss.getSheetByName('Config'), CONFIG_INICIAL);

  const padrao = ss.getSheetByName('Folha1') || ss.getSheetByName('Sheet1');
  if (padrao && ss.getSheets().length > 1 && padrao.getLastRow() === 0) ss.deleteSheet(padrao);

  Logger.log('Setup concluído. Folhas: ' + Object.keys(SCHEMA).join(', '));
}

/** Só escreve as linhas iniciais se a folha ainda não tiver dados. */
function seed_(sh, linhas) {
  if (sh.getLastRow() > 1) return;
  sh.getRange(2, 1, linhas.length, linhas[0].length).setValues(linhas);
}
