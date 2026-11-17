'use strict';
/* Hub EMR · Renderização das etapas.
   Cada etapa monta o próprio HTML a partir do estado. Edições rotineiras atualizam só o painel afetado
   (lista da classificação, resultados do mapeamento e do backlog); o quadro de fluxo e o kanban
   são atualizados pelos próprios módulos. Todo texto do usuário passa por esc(). */
const Render = {
    header() {
        Layout.refresh();
        const s = State.session();
        $('#sessionTitle').textContent = s.title;
        $('#sessionDate').textContent = fmt(s.date);
        const present = State.people().filter(p => p.status === 'Presente').length;
        $('#peopleCount').textContent = present;
        $('#peopleBtn').setAttribute('aria-label', plural(present, 'participante presente', 'participantes presentes') + '. Abrir lista.');
        const last = State.data.undo.at(-1);
        $('#undoBtn').disabled = !last;
        $('#undoBtn').title = last ? 'Desfazer: ' + last.label : 'Nada para desfazer';
        $('#undoBtn').setAttribute('aria-label', $('#undoBtn').title);
        this.backupStatus();
        this.navigation()
    },
    /** Data do último backup completo, mostrada em Ferramentas. */
    backupStatus() {
        const at = State.data.ui?.lastBackupAt,
            el = $('#backupStatus');
        if (!el) return;
        el.textContent = at ? 'Último: ' + new Date(at).toLocaleDateString('pt-BR') : 'Nenhum backup exportado';
        el.classList.toggle('warn', !at)
    },
    /** Indicadores de conclusão de cada etapa (usados no menu). */
    progress() {
        const n = State.activeDemands().length,
            c = State.activeDemands().filter(Classification.complete).length,
            cycle = State.cycle();
        return [State.people().length > 0, n > 0, n > 0 && c === n, !!cycle, !!cycle && (cycle.tasks.length > 0 || cycle.flows.asis.nodes.length > 0), !!State.review().savedAt, false, false]
    },
    navigation() {
        $('#currentStage').textContent = 'Etapa ' + (State.step + 1) + ' de 8 · ' + Steps[State.step][0];
        const done = this.progress();
        $('#navigation').innerHTML = Steps.map(([label], i) => {
            const group = StepGroups.find(g => g[1] === i);
            const current = i === State.step;
            return (group ? `<div class="nav-group" aria-hidden="true">${group[0]}</div>` : '') + `<button type="button" data-action="navigate" data-step="${i}" class="nav-item${current?' active':''}${done[i]?' done':''}" ${current?'aria-current="step"':''} title="${i+1}. ${label}${done[i]?' · concluída':''}"><span class="nav-num">${done[i]&&!current?icon('check'):i+1}</span><span class="nav-label">${label}</span></button>`
        }).join('')
    },
    /** Cabeçalho de página: etapa, título, descrição e ações (a principal por último, à direita). */
    head(index, actions = '') {
        return `<header class="pagehead"><div class="pagehead-text"><p class="eyebrow">Etapa ${index+1} de 8</p><h1>${Steps[index][0]}</h1><p class="lead">${Steps[index][1]}</p></div>${actions?`<div class="pagehead-actions">${actions}</div>`:''}</header>`
    },
    /** Navegação para a etapa anterior e a próxima, no fim da página. */
    stepFoot(index, nextLabel = '') {
        const prev = index > 0 ? button('navigate', icon('back') + Steps[index - 1][0], 'ghost', `data-step="${index-1}"`) : '<span></span>';
        const next = index < Steps.length - 1 ? button('navigate', (nextLabel || 'Próxima: ' + Steps[index + 1][0]) + icon('arrow'), 'secondary', `data-step="${index+1}"`) : '';
        return `<nav class="stepfoot" aria-label="Navegação entre etapas">${prev}${next}</nav>`
    },
    page() {
        if (TouchKeyboard.target && $('#content').contains(TouchKeyboard.target)) TouchKeyboard.hide();
        if (State.step !== 4) Flow.viewport = null;
        Menus.closeAll();
        const content = $('#content');
        const workspace = State.step === 4 && !!State.cycle();
        content.classList.toggle('work-content', workspace);
        content.dataset.step = State.step;
        const methods = ['participants', 'mapping', 'classification', 'ranking', 'work', 'facilitator', 'report', 'backlog'];
        content.innerHTML = this[methods[State.step]]();
        if (State.step === 1) this.mappingResults();
        if (State.step === 2) {
            this.classifyList();
            this.classifyDetail()
        }
        if (workspace) {
            if (State.workView === 'flow') Flow.mount();
            else Kanban.mount()
        }
        if (State.step === 5) Facilitator.bind();
        if (State.step === 7) this.backlogResults()
    },

    /* 1 · Participantes */
    participants() {
        const people = State.people(),
            count = status => people.filter(x => x.status === status).length;
        const actions = button('session-edit', icon('edit') + 'Editar encontro', 'secondary') + button('person-copy', icon('copy') + 'Copiar de outra sessão', 'secondary') + button('person-add', icon('plus') + 'Adicionar participante', 'primary');
        const list = people.length ? `<div class="grid-cards people-grid">${people.map(p=>`<article class="card person-card${p.status==='Inativa'?' inactive':''}"><div class="avatar" aria-hidden="true">${esc(Utils.initials(p.name))}</div><div class="person-text"><h3>${esc(p.name)}</h3><p>${esc(p.area)}</p>${badge(esc(p.status),presenceTone(p.status))}</div>${button('person-edit',icon('edit'),'icon-button',`data-id="${p.id}" aria-label="Editar ${esc(p.name)}" title="Editar"`)}</article>`).join('')}</div>` : empty('Quem vai construir a melhoria?', 'Cadastre nome, área e presença de cada pessoa. A lista fica disponível no botão de participantes do topo durante todo o encontro.', 'person-add', 'Adicionar participante', 'people');
        return this.head(0, actions) + numbers([
            [count('Presente'), 'Presentes'],
            [count('Prevista'), 'Previstos'],
            [count('Ausente') + count('Inativa'), 'Ausentes ou inativos'],
            [State.activeDemands().length, 'Demandas no encontro']
        ], 'Resumo do encontro') + (people.length ? `<div class="section-head"><h2>Grupo do encontro</h2><span class="count">${plural(people.length,'pessoa')}</span></div>` : '') + list + this.stepFoot(0)
    },

    /* 2 · Mapeamento */
    mapping() {
        const ds = State.activeDemands();
        const toolbar = ds.length ? `<div class="toolbar"><label class="search"><span class="visually-hidden">Buscar demandas</span>${icon('search')}<input id="mapSearch" type="search" placeholder="Buscar por título, área ou descrição" value="${esc(State.mapSearch)}" autocomplete="off"></label><div class="segmented" role="group" aria-label="Filtrar demandas">${[['all','Todas'],['pending','Não classificadas'],['complete','Classificadas']].map(([id,label])=>`<button type="button" data-action="map-filter" data-filter="${id}" class="${State.mapFilter===id?'chosen':''}" aria-pressed="${State.mapFilter===id}">${label}<span class="seg-count" data-map-count="${id}"></span></button>`).join('')}</div></div>` : '';
        return this.head(1, button('demand-add', icon('plus') + 'Registrar demanda', 'primary')) + toolbar + `<div id="mapResults"></div>` + this.stepFoot(1)
    },
    mappingResults() {
        const root = $('#mapResults');
        if (!root) return;
        const ds = State.activeDemands();
        if (!ds.length) {
            root.innerHTML = empty('Qual problema está atrapalhando?', 'Registre área, título e descrição de cada problema levantado pelo grupo. Os critérios são avaliados na próxima etapa.', 'demand-add', 'Registrar primeira demanda', 'flag');
            return
        }
        const term = State.mapSearch.trim().toLocaleLowerCase('pt-BR');
        const byText = ds.filter(d => !term || (d.title + ' ' + d.area + ' ' + d.description).toLocaleLowerCase('pt-BR').includes(term));
        const counts = {
            all: byText.length,
            pending: byText.filter(d => !Classification.complete(d)).length,
            complete: byText.filter(Classification.complete).length
        };
        for (const [id, n] of Object.entries(counts)) {
            const el = $(`[data-map-count="${id}"]`);
            if (el) el.textContent = n
        }
        const shown = byText.filter(d => State.mapFilter === 'all' || (State.mapFilter === 'complete') === Classification.complete(d));
        root.innerHTML = shown.length ? `<div class="grid-cards demand-grid">${shown.map(d=>{const dup=Demands.duplicates(d),n=ds.indexOf(d)+1,answered=d.ratings.filter(x=>x!==null).length,done=Classification.complete(d);return `<article class="card demand-card"><div class="card-top"><span class="card-number" aria-label="Demanda ${n}">${String(n).padStart(2,'0')}</span>${badge(esc(d.area),'outline')}<span class="card-date">${fmt(d.createdAt)}</span></div><h3>${esc(d.title)}</h3><p class="desc">${esc(d.description)||'<span class="muted">Sem descrição.</span>'}</p>${dup.length?notice('Possível duplicidade com: '+dup.map(x=>'<b>'+esc(x.title)+'</b>').join('; ')+'. Revise com o grupo.','warning'):''}<footer class="card-foot">${done?badge(icon('check')+'Classificada','success'):badge(answered?answered+' de 6 critérios':'Não classificada')}<div class="card-actions">${button('demand-edit',icon('edit')+'Editar','ghost',`data-id="${d.id}"`)}${actionMenu('Mais ações para '+d.title,[{action:'demand-archive',label:'Arquivar',icon:'archive',attrs:`data-id="${d.id}"`},null,{action:'demand-delete',label:'Excluir',icon:'trash',danger:true,attrs:`data-id="${d.id}"`}])}</div></footer></article>`}).join('')}</div>` : `<div class="empty compact"><h2>Nenhuma demanda encontrada</h2><p>Ajuste a busca ou o filtro.</p></div>`
    },

    /* 3 · Classificação */
    classification() {
        const ds = State.activeDemands(),
            done = ds.filter(Classification.complete).length;
        if (!ds.length) return this.head(2) + empty('Nenhuma demanda para avaliar', 'Comece registrando os problemas no mapeamento.', 'mapping-go', 'Abrir mapeamento', 'flag') + this.stepFoot(2);
        return this.head(2) + `<div class="progress-line"><span id="classProgress">${done} de ${ds.length} demandas classificadas</span><div class="progress" role="progressbar" aria-label="Demandas classificadas" aria-valuemin="0" aria-valuemax="${ds.length}" aria-valuenow="${done}"><span id="classProgressBar" style="width:${done/ds.length*100}%"></span></div></div><div class="classify"><nav class="demand-list" id="classList" aria-label="Demandas para classificar"></nav><section id="classDetail" aria-live="polite"></section></div>` + this.stepFoot(2)
    },
    classifyList() {
        const root = $('#classList');
        if (!root) return;
        const ds = State.activeDemands();
        if (!ds.some(x => x.id === State.selectedDemand)) State.selectedDemand = ds[0]?.id;
        root.innerHTML = ds.map((d, i) => {
            const answered = d.ratings.filter(n => n !== null).length,
                done = Classification.complete(d);
            return button('class-select', `<span class="dl-num">${String(i+1).padStart(2,'0')}</span><span class="dl-text"><b>${esc(d.title)}</b><small>${esc(d.area)} · ${done?'classificada':answered+' de 6'}</small></span><span class="dl-state${done?' done':''}" aria-hidden="true">${done?icon('check'):''}</span>`, 'dl-item' + (d.id === State.selectedDemand ? ' selected' : ''), `data-id="${d.id}" aria-pressed="${d.id===State.selectedDemand}"`)
        }).join('');
        const n = ds.filter(Classification.complete).length;
        $('#classProgress').textContent = n + ' de ' + ds.length + ' demandas classificadas';
        $('#classProgressBar').style.width = (ds.length ? n / ds.length * 100 : 0) + '%';
        $('#classProgressBar').parentElement.setAttribute('aria-valuenow', n)
    },
    classifyDetail() {
        const root = $('#classDetail');
        if (!root) return;
        const d = State.activeDemands().find(x => x.id === State.selectedDemand);
        if (!d) {
            root.innerHTML = '';
            return
        }
        const answered = d.ratings.filter(n => n !== null).length;
        root.innerHTML = `<div class="card classify-card"><header class="classify-head"><div>${badge(esc(d.area),'outline')}<h2>${esc(d.title)}</h2>${d.description?`<p class="desc">${esc(d.description)}</p>`:''}</div><div class="score-box" aria-label="Pontuação"><b id="classificationScore">${Utils.number(Classification.score(d))}</b><span>de 100${answered<6?'<br>parcial':''}</span></div></header><p class="scale-legend"><b>Escala:</b> 0 inexistente ou não aplicável · 1 muito baixo · 2 baixo · 3 moderado · 4 alto · 5 muito alto. Sem nota = não respondido.</p><div class="criteria">${Criteria.map(([name,weight,q],i)=>`<section class="criterion${d.ratings[i]===null?'':' answered'}" aria-label="${name}"><div class="criterion-head"><h3>${name}</h3><span class="weight">Peso ${weight}%</span></div><p>${q}</p><div class="scale" role="group" aria-label="${name}, nota de 0 a 5">${Scale.map((label,n)=>`<button type="button" class="${d.ratings[i]===n?'chosen':''}" data-action="rate" data-id="${d.id}" data-index="${i}" data-value="${n}" aria-pressed="${d.ratings[i]===n}" aria-label="${name}: ${n}, ${label}" title="${n} · ${label}">${n}</button>`).join('')}</div><div class="criterion-foot"><small>${d.ratings[i]===null?'Não respondido':esc(Scale[d.ratings[i]])+' · '+plural(d.ratings[i]/5*weight,'ponto')}</small>${d.ratings[i]===null?'':button('clear-rating','Limpar','ghost small',`data-id="${d.id}" data-index="${i}" aria-label="Limpar nota de ${name}"`)}</div></section>`).join('')}</div><footer class="classify-foot">${answered===6?badge(icon('check')+'Classificação concluída','success'):badge(answered+' de 6 critérios respondidos')}${button('class-next','Salvar e avaliar a próxima'+icon('arrow'),'primary',answered<6?'disabled':'')}</footer></div>`
    },

    /* 4 · Ranking */
    ranking() {
        const active = State.activeDemands(),
            ranked = Ranking.sort(active.filter(Classification.complete)),
            incomplete = active.filter(d => !Classification.complete(d)),
            first = ranked[0],
            ties = Ranking.topTies(),
            resolved = ties.length <= 1 || ties.some(x => x.tieOrder !== null),
            cycle = State.cycle(),
            working = State.demand();
        const actions = cycle && working?.id !== first?.id ? button('navigate', 'Abrir trabalho' + icon('arrow'), 'secondary', 'data-step="4"') : '';
        if (!active.length) return this.head(3, actions) + empty('O ranking nasce da avaliação', 'Registre e classifique as demandas para comparar as prioridades.', 'mapping-go', 'Abrir mapeamento', 'trophy') + this.stepFoot(3);
        const rule = `<p class="rule">${icon('info')}<span>Nota de cada critério = nota ÷ 5 × peso; a soma vai de 0 a 100. Desempate: Impacto, depois Viabilidade, depois decisão do grupo.</span></p>`;
        const pending = incomplete.length ? notice(`<b>${plural(incomplete.length,'demanda ainda não foi classificada','demandas ainda não foram classificadas')}.</b> ${incomplete.length===1?'Ela fica':'Elas ficam'} fora do ranking até a classificação ser concluída.`, 'warning', button('navigate', 'Completar classificação', 'secondary small', 'data-step="2"')) : '';
        const tieBlocks = Ranking.tieGroups().map(group => `<section class="card tie-card"><h3>Decisão do grupo · ${plural(group.length,'demanda empatada','demandas empatadas')} com ${Utils.number(Classification.score(group[0]))} pontos</h3><p>Pontuação, Impacto e Viabilidade iguais. Toque na demanda que o grupo escolheu para colocá-la à frente das demais deste empate.</p><div class="tie-options">${group.map(d=>button('tie-choose',(d.tieOrder===0?icon('check'):'')+esc(d.title),d.tieOrder===0?'chosen':'secondary',`data-id="${d.id}" aria-pressed="${d.tieOrder===0}"`)).join('')}</div></section>`).join('');
        const rows = ranked.map((d, i) => {
            const top = d.id === first?.id,
                inWork = working?.id === d.id,
                open = State.expanded.has(d.id);
            const canConfirm = top && resolved;
            return `<article class="card rank-card${top?' recommended':''}"><div class="rank-position" aria-label="Posição ${i+1}">${i+1}</div><div class="rank-main"><div class="rank-badges">${badge(esc(d.area),'outline')}${top?badge(icon('trophy')+'Recomendada','accent'):''}${inWork?badge('Em trabalho','info'):''}${d.tieOrder===0?badge('Escolhida no desempate','info'):''}</div><h3>${esc(d.title)}</h3>${top?`<div class="rank-actions">${inWork?button('navigate','Abrir trabalho'+icon('arrow'),'accent','data-step="4"')+button('rank-confirm','Iniciar novo ciclo','ghost',`data-id="${d.id}" ${canConfirm?'':'disabled'}`):button('rank-confirm',icon('check')+'Confirmar demanda','accent',`data-id="${d.id}" ${canConfirm?'':'disabled'}`)}</div>`:''}${top&&!resolved?'<p class="rank-wait">Resolva o empate acima para confirmar.</p>':''}</div>${button('rank-expand',(open?'Ocultar notas':'Ver notas'),'ghost small rank-toggle',`data-id="${d.id}" aria-expanded="${open}"`)}<div class="rank-score"><b>${Utils.number(Classification.score(d))}</b><span>pontos</span></div>${open?`<div class="rank-detail">${Criteria.map(([name,weight],j)=>`<div class="rank-crit"><span>${name} · ${weight}%</span><b>${d.ratings[j]}/5</b><small>${Utils.number(d.ratings[j]/5*weight)} pts</small></div>`).join('')}</div>`:''}</article>`
        }).join('');
        const rest = incomplete.length ? `<div class="section-head"><h2>Aguardando classificação</h2><span class="count">${plural(incomplete.length,'demanda')}</span></div><div class="stack-list">${incomplete.map(d=>`<article class="card rank-pending"><div><h3>${esc(d.title)}</h3><p>${esc(d.area)} · ${(n=>n?n+' de 6 critérios · '+Utils.number(Classification.score(d))+' pontos parciais':'sem notas')(d.ratings.filter(n=>n!==null).length)}</p></div>${button('backlog-classify','Classificar','secondary small',`data-id="${d.id}"`)}</article>`).join('')}</div>` : '';
        return this.head(3, actions) + rule + pending + tieBlocks + (ranked.length ? `<div class="stack-list">${rows}</div>` : empty('Nenhuma demanda classificada', 'Conclua a classificação de ao menos uma demanda para montar o ranking.', '', '', 'trophy')) + rest + this.stepFoot(3)
    },

    /* 5 · Trabalho da demanda */
    work() {
        const d = State.demand(),
            c = State.cycle();
        if (d?.status === 'Arquivada') return this.head(4) + empty('Demanda arquivada', 'Esta demanda está preservada no histórico. Restaure-a no backlog para retomar o trabalho.', '', '', 'archive') + this.stepFoot(4);
        if (!d || !c) return this.head(4) + empty('Escolha uma demanda para começar', 'Ao confirmar a demanda no ranking, um ciclo de trabalho é aberto com fluxos AS IS, TO BE e o kanban de atividades.', 'ranking-go', 'Abrir ranking', 'flow') + this.stepFoot(4);
        const n = State.data.cycles.filter(x => x.demandId === d.id).indexOf(c) + 1;
        return `<div class="work-header"><div class="work-context"><p class="eyebrow">Etapa 5 de 8 · ${esc(d.area)} · ciclo ${n}</p><h1 title="${esc(d.title)}">${esc(d.title)}</h1></div><div class="work-actions"><div class="segmented" role="group" aria-label="Visualização">${button('work-view',icon('flow')+'Fluxo',State.workView==='flow'?'chosen':'','data-view="flow" aria-pressed="'+(State.workView==='flow')+'"')}${button('work-view',icon('board')+'Kanban',State.workView==='kanban'?'chosen':'','data-view="kanban" aria-pressed="'+(State.workView==='kanban')+'"')}</div>${State.workView==='kanban'?button('task-add',icon('plus')+'Novo post-it','primary'):''}${button('work-details',icon('info')+'Detalhes','secondary','title="Detalhes, status, ciclos e revisão da demanda"')}</div></div><section id="workspace">${State.workView==='flow'?Flow.html():Kanban.html()}</section>`
    },

    /* 6 · Revisão */
    facilitator() {
        const r = State.review();
        const groups = [
            ['Identificação', ['process', 'area', 'owner']],
            ['Problema e mudança', ['problem', 'current', 'change', 'benefit']],
            ['Indicadores', ['indicator', 'baseline', 'target', 'result']],
            ['Encaminhamentos', ['next', 'executive']]
        ];
        /* Campos curtos ficam lado a lado; o texto executivo ocupa a linha inteira. */
        const short = ['process', 'area', 'owner', 'indicator', 'baseline', 'target', 'result', 'problem', 'current', 'change', 'benefit', 'next'];
        const label = key => ReviewFields.find(x => x[0] === key)[1];
        const actions = button('pin-config', icon('lock') + (State.session().pinHash ? 'Alterar PIN' : 'Definir PIN'), 'secondary') + button('report-go', icon('print') + 'Ver relatório', 'secondary') + button('review-save', icon('check') + 'Confirmar revisão', 'primary');
        const status = r.savedAt ? notice('Revisão confirmada em <b>' + new Date(r.savedAt).toLocaleString('pt-BR') + '</b>. As alterações seguintes também são salvas automaticamente.', 'success') : notice('Os textos são salvos automaticamente. Confirme a revisão quando o conteúdo estiver pronto para o relatório.', 'info');
        return this.head(5, actions) + status + `<div class="review-layout"><div class="review-fields" id="reviewFields">${groups.map(([title,keys])=>`<section class="card review-group"><h2>${title}</h2><div class="review-grid">${keys.map(key=>`<label class="${short.includes(key)?'':'wide'}">${label(key)}<textarea data-review-field="${key}" maxlength="20000" rows="${['process','area','owner','indicator','baseline','target'].includes(key)?2:3}">${esc(r.fields[key])}</textarea></label>`).join('')}</div></section>`).join('')}</div><aside class="review-side"><section class="card"><h2>Conferir com o grupo</h2><div class="shortcut-list">${button('people',icon('people')+'Participantes','secondary')}${button('ranking-go',icon('trophy')+'Ranking','secondary')}${button('review-flow-asis',icon('flow')+'Fluxo AS IS','secondary')}${button('review-flow-tobe',icon('flow')+'Fluxo TO BE','secondary')}${button('review-kanban',icon('board')+'Atividades','secondary')}</div></section><section class="card"><h2>Seções do relatório</h2><p class="muted">Marque o que aparece no PDF.</p><div class="section-checks">${ReportSections.map((title,i)=>`<label class="check"><input type="checkbox" data-report-section="${i}" ${r.include[i]?'checked':''}><span>${i+1}. ${title}</span></label>`).join('')}</div></section><p class="fine">O PIN evita acesso acidental a esta etapa. Não é autenticação corporativa: os dados continuam locais.</p></aside></div>` + this.stepFoot(5)
    },

    /* 7 · Relatório */
    report() {
        return this.head(6, button('review-go', icon('edit') + 'Revisar conteúdo', 'secondary') + button('export-session', icon('download') + 'Baixar JSON da sessão', 'secondary') + button('print', icon('print') + 'Imprimir ou salvar PDF', 'primary')) + Report.html() + this.stepFoot(6)
    },

    /* 8 · Backlog */
    backlog() {
        return this.head(7, button('cycle-history', icon('history') + 'Histórico de ciclos', 'secondary')) + `<div class="toolbar"${State.data.demands.length?'':' hidden'}><label class="search"><span class="visually-hidden">Buscar no backlog</span>${icon('search')}<input id="backlogSearch" type="search" placeholder="Buscar por título, área ou descrição" value="${esc(State.filter)}" autocomplete="off"></label><label class="select-inline"><span class="visually-hidden">Filtrar por status</span><select id="backlogStatus">${options([['','Todos os status'],...Statuses],State.statusFilter)}</select></label></div><div id="backlogResults" aria-live="polite"></div>` + this.stepFoot(7)
    },
    backlogResults() {
        const root = $('#backlogResults');
        if (!root) return;
        const term = State.filter.toLocaleLowerCase('pt-BR');
        const ds = Ranking.sort(State.data.demands.filter(d => (!State.statusFilter || d.status === State.statusFilter) && (!term || (d.title + ' ' + d.area + ' ' + d.description).toLocaleLowerCase('pt-BR').includes(term))));
        if (!State.data.demands.length) {
            root.innerHTML = empty('O backlog está vazio', 'As demandas registradas no mapeamento aparecem aqui, com todo o histórico.', 'mapping-go', 'Abrir mapeamento', 'archive');
            return
        }
        root.innerHTML = ds.length ? `<p class="result-count">${plural(ds.length,'demanda encontrada','demandas encontradas')}</p><div class="grid-cards demand-grid">${ds.map(d=>{
            const s = State.data.sessions.find(x => x.id === d.originSessionId),
                done = Classification.complete(d),
                archived = d.status === 'Arquivada';
            const main = archived ? button('demand-restore', icon('restore') + 'Restaurar', 'secondary', `data-id="${d.id}"`) : State.demand()?.id === d.id ? button('navigate', 'Abrir trabalho' + icon('arrow'), 'primary', 'data-step="4"') : done ? button('backlog-start', 'Iniciar novo ciclo', 'primary', `data-id="${d.id}"`) : button('backlog-classify', 'Completar classificação', 'secondary', `data-id="${d.id}"`);
            return `<article class="card demand-card${archived?' archived':''}"><div class="card-top">${badge(esc(d.area),'outline')}${badge(esc(d.status),statusTone(d.status))}</div><h3>${esc(d.title)}</h3><p class="desc">${esc(d.description)||'<span class="muted">Sem descrição.</span>'}</p><dl class="meta"><div><dt>Pontuação</dt><dd>${done?'<b>'+Utils.number(Classification.score(d))+'</b> de 100':'Classificação incompleta'}</dd></div><div><dt>Origem</dt><dd>${esc(s?.title||'—')} · ${fmt(d.createdAt)}</dd></div><div><dt>Histórico</dt><dd>${plural(d.selections.length,'ciclo')} · ${plural(d.history.length,'alteração','alterações')}</dd></div></dl><footer class="card-foot">${main}<div class="card-actions">${actionMenu('Mais ações para '+d.title,[{action:'demand-history',label:'Ver histórico',icon:'history',attrs:`data-id="${d.id}"`},{action:'backlog-edit',label:'Editar',icon:'edit',attrs:`data-id="${d.id}"`},{action:'backlog-status',label:'Alterar status',icon:'flag',attrs:`data-id="${d.id}"`},archived?false:{action:'demand-archive',label:'Arquivar',icon:'archive',attrs:`data-id="${d.id}"`},null,{action:'demand-delete',label:'Excluir',icon:'trash',danger:true,attrs:`data-id="${d.id}"`}])}</div></footer></article>`
        }).join('')}</div>` : `<div class="empty compact"><h2>Nenhuma demanda encontrada</h2><p>Ajuste a busca ou o filtro de status.</p></div>`
    }
};
