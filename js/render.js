'use strict';
/* Hub EMR · Renderização das etapas. */
const Render = {
    header() {
        Layout.refresh();
        const s = State.session();
        $('#sessionTitle').textContent = s.title + ' · ' + fmt(s.date);
        $('#peopleCount').textContent = State.people().filter(p => p.status === 'Presente').length;
        $('#undoBtn').disabled = !State.data.undo.length;
        this.navigation()
    },
    navigation() {
        $('#currentStage').textContent = (State.step + 1) + '/8 · ' + Steps[State.step][0];
        const n = State.activeDemands().length,
            c = State.activeDemands().filter(Classification.complete).length;
        const done = [State.people().length > 0, n > 0, n > 0 && c === n, !!State.cycle(), !!State.cycle() && (State.cycle().tasks.length > 0 || State.cycle().flows.asis.nodes.length > 0), !!State.review().savedAt, false, false];
        $('#navigation').innerHTML = Steps.map(([label], i) => `<button data-action="navigate" data-step="${i}" class="${i===State.step?'active':''} ${done[i]?'done':''}" ${i===State.step?'aria-current="step"':''} title="${i+1}. ${label}"><span class="num">${done[i]&&i!==State.step?icon('check'):i+1}</span><span class="navlabel">${label}</span></button>`).join('')
    },
    head(index, actions = '') {
        return `<div class="pagehead"><div><div class="eyebrow">Etapa ${index+1} de 8 · ${Steps[index][1]}</div><h1>${Steps[index][0]}</h1><p>${['Prepare o grupo e registre quem participa.','Primeiro, torne os problemas visíveis.','Transforme a percepção do grupo em uma avaliação consistente.','Compare as demandas e confirme a prioridade do grupo.','Do processo atual à execução da melhoria.','Revise o conteúdo que vai compor o relatório.','Uma visão executiva do encontro e do trabalho realizado.','Toda demanda mantém sua origem, avaliação e histórico.'][index]}</p></div><div class="row">${actions}</div></div>`
    },
    page() {
        if (TouchKeyboard.target && $('#content').contains(TouchKeyboard.target)) TouchKeyboard.hide();
        if (State.step !== 4) Flow.viewport = null;
        const content = $('#content');
        content.classList.toggle('work-content', State.step === 4 && !!State.cycle());
        const methods = ['participants', 'mapping', 'classification', 'ranking', 'work', 'facilitator', 'report', 'backlog'];
        content.innerHTML = this[methods[State.step]]();
        if (State.step === 2) {
            this.classifyList();
            this.classifyDetail()
        }
        if (State.step === 4 && State.cycle()) {
            if (State.workView === 'flow') Flow.mount();
            else Kanban.mount()
        }
        if (State.step === 5) Facilitator.bind();
        if (State.step === 7) this.backlogResults()
    },
    participants() {
        const p = State.people(),
            present = p.filter(x => x.status === 'Presente').length;
        return this.head(0, button('session-edit', icon('edit') + 'Editar encontro') + button('person-copy', icon('copy') + 'Copiar pessoas') + button('person-add', icon('plus') + 'Participante', 'primary')) + `<div class="grid3" style="margin-bottom:24px"><div class="panel stat"><span class="symbol">${icon('people')}</span><div><b>${present}</b><p>Presentes agora</p></div></div><div class="panel stat"><span class="symbol">${icon('clock')}</span><div><b>${p.filter(x=>x.status==='Prevista').length}</b><p>Pessoas previstas</p></div></div><div class="panel stat"><span class="symbol">${icon('flag')}</span><div><b>${State.activeDemands().length}</b><p>Demandas no encontro</p></div></div></div><div class="row between" style="margin-bottom:16px"><h2>O grupo deste encontro <span class="muted">/ ${p.length}</span></h2>${button('next-stage','Ir para mapeamento '+icon('arrow'),'','data-step="1"')}</div>` + (p.length ? `<div class="cards">${p.map(p=>`<article class="panel person-card"><div class="avatar">${esc(Utils.initials(p.name))}</div><div class="details"><h3>${esc(p.name)}</h3><div class="area">${esc(p.area)}</div><span class="badge ${p.status==='Presente'?'green':''}">${esc(p.status)}</span></div>${button('person-edit',icon('edit'),'icon',`data-id="${p.id}" aria-label="Editar ${esc(p.name)}"`)}</article>`).join('')}</div>` : empty('Quem vai construir a melhoria?', 'Cadastre nome, área e presença. A lista fica disponível pelo botão de participantes no topo, durante todo o encontro.', 'person-add', 'Adicionar participante', 'people'))
    },
    mapping() {
        const ds = State.demands().filter(d => d.status !== 'Arquivada');
        return this.head(1, button('demand-add', icon('plus') + 'Registrar problema', 'primary')) + `<div class="row between" style="margin-bottom:20px"><span class="badge">${ds.length} demandas mapeadas</span>${button('next-stage','Classificar demandas '+icon('arrow'),'','data-step="2"')}</div>` + (ds.length ? `<div class="cards">${ds.map(d=>{const dup=Demands.duplicates(d);return `<article class="panel demand"><div class="row between"><span class="badge">${esc(d.area)}</span><small>${fmt(d.createdAt)}</small></div><h2>${esc(d.title)}</h2><p class="desc">${esc(d.description)||'Sem descrição.'}</p>${dup.length?`<div class="hint warn">Possível duplicidade: ${dup.map(x=>esc(x.title)).join('; ')}. Revise com o grupo.</div>`:''}<div class="row">${button('demand-edit',icon('edit')+'Editar','',`data-id="${d.id}"`)}${button('demand-archive',icon('folder')+'Arquivar','',`data-id="${d.id}"`)}${button('demand-delete',icon('trash')+'Excluir','danger',`data-id="${d.id}" aria-label="Excluir ${esc(d.title)}"`)}</div></article>`}).join('')}</div>` : empty('Qual problema está atrapalhando?', 'Registre somente área, título e descrição. Os critérios serão avaliados na próxima etapa.', 'demand-add', 'Registrar primeiro problema'))
    },
    classification() {
        const n = State.activeDemands().length,
            done = State.activeDemands().filter(Classification.complete).length;
        return this.head(2, `<span class="badge" id="classProgress">${done} de ${n} demandas classificadas</span>`) + `<div class="progress"><span id="classProgressBar" style="width:${n?done/n*100:0}%"></span></div>` + (n ? `<div class="classify"><aside class="demand-list" id="classList" aria-label="Demandas para classificar"></aside><section id="classDetail"></section></div>` : empty('Nenhuma demanda para avaliar.', 'Comece pelo mapeamento dos problemas.', 'mapping-go', 'Abrir mapeamento'))
    },
    classifyList() {
        const root = $('#classList');
        if (!root) return;
        let ds = State.activeDemands();
        if (!ds.some(x => x.id === State.selectedDemand)) State.selectedDemand = ds[0]?.id;
        root.innerHTML = ds.map(d => button('class-select', `<div><b>${esc(d.title)}</b><small>${esc(d.area)} · ${d.ratings.filter(n=>n!==null).length}/6 respondidos</small></div>${Classification.complete(d)?icon('check'):''}`, d.id === State.selectedDemand ? 'selected' : '', `data-id="${d.id}" aria-pressed="${d.id===State.selectedDemand}"`)).join('');
        const n = ds.filter(Classification.complete).length;
        $('#classProgress').textContent = n + ' de ' + ds.length + ' demandas classificadas';
        $('#classProgressBar').style.width = (ds.length ? n / ds.length * 100 : 0) + '%'
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
        root.innerHTML = `<div class="panel stack"><div class="row between"><span class="badge">${esc(d.area)}</span><div class="row"><span class="big-number" id="classificationScore">${Utils.number(Classification.score(d))}</span><span class="muted">/100${answered<6?' · parcial':''}</span></div></div><div><h2>${esc(d.title)}</h2><p class="muted" style="white-space:pre-wrap;margin-top:10px">${esc(d.description)}</p></div><div class="criteria">${Criteria.map(([name,weight,q],i)=>`<div class="criterion"><div class="row between"><h3>${name}</h3><span class="weight">Peso ${weight}%</span></div><p>${q}</p><div class="scale" role="group" aria-label="${name}, nota de 0 a 5">${Scale.map((label,n)=>`<button class="${d.ratings[i]===n?'chosen':''}" data-action="rate" data-id="${d.id}" data-index="${i}" data-value="${n}" aria-pressed="${d.ratings[i]===n}" aria-label="${name}: ${n}, ${label}" title="${n} — ${label}">${n}</button>`).join('')}</div><div class="row between" style="margin-top:8px"><small>${d.ratings[i]===null?'Não respondido':esc(Scale[d.ratings[i]])+' · '+Utils.number(d.ratings[i]/5*weight)+' pontos'}</small>${button('clear-rating','Limpar','quiet',`data-id="${d.id}" data-index="${i}" aria-label="Limpar nota de ${name}"`)}</div></div>`).join('')}</div><div class="hint">0 = inexistente / não aplicável · 1 = muito baixo · 2 = baixo · 3 = moderado · 4 = alto · 5 = muito alto. Campo vazio significa que o critério ainda não foi respondido.</div><div class="row between"><span class="badge ${answered===6?'green':''}">${answered===6?'Classificação concluída':answered+' de 6 critérios respondidos'}</span>${button('class-next','Salvar e avaliar próxima '+icon('arrow'),'primary',answered<6?'disabled':'')}</div></div>`
    },
    ranking() {
        const ds = Ranking.sort(State.activeDemands()),
            eligible = ds,
            first = eligible[0],
            ties = Ranking.topTies(),
            resolved = ties.length <= 1 || ties.some(x => x.tieOrder !== null);
        const chosen = ties.length > 1 && !resolved ? State.tieSelected : first?.id;
        return this.head(3, button('next-stage', 'Abrir trabalho ' + icon('arrow'), '', 'data-step="4"')) + `<div class="hint" style="margin-bottom:16px">Nota = soma de (nota ÷ 5 × peso). Desempate: Impacto, Viabilidade e decisão do grupo. Demandas incompletas exibem pontuação parcial e precisam ser concluídas antes da escolha.</div>${Ranking.tieGroups().map(group=>`<div class="panel stack" style="margin-bottom:16px"><h3>Decisão do grupo · ${group.length} demandas empatadas · ${Utils.number(Classification.score(group[0]))}/100</h3><p class="muted">Pontuação, Impacto e Viabilidade iguais. Toque na prioridade acordada pelo grupo para colocá-la à frente das demais deste empate.</p><div class="row">${group.map(d=>button('tie-choose',esc(d.title),d.tieOrder===0?'chosen':'',`data-id="${d.id}"`)).join('')}</div></div>`).join('')}` + (ds.length ? `<div class="stack">${ds.map((d,i)=>`<article class="panel rank-card ${d.id===first?.id?'recommended':''}"><div class="rank-position">${i+1}</div><div><div class="row"><span class="badge">${esc(d.area)}</span>${d.id===first?.id?'<span class="badge orange">Recomendada</span>':''}<span class="badge ${Classification.complete(d)?'green':''}">${Classification.complete(d)?'Classificação concluída':'Classificação incompleta'}</span>${d.status==='Arquivada'?'<span class="badge">Arquivada</span>':''}</div><h3>${esc(d.title)}</h3><div class="row rank-actions">${button('rank-expand',State.expanded.has(d.id)?'Ocultar notas':'Detalhar notas','',`data-id="${d.id}" aria-expanded="${State.expanded.has(d.id)}"`)}${d.id===first?.id?button('rank-confirm','Confirmar demanda escolhida','accent',`data-id="${d.id}" ${!Classification.complete(d)||(ties.length>1&&!resolved)?'disabled':''}`):''}</div></div><div class="score">${Utils.number(Classification.score(d))}<small style="display:block">/100${Classification.complete(d)?'':' parcial'}</small></div>${State.expanded.has(d.id)?`<div class="rank-detail"><div class="grid3">${Criteria.map(([name,weight],j)=>`<div class="hint"><b>${name} · ${weight}%</b><p>${d.ratings[j]===null?'Não respondido':d.ratings[j]+'/5 · '+Utils.number(d.ratings[j]/5*weight)+' pontos'}</p></div>`).join('')}</div></div>`:''}</article>`).join('')}</div>` : empty('O ranking nasce da avaliação.', 'Cadastre e classifique as demandas para comparar as prioridades.', 'mapping-go', 'Abrir mapeamento'))
    },
    work() {
        const d = State.demand(),
            c = State.cycle();
        if (d?.status === 'Arquivada') return this.head(4) + empty('Demanda arquivada.', 'Esta demanda está preservada no histórico. Restaure-a no backlog para retomar o trabalho.', '', '', 'folder');
        if (!d || !c) return this.head(4) + empty('Escolha uma demanda para iniciar.', 'A confirmação no ranking cria um ciclo com fluxos e atividades independentes.', 'ranking-go', 'Abrir ranking', 'flow');
        return `<div class="work-header"><div class="work-context"><div class="eyebrow">Demanda ativa · ${esc(d.area)} · ciclo ${State.data.cycles.filter(x=>x.demandId===d.id).indexOf(c)+1}</div><h2 title="${esc(d.title)}">${esc(d.title)}</h2></div><div class="work-header-actions"><div class="segmented" aria-label="Visualização da demanda">${button('work-view',icon('flow')+'Fluxo',(State.workView==='flow'?'chosen ':'')+'view-toggle','data-view="flow" title="Fluxo do processo" aria-pressed="'+(State.workView==='flow')+'"')}${button('work-view',icon('board')+'Kanban',(State.workView==='kanban'?'chosen ':'')+'view-toggle','data-view="kanban" title="Kanban de atividades" aria-pressed="'+(State.workView==='kanban')+'"')}</div>${State.workView==='kanban'?button('task-add',icon('plus')+'Novo post-it','primary'):''}${button('work-details',icon('list')+'Detalhes','','title="Detalhes, status, ciclos e revisão da demanda"')}</div></div><section id="workspace">${State.workView==='flow'?Flow.html():Kanban.html()}</section>`
    },
    facilitator() {
        const r = State.review();
        return this.head(5, button('pin-config', icon('lock') + 'Configurar PIN') + button('review-save', icon('check') + 'Salvar revisão', 'primary') + button('report-go', icon('print') + 'Ver relatório')) + `<div class="hint" style="margin-bottom:20px">Área de consolidação do facilitador. O PIN opcional evita acesso acidental; os dados continuam locais, sem segurança corporativa. As alterações são salvas automaticamente.</div><div class="grid2" style="margin-bottom:20px"><div class="panel stack"><h3>Conferência do encontro</h3><div class="row">${button('people','Participantes')}${button('ranking-go','Ranking')}${button('review-flow-asis','AS IS')}${button('review-flow-tobe','TO BE')}${button('review-kanban','Atividades')}</div><small>${r.savedAt?'Revisão confirmada em '+new Date(r.savedAt).toLocaleString('pt-BR'):'A revisão ainda não foi confirmada para esta sessão/ciclo.'}</small></div><div class="panel"><h3>Conteúdo do relatório</h3><p class="muted" style="margin:8px 0 16px">Marque as seções que aparecerão no PDF.</p><div class="personchecks">${ReportSections.map((label,i)=>`<label class="check"><input type="checkbox" data-report-section="${i}" ${r.include[i]?'checked':''}>${i+1}. ${label}</label>`).join('')}</div></div></div><div class="panel"><div class="review-grid" id="reviewFields">${ReviewFields.map(([key,label])=>`<label>${label}<textarea data-review-field="${key}" maxlength="20000" rows="${['process','area','owner','indicator','baseline','target','result'].includes(key)?2:4}">${esc(r.fields[key])}</textarea></label>`).join('')}</div></div>`
    },
    report() {
        return this.head(6, button('review-go', 'Revisar conteúdo') + button('export-session', icon('download') + 'JSON da sessão') + button('print', icon('print') + 'Imprimir / PDF', 'primary')) + Report.html()
    },
    backlog() {
        return this.head(7, button('cycle-history', icon('clock') + 'Histórico de ciclos')) + `<div class="filters"><label><span class="visually-hidden">Pesquisar por título, área ou descrição</span><input id="backlogSearch" placeholder="Pesquisar título, área ou descrição…" value="${esc(State.filter)}"></label><label><span class="visually-hidden">Filtrar status</span><select id="backlogStatus">${options([['','Todos os status'],...Statuses],State.statusFilter)}</select></label></div><div id="backlogResults"></div>`
    },
    backlogResults() {
        const root = $('#backlogResults');
        if (!root) return;
        const ds = Ranking.sort(State.data.demands.filter(d => (!State.statusFilter || d.status === State.statusFilter) && (!State.filter || (d.title + ' ' + d.area + ' ' + d.description).toLocaleLowerCase().includes(State.filter.toLocaleLowerCase()))));
        root.innerHTML = ds.length ? `<div class="cards">${ds.map(d=>{const s=State.data.sessions.find(x=>x.id===d.originSessionId);return `<article class="panel demand"><div class="row between"><span class="badge">${esc(d.area)}</span><span class="badge ${d.status==='Concluída'?'green':''}">${esc(d.status)}</span></div><h2>${esc(d.title)}</h2><p class="desc">${esc(d.description)}</p><div><b>${Utils.number(Classification.score(d))}/100</b><small> · ${Classification.complete(d)?'Classificada':'Avaliação incompleta'}</small></div><small>Origem: ${esc(s?.title||'—')} · ${fmt(d.createdAt)}</small><small>${d.selections.length} ciclo(s) · ${d.history.length} alterações</small><div class="row">${button('backlog-start','Iniciar novo ciclo','primary',`data-id="${d.id}" ${d.status==='Arquivada'||!Classification.complete(d)?'disabled':''}`)}${button('demand-history','Histórico','',`data-id="${d.id}"`)}${button('backlog-edit','Editar','',`data-id="${d.id}"`)}${button('backlog-status','Status','',`data-id="${d.id}"`)}${d.status==='Arquivada'?button('demand-restore','Restaurar','',`data-id="${d.id}"`):button('demand-archive','Arquivar','',`data-id="${d.id}"`)}${button('demand-delete','Excluir','danger',`data-id="${d.id}"`)}</div>${!Classification.complete(d)?button('backlog-classify','Completar avaliação','',`data-id="${d.id}"`):''}</article>`}).join('')}</div>` : empty('Nenhuma demanda encontrada.', 'Ajuste a pesquisa ou registre novos problemas na etapa de mapeamento.', 'mapping-go', 'Abrir mapeamento')
    }
};
/* Flow model, SVG connections and canvas camera. */
