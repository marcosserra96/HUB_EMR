'use strict';
/* Hub EMR · Avisos (toast/indicador de salvamento) e histórico com desfazer, auditoria e persistência. */
const Feedback = (() => {
    let timer;
    return {
        toast(message, undo = false) {
            clearTimeout(timer);
            $('#notices').innerHTML = `<div class="toast" role="status"><span>${esc(message)}</span>${undo?button('undo','Desfazer'):button('dismiss',icon('close'),'icon','aria-label="Fechar aviso"')}</div>`;
            timer = setTimeout(() => $('#notices').replaceChildren(), undo ? 9000 : 5000)
        },
        save(status, error = false) {
            const el = $('#saveIndicator');
            el.textContent = status;
            el.classList.toggle('error', error)
        }
    }
})();
const History = {
    commit(label, mutate, demandId = null) {
        const snap = State.historySource();
        State.data.undo.push({
            label,
            at: now(),
            snapshot: snap
        });
        if (State.data.undo.length > 30) State.data.undo.shift();
        mutate();
        const at = now();
        State.data.updatedAt = at;
        State.data.audit.push({
            id: uid(),
            sessionId: State.session().id,
            at,
            label,
            demandId
        });
        if (demandId) {
            const d = State.data.demands.find(x => x.id === demandId);
            if (d) {
                d.updatedAt = at;
                const previous = snap.demands.find(x => x.id === demandId);
                const changes = {};
                for (const key of ['area', 'title', 'description', 'ratings', 'status', 'tieOrder'])
                    if (JSON.stringify(previous?.[key]) !== JSON.stringify(d[key])) changes[key] = {
                        before: previous?.[key] ?? null,
                        after: clone(d[key])
                    };
                d.history.push({
                    at,
                    label,
                    changes
                })
            }
        }
        this.persist();
        Render.header()
    },
    persist() {
        const revision = ++State.revision;
        State.dirty = true;
        Feedback.save('Salvando…');
        Storage.save(State.data).then(() => {
            State.savedRevision = Math.max(State.savedRevision, revision);
            if (State.savedRevision === State.revision) {
                State.dirty = false;
                Feedback.save('Salvo · neste navegador')
            }
        }).catch(e => {
            Feedback.save('Falha ao salvar · exporte um backup', true);
            Feedback.toast('Falha no armazenamento: ' + e.message)
        })
    },
    undo() {
        if (Pointers.active.size || Gestures.pending.size) return Feedback.toast('Finalize os toques antes de desfazer.');
        const action = State.data.undo.pop();
        if (!action) return Feedback.toast('Não há ação para desfazer.');
        Object.assign(State.data, clone(action.snapshot));
        State.data.audit.push({
            id: uid(),
            at: now(),
            sessionId: State.session().id,
            label: 'Desfeito: ' + action.label
        });
        this.persist();
        Dialog.close();
        Render.header();
        Render.page();
        Feedback.toast('Desfeito: ' + action.label)
    }
};
