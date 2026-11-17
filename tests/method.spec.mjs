import { test, expect } from '@playwright/test';
import { openApp, submitModal, goStep, addPerson, addDemand, rate, data, action } from './helpers.mjs';

const WEIGHTS = [25, 20, 15, 15, 15, 10];
const score = r => r.reduce((s, n, i) => s + (n ?? 0) / 5 * WEIGHTS[i], 0);

test('inicia com uma sessão vazia e sem erros', async ({ page }) => {
  const errors = await openApp(page);
  const d = await data(page);
  expect(d.format).toBe('emr-touch-board');
  expect(d.sessions).toHaveLength(1);
  await expect(page.locator('#navigation [data-step]')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('cadastra participantes e mantém a contagem de presentes', async ({ page }) => {
  await openApp(page);
  await addPerson(page, 'Ana Souza', 'Faturamento');
  await addPerson(page, 'Bruno Lima', 'TI', 'Prevista');
  await expect(page.locator('#content')).toContainText('Ana Souza');
  await expect(page.locator('#content')).toContainText('Bruno Lima');
  await expect(page.locator('#peopleCount')).toHaveText('1');
  const d = await data(page);
  expect(d.participants.map(p => p.status).sort()).toEqual(['Presente', 'Prevista']);
});

test('classifica, ordena pelo método e desempata por Impacto e Viabilidade', async ({ page }) => {
  await openApp(page);
  await goStep(page, 1);
  const set = {
    A: [5, 5, 5, 4, 4, 4], // 92
    B: [4, 4, 5, 2, 5, 5], // 82
    C: [3, 4, 5, 3, 4, 4], // 75
    D: [4, 3, 4, 4, 3, 3], // 71
    E: [3, 5, 5, 4, 4, 4]  // 82, mesmo total de B, Impacto menor
  };
  for (const title of Object.keys(set)) await addDemand(page, 'Área ' + title, 'Demanda ' + title, 'Descrição ' + title);
  await addDemand(page, 'Medição', 'Demanda incompleta');
  await goStep(page, 2);
  for (const [title, r] of Object.entries(set)) await rate(page, 'Demanda ' + title, r);

  const d = await data(page);
  for (const [title, r] of Object.entries(set)) {
    const item = d.demands.find(x => x.title === 'Demanda ' + title);
    expect(item.ratings).toEqual(r);
    expect(item.status).toBe('Classificada');
  }
  expect(d.demands.find(x => x.title === 'Demanda incompleta').status).toBe('Mapeada');

  const order = await page.evaluate(() => Ranking.sort(State.activeDemands()).map(x => x.title));
  expect(order).toEqual(['Demanda A', 'Demanda B', 'Demanda E', 'Demanda C', 'Demanda D', 'Demanda incompleta']);
  const scores = await page.evaluate(() => State.activeDemands().map(x => [x.title, Classification.score(x)]));
  for (const [title, value] of scores) if (set[title.slice(-1)]) expect(value).toBeCloseTo(score(set[title.slice(-1)]), 6);
});

test('zero conta como resposta e vazio não conta', async ({ page }) => {
  await openApp(page);
  await goStep(page, 1);
  await addDemand(page, 'TI', 'Só zeros');
  await goStep(page, 2);
  const id = await rate(page, 'Só zeros', [0, 0, 0, 0, 0]);
  expect(await page.evaluate(id => Classification.complete(State.data.demands.find(x => x.id === id)), id)).toBe(false);
  await page.locator(`[data-action="rate"][data-id="${id}"][data-index="5"][data-value="0"]`).click();
  expect(await page.evaluate(id => Classification.complete(State.data.demands.find(x => x.id === id)), id)).toBe(true);
  await page.locator(`[data-action="clear-rating"][data-id="${id}"][data-index="5"]`).click();
  const d = await data(page);
  expect(d.demands[0].ratings[5]).toBeNull();
  expect(d.demands[0].status).toBe('Mapeada');
});

test('empate total pede decisão do grupo antes da confirmação', async ({ page }) => {
  await openApp(page);
  await goStep(page, 1);
  await addDemand(page, 'TI', 'Empate 1');
  await addDemand(page, 'TI', 'Empate 2');
  await goStep(page, 2);
  await rate(page, 'Empate 1', [4, 4, 4, 4, 4, 4]);
  await rate(page, 'Empate 2', [4, 4, 4, 4, 4, 4]);
  await goStep(page, 3);
  await expect(action(page, 'rank-confirm')).toBeDisabled();
  await action(page, 'tie-choose').filter({ hasText: 'Empate 2' }).click();
  await expect(action(page, 'rank-confirm')).toBeEnabled();
  const order = await page.evaluate(() => Ranking.sort(State.activeDemands()).map(x => x.title));
  expect(order[0]).toBe('Empate 2');
});

test('confirma a demanda, abre ciclo, monta fluxo e kanban e desfaz', async ({ page }) => {
  await openApp(page);
  await addPerson(page, 'Ana Souza', 'Faturamento');
  await goStep(page, 1);
  await addDemand(page, 'Faturamento', 'Leituras atípicas', 'Retrabalho diário');
  await goStep(page, 2);
  await rate(page, 'Leituras atípicas', [5, 5, 5, 4, 4, 4]);
  await goStep(page, 3);
  await action(page, 'rank-confirm').click();
  await submitModal(page);

  let d = await data(page);
  expect(d.cycles).toHaveLength(1);
  expect(d.demands[0].status).toBe('Selecionada');
  expect(d.cycles[0].evaluation.score).toBeCloseTo(92, 6);
  expect(d.cycles[0].review.fields.problem).toBe('Retrabalho diário');
  await expect(page.locator('#navigation [aria-current="step"]')).toHaveAttribute('data-step', '4');

  await action(page, 'flow-add').click();
  await submitModal(page, { title: 'Receber leitura', type: 'step' });
  await action(page, 'flow-add').click();
  await submitModal(page, { title: 'Conferir planilha', type: 'decision' });
  await expect(page.locator('[data-node-id]')).toHaveCount(2);

  await action(page, 'flow-copy').click();
  await submitModal(page);
  d = await data(page);
  const { asis, tobe } = d.cycles[0].flows;
  expect(tobe.nodes.map(n => n.title)).toEqual(asis.nodes.map(n => n.title));
  expect(tobe.nodes.some(n => asis.nodes.some(m => m.id === n.id))).toBe(false);

  await action(page, 'work-view', '[data-view="kanban"]').click();
  await action(page, 'task-add').click();
  await submitModal(page, { title: 'Automatizar conferência' });
  await expect(page.locator('[data-task-id]')).toHaveCount(1);

  await page.locator('[data-task-id]').click();
  await page.locator('#modal [name="assignees"]').first().check();
  await submitModal(page, { column: 'doing' });
  d = await data(page);
  expect(d.cycles[0].tasks[0].column).toBe('doing');
  expect(d.cycles[0].tasks[0].assignees).toHaveLength(1);

  await action(page, 'undo').first().click();
  d = await data(page);
  expect(d.cycles[0].tasks[0].column).toBe('backlog');
});

test('arquiva, restaura e exclui demandas preservando o histórico', async ({ page }) => {
  await openApp(page);
  await goStep(page, 1);
  await addDemand(page, 'TI', 'Para arquivar');
  await addDemand(page, 'TI', 'Para excluir');
  await page.evaluate(() => Demands.archive(State.data.demands[0].id));
  await submitModal(page);
  expect(await page.evaluate(() => State.activeDemands().map(x => x.title))).toEqual(['Para excluir']);
  await page.evaluate(() => Demands.restore(State.data.demands[0].id));
  await submitModal(page);
  expect(await page.evaluate(() => State.activeDemands()).then(x => x.length)).toBe(2);
  await page.evaluate(() => Demands.remove(State.data.demands[1].id));
  await submitModal(page);
  const d = await data(page);
  expect(d.demands.map(x => x.title)).toEqual(['Para arquivar']);
  expect(d.demands[0].history.map(h => h.label)).toEqual(expect.arrayContaining(['Demanda arquivada', 'Demanda restaurada']));
});

test('salva no navegador e recupera após recarregar', async ({ page }) => {
  await openApp(page);
  await addPerson(page, 'Carla Dias', 'Atendimento');
  await expect(page.locator('#saveIndicator')).toContainText('Salvo');
  await page.reload();
  await expect(page.locator('#saveIndicator')).toContainText('Salvo');
  await expect(page.locator('#content')).toContainText('Carla Dias');
});

test('backup JSON valida e reimporta sem perda', async ({ page }) => {
  await openApp(page);
  await addPerson(page, 'Diego Reis', 'Operação');
  await goStep(page, 1);
  await addDemand(page, 'Operação', 'Ordens impressas');
  const roundtrip = await page.evaluate(() => {
    const raw = JSON.parse(JSON.stringify(State.data));
    const back = Transfer.validate(JSON.parse(JSON.stringify(raw)));
    return { same: JSON.stringify(back.demands) === JSON.stringify(raw.demands) && JSON.stringify(back.participants) === JSON.stringify(raw.participants) };
  });
  expect(roundtrip.same).toBe(true);
  const rejected = await page.evaluate(() => { try { Transfer.validate({ format: 'outro' }); return false; } catch { return true; } });
  expect(rejected).toBe(true);
});

test('PIN do facilitador bloqueia a revisão', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { State.reviewUnlocked = false; Facilitator.config(); });
  await submitModal(page, { pin: '1234' });
  await page.locator('#navigation [data-step="5"]').click();
  await expect(page.locator('#modal[open]')).toBeVisible();
  await page.locator('#modal [name="pin"]').fill('0000');
  await page.locator('#modal button[type="submit"]').click();
  await expect(page.locator('#modalError')).toHaveText('PIN incorreto.');
  await page.locator('#modal [name="pin"]').fill('1234');
  await page.locator('#modal button[type="submit"]').click();
  await expect(page.locator('#navigation [aria-current="step"]')).toHaveAttribute('data-step', '5');
});

test('backup completo registra a data e aparece em Ferramentas', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#backupStatus')).toHaveText('Nenhum backup exportado');
  const download = page.waitForEvent('download');
  await page.evaluate(() => Transfer.export('all'));
  expect((await download).suggestedFilename()).toMatch(/^HubEMR_backup_completo_\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.locator('#backupStatus')).toHaveText(/^Último: \d{2}\/\d{2}\/\d{4}$/);
  const ok = await page.evaluate(() => { try { Transfer.validate(JSON.parse(JSON.stringify(State.data))); return true; } catch { return false; } });
  expect(ok).toBe(true);
});
