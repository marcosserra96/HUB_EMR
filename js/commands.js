'use strict';
/* Hub EMR · Mapa de ações (data-action) e eventos globais. */
const Commands = {
    'assignee-options': b => {
        if (performance.now() < Number(b.dataset.suppressClickUntil || 0)) return;
        Kanban.assigneeOptions(b.dataset.assigneePerson, b.dataset.assigneeTask)
    },
    'assignee-remove': b => {
        Kanban.transferAssignee(b.dataset.person, b.dataset.task);
        Dialog.close()
    },
    'toggle-sidebar': () => Layout.toggle(),
    'close-drawer': () => Layout.closeDrawer(),
    'team-choose': b => Teams.choose(b.dataset.id),
    'team-tab': b => Teams.open(b.dataset.tab, b.dataset.cycle || null),
    'team-assign': b => Teams.assign(b.dataset.person, b.dataset.cycle || null),
    'team-distribute': () => Teams.distribute(),
    'team-edit': b => Teams.edit(b.dataset.cycle),
    'team-add': () => Teams.add(),
    'team-end': () => Teams.end(),
    'review-team': b => {
        Facilitator.flush();
        State.session().selectedCycleId = b.dataset.cycle;
        History.persist();
        Render.header();
        Render.page()
    },
    'ui-density': b => Layout.setDensity(b.dataset.density),
    'map-filter': b => {
        State.mapFilter = b.dataset.filter;
        $$('[data-action="map-filter"]').forEach(x => {
            const on = x === b;
            x.classList.toggle('chosen', on);
            x.setAttribute('aria-pressed', String(on))
        });
        Render.mappingResults()
    },
    'work-details': () => Layout.workDetails(),
    'navigate': b => Navigation.go(Number(b.dataset.step)),
    'next-stage': b => Navigation.go(Number(b.dataset.step)),
    'mapping-go': () => {
        Dialog.close();
        Navigation.go(1)
    },
    'ranking-go': () => {
        Dialog.close();
        Navigation.go(3)
    },
    'review-go': () => {
        Dialog.close();
        Navigation.go(5)
    },
    'report-go': () => {
        Facilitator.flush();
        Dialog.close();
        Navigation.go(6)
    },
    'people': () => Participants.drawer(),
    'people-stage': () => {
        Dialog.close();
        Navigation.go(0)
    },
    'person-add': () => Participants.open(),
    'person-edit': b => Participants.open(b.dataset.id),
    'person-delete': b => Participants.remove(b.dataset.id),
    'person-copy': () => Participants.copy(),
    'copy-people-session': b => Participants.copyFrom(b.dataset.id),
    'demand-add': () => Demands.open(),
    'demand-edit': b => Demands.open(b.dataset.id),
    'demand-delete': b => Demands.remove(b.dataset.id),
    'demand-archive': b => Demands.archive(b.dataset.id),
    'demand-purge': b => Demands.purge(b.dataset.id),
    'demand-present': b => Presenter.open(b.dataset.id),
    'present-close': () => Presenter.close(),
    'present-prev': () => Presenter.go(-1),
    'present-next': () => Presenter.go(1),
    'present-edit': b => Presenter.edit(b.dataset.id),
    'demand-restore': b => Demands.restore(b.dataset.id),
    'class-select': b => {
        State.selectedDemand = b.dataset.id;
        Render.classifyList();
        Render.classifyDetail()
    },
    'rate': b => Classification.set(b.dataset.id, Number(b.dataset.index), Number(b.dataset.value)),
    'clear-rating': b => Classification.set(b.dataset.id, Number(b.dataset.index), null),
    'class-next': () => Classification.next(),
    'rank-expand': b => {
        const id = b.dataset.id;
        State.expanded.has(id) ? State.expanded.delete(id) : State.expanded.add(id);
        Render.page()
    },
    'tie-choose': b => {
        const d = State.data.demands.find(x => x.id === b.dataset.id);
        History.commit('Desempate decidido pelo grupo', () => {
            const group = State.demands().filter(x => x.status !== 'Arquivada' && Ranking.equal(x, d));
            group.forEach((x, i) => x.tieOrder = x.id === d.id ? 0 : i + 1)
        }, d.id);
        State.tieSelected = d.id;
        Render.page();
        Feedback.toast('Prioridade do grupo registrada.', true)
    },
    'rank-confirm': b => Ranking.choose(b.dataset.id),
    'work-view': b => {
        State.workView = b.dataset.view;
        Render.page()
    },
    'flow-kind': b => {
        State.flowKind = b.dataset.kind;
        Render.page()
    },
    'flow-add': () => Flow.open(),
    'flow-copy': () => Flow.copy(),
    'flow-zoom-in': () => Flow.zoom(1.2),
    'flow-zoom-out': () => Flow.zoom(1 / 1.2),
    'flow-fit': () => Flow.fit(),
    'node-delete': b => Flow.remove(b.dataset.id),
    'node-to-task': b => {
        const n = Flow.get().nodes.find(x => x.id === b.dataset.id);
        Dialog.close();
        Kanban.quick('backlog', n)
    },
    'edge-delete': b => Flow.edgeDelete(b.dataset.id),
    'task-add': () => Kanban.quick(),
    'task-delete': b => Kanban.remove(b.dataset.id),
    'responsibility-move': b => Kanban.moveResponsibility(b.dataset.id),
    'demand-status': () => demandStatus(State.demand().id),
    'review-save': () => Facilitator.save(),
    'pin-config': () => {
        Facilitator.flush();
        Facilitator.config()
    },
    'review-flow-asis': () => {
        State.flowKind = 'asis';
        State.workView = 'flow';
        State.workTab = 'team';
        Navigation.go(4)
    },
    'review-flow-tobe': () => {
        State.flowKind = 'tobe';
        State.workView = 'flow';
        State.workTab = 'team';
        Navigation.go(4)
    },
    'review-kanban': () => {
        State.workView = 'kanban';
        State.workTab = 'team';
        Navigation.go(4)
    },
    'backlog-start': b => Ranking.choose(b.dataset.id),
    'demand-history': b => demandHistory(b.dataset.id),
    'backlog-edit': b => Demands.open(b.dataset.id),
    'backlog-status': b => demandStatus(b.dataset.id),
    'backlog-classify': b => {
        const id = b.dataset.id;
        if (!State.session().demandIds.includes(id)) History.commit('Demanda do backlog incluída na avaliação', () => State.session().demandIds.push(id), id);
        State.selectedDemand = id;
        Navigation.go(2)
    },
    'sessions': () => Sessions.open(),
    'session-new': () => Sessions.edit(true),
    'session-edit': () => Sessions.edit(false),
    'session-open': b => Sessions.select(b.dataset.id),
    'cycle-history': b => Sessions.cycles(b.dataset.id || null),
    'cycle-open': b => Sessions.openCycle(b.dataset.id),
    'data': () => dataMenu(),
    'export-all': () => Transfer.export(),
    'export-session': () => Transfer.export('session'),
    'import-open': () => {
        $('#importFile').value = '';
        $('#importFile').click()
    },
    'import-merge': () => Transfer.merge(),
    'import-replace': () => Transfer.replace(),
    'undo': () => {
        Facilitator.flush();
        History.undo()
    },
    'modal-close': () => Dialog.close(),
    'dismiss': () => $('#notices').replaceChildren(),
    'help': () => help(),
    'print': () => Report.print(),
    'fullscreen': async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
            else Feedback.toast('Tela cheia indisponível. Use F11 no navegador.')
        } catch (e) {
            Feedback.toast('Use F11 para ativar tela cheia neste navegador.')
        }
    }
};
document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const action = b.dataset.action;
    if (Pointers.active.size || Gestures.pending.size) {
        if (!['dismiss', 'fullscreen'].includes(action)) return Feedback.toast('Finalize os toques antes desta ação.')
    }
    if (Commands[action]) {
        try {
            const result = Commands[action](b);
            if (result?.catch) result.catch(err => Feedback.toast(err.message))
        } catch (err) {
            console.error(err);
            Feedback.toast('Não foi possível concluir: ' + err.message)
        }
    }
});
$('#modal').addEventListener('submit', e => {
    e.preventDefault();
    if (!$('#modalForm').reportValidity()) return;
    try {
        State.modalSave?.()
    } catch (err) {
        console.error(err);
        Dialog.error(err.message)
    }
});
$('#modal').addEventListener('cancel', () => {
    TouchKeyboard.hide();
    if (State.modalCleanup) State.modalCleanup();
    State.modalSave = null
});
$('#importFile').addEventListener('change', e => Transfer.read(e.target.files[0]));
document.addEventListener('input', e => {
    if (e.target.id === 'mapSearch') {
        State.mapSearch = e.target.value;
        Render.mappingResults()
    }
    if (e.target.id === 'backlogSearch') {
        State.filter = e.target.value;
        Render.backlogResults()
    }
});
document.addEventListener('change', e => {
    if (e.target.id === 'backlogStatus') {
        State.statusFilter = e.target.value;
        Render.backlogResults()
    }
});
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.target.closest('button,input,textarea,select') && !$('#modal').open) {
        const node = e.target.closest('[data-node-id]'),
            task = e.target.closest('[data-task-id]'),
            edge = e.target.closest('[data-edge-id]');
        if (Pointers.active.size || Gestures.pending.size) return;
        if (node) {
            e.preventDefault();
            Flow.open(node.dataset.nodeId)
        } else if (task) {
            e.preventDefault();
            Kanban.open(task.dataset.taskId)
        } else if (edge) {
            e.preventDefault();
            Flow.edgeOpen(edge.dataset.edgeId)
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input,textarea')) {
        e.preventDefault();
        History.undo()
    }
});
window.addEventListener('resize', () => {
    if (State.step === 4) {
        if (State.workView === 'flow') Flow.resize();
        else Kanban.resize()
    }
});
window.addEventListener('beforeunload', e => {
    Facilitator.flush();
    if (State.dirty) {
        e.preventDefault();
        e.returnValue = 'Há alterações aguardando salvamento.'
    }
});
window.addEventListener('beforeprint', () => {
    TouchKeyboard.hide();
    Facilitator.flush();
    if (State.step !== 6) {
        State.beforePrintStep = State.step;
        State.step = 6;
        Render.navigation();
        Render.page()
    }
});
window.addEventListener('afterprint', () => {
    if (State.beforePrintStep !== undefined) {
        State.step = State.beforePrintStep;
        delete State.beforePrintStep;
        Render.navigation();
        Render.page()
    }
});
