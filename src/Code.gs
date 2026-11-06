/**
 * App do Condomínio – Rua da Misericórdia 13/15/17
 * Ponto de entrada da web app (Google Apps Script).
 * As funções api_* (Auth, Fracoes, Pedidos, Avisos) são chamadas pelo browser.
 */

/** Serve a página principal. */
function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('Condomínio Rua da Misericórdia 13/15/17')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Inclui outro ficheiro HTML (usado por <?!= include_('manual') ?> no index). */
function include_(nome) {
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}
