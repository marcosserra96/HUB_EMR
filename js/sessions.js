'use strict';
/* Hub EMR · Sessões, ciclos, status/histórico de demanda, menu de dados e ajuda. */
const Sessions = {
    open() {
        const ss = [...State.data.sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        Dialog.open('Sessões', `<p class="muted">Abra um encontro anterior ou comece uma sessão nova, com participantes e demandas próprios.</p><div class="selection-list">${ss.map(s=>button('session-open',`<span class="sel-text"><b>${esc(s.title)}</b><small>${fmt(s.date)} · ${plural(s.participantIds.length,'pessoa')} · ${plural(s.demandIds.length,'demanda')}</small></span>${s.id===State.session().id?badge('Atual','success'):icon('arrow')}`,'sel-item',`data-id="${s.id}"`)).join('')}</div>`, button('modal-close', 'Fechar', 'secondary') + button('session-new', icon('plus') + 'Nova sessão', 'primary'))
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
        Dialog.open('Histórico de ciclos de trabalho', `<div class="selection-list">${cs.map(c=>{const d=State.data.demands.find(x=>x.id===c.demandId),s=State.data.sessions.find(x=>x.id===c.sessionId);return button('cycle-open',`<span class="sel-text"><b>${esc(d?.title||'Demanda removida')}</b><small>${fmt(c.selectedAt)} · ${esc(s?.title||'—')} · ${plural(c.tasks.length,'atividade')}</small></span>${c.id===State.session().selectedCycleId?badge('Atual','success'):icon('arrow')}`,'sel-item',`data-id="${c.id}"`)}).join('')||'<p class="muted">Nenhum ciclo registrado ainda. Um ciclo começa quando o grupo confirma uma demanda no ranking.</p>'}</div>`, button('modal-close', 'Fechar', 'secondary'))
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
    Dialog.open('Status da demanda', `<p><b>${esc(d.title)}</b></p>` + selectField('status', 'Situação', Statuses, d.status), saveFooter(), () => {
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
    const sessionTitle = sid => esc(State.data.sessions.find(s => s.id === sid)?.title || '—');
    const labels = { area: 'Área', title: 'Título', description: 'Descrição', ratings: 'Notas', status: 'Status', tieOrder: 'Desempate' };
    const show = v => esc(Array.isArray(v) ? v.map(n => n === null ? 'vazio' : n).join(', ') : v ?? '—');
    Dialog.open('Histórico da demanda', `<div class="dialog-wide"><p><b>${esc(d.title)}</b></p><p class="muted">Registrada em ${fmt(d.createdAt)} · ${sessionTitle(d.originSessionId)}</p><h3 class="dialog-section">Ciclos de trabalho</h3><ol class="history-list">${d.selections.map(x=>`<li><time>${new Date(x.at).toLocaleString('pt-BR')}</time><span>${sessionTitle(x.sessionId)} · ${Utils.number(x.score)} pontos</span></li>`).join('')||'<li class="muted">Ainda não foi escolhida para um ciclo.</li>'}</ol><h3 class="dialog-section">Alterações</h3><ol class="history-list">${[...d.history].reverse().map(x=>`<li><time>${new Date(x.at).toLocaleString('pt-BR')}</time><span>${esc(x.label)}</span>${x.changes&&Object.keys(x.changes).length?`<ul class="changes">${Object.entries(x.changes).map(([key,v])=>`<li><b>${esc(labels[key]||key)}:</b> ${show(v.before)} → ${show(v.after)}</li>`).join('')}</ul>`:''}</li>`).join('')||'<li class="muted">Sem alterações registradas.</li>'}</ol></div>`, button('modal-close', 'Fechar', 'secondary'))
}

function dataMenu() {
    Dialog.open('Backup e dados', `${notice('Tudo fica salvo <b>somente neste navegador</b>. Exporte um backup ao final de cada encontro: é a forma de levar os dados para outro computador ou recuperá-los se o navegador for limpo.', 'warning')}<p class="muted">Base atual: ${plural(State.data.sessions.length,'sessão','sessões')} · ${plural(State.data.demands.length,'demanda')} · ${plural(State.data.cycles.length,'ciclo')}</p><div class="option-list">${button('export-all',icon('download')+'<span class="sel-text"><b>Exportar backup completo</b><small>Todas as sessões, demandas e ciclos</small></span>','sel-item')}${button('export-session',icon('download')+'<span class="sel-text"><b>Exportar esta sessão</b><small>Inclui as sessões de origem e os ciclos das demandas vinculadas</small></span>','sel-item')}${button('import-open',icon('upload')+'<span class="sel-text"><b>Importar backup JSON</b><small>Os dados são validados antes de adicionar ou substituir</small></span>','sel-item')}</div>`, button('modal-close', 'Fechar', 'secondary'))
}

function help() {
    const steps = [
        ['Prepare', 'Crie a sessão e cadastre os participantes. O botão de pessoas no topo mantém a lista acessível em todas as etapas.'],
        ['Mapeie', 'Registre área, título e descrição de cada problema. A avaliação vem depois, para não misturar diagnóstico e solução.'],
        ['Classifique', 'Dê notas de 0 a 5 nos seis critérios. Zero vale como resposta; sem nota, o critério fica pendente.'],
        ['Decida', 'Confirme a primeira demanda do ranking. Empate em pontuação, Impacto e Viabilidade pede decisão do grupo.'],
        ['Desenhe o processo', 'No fluxo, toque em Novo item ou segure o fundo por meio segundo. Arraste os elementos e conecte pelos pontos azuis. Toque numa linha para editá-la. Arraste o fundo para navegar e use dois dedos para zoom; o botão de porcentagem enquadra o fluxo.'],
        ['Distribua as atividades', 'No kanban, Novo post-it pede só o título. Toque no card para os detalhes; segure 0,5 s para movê-lo. Arraste uma pessoa da lista para vincular; arraste a etiqueta para outro card para mover ou para fora para retirar.'],
        ['Revise e compartilhe', 'Na revisão, consolide os textos e escolha as seções. No relatório, use Imprimir ou salvar PDF, papel A4.'],
        ['Continue', 'O backlog guarda todas as demandas. Iniciar novo ciclo preserva os ciclos e as avaliações anteriores.']
    ];
    Dialog.open('Como conduzir o encontro', `<div class="dialog-wide"><ol class="help-steps">${steps.map(([t,d])=>`<li><b>${t}</b><p>${d}</p></li>`).join('')}</ol><h3 class="dialog-section">Gestos nos cards do kanban</h3><ul class="help-list"><li><b>Concluir:</b> desenhe um ✓ num só traço, sem pausar.</li><li><b>Cancelar:</b> desenhe um X com dois traços cruzados, com no máximo 0,75 s entre eles.</li><li><b>Mudar de coluna:</b> desenhe uma seta → ou ← em dois traços (a haste e depois a ponta).</li><li>Faça o gesto dentro do card. Um risco simples não altera nada; use Desfazer se precisar.</li></ul><h3 class="dialog-section">Teclado e tela</h3><ul class="help-list"><li>Tocar num campo de texto abre o teclado da tela. Arraste o topo dele para reposicionar; use áé para acentos e 123 para números.</li><li>O botão no canto superior esquerdo recolhe o menu para dar mais espaço ao quadro.</li><li>Em Ferramentas, ajuste a escala da interface ao tamanho da TV.</li></ul>${notice('O multitoque depende da tela e do navegador. Teste os gestos na TV antes da reunião. Os dados ficam só neste navegador: no modo privado, podem ser apagados ao fechar. Exporte um backup ao final.','info')}</div>`, button('modal-close', 'Entendi', 'primary'))
}
