'use strict';
/* Hub EMR · Revisão do facilitador (PIN) e relatório executivo. */
const Facilitator = {
    pending: new Map(),
    timer: null,
    hash(pin) {
        let h = 2166136261;
        for (const c of 'emr-touch-v3:' + pin) {
            h ^= c.charCodeAt(0);
            h = Math.imul(h, 16777619)
        }
        return 'pin-v1:' + String(h >>> 0)
    },
    gate() {
        const s = State.session();
        if (!s.pinHash) {
            State.reviewUnlocked = true;
            Navigation.go(5);
            return
        }
        Dialog.open('Revisão do facilitador', field('pin', 'PIN de quatro dígitos', '', 'password', true, 'inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off"') + '<small>Este PIN evita acesso acidental. Não é autenticação corporativa.</small>', saveFooter('Acessar revisão'), () => {
            if (this.hash(formValues().pin) !== s.pinHash) return Dialog.error('PIN incorreto.');
            State.reviewUnlocked = true;
            Dialog.close();
            Navigation.go(5)
        })
    },
    bind() {
        $$('[data-review-field]').forEach(el => el.addEventListener('input', () => {
            this.pending.set(el.dataset.reviewField, el.value);
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.flush(), 350)
        }));
        $$('[data-review-field]').forEach(el => el.addEventListener('change', () => this.flush()));
        $$('[data-report-section]').forEach(el => el.addEventListener('change', () => {
            const i = Number(el.dataset.reportSection);
            History.commit('Visibilidade do relatório alterada', () => State.review().include[i] = el.checked, State.demand()?.id)
        }))
    },
    flush() {
        clearTimeout(this.timer);
        if (!this.pending.size) return;
        const vals = Object.fromEntries(this.pending);
        this.pending.clear();
        History.commit('Texto da revisão atualizado', () => Object.assign(State.review().fields, vals), State.demand()?.id)
    },
    save() {
        this.flush();
        History.commit('Revisão do facilitador confirmada', () => State.review().savedAt = now(), State.demand()?.id);
        Feedback.toast('Revisão salva. Relatório pronto para conferência.', true)
    },
    config() {
        Dialog.open('PIN opcional do facilitador', field('pin', 'Novo PIN (deixe vazio para remover)', '', 'password', false, 'inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password"') + '<p class="muted">O PIN só reduz acessos acidentais. Ele pode ser redefinido por quem tem acesso ao arquivo de dados.</p>', saveFooter('Salvar PIN'), () => {
            const pin = formValues().pin;
            if (pin && !/^\d{4}$/.test(pin)) return Dialog.error('Use exatamente quatro dígitos ou deixe vazio.');
            History.commit('PIN do facilitador atualizado', () => State.session().pinHash = pin ? this.hash(pin) : null);
            Dialog.close();
            Feedback.toast(pin ? 'PIN configurado.' : 'PIN removido.', true)
        })
    }
};
/* Browser print uses inline, resolution-independent SVGs; no canvas screenshots or network. */
const Report = {
    section(i, html, cls = '') {
        return State.review().include[i] ? `<section class="rsection ${cls}"><h2>${i+1}. ${ReportSections[i]}</h2>${html}</section>` : ''
    },
    /** Tabela do relatório. widths: larguras das colunas (ex.: ['20%', '80%']) para evitar quebra de palavras. */
    table(head, rows, widths = null) {
        return `<div class="table-wrap"><table>${widths?`<colgroup>${widths.map(w=>`<col style="width:${w}">`).join('')}</colgroup>`:''}<thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${head.length}">Nenhum registro.</td></tr>`}</tbody></table></div>`
    },
    wrap(s, n = 24, max = 4) {
        const words = String(s).split(/\s+/),
            lines = [];
        let line = '';
        for (let word of words) {
            while (word.length > n) {
                if (line) {
                    lines.push(line);
                    line = ''
                }
                lines.push(word.slice(0, n));
                word = word.slice(n)
            }
            if ((line + ' ' + word).trim().length > n) {
                lines.push(line);
                line = word
            } else line = (line + ' ' + word).trim()
        }
        if (line) lines.push(line);
        if (lines.length > max) {
            lines.length = max;
            lines[max - 1] = lines[max - 1].slice(0, n - 1) + '…'
        }
        return lines
    },
    flowSVG(f, kind) {
        if (!f.nodes.length) return '<p class="muted">Fluxo ainda não registrado.</p>';
        const bounds = Flow.bounds(f.nodes),
            b = {
                x: bounds.x - 180,
                y: bounds.y - 180,
                w: bounds.w + 360,
                h: bounds.h + 360
            },
            nodeMap = new Map(f.nodes.map(n => [n.id, n])),
            anchor = (id, port) => {
                const n = nodeMap.get(id);
                return {
                    x: n.x + (port === 'left' ? 0 : port === 'right' ? 224 : 112),
                    y: n.y + (port === 'top' ? 0 : port === 'bottom' ? 128 : 64)
                }
            };
        return `<svg class="reportflow" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fluxo ${kind}"><defs><marker id="reportArrow${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#005061"/></marker></defs>${f.edges.map(e=>{const a=anchor(e.from,e.fromPort),d=anchor(e.to,e.toPort);return `<path d="${Flow.path(a,d,e.fromPort,e.toPort)}" fill="none" stroke="#005061" stroke-width="2.5" marker-end="url(#reportArrow${kind})"/>${e.label?`<text x="${(a.x+d.x)/2}" y="${(a.y+d.y)/2-10}" font-family="Segoe UI,Arial" font-size="14" fill="#005061" text-anchor="middle" stroke="white" stroke-width="5" paint-order="stroke">${esc(e.label)}</text>`:''}`}).join('')}${f.nodes.map(n=>{const lines=this.wrap(n.title,24,4),fill=n.type==='note'?'#fff8dc':n.type==='decision'?'#fff1e5':n.type==='start'?'#e5f5f3':'white';return `<g>${n.type==='decision'?`<polygon points="${n.x+34},${n.y} ${n.x+190},${n.y} ${n.x+224},${n.y+64} ${n.x+190},${n.y+128} ${n.x+34},${n.y+128} ${n.x},${n.y+64}" fill="${fill}" stroke="#005061" stroke-width="2"/>`:`<rect x="${n.x}" y="${n.y}" width="224" height="128" rx="${n.type==='start'?64:14}" fill="${fill}" stroke="#005061" stroke-width="2"/>`}<text x="${n.x+112}" y="${n.y+24}" text-anchor="middle" fill="#546c74" font-family="Segoe UI,Arial" font-size="11">${esc(({step:'ETAPA',start:'INÍCIO / FIM',decision:'DECISÃO',note:'OBSERVAÇÃO'})[n.type])}</text><text font-family="Segoe UI,Arial" fill="#123943" text-anchor="middle" font-weight="600" font-size="16">${lines.map((line,i)=>`<tspan x="${n.x+112}" y="${n.y+62-(lines.length-1)*9+i*20}">${esc(line)}</tspan>`).join('')}</text></g>`}).join('')}</svg>`
    },
    html() {
        const s = State.session(),
            ps = State.people(),
            ds = State.demands(),
            rank = Ranking.sort(ds),
            c = State.cycle(),
            d = State.demand(),
            evaluation = c?.evaluation || {
                ratings: d?.ratings,
                score: d ? Classification.score(d) : 0
            },
            r = State.review().fields,
            tasks = c?.tasks || [],
            person = id => esc(State.data.participants.find(p => p.id === id)?.name || 'Pessoa indisponível'),
            field = (key) => r[key]?.trim() ? `<span class="pre">${esc(r[key])}</span>` : '<span class="not-informed">Não informado</span>',
            metric = keys => `<div class="metricgrid">${keys.map(key=>`<div class="metric"><b>${ReviewFields.find(x=>x[0]===key)[1]}</b><p>${field(key)}</p></div>`).join('')}</div>`;
        return `<article class="report" id="executiveReport"><header class="report-head"><div><p class="report-kicker">Energisa Minas Rio · Hub de Melhoria &amp; Automação</p><h1>${esc(s.title)}</h1><p class="report-sub">Relatório executivo</p></div><dl class="cover-meta"><div><dt>Data</dt><dd>${fmt(s.date)}</dd></div><div><dt>Demandas</dt><dd>${ds.length}</dd></div><div><dt>Presentes</dt><dd>${ps.filter(p=>p.status==='Presente').length}</dd></div></dl></header>${this.section(0,`${c?`<p>Ciclo de trabalho iniciado em ${fmt(c.selectedAt)}.</p>`:''}${metric(['process','area','owner'])}`)}${this.section(1,this.table(['Nome','Área','Presença'],ps.map(p=>[esc(p.name),esc(p.area),esc(p.status)]),['44%','36%','20%']))}${this.section(2,this.table(['Área','Demanda / descrição','Origem','Status'],ds.map(d=>[esc(d.area),`<b>${esc(d.title)}</b><p>${esc(d.description)}</p>`,`${esc(State.data.sessions.find(x=>x.id===d.originSessionId)?.title||'—')}<br>${fmt(d.createdAt)}`,esc(d.status)]),['15%','49%','22%','14%']))}${this.section(3,this.table(['Critério','Peso','Pergunta'],Criteria.map(([name,w,q])=>[name,w+'%',q]),['20%','10%','70%'])+'<p class="note">Escala: 0 inexistente / não aplicável; 1 muito baixo; 2 baixo; 3 moderado; 4 alto; 5 muito alto. Vazio = não respondido. Cada critério: nota ÷ 5 × peso. Soma: 0 a 100.</p>')}${this.section(4,this.table(['#','Demanda / área','Pontuação','Classificação / desempate'],rank.map((d,i)=>[i+1,esc(d.title)+'<br>'+esc(d.area),Utils.number(Classification.score(d))+'/100',Classification.complete(d)?'Completa · Impacto '+d.ratings[0]+' · Viabilidade '+d.ratings[4]+(d.tieOrder!==null?' · decisão do grupo registrada':''):'Incompleta']),['6%','46%','16%','32%'])+'<p class="note">Desempate por Impacto, Viabilidade e decisão do grupo.</p>')}${this.section(5,d?`<div class="statusblock"><h3>${esc(d.title)}</h3><p>${esc(d.description)}</p><p><b>${esc(d.area)} · ${Utils.number(evaluation.score)}/100 · ${esc(d.status)}</b></p><p>Selecionada em ${new Date(c.selectedAt).toLocaleString('pt-BR')} · sessão ${esc(s.title)}</p></div>${metric(['problem','current','change'])}`:'<p>Nenhuma demanda foi confirmada para trabalho.</p>')}${this.section(6,d?this.table(['Critério','Peso','Nota','Pontos'],Criteria.map(([name,w],i)=>[name,w+'%',evaluation.ratings[i]===null?'Não respondido':evaluation.ratings[i]+'/5',evaluation.ratings[i]===null?'—':Utils.number(evaluation.ratings[i]/5*w)]),['40%','15%','25%','20%'])+`<p class="note"><b>Total na escolha: ${Utils.number(evaluation.score)}/100</b> · Avaliação preservada no ciclo</p>`:'<p>Sem demanda selecionada.</p>')}${this.section(7,c?this.flowSVG(c.flows.asis,'ASIS'):'<p>Sem ciclo de trabalho.</p>','flow-section')}${this.section(8,c?this.flowSVG(c.flows.tobe,'TOBE'):'<p>Sem ciclo de trabalho.</p>','flow-section')}${this.section(9,tasks.length?tasks.map(t=>`<div class="taskreport"><h3 class="${t.cancelled?'cancelled-text':''}">${esc(t.title)}</h3><p><b>${Columns.find(x=>x[0]===t.column)[1]}${t.cancelled?' · Cancelada':''}${t.blocked?' · Bloqueada':''}</b> · ${TaskTypes[t.type]}</p><p>Responsáveis: ${t.assignees.map(person).join(', ')||'Sem responsáveis'}</p>${t.description?`<p>Descrição: ${esc(t.description)}</p>`:''}<p>Critério de aceite: ${esc(t.acceptance)||'<span class="not-informed">Não informado</span>'}</p>${t.blocked?`<p>Bloqueio: ${esc(t.blockReason)}</p>`:''}${t.notes?`<p>Observações: ${esc(t.notes)}</p>`:''}<small>Criada em ${new Date(t.createdAt).toLocaleString('pt-BR')} · Alterada em ${new Date(t.updatedAt).toLocaleString('pt-BR')}</small></div>`).join(''):'<p>Nenhuma atividade cadastrada.</p>')}${this.section(10,`<p class="note">Categorias exclusivas: cancelada tem precedência sobre bloqueada; bloqueada, sobre concluída.</p>`+this.table(['Situação','Quantidade','Atividades'],[['Concluídas',tasks.filter(t=>t.column==='done'&&!t.cancelled&&!t.blocked)],['Canceladas',tasks.filter(t=>t.cancelled)],['Bloqueadas',tasks.filter(t=>t.blocked&&!t.cancelled)],['Pendentes',tasks.filter(t=>t.column!=='done'&&!t.cancelled&&!t.blocked)]].map(([label,list])=>[label,list.length,list.map(t=>esc(t.title)).join('<br>')||'—']),['20%','14%','66%']))}${this.section(11,metric(['benefit','indicator','baseline','target','result']))}${this.section(12,`<p>${field('next')}</p>`)}${this.section(13,`<p>${field('executive')}</p>`)}<footer class="print-footer">Hub de Melhoria &amp; Automação EMR ${APP_VERSION} · Relatório gerado em ${new Date().toLocaleString('pt-BR')} · Dados registrados localmente.</footer></article>`
    },
    async print() {
        Facilitator.flush();
        if (State.step !== 6) Navigation.go(6);
        await Storage.flush().catch(() => {});
        window.print()
    }
};
/* Strict import schema. Reject malformed IDs, references, enum values and nonfinite coordinates. */
