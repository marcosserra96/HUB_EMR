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
    topTies() {
        const a = this.sort(State.demands().filter(x => x.status !== 'Arquivada'));
        return a.filter(d => this.equal(a[0], d))
    },
    choose(id) {
        const list = this.sort(State.demands().filter(x => x.status !== 'Arquivada'));
        const d = State.data.demands.find(x => x.id === id) || list[0];
        if (d?.status === 'Arquivada') return Feedback.toast('Restaure esta demanda no backlog antes de iniciar um ciclo.');
        if (!d || !Classification.complete(d)) return Feedback.toast('Conclua a classificação da demanda.');
        const incompletes = State.demands().filter(x => x.status !== 'Arquivada' && !Classification.complete(x));
        Dialog.confirm('Confirmar demanda escolhida', `${d.title}. Será aberto um novo ciclo de trabalho; as outras demandas continuam no backlog.${incompletes.length?' Atenção: '+incompletes.length+' demanda(s) ainda sem classificação completa.':''}`, () => this.start(d), 'Confirmar e iniciar')
    },
    start(d) {
        const existing = State.cycle();
        History.commit('Demanda escolhida para novo ciclo', () => {
            if (existing && existing.demandId !== d.id) {
                const previous = State.data.demands.find(x => x.id === existing.demandId);
                if (previous?.status === 'Selecionada') previous.status = 'Em desenvolvimento'
            }
            const cycle = {
                id: uid(),
                demandId: d.id,
                sessionId: State.session().id,
                selectedAt: now(),
                evaluation: {
                    ratings: clone(d.ratings),
                    score: Classification.score(d)
                },
                flows: {
                    asis: {
                        nodes: [],
                        edges: [],
                        view: {
                            x: 40,
                            y: 40,
                            z: 1
                        }
                    },
                    tobe: {
                        nodes: [],
                        edges: [],
                        view: {
                            x: 40,
                            y: 40,
                            z: 1
                        }
                    }
                },
                tasks: [],
                review: newReview()
            };
            cycle.review.fields.area = d.area;
            cycle.review.fields.problem = d.description;
            State.data.cycles.push(cycle);
            State.session().selectedCycleId = cycle.id;
            if (!State.session().demandIds.includes(d.id)) State.session().demandIds.push(d.id);
            d.status = 'Selecionada';
            d.selections.push({
                at: cycle.selectedAt,
                sessionId: cycle.sessionId,
                cycleId: cycle.id,
                ratings: clone(d.ratings),
                score: Classification.score(d)
            })
        }, d.id);
        State.workView = 'flow';
        State.flowKind = 'asis';
        Navigation.go(4);
        Feedback.toast('Demanda confirmada. Novo ciclo pronto.', true)
    }
};
const Participants = {
    open(id = null) {
        const p = State.data.participants.find(x => x.id === id);
        Dialog.open(p ? 'Editar participante' : 'Adicionar participante', field('name', 'Nome', p?.name, 'text', true, 'maxlength="150"') + areaField(p?.area) + selectField('status', 'Presença', ['Prevista', 'Presente', 'Ausente', 'Inativa'], p?.status || 'Presente'), (p ? button('person-delete', icon('trash') + 'Excluir', 'danger', `type="button" data-id="${p.id}"`) : '') + saveFooter(), () => {
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
                State.data.sessions.forEach(s => s.participantIds = s.participantIds.filter(x => x !== id))
            });
            Render.page()
        }, 'Excluir', true)
    },
    copy() {
        const ss = State.data.sessions.filter(s => s.id !== State.session().id && s.participantIds.length);
        Dialog.open('Copiar participantes de outra sessão', ss.length ? `<div class="selection-list">${ss.map(s=>button('copy-people-session',`<span>${esc(s.title)}<small> · ${fmt(s.date)} · ${s.participantIds.length} pessoas</small></span>`,'',`type="button" data-id="${s.id}"`)).join('')}</div>` : '<p>Nenhuma sessão anterior tem participantes cadastrados.</p>', button('modal-close', 'Fechar', '', 'type="button"'))
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
        Dialog.open('Participantes · ' + State.people().filter(x => x.status === 'Presente').length + ' presentes', `<div class="selection-list">${State.people().map(p=>button('person-edit',`<span><b>${esc(p.name)}</b><small> · ${esc(p.area)} · ${esc(p.status)}</small></span>${icon('edit')}`,'',`type="button" data-id="${p.id}"`)).join('')||'<p>Nenhuma pessoa cadastrada.</p>'}</div>`, button('person-add', icon('plus') + 'Adicionar', 'primary', 'type="button"') + button('people-stage', 'Abrir etapa', '', 'type="button"'))
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
        Dialog.open(d ? 'Editar demanda' : 'Registrar problema', `<div class="hint">Mapeie o problema. A solução e as atividades serão trabalhadas depois.</div>` + areaField(d?.area) + field('title', 'Título', d?.title, 'text', true, 'maxlength="250"') + textarea('description', 'Descrição do problema', d?.description || ''), saveFooter('Salvar demanda'), () => {
            const v = formValues();
            if (!v.title.trim() || !v.area.trim()) return Dialog.error('Preencha área e título.');
            let targetId = d?.id || uid();
            History.commit(d ? 'Demanda editada' : 'Problema mapeado', () => {
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
