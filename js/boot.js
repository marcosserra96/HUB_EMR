'use strict';
/* Hub EMR · Inicialização. */
async function boot() {
    for (const [id, name] of [
            ['menuToggle', 'panel'],
            ['densityIcon', 'zoom'],
            ['peopleIcon', 'people'],
            ['undoBtn', 'undo'],
            ['sessionsIcon', 'folder'],
            ['dataBtn', 'download'],
            ['fullscreenBtn', 'expand']
        ]) $('#' + id).innerHTML = icon(name);
    try {
        const stored = await Storage.open();
        State.data = stored ? Transfer.validate(stored) : seed();
        if (!stored) await Storage.save(State.data);
        Render.header();
        Render.page();
        Feedback.save('Salvo · neste navegador');
        TouchKeyboard.init();
        Pointers.init();
        navigator.storage?.persist?.().catch(() => {})
    } catch (e) {
        console.error(e);
        Feedback.save('Armazenamento indisponível', true);
        $('#content').innerHTML = `<div class="fatal"><h1>Não foi possível abrir a base local</h1><p style="margin:20px 0">${esc(e.message)}</p><p>Abra o arquivo em um navegador com IndexedDB habilitado, permita o armazenamento local e recarregue. Os dados existentes não foram sobrescritos.</p><p style="margin-top:20px">Se o problema for um backup, importe um JSON v3 validado após recuperar o acesso ao armazenamento.</p></div>`
    }
}
boot();
