# Hub EMR — guia para quem mexe no código

Quadro colaborativo offline para as maratonas de melhoria e automação da Energisa Minas Rio.
Roda numa TV de toque (uso principal) e no notebook do facilitador. É um PWA estático:
sem build, sem framework, sem backend. Os dados ficam no IndexedDB do navegador.

## Antes de qualquer mudança

1. Interface: leia `design-system/hub-emr/MASTER.md`. Ele descreve os tokens (`css/tokens.css`),
   os componentes e as regras de texto. Se o código e o MASTER divergirem, o código vale e o
   MASTER é atualizado no mesmo PR.
2. Rode `npm test` e `npm run check` antes de abrir PR. Os dois precisam passar.
3. Mudou algo visível? Veja a tela em 1920×1080 (TV), 1366×768 (notebook) e 390 px (celular).

## Arquitetura

```
index.html        Moldura (menu, barra do topo, área de conteúdo). Sem CSS nem JS embutidos.
css/              tokens → base → shell → components → screens → workspace → teams → keyboard → report
js/               scripts clássicos, carregados nesta ordem pelo index.html:
  core.js         utilitários, ícones, helpers de marcação (badge, empty, actionMenu, numbers,
                  notice, plural) e constantes do método (Steps, Criteria, Columns, Statuses…)
  state.js        IndexedDB (Storage) e estado (State); modelo de sessão
  history.js      avisos (Feedback) e histórico com desfazer, auditoria e salvamento (History)
  dialog.js       janela modal e campos de formulário
  domain.js       regras: classificação, ranking/desempate, equipes (Teams), participantes, demandas
  layout.js       navegação entre etapas, menu lateral, escala, menus suspensos
  render.js       HTML de cada etapa
  present.js      apresentação de uma demanda em tela grande (mapeamento), com o card virando
  flow.js         quadro AS IS / TO BE
  kanban.js       kanban e responsáveis
  pointers.js     multitoque, arrastar e soltar, travas por item, gestos (✓, X, setas)
  keyboard.js     teclado virtual da TV
  review.js       revisão do facilitador (PIN) e relatório executivo
  transfer.js     backup: validação, importação e exportação JSON
  sessions.js     sessões, ciclos, histórico da demanda, backup e ajuda
  commands.js     mapa data-action → função, e eventos globais
  boot.js         inicialização e registro do PWA
sw.js             cache offline (rede primeiro)
tests/            Playwright: method.spec (regras), interface.spec (telas e gestos), teams.spec (equipes)
scripts/          serve.mjs (servidor local) e check.mjs (verificações estáticas)
```

Por que scripts clássicos e não módulos ES: o app também é aberto direto do disco (`file://`),
onde módulos ES não carregam. Os arquivos compartilham o escopo global; a ordem no `index.html`
importa. Código que roda no carregamento só pode usar o que já foi definido acima.

### Como uma ação funciona

Botões levam `data-action="nome"`. `commands.js` tem o mapa `Commands[nome](botão)`. Ações que
mudam dados passam por `History.commit(rótulo, () => { … }, demandId)`, que guarda o estado para
desfazer, registra auditoria e histórico da demanda e salva no IndexedDB. Depois, renderize só o que
mudou (`Render.page()`, `Render.classifyList()`, `Kanban.patch()`…).

Preferências e câmera do quadro (escala, menu recolhido, zoom) **não** entram no desfazer: altere
`State.data.ui` ou a `view` do fluxo e chame `History.persist()`.

### Equipes (6.1)

Quando o grupo escolhe duas demandas no ranking, cada **equipe é um ciclo** com nome, cor e
integrantes (`session.teams = [{ cycleId, name, color, memberIds }]`, opcional, de 2 a 4).
Trocar de aba de equipe só muda `session.selectedCycleId`; por isso fluxo, kanban, revisão e
desfazer já valem por equipe sem código especial. A aba ativa (`State.workTab`: `overview`,
`team` ou `setup`) é estado de tela e não é salva. Com uma demanda só, `teams` não existe e
nada muda na tela. Confirmar uma demanda isolada ou "Voltar para uma equipe" remove `teams`;
os ciclos continuam no histórico. Uma pessoa fica em no máximo uma equipe (validado na importação).

## Regras que não podem quebrar

- **Dados existentes continuam abrindo.** O banco `EMR_Touch_Board_v3`, o `format`/`version` do
  JSON e o prefixo do hash do PIN (`emr-touch-v3:`) fazem parte dos dados salvos. Não renomeie.
  Campo novo precisa ser opcional e validado em `Transfer.validate`.
- **Pontuação e ranking** (`Classification`, `Ranking` em `domain.js`): nota de cada critério =
  nota ÷ 5 × peso; soma de 0 a 100; zero é resposta, vazio não é. Desempate: Impacto, Viabilidade
  e decisão do grupo. Só demandas classificadas disputam o ranking. Mudou regra? Atualize os testes
  em `tests/method.spec.mjs` e explique no PR.
- **Todo texto do usuário passa por `esc()`** antes de ir para o HTML.
- **Gestos e multitoque** (`pointers.js`) foram afinados na TV física. Não mude limiares (0,5 s,
  0,75 s, 9 px, tamanhos mínimos do gesto) sem testar na tela.
- **Medidas do fluxo em px** (nós de 224×128, mundo de 5000×3000): as coordenadas salvas dependem
  delas.

## Versão e publicação

A versão aparece em um só lugar na interface: `APP_VERSION` em `js/core.js`. Ao publicar:

1. Atualize `APP_VERSION`, o `version` do `package.json` e `CACHE` em `sw.js` (o `npm run check`
   confere se batem).
2. Arquivo novo em `css/` ou `js/`: inclua no `index.html` e na lista `ASSETS` do `sw.js`.

O projeto é publicado na Vercel como site estático (framework "Other", raiz `/`).

## Comandos

```bash
npm install                # só para os testes (Playwright)
npm start                  # http://localhost:8080
npm test                   # testes de regra e de interface
npm run check              # tokens, !important, cache offline, versão, plurais, sintaxe
CHROME_PATH=/caminho/do/chrome npm test   # usa um Chrome instalado em vez do Chromium do Playwright
```
