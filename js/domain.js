'use strict';
/* Hub EMR · Regras do método: classificação, ranking/desempate, participantes e demandas. */
const Classification = {
    complete: d => d.ratings.every(n => Number.isInteger(n) && n >= 0 && n <= 5),
    score: d => d.ratings.reduce((s, n, i) => s + (n === null ? 0 : n / 5 * Criteria[i][1]), 0),
    set(id, index, value) {
        const d = State.data.demands.find(x => x.id === id);
        if (!d) return;
        History.commit('Nota de ' + Criteria[index][0] + ': ' + (value === null ? 'não respondido' : value), () => {
            d.ratings[index] = value;
            State.demands().forEach(x => x.tieOrder = null);
            if (['Mapeada', 'Classificada'].includes(d.status)) d.status = this.complete(d) ? 'Classificada' : 'Mapeada'
        }, id);
        Render.classifyDetail();
        Render.classifyList();
        Render.navigation()
    },
    next() {
        const list = State.activeDemands(),
            current = list.find(x => x.id === State.selectedDemand);
        if (!current || !this.complete(current)) return Feedback.toast('Responda os seis critérios, incluindo notas zero quando aplicável.');
        const index = list.indexOf(current);
        const next = [...list.slice(index + 1), ...list.slice(0, index)].find(d => !this.complete(d));
        if (next) {
            State.selectedDemand = next.id;
            Render.classifyDetail();
            Render.classifyList();
            Feedback.toast('Avaliação salva. Próxima demanda.')
        } else {
            Feedback.toast('Todas as demandas foram classificadas.');
            Navigation.go(3)
        }
    }
};
const Ranking = {
    sort(list) {
        return [...list].sort((a, b) => Classification.score(b) - Classification.score(a) || (b.ratings[0] ?? -1) - (a.ratings[0] ?? -1) || (b.ratings[4] ?? -1) - (a.ratings[4] ?? -1) || (a.tieOrder ?? 999999) - (b.tieOrder ?? 999999) || a.createdAt.localeCompare(b.createdAt))
    },
    equal(a, b) {
        return a && b && Classification.complete(a) && Classification.complete(b) && Classification.score(a) === Classification.score(b) && a.ratings[0] === b.ratings[0] && a.ratings[4] === b.ratings[4]
    },
    tieGroups() {
        const sorted = this.sort(State.demands().filter(d => d.status !== 'Arquivada' && Classification.complete(d))),
            groups = [];
        for (const d of sorted) {
            const g = groups.find(g => this.equal(g[0], d));
            if (g) g.push(d);
            else groups.push([d])
        }
        return groups.filter(g => g.length > 1)
    },
    /** Empate no topo do ranking (somente demandas classificadas disputam a primeira posição). */
    topTies() {
        const a = this.sort(State.demands().filter(x => x.status !== 'Arquivada' && Classification.complete(x)));
        return a.filter(d => this.equal(a[0], d))
    },
    choose(id) {
        const list = this.sort(State.demands().filter(x => x.status !== 'Arquivada' && Classification.complete(x)));
        const d = State.data.demands.find(x => x.id === id) || list[0];
        if (d?.status === 'Arquivada') return Feedback.toast('Restaure esta demanda no backlog antes de iniciar um ciclo.');
        if (!d || !Classification.complete(d)) return Feedback.toast('Conclua a classificação da demanda.');
        const incompletes = State.demands().filter(x => x.status !== 'Arquivada' && !Classification.complete(x));
        Dialog.confirm('Confirmar demanda escolhida', `“${d.title}” será trabalhada agora: um novo ciclo de trabalho é aberto com fluxos e kanban. As demais demandas continuam no backlog.${State.teamMode()?' As equipes atuais serão encerradas; o fluxo e as atividades delas ficam no histórico de ciclos.':''}${incompletes.length?' Atenção: '+plural(incompletes.length,'demanda ainda não foi classificada','demandas ainda não foram classificadas')+'.':''}`, () => this.start(d), 'Confirmar e iniciar')
    },
    /** Novo ciclo de trabalho para a demanda (sem gravar; use dentro de History.commit). */
    newCycle(d) {
        const view = () => ({ x: 40, y: 40, z: 1 });
        const cycle = {
            id: uid(),
            demandId: d.id,
            sessionId: State.session().id,
            selectedAt: now(),
            evaluation: { ratings: clone(d.ratings), score: Classification.score(d) },
            flows: { asis: { nodes: [], edges: [], view: view() }, tobe: { nodes: [], edges: [], view: view() } },
            tasks: [],
            review: newReview()
        };
        cycle.review.fields.area = d.area;
        cycle.review.fields.problem = d.description;
        State.data.cycles.push(cycle);
        if (!State.session().demandIds.includes(d.id)) State.session().demandIds.push(d.id);
        d.status = 'Selecionada';
        d.selections.push({ at: cycle.selectedAt, sessionId: cycle.sessionId, cycleId: cycle.id, ratings: clone(d.ratings), score: Classification.score(d) });
        return cycle
    },
    /** Demandas que estavam em trabalho deixam de ser "Selecionada" quando um novo ciclo começa. */
    releaseCurrent(except = []) {
        const ids = State.teamMode() ? State.teams().map(t => State.data.cycles.find(c => c.id === t.cycleId)?.demandId) : [State.cycle()?.demandId];
        ids.filter(id => id && !except.includes(id)).forEach(id => {
            const previous = State.data.demands.find(x => x.id === id);
            if (previous?.status === 'Selecionada') previous.status = 'Em desenvolvimento'
        })
    },
    start(d) {
        History.commit('Demanda escolhida para novo ciclo', () => {
            this.releaseCurrent([d.id]);
            /* Um ciclo único encerra o modo equipes desta sessão; o trabalho das equipes fica no histórico. */
            delete State.session().teams;
            State.session().selectedCycleId = this.newCycle(d).id
        }, d.id);
        State.workView = 'flow';
        State.flowKind = 'asis';
        Navigation.go(4);
        Feedback.toast('Demanda confirmada. Novo ciclo pronto.', true)
    }
};
/** Trabalho com mais de uma demanda ao mesmo tempo: cada equipe é um ciclo com nome, cor e integrantes.
    Trocar de equipe = trocar o ciclo selecionado da sessão, então fluxo, kanban e revisão valem por equipe. */
const Teams = {
    /** Ranking → escolher a segunda demanda e iniciar as duas equipes. */
    choose(firstId) {
        const first = State.data.demands.find(x => x.id === firstId);
        const others = Ranking.sort(State.activeDemands().filter(d => Classification.complete(d) && d.id !== firstId));
        if (!others.length) return Feedback.toast('Classifique mais uma demanda para trabalhar com duas equipes.');
        Dialog.open('Trabalhar com duas demandas', `<p>O grupo se divide em duas equipes, cada uma com a sua demanda, fluxo e kanban. Na tela de trabalho, abas alternam entre a visão geral e cada equipe.</p><div class="pair-first">${teamDot('blue')}<span class="sel-text"><small>Equipe azul</small><b>${esc(first.title)}</b></span><span class="pair-score">${Utils.number(Classification.score(first))} pts</span></div><fieldset class="fieldset"><legend>Demanda da equipe laranja</legend><div class="selection-list">${others.map((d,i)=>`<label class="check pair-option"><input type="radio" name="second" value="${d.id}" ${i===0?'checked':''}><span class="sel-text"><b>${esc(d.title)}</b><small>${esc(d.area)}${i===0?' · próxima do ranking':''}</small></span><span class="pair-score">${Utils.number(Classification.score(d))} pts</span></label>`).join('')}</div></fieldset>${State.cycle()?notice('O ciclo em andamento continua salvo no histórico.','info'):''}`, saveFooter('Confirmar e montar equipes'), () => {
            const second = State.data.demands.find(x => x.id === new FormData($('#modalForm')).get('second'));
            if (!second) return Dialog.error('Escolha a segunda demanda.');
            Dialog.close();
            this.start([first, second])
        })
    },
    start(demands) {
        History.commit('Equipes iniciadas', () => {
            Ranking.releaseCurrent(demands.map(d => d.id));
            const colors = Object.keys(TeamColors);
            const s = State.session();
            s.teams = demands.map((d, i) => ({ cycleId: Ranking.newCycle(d).id, name: 'Equipe ' + TeamColors[colors[i]], color: colors[i], memberIds: [] }));
            s.selectedCycleId = s.teams[0].cycleId;
            /* Modo imersivo: o menu recolhe para dar espaço às abas (a pessoa pode reabrir). */
            State.data.ui = { ...State.data.ui, sidebarCollapsed: true }
        }, demands[0].id);
        State.workView = 'flow';
        State.flowKind = 'asis';
        State.workTab = 'setup';
        Navigation.go(4);
        Feedback.toast('Equipes criadas. Defina quem fica em cada uma.', true)
    },
    /** Abre a aba da equipe (ou a visão geral / montagem). Não entra no desfazer. */
    open(tab, cycleId = null) {
        State.workTab = tab;
        if (cycleId && cycleId !== State.session().selectedCycleId) {
            State.session().selectedCycleId = cycleId;
            Flow.viewport = null;
            History.persist()
        }
        Render.header();
        Render.page();
        $('#content').scrollTo?.(0, 0);
        window.scrollTo(0, 0)
    },
    assign(personId, cycleId) {
        const p = State.data.participants.find(x => x.id === personId);
        const target = State.teams().find(t => t.cycleId === cycleId);
        if (!p || target && target.memberIds.includes(personId) || !target && !State.teamOf(personId)) return;
        History.commit(target ? p.name + ' na ' + target.name : p.name + ' sem equipe', () => {
            State.session().teams.forEach(t => t.memberIds = t.memberIds.filter(x => x !== personId));
            if (target) State.session().teams.find(t => t.cycleId === cycleId).memberIds.push(personId)
        });
        Render.page()
    },
    /** Distribui quem está sem equipe, equilibrando o tamanho e misturando as áreas. */
    distribute() {
        const free = State.people().filter(p => !State.teamOf(p.id) && !['Ausente', 'Inativa'].includes(p.status));
        if (!free.length) return Feedback.toast('Todas as pessoas presentes já estão em uma equipe.');
        History.commit('Equipes distribuídas automaticamente', () => {
            const teams = State.session().teams;
            [...free].sort((a, b) => a.area.localeCompare(b.area, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR')).forEach(p => {
                const smallest = teams.reduce((m, t) => t.memberIds.length < m.memberIds.length ? t : m, teams[0]);
                smallest.memberIds.push(p.id)
            })
        });
        Render.page();
        Feedback.toast(plural(free.length, 'pessoa distribuída', 'pessoas distribuídas') + '.', true)
    },
    edit(cycleId) {
        const t = State.session().teams.find(x => x.cycleId === cycleId);
        const used = State.teams().filter(x => x !== t).map(x => x.color);
        Dialog.open('Editar equipe', field('name', 'Nome da equipe', t.name, 'text', true, 'maxlength="60"') + `<fieldset class="fieldset"><legend>Cor</legend><div class="color-options">${Object.entries(TeamColors).map(([c,label])=>`<label class="check color-option"><input type="radio" name="color" value="${c}" ${c===t.color?'checked':''} ${used.includes(c)?'disabled':''}>${teamDot(c)}<span>${label[0].toUpperCase()+label.slice(1)}${used.includes(c)?' · em uso':''}</span></label>`).join('')}</div></fieldset>`, saveFooter(), () => {
            const v = Object.fromEntries(new FormData($('#modalForm')));
            if (!v.name.trim()) return Dialog.error('Informe o nome da equipe.');
            History.commit('Equipe editada', () => Object.assign(State.session().teams.find(x => x.cycleId === cycleId), { name: v.name.trim(), color: v.color }));
            Dialog.close();
            Render.page()
        })
    },
    add() {
        if (State.teams().length >= TEAM_LIMIT) return Feedback.toast('O limite é de ' + TEAM_LIMIT + ' equipes.');
        const busy = State.teams().map(t => State.data.cycles.find(c => c.id === t.cycleId).demandId);
        const options = Ranking.sort(State.activeDemands().filter(d => Classification.complete(d) && !busy.includes(d.id)));
        if (!options.length) return Feedback.toast('Não há outra demanda classificada para uma nova equipe.');
        const color = Object.keys(TeamColors).find(c => !State.teams().some(t => t.color === c));
        Dialog.open('Nova equipe', `<p>A ${'equipe ' + TeamColors[color]} trabalha em uma demanda própria.</p><div class="selection-list">${options.map((d,i)=>`<label class="check pair-option"><input type="radio" name="demand" value="${d.id}" ${i===0?'checked':''}><span class="sel-text"><b>${esc(d.title)}</b><small>${esc(d.area)}</small></span><span class="pair-score">${Utils.number(Classification.score(d))} pts</span></label>`).join('')}</div>`, saveFooter('Criar equipe'), () => {
            const d = State.data.demands.find(x => x.id === new FormData($('#modalForm')).get('demand'));
            if (!d) return Dialog.error('Escolha uma demanda.');
            History.commit('Equipe adicionada', () => State.session().teams.push({ cycleId: Ranking.newCycle(d).id, name: 'Equipe ' + TeamColors[color], color, memberIds: [] }), d.id);
            Dialog.close();
            Render.header();
            Render.page()
        })
    },
    /** Volta para uma equipe só, mantendo o ciclo escolhido; os demais ficam no histórico. */
    end() {
        const keep = State.cycle();
        Dialog.confirm('Voltar para uma equipe?', `O trabalho continua só em “${State.demand()?.title}”. O fluxo e as atividades das outras equipes ficam salvos no histórico de ciclos, e as demandas delas voltam ao backlog como “Em desenvolvimento”.`, () => {
            History.commit('Equipes encerradas', () => {
                Ranking.releaseCurrent([keep.demandId]);
                delete State.session().teams;
                State.session().selectedCycleId = keep.id
            }, keep.demandId);
            State.workTab = 'overview';
            Render.header();
            Render.page();
            Feedback.toast('Agora com uma equipe.', true)
        }, 'Voltar para uma equipe')
    }
};
const Participants = {
    open(id = null) {
        const p = State.data.participants.find(x => x.id === id);
        Dialog.open(p ? 'Editar participante' : 'Adicionar participante', field('name', 'Nome', p?.name, 'text', true, 'maxlength="150"') + areaField(p?.area) + selectField('status', 'Presença', ['Prevista', 'Presente', 'Ausente', 'Inativa'], p?.status || 'Presente'), (p ? button('person-delete', icon('trash') + 'Excluir', 'danger-ghost', `data-id="${p.id}"`) : '') + saveFooter(), () => {
            const v = formValues();
            if (!v.name.trim() || !v.area.trim()) return Dialog.error('Preencha nome e área.');
            History.commit(p ? 'Participante atualizado' : 'Participante cadastrado', () => {
                if (p) Object.assign(p, {
                    name: v.name.trim(),
                    area: v.area.trim(),
                    status: v.status,
                    updatedAt: now()
                });
                else {
                    const n = {
                        id: uid(),
                        name: v.name.trim(),
                        area: v.area.trim(),
                        status: v.status,
                        createdAt: now(),
                        updatedAt: now()
                    };
                    State.data.participants.push(n);
                    State.session().participantIds.push(n.id)
                }
            });
            Dialog.close();
            Render.page();
            Feedback.toast('Participante salvo.', true)
        })
    },
    linked(id) {
        return State.data.cycles.some(c => c.tasks.some(t => t.assignees.includes(id))) || State.data.audit.some(x => x.participantId === id && x.linked)
    },
    remove(id) {
        const p = State.data.participants.find(x => x.id === id);
        if (this.linked(id)) return Dialog.confirm('Preservar histórico', 'Esta pessoa já foi vinculada a uma atividade. Ela será marcada como inativa e continuará no histórico.', () => {
            History.commit('Participante inativado', () => p.status = 'Inativa');
            Render.page()
        }, 'Marcar como inativa');
        Dialog.confirm('Excluir participante?', p.name + ' será removido do cadastro desta sessão.', () => {
            History.commit('Participante excluído', () => {
                State.data.participants = State.data.participants.filter(x => x.id !== id);
                State.data.sessions.forEach(s => {
                    s.participantIds = s.participantIds.filter(x => x !== id);
                    (s.teams || []).forEach(t => t.memberIds = t.memberIds.filter(x => x !== id))
                })
            });
            Render.page()
        }, 'Excluir', true)
    },
    copy() {
        const ss = State.data.sessions.filter(s => s.id !== State.session().id && s.participantIds.length);
        Dialog.open('Copiar participantes de outra sessão', ss.length ? `<p class="muted">As pessoas entram como previstas. Quem já está no grupo não é duplicado.</p><div class="selection-list">${ss.map(s=>button('copy-people-session',`<span class="sel-text"><b>${esc(s.title)}</b><small>${fmt(s.date)} · ${plural(s.participantIds.length,'pessoa')}</small></span>${icon('arrow')}`,'sel-item',`data-id="${s.id}"`)).join('')}</div>` : '<p class="muted">Nenhuma outra sessão tem participantes cadastrados.</p>', button('modal-close', 'Fechar', 'secondary'))
    },
    copyFrom(id) {
        const s = State.data.sessions.find(x => x.id === id);
        let count = 0;
        History.commit('Participantes copiados de outra sessão', () => {
            s.participantIds.forEach(id => {
                const p = State.data.participants.find(x => x.id === id);
                if (!p || State.people().some(x => x.name.toLocaleLowerCase() === p.name.toLocaleLowerCase() && x.area.toLocaleLowerCase() === p.area.toLocaleLowerCase())) return;
                const q = {
                    ...clone(p),
                    id: uid(),
                    status: 'Prevista',
                    createdAt: now(),
                    updatedAt: now()
                };
                State.data.participants.push(q);
                State.session().participantIds.push(q.id);
                count++
            })
        });
        Dialog.close();
        Render.page();
        Feedback.toast(count + ' participantes copiados como previstos.', true)
    },
    drawer() {
        Dialog.open('Participantes', `<p class="muted">${plural(State.people().filter(x => x.status === 'Presente').length,'pessoa presente','pessoas presentes')} de ${State.people().length}.</p><div class="selection-list">${State.people().map(p=>button('person-edit',`<span class="avatar small" aria-hidden="true">${esc(Utils.initials(p.name))}</span><span class="sel-text"><b>${esc(p.name)}</b><small>${esc(p.area)}</small></span>${badge(esc(p.status),presenceTone(p.status))}`,'sel-item',`data-id="${p.id}"`)).join('')||'<p class="muted">Nenhuma pessoa cadastrada.</p>'}</div>`, button('people-stage', 'Abrir etapa Participantes', 'secondary') + button('person-add', icon('plus') + 'Adicionar participante', 'primary'))
    }
};
const Demands = {
    duplicates(d) {
        const norm = s => s.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(x => x.length > 2);
        const a = norm(d.title + ' ' + d.description);
        return State.demands().filter(x => x.id !== d.id && (() => {
            const b = norm(x.title + ' ' + x.description);
            const shared = [...new Set(a)].filter(w => b.includes(w)).length;
            return d.title.trim().toLocaleLowerCase() === x.title.trim().toLocaleLowerCase() || shared >= 3 && shared / Math.max(1, Math.min(new Set(a).size, new Set(b).size)) >= .7
        })())
    },
    open(id = null) {
        const d = State.data.demands.find(x => x.id === id);
        Dialog.open(d ? 'Editar demanda' : 'Registrar demanda', areaField(d?.area) + field('title', 'Título', d?.title, 'text', true, 'maxlength="250" placeholder="Ex.: Conferência manual de leituras"') + textarea('description', 'Descrição do problema', d?.description || ''), saveFooter('Salvar demanda'), () => {
            const v = formValues();
            if (!v.title.trim() || !v.area.trim()) return Dialog.error('Preencha área e título.');
            let targetId = d?.id || uid();
            History.commit(d ? 'Demanda editada' : 'Demanda registrada', () => {
                if (d) Object.assign(d, {
                    area: v.area.trim(),
                    title: v.title.trim(),
                    description: v.description.trim()
                });
                else {
                    State.data.demands.push({
                        id: targetId,
                        originSessionId: State.session().id,
                        area: v.area.trim(),
                        title: v.title.trim(),
                        description: v.description.trim(),
                        ratings: Array(6).fill(null),
                        status: 'Mapeada',
                        createdAt: now(),
                        updatedAt: now(),
                        history: [],
                        selections: [],
                        tieOrder: null
                    });
                    State.session().demandIds.push(targetId)
                }
            }, targetId);
            Dialog.close();
            Render.page();
            const n = this.duplicates(State.data.demands.find(x => x.id === targetId));
            Feedback.toast(n.length ? 'Salva. Possível duplicidade com: ' + n[0].title : 'Demanda salva.', true)
        })
    },
    remove(id) {
        const d = State.data.demands.find(x => x.id === id);
        if (!d) return Feedback.toast('Demanda não encontrada.');
        const linked = State.data.cycles.some(c => c.demandId === id);
        if (linked) return this.archive(id);
        Dialog.confirm('Excluir demanda?', d.title + ' será excluída do encontro. Esta ação pode ser desfeita.', () => {
            History.commit('Demanda excluída', () => {
                State.data.demands = State.data.demands.filter(x => x.id !== id);
                State.data.sessions.forEach(session => session.demandIds = session.demandIds.filter(demandId => demandId !== id));
            });
            Render.header();
            Render.page();
            Feedback.toast('Demanda excluída.', true);
        }, 'Excluir', true);
    },
    archive(id) {
        const d = State.data.demands.find(x => x.id === id);
        if (!d) return Feedback.toast('Demanda não encontrada.');
        if (d.status === 'Arquivada') return Feedback.toast('Esta demanda já está arquivada.');
        Dialog.confirm('Arquivar demanda?', d.title + ' sairá do mapeamento ativo, mas continuará no backlog com seu histórico.', () => {
            History.commit('Demanda arquivada', () => {
                d.status = 'Arquivada';
            }, id);
            Render.header();
            Render.page();
            Feedback.toast('Demanda arquivada. Você pode restaurá-la no backlog.', true);
        }, 'Arquivar');
    },
    restore(id) {
        const d = State.data.demands.find(x => x.id === id);
        if (!d) return Feedback.toast('Demanda não encontrada.');
        if (d.status !== 'Arquivada') return Feedback.toast('A demanda não está arquivada.');
        Dialog.confirm('Restaurar demanda?', d.title + ' voltará a aparecer no mapeamento e nas etapas ativas.', () => {
            History.commit('Demanda restaurada', () => {
                d.status = Classification.complete(d) ? 'Classificada' : 'Mapeada';
            }, id);
            Render.header();
            Render.page();
            Feedback.toast('Demanda restaurada.', true);
        }, 'Restaurar');
    }
};
