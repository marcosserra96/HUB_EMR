# Hub EMR Touch 4.0 — Prévia

Interface corporativa para maratonas de melhoria e automação. Regras de negócio da v3 preservadas; dados de sessões, participantes, fluxos e tarefas armazenados **no IndexedDB do navegador**. O código está disponível na Vercel como aplicativo estático/PWA; não há backend para dados de sessões.

## Migrar dados
Antes de usar o novo endereço, exporte um JSON no aplicativo v3 e importe no v4. Cada origem (file://, localhost e URL de produção) usa armazenamento distinto. Não limpe os dados do navegador sem exportar backup.

## Publicação
Projeto Vercel com framework Other e diretório raiz /. Arquivos servidos estaticamente. Teste primeiro online; a aplicação fica disponível offline após cache do PWA. Não há sincronização entre máquinas.

## Status
Versão de testes. Funcionalidade multitoque na TV física e importação real ainda exigem validação. Não coloque backups ou informações corporativas reais no repositório.
