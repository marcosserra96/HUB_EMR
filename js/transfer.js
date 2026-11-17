'use strict';
/* Hub EMR · Importação, validação e exportação de backup JSON. */
const Transfer = {
    validate(raw) {
        const fail = s => {
                throw new Error(s)
            },
            arr = (x, path, max = 50000) => {
                if (!Array.isArray(x) || x.length > max) fail(path + ': lista inválida ou muito grande.')
            },
            str = (x, path, max = 20000) => {
                if (typeof x !== 'string' || x.length > max) fail(path + ': texto inválido.')
            },
            id = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x),
            obj = x => x && typeof x === 'object' && !Array.isArray(x),
            stamp = x => typeof x === 'string' && x.length < 40 && !Number.isNaN(Date.parse(x)),
            review = (r, path) => {
                if (!obj(r) || !obj(r.fields)) fail(path + ': revisão inválida.');
                for (const [k] of ReviewFields) str(r.fields[k], path + '.' + k);
                arr(r.include, path + '.include', 14);
                if (r.include.length !== 14 || r.include.some(v => typeof v !== 'boolean')) fail(path + ': seções inválidas.')
            };
        if (!obj(raw) || raw.format !== 'emr-touch-board' || raw.version !== 3) fail('Formato incompatível. Use um backup JSON exportado pelo Hub EMR.');
        const checkDomain = (d, path = 'dados') => {
            for (const key of ['sessions', 'participants', 'demands', 'cycles']) {
                arr(d[key], path + '.' + key);
                const ids = d[key].map(x => x?.id);
                if (ids.some(x => !id(x)) || new Set(ids).size !== ids.length) fail(path + '.' + key + ': identificadores inválidos ou repetidos.')
            }
            if (!d.sessions.length) fail('O arquivo precisa conter uma sessão.');
            const ss = new Map(d.sessions.map(x => [x.id, x])),
                pp = new Map(d.participants.map(x => [x.id, x])),
                dd = new Map(d.demands.map(x => [x.id, x])),
                cc = new Map(d.cycles.map(x => [x.id, x]));
            if (!ss.has(d.activeSessionId)) fail('Sessão ativa não encontrada.');
            for (const s of d.sessions) {
                str(s.title, 'Título da sessão', 250);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !stamp(s.date)) fail('Data da sessão inválida.');
                if (!stamp(s.createdAt)) fail('Data de criação da sessão inválida.');
                for (const [k, map] of [
                        ['participantIds', pp],
                        ['demandIds', dd]
                    ]) {
                    arr(s[k], k);
                    if (new Set(s[k]).size !== s[k].length || s[k].some(x => !map.has(x))) fail('Referência inválida em ' + k)
                }
                if (s.selectedCycleId !== null && (!cc.has(s.selectedCycleId) || cc.get(s.selectedCycleId).sessionId !== s.id)) fail('Ciclo ativo inválido.');
                if (s.teams !== undefined) {
                    /* Equipes (opcional, 6.1+): 2 a 4, cada uma ligada a um ciclo desta sessão; pessoa em no máximo uma equipe. */
                    arr(s.teams, 'Equipes', TEAM_LIMIT);
                    const seenCycles = new Set(),
                        seenPeople = new Set(),
                        seenColors = new Set();
                    for (const t of s.teams) {
                        if (!obj(t) || !cc.has(t.cycleId) || cc.get(t.cycleId).sessionId !== s.id || seenCycles.has(t.cycleId)) fail('Equipe com ciclo inválido.');
                        str(t.name, 'Nome da equipe', 60);
                        if (!t.name.trim() || !Object.hasOwn(TeamColors, t.color) || seenColors.has(t.color)) fail('Equipe com nome ou cor inválida.');
                        arr(t.memberIds, 'Integrantes da equipe');
                        if (t.memberIds.some(x => !pp.has(x) || seenPeople.has(x))) fail('Integrante de equipe inválido ou repetido.');
                        seenCycles.add(t.cycleId);
                        seenColors.add(t.color);
                        t.memberIds.forEach(x => seenPeople.add(x))
                    }
                }
                if (s.pinHash !== null && (typeof s.pinHash !== 'string' || !/^pin-v1:\d{1,10}$/.test(s.pinHash))) fail('PIN inválido.');
                review(s.review, 'Revisão da sessão')
            }
            for (const p of d.participants) {
                str(p.name, 'Nome', 150);
                str(p.area, 'Área', 100);
                if (!p.name.trim() || !p.area.trim() || !['Prevista', 'Presente', 'Ausente', 'Inativa'].includes(p.status)) fail('Participante inválido.');
                if (!stamp(p.createdAt) || !stamp(p.updatedAt)) fail('Data de participante inválida.')
            }
            for (const p of d.demands) {
                str(p.title, 'Título da demanda', 250);
                str(p.area, 'Área', 100);
                str(p.description, 'Descrição');
                if (!p.title.trim() || !p.area.trim() || !ss.has(p.originSessionId) || !Statuses.includes(p.status)) fail('Demanda inválida.');
                arr(p.ratings, 'Notas', 6);
                if (p.ratings.length !== 6 || p.ratings.some(n => n !== null && (!Number.isInteger(n) || n < 0 || n > 5))) fail('As seis notas devem ser null ou inteiros de 0 a 5.');
                if (p.tieOrder !== null && (!Number.isFinite(p.tieOrder) || p.tieOrder < 0)) fail('Desempate inválido.');
                if (!stamp(p.createdAt) || !stamp(p.updatedAt)) fail('Data da demanda inválida.');
                arr(p.history, 'Histórico');
                p.history.forEach(h => {
                    if (!obj(h) || !stamp(h.at)) fail('Histórico da demanda inválido.');
                    str(h.label, 'Texto do histórico', 2000);
                    if (h.changes !== undefined) {
                        if (!obj(h.changes)) fail('Detalhe do histórico inválido.');
                        for (const [key, v] of Object.entries(h.changes)) {
                            if (!['area', 'title', 'description', 'ratings', 'status', 'tieOrder'].includes(key) || !obj(v) || !('before' in v) || !('after' in v)) fail('Alteração histórica inválida.');
                            for (const value of [v.before, v.after]) {
                                if (value === null) continue;
                                if (key === 'ratings') {
                                    if (!Array.isArray(value) || value.length !== 6 || value.some(n => n !== null && (!Number.isInteger(n) || n < 0 || n > 5))) fail('Notas históricas inválidas.')
                                } else if (key === 'tieOrder') {
                                    if (!Number.isFinite(value) || value < 0) fail('Desempate histórico inválido.')
                                } else str(value, 'Texto histórico')
                            }
                        }
                    }
                });
                arr(p.selections, 'Seleções');
                p.selections.forEach(x => {
                    if (!obj(x) || !stamp(x.at) || !ss.has(x.sessionId) || !cc.has(x.cycleId)) fail('Registro de escolha inválido.')
                })
            }
            for (const c of d.cycles) {
                if (!ss.has(c.sessionId) || !dd.has(c.demandId) || !stamp(c.selectedAt) || !obj(c.flows)) fail('Ciclo inválido.');
                review(c.review, 'Revisão do ciclo');
                if (c.evaluation !== undefined) {
                    if (!obj(c.evaluation) || !Array.isArray(c.evaluation.ratings) || c.evaluation.ratings.length !== 6 || c.evaluation.ratings.some(n => !Number.isInteger(n) || n < 0 || n > 5) || !Number.isFinite(c.evaluation.score) || Math.abs(c.evaluation.score - Classification.score({
                            ratings: c.evaluation.ratings
                        })) > .001) fail('Avaliação original do ciclo inválida.')
                }
                for (const kind of ['asis', 'tobe']) {
                    const f = c.flows[kind];
                    if (!obj(f)) fail('Fluxo ausente.');
                    arr(f.nodes, 'Elementos', 5000);
                    arr(f.edges, 'Conexões', 10000);
                    const ids = f.nodes.map(n => n.id);
                    if (ids.some(x => !id(x)) || new Set(ids).size !== ids.length) fail('Identificadores de elementos inválidos.');
                    for (const n of f.nodes) {
                        str(n.title, 'Texto do elemento', 500);
                        if (!['step', 'start', 'decision', 'note'].includes(n.type) || !Number.isFinite(n.x) || !Number.isFinite(n.y) || n.x < 0 || n.x > 4776 || n.y < 0 || n.y > 2872) fail('Elemento do fluxo inválido.')
                    }
                    const edgeIds = f.edges.map(e => e.id);
                    if (edgeIds.some(x => !id(x)) || new Set(edgeIds).size !== edgeIds.length) fail('Identificadores de conexões inválidos.');
                    for (const e of f.edges) {
                        if (!ids.includes(e.from) || !ids.includes(e.to) || e.from === e.to || !['left', 'right', 'top', 'bottom'].includes(e.fromPort) || !['left', 'right', 'top', 'bottom'].includes(e.toPort)) fail('Referência de conexão inválida.');
                        str(e.label, 'Rótulo da conexão', 150)
                    }
                    if (!obj(f.view) || ![f.view.x, f.view.y, f.view.z].every(Number.isFinite) || Math.abs(f.view.x) > 100000 || Math.abs(f.view.y) > 100000 || f.view.z < .2 || f.view.z > 2.5) fail('Zoom ou deslocamento inválido.')
                }
                arr(c.tasks, 'Atividades', 20000);
                const tids = c.tasks.map(t => t.id);
                if (tids.some(x => !id(x)) || new Set(tids).size !== tids.length) fail('Identificadores de atividades inválidos.');
                for (const t of c.tasks) {
                    str(t.title, 'Título de atividade', 250);
                    for (const k of ['description', 'acceptance', 'blockReason', 'notes']) str(t[k], k);
                    if (!t.title.trim() || !['process', 'data', 'development', 'test'].includes(t.type) || !Columns.some(x => x[0] === t.column) || typeof t.blocked !== 'boolean' || typeof t.cancelled !== 'boolean' || t.blocked && !t.blockReason.trim() || !stamp(t.createdAt) || !stamp(t.updatedAt)) fail('Atividade inválida.');
                    arr(t.assignees, 'Responsáveis');
                    if (t.assignees.some(x => !pp.has(x)) || new Set(t.assignees).size !== t.assignees.length) fail('Responsável inexistente ou repetido.');
                    if (t.sourceNode !== null && (!obj(t.sourceNode) || !['asis', 'tobe'].includes(t.sourceNode.flow) || !id(t.sourceNode.id))) fail('Origem da atividade inválida.')
                }
            }
        };
        const scan = (v, depth = 0) => {
            if (depth > 40) fail('JSON excessivamente aninhado.');
            if (v && typeof v === 'object')
                for (const [k, value] of Object.entries(v)) {
                    if (['__proto__', 'constructor', 'prototype'].includes(k)) fail('Chave não permitida no JSON.');
                    scan(value, depth + 1)
                }
        };
        scan(raw);
        if (raw.ui !== undefined && (!obj(raw.ui) || typeof raw.ui.sidebarCollapsed !== 'boolean' || raw.ui.density !== undefined && !['comfortable', 'compact', 'dense', 'mini', 'micro'].includes(raw.ui.density) || raw.ui.keyboardWidth !== undefined && (!Number.isFinite(raw.ui.keyboardWidth) || raw.ui.keyboardWidth < 320 || raw.ui.keyboardWidth > 720) || raw.ui.keyboardNumericWidth !== undefined && (!Number.isFinite(raw.ui.keyboardNumericWidth) || raw.ui.keyboardNumericWidth < 220 || raw.ui.keyboardNumericWidth > 420) || raw.ui.lastBackupAt !== undefined && (typeof raw.ui.lastBackupAt !== 'string' || Number.isNaN(Date.parse(raw.ui.lastBackupAt))))) fail('Preferência de interface inválida.');
        checkDomain(raw);
        arr(raw.undo, 'Desfazer', 30);
        raw.undo.forEach(x => {
            str(x.label, 'Ação', 2000);
            if (!stamp(x.at) || !obj(x.snapshot)) fail('Histórico de desfazer inválido.');
            checkDomain(x.snapshot, 'Histórico')
        });
        arr(raw.audit, 'Auditoria', 500000);
        for (const a of raw.audit) {
            if (!obj(a) || !stamp(a.at)) fail('Auditoria inválida.');
            str(a.label, 'Registro de auditoria', 2000)
        }
        return clone(raw)
    },
    export (scope = 'all') {
        Facilitator.flush();
        let data = clone(State.data);
        if (scope === 'session') {
            const s = State.session(),
                demandIds = new Set(s.demandIds),
                cycles = data.cycles.filter(c => demandIds.has(c.demandId)),
                sessionIds = new Set([s.id, ...data.demands.filter(d => demandIds.has(d.id)).map(d => d.originSessionId), ...cycles.map(c => c.sessionId)]),
                cycleIds = new Set(cycles.map(c => c.id));
            data.sessions = data.sessions.filter(x => sessionIds.has(x.id)).map(x => ({
                ...x,
                demandIds: x.demandIds.filter(id => demandIds.has(id)),
                selectedCycleId: cycleIds.has(x.selectedCycleId) ? x.selectedCycleId : null,
                ...(Array.isArray(x.teams) ? { teams: x.teams.filter(t => cycleIds.has(t.cycleId)) } : {})
            }));
            data.sessions.forEach(x => { if (x.teams && x.teams.length < 2) delete x.teams });
            const personIds = new Set([...data.sessions.flatMap(x => x.participantIds), ...cycles.flatMap(c => c.tasks.flatMap(t => t.assignees))]);
            data.participants = data.participants.filter(p => personIds.has(p.id));
            data.demands = data.demands.filter(d => demandIds.has(d.id));
            data.cycles = cycles;
            data.audit = data.audit.filter(a => sessionIds.has(a.sessionId) || demandIds.has(a.demandId));
            data.undo = []
        }
        data.exportedAt = now();
        data.exportScope = scope;
        this.validate(data);
        const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            }),
            a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'HubEMR_' + (scope === 'all' ? 'backup_completo' : 'sessao') + '_' + Utils.date() + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        if (scope === 'all') {
            /* Lembrete de backup: guardado só como preferência deste navegador. */
            State.data.ui = { ...State.data.ui, lastBackupAt: now() };
            History.persist();
            Render.backupStatus()
        }
        Feedback.toast(scope === 'all' ? 'Backup completo exportado.' : 'Sessão exportada com sua origem e ciclos vinculados.')
    },
    async read(file) {
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
            Feedback.toast('Arquivo maior que 50 MB. Importação recusada.');
            return
        }
        try {
            const raw = this.validate(JSON.parse(await file.text()));
            Dialog.open('Backup validado', `${notice(`O arquivo contém ${plural(raw.sessions.length,'sessão','sessões')}, ${plural(raw.demands.length,'demanda')}, ${plural(raw.participants.length,'participante')} e ${plural(raw.cycles.length,'ciclo')}.`,'success')}<p><b>Adicionar</b> mantém os dados atuais e inclui as sessões do arquivo como cópias.</p><p><b>Substituir</b> troca toda a base deste navegador pelo arquivo. É possível desfazer logo em seguida.</p>`, button('import-replace', 'Substituir base', 'danger-ghost') + button('modal-close', 'Cancelar', 'secondary') + button('import-merge', 'Adicionar sessões', 'primary'));
            this.prepared = raw
        } catch (e) {
            Feedback.toast('Importação recusada: ' + e.message)
        }
    },
    merge() {
        const raw = clone(this.prepared),
            map = new Map(),
            remap = id => map.get(id) || id;
        for (const kind of ['sessions', 'participants', 'demands', 'cycles']) raw[kind].forEach(x => map.set(x.id, uid()));
        for (const s of raw.sessions) {
            s.id = remap(s.id);
            s.participantIds = s.participantIds.map(remap);
            s.demandIds = s.demandIds.map(remap);
            s.selectedCycleId = remap(s.selectedCycleId);
            (s.teams || []).forEach(t => {
                t.cycleId = remap(t.cycleId);
                t.memberIds = t.memberIds.map(remap)
            })
        }
        for (const p of raw.participants) p.id = remap(p.id);
        for (const d of raw.demands) {
            d.id = remap(d.id);
            d.originSessionId = remap(d.originSessionId);
            d.selections.forEach(x => {
                x.sessionId = remap(x.sessionId);
                x.cycleId = remap(x.cycleId)
            })
        }
        for (const c of raw.cycles) {
            c.id = remap(c.id);
            c.demandId = remap(c.demandId);
            c.sessionId = remap(c.sessionId);
            c.tasks.forEach(t => {
                t.id = uid();
                t.assignees = t.assignees.map(remap)
            });
            for (const kind of ['asis', 'tobe']) {
                const nmap = new Map(c.flows[kind].nodes.map(n => [n.id, uid()]));
                c.flows[kind].nodes.forEach(n => n.id = nmap.get(n.id));
                c.flows[kind].edges.forEach(e => {
                    e.id = uid();
                    e.from = nmap.get(e.from);
                    e.to = nmap.get(e.to)
                });
                c.tasks.filter(t => t.sourceNode?.flow === kind).forEach(t => t.sourceNode.id = nmap.get(t.sourceNode.id) || uid())
            }
        }
        History.commit('Sessões importadas e adicionadas', () => {
            for (const kind of ['sessions', 'participants', 'demands', 'cycles']) State.data[kind].push(...raw[kind]);
            State.data.audit.push(...raw.audit.map(a => ({
                ...a,
                id: uid(),
                sessionId: remap(a.sessionId),
                participantId: remap(a.participantId),
                demandId: remap(a.demandId)
            })));
            State.data.activeSessionId = remap(raw.activeSessionId)
        });
        this.finish()
    },
    replace() {
        const raw = clone(this.prepared);
        Dialog.confirm('Substituir toda a base local?', 'As sessões atuais serão substituídas pelo backup validado. Esta ação ficará no histórico de desfazer. Exporte um backup antes caso queira manter uma cópia externa.', () => {
            History.commit('Base substituída por importação', () => {
                for (const key of ['sessions', 'participants', 'demands', 'cycles', 'activeSessionId']) State.data[key] = raw[key];
                State.data.audit.push(...raw.audit)
            });
            this.finish()
        }, 'Substituir base', true)
    },
    finish() {
        Dialog.close();
        this.prepared = null;
        State.step = 0;
        State.reviewUnlocked = false;
        State.selectedDemand = null;
        Render.header();
        Render.page();
        Feedback.toast('Importação concluída.', true)
    }
};
/* Sessions and global commands. Delegated events keep generated markup free of onclick. */
