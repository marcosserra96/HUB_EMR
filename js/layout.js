'use strict';
/* Hub EMR · Navegação entre etapas e preferências de layout (menu, escala). */
const Navigation = {
    go(step) {
        TouchKeyboard.hide();
        if (Pointers.active.size || Gestures.pending.size) return Feedback.toast('Finalize os gestos antes de trocar de etapa.');
        if (step === 5 && !State.reviewUnlocked) return Facilitator.gate();
        if (State.step === 5) Facilitator.flush();
        State.step = step;
        Layout.closeDrawer();
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
    mobile: () => matchMedia('(max-width: 760px)').matches,
    current() {
        return this.densities.some(x => x[0] === State.data.ui?.density) ? State.data.ui.density : 'compact'
    },
    refresh() {
        const collapsed = State.data.ui?.sidebarCollapsed === true,
            density = this.current(),
            option = this.densities.find(x => x[0] === density),
            mobile = this.mobile(),
            open = mobile ? document.body.classList.contains('nav-open') : !collapsed;
        $('.app').classList.toggle('sidebar-collapsed', collapsed);
        /* A escala vale para a interface inteira (rem), inclusive janelas; o quadro de fluxo tem zoom próprio. */
        document.documentElement.dataset.density = density;
        const b = $('#menuToggle');
        b.innerHTML = icon(mobile ? (open ? 'close' : 'menu') : (collapsed ? 'menu' : 'panel'));
        b.setAttribute('aria-expanded', String(open));
        b.setAttribute('aria-label', open ? 'Recolher menu' : 'Abrir menu');
        b.title = b.getAttribute('aria-label');
        $('#densityValue').textContent = option[1];
        $$('[data-action="ui-density"]').forEach(x => {
            const on = x.dataset.density === density;
            x.classList.toggle('chosen', on);
            x.setAttribute('aria-pressed', String(on))
        })
    },
    resize() {
        if (State.step === 4 && State.cycle()) {
            if (State.workView === 'flow') Flow.resize();
            else Kanban.resize()
        }
    },
    toggle() {
        if (this.mobile()) {
            document.body.classList.toggle('nav-open');
            this.refresh();
            return
        }
        State.data.ui = {
            ...State.data.ui,
            sidebarCollapsed: !(State.data.ui?.sidebarCollapsed === true)
        };
        this.refresh();
        requestAnimationFrame(() => this.resize());
        History.persist()
    },
    closeDrawer() {
        if (!document.body.classList.contains('nav-open')) return;
        document.body.classList.remove('nav-open');
        this.refresh()
    },
    setDensity(density) {
        if (!this.densities.some(x => x[0] === density)) return;
        State.data.ui = {
            ...State.data.ui,
            density
        };
        this.refresh();
        requestAnimationFrame(() => this.resize());
        History.persist()
    },
    workDetails() {
        const d = State.demand(),
            c = State.cycle(),
            n = State.data.cycles.filter(x => x.demandId === d.id).indexOf(c) + 1;
        Dialog.open('Demanda em trabalho', `<div class="detail-head">${badge(esc(d.area),'outline')}${badge(esc(d.status),statusTone(d.status))}</div><h3 class="detail-title">${esc(d.title)}</h3><p class="pre">${esc(d.description)||'<span class="muted">Sem descrição.</span>'}</p><dl class="meta"><div><dt>Pontuação na escolha</dt><dd><b>${Utils.number(c.evaluation?.score??Classification.score(d))}</b> de 100</dd></div><div><dt>Ciclo</dt><dd>${n}º · iniciado em ${fmt(c.selectedAt)}</dd></div><div><dt>Atividades</dt><dd>${plural(c.tasks.length,'atividade')} · ${plural(c.tasks.filter(t=>t.column==='done'&&!t.cancelled).length,'concluída')}</dd></div></dl><div class="option-list">${button('demand-status',icon('flag')+'<span class="sel-text"><b>Alterar status da demanda</b></span>','sel-item')}${button('cycle-history',icon('history')+'<span class="sel-text"><b>Ciclos anteriores</b></span>','sel-item','data-id="'+d.id+'"')}${button('review-go',icon('lock')+'<span class="sel-text"><b>Ir para a revisão</b></span>','sel-item')}${button('help',icon('help')+'<span class="sel-text"><b>Como usar o quadro</b></span>','sel-item')}</div>`, button('modal-close', 'Fechar', 'secondary'))
    }
};
/** Menus suspensos (<details class="menu"> e a caixa Ferramentas): um aberto por vez,
    fecham com toque fora, Esc ou depois de escolher uma ação. */
const Menus = {
    closeAll(except = null) {
        $$('details.menu[open], details.tools[open]').forEach(x => {
            if (x !== except) x.open = false
        })
    },
    init() {
        document.addEventListener('toggle', e => {
            const d = e.target;
            if (!(d instanceof HTMLDetailsElement) || !d.open || !d.matches('.menu, .tools')) return;
            this.closeAll(d);
            const list = d.querySelector('.menu-list, .tools-panel');
            if (!list) return;
            /* Abre para cima quando não couber abaixo. */
            list.classList.remove('up');
            const r = list.getBoundingClientRect();
            if (r.bottom > innerHeight - 8 && r.top - r.height > 8) list.classList.add('up')
        }, true);
        document.addEventListener('pointerdown', e => {
            if (!e.target.closest('details.menu, details.tools')) this.closeAll()
        }, true);
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            const open = $('details.menu[open], details.tools[open]');
            if (!open) return;
            open.open = false;
            open.querySelector('summary')?.focus()
        });
        document.addEventListener('click', e => {
            const item = e.target.closest('.menu-list [data-action], .tools-panel [data-action]:not([data-action="ui-density"])');
            if (item) setTimeout(() => this.closeAll(), 0)
        })
    }
};
