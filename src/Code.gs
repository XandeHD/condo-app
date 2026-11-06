/**
 * App do Condomínio – Rua da Misericórdia 13/15/17
 * Ponto de entrada da web app (Google Apps Script).
 */

/** Serve a página principal. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Condomínio Rua da Misericórdia 13/15/17')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Permite incluir ficheiros HTML parciais: <?!= include('estilos') ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Devolve a folha de cálculo da base de dados (guardada em SHEET_ID na primeira execução de setup). */
function db() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Corre primeiro a função setup() no editor do Apps Script.');
  return SpreadsheetApp.openById(id);
}
