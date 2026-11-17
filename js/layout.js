'use strict';
/* Hub EMR · Navegação entre etapas e preferências de layout (menu, escala). */
const Navigation = {
    go(step) {
        TouchKeyboard.hide();
        if (Pointers.active.size || Gestures.pending.size) return Feedback.toast('Finalize os gestos antes de trocar de etapa.');
        if (step === 5 && !State.reviewUnlocked) return Facilitator.gate();
        if (State.step === 5) Facilitator.flush();
        State.step = step;
        Render.navigation();
        Render.page();
        $('#content').focus({
            preventScroll: true
        });
        window.scrollTo({
            top: 0,
            behavior: 'instant'
        })
    }
};
const Layout = {
    densities: [
        ['comfortable', '100%', 'Confortável'],
        ['compact', '85%', 'Compacta'],
        ['dense', '75%', 'Reduzida'],
        ['mini', '65%', 'Pequena'],
        ['micro', '55%', 'Mínima']
    ],
    refresh() {
        const collapsed = State.data.ui?.sidebarCollapsed === true,
            density = this.densities.some(x => x[0] === State.data.ui?.density) ? State.data.ui.density : 'compact',
            option = this.densities.find(x => x[0] === density);
        $('.app').classList.toggle('sidebar-collapsed', collapsed);
        $('.app').dataset.density = density;
        const b = $('#menuToggle');
        b.innerHTML = icon(collapsed ? 'menu' : 'panel');
        b.setAttribute('aria-expanded', String(!collapsed));
        b.setAttribute('aria-label', collapsed ? 'Abrir menu' : 'Recolher menu');
        b.title = collapsed ? 'Abrir menu' : 'Recolher menu';
        $('#densityLabel').textContent = option[1];
        const scale = $('#densityBtn');
        scale.setAttribute('aria-label', 'Escala da interface: ' + option[2] + ' ' + option[1] + '. Toque para alterar.');
        scale.title = 'Escala da interface: ' + option[2] + ' ' + option[1]
    },
    resize() {
        if (State.step === 4 && State.cycle()) {
            if (State.workView === 'flow') Flow.resize();
            else Kanban.resize()
        }
    },
    toggle() {
        State.data.ui = {
            ...State.data.ui,
            sidebarCollapsed: !(State.data.ui?.sidebarCollapsed === true)
        };
        this.refresh();
        this.resize();
        History.persist()
    },
    cycleDensity() {
        const current = this.densities.findIndex(x => x[0] === (State.data.ui?.density || 'compact')),
            next = this.densities[(current + 1 + this.densities.length) % this.densities.length][0];
        State.data.ui = {
            ...State.data.ui,
            density: next
        };
        this.refresh();
        this.resize();
        History.persist()
    },
    workDetails() {
        const d = State.demand(),
            c = State.cycle();
        Dialog.open('Demanda em trabalho', `<span class="badge">${esc(d.area)}</span><h2>${esc(d.title)}</h2><p style="white-space:pre-wrap">${esc(d.description)||'Sem descrição.'}</p><div class="hint">${Utils.number(c.evaluation?.score??Classification.score(d))}/100 · ${esc(d.status)}<br>Escolhida em ${fmt(c.selectedAt)} · Ciclo ${State.data.cycles.filter(x=>x.demandId===d.id).indexOf(c)+1}</div>`, button('cycle-history', icon('clock') + 'Ciclos anteriores', '', 'type="button" data-id="' + d.id + '"') + button('demand-status', 'Status da demanda', '', 'type="button"') + button('review-go', icon('lock') + 'Revisar', '', 'type="button"') + button('help', 'Como usar', '', 'type="button"') + button('modal-close', 'Fechar', 'primary', 'type="button"'))
    }
};
/* Rendering and navigation. Routine edits replace only their own panel; board moves patch DOM. */
