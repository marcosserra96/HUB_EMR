import { test, expect } from '@playwright/test';
import { openApp, submitModal, goStep, data, action } from './helpers.mjs';

/** Monta um encontro completo direto no estado (mais rápido que pela interface). */
async function seedMeeting(page, { cycle = false } = {}) {
  await page.evaluate(({ cycle }) => {
    const s = State.session();
    s.title = 'Maratona de teste';
    for (const [name, area] of [['Ana Souza', 'Faturamento'], ['Bruno Lima', 'TI']]) {
      const p = { id: uid(), name, area, status: 'Presente', createdAt: now(), updatedAt: now() };
      State.data.participants.push(p); s.participantIds.push(p.id);
    }
    const mk = (title, ratings) => {
      const d = { id: uid(), originSessionId: s.id, area: 'Faturamento', title, description: 'Descrição de ' + title, ratings, status: ratings.every(n => n !== null) ? 'Classificada' : 'Mapeada', createdAt: now(), updatedAt: now(), history: [], selections: [], tieOrder: null };
      State.data.demands.push(d); s.demandIds.push(d.id); return d;
    };
    const a = mk('Leituras atípicas', [5, 5, 5, 4, 4, 4]);
    mk('Ordens impressas', [3, 4, 5, 3, 4, 4]);
    mk('Agendamento de leituristas', [null, null, null, null, null, null]);
    Storage.save(State.data);
    if (cycle) Ranking.start(a);
    Render.header(); Render.page();
  }, { cycle });
}

test('menu ⋯ abre, fecha com Esc e executa a ação escolhida', async ({ page }) => {
  await openApp(page);
  await seedMeeting(page);
  await goStep(page, 1);
  const menu = page.locator('.demand-card details.menu').first();
  await menu.locator('summary').click();
  await expect(menu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await menu.locator('summary').click();
  await menu.locator('[data-action="demand-archive"]').click();
  await submitModal(page);
  await expect(page.locator('.demand-card')).toHaveCount(2);
  await expect(menu).not.toHaveAttribute('open', '');
});

test('mapeamento filtra por situação e busca por texto', async ({ page }) => {
  await openApp(page);
  await seedMeeting(page);
  await goStep(page, 1);
  await expect(page.locator('[data-map-count="pending"]')).toHaveText('1');
  await action(page, 'map-filter', '[data-filter="pending"]').click();
  await expect(page.locator('.demand-card')).toHaveCount(1);
  await expect(page.locator('.demand-card h3')).toHaveText('Agendamento de leituristas');
  await action(page, 'map-filter', '[data-filter="all"]').click();
  await page.locator('#mapSearch').fill('ordens');
  await expect(page.locator('.demand-card')).toHaveCount(1);
  await expect(page.locator('#mapSearch')).toBeFocused();
  await page.locator('#mapSearch').fill('xyz');
  await expect(page.locator('#mapResults')).toContainText('Nenhuma demanda encontrada');
});

test('ranking separa as demandas não classificadas e só confirma a primeira', async ({ page }) => {
  await openApp(page);
  await seedMeeting(page);
  await goStep(page, 3);
  await expect(page.locator('.rank-card')).toHaveCount(2);
  await expect(page.locator('.rank-card').first()).toContainText('Leituras atípicas');
  await expect(page.locator('.rank-pending')).toContainText('Agendamento de leituristas');
  await expect(action(page, 'rank-confirm')).toHaveCount(1);
  await expect(page.locator('.pagehead [data-step="4"]')).toHaveCount(0);
  await action(page, 'rank-expand').first().click();
  await expect(page.locator('.rank-crit')).toHaveCount(6);
});

test('escala da interface muda o tamanho base e é lembrada', async ({ page }) => {
  await openApp(page);
  const size = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  expect(await size()).toBe('13.6px');
  await page.locator('#toolsMenu summary').click();
  await action(page, 'ui-density', '[data-density="comfortable"]').click();
  expect(await size()).toBe('16px');
  await expect(page.locator('#densityValue')).toHaveText('100%');
  await page.reload();
  await expect(page.locator('#saveIndicator')).toContainText('Salvo');
  expect(await size()).toBe('16px');
});

test('menu lateral recolhe em trilho e a escolha é lembrada', async ({ page }) => {
  await openApp(page);
  await action(page, 'toggle-sidebar').first().click();
  await expect(page.locator('.app')).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator('.nav-label').first()).toBeHidden();
  await expect(page.locator('#navigation [data-step="7"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('.app')).toHaveClass(/sidebar-collapsed/);
});

test('zoom do fluxo não ocupa o desfazer', async ({ page }) => {
  await openApp(page);
  await seedMeeting(page, { cycle: true });
  const before = (await data(page)).undo.length;
  await action(page, 'flow-zoom-in').click();
  await action(page, 'flow-zoom-in').click();
  await action(page, 'flow-fit').click();
  const d = await data(page);
  expect(d.undo.length).toBe(before);
  expect(d.cycles[0].flows.asis.view.z).toBeGreaterThan(0);
});

test('arrasta um elemento do fluxo e conecta dois elementos pelos pontos', async ({ page }) => {
  await openApp(page);
  await seedMeeting(page, { cycle: true });
  for (const title of ['Receber leitura', 'Conferir']) {
    await action(page, 'flow-add').click();
    await submitModal(page, { title });
  }
  const [first, second] = await page.locator('[data-node-id]').all();
  const box = await first.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 200, { steps: 8 });
  await page.mouse.up();
  let d = await data(page);
  const moved = d.cycles[0].flows.asis.nodes[0];
  expect(moved.y).toBeGreaterThan(150);

  const port = first.locator('[data-port="right"]');
  const target = await second.boundingBox();
  const p = await port.boundingBox();
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
  await page.mouse.up();
  d = await data(page);
  expect(d.cycles[0].flows.asis.edges).toHaveLength(1);
  await expect(page.locator('[data-edge-id]')).toHaveCount(1);
});

test('kanban: segurar e arrastar move o card; arrastar pessoa vincula responsável', async ({ page }) => {
  await openApp(page);
  await seedMeeting(page, { cycle: true });
  await action(page, 'work-view', '[data-view="kanban"]').click();
  await action(page, 'task-add').click();
  await submitModal(page, { title: 'Automatizar conferência' });
  const card = page.locator('[data-task-id]');
  const from = await card.boundingBox();
  const to = await page.locator('[data-drop-column="doing"]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await data(page)).cycles[0].tasks[0].column).toBe('doing');

  const person = await page.locator('[data-person-drag]').first().boundingBox();
  const target = await page.locator('[data-task-id]').boundingBox();
  await page.mouse.move(person.x + 20, person.y + person.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await data(page)).cycles[0].tasks[0].assignees.length).toBe(1);
  await expect(page.locator('.assignee-chip')).toHaveCount(1);
});

test('teclado da tela abre ao tocar num campo de texto', async ({ page }) => {
  await openApp(page);
  await action(page, 'person-add').first().click();
  await page.locator('#modal [name="name"]').tap();
  await expect(page.locator('.touch-keyboard')).toBeVisible();
  await page.locator('.touch-keyboard [data-kbd-key="a"]').first().tap();
  await expect(page.locator('#modal [name="name"]')).toHaveValue(/a/i);
});

test('impressão esconde a moldura e mostra só o relatório', async ({ page }) => {
  await openApp(page);
  await seedMeeting(page);
  await goStep(page, 6);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('#executiveReport')).toBeVisible();
  await expect(page.locator('.print-footer')).toBeVisible();
  await expect(page.locator('#executiveReport')).not.toContainText(/Touch Board v3|Sessão: /);
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('sem rolagem lateral em nenhuma etapa e menu em gaveta', async ({ page }) => {
    await openApp(page);
    await seedMeeting(page, { cycle: true });
    for (let step = 0; step < 8; step++) {
      await page.evaluate(s => { State.step = s; Render.header(); Render.page(); }, step);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, `etapa ${step + 1}`).toBeLessThanOrEqual(390);
    }
    await expect(page.locator('.sidebar')).toBeHidden();
    await action(page, 'toggle-sidebar').first().click();
    await expect(page.locator('.sidebar')).toBeVisible();
    await page.locator('#navigation [data-step="1"]').click();
    await expect(page.locator('body')).not.toHaveClass(/nav-open/);
  });
});
