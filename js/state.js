'use strict';
/* Hub EMR · Persistência (IndexedDB) e estado da aplicação; modelo de dados de sessão. */
const Storage = (() => {
    let db, queue = Promise.resolve();
    return {
        async open() {
            db = await new Promise((resolve, reject) => {
                const r = indexedDB.open('EMR_Touch_Board_v3', 1);
                r.onupgradeneeded = () => r.result.createObjectStore('workspace');
                r.onsuccess = () => resolve(r.result);
                r.onerror = () => reject(r.error);
                r.onblocked = () => reject(new Error('Feche outras versões deste aplicativo e recarregue.'))
            });
            return await new Promise((resolve, reject) => {
                const r = db.transaction('workspace').objectStore('workspace').get('main');
                r.onsuccess = () => resolve(r.result);
                r.onerror = () => reject(r.error)
            })
        },
        save(value) {
            const snapshot = clone(value);
            queue = queue.catch(() => {}).then(() => new Promise((resolve, reject) => {
                const tx = db.transaction('workspace', 'readwrite');
                tx.objectStore('workspace').put(snapshot, 'main');
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('Gravação interrompida'))
            }));
            return queue
        },
        flush() {
            return queue
        },
        get db() {
            return db
        }
    }
})();
const State = {
    data: null,
    step: 0,
    selectedDemand: null,
    workView: 'flow',
    flowKind: 'asis',
    tieSelected: null,
    reviewUnlocked: false,
    dirty: false,
    revision: 0,
    savedRevision: 0,
    modalSave: null,
    modalCleanup: null,
    filter: '',
    statusFilter: '',
    expanded: new Set(),
    session() {
        return this.data.sessions.find(x => x.id === this.data.activeSessionId)
    },
    people() {
        const ids = this.session().participantIds;
        return this.data.participants.filter(x => ids.includes(x.id))
    },
    demands() {
        const ids = this.session().demandIds;
        return this.data.demands.filter(x => ids.includes(x.id))
    },
    activeDemands() {
        return this.demands().filter(x => x.status !== 'Arquivada')
    },
    cycle() {
        return this.data.cycles.find(x => x.id === this.session().selectedCycleId)
    },
    demand() {
        return this.data.demands.find(x => x.id === this.cycle()?.demandId)
    },
    review() {
        return this.cycle()?.review || this.session().review
    },
    historySource() {
        const {
            sessions,
            participants,
            demands,
            cycles,
            activeSessionId
        } = this.data;
        return clone({
            sessions,
            participants,
            demands,
            cycles,
            activeSessionId
        })
    }
};
const newReview = () => ({
    fields: Object.fromEntries(ReviewFields.map(([id]) => [id, ''])),
    include: Array(14).fill(true)
});

function newSession(title = 'Encontro de Melhoria & Automação', date = Utils.date()) {
    return {
        id: uid(),
        title,
        date,
        createdAt: now(),
        participantIds: [],
        demandIds: [],
        selectedCycleId: null,
        review: newReview(),
        pinHash: null
    }
}

function seed() {
    const s = newSession();
    return {
        format: 'emr-touch-board',
        version: 3,
        activeSessionId: s.id,
        sessions: [s],
        participants: [],
        demands: [],
        cycles: [],
        undo: [],
        audit: [],
        updatedAt: now(),
        ui: {
            sidebarCollapsed: false,
            density: 'compact'
        }
    }
}
