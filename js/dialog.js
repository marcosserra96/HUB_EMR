'use strict';
/* Hub EMR · Janela modal e helpers de formulário. */
const Dialog = {
    open(title, body, footer = '', save = null) {
        TouchKeyboard.hide();
        if (State.modalCleanup) State.modalCleanup();
        State.modalCleanup = null;
        const m = $('#modal');
        if (m.open) m.close();
        m.innerHTML = `<form id="modalForm"><header class="modal-head"><h2 id="modalTitle">${title}</h2>${button('modal-close',icon('close'),'icon-button','aria-label="Fechar janela" title="Fechar"')}</header><div class="modal-body">${body}<div class="modal-error" id="modalError" role="alert"></div></div>${footer?`<footer class="modal-foot">${footer}</footer>`:''}</form>`;
        State.modalSave = save;
        m.showModal();
        requestAnimationFrame(() => m.querySelector('input:not([type=checkbox]),textarea,select,button')?.focus())
    },
    close() {
        TouchKeyboard.hide();
        if (State.modalCleanup) State.modalCleanup();
        State.modalCleanup = null;
        $('#modal').close();
        State.modalSave = null
    },
    error(s) {
        $('#modalError').textContent = s
    },
    confirm(title, text, fn, label = 'Confirmar', danger = false) {
        this.open(title, `<p class="confirm-text">${esc(text)}</p>`, button('modal-close', 'Cancelar', 'secondary') + `<button class="${danger?'danger':'primary'}" type="submit">${label}</button>`, () => {
            fn();
            this.close()
        })
    }
};
const field = (name, label, value = '', type = 'text', required = false, attrs = '') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${attrs}></label>`;
const areaField = (value = '') => field('area', 'Área', value, 'text', true, 'maxlength="100" list="areas"') + `<datalist id="areas">${['ASGP','DCMD','DEOP','DESC',...new Set(State.people().map(x=>x.area))].map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist>`;
const textarea = (name, label, value = '', required = false) => `<label>${label}<textarea name="${name}" ${required?'required':''} maxlength="20000">${esc(value)}</textarea></label>`;
const options = (arr, value) => arr.map(x => {
    const [id, title] = Array.isArray(x) ? x : [x, x];
    return `<option value="${esc(id)}" ${id===value?'selected':''}>${esc(title)}</option>`
}).join('');
const selectField = (name, label, arr, value) => `<label>${label}<select name="${name}">${options(arr,value)}</select></label>`;
const formValues = () => Object.fromEntries(new FormData($('#modalForm')));
const saveFooter = (text = 'Salvar') => button('modal-close', 'Cancelar', 'secondary') + `<button class="primary" type="submit">${icon('check')}${text}</button>`;
