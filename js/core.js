'use strict';
/* Hub EMR · Utilitários, ícones, helpers de marcação e constantes do método.
   Arquitetura: scripts clássicos carregados em ordem (ver index.html) que compartilham o escopo global.
   Todo texto do usuário passa por esc(). Persistência: uma transação IndexedDB por mutação.
   Prévias de toque nunca alteram o domínio; gestos usam rastros por ponteiro e travas por item. */
const Utils = (() => {
    const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    } [c]));
    const now = () => new Date().toISOString();
    const date = () => {
        const d = new Date();
        return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
    };
    const clone = o => JSON.parse(JSON.stringify(o));
    const fmt = v => v ? new Date(v.length === 10 ? v + 'T12:00:00' : v).toLocaleDateString('pt-BR') : '—';
    const number = n => Number(n.toFixed(1)).toLocaleString('pt-BR');
    const initials = s => s.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
    return {
        uid,
        esc,
        now,
        date,
        clone,
        fmt,
        number,
        initials
    }
})();
const $ = s => document.querySelector(s),
    $$ = s => [...document.querySelectorAll(s)];
const {
    uid,
    esc,
    now,
    clone,
    fmt
} = Utils;
const Icons = {
    grip: '<path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" stroke-width="4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m7-13-3 4 3 4"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="m9 5 7 7-7 7M3 12h13"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    undo: '<path d="M3 10h11a7 7 0 0 1 0 14M3 10l6-6M3 10l6 6" transform="translate(0 -2)"/>',
    folder: '<path d="M3 6h7l2 3h9v12H3Z"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M3 16v5h18v-5"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    flow: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><path d="M6.5 10v7.5H14m-4-4 4 4-4 4"/>',
    board: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18m6-18v18M5 7h2m4 4h2m4-4h2"/>',
    print: '<path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6Z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    flag: '<path d="M4 22V3m0 1c5-4 10 4 16 0v10c-6 4-11-4-16 0"/>',
    list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
    zoom: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>'
};
const icon = n => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${Icons[n]||Icons.list}</svg>`;
const button = (action, text, kind = '', attrs = '') => `<button class="${kind}" data-action="${action}" ${attrs}>${text}</button>`;
const empty = (title, text, action = '', label = '', sym = 'list') => `<div class="empty"><div class="emptyicon">${icon(sym)}</div><h3>${title}</h3><p>${text}</p>${action?button(action,icon('plus')+label,'primary'):''}</div>`;
const Steps = [
    ['Participantes', 'Quem está no encontro'],
    ['Mapeamento', 'Registrar os problemas'],
    ['Classificação', 'Avaliar com seis critérios'],
    ['Ranking', 'Escolher a demanda'],
    ['Trabalho da demanda', 'Fluxos e atividades'],
    ['Revisão do facilitador', 'Consolidar as informações'],
    ['Relatório', 'Imprimir e compartilhar'],
    ['Backlog de demandas', 'Retomar novos ciclos']
];
const Criteria = [
    ['Impacto', 25, 'Resolver isso gera ganho relevante para a empresa?'],
    ['Desperdício', 20, 'Quanto trabalho manual, retrabalho ou risco existe hoje?'],
    ['Frequência', 15, 'Com que frequência o problema acontece?'],
    ['Abrangência', 15, 'Quantas pessoas, áreas ou clientes são impactados?'],
    ['Viabilidade', 15, 'Temos autonomia, dados e conhecimento para atacar?'],
    ['Mensuração', 10, 'Conseguimos demonstrar ganho antes × depois?']
];
const Scale = ['Inexistente ou não aplicável', 'Muito baixo', 'Baixo', 'Moderado', 'Alto', 'Muito alto'];
const Columns = [
    ['backlog', 'Backlog'],
    ['todo', 'A fazer'],
    ['doing', 'Em desenvolvimento'],
    ['validation', 'Em validação'],
    ['done', 'Concluído']
];
const Statuses = ['Mapeada', 'Classificada', 'Selecionada', 'Em desenvolvimento', 'Concluída', 'Arquivada'];
const ReviewFields = [
    ['process', 'Nome do processo'],
    ['area', 'Área responsável'],
    ['owner', 'Dono do processo'],
    ['problem', 'Problema central'],
    ['current', 'Cenário atual'],
    ['change', 'Mudança proposta'],
    ['benefit', 'Benefício esperado'],
    ['indicator', 'Indicador'],
    ['baseline', 'Linha de base'],
    ['target', 'Meta'],
    ['result', 'Resultado alcançado'],
    ['next', 'Próximos passos'],
    ['executive', 'Observações executivas']
];
const ReportSections = ['Identificação da reunião', 'Participantes', 'Demandas levantadas', 'Critérios e pesos', 'Ranking completo', 'Demanda selecionada', 'Detalhamento da pontuação', 'Fluxo AS IS', 'Fluxo TO BE', 'Atividades e responsáveis', 'Situação das tarefas', 'Indicadores e benefícios', 'Próximos passos', 'Observações executivas'];
