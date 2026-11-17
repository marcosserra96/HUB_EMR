'use strict';
/* Hub EMR · Toques simultâneos, arrastar e soltar, travas por item e reconhecimento de gestos. */
const Pointers = {
    active: new Map(),
    locks: new Map(),
    locked(key) {
        return this.locks.has(key)
    },
    lock(key, pointerId) {
        if (this.locks.has(key)) return false;
        this.locks.set(key, pointerId);
        return true
    },
    unlock(key, pointerId) {
        if (this.locks.get(key) === pointerId) this.locks.delete(key)
    },
    cancelled: new Set(),
    init() {
        document.addEventListener('pointerdown', e => this.down(e));
        document.addEventListener('pointermove', e => this.move(e), {
            passive: false
        });
        document.addEventListener('pointerup', e => this.up(e, false));
        document.addEventListener('pointercancel', e => this.up(e, true));
        document.addEventListener('contextmenu', e => {
            if (e.target.closest('.canvas,.kanban,.people-tray,.person-drag,.task,.node')) e.preventDefault()
        });
        window.addEventListener('blur', () => this.cancelAll());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.cancelAll()
        })
    },
    cancelAll() {
        for (const p of [...this.active.values()]) this.up({
            pointerId: p.pointerId,
            clientX: p.lastX,
            clientY: p.lastY
        }, true);
        Gestures.clear()
    },
    down(e) {
        if (e.button !== 0 && e.pointerType === 'mouse' || $('#modal').open || State.step !== 4) return;
        const target = e.target,
            assignee = target.closest('[data-assignee-person]'),
            task = target.closest('[data-task-id]'),
            person = target.closest('[data-person-drag]'),
            node = target.closest('[data-node-id]'),
            edge = target.closest('[data-edge-id]'),
            canvas = target.closest('#flowCanvas'),
            column = target.closest('[data-column]');
        if (!task && !person && !node && !edge && !canvas && !column) return;
        const p = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            startAt: performance.now(),
            el: target,
            moved: false,
            timer: null
        };
        if (assignee) {
            p.kind = 'assignee';
            p.id = assignee.dataset.assigneePerson;
            p.taskId = assignee.dataset.assigneeTask;
            p.key = 'task:' + p.taskId;
            p.el = assignee;
            p.card = task;
            if (!this.lock(p.key, e.pointerId)) return;
            p.card.classList.add('locked');
            assignee.dataset.suppressClickUntil = String(performance.now() + 1200)
        } else if (task) {
            p.kind = 'task';
            p.id = task.dataset.taskId;
            p.key = 'task:' + p.id;
            p.el = task;
            p.mode = 'press';
            const pending = Gestures.pending.get(p.id);
            if (pending) {
                clearTimeout(pending.timer);
                this.locks.delete(p.key)
            }
            if (!this.lock(p.key, e.pointerId)) {
                Feedback.toast('Este card está sendo manipulado por outra pessoa.');
                return
            }
            p.points = [{
                x: e.clientX,
                y: e.clientY
            }];
            p.rect = task.getBoundingClientRect();
            task.classList.add('locked');
            p.timer = setTimeout(() => {
                if (!this.active.has(p.pointerId) || p.mode !== 'press') return;
                if (Gestures.pending.has(p.id)) {
                    Gestures.cancel(p.id);
                    this.locks.set(p.key, p.pointerId)
                }
                p.mode = 'drag';
                p.ghost = this.ghost(task.querySelector('h3').textContent, e.clientX, e.clientY, true);
                task.classList.add('drag-origin');
                navigator.vibrate?.(35);
                Feedback.toast('Arraste para outra coluna.')
            }, 500)
        } else if (person) {
            p.kind = 'person';
            p.id = person.dataset.personDrag;
            p.el = person;
            p.ghost = this.ghost(person.textContent, e.clientX, e.clientY, false)
        } else if (node) {
            p.id = node.dataset.nodeId;
            p.port = target.closest('[data-port]')?.dataset.port;
            p.kind = p.port ? 'connect' : 'node';
            p.key = 'node:' + State.flowKind + ':' + p.id;
            p.el = node;
            if (!this.lock(p.key, e.pointerId)) {
                Feedback.toast('Este elemento está em uso.');
                return
            }
            node.classList.add('locked');
            p.startPoint = Flow.point(e.clientX, e.clientY);
            const n = Flow.get().nodes.find(x => x.id === p.id);
            p.origin = {
                x: n.x,
                y: n.y
            };
            if (p.kind === 'connect') {
                p.point = p.startPoint;
                Flow.previewLine(p)
            }
        } else if (edge) {
            p.kind = 'edge';
            p.id = edge.dataset.edgeId;
            p.el = edge
        } else if (canvas) {
            p.kind = 'pan';
            p.el = canvas;
            p.startView = clone(Flow.viewport);
            p.timer = setTimeout(() => {
                if (!this.active.has(p.pointerId) || p.moved || Flow.pinch) return;
                const pos = Flow.point(p.startX, p.startY);
                this.active.delete(p.pointerId);
                this.release(p);
                if (this.active.size === 0) Flow.open(null, pos);
                else Feedback.toast('Finalize os demais toques para criar um item.')
            }, 500)
        } else if (column) {
            p.kind = 'blank-column';
            p.column = column.dataset.column;
            p.el = column;
            p.timer = setTimeout(() => {
                if (!this.active.has(p.pointerId) || p.moved) return;
                this.active.delete(p.pointerId);
                this.release(p);
                if (this.active.size === 0) Kanban.quick(p.column);
                else Feedback.toast('Finalize os demais toques para criar um post-it.')
            }, 500)
        }
        this.active.set(e.pointerId, p);
        if (p.kind === 'pan') {
            const pans = [...this.active.values()].filter(x => x.kind === 'pan');
            if (pans.length >= 2) {
                pans.forEach(x => clearTimeout(x.timer));
                const [a, b] = pans;
                Flow.pinch = {
                    ids: [a.pointerId, b.pointerId],
                    distance: Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY),
                    mid: {
                        x: (a.lastX + b.lastX) / 2,
                        y: (a.lastY + b.lastY) / 2
                    },
                    view: clone(Flow.viewport)
                }
            }
        }
        try {
            p.el.setPointerCapture(e.pointerId)
        } catch (_) {}
        e.preventDefault()
    },
    ghost(text, x, y, task) {
        const g = document.createElement('div');
        g.className = 'ghost' + (task ? ' taskghost' : '');
        g.textContent = text;
        g.style.left = x + 'px';
        g.style.top = y + 'px';
        document.body.append(g);
        return g
    },
    move(e) {
        const p = this.active.get(e.pointerId);
        if (!p) return;
        e.preventDefault();
        p.lastX = e.clientX;
        p.lastY = e.clientY;
        const distance = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
        if (distance > 9) {
            p.moved = true;
            if (p.kind !== 'task' || p.mode === 'press') clearTimeout(p.timer)
        }
        if (p.kind === 'node' && p.moved) {
            const q = Flow.point(e.clientX, e.clientY);
            p.next = {
                x: Math.max(0, Math.min(4776, p.origin.x + q.x - p.startPoint.x)),
                y: Math.max(0, Math.min(2872, p.origin.y + q.y - p.startPoint.y))
            };
            p.el.style.left = p.next.x + 'px';
            p.el.style.top = p.next.y + 'px';
            Flow.lines()
        } else if (p.kind === 'connect') {
            p.point = Flow.point(e.clientX, e.clientY);
            Flow.previewLine(p)
        } else if (p.kind === 'task') {
            if (p.mode === 'press' && distance > 9) {
                p.mode = 'draw';
                Gestures.start(p)
            }
            if (p.mode === 'draw') {
                const last = p.points.at(-1);
                if (Math.hypot(last.x - e.clientX, last.y - e.clientY) > 2) p.points.push({
                    x: e.clientX,
                    y: e.clientY
                })
            } else if (p.mode === 'drag') {
                p.ghost.style.left = e.clientX + 'px';
                p.ghost.style.top = e.clientY + 'px';
                p.drop = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-column]');
                this.highlights()
            }
        } else if (p.kind === 'assignee' && p.moved) {
            if (!p.ghost) {
                p.ghost = this.ghost(p.el.textContent, e.clientX, e.clientY, false);
                p.ghost.classList.add('assignee-ghost');
                p.el.classList.add('drag-origin');
                this.assigneeZone()
            }
            p.ghost.style.left = e.clientX + 'px';
            p.ghost.style.top = e.clientY + 'px';
            p.drop = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-task-id]');
            p.removeIntent = !p.drop && distance > 28;
            this.highlights()
        } else if (p.kind === 'person') {
            p.ghost.style.left = e.clientX + 'px';
            p.ghost.style.top = e.clientY + 'px';
            p.drop = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-task-id]');
            this.highlights()
        } else if (p.kind === 'pan') {
            if (Flow.pinch) {
                const [a, b] = Flow.pinch.ids.map(id => this.active.get(id));
                if (a && b) {
                    const d = Flow.pinch,
                        r = $('#flowCanvas').getBoundingClientRect(),
                        mx = (a.lastX + b.lastX) / 2 - r.left,
                        my = (a.lastY + b.lastY) / 2 - r.top,
                        z = Math.max(.2, Math.min(2.5, d.view.z * Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY) / Math.max(10, d.distance)));
                    Flow.viewport = {
                        x: mx - (d.mid.x - r.left - d.view.x) * z / d.view.z,
                        y: my - (d.mid.y - r.top - d.view.y) * z / d.view.z,
                        z
                    };
                    Flow.camera()
                }
            } else if (p.moved) {
                Flow.viewport = {
                    ...p.startView,
                    x: p.startView.x + e.clientX - p.startX,
                    y: p.startView.y + e.clientY - p.startY
                };
                Flow.camera()
            }
        }
    },
    assigneeZone() {
        if (!$('#assigneeTrash')) {
            const el = document.createElement('div');
            el.id = 'assigneeTrash';
            el.className = 'assignee-trash';
            el.innerHTML = icon('trash') + '<span>Solte aqui ou fora dos cards para retirar o vínculo</span>';
            document.body.append(el)
        }
    },
    highlights() {
        const assignees = [...this.active.values()].filter(p => p.kind === 'assignee' && p.ghost);
        if (!assignees.length) $('#assigneeTrash')?.remove();
        else $('#assigneeTrash')?.classList.toggle('active', assignees.some(p => p.removeIntent));
        $$('.drop-target').forEach(x => x.classList.remove('drop-target'));
        for (const p of this.active.values()) p.drop?.classList.add('drop-target')
    },
    release(p) {
        clearTimeout(p.timer);
        p.ghost?.remove();
        p.el?.classList.remove('locked', 'drag-origin');
        p.card?.classList.remove('locked');
        this.unlock(p.key, p.pointerId);
        try {
            p.el.releasePointerCapture(p.pointerId)
        } catch (_) {}
        $('#preview-' + p.pointerId)?.remove();
        this.highlights()
    },
    up(e, cancel) {
        const p = this.active.get(e.pointerId);
        if (!p) return;
        this.active.delete(e.pointerId);
        clearTimeout(p.timer);
        const x = e.clientX ?? p.lastX,
            y = e.clientY ?? p.lastY;
        if (cancel) {
            if (p.kind === 'node') {
                p.el.style.left = p.origin.x + 'px';
                p.el.style.top = p.origin.y + 'px'
            }
            if (p.kind === 'task') Gestures.cancel(p.id);
            if (p.kind === 'pan') {
                Flow.pinch = null;
                for (const other of this.active.values())
                    if (other.kind === 'pan') {
                        other.startX = other.lastX;
                        other.startY = other.lastY;
                        other.startView = clone(Flow.viewport);
                        other.moved = true
                    } if (![...this.active.values()].some(x => x.kind === 'pan')) {
                    Flow.viewport = clone(Flow.get().view);
                    Flow.camera()
                }
            }
            this.release(p);
            if (p.kind === 'node' || p.kind === 'connect') Flow.lines();
            return
        }
        if (p.kind === 'node') {
            if (p.next) {
                History.commit('Elemento do fluxo movimentado', () => Object.assign(Flow.get().nodes.find(x => x.id === p.id), p.next), State.demand().id)
            } else if (!p.moved && this.active.size === 0) {
                this.release(p);
                Flow.open(p.id);
                return
            }
        } else if (p.kind === 'connect') {
            const hit = document.elementFromPoint(x, y)?.closest('[data-node-id]');
            if (hit && hit.dataset.nodeId !== p.id) {
                const targetId = hit.dataset.nodeId,
                    point = Flow.point(x, y),
                    n = Flow.get().nodes.find(n => n.id === targetId),
                    dist = [
                        ['left', Math.abs(point.x - n.x)],
                        ['right', Math.abs(point.x - n.x - 224)],
                        ['top', Math.abs(point.y - n.y)],
                        ['bottom', Math.abs(point.y - n.y - 128)]
                    ].sort((a, b) => a[1] - b[1]);
                const targetPort = document.elementFromPoint(x, y)?.closest('[data-port]')?.dataset.port || dist[0][0];
                if (!Flow.get().edges.some(l => l.from === p.id && l.to === targetId && l.fromPort === p.port && l.toPort === targetPort)) {
                    History.commit('Conexão criada no fluxo', () => Flow.get().edges.push({
                        id: uid(),
                        from: p.id,
                        to: targetId,
                        fromPort: p.port,
                        toPort: targetPort,
                        label: ''
                    }), State.demand().id);
                    Feedback.toast('Conexão criada.', true)
                }
            } else Feedback.toast('Solte na borda de outro elemento para conectar.')
        } else if (p.kind === 'edge' && !p.moved && this.active.size === 0) {
            this.release(p);
            Flow.edgeOpen(p.id);
            return
        } else if (p.kind === 'task') {
            if (p.mode === 'draw') {
                this.release(p);
                Gestures.finish(p);
                return
            }
            if (p.mode === 'drag') {
                const col = document.elementFromPoint(x, y)?.closest('[data-column]')?.dataset.column,
                    t = State.cycle().tasks.find(t => t.id === p.id);
                if (col && t.column !== col) {
                    History.commit('Atividade movida para ' + Columns.find(c => c[0] === col)[1], () => {
                        t.column = col;
                        t.updatedAt = now()
                    }, State.demand().id);
                    Feedback.toast('Atividade movida.', true)
                }
                this.release(p);
                Kanban.patch();
                return
            }
            if (Gestures.pending.has(p.id)) {
                const pending = Gestures.pending.get(p.id);
                this.release(p);
                this.locks.set(p.key, 'gesture');
                pending.timer = setTimeout(() => Gestures.reject(p.id), 750);
                return
            }
            if (!p.moved && this.active.size === 0) {
                this.release(p);
                Kanban.open(p.id);
                return
            }
        } else if (p.kind === 'assignee') {
            const target = document.elementFromPoint(x, y)?.closest('[data-task-id]'),
                distance = Math.hypot(x - p.startX, y - p.startY);
            p.el.dataset.suppressClickUntil = String(performance.now() + 1200);
            this.release(p);
            if (p.moved) {
                if (target) {
                    const id = target.dataset.taskId;
                    if (id !== p.taskId && !this.locked('task:' + id)) Kanban.transferAssignee(p.id, p.taskId, id)
                } else if (distance > 28) Kanban.transferAssignee(p.id, p.taskId)
            } else if (this.active.size === 0) Kanban.assigneeOptions(p.id, p.taskId);
            return
        } else if (p.kind === 'person') {
            const task = document.elementFromPoint(x, y)?.closest('[data-task-id]');
            this.release(p);
            if (task) {
                const taskId = task.dataset.taskId;
                if (this.locked('task:' + taskId)) Feedback.toast('Aguarde a manipulação desta atividade terminar.');
                else Kanban.assign(p.id, taskId)
            } else if (!p.moved) Feedback.toast('Arraste esta pessoa para um post-it.');
            return
        } else if (p.kind === 'pan') {
            if (Flow.pinch) {
                Flow.pinch = null;
                for (const other of this.active.values())
                    if (other.kind === 'pan') {
                        other.startX = other.lastX;
                        other.startY = other.lastY;
                        other.startView = clone(Flow.viewport);
                        other.moved = true
                    }
            }
            if (![...this.active.values()].some(x => x.kind === 'pan')) Flow.persistView()
        }
        this.release(p);
        if (p.kind === 'connect' || p.kind === 'node') Flow.lines()
    },
};
const Gestures = {
    pending: new Map(),
    start(p) {
        const old = this.pending.get(p.id);
        if (old) clearTimeout(old.timer)
    },
    finish(p) {
        const old = this.pending.get(p.id);
        const traces = old ? old.traces : [];
        traces.push(p.points);
        const pending = {
            traces,
            rect: p.rect,
            timer: null
        };
        this.pending.set(p.id, pending);
        Pointers.locks.set('task:' + p.id, 'gesture');
        const verdict = this.recognize(traces, p.rect);
        if (verdict) {
            this.apply(p.id, verdict);
            return
        }
        if (traces.length >= 2) {
            this.reject(p.id);
            return
        }
        pending.timer = setTimeout(() => this.reject(p.id), 750)
    },
    length(points) {
        let n = 0;
        for (let i = 1; i < points.length; i++) n += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        return n
    },
    straight(p) {
        return p.length >= 2 && Math.hypot(p.at(-1).x - p[0].x, p.at(-1).y - p[0].y) / Math.max(1, this.length(p)) > .87
    },
    arrow(traces) {
        if (traces.length !== 2) return null;
        for (let k = 0; k < 2; k++) {
            const stem = traces[k],
                head = traces[1 - k];
            if (stem.length < 2 || head.length < 3 || !this.straight(stem)) continue;
            const a = stem[0],
                b = stem.at(-1),
                width = Math.abs(b.x - a.x),
                sy = (a.y + b.y) / 2;
            if (width < 50 || Math.abs(b.y - a.y) > Math.max(7, width * .12)) continue;
            for (const dir of [1, -1]) {
                let i = 0;
                for (let j = 1; j < head.length; j++)
                    if (dir * head[j].x > dir * head[i].x) i = j;
                if (i === 0 || i === head.length - 1) continue;
                const tip = head[i],
                    h1 = head[0],
                    h2 = head.at(-1),
                    end = dir === 1 ? (a.x > b.x ? a : b) : (a.x < b.x ? a : b);
                if (Math.hypot(tip.x - end.x, tip.y - end.y) > 14 || Math.abs(tip.y - sy) > 12 || dir * (tip.x - h1.x) < 16 || dir * (tip.x - h2.x) < 16 || !((h1.y < sy - 15 && h2.y > sy + 15) || (h2.y < sy - 15 && h1.y > sy + 15)) || !this.straight(head.slice(0, i + 1)) || !this.straight(head.slice(i))) continue;
                return dir === 1 ? 'next' : 'previous'
            }
        }
        return null
    },
    intersection(a, b, c, d) {
        const cross = (p, q) => p.x * q.y - p.y * q.x,
            r = {
                x: b.x - a.x,
                y: b.y - a.y
            },
            s = {
                x: d.x - c.x,
                y: d.y - c.y
            },
            den = cross(r, s);
        if (Math.abs(den) < .001) return false;
        const q = {
                x: c.x - a.x,
                y: c.y - a.y
            },
            t = cross(q, s) / den,
            u = cross(q, r) / den;
        return t > .18 && t < .82 && u > .18 && u < .82
    },
    recognize(traces, rect) {
        const all = traces.flat(),
            minX = Math.min(...all.map(p => p.x)),
            maxX = Math.max(...all.map(p => p.x)),
            minY = Math.min(...all.map(p => p.y)),
            maxY = Math.max(...all.map(p => p.y)),
            w = maxX - minX,
            h = maxY - minY;
        if (w < 45 || h < 30 || !all.every(p => p.x >= rect.left - 14 && p.x <= rect.right + 14 && p.y >= rect.top - 14 && p.y <= rect.bottom + 14)) return null;
        const arrow = this.arrow(traces);
        if (arrow) return arrow;
        if (traces.length === 1) {
            const p = traces[0];
            if (p.length < 5) return null;
            let k = 0;
            for (let i = 1; i < p.length; i++)
                if (p[i].y > p[k].y) k = i;
            const a = p[0],
                b = p[k],
                c = p.at(-1),
                left = p.slice(0, k + 1),
                right = p.slice(k);
            if (k > 0 && k < p.length - 1 && b.x - a.x > 12 && b.y - a.y > 14 && c.x - b.x > 24 && b.y - c.y > 26 && c.x - b.x > 1.1 * (b.x - a.x) && c.y < a.y + 15 && this.straight(left) && this.straight(right)) return 'check';
            return null
        }
        if (traces.length === 2) {
            const [a, b] = traces;
            if (!this.straight(a) || !this.straight(b)) return null;
            const ends = trace => {
                const p = trace[0],
                    q = trace.at(-1);
                return {
                    p,
                    q,
                    dx: q.x - p.x,
                    dy: q.y - p.y
                }
            };
            const x = ends(a),
                y = ends(b);
            if (Math.abs(x.dx) < 32 || Math.abs(x.dy) < 30 || Math.abs(y.dx) < 32 || Math.abs(y.dy) < 30) return null;
            if (x.dx * x.dy * y.dx * y.dy < 0 && Math.abs(x.dy / x.dx) > .4 && Math.abs(x.dy / x.dx) < 2.5 && Math.abs(y.dy / y.dx) > .4 && Math.abs(y.dy / y.dx) < 2.5 && this.intersection(x.p, x.q, y.p, y.q)) return 'x'
        }
        return null
    },
    apply(id, kind) {
        const t = State.cycle()?.tasks.find(t => t.id === id);
        if (!t) {
            this.cancel(id);
            return
        }
        const index = Columns.findIndex(c => c[0] === t.column),
            next = index + (kind === 'next' ? 1 : -1);
        if ((kind === 'next' || kind === 'previous') && (t.cancelled || next < 0 || next >= Columns.length)) {
            this.cancel(id);
            return
        }
        const labels = {
            check: 'Gesto: atividade concluída',
            x: 'Gesto: atividade cancelada',
            next: 'Gesto: atividade avançou uma coluna',
            previous: 'Gesto: atividade voltou uma coluna'
        };
        History.commit(labels[kind], () => {
            if (kind === 'check') {
                t.column = 'done';
                t.cancelled = false
            } else if (kind === 'x') t.cancelled = true;
            else t.column = Columns[next][0];
            t.updatedAt = now()
        }, State.demand().id);
        this.cancel(id);
        Kanban.patch()
    },
    reject(id) {
        if (!this.pending.has(id)) return;
        this.cancel(id)
    },
    cancel(id) {
        const p = this.pending.get(id);
        if (p) {
            clearTimeout(p.timer);
            this.pending.delete(id)
        }
        Pointers.locks.delete('task:' + id)
    },
    clear() {
        for (const id of [...this.pending.keys()]) this.cancel(id)
    }
};
/* Small floating keyboard. The trigger is an actual touch on an editable field,
   not screen size or maxTouchPoints, so hybrid mouse use stays unchanged. */
