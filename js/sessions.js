'use strict';
/* Hub EMR · Sessões, ciclos, status/histórico de demanda, menu de dados e ajuda. */
const Sessions = {
    open() {
        const ss = [...State.data.sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        Dialog.open('Sessões do Touch Board', `<p class="muted">Abra um encontro anterior ou comece uma sessão independente.</p><div class="selection-list">${ss.map(s=>button('session-open',`<span><b>${esc(s.title)}</b><small style="display:block;margin-top:6px">${fmt(s.date)} · ${s.participantIds.length} pessoas · ${s.demandIds.length} demandas</small></span>${s.id===State.session().id?'<span class="badge green">Atual</span>':icon('arrow')}`,'',`type="button" data-id="${s.id}"`)).join('')}</div>`, button('session-new', icon('plus') + 'Nova sessão', 'primary', 'type="button"') + button('modal-close', 'Fechar', '', 'type="button"'))
    },
    edit(isNew = false) {
        const s = State.session();
        Dialog.open(isNew ? 'Criar nova sessão' : 'Identificação do encontro', field('title', 'Título do encontro', isNew ? '' : s.title, 'text', true, 'maxlength="250"') + field('date', 'Data', isNew ? Utils.date() : s.date, 'date', true), saveFooter(isNew ? 'Criar sessão' : 'Salvar encontro'), () => {
            const v = formValues();
            if (!v.title.trim() || !v.date) return Dialog.error('Preencha título e data.');
            Facilitator.flush();
            History.commit(isNew ? 'Nova sessão criada' : 'Identificação do encontro atualizada', () => {
                if (isNew) {
                    const n = newSession(v.title.trim(), v.date);
                    State.data.sessions.push(n);
                    State.data.activeSessionId = n.id
                } else Object.assign(s, {
                    title: v.title.trim(),
                    date: v.date
                })
            });
            Dialog.close();
            if (isNew) {
                State.step = 0;
                State.reviewUnlocked = false;
                State.selectedDemand = null
            }
            Render.header();
            Render.page();
            Feedback.toast(isNew ? 'Sessão criada. Cadastre ou copie os participantes.' : 'Encontro atualizado.', true)
        })
    },
    select(id) {
        Facilitator.flush();
        History.commit('Sessão aberta', () => State.data.activeSessionId = id);
        State.step = 0;
        State.reviewUnlocked = false;
        State.selectedDemand = null;
        Dialog.close();
        Render.header();
        Render.page()
    },
    cycles(demandId = null) {
        const cs = [...State.data.cycles].filter(c => !demandId || c.demandId === demandId).sort((a, b) => b.selectedAt.localeCompare(a.selectedAt));
        Dialog.open('Histórico de ciclos de trabalho', `<div class="selection-list">${cs.map(c=>{const d=State.data.demands.find(x=>x.id===c.demandId),s=State.data.sessions.find(x=>x.id===c.sessionId);return button('cycle-open',`<span><b>${esc(d.title)}</b><small style="display:block">${fmt(c.selectedAt)} · ${esc(s.title)} · ${c.tasks.length} atividades</small></span>${icon('arrow')}`,'',`type="button" data-id="${c.id}"`)}).join('')||'<p>Nenhum ciclo registrado.</p>'}</div>`, button('modal-close', 'Fechar', '', 'type="button"'))
    },
    openCycle(id) {
        const c = State.data.cycles.find(x => x.id === id);
        History.commit('Ciclo anterior aberto', () => {
            State.data.activeSessionId = c.sessionId;
            State.session().selectedCycleId = c.id
        });
        State.reviewUnlocked = false;
        Dialog.close();
        State.step = 4;
        State.workView = 'flow';
        State.flowKind = 'asis';
        Render.header();
        Render.page()
    }
};

function demandStatus(id) {
    const d = State.data.demands.find(x => x.id === id);
    Dialog.open('Status da demanda', `<h3>${esc(d.title)}</h3>` + selectField('status', 'Situação', Statuses, d.status), saveFooter(), () => {
        const v = formValues();
        if (v.status === 'Classificada' && !Classification.complete(d)) return Dialog.error('Responda os seis critérios antes de marcar como classificada.');
        History.commit('Status da demanda: ' + v.status, () => d.status = v.status, id);
        Dialog.close();
        Render.page();
        Feedback.toast('Status atualizado.', true)
    })
}

function demandHistory(id) {
    const d = State.data.demands.find(x => x.id === id);
    Dialog.open('Histórico da demanda', `<h3>${esc(d.title)}</h3><p class="muted">Origem: ${esc(State.data.sessions.find(x=>x.id===d.originSessionId)?.title||'—')} · ${fmt(d.createdAt)}</p><h3>Escolhas e ciclos</h3><ol class="history-list">${d.selections.map(x=>`<li>${new Date(x.at).toLocaleString('pt-BR')} · ${esc(State.data.sessions.find(s=>s.id===x.sessionId)?.title||'—')}</li>`).join('')||'<li>Ainda não selecionada.</li>'}</ol><h3>Alterações registradas</h3><ol class="history-list">${[...d.history].reverse().map(x=>`<li>${new Date(x.at).toLocaleString('pt-BR')} · ${esc(x.label)}${x.changes&&Object.keys(x.changes).length?`<div class="hint" style="margin:8px 0">${Object.entries(x.changes).map(([key,v])=>`<p><b>${esc(({area:'Área',title:'Título',description:'Descrição',ratings:'Notas',status:'Status',tieOrder:'Desempate'})[key]||key)}:</b> ${esc(Array.isArray(v.before)?v.before.map(n=>n===null?'vazio':n).join(', '):v.before??'—')} → ${esc(Array.isArray(v.after)?v.after.map(n=>n===null?'vazio':n).join(', '):v.after??'—')}</p>`).join('')}</div>`:''}</li>`).join('')||'<li>Sem alterações registradas.</li>'}</ol>`, button('modal-close', 'Fechar', '', 'type="button"'))
}

function dataMenu() {
    Dialog.open('Dados e recuperação', `<div class="hint">Todas as ações são salvas no IndexedDB deste navegador. Use o backup JSON para transferir os dados para outro computador ou recuperar a base após limpar o navegador.</div><p><b>Base atual:</b> ${State.data.sessions.length} sessões · ${State.data.demands.length} demandas · ${State.data.cycles.length} ciclos</p><div class="stack">${button('export-all',icon('download')+'Exportar backup completo','primary','type="button"')}${button('export-session',icon('download')+'Exportar sessão e histórico vinculado','','type="button"')}${button('import-open',icon('upload')+'Importar JSON v3','','type="button"')}</div><small>A exportação da sessão inclui as sessões de origem e os ciclos das demandas vinculadas, para manter referências e histórico. A importação valida os dados antes de adicionar ou substituir.</small>`, button('modal-close', 'Fechar', '', 'type="button"'))
}

function help() {
    Dialog.open('Como conduzir o encontro', `<div class="stack"><p><b>1. Prepare.</b> Crie a sessão e cadastre participantes. O botão no topo mantém a lista acessível em todas as etapas.</p><p><b>2. Mapeie e avalie.</b> Registre área, título e descrição. Avalie os seis critérios de 0 a 5. Zero vale como resposta; vazio não vale.</p><p><b>3. Decida.</b> Confirme a primeira demanda no ranking. Empates por pontuação, Impacto e Viabilidade exigem decisão do grupo.</p><p><b>Teclado no touch.</b> Toque em um campo de texto para abrir o teclado compacto. Arraste o cabeçalho para reposicioná-lo; use áé para acentos, 123 para números e OK para o próximo campo. Ele não abre com mouse e fecha ao usar o teclado físico. Campos de data e listas mantêm os controles nativos.</p><p><b>Mais espaço.</b> Use o botão de menu no canto superior esquerdo para recolher ou abrir a navegação. Na área de trabalho, Detalhes reúne status, histórico de ciclos e revisão do facilitador.</p><p><b>4. Desenhe o processo.</b> No fluxo, toque em Novo item ou segure o fundo por 0,5 s. Arraste os elementos e conecte os pontos azuis. Toque na conexão para editar. Desloque o fundo com um dedo; use dois dedos para zoom. O botão de porcentagem enquadra o fluxo.</p><p><b>5. Execute.</b> No Kanban, Novo post-it pede só o título. Toque no card para detalhes. Segure o card parado por 0,5 s até o aviso de arraste e mova-o. Arraste uma pessoa da lista para adicionar. Cada responsável vira uma etiqueta abaixo do título: arraste-a para outro card para mover ou para fora de todos os cards para retirar o vínculo. Um toque na etiqueta também abre as opções.</p><p><b>6. Use gestos com intenção.</b> Desenhe ✓ com um traço de baixo para cima à direita, sem pausar. Para cancelar, desenhe dois traços diagonais cruzados em até 0,75 s entre eles. Faça o gesto dentro do card, com pelo menos 45 px de largura e 30 px de altura. Para avançar ou voltar uma coluna, desenhe uma seta → ou ← em dois traços: uma haste horizontal e, em seguida, a ponta em forma de &gt; ou &lt;, dentro do card. Um simples risco ou deslize não move a atividade. Não há traço visível nem notificação. Traços ambíguos não alteram a atividade. Use Desfazer se necessário.</p><p><b>7. Revise e compartilhe.</b> Consolide as informações no modo do facilitador, selecione as seções e use Imprimir / PDF. Na janela do navegador, escolha Salvar como PDF e papel A4; desative cabeçalhos e rodapés do navegador se desejar.</p><p><b>8. Continue.</b> O backlog mantém todas as demandas. Iniciar novo ciclo preserva os ciclos e a avaliação anterior.</p><div class="hint">Multitoque depende da tela e do navegador. Cada card aceita uma pessoa por vez; cards diferentes podem ser manipulados simultaneamente. Teste os gestos na tela física antes da reunião.</div><p class="muted">Abra este HTML diretamente em um navegador atualizado com IndexedDB (Edge, Chrome ou Firefox). Use o mesmo navegador e mantenha o arquivo no mesmo local para retomar a base. No modo privado, os dados podem ser apagados ao fechar. Exporte um backup JSON ao final do encontro.</p></div>`, button('modal-close', 'Entendi', 'primary', 'type="button"'))
}
