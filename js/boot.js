'use strict';
/* Hub EMR · Inicialização: ícones da moldura, conexão, PWA e abertura da base local. */
function connection() {
    const offline = !navigator.onLine,
        el = $('#netStatus');
    el.hidden = !offline;
    el.title = offline ? 'Sem internet. O Hub continua funcionando e salvando neste navegador.' : ''
}

async function boot() {
    $$('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
    $$('[data-app-version]').forEach(el => el.textContent = APP_VERSION);
    $('#densityOptions').innerHTML = Layout.densities.map(([id, pct, label]) => `<button type="button" data-action="ui-density" data-density="${id}" aria-pressed="false" title="${label}">${pct}</button>`).join('');
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    connection();
    Menus.init();
    try {
        const stored = await Storage.open();
        State.data = stored ? Transfer.validate(stored) : seed();
        if (!stored) await Storage.save(State.data);
        Render.header();
        Render.page();
        Feedback.save('Salvo neste navegador');
        TouchKeyboard.init();
        Pointers.init();
        navigator.storage?.persist?.().catch(() => {})
    } catch (e) {
        console.error(e);
        Feedback.save('Armazenamento indisponível', true);
        $('#content').innerHTML = `<div class="fatal card"><h1>Não foi possível abrir a base local</h1><p class="fatal-error">${esc(e.message)}</p><p>Use um navegador atualizado (Edge, Chrome ou Firefox) com armazenamento local permitido e recarregue a página. Os dados existentes não foram sobrescritos.</p><p>Se o problema veio de um backup, recupere o acesso ao armazenamento e importe novamente um arquivo JSON válido do Hub.</p></div>`
    }
    /* PWA: funciona offline depois do primeiro acesso por HTTPS. */
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js', {
        scope: './'
    }).catch(e => console.warn('PWA indisponível:', e))
}
boot();
