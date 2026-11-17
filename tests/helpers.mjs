import { expect } from '@playwright/test';

/** Abre o app com armazenamento limpo e espera a base local carregar. */
export async function openApp(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await page.goto('/');
  await expect(page.locator('#saveIndicator')).toContainText('Salvo');
  return errors;
}

export const action = (page, name, extra = '') => page.locator(`[data-action="${name}"]${extra}`);

/** Preenche a janela modal aberta (campos por name) e confirma. */
export async function submitModal(page, values = {}) {
  const modal = page.locator('#modal[open]');
  await expect(modal).toBeVisible();
  for (const [name, value] of Object.entries(values)) {
    const field = modal.locator(`[name="${name}"]`);
    const tag = await field.evaluate(el => el.tagName);
    if (tag === 'SELECT') await field.selectOption(value);
    else await field.fill(value);
  }
  await modal.locator('button[type="submit"]').click();
  await expect(page.locator('#modal')).not.toHaveAttribute('open', '');
}

export async function goStep(page, index) {
  await page.locator(`#navigation [data-step="${index}"]`).click();
  await expect(page.locator('#navigation [aria-current="step"]')).toHaveAttribute('data-step', String(index));
}

export async function addPerson(page, name, area, status) {
  await page.locator('[data-action="person-add"]').first().click();
  await submitModal(page, { name, area, ...(status ? { status } : {}) });
}

export async function addDemand(page, area, title, description = '') {
  await page.locator('[data-action="demand-add"]').first().click();
  await submitModal(page, { area, title, description });
}

/** Avalia a demanda selecionada na classificação com as seis notas informadas. */
export async function rate(page, demandTitle, ratings) {
  await page.locator('[data-action="class-select"]', { hasText: demandTitle }).click();
  const id = await page.locator('[data-action="class-select"][aria-pressed="true"]').getAttribute('data-id');
  for (const [i, value] of ratings.entries()) {
    await page.locator(`[data-action="rate"][data-id="${id}"][data-index="${i}"][data-value="${value}"]`).click();
  }
  return id;
}

/** Lê o estado de domínio diretamente (apenas para asserções). */
export const data = page => page.evaluate(() => JSON.parse(JSON.stringify(State.data)));
