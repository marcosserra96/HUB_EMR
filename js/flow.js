'use strict';
/* Hub EMR · Quadro de fluxo AS IS / TO BE: modelo, câmera, conexões. */
const Flow = {
    viewport: null,
    pinch: null,
    get() {
        return State.cycle()?.flows[State.flowKind]
    },
    html() {
        const f = this.get(),
            kind = State.flowKind === 'asis' ? 'AS IS' : 'TO BE';
        return `<div class="work-toolbar"><div class="segmented" role="group" aria-label="Fluxo">${button('flow-kind','<span>AS IS</span><small>como é hoje</small>',State.flowKind==='asis'?'chosen':'','data-kind="asis" aria-pressed="'+(State.flowKind==='asis')+'"')}${button('flow-kind','<span>TO BE</span><small>como será</small>',State.flowKind==='tobe'?'chosen':'','data-kind="tobe" aria-pressed="'+(State.flowKind==='tobe')+'"')}</div><div class="toolbar-group">${button('flow-copy',icon('copy')+'Copiar AS IS para TO BE','secondary','title="O TO BE começa como cópia independente do AS IS"')}<div class="zoom" role="group" aria-label="Zoom">${button('flow-zoom-out','−','icon-button','aria-label="Diminuir zoom" title="Diminuir zoom"')}${button('flow-fit',Math.round((f.view?.z||1)*100)+'%','zoom-value','aria-label="Enquadrar todo o fluxo" title="Enquadrar todo o fluxo" id="zoomLabel"')}${button('flow-zoom-in','+','icon-button','aria-label="Aumentar zoom" title="Aumentar zoom"')}</div>${button('flow-add',icon('plus')+'Novo item','primary')}</div></div><div class="canvas-shell"><div class="canvas" id="flowCanvas" aria-label="Quadro do fluxo ${kind}"><div class="world" id="flowWorld"><svg class="flow-lines" width="5000" height="3000" id="flowLines"></svg><div id="flowNodes"></div></div></div><div class="canvas-help"><span><b>Mover:</b> arraste o elemento</span><span><b>Conectar:</b> arraste a partir de um ponto azul</span><span><b>Editar:</b> toque no elemento ou na linha</span><span><b>Navegar:</b> arraste o fundo · dois dedos para zoom</span></div></div>`
    },
    resize() {
        const c = $('#flowCanvas');
        if (!c) return;
        const help = c.nextElementSibling?.getBoundingClientRect().height || 40;
        c.style.minHeight = '260px';
        c.style.height = Math.max(260, innerHeight - (c.getBoundingClientRect().top + scrollY) - help - parseFloat(getComputedStyle($('#content')).paddingBottom) - 2) + 'px'
    },
    mount() {
        this.viewport = clone(this.get().view);
        this.resize();
        this.renderNodes();
        this.lines();
        this.camera()
    },
    nodeHTML(n) {
        return `<article class="node ${esc(n.type)}" data-node-id="${n.id}" style="left:${n.x}px;top:${n.y}px" role="button" tabindex="0" aria-label="${esc(n.title)}. Arraste para mover ou toque para editar."><div class="nodebody"><small>${NodeTypes[n.type]}</small><b>${esc(n.title)}</b></div>${['left','top','right','bottom'].map(port=>`<button type="button" class="port" data-port="${port}" aria-label="Conectar pela borda: ${PortNames[port].toLowerCase()}"></button>`).join('')}</article>`
    },
    renderNodes() {
        const el = $('#flowNodes');
        if (el) el.innerHTML = this.get().nodes.map(n => this.nodeHTML(n)).join('');
        $('#flowEmpty')?.remove();
        if (!this.get().nodes.length && $('#flowCanvas')) $('#flowCanvas').insertAdjacentHTML('beforeend', `<div id="flowEmpty" class="canvas-empty"><div class="empty-icon">${icon('flow')}</div><h2>Desenhe o processo ${State.flowKind==='asis'?'como ele é hoje':'como ele deve ficar'}</h2><p>Toque em <b>Novo item</b> ou toque e segure uma área vazia do quadro por meio segundo.</p></div>`)
    },
    nodePosition(id) {
        for (const p of Pointers.active.values())
            if (p.kind === 'node' && p.id === id && p.next) return p.next;
        return this.get().nodes.find(x => x.id === id)
    },
    anchor(id, port) {
        const n = this.nodePosition(id);
        if (!n) return {
            x: 0,
            y: 0
        };
        return {
            x: n.x + (port === 'left' ? 0 : port === 'right' ? 224 : 112),
            y: n.y + (port === 'top' ? 0 : port === 'bottom' ? 128 : 64)
        }
    },
    path(a, b, from = 'right', to = 'left') {
        const vec = {
                left: [-1, 0],
                right: [1, 0],
                top: [0, -1],
                bottom: [0, 1]
            },
            v = vec[from],
            w = vec[to],
            k = Math.max(50, Math.min(180, Math.hypot(a.x - b.x, a.y - b.y) * .4));
        return `M${a.x},${a.y} C${a.x+v[0]*k},${a.y+v[1]*k} ${b.x+w[0]*k},${b.y+w[1]*k} ${b.x},${b.y}`
    },
    lines() {
        const svg = $('#flowLines');
        if (!svg) return;
        svg.innerHTML = `<defs><marker id="flowArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" class="edge-arrow"/></marker></defs>` + this.get().edges.map(e => {
            const a = this.anchor(e.from, e.fromPort),
                b = this.anchor(e.to, e.toPort),
                path = this.path(a, b, e.fromPort, e.toPort);
            return `<g data-edge-id="${e.id}" role="button" tabindex="0" aria-label="Conexão ${esc(e.label||'sem rótulo')}"><path d="${path}" fill="none" class="edge-path" marker-end="url(#flowArrow)"/><path class="edge-hit" d="${path}" fill="none" vector-effect="non-scaling-stroke"/>${e.label?`<text class="edge-label" x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2-10}" text-anchor="middle">${esc(e.label)}</text>`:''}</g>`
        }).join('');
        for (const p of Pointers.active.values())
            if (p.kind === 'connect' && p.point) this.previewLine(p)
    },
    previewLine(p) {
        const a = this.anchor(p.id, p.port);
        let el = $('#preview-' + p.pointerId);
        if (!el) {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            el.id = 'preview-' + p.pointerId;
            el.setAttribute('class', 'edge-preview');
            $('#flowLines')?.appendChild(el)
        }
        el.setAttribute('d', this.path(a, p.point, p.port, 'left'))
    },
    camera() {
        if (!this.viewport || !$('#flowWorld')) return;
        const v = this.viewport;
        $('#flowWorld').style.setProperty('--portScale', String(1 / v.z));
        $('#flowWorld').style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
        const z = $('#zoomLabel');
        if (z) z.textContent = Math.round(v.z * 100) + '%'
    },
    point(x, y) {
        const r = $('#flowCanvas').getBoundingClientRect(),
            v = this.viewport;
        return {
            x: (x - r.left - v.x) / v.z,
            y: (y - r.top - v.y) / v.z
        }
    },
    /** Câmera do quadro: salva junto com os dados, mas não entra no desfazer nem na auditoria. */
    persistView() {
        const v = clone(this.viewport);
        if (JSON.stringify(v) === JSON.stringify(this.get().view)) return;
        this.get().view = v;
        State.data.updatedAt = now();
        History.persist()
    },
    zoom(factor) {
        const r = $('#flowCanvas').getBoundingClientRect(),
            v = this.viewport;
        const cx = r.width / 2,
            cy = r.height / 2,
            z = Math.max(.2, Math.min(2.5, v.z * factor)),
            k = z / v.z;
        v.x = cx - (cx - v.x) * k;
        v.y = cy - (cy - v.y) * k;
        v.z = z;
        this.camera();
        this.persistView()
    },
    fit() {
        const nodes = this.get().nodes;
        if (!nodes.length) {
            this.viewport = {
                x: 40,
                y: 40,
                z: 1
            };
            this.camera();
            this.persistView();
            return
        }
        const box = this.bounds(nodes),
            r = $('#flowCanvas').getBoundingClientRect();
        const z = Math.max(.2, Math.min(1.5, (r.width - 100) / (box.w), (r.height - 100) / (box.h)));
        this.viewport = {
            x: (r.width - box.w * z) / 2 - box.x * z,
            y: (r.height - box.h * z) / 2 - box.y * z,
            z
        };
        this.camera();
        this.persistView()
    },
    bounds(nodes) {
        if (!nodes.length) return {
            x: 0,
            y: 0,
            w: 650,
            h: 300
        };
        const minX = Math.min(...nodes.map(n => n.x)),
            minY = Math.min(...nodes.map(n => n.y));
        return {
            x: minX - 36,
            y: minY - 36,
            w: Math.max(...nodes.map(n => n.x + 224)) - minX + 72,
            h: Math.max(...nodes.map(n => n.y + 128)) - minY + 72
        }
    },
    open(id = null, pos = null) {
        const n = this.get().nodes.find(n => n.id === id);
        const bounds = $('#flowCanvas').getBoundingClientRect();
        let p = pos || this.point(bounds.left + 120, bounds.top + 100);
        if (!n && !pos) {
            const base = clone(p),
                cols = Math.max(1, Math.floor((bounds.width / this.viewport.z - 150) / 264));
            for (let i = 0; i < 200; i++) {
                const q = {
                    x: base.x + (i % cols) * 264,
                    y: base.y + Math.floor(i / cols) * 176
                };
                if (!this.get().nodes.some(n => Math.abs(n.x - q.x) < 248 && Math.abs(n.y - q.y) < 152)) {
                    p = q;
                    break
                }
            }
        }
        Dialog.open(n ? 'Editar elemento' : 'Novo item no fluxo ' + (State.flowKind === 'asis' ? 'AS IS' : 'TO BE'), field('title', 'Texto do elemento', n?.title, 'text', true, 'maxlength="500"') + selectField('type', 'Tipo', Object.entries(NodeTypes), n?.type || 'step') + (n ? `<div class="dialog-extra">${button('node-to-task', icon('board') + 'Criar atividade no kanban a partir deste elemento', 'secondary', 'data-id="' + n.id + '"')}</div>` : ''), (n ? button('node-delete', icon('trash') + 'Excluir', 'danger-ghost', `data-id="${n.id}"`) : '') + saveFooter(), () => {
            const v = formValues();
            if (!v.title.trim()) return Dialog.error('Informe o texto do elemento.');
            History.commit(n ? 'Elemento do fluxo editado' : 'Elemento criado no fluxo ' + State.flowKind.toUpperCase(), () => {
                if (n) Object.assign(n, {
                    title: v.title.trim(),
                    type: v.type
                });
                else this.get().nodes.push({
                    id: uid(),
                    title: v.title.trim(),
                    type: v.type,
                    x: Math.max(0, Math.min(4776, p.x)),
                    y: Math.max(0, Math.min(2872, p.y))
                })
            }, State.demand().id);
            Dialog.close();
            this.renderNodes();
            this.lines();
            Feedback.toast('Elemento salvo.', true)
        })
    },
    remove(id) {
        Dialog.confirm('Excluir elemento do fluxo?', 'As conexões deste elemento também serão removidas. As atividades do Kanban são preservadas.', () => {
            History.commit('Elemento do fluxo excluído', () => {
                const f = this.get();
                f.nodes = f.nodes.filter(n => n.id !== id);
                f.edges = f.edges.filter(e => e.from !== id && e.to !== id)
            }, State.demand().id);
            this.renderNodes();
            this.lines();
            Feedback.toast('Elemento removido.', true)
        }, 'Excluir', true)
    },
    copy() {
        Dialog.confirm('Copiar AS IS para TO BE?', this.get() && State.cycle().flows.tobe.nodes.length ? 'O TO BE atual será substituído por uma cópia independente do AS IS. Você poderá desfazer.' : 'O TO BE começará como uma cópia independente do AS IS.', () => {
            History.commit('AS IS copiado para TO BE', () => {
                const f = clone(State.cycle().flows.asis),
                    map = new Map();
                f.nodes.forEach(n => {
                    const old = n.id;
                    n.id = uid();
                    map.set(old, n.id)
                });
                f.edges.forEach(e => {
                    e.id = uid();
                    e.from = map.get(e.from);
                    e.to = map.get(e.to)
                });
                State.cycle().flows.tobe = f
            }, State.demand().id);
            State.flowKind = 'tobe';
            Render.page();
            Feedback.toast('AS IS copiado. O TO BE pode ser editado independentemente.', true)
        }, 'Copiar fluxo')
    },
    edgeOpen(id) {
        const e = this.get().edges.find(x => x.id === id);
        if (!e) return;
        Dialog.open('Editar conexão', field('label', 'Rótulo da conexão (opcional)', e.label, 'text', false, 'maxlength="150"') + selectField('from', 'Origem', this.get().nodes.map(n => [n.id, n.title]), e.from) + selectField('fromPort', 'Borda da origem', Object.entries(PortNames), e.fromPort) + selectField('to', 'Destino', this.get().nodes.map(n => [n.id, n.title]), e.to) + selectField('toPort', 'Borda do destino', Object.entries(PortNames), e.toPort), button('edge-delete', icon('trash') + 'Excluir', 'danger-ghost', `data-id="${e.id}"`) + saveFooter(), () => {
            const v = formValues();
            if (v.from === v.to) return Dialog.error('Selecione elementos diferentes na origem e no destino.');
            History.commit('Conexão editada', () => Object.assign(e, v), State.demand().id);
            Dialog.close();
            this.lines();
            Feedback.toast('Conexão atualizada.', true)
        })
    },
    edgeDelete(id) {
        Dialog.confirm('Excluir conexão?', 'Somente a linha será removida. Os elementos serão preservados.', () => {
            History.commit('Conexão excluída', () => this.get().edges = this.get().edges.filter(x => x.id !== id), State.demand().id);
            this.lines();
            Feedback.toast('Conexão removida.', true)
        }, 'Excluir', true)
    }
};
/* Kanban data never shares nodes/edges. Link sourceNode is provenance only. */
