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

1. **Sheet + script.** Cria uma Google Sheet. Abre **Extensões → Apps Script** e copia o *Script ID* (Definições do projeto).
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
6. **Criar as folhas.** No editor do Apps Script, escolhe a função `setup`, clica em **Executar** e aprova as permissões.
   O email de quem corre o `setup` fica como **Admin Master** (altera-se na folha `Config`, chave `email_master`).
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
