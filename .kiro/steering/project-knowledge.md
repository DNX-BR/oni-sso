---
inclusion: always
---

# ONI-SSO — Base de Conhecimento do Projeto

> Steering vivo. **Sempre que aprender algo novo** sobre este projeto (decisão de design, armadilha,
> comando que funcionou, particularidade de um provedor), **acrescente aqui** na seção apropriada.
> Mantenha entradas curtas e datadas em "Lições Aprendidas".

## 1. O que é

CLI em **Node.js (CommonJS)** que faz login na AWS via SSO e gera credenciais temporárias.
Empacotado e distribuído como **imagem Docker** (`public.ecr.aws/dnxbrasil/oni-sso`). Mantido pela DNX Brasil.

Quatro comandos (definidos em `src/index.js` via `yargs`):
- `auth-google` — login SAML via Google (idpid/spid)
- `auth-azure` — login SAML via Azure (appIdUri/tenantId)
- `auth-aws` — login AWS SSO (ssoStartUrl); **não** combina com `assume-role`
- `assume-role` — assume role a partir de credenciais já geradas

## 2. Arquitetura e fluxo

> **Stack (v3.0.0): TypeScript + ESM.** Fontes em `src/*.ts`, compiladas com `tsc` para `dist/`.
> Browser via **Playwright**; CLI via **commander**; prompts via **@inquirer/prompts**.

```
index.ts (commander/CLI)
  ├─ input.ts     → prompts (@inquirer/prompts): email/senha SOB DEMANDA (lazy), MFA, seleção de role/conta
  ├─ saml.ts      → decodeSaml + getRoles UNIFICADO (namespace-agnóstico, Google+Azure)
  ├─ google.ts    → playwright (loop adaptável) → captura SAMLResponse → saml.getRoles
  ├─ azure.ts     → monta AuthnRequest (deflate+base64) → playwright (loop adaptável) → SAMLResponse
  ├─ aws-sso.ts   → fluxo OIDC device authorization (sem browser scraping)
  ├─ aws.ts       → STS: AssumeRoleWithSAML / AssumeRole
  ├─ browser.ts   → openSession (contexto PERSISTENTE por provedor), sleep, waitUntil, dumpFailure, fatal, clearFolder
  ├─ types.ts     → tipos compartilhados (Role, Credentials, ...)
  └─ output.ts    → formata saída: console | export | env | one | profile
```

### auth-aws (OIDC device flow)
Não usa mais browser/scraping. `@aws-sdk/client-sso-oidc` (RegisterClient → StartDeviceAuthorization →
polling CreateToken) + `@aws-sdk/client-sso` (ListAccounts → ListAccountRoles → GetRoleCredentials).
Imprime URL + código; usuário aprova no navegador. Região via `SSO_REGION`/`AWS_DEFAULT_REGION`.

Padrão comum dos fluxos SAML (`google`/`azure`):
1. Puppeteer headless abre a URL do IdP.
2. Intercepta o request para `https://signin.aws.amazon.com/saml` no listener `page.on('request')` para capturar o `SAMLResponse`.
3. Decodifica (URI + base64) → faz parse XML → extrai pares `role,principal`.
4. `AssumeRoleWithSAMLCommand` (STS) gera as credenciais.
5. `OutputFormat` grava/imprime no formato pedido.

### Caminhos fixos (montados via volume Docker)
- `/work/.env.oni-auth` — credenciais temporárias intermediárias (JSON). Lido por `assume-role`.
- `/work/.env.auth` — saída formato `env`.
- `/profile/credentials` — saída formato `profile` (arquivo AWS credentials, formato ini).
- `/one/secrets` — saída formato `one` (one-cli).
- `/tmp` — screenshots quando `--monitor` ativo (é limpo no início de cada login).

## 3. Convenções de código

- **TypeScript + ESM** (`"type": "module"`, `tsconfig` NodeNext, `strict`). Imports relativos usam extensão `.js`
  (ex.: `import { x } from './saml.js'`) por exigência do NodeNext. Compila para `dist/` com `tsc`.
- Node >=22.12 (imagem baseada na oficial do Playwright). Funções/identificadores em camelCase.
- **Restrição de versões resolvida pela migração ESM**: agora é possível usar libs modernas. Em uso:
  commander 15, @inquirer/prompts 8, playwright 1.61, fast-xml-parser 5, ini 5 (ini 7 exige Node ≥24.15 → fica em 5),
  @aws-sdk 3. Removidos: puppeteer, yargs, inquirer(legado), node-html-parser, uuid.
- Lint: **ESLint flat config** (`eslint.config.js`) com `@eslint/js` + `typescript-eslint`. `npm run lint`.
- Erros tratados com `fatal()` (retorna `never`); browser sempre fechado em `finally`.
- Nomes de funções exportadas em **PascalCase** (ex.: `LoginGoogleSSO`, `OutputFormat`, `GetRoles`).
- Funções `async`; mistura de `function` declarada e arrow functions entre arquivos — siga o padrão do arquivo que está editando.
- Erros tratados com `console.error(...)` + `process.exit(1)` (CLI, não lança exceções para cima).

## 4. Variáveis de ambiente

| Var | Uso |
|-----|-----|
| `AWS_DEFAULT_REGION` | região STS (default `us-east-1`) |
| `AZURE_APP_ID_URI`, `TENANT_ID` | evita passar `-a`/`-t` no azure |
| `GOOGLE_IDPID`, `GOOGLE_SPID` | evita passar `-i`/`-s` no google |
| `ONI_USERNAME`, `ONI_PASSWORD` | evita prompt interativo de login |
| `TIMEOUT_PAGE` | espera entre passos do puppeteer (google 2000, azure 5000) |
| `MFA_TIMEOUT` | (azure) ms de espera pela tela de number matching do MFA (default 60000) |
| `AZURE_AUTH_METHOD` | (azure) método de MFA a forçar no seletor; default `PhoneAppNotification` (push do Authenticator). Outros: `PhoneAppOTP` (TOTP), `OneWaySMS` |
| `AUTH_TIMEOUT` | ms de espera pela captura do SAMLResponse após login/MFA (default 60000) |
| `ONI_WORK_DIR` | dir de `.env.oni-auth` e `.env.auth` (default `/work`); usar local fora do Docker |
| `ONI_PROFILE_FILE` | arquivo do formato `profile` (default `/profile/credentials`) |
| `ONI_ONE_FILE` | arquivo do formato `one` (default `/one/secrets`) |
| `SSO_REGION` | (auth-aws) região do IAM Identity Center; fallback `AWS_DEFAULT_REGION` → `us-east-1` |
| `ONI_DIAG_DIR` | diretório dos diagnósticos de falha (screenshot + HTML); default `%TEMP%/oni-sso` (subpasta dedicada) |
| `CHROME_PATH` | (opcional) caminho de um Chromium/Chrome para o Playwright usar |
| `ONI_PROFILE_DIR` | base dos perfis persistentes do navegador (default `~/.oni-sso/profiles`, subdir por provedor) |
| `ONI_NO_PERSIST` | `1` desliga a persistência (sessão de navegador efêmera) |
| `ONI_HEADFUL` | `1` (ou `HEADLESS=false`) para rodar o navegador visível (debug de login) |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1` no build/CI para não baixar browsers (imagem já os tem) |
| `APP_VERSION` | exibido em `--version`; setado no Dockerfile |

## 5. Build, execução e release

- **Testes** (`node --import tsx --test test/*.test.ts`): cobrem `getRoles` (Google/Azure, ordem variável) e
  `decodeSaml`. `npm test`. Lint `npm run lint`, typecheck `npm run typecheck`, build `npm run build`.
- Fluxos de browser/OIDC não têm teste automatizado (exigem IdP/SSO real).
- Dev sem Docker: `npm run dev -- <args>` (tsx). Build: `npm run build` → `dist/`.
- **Build Docker**: multi-stage sobre `mcr.microsoft.com/playwright:v1.61.1-noble` (browsers já inclusos);
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` + `npm ci`. Manter a tag da imagem em sincronia com a versão do playwright.
- Execução: `docker run -v $(pwd):/work --rm -it ... <comando>`.
- **CI**: `.github/workflows/ci.yml` roda lint+typecheck+test+build em PR. `dnx_ci-build-and-push.yml` publica no ECR em tag.
- **Dependabot**: `.github/dependabot.yml` (npm, github-actions, docker, semanal).
- **CI/CD** (`.github/workflows/dnx_ci-build-and-push.yml`): dispara em **push de tag**, faz build e push
  multi-arch (QEMU/buildx) para o ECR público. A tag vira a versão da imagem (`RELEASE_VERSION`).
  → Para liberar nova versão: criar git tag. Atualizar também `ENV APP_VERSION` no Dockerfile e `version` no `package.json`.
- CodeQL roda em `.github/workflows/codeql-analysis.yml`.

## 6. Pontos de fragilidade (cuidado ao mexer)

- **Scraping dependente de DOM (Google/Azure)**: seletores como `input[type="password"]`, `#idDiv_SAOTCAS_Title`,
  `#idRichContext_DisplaySign` quebram se o IdP mudar o HTML. O Playwright tem auto-wait (reduz race conditions),
  e há `dumpFailure()` salvando screenshot+HTML em falha para depurar. `auth-aws` **não** depende mais de DOM (usa OIDC).
- **MFA**: Google (código SMS/voz, prompt no celular, TOTP — detectado por URL com retry); Azure (number matching +
  confirmação no app). AWS via Identity Center não precisa de código no projeto.
- **getRoles** agora é namespace-agnóstico (varre qualquer `AttributeValue` com `arn:aws:iam:` + `saml-provider`,
  identificando role/principal por conteúdo, em qualquer ordem). Bem mais resiliente que o parsing antigo por path fixo.
- **Playwright strict mode**: locators que casam >1 elemento lançam erro (diferente do `page.type` do puppeteer, que
  pegava o primeiro). Email do Google deve usar `#identifierId` (a página tem um campo de captcha de áudio também
  `type="text"`). Senha/MFA usam `.first()`. O aparecimento do captcha de áudio sinaliza **detecção de automação** do
  Google — preferir `ONI_HEADFUL=1` (headless puro costuma ser bloqueado).

## 7. Segurança

- Credenciais AWS trafegam em arquivos sob `/work`, `/profile`, `/one`. **Nunca** logar/echoar secrets em respostas.
- Não comitar `.env*`, credenciais ou tokens. Seguir as Security Best Practices globais.
- Puppeteer roda com `--no-sandbox` (necessário no container) — não remover sem entender o impacto.

## 8. Lições Aprendidas (append-only, datar entradas)

- 2026-06-26 — Mapeamento inicial do projeto criado. Estrutura, fluxos SAML, caminhos fixos de volume e
  pipeline de release documentados. Ainda não há testes automatizados nem script de lint no `package.json`.
- 2026-06-26 — Criado hook `agentStop` `.kiro/hooks/update-project-knowledge.kiro.hook` que mantém esta
  seção alimentada automaticamente ao final de cada execução relevante.
- 2026-06-26 — Bug "número do MFA não aparece" (Azure) tinha 3 causas: sleep fixo `waitForTimeout` perdia a
  tela de number matching quando renderizava tarde; `el.textContent` em `#idRichContext_DisplaySign` estourava
  se `null`; e seletor podia mudar. Corrigido em `azure.js` com `waitForSelector` + timeout `MFA_TIMEOUT`,
  leitura null-safe e fallback "approve on your app". Padrão a replicar no Google (detecção de MFA por URL é igualmente frágil).
- 2026-06-26 — Modernização ampla: Node 24, puppeteer 25 (removeu `page.waitForTimeout` → criado `sleep()` em
  `browser.js`), aws-sdk/fast-xml-parser/node-html-parser atualizados; `uuid` removido (crypto nativo). Deps ESM-only
  (inquirer 9+, yargs 18, ini 5+) mantidas na última CJS. Adicionados `try/finally` (fecha o browser), diagnóstico
  em falha (`dumpFailure`), `eslint` flat config, testes `node --test` e `npm ci` no Dockerfile. Detecção de MFA do
  Google agora faz retry por URL. Fluxos de browser não puderam ser testados localmente (exigem IdP real + Chrome).
- 2026-06-26 — Roadmap de melhoria proposto (ainda não implementado), em ordem de retorno: (1) substituir o
  scraping do portal em `auth-aws` pelo fluxo oficial OIDC device authorization (`@aws-sdk/client-sso-oidc` +
  `@aws-sdk/client-sso`), eliminando puppeteer/node-html-parser nesse caminho; (2) migrar fluxos SAML para
  `playwright` (auto-wait resolve a classe de bug de timing/MFA; usar imagem oficial mcr.microsoft.com/playwright);
  (3) unificar `GetRoles` Google/Azure numa função namespace-agnóstica em `util.js`. Itens opcionais: yargs→commander,
  migração ESM para destravar @inquirer/prompts, Dependabot/Renovate no CI, TypeScript.
- 2026-06-26 — Roadmap acima IMPLEMENTADO (v3.0.0): projeto migrado para TypeScript+ESM; puppeteer→playwright;
  yargs→commander; inquirer→@inquirer/prompts; `auth-aws` reescrito com OIDC device flow (sem scraping); `getRoles`
  unificado em `saml.ts`; CI + Dependabot adicionados; Dockerfile multi-stage sobre imagem oficial do Playwright.
  Validado local: typecheck/lint/build OK, 3 testes passando, `--help`/`--version` OK. Fluxos de browser e OIDC
  não testados contra IdP/SSO real. Armadilha: `ini@7` exige Node ≥24.15 e não traz tipos → fixado em `ini@5` + `@types/ini`.
- 2026-06-26 — Testabilidade local: `DIAG_DIR` agora usa `os.tmpdir()` (cross-platform; `/tmp` quebrava no Windows)
  e screenshots usam `diagPath()`. Adicionado modo headed via `ONI_HEADFUL=1`. Para rodar local sem Docker:
  `npx playwright install chromium` e `npm run dev -- auth-google|auth-azure ... -o console -m`. Smoke do browser
  (launch/navega/fecha) validado OK em headless e headed. Login real Google/Azure exige IdP + MFA interativo (não testável pelo agente).
- 2026-06-26 — Primeiro teste real do `auth-google` quebrou em `locator('input[type="text"]')` (strict mode: 2 matches
  — email `#identifierId` + captcha de áudio `#ca`). Corrigido: email usa `#identifierId`; senha/MFA usam `.first()`;
  mesma proteção no Azure. O captcha indica detecção de automação do Google → recomendar `ONI_HEADFUL=1`.
- 2026-06-26 — Armadilha crítica: NÃO usar `waitForLoadState('networkidle')` nesses fluxos — o console AWS e telas
  Microsoft/Google mantêm conexões abertas e nunca atingem networkidle (timeout 30s derruba o script mesmo após o
  SAML já capturado). Convenção: `goto` com `waitUntil:'domcontentloaded'`, deixar locators auto-esperarem, e usar o
  helper `waitUntil(() => !!samlResponse, AUTH_TIMEOUT)` para aguardar a captura do POST do SAML. Login Google validado OK.
- 2026-06-26 — Fluxo `auth-google` validado END-TO-END (login+MFA+seleção de role). Falhava ao gravar
  `/work/.env.oni-auth` (vira `C:\work` no Windows). Caminhos de saída tornados configuráveis via
  `ONI_WORK_DIR`/`ONI_PROFILE_FILE`/`ONI_ONE_FILE` (defaults de container preservados) + `mkdir` automático;
  `aws.ts` lê de `ONI_AUTH_FILE` exportado por `output.ts`. Mesmo com `-o console`, o `.env.oni-auth` é sempre escrito
  (para o `assume-role` reusar). Local no Windows: `ONI_WORK_DIR=$PWD\.oni` (considerar .gitignore p/ não commitar credenciais).
- 2026-06-26 — `.gitignore` passou a ignorar `dist/` (build) e `.oni/` (dir local de credenciais). `.env*` e
  `credentials` já cobriam os arquivos de saída de credenciais, inclusive dentro de `.oni/`.
- 2026-06-26 — Azure: contas caem por padrão no método passkey/FIDO ("Detecção Facial/PIN/chave de segurança"), que
  falha em automação. Adicionado `selectAzureAuthMethod()` em `azure.ts`: clica "Entrar de outra forma"
  (`#idA_PWD_SwitchToCredPicker` + fallback por texto) e seleciona o tile do método via `data-value`
  (`PhoneAppNotification` = push do Authenticator), configurável por `AZURE_AUTH_METHOD`. Seletores ainda NÃO
  confirmados contra o DOM real do tenant — validar com `-m` e os `failure-azure-*.html`/`post-method-pick.png`.
- 2026-06-26 — Armadilha destrutiva corrigida: `DIAG_DIR` apontava para `os.tmpdir()` e `clearFolder` apagava TODO
  o `%TEMP%` no início de cada login. Agora `DIAG_DIR = %TEMP%/oni-sso` (subpasta dedicada) e `clearFolder` cria a
  pasta se faltar e limpa só ela. Diagnósticos (screenshots + `failure-*.html`) ficam lá — o agente lê os `.html`
  para extrair seletores reais do IdP.
- 2026-06-26 — Captura do DOM real do Azure (login manual em browser headed via `scripts/azure-dom-capture.ts`,
  salvando HTML em `%TEMP%/oni-sso`): a conta vai direto à tela de passkey/FIDO (`login.microsoft.com/common/fido/get`).
  CONFIRMADO o link "Entrar de outra forma" = `#idA_PWD_SwitchToCredPicker` (há também `#moreOptions`). Os tiles do
  seletor (com `data-value`) só renderizam APÓS clicar nesse link — `data-value` do Authenticator ainda a confirmar.
- 2026-06-26 — Azure passwordless: contas vão do email DIRETO ao passkey (sem campo de senha) → o `fill(password)`
  fixo estourava. Solução: (a) `addInitScript` que neutraliza `navigator.credentials.get` (WebAuthn) p/ a tela de
  passkey falhar sozinha sem diálogo do SO (dispensa "cancelar"); (b) `loginAzureSSO` virou um loop adaptável que
  trata cada tela conforme aparece (passkey→`#idA_PWD_SwitchToCredPicker`, seletor→`[data-test-cred-id="2"]`, senha só
  se existir, number matching). "Continuar conectado?" trata `input[type=submit]` + fallback `#idSIButton9`. Confirmado
  enum credType: 1=Password, 2=PhoneAppNotification(push), 3=PhoneAppOTP, 4=OneWaySMS.
- 2026-06-26 — Armadilha do loop adaptável do Azure: o link "Entrar de outra forma" (`#idA_PWD_SwitchToCredPicker`)
  TAMBÉM existe na própria tela de MFA/push, então o loop reclicava (switch→tile→push→switch...) e nunca deixava
  aprovar. Correção: clicar o switch link e o tile do método NO MÁXIMO uma vez (guards `switchClicked`/`methodPicked`);
  ao detectar o desafio (`#idRichContext_DisplaySign`/`#idDiv_SAOTCAS_Title`) parar de navegar e entregar ao usuário.
- 2026-06-26 — Persistência de sessão: `openSession(provider)` usa `chromium.launchPersistentContext` (perfil por
  provedor em `~/.oni-sso/profiles`), mantendo cookies de "dispositivo confiável" entre execuções → IdP pula
  senha/MFA dentro da política. Pré-requisito: email/senha viraram lazy (`getEmail`/`getPassword` em input.ts) e
  preenchidos só quando o campo aparece — senão um login via SSO (sem tela de email) travaria esperando o campo.
  Armadilha de API: `context.addInitScript` no Playwright 1.61 retorna `Promise<Disposable>` (não `void`) — envolver.
  `ONI_NO_PERSIST=1` desliga; em Docker é preciso montar o perfil como volume.
- 2026-06-26 — UX: rodar headful (`ONI_HEADFUL=1`) abre janela e rouba o foco do terminal. No fluxo atual não é
  preciso ver o navegador (número do push sai no terminal; aprovação no celular), então a convenção é: headless no
  dia a dia (sem janela, sem roubar foco) e headful só na 1ª vez de cada provedor (semear o perfil/captcha) ou debug.
- 2026-06-26 — Build/run em container validado: imagem `oni-sso:3.0.0` builda (npm ci + tsc) e roda na imagem oficial
  do Playwright; `--version`/`--help` OK e smoke do Chromium headless dentro do container passa. `.dockerignore`
  reescrito (ignora node_modules/dist/.oni/.oni-sso/test/.kiro/docs; removida ref. ao .eslintrc.yml extinto).
  Persistência em container = montar volume `-v $HOME/.oni-sso:/root/.oni-sso` (home do container é /root). README
  atualizado com exemplos bash/PowerShell.
- 2026-06-26 — Armadilha headless/container: o número do MFA (`#idRichContext_DisplaySign`) renderiza VAZIO antes de
  popular; ler na hora dava string vazia → caía na mensagem genérica sem mostrar o código (no headed o timing
  mascarava). Correção: ao detectar a tela, aguardar o `textContent` ficar não-vazio (poll ~10s) antes de imprimir.
  Lembrete: rodar o container com `-it` (sem TTY o número/prompt de confirmação não aparecem direito).
- 2026-06-26 — v3.0.0 validada END-TO-END em container nos três fluxos: `auth-google` ✅, `auth-azure` ✅ (number
  matching + passwordless), `auth-aws` via OIDC. Persistência de dispositivo confiável e headless por padrão OK.
  Mudanças ainda locais (não commitadas) — próximo passo é abrir PR (branch + commit + push + tea/gh), sem merge.
- 2026-06-26 — Repo hospedado no GitHub: `git@github.com:DNX-BR/oni-sso.git` (SSH). `gh` CLI NÃO instalado (usar
  push + URL de compare, ou `winget install --id GitHub.cli`). Workflows modernizados: `dnx_ci-build-and-push.yml`
  (checkout@v4, qemu/buildx@v3, login@v3, build-push@v6, `::set-output`→`$GITHUB_OUTPUT`) e `codeql-analysis.yml`
  (codeql-action@v3, language `javascript-typescript`, `build-mode: none`). Obs.: imagem ~3.5GB + `no-cache:true` no
  release deixa o CI lento — cache buildx (`cache-from/to: gha`) é otimização pendente.
- 2026-06-26 — `gh` CLI instalado via winget (GitHub.cli 2.95.0). Após instalar, recarregar PATH em novas sessões
  (`$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')`).
  Falta `gh auth login` (passo interativo do usuário). Push continua por SSH; `gh` é só para a API (criar PR).
