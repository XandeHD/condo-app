# Condomínio Rua da Misericórdia 13/15/17 – App

App gratuita de gestão do condomínio: Google Apps Script (web app) + Google Sheets (base de dados) + Google Drive (documentos).
Cada push para `main` faz deploy automático para o Apps Script.

## Estrutura
```
src/                  código que vai para o Apps Script
  Code.gs             doGet() (entrada da web app)
  Setup.gs            cria as folhas e os dados iniciais (correr uma vez)
  Utils.gs            acesso à Sheet, hashes, validações
  Auth.gs             login por código, sessões por dispositivo, Admin Master
  Fracoes.gs          frações e emails (cada fração só altera os seus)
  Pedidos.gs          pedidos de entrada
  Avisos.gs           avisos na app e registo de auditoria
  index.html          a app (ecrãs)
  manual.html         o manual da app (texto; abre em "?" e sem login)
  appsscript.json     manifesto (fuso horário, permissões, web app)
tests/                testes (npm install && npm test)
.github/workflows/    deploy automático (clasp)
```

## Configuração inicial (uma vez)

1. **Projeto Apps Script.** Cria um projeto em https://script.google.com e copia o *Script ID* (Definições do projeto). Não precisas de criar a Sheet: o `setup` (passo 6) cria-a sozinho. (Se preferires, podes abrir o Apps Script a partir de uma Sheet sem nada, em **Extensões → Apps Script**, e o `setup` usa essa.)
2. **Ativa a Apps Script API** em https://script.google.com/home/usersettings
3. **Credenciais no teu PC:**
   ```
   npm install -g @google/clasp
   clasp login
   ```
   Isto cria o ficheiro `~/.clasprc.json`.
4. **Secrets no GitHub** (Settings → Secrets and variables → Actions → New repository secret):
   - `CLASPRC_JSON`: o conteúdo completo de `~/.clasprc.json`
   - `SCRIPT_ID`: o Script ID do passo 1
5. **Primeiro envio.** Faz push para `main` (ou **Actions → Deploy → Run workflow**).
6. **Ligar o `Code.gs` e depois correr o `setup`** (por esta ordem, no editor do Apps Script):
   1. Abre o ficheiro **`Code.gs`**, escolhe a função **`doGet`** no seletor (ao lado de "Depuração") e clica em **Executar**.
      Serve para ligar o código e dar as permissões todas de uma vez: **Rever autorizações** → a tua conta → **Avançadas** → **Aceder a … (não seguro)** → **Permitir**. É normal a Google avisar que a app não foi verificada (a app é tua).
   2. Abre o ficheiro **`Setup.gs`**, escolhe a função **`setup`** e clica em **Executar**.
      Cria a Sheet "Condomínio Rua da Misericórdia 13/15/17 – Dados" no teu Drive, com todas as folhas e as 8 frações. No fim, o registo de execução diz "Setup concluído" e mostra o link da Sheet.
      O email de quem corre o `setup` fica como **Admin Master** (altera-se na folha `Config`, chave `email_master`).
   - **Só estas duas funções se correm à mão.** As funções `api_...` são chamadas pelo ecrã da app: se as correres no editor, dão erros como "Email inválido" ou "Sessão expirada", e é normal.
   - Se o `setup` falhar com "permissões insuficientes", repete o passo 1 (o `doGet`) e autoriza outra vez; depois volta ao `setup`.
7. **Publicar a web app.** **Implementar → Nova implementação → Aplicação Web** (executar como: eu; acesso: qualquer pessoa). Copia o *ID da implementação*.
8. **Secret final:** `DEPLOYMENT_ID` = o ID da implementação. A partir daqui, cada push atualiza a app **no mesmo link**.

## Primeiro uso
1. Abre o link da web app e entra com o email do Admin Master (recebes um código por email).
2. A app pergunta "Quem és?" (fração e nome). Fica no registo de tudo o que o master fizer.
3. Em **Frações**, escolhe cada fração e adiciona os emails (o master pode, com motivo). Depois cada fração gere os seus.

## Testes
```
npm install
npm test
```
Corre o servidor com um Google Sheets simulado e a página real num browser simulado (jsdom). Não envia emails nem toca no Google.

## Trabalhar localmente
```
git clone https://github.com/XandeHD/condo-app.git
```
Abre a pasta no VS Code. Para ver alterações novas: **Source Control → Sync Changes** (ou `git pull`).
O estado de cada deploy vê-se no separador **Actions** do GitHub.

## Migrar para a conta do condomínio
Repetir os passos 1 a 8 na conta do condomínio e trocar os 3 secrets (`CLASPRC_JSON`, `SCRIPT_ID`, `DEPLOYMENT_ID`).


## Manual (regra de manutenção)

O manual vive em `src/manual.html` e descreve tudo o que está decidido e desenhado. Cada secção tem `estado`: `ativo` (já no código) ou `breve` (ainda por programar; a app mostra a etiqueta "Em breve na app").
Sempre que algo é decidido, entra no código ou muda (permissões, prazos, ecrãs), atualiza o manual **no mesmo commit**, passa `breve` a `ativo` quando a funcionalidade chegar e sobe `versao` e `atualizado`.
Os testes comparam os números do manual (sessões, impasse, máximo de emails, código) com o código; se divergirem, falham.
