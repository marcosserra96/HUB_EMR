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
/* Versão exibida na interface e no relatório. Ao publicar, atualize também CACHE em sw.js. */
const APP_VERSION = '6.1.1';
const Icons = {
    grip: '<path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" stroke-width="4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m7-13-3 4 3 4"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    folder: '<path d="M3 6h7l2 3h9v12H3Z"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>',
    restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M3 16v5h18v-5"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    flow: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><path d="M6.5 10v7.5H14m-4-4 4 4-4 4"/>',
    board: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18m6-18v18"/>',
    print: '<path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6Z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    flag: '<path d="M4 22V3m0 1c5-4 10 4 16 0v10c-6 4-11-4-16 0"/>',
    list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
    zoom: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    alert: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6m0 3h.01"/>',
    trophy: '<path d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    offline: '<path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.6 5M5 12.6a10 10 0 0 1 3.1-1.8M19 12.6a10 10 0 0 0-2.4-1.5M8.5 16.4a5 5 0 0 1 5.3-.9M12 20h.01M3 3l18 18"/>'
};
const icon = n => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${Icons[n]||Icons.list}</svg>`;
const button = (action, text, kind = '', attrs = '') => `<button type="button" class="${kind}" data-action="${action}" ${attrs}>${text}</button>`;
/** "1 demanda" / "3 demandas". Nunca escreva "demanda(s)". */
const plural = (n, singular, pluralForm = singular + 's') => `${Number(n).toLocaleString('pt-BR')} ${n === 1 ? singular : pluralForm}`;
/** Estado vazio: ícone, título, texto e (opcional) a ação principal. */
const empty = (title, text, action = '', label = '', sym = 'list') => {
    /* Ações de navegação (…-go) levam seta; ações de criar, sinal de mais. */
    const go = /-go$/.test(action);
    return `<div class="empty"><div class="empty-icon">${icon(sym)}</div><h2>${title}</h2><p>${text}</p>${action?button(action,go?label+icon('arrow'):icon('plus')+label,go?'secondary':'primary'):''}</div>`
};
/** Selo. tone: '' | 'success' | 'warning' | 'danger' | 'accent' | 'info' | 'outline' */
const badge = (text, tone = '', attrs = '') => `<span class="badge${tone?' '+tone:''}" ${attrs}>${text}</span>`;
/** Menu "⋯" com as ações de um item. items: [{action, label, icon, attrs, danger}] — use null para separador. */
const actionMenu = (label, items) => {
    const list = items.filter(x => x !== undefined && x !== false);
    return `<details class="menu"><summary class="icon-button" aria-label="${esc(label)}" title="${esc(label)}">${icon('more')}</summary><div class="menu-list" role="menu">${list.map(x=>x===null?'<hr>':`<button type="button" role="menuitem" class="${x.danger?'danger':''}" data-action="${x.action}" ${x.attrs||''}>${icon(x.icon||'list')}<span>${x.label}</span></button>`).join('')}</div></details>`
};
/** Faixa de números do topo de uma tela: [[valor, rótulo, detalhe?]] */
const numbers = (items, label = 'Resumo') => `<section class="numbers" aria-label="${esc(label)}">${items.map(([value,title,detail])=>`<div class="numbers-cell"><b>${value}</b><span>${title}</span>${detail?`<small>${detail}</small>`:''}</div>`).join('')}</section>`;
/** Aviso em linha. tone: info | warning | danger | success */
const notice = (html, tone = 'info', action = '') => `<div class="notice ${tone}" role="${tone==='danger'?'alert':'note'}">${icon(tone==='warning'||tone==='danger'?'alert':tone==='success'?'check':'info')}<div class="notice-text">${html}</div>${action}</div>`;
/** Cor de status de participante. */
const presenceTone = status => ({ Presente: 'success', Prevista: 'info', Ausente: 'warning', Inativa: '' })[status] || '';
/** Cor de status de demanda. */
const statusTone = status => ({ Mapeada: '', Classificada: 'info', Selecionada: 'accent', 'Em desenvolvimento': 'warning', 'Concluída': 'success', Arquivada: 'outline' })[status] || '';
const TaskTypes = { process: 'Processo', data: 'Dados', development: 'Desenvolvimento', test: 'Teste' };
const NodeTypes = { step: 'Etapa', start: 'Início / fim', decision: 'Decisão', note: 'Observação' };
const PortNames = { left: 'Esquerda', right: 'Direita', top: 'Topo', bottom: 'Base' };
/* Equipes (modo com mais de uma demanda em trabalho). Cores em css/tokens.css (--team-*). */
const TeamColors = { blue: 'azul', orange: 'laranja', purple: 'roxa', pink: 'rosa' };
const TEAM_LIMIT = 4;
const teamDot = color => `<span class="team-dot" data-team="${color}" aria-hidden="true"></span>`;
/* Etapas do método: [nome no menu e no título, descrição curta da página]. */
const Steps = [
    ['Participantes', 'Registre quem participa da construção da melhoria neste encontro.'],
    ['Mapeamento', 'Registre os problemas do grupo. A avaliação acontece na próxima etapa.'],
    ['Classificação', 'Avalie cada demanda nos seis critérios, de 0 a 5.'],
    ['Ranking', 'Compare as notas e confirme a demanda que o grupo vai trabalhar.'],
    ['Trabalho da demanda', 'Desenhe o processo e distribua as atividades.'],
    ['Revisão', 'Consolide as informações que vão para o relatório.'],
    ['Relatório', 'Visão executiva do encontro, pronta para imprimir ou salvar em PDF.'],
    ['Backlog', 'Todas as demandas, com origem, avaliação e histórico. Retome novos ciclos daqui.']
];
/* Agrupamento das etapas no menu lateral: [rótulo, índice da primeira etapa do grupo]. */
const StepGroups = [['Preparação', 0], ['Priorização', 2], ['Execução', 4], ['Resultados', 5], ['Continuidade', 7]];
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
