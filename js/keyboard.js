'use strict';
/* Hub EMR · Teclado virtual para a TV de toque. */
const TouchKeyboard = {
    target: null,
    el: null,
    mode: 'letters',
    shift: false,
    accents: false,
    dirty: false,
    modes: new WeakMap(),
    pointers: new Map(),
    resizePointers: new Map(),
    resizeGesture: null,
    resizeDirty: false,
    triggerClicks: new Map(),
    positioned: false,
    editable(node) {
        const el = node?.closest?.('input,textarea') || (node?.closest?.('label')?.control);
        return el && !el.disabled && !el.readOnly && (el.tagName === 'TEXTAREA' || ['text', 'search', 'url', 'email', 'tel', 'password', 'number'].includes(el.type)) ? el : null
    },
    init() {
        document.addEventListener('click', e => {
            const until = this.triggerClicks.get(e.pointerId);
            if (until) {
                this.triggerClicks.delete(e.pointerId);
                if (until > performance.now()) {
                    e.preventDefault();
                    e.stopImmediatePropagation()
                }
            }
        }, true);
        document.addEventListener('pointerdown', e => this.down(e), true);
        document.addEventListener('pointermove', e => this.move(e), true);
        document.addEventListener('pointerup', e => this.end(e), true);
        document.addEventListener('pointercancel', e => this.end(e), true);
        document.addEventListener('keydown', e => {
            if (this.target && e.isTrusted) this.hide()
        });
        document.addEventListener('click', e => {
            const key = e.target.closest('[data-kbd-key]');
            if (key && e.detail === 0) {
                e.preventDefault();
                this.key(key.dataset.kbdKey)
            } else if (this.target && !this.el?.contains(e.target) && !this.editable(e.target)) this.hide()
        });
        window.addEventListener('resize', () => {
            if (this.target) {
                this.position();
                this.ensureVisible()
            }
        })
    },
    down(e) {
        const resize = e.target.closest('[data-kbd-resize]'),
            key = e.target.closest('[data-kbd-key]'),
            handle = e.target.closest('[data-kbd-handle]');
        if (resize) {
            e.preventDefault();
            this.resizePointers.set(e.pointerId, {
                x: e.clientX,
                y: e.clientY,
                corner: resize.dataset.corner
            });
            try {
                resize.setPointerCapture?.(e.pointerId)
            } catch (_) {}
            if (this.resizePointers.size === 2) {
                const entries = [...this.resizePointers.entries()],
                    [aId, a] = entries[0],
                    [bId, b] = entries[1],
                    pair = a.corner + b.corner;
                if (['tlbr', 'brtl', 'trbl', 'bltr'].includes(pair)) {
                    this.resizeGesture = {
                        ids: [aId, bId],
                        distance: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)),
                        width: this.el.getBoundingClientRect().width
                    };
                    this.resizeDirty = false
                }
            }
            return
        }
        if (key) {
            e.preventDefault();
            this.key(key.dataset.kbdKey);
            return
        }
        if (handle) {
            e.preventDefault();
            if (this.pointers.size || this.resizePointers.size) return;
            const r = this.el.getBoundingClientRect();
            this.pointers.set(e.pointerId, {
                x: e.clientX,
                y: e.clientY,
                left: r.left,
                top: r.top
            });
            try {
                handle.setPointerCapture?.(e.pointerId)
            } catch (_) {}
            return
        }
        if (this.el?.contains(e.target)) return;
        const field = this.editable(e.target);
        if (e.pointerType === 'touch' && field) {
            if (this.target !== field || !this.el?.isConnected) {
                this.triggerClicks.set(e.pointerId, performance.now() + 1000);
                e.preventDefault();
                const focused = document.activeElement === field;
                this.show(field);
                if (!focused) try {
                    field.setSelectionRange(field.value.length, field.value.length)
                } catch (_) {}
            }
            return
        }
        if (field && this.target) {
            e.preventDefault();
            this.hide();
            field.focus({
                preventScroll: true
            })
        }
    },
    move(e) {
        if (this.resizePointers.has(e.pointerId)) {
            e.preventDefault();
            const p = this.resizePointers.get(e.pointerId);
            p.x = e.clientX;
            p.y = e.clientY;
            if (this.resizeGesture) {
                const [a, b] = this.resizeGesture.ids.map(id => this.resizePointers.get(id));
                if (a && b) {
                    const distance = Math.hypot(a.x - b.x, a.y - b.y);
                    this.applySize(this.resizeGesture.width * distance / this.resizeGesture.distance);
                    this.resizeDirty = true
                }
            }
            return
        }
        const p = this.pointers.get(e.pointerId);
        if (!p || !this.el) return;
        e.preventDefault();
        const r = this.el.getBoundingClientRect(),
            left = Math.max(8, Math.min(innerWidth - r.width - 8, p.left + e.clientX - p.x)),
            top = Math.max(8, Math.min(innerHeight - r.height - 8, p.top + e.clientY - p.y));
        this.el.style.left = left + 'px';
        this.el.style.top = top + 'px';
        this.positioned = true
    },
    end(e) {
        if (this.resizePointers.has(e.pointerId)) {
            this.resizePointers.delete(e.pointerId);
            if (this.resizeGesture?.ids.includes(e.pointerId)) {
                if (this.resizeDirty) this.persistSize();
                this.resizeGesture = null;
                this.resizeDirty = false
            }
            return
        }
        this.pointers.delete(e.pointerId)
    },
    currentSize() {
        return this.mode === 'numeric' ? (State.data.ui?.keyboardNumericWidth || 236) : (State.data.ui?.keyboardWidth || 420)
    },
    applySize(width) {
        if (!this.el) return;
        const numeric = this.mode === 'numeric',
            min = numeric ? 220 : 320,
            max = Math.min(numeric ? 420 : 720, innerWidth - 16),
            w = Math.round(Math.max(min, Math.min(max, width))),
            unit = numeric ? Math.max(38, Math.min(56, (w - 30) / 4)) : Math.max(28, Math.min(56, (w - 36) / 10));
        this.el.style.width = w + 'px';
        this.el.style.setProperty('--kbd-key-h', Math.round(unit) + 'px');
        this.el.style.setProperty('--kbd-font', Math.round(Math.max(12, Math.min(18, unit * .38))) + 'px');
        requestAnimationFrame(() => {
            if (!this.el) return;
            document.documentElement.style.setProperty('--keyboard-height', this.el.getBoundingClientRect().height + 'px');
            this.position();
            this.ensureVisible()
        })
    },
    persistSize() {
        const key = this.mode === 'numeric' ? 'keyboardNumericWidth' : 'keyboardWidth',
            width = Math.round(this.el?.getBoundingClientRect().width || this.currentSize());
        State.data.ui = {
            ...State.data.ui,
            [key]: width
        };
        History.persist()
    },
    restore() {
        if (!this.target) return;
        const el = this.target,
            previous = this.modes.get(el);
        if (previous === null || previous === undefined) el.removeAttribute('inputmode');
        else el.setAttribute('inputmode', previous);
        this.modes.delete(el);
        if (this.dirty && el.isConnected) el.dispatchEvent(new Event('change', {
            bubbles: true
        }));
        this.dirty = false
    },
    show(el) {
        if (this.target !== el) {
            this.restore();
            this.target = el;
            this.modes.set(el, el.getAttribute('inputmode'));
            const inputMode = this.modes.get(el);
            this.mode = el.type === 'number' || ['numeric', 'decimal'].includes(inputMode) ? 'numeric' : 'letters';
            this.shift = false;
            this.accents = false;
            this.positioned = false
        }
        el.setAttribute('inputmode', 'none');
        const host = el.closest('dialog') || document.body;
        if (!this.el || !this.el.isConnected) {
            this.el = document.createElement('section');
            this.el.id = 'touchKeyboard';
            this.el.className = 'touch-keyboard';
            this.el.setAttribute('role', 'region');
            this.el.setAttribute('aria-label', 'Teclado de toque');
            host.append(this.el)
        } else if (this.el.parentElement !== host) host.append(this.el);
        this.render();
        this.position();
        el.focus({
            preventScroll: true
        });
        requestAnimationFrame(() => {
            if (this.target === el) {
                this.position();
                this.ensureVisible()
            }
        })
    },
    render() {
        if (!this.el || !this.target) return;
        const key = (label, value, extra = '') => `<button type="button" class="kbd-key ${extra}" data-kbd-key="${esc(value)}">${label}</button>`,
            row = letters => `<div class="kbd-row">${letters.map(char=>key(esc(this.shift?char.toLocaleUpperCase('pt-BR'):char),this.shift?char.toLocaleUpperCase('pt-BR'):char)).join('')}</div>`;
        const name = this.target.closest('label')?.childNodes[0]?.textContent?.trim().slice(0, 45) || this.target.getAttribute('aria-label') || 'Campo de texto';
        const enter = key(this.target.tagName === 'TEXTAREA' ? '↵' : 'OK', 'enter', 'kbd-enter');
        let keys = '';
        if (this.mode === 'numeric') {
            keys = `<div class="kbd-number-grid">${['1','2','3','backspace','4','5','6','-','7','8','9',',','hide','0','.','enter'].map(v=>key(v==='backspace'?'⌫':v==='hide'?'Fechar':v==='enter'?'OK':v,v,['backspace','hide','enter'].includes(v)?'kbd-function':'')).join('')}</div>`
        } else {
            let a, b, c;
            if (this.accents) {
                a = ['á', 'à', 'â', 'ã', 'é', 'ê', 'í', 'ó', 'ô', 'õ'];
                b = ['ú', 'ü', 'ç', '~', '^', '´', '`', '?', '!', ';'];
                c = ['z', 'x', 'c', 'v', 'b', 'n', 'm']
            } else if (this.mode === 'symbols') {
                a = [...'1234567890'];
                b = ['@', '#', '$', '%', '&', '*', '(', ')', '-', '+'];
                c = ['=', '/', '\\', ':', ';', '?', '!']
            } else {
                a = [...'qwertyuiop'];
                b = [...'asdfghjklç'];
                c = [...'zxcvbnm']
            }
            keys = row(a) + row(b) + `<div class="kbd-row">${key('⇧','shift',this.shift?'chosen':'kbd-function')}${c.map(char=>key(esc(this.shift?char.toLocaleUpperCase('pt-BR'):char),this.shift?char.toLocaleUpperCase('pt-BR'):char)).join('')}${key('⌫','backspace','kbd-function')}</div><div class="kbd-row">${key(this.mode==='symbols'?'ABC':'123','mode','kbd-function')}${key('áé','accents',this.accents?'chosen':'kbd-function')}${key(', ', ',')}${key('Espaço','space','kbd-space')}${key('.', '.')}${enter}</div>`
        }
        this.el.classList.toggle('numeric', this.mode === 'numeric');
        const corners = ['tl', 'tr', 'br', 'bl'].map(c => `<span class="kbd-resize-corner" data-kbd-resize data-corner="${c}" aria-hidden="true"></span>`).join('');
        this.el.innerHTML = corners + `<div class="kbd-top"><button type="button" class="kbd-handle" data-kbd-handle aria-label="Arrastar teclado">${icon('grip')}<span>Teclado de toque<small>${esc(name)} · dois cantos opostos redimensionam</small></span></button>${key(icon('close'),'hide','kbd-function')}</div><div class="kbd-keys">${keys}</div>`;
        this.applySize(this.currentSize());
        document.body.classList.add('keyboard-visible');
        const height = this.el.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--keyboard-height', height + 'px');
        const dialog = this.target.closest('dialog');
        $$('dialog.kbd-room').forEach(el => {
            if (el !== dialog) el.classList.remove('kbd-room')
        });
        document.body.classList.toggle('keyboard-modal', !!dialog);
        dialog?.classList.add('kbd-room')
    },
    position() {
        if (!this.el || !this.target) return;
        const r = this.el.getBoundingClientRect();
        let left = this.positioned ? r.left : innerWidth - r.width - 12,
            top = this.positioned ? r.top : innerHeight - r.height - 12;
        this.el.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, left)) + 'px';
        this.el.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, top)) + 'px'
    },
    ensureVisible() {
        if (!this.target?.isConnected) {
            this.hide();
            return
        }
        this.target.scrollIntoView({
            block: 'nearest',
            behavior: 'instant'
        });
        if (!this.target.closest('dialog')) {
            const r = this.target.getBoundingClientRect(),
                k = this.el.getBoundingClientRect();
            if (r.bottom > k.top - 12 && r.top < k.bottom && r.right > k.left && r.left < k.right) window.scrollBy({
                top: r.bottom - k.top + 16,
                behavior: 'instant'
            })
        }
    },
    write(text, backspace = false) {
        const el = this.target;
        if (!el?.isConnected) {
            this.hide();
            return
        }
        let start = el.selectionStart ?? el.value.length,
            end = el.selectionEnd ?? start;
        const old = el.value;
        if (backspace && start === end && start > 0) {
            const prefix = [...old.slice(0, start)];
            start -= prefix.at(-1).length
        }
        if (this.mode === 'numeric' && el.type === 'password' && text && !/^\d+$/.test(text)) return;
        const max = el.maxLength >= 0 ? el.maxLength : Infinity,
            room = Math.max(0, max - (old.length - (end - start)));
        text = text.slice(0, room);
        let value = old.slice(0, start) + text + old.slice(end);
        if (el.type === 'number') value = value.replace(',', '.');
        el.value = value;
        try {
            el.setSelectionRange(start + text.length, start + text.length)
        } catch (_) {}
        if (el.value !== old) {
            this.dirty = true;
            el.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                data: backspace ? null : text,
                inputType: backspace ? 'deleteContentBackward' : 'insertText'
            }))
        }
        el.focus({
            preventScroll: true
        })
    },
    key(value) {
        if (!this.target) return;
        if (value === 'hide') {
            this.hide();
            return
        }
        if (value === 'shift') {
            this.shift = !this.shift;
            this.render();
            return
        }
        if (value === 'mode') {
            this.mode = this.mode === 'symbols' ? 'letters' : 'symbols';
            this.accents = false;
            this.render();
            return
        }
        if (value === 'accents') {
            this.mode = 'letters';
            this.accents = !this.accents;
            this.render();
            return
        }
        if (value === 'backspace') {
            this.write('', true);
            return
        }
        if (value === 'enter') {
            if (this.target.tagName === 'TEXTAREA') this.write('\n');
            else {
                const root = this.target.form || document,
                    inputs = [...root.querySelectorAll('input,textarea')].filter(el => this.editable(el) && el.getClientRects().length),
                    i = inputs.indexOf(this.target);
                if (inputs[i + 1]) this.show(inputs[i + 1]);
                else this.hide()
            }
            return
        }
        this.write(value === 'space' ? ' ' : value);
        if (this.shift || this.accents) {
            this.shift = false;
            this.accents = false;
            this.render()
        }
    },
    hide() {
        this.restore();
        this.target = null;
        this.el?.remove();
        this.el = null;
        this.pointers.clear();
        this.resizePointers.clear();
        this.resizeGesture = null;
        this.resizeDirty = false;
        this.positioned = false;
        document.body.classList.remove('keyboard-visible', 'keyboard-modal');
        $$('dialog.kbd-room').forEach(el => el.classList.remove('kbd-room'))
    }
};

/* Facilitator review: controlled form values, debounced autosave and explicit confirmation. */
