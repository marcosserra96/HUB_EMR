import { defineConfig } from '@playwright/test';

// Usa o Chrome instalado na máquina quando CHROME_PATH estiver definido;
// caso contrário, o Chromium do Playwright (npx playwright install chromium).
const executablePath = process.env.CHROME_PATH || undefined;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox'] } : {},
    viewport: { width: 1920, height: 1080 },
    hasTouch: true
  },
  webServer: {
    command: 'node scripts/serve.mjs 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true
  }
});
