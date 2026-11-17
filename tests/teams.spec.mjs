import { test, expect } from '@playwright/test';
import { openApp, submitModal, data, action } from './helpers.mjs';

/** Encontro com 4 pessoas e 3 demandas classificadas, já no ranking. */
async function seed(page) {
  await page.evaluate(() => {
    const s = State.session();
    for (const [name, area] of [['Ana Souza', 'Faturamento'], ['Bruno Lima', 'TI'], ['Carla Dias', 'Atendimento'], ['Diego Reis', 'Operação']]) {
      const p = { id: uid(), name, area, status: 'Presente', createdAt: now(), updatedAt: now() };
      State.data.participants.push(p); s.participantIds.push(p.id);
    }
    for (const [title, ratings] of [['Leituras atípicas', [5, 5, 5, 4, 4, 4]], ['Conciliação bancária', [4, 4, 5, 2, 5, 5]], ['Ordens impressas', [3, 4, 5, 3, 4, 4]]]) {
      const d = { id: uid(), originSessionId: s.id, area: 'Faturamento', title, description: 'Descrição', ratings, status: 'Classificada', createdAt: now(), updatedAt: now(), history: [], selections: [], tieOrder: null };
      State.data.demands.push(d); s.demandIds.push(d.id);
    }
    Storage.save(State.data);
    State.step = 3; Render.header(); Render.page();
  });
}

async function startTeams(page, second = 'Conciliação bancária') {
  await action(page, 'team-choose').click();
  await page.locator('#modal .pair-option', { hasText: second }).click();
  await submitModal(page);
}

test('com uma demanda, nada de abas: o trabalho continua como antes', async ({ page }) => {
  await openApp(page);
  await seed(page);
  await action(page, 'rank-confirm').click();
  await submitModal(page);
  await expect(page.locator('.team-bar')).toHaveCount(0);
  await expect(page.locator('#flowCanvas')).toBeVisible();
  expect((await data(page)).sessions[0].teams).toBeUndefined();
});

test('duas demandas criam duas equipes, uma por ciclo, e abrem a montagem', async ({ page }) => {
  await openApp(page);
  await seed(page);
  await startTeams(page, 'Ordens impressas');
  const d = await data(page);
  const teams = d.sessions[0].teams;
  expect(teams.map(t => [t.name, t.color])).toEqual([['Equipe azul', 'blue'], ['Equipe laranja', 'orange']]);
  const titles = teams.map(t => d.demands.find(x => x.id === d.cycles.find(c => c.id === t.cycleId).demandId).title);
  expect(titles).toEqual(['Leituras atípicas', 'Ordens impressas']);
  expect(d.demands.filter(x => x.status === 'Selecionada').map(x => x.title).sort()).toEqual(['Leituras atípicas', 'Ordens impressas']);
  await expect(page.locator('.team-bar .team-tab')).toHaveCount(4);
  await expect(page.locator('h1')).toHaveText('Montar equipes');
  expect(d.ui.sidebarCollapsed).toBe(true);
});

test('pessoa fica em uma equipe só; distribuir equilibra quem sobrou', async ({ page }) => {
  await openApp(page);
  await seed(page);
  await startTeams(page);
  const ana = page.locator('.member-row', { hasText: 'Ana Souza' });
  await ana.locator('[data-action="team-assign"][data-team="orange"]').click();
  await ana.locator('[data-action="team-assign"][data-team="blue"]').click();
  let teams = (await data(page)).sessions[0].teams;
  expect(teams[0].memberIds).toHaveLength(1);
  expect(teams[1].memberIds).toHaveLength(0);
  await action(page, 'team-distribute').click();
  teams = (await data(page)).sessions[0].teams;
  expect(teams.map(t => t.memberIds.length).sort()).toEqual([2, 2]);
  expect(new Set(teams.flatMap(t => t.memberIds)).size).toBe(4);
  await ana.locator('[data-action="team-assign"][data-cycle=""]').click();
  teams = (await data(page)).sessions[0].teams;
  expect(teams.flatMap(t => t.memberIds)).toHaveLength(3);
});

test('cada equipe tem fluxo e kanban próprios; trocar de aba não entra no desfazer', async ({ page }) => {
  await openApp(page);
  await seed(page);
  await startTeams(page);
  await action(page, 'team-tab', '[data-tab="team"][data-team="blue"]').click();
  await action(page, 'work-view', '[data-view="kanban"]').click();
  await action(page, 'task-add').click();
  await submitModal(page, { title: 'Tarefa da equipe azul' });
  const undoBefore = (await data(page)).undo.length;
  await action(page, 'team-tab', '[data-tab="team"][data-team="orange"]').click();
  await expect(page.locator('#content')).toHaveAttribute('data-team', 'orange');
  await expect(page.locator('[data-task-id]')).toHaveCount(0);
  expect((await data(page)).undo.length).toBe(undoBefore);
  await action(page, 'team-tab', '[data-tab="overview"]').click();
  await expect(page.locator('.team-card[data-team="blue"]')).toContainText('0 de 1 concluídas');
  await expect(page.locator('.team-card[data-team="orange"]')).toContainText('0 de 0 concluídas');
  await page.locator('.team-card[data-team="blue"] .team-card-open').click();
  await expect(page.locator('[data-task-id]')).toHaveCount(1);
});

test('editar, adicionar e encerrar equipes', async ({ page }) => {
  await openApp(page);
  await seed(page);
  await startTeams(page);
  await action(page, 'team-edit').first().click();
  await page.locator('#modal [name="name"]').fill('Equipe Faturamento');
  await page.locator('#modal .color-option', { hasText: 'Roxa' }).click();
  await submitModal(page);
  let teams = (await data(page)).sessions[0].teams;
  expect(teams[0]).toMatchObject({ name: 'Equipe Faturamento', color: 'purple' });

  await page.locator('.pagehead details.menu summary').click();
  await action(page, 'team-add').click();
  await submitModal(page);
  teams = (await data(page)).sessions[0].teams;
  expect(teams).toHaveLength(3);
  expect(teams[2].color).toBe('blue');

  await page.locator('.pagehead details.menu summary').click();
  await action(page, 'team-end').click();
  await submitModal(page);
  const d = await data(page);
  expect(d.sessions[0].teams).toBeUndefined();
  expect(d.cycles).toHaveLength(3);
  expect(d.demands.filter(x => x.status === 'Selecionada')).toHaveLength(1);
  await expect(page.locator('.team-bar')).toHaveCount(0);
});

test('confirmar uma demanda só encerra o modo equipes e preserva os ciclos', async ({ page }) => {
  await openApp(page);
  await seed(page);
  await startTeams(page);
  await page.evaluate(() => { State.step = 3; Render.header(); Render.page(); });
  await page.evaluate(() => Ranking.choose(State.data.demands[2].id));
  await expect(page.locator('#modal')).toContainText('As equipes atuais serão encerradas');
  await submitModal(page);
  const d = await data(page);
  expect(d.sessions[0].teams).toBeUndefined();
  expect(d.cycles).toHaveLength(3);
  expect(d.demands.map(x => x.status)).toEqual(['Em desenvolvimento', 'Em desenvolvimento', 'Selecionada']);
});

test('backup com equipes valida, reimporta como cópia e recusa equipe inválida', async ({ page }) => {
  await openApp(page);
  await seed(page);
  await startTeams(page);
  await action(page, 'team-distribute').click();
  const result = await page.evaluate(() => {
    const raw = JSON.parse(JSON.stringify(State.data));
    Transfer.validate(JSON.parse(JSON.stringify(raw)));
    const dupe = JSON.parse(JSON.stringify(raw));
    dupe.sessions[0].teams[1].memberIds.push(dupe.sessions[0].teams[0].memberIds[0]);
    let rejected = false;
    try { Transfer.validate(dupe); } catch { rejected = true; }
    Transfer.prepared = Transfer.validate(raw);
    Transfer.merge();
    const copy = State.data.sessions.find(s => s.id !== raw.sessions[0].id && s.teams);
    const cycles = new Set(State.data.cycles.filter(c => c.sessionId === copy.id).map(c => c.id));
    return { rejected, copied: copy.teams.length, linked: copy.teams.every(t => cycles.has(t.cycleId)), people: copy.teams.every(t => t.memberIds.every(id => copy.participantIds.includes(id))) };
  });
  expect(result).toEqual({ rejected: true, copied: 2, linked: true, people: true });
});

test('relatório traz um bloco por equipe e a revisão alterna entre elas', async ({ page }) => {
  await openApp(page);
  await seed(page);
  await startTeams(page);
  await page.evaluate(() => { State.step = 5; Render.header(); Render.page(); });
  await action(page, 'review-team', '[data-team="orange"]').click();
  await page.locator('[data-review-field="next"]').fill('Próximo passo da laranja');
  await page.evaluate(() => Facilitator.flush());
  await page.evaluate(() => { State.step = 6; Render.header(); Render.page(); });
  await expect(page.locator('.team-block')).toHaveCount(2);
  await expect(page.locator('.team-block[data-team="orange"]')).toContainText('Próximo passo da laranja');
  await expect(page.locator('.team-block[data-team="blue"]')).not.toContainText('Próximo passo da laranja');
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('abas e telas de equipe sem rolagem lateral', async ({ page }) => {
    await openApp(page);
    await seed(page);
    await startTeams(page);
    for (const tab of ['setup', 'overview']) {
      await page.evaluate(t => Teams.open(t), tab);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }
  });
});

test('de um ciclo do histórico, visão geral e "Voltar às equipes" voltam para as equipes', async ({ page }) => {
  await openApp(page);
  await seed(page);
  await action(page, 'rank-confirm').click();
  await submitModal(page);
  const firstCycle = (await data(page)).cycles[0].id;
  await page.evaluate(() => { State.step = 3; Render.header(); Render.page(); });
  await startTeams(page, 'Ordens impressas');
  /* A demanda que já estava em trabalho leva o ciclo atual para a equipe azul. */
  expect((await data(page)).sessions[0].teams[0].cycleId).toBe(firstCycle);
  await page.evaluate(() => Teams.end());
  await submitModal(page);
  await page.evaluate(() => { State.step = 3; Render.header(); Render.page(); });
  await page.evaluate(() => Ranking.start(State.data.demands[0]));
  const oldCycle = firstCycle;
  await page.evaluate(() => { State.step = 3; Render.header(); Render.page(); });
  await startTeams(page, 'Ordens impressas');
  await page.evaluate(id => Sessions.openCycle(id), oldCycle);
  await expect(page.locator('#content')).toContainText('ciclo anterior');
  await expect(page.locator('#flowCanvas')).toBeVisible();
  await action(page, 'team-tab', '[data-tab="overview"]').first().click();
  await expect(page.locator('h1')).toHaveText('Visão geral das equipes');
  const d = await data(page);
  expect(d.sessions[0].teams.map(t => t.cycleId)).toContain(d.sessions[0].selectedCycleId);
  await page.evaluate(id => Sessions.openCycle(id), oldCycle);
  await page.locator('.notice [data-action="team-tab"]').click();
  await expect(page.locator('h1')).toHaveText('Visão geral das equipes');
});

test('não troca de equipe enquanto alguém está arrastando no quadro', async ({ page }) => {
  await openApp(page);
  await seed(page);
  await startTeams(page);
  await action(page, 'team-tab', '[data-tab="team"][data-team="blue"]').click();
  await action(page, 'flow-add').click();
  await submitModal(page, { title: 'Etapa azul' });
  const before = (await data(page)).sessions[0].selectedCycleId;
  const node = await page.locator('[data-node-id]').boundingBox();
  await page.mouse.move(node.x + node.width / 2, node.y + node.height / 2);
  await page.mouse.down();
  await page.mouse.move(node.x + node.width / 2 + 40, node.y + node.height / 2 + 40, { steps: 4 });
  await page.evaluate(() => Teams.open('team', State.teams()[1].cycleId));
  expect((await data(page)).sessions[0].selectedCycleId).toBe(before);
  await page.mouse.move(node.x + node.width / 2 + 80, node.y + node.height / 2 + 120, { steps: 4 });
  await page.mouse.up();
  const d = await data(page);
  const cycle = d.cycles.find(c => c.id === before);
  expect(cycle.flows.asis.nodes[0].y).toBeGreaterThan(100);
});
