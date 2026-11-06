# Condomínio Rua da Misericórdia 13/15/17 – App

App gratuita de gestão do condomínio: Google Apps Script (web app) + Google Sheets (base de dados) + Google Drive (documentos).
Cada push para `main` faz deploy automático para o Apps Script.

## Estrutura
```
src/                  código que vai para o Apps Script
  Code.gs             doGet() e utilitários
  Setup.gs            cria as folhas e os dados iniciais (correr uma vez)
  index.html          página da app
  appsscript.json     manifesto (fuso horário, permissões, web app)
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
7. **Publicar a web app.** **Implementar → Nova implementação → Aplicação Web** (executar como: eu; acesso: qualquer pessoa). Copia o *ID da implementação*.
8. **Secret final:** `DEPLOYMENT_ID` = o ID da implementação. A partir daqui, cada push atualiza a app **no mesmo link**.

## Trabalhar localmente
```
git clone https://github.com/XandeHD/condo-app.git
```
Abre a pasta no VS Code. Para ver alterações novas: **Source Control → Sync Changes** (ou `git pull`).
O estado de cada deploy vê-se no separador **Actions** do GitHub.

## Migrar para a conta do condomínio
Repetir os passos 1 a 8 na conta do condomínio e trocar os 3 secrets (`CLASPRC_JSON`, `SCRIPT_ID`, `DEPLOYMENT_ID`).
