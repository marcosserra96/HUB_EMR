# Design system — Hub EMR

> **Fonte da verdade:** os tokens estão em `css/tokens.css`, e os componentes, em `css/components.css`
> e nos helpers de `js/core.js`. Este arquivo descreve o que existe no código. Se os dois
> divergirem, vale o código, e este arquivo é atualizado no mesmo PR.

**Produto:** quadro de uso coletivo numa TV de toque, conduzido por um facilitador. Pessoas leem a
2–3 m de distância e tocam com o dedo. Clareza, alvos grandes e consistência valem mais que
novidade visual. Segue a mesma linha do portal de atletas (Comit-Atletas-Energisa): tokens
semânticos, um botão principal por área, números sem enfeite e textos sem jargão.

---

## Cores

Use sempre as variáveis. Hexadecimal só existe em `tokens.css`, o que o `npm run check` confere.
A única exceção é o SVG do fluxo no relatório (`js/review.js`), que precisa ser autocontido.

| Token | Uso |
|---|---|
| `--color-primary` `#005061` | Ações principais, item ativo, títulos de destaque |
| `--color-brand` `#009bc1` | Foco, progresso, pontos de conexão (**nunca** para texto) |
| `--color-link` `#007591` | Texto de destaque em azul (rótulos "Etapa X de 8") |
| `--color-accent` `#b54c12` | Laranja Energisa ajustado para AA: recomendação e decisão do grupo |
| `--color-accent-brand` `#f37021` | Laranja puro: bordas e marcadores gráficos (**nunca** para texto) |
| `success` · `warning` · `danger` · `info` | Status. Cada um tem `-subtle` (fundo) e, quando preciso, `--color-on-*-subtle` (texto sobre o fundo) |
| `--color-text` / `-secondary` / `-muted` | Título · parágrafo · metadado. Não crie cinzas mais claros: hierarquia vem de tamanho e peso |
| `--color-bg` / `-card` / `-subtle` / `-inset` | Página · cartão · área suave · área rebaixada |
| `--color-border` / `-subtle` / `-strong` | Bordas |

Todos os pares de texto e fundo passam 4,5:1 (WCAG AA). Texto sobre fundo colorido usa
`--color-on-primary` ou `--color-white`.

## Tipografia e escala

- Fonte do sistema (`--font-sans`: Segoe UI na TV com Windows). Não há fonte para baixar, então
  funciona offline.
- Escala em `rem`: `--text-xs` 12 · `sm` 14 · `base` 16 · `md` 18 · `lg` 20 · `xl` 24 · `2xl` 30 ·
  `3xl` 40 (valores a 100%).
- **Escala da interface** (Ferramentas → Escala): muda o `font-size` do `<html>` (100, 85, 75, 65 e
  55%). Por isso tudo é medido em `rem`. O padrão é 85%. O quadro de fluxo tem zoom próprio e usa px.
- Um `<h1>` por página. Números em métricas, rankings e tabelas usam `font-variant-numeric: tabular-nums`.
- Maiúscula só no início da frase ("Grupo do encontro", não "Grupo Do Encontro"). Nada de rótulos
  em caixa alta.

## Toque

- Alvo mínimo `--touch` (3,5 rem ≈ 48 px a 85%). Botões pequenos (`.small`) usam `--touch-sm`
  e só aparecem em áreas secundárias.
- Ações de arrastar ficam no quadro e no kanban. Toda ação de arrastar tem alternativa por toque
  (abrir o card e escolher a coluna ou o responsável).

---

## Padrões de página

Cada etapa segue a mesma ordem:

1. **Cabeçalho** (`Render.head`): "Etapa N de 8", título, uma frase de descrição e, à direita, as
   ações. A principal (`primary`) vem por último.
2. **Resumo**, quando houver: faixa de números (`numbers()`) ou linha de progresso.
3. **Conteúdo.**
4. **Rodapé de navegação** (`Render.stepFoot`): etapa anterior à esquerda e próxima à direita.

O quadro de trabalho (etapa 5) é a exceção: cabeçalho compacto e área de trabalho com altura total.

## Componentes

Antes de criar um elemento, procure aqui. Não duplique.

| Componente | Onde | Quando usar |
|---|---|---|
| Botões `primary` `secondary` `ghost` `accent` `danger` `danger-ghost` `icon-button` `small` `chosen` | `base.css` | `primary`: uma por área. `accent`: decisão do grupo (confirmar demanda). `danger-ghost`: excluir dentro de janelas, à esquerda do rodapé |
| `badge(texto, tom)` | `core.js` | Selos: área (`outline`), status (`statusTone`), presença (`presenceTone`) |
| `numbers([[valor, rótulo]])` | `core.js` | Faixa de números no topo da tela. Um cartão, células separadas por linha fina. Nada de cartões coloridos empilhados |
| `notice(html, tom, ação)` | `core.js` | Aviso em linha: `info`, `warning`, `danger`, `success` |
| `empty(título, texto, ação, rótulo, ícone)` | `core.js` | Estado vazio. Ação `…-go` mostra seta (navegar); as demais mostram + (criar) |
| `actionMenu(rótulo, itens)` | `core.js` | Menu "⋯" com as ações secundárias de um item. Excluir fica em vermelho, depois de um separador |
| `.card`, `.grid-cards`, `.stack-list` | `components.css` | Cartões e listas |
| `.segmented` | `components.css` | Filtro curto (2 a 4 opções) com `aria-pressed` |
| `.toolbar` + `.search` | `components.css` | Busca e filtros acima de uma lista |
| `Dialog.open` / `Dialog.confirm` | `dialog.js` | Janelas. Rodapé: secundário, depois principal; excluir à esquerda. Conteúdo largo: envolva em `.dialog-wide` |
| `.selection-list` + `.sel-item` + `.sel-text` | `components.css` | Listas de escolha em janelas (sessões, ciclos, backup) |
| `Feedback.toast(texto, desfazer)` | `history.js` | Confirmação curta. Com `true`, oferece Desfazer |

## Textos

- **Vocabulário:** *demanda* é o problema registrado (nunca "oportunidade"). *Classificar* é dar as
  seis notas. *Ciclo* é cada vez que uma demanda é trabalhada. *Participante* é a pessoa do encontro.
- **Plural:** `plural(n, 'demanda')` → "1 demanda", "3 demandas". Nunca "demanda(s)".
- **Números:** pontos são inteiros ("92 pontos", "92 de 100"). Datas no formato pt-BR (`fmt`).
- **Sem jargão técnico:** nada de IDs, "IndexedDB", "JSON v3" ou nomes de versão internos na interface.
  "Dados locais" e "neste navegador" bastam.
- **Erros** dizem o que aconteceu e o que fazer.

## Movimento

- Anime só `transform`, `opacity` e cores. Duração de 150 a 250 ms (`--dur`). Entradas com
  `--ease-out`.
- Botões respondem ao toque com `scale(.97)`.
- `prefers-reduced-motion` desliga as transições (`base.css`).

## Responsivo

| Largura | Comportamento |
|---|---|
| ≥ 1100 px | Menu lateral fixo (pode recolher em trilho com os números das etapas) |
| < 1100 px | Rótulos opcionais do topo somem; kanban empilha a lista de responsáveis |
| ≤ 760 px | Menu vira gaveta; ações do cabeçalho ocupam a largura; tabelas rolam dentro do próprio bloco |

## Checklist antes de entregar

- [ ] Usa só tokens e componentes existentes (`npm run check` passa).
- [ ] Contraste ≥ 4,5:1.
- [ ] Sem rolagem lateral em 390 px. Todas as 8 etapas visíveis no menu em 1366×768.
- [ ] Alvos de toque ≥ `--touch-sm`; ações principais ≥ `--touch`.
- [ ] Estados de vazio, carregando e erro presentes.
- [ ] Foco visível e teclado (Tab, Esc, Enter nos cards) funcionando.
- [ ] Texto em pt-BR, vocabulário e plurais corretos.
- [ ] `npm test` passa.
