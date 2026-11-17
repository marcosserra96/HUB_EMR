# Hub de Melhoria & Automação · EMR

Quadro colaborativo para conduzir as maratonas de melhoria e automação da Energisa Minas Rio
numa TV de toque. O grupo segue oito etapas: participantes, mapeamento, classificação, ranking,
trabalho da demanda (fluxo AS IS / TO BE e kanban), revisão, relatório e backlog.

- **Uma ou duas frentes:** no ranking, o grupo confirma uma demanda ou escolhe *Trabalhar com duas
  demandas*. Com duas, o trabalho ganha abas: visão geral para acompanhar e uma aba colorida por
  equipe, com fluxo e kanban próprios.
- **Offline:** depois do primeiro acesso, funciona sem internet (PWA).
- **Dados locais:** tudo fica no navegador onde o encontro foi feito. Não há servidor nem
  sincronização entre máquinas.
- **Versão:** 6.1.1

## Uso no encontro

1. Abra o endereço publicado no navegador da TV (Edge ou Chrome) e use **Tela cheia**.
2. Em **Ferramentas → Escala da interface**, ajuste o tamanho ao da TV.
3. **Ao final, exporte um backup** em Ferramentas → Backup e dados. O app mostra a data do último
   backup completo. Cada endereço (produção, localhost, arquivo local) tem uma base própria: para
   levar os dados para outra máquina ou outro endereço, exporte e importe o JSON.
4. Não limpe os dados do navegador sem exportar antes. Não coloque backups com informações reais
   no repositório.

Para teste rápido sem servidor, o `index.html` também abre direto do disco.

## Atualização a partir da 4.x / 5.x

Os dados continuam no mesmo banco do navegador: no mesmo endereço, a versão 6.0 abre tudo o que
já estava lá, sem importar nada. Backups JSON das versões anteriores também são aceitos.

## Desenvolvimento

```bash
npm install     # instala o Playwright (só para os testes)
npm start       # http://localhost:8080
npm test        # regras do método e interface (Playwright)
npm run check   # verificações estáticas
```

Leia o [AGENTS.md](AGENTS.md) (arquitetura e regras) e o
[design system](design-system/hub-emr/MASTER.md) antes de alterar o código.

## Publicação

Vercel, site estático (framework "Other", raiz `/`). Não há etapa de build. Ao publicar uma
versão nova, siga o passo a passo de versão do AGENTS.md para que as TVs recebam os arquivos novos.

## Pendências conhecidas

- O multitoque e os gestos dependem da tela e do navegador. Valide-os na TV física antes de cada
  encontro.
