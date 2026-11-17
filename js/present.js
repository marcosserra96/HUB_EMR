'use strict';
/* Hub EMR · Apresentação de demandas no mapeamento.
   Tocar num card abre a demanda em tela grande: o card sai da posição dele, cresce até o centro
   virando (frente → verso) e mostra o texto inteiro. Tocar fora, Esc ou o X faz o caminho de volta.
   Anterior/Próxima (botões, setas do teclado ou deslizar o dedo) trocam de demanda sem fechar,
   para a rodada em que cada pessoa explica a sua. Só leitura: não altera dados. */
const Presenter = {
    layer: null,
    ids: [],
    index: 0,
    busy: false,
    pending: 0,
    reduced: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    card(id) {
        return $(`#mapResults [data-present-id="${id}"]`)
    },
    open(id) {
        if (this.layer || this.busy) return;
        /* A ordem segue o que está na tela (busca e filtro aplicados). */
        this.ids = $$('#mapResults [data-present-id]').map(x => x.dataset.presentId);
        this.index = Math.max(0, this.ids.indexOf(id));
        const layer = document.createElement('div');
        layer.className = 'present-layer';
        layer.setAttribute('role', 'dialog');
        layer.setAttribute('aria-modal', 'true');
        layer.setAttribute('aria-labelledby', 'presentTitle');
        layer.innerHTML = `<div class="present-scrim" data-action="present-close"></div><div class="present-move"><div class="present-flip"><div class="present-face present-front" aria-hidden="true"></div><div class="present-face present-back"></div></div></div>`;
        document.body.append(layer);
        document.documentElement.classList.add('presenting');
        this.layer = layer;
        this.fill();
        this.bindSwipe();
        const source = this.card(id);
        source?.classList.add('presented');
        this.animate(source, true).then(() => layer.querySelector('[data-action="present-close"].present-x')?.focus())
    },
    /** Conteúdo das duas faces para a demanda atual. */
    fill() {
        const ds = State.activeDemands(),
            d = ds.find(x => x.id === this.ids[this.index]);
        if (!d) return this.close(true);
        const n = ds.indexOf(d) + 1,
            done = Classification.complete(d),
            answered = d.ratings.filter(x => x !== null).length;
        this.layer.querySelector('.present-front').innerHTML = `<span class="present-front-num">${String(n).padStart(2,'0')} · ${esc(d.area)}</span><b>${esc(d.title)}</b><span class="present-front-desc">${esc(d.description)}</span>`;
        this.layer.querySelector('.present-back').innerHTML = `<header class="present-head"><span class="present-count">${this.index+1} de ${this.ids.length}</span>${badge(esc(d.area),'outline')}${done?badge(icon('check')+'Classificada','success'):badge(answered?answered+' de 6 critérios':'Não classificada')}<span class="present-date">Registrada em ${fmt(d.createdAt)}</span>${button('present-close',icon('close'),'icon-button present-x','aria-label="Fechar apresentação" title="Fechar (Esc)"')}</header><div class="present-body"><p class="present-num" aria-hidden="true">${String(n).padStart(2,'0')}</p><h2 id="presentTitle">${esc(d.title)}</h2>${d.description?`<p class="present-desc">${esc(d.description)}</p>`:'<p class="present-desc muted">Sem descrição. Peça para quem trouxe a demanda explicar o problema e registre em Editar.</p>'}</div><footer class="present-foot">${button('present-prev',icon('back')+'Anterior','secondary',this.index===0?'disabled':'')}${button('present-edit',icon('edit')+'Editar','ghost',`data-id="${d.id}"`)}${button('present-next','Próxima'+icon('arrow'),'primary',this.index===this.ids.length-1?'disabled':'')}</footer>`;
        this.layer.querySelector('.present-body').scrollTop = 0
    },
    /** Move o card entre a posição na grade e o centro, girando 180°. */
    animate(source, opening) {
        const move = this.layer.querySelector('.present-move'),
            flip = this.layer.querySelector('.present-flip'),
            scrim = this.layer.querySelector('.present-scrim');
        const target = move.getBoundingClientRect(),
            from = source?.getBoundingClientRect();
        const fade = [{ opacity: 0 }, { opacity: 1 }];
        const timing = { duration: this.reduced() || !from ? 160 : 680, easing: 'cubic-bezier(.45,.05,.2,1)', fill: 'both' };
        let anims;
        if (this.reduced() || !from || !from.width) {
            anims = [move.animate(fade, timing), scrim.animate(fade, timing)];
            flip.style.transform = 'rotateY(180deg)'
        } else {
            const dx = from.left + from.width / 2 - (target.left + target.width / 2),
                dy = from.top + from.height / 2 - (target.top + target.height / 2);
            const small = `translate(${dx}px, ${dy}px) scale(${from.width / target.width}, ${from.height / target.height})`;
            /* A frente é desenhada no tamanho final e encolhida; o texto compensa a escala para parecer o card. */
            this.layer.querySelector('.present-front').style.setProperty('--k', String(target.width / from.width));
            anims = [
                move.animate([{ transform: small }, { transform: 'none' }], timing),
                flip.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], timing),
                scrim.animate(fade, timing)
            ]
        }
        if (!opening) anims.forEach(a => a.reverse());
        this.busy = true;
        return Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => {
            this.busy = false;
            /* Próxima/Anterior tocado durante a abertura: executa agora em vez de ignorar. */
            const pending = this.pending;
            this.pending = 0;
            if (opening && pending) this.go(pending)
        })
    },
    go(step) {
        if (this.layer && this.busy) {
            this.pending = step;
            return
        }
        const next = this.index + step;
        if (!this.layer || next < 0 || next >= this.ids.length) return;
        this.card(this.ids[this.index])?.classList.remove('presented');
        this.index = next;
        this.card(this.ids[this.index])?.classList.add('presented');
        const back = this.layer.querySelector('.present-back');
        back.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-24*step}px)` }], { duration: this.reduced() ? 1 : 120, easing: 'ease-in' }).finished.then(() => {
            this.fill();
            back.animate([{ opacity: 0, transform: `translateX(${24*step}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: this.reduced() ? 1 : 180, easing: 'cubic-bezier(.2,.8,.2,1)' })
        })
    },
    /** Fecha voltando para o card da demanda que está aberta (que pode não ser a primeira). */
    close(instant = false) {
        if (!this.layer || this.busy && !instant) return;
        const layer = this.layer,
            source = this.card(this.ids[this.index]);
        const finish = () => {
            layer.remove();
            document.documentElement.classList.remove('presenting');
            $$('#mapResults .presented').forEach(x => x.classList.remove('presented'));
            source?.querySelector('.card-open')?.focus({ preventScroll: true });
            if (this.layer === layer) this.layer = null;
            this.busy = false
        };
        if (instant) return finish();
        source?.scrollIntoView({ block: 'nearest' });
        this.animate(source, false).then(finish)
    },
    edit(id) {
        this.close(true);
        Demands.open(id)
    },
    bindSwipe() {
        const back = this.layer.querySelector('.present-back');
        let start = null;
        back.addEventListener('pointerdown', e => {
            if (e.pointerType !== 'mouse') start = { x: e.clientX, y: e.clientY }
        });
        back.addEventListener('pointerup', e => {
            if (!start) return;
            const dx = e.clientX - start.x,
                dy = e.clientY - start.y;
            start = null;
            if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) this.go(dx < 0 ? 1 : -1)
        });
        back.addEventListener('pointercancel', () => start = null)
    },
    init() {
        document.addEventListener('keydown', e => {
            if (!this.layer || $('#modal').open) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close()
            } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                e.preventDefault();
                this.go(1)
            } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault();
                this.go(-1)
            } else if (e.key === 'Tab') {
                /* Mantém o foco dentro da apresentação. */
                const items = [...this.layer.querySelectorAll('button:not(:disabled)')];
                const i = items.indexOf(document.activeElement);
                if (e.shiftKey && i <= 0 || !e.shiftKey && i === items.length - 1) {
                    e.preventDefault();
                    items[e.shiftKey ? items.length - 1 : 0]?.focus()
                }
            }
        })
    }
};
