'use strict';
/* Hub EMR · Kanban de atividades e responsáveis. */
const Kanban = {
    html() {
        const people = State.people();
        return `<p class="board-hint"><span><b>Toque:</b> detalhes</span><span><b>Segure 0,5 s:</b> mover</span><span><b>Desenhe ✓:</b> concluir</span><span><b>Desenhe X:</b> cancelar</span><span><b>Seta → ou ←:</b> mudar de coluna</span></p><div class="kanban-layout"><div class="kanban" id="kanbanBoard">${Columns.map(([id,label])=>`<section class="column" data-column="${id}" aria-label="${label}"><header class="column-head"><span class="column-dot" aria-hidden="true"></span><h2>${label}</h2><span class="column-count" data-col-count="${id}">0</span></header><div class="dropzone" data-drop-column="${id}"></div></section>`).join('')}</div><aside class="people-tray" id="peopleTray" aria-label="Responsáveis"><h2>Responsáveis</h2><p>Arraste uma pessoa até o card para vincular. Arraste a etiqueta para outro card para mover, ou para fora para retirar.</p>${people.map(p=>`<button type="button" class="person-drag" data-person-drag="${p.id}" ${p.status==='Inativa'?'disabled':''}><span class="avatar small" aria-hidden="true">${esc(Utils.initials(p.name))}</span><span><b>${esc(p.name)}</b><small>${esc(p.area)} · ${esc(p.status)}</small></span></button>`).join('')||`<p class="muted">Ninguém cadastrado ainda.</p>${button('people-stage',icon('plus')+'Adicionar participantes','secondary small')}`}</aside></div>`
    },
    card(t) {
        const done = t.column === 'done' && !t.cancelled;
        return `<article class="task${t.blocked?' blocked':''}${t.cancelled?' cancelled':''}${done?' done':''}" data-task-id="${t.id}" role="button" tabindex="0" aria-label="${esc(t.title)}. Toque para detalhes. Segure para mover.${done?' Concluída.':''}">${done?`<span class="completion-seal" role="img" aria-label="Concluída">${icon('check')}</span>`:''}<div class="task-surface"><span class="task-type">${esc(TaskTypes[t.type])}</span><h3>${esc(t.title)}</h3>${t.cancelled?badge('Cancelada'):''}${t.blocked?`${badge(icon('lock')+'Bloqueada','danger')}<p class="block-reason">${esc(t.blockReason)}</p>`:''}</div><div class="assignee-list">${t.assignees.map(id=>{const p=State.data.participants.find(p=>p.id===id);return `<button type="button" class="assignee-chip" data-action="assignee-options" data-assignee-person="${id}" data-assignee-task="${t.id}" aria-label="${esc(p?.name||'Pessoa não disponível')}. Arraste para mover ou retirar o vínculo; toque para opções.">${icon('grip')}<span>${esc(p?.name||'Pessoa não disponível')}</span></button>`}).join('')||'<span class="assignee-empty">Sem responsáveis</span>'}</div></article>`
    },
    resize() {
        const b = $('#kanbanBoard');
        if (!b) return;
        const h = Math.max(300, innerHeight - (b.getBoundingClientRect().top + scrollY) - parseFloat(getComputedStyle($('#content')).paddingBottom));
        b.style.minHeight = '300px';
        b.style.height = h + 'px';
        const tray = $('#peopleTray');
        if (tray) {
            tray.style.minHeight = '300px';
            tray.style.height = h + 'px';
            tray.style.maxHeight = h + 'px'
        }
    },
    mount() {
        this.resize();
        this.patch()
    },
    patch() {
        const c = State.cycle();
        if (!c || !$('#kanbanBoard')) return;
        for (const t of c.tasks) {
            const el = $(`[data-task-id="${t.id}"]`),
                column = $(`[data-drop-column="${t.column}"]`);
            if (!el) column.insertAdjacentHTML('beforeend', this.card(t));
            else if (!Pointers.locked('task:' + t.id)) {
                const fresh = document.createElement('div');
                fresh.innerHTML = this.card(t);
                const replacement = fresh.firstElementChild;
                if (el.parentElement !== column) {
                    el.remove();
                    column.append(replacement)
                } else el.replaceWith(replacement)
            }
        }
        $$('[data-task-id]').forEach(el => {
            if (!c.tasks.some(t => t.id === el.dataset.taskId) && !Pointers.locked('task:' + el.dataset.taskId)) el.remove()
        });
        Columns.forEach(([id]) => {
            const el = $(`[data-col-count="${id}"]`);
            if (el) el.textContent = c.tasks.filter(t => t.column === id).length
        })
    },
    quick(column = 'backlog', source = null) {
        Dialog.open('Novo post-it', field('title', 'Título da atividade', source?.title || '', 'text', true, 'maxlength="250"') + `<p class="muted">O post-it será criado em <b>${esc(Columns.find(x=>x[0]===column)[1])}</b>. Preencha os detalhes depois.</p>`, saveFooter('Criar post-it'), () => {
            const v = formValues();
            if (!v.title.trim()) return Dialog.error('Informe o título da atividade.');
            History.commit('Atividade criada', () => State.cycle().tasks.push({
                id: uid(),
                title: v.title.trim(),
                description: '',
                type: 'process',
                acceptance: '',
                assignees: [],
                blocked: false,
                blockReason: '',
                notes: '',
                column,
                cancelled: false,
                createdAt: now(),
                updatedAt: now(),
                sourceNode: source ? {
                    flow: State.flowKind,
                    id: source.id
                } : null
            }), State.demand().id);
            Dialog.close();
            if (State.workView === 'kanban') this.patch();
            Feedback.toast('Post-it criado.', true)
        })
    },
    open(id) {
        const t = State.cycle()?.tasks.find(x => x.id === id);
        if (!t) return;
        const all = State.data.participants.filter(p => State.session().participantIds.includes(p.id) || t.assignees.includes(p.id));
        Dialog.open('Detalhes da atividade', field('title', 'Título', t.title, 'text', true, 'maxlength="250"') + textarea('description', 'Descrição', t.description) + `<div class="grid2">${selectField('type','Tipo',Object.entries(TaskTypes),t.type)}${selectField('column','Coluna',Columns,t.column)}</div>` + textarea('acceptance', 'Critério de aceite', t.acceptance) + `<fieldset class="fieldset"><legend>Responsáveis</legend><div class="personchecks">${all.map(p=>`<label class="check"><input type="checkbox" name="assignees" value="${p.id}" ${t.assignees.includes(p.id)?'checked':''}>${esc(p.name)} · ${esc(p.area)}</label>`).join('')||'<p class="muted">Nenhum participante cadastrado.</p>'}</div></fieldset><label class="check"><input type="checkbox" name="blocked" ${t.blocked?'checked':''}>Atividade bloqueada</label>` + textarea('blockReason', 'Motivo do bloqueio', t.blockReason) + `<label class="check"><input type="checkbox" name="cancelled" ${t.cancelled?'checked':''}>Atividade cancelada (preservar histórico)</label>` + textarea('notes', 'Observações', t.notes) + `<div class="dialog-extra"><small class="muted">Criada em ${new Date(t.createdAt).toLocaleString('pt-BR')} · alterada em ${new Date(t.updatedAt).toLocaleString('pt-BR')}</small>${button('responsibility-move',icon('people')+'Mover responsável para outra atividade','secondary small','data-id="'+t.id+'"')}</div>`, button('task-delete', icon('trash') + 'Excluir', 'danger-ghost', `data-id="${t.id}"`) + saveFooter(), () => {
            const f = $('#modalForm'),
                v = formValues(),
                ids = new FormData(f).getAll('assignees');
            if (!v.title.trim()) return Dialog.error('Informe o título.');
            if (f.elements.blocked.checked && !v.blockReason.trim()) return Dialog.error('Informe o motivo do bloqueio.');
            History.commit('Detalhes da atividade atualizados', () => {
                Object.assign(t, {
                    title: v.title.trim(),
                    description: v.description,
                    type: v.type,
                    acceptance: v.acceptance,
                    assignees: ids,
                    blocked: f.elements.blocked.checked,
                    blockReason: v.blockReason,
                    notes: v.notes,
                    cancelled: f.elements.cancelled.checked,
                    column: v.column,
                    updatedAt: now()
                });
                ids.forEach(pid => State.data.audit.push({
                    id: uid(),
                    at: now(),
                    sessionId: State.session().id,
                    label: 'Pessoa vinculada a atividade',
                    participantId: pid,
                    linked: true
                }))
            }, State.demand().id);
            Dialog.close();
            this.patch();
            Feedback.toast('Atividade salva.', true)
        })
    },
    assign(personId, taskId) {
        const t = State.cycle().tasks.find(x => x.id === taskId);
        if (t.assignees.includes(personId)) return Feedback.toast('Esta pessoa já está nesta atividade.');
        History.commit('Responsável vinculado à atividade', () => {
            t.assignees.push(personId);
            t.updatedAt = now();
            State.data.audit.push({
                id: uid(),
                at: now(),
                sessionId: State.session().id,
                label: 'Pessoa vinculada a atividade',
                participantId: personId,
                linked: true
            })
        }, State.demand().id);
        this.patch();
        Feedback.toast('Responsável vinculado.', true)
    },
    transferAssignee(personId, sourceId, targetId = null) {
        if (sourceId === targetId) return;
        const source = State.cycle().tasks.find(t => t.id === sourceId),
            target = State.cycle().tasks.find(t => t.id === targetId);
        if (!source?.assignees.includes(personId) || targetId && !target) return;
        History.commit(target ? 'Responsável movido entre atividades' : 'Vínculo de responsável retirado', () => {
            source.assignees = source.assignees.filter(id => id !== personId);
            source.updatedAt = now();
            if (target) {
                if (!target.assignees.includes(personId)) target.assignees.push(personId);
                target.updatedAt = now()
            }
        }, State.demand().id);
        this.patch()
    },
    assigneeOptions(personId, taskId) {
        const t = State.cycle().tasks.find(t => t.id === taskId),
            p = State.data.participants.find(p => p.id === personId),
            others = State.cycle().tasks.filter(t => t.id !== taskId);
        Dialog.open('Responsável na atividade', `<p><b>${esc(p?.name||'Participante')}</b> em “${esc(t.title)}”.</p>${notice('Dica: arraste a etiqueta para outro card para mover o vínculo, ou solte fora dos cards para retirar a pessoa da atividade.','info')}` + (others.length ? selectField('target', 'Mover para', others.map(t => [t.id, t.title]), others[0].id) : ''), button('assignee-remove', icon('trash') + 'Retirar vínculo', 'danger-ghost', `data-person="${personId}" data-task="${taskId}"`) + (others.length ? saveFooter('Mover responsável') : button('modal-close', 'Fechar', 'secondary')), () => {
            const v = formValues();
            this.transferAssignee(personId, taskId, v.target);
            Dialog.close()
        })
    },
    moveResponsibility(id) {
        const t = State.cycle().tasks.find(x => x.id === id),
            others = State.cycle().tasks.filter(x => x.id !== id);
        if (!t.assignees.length || !others.length) return Feedback.toast('É necessário um responsável e outra atividade.');
        Dialog.open('Mover responsável', selectField('personId', 'Pessoa', t.assignees.map(id => [id, State.data.participants.find(p => p.id === id)?.name || id]), t.assignees[0]) + selectField('target', 'Atividade de destino', others.map(x => [x.id, x.title]), others[0].id), saveFooter('Mover responsável'), () => {
            const v = formValues(),
                target = others.find(x => x.id === v.target);
            History.commit('Responsável movido para outra atividade', () => {
                t.assignees = t.assignees.filter(x => x !== v.personId);
                if (!target.assignees.includes(v.personId)) target.assignees.push(v.personId);
                t.updatedAt = target.updatedAt = now()
            }, State.demand().id);
            Dialog.close();
            this.patch();
            Feedback.toast('Responsável movido.', true)
        })
    },
    remove(id) {
        Dialog.confirm('Excluir atividade?', 'A atividade será removida deste ciclo. Para preservar o registro, use a opção Cancelada nos detalhes.', () => {
            History.commit('Atividade excluída', () => State.cycle().tasks = State.cycle().tasks.filter(x => x.id !== id), State.demand().id);
            this.patch();
            Feedback.toast('Atividade excluída.', true)
        }, 'Excluir', true)
    }
};
/* Per-pointer interaction state and per-card locks. No shared single-drag variable. */
