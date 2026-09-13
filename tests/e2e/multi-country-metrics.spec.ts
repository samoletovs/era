import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const baseUrl = process.env.ERA_E2E_BASE_URL || 'http://127.0.0.1:5173';
const storageKey = 'era_multiCountryDashboardMetrics_v1';

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

async function mockReports(context: BrowserContext) {
  await context.route('https://**/*', (route) => route.abort());
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path === '/api/companies') {
      data = [
        { id: 'lv', code: 'LV', name: 'Latvia test', country: 'LV', currency: 'EUR' },
        { id: 'ee', code: 'EE', name: 'Estonia test', country: 'EE', currency: 'EUR' },
      ];
    } else if (path === '/api/rules') {
      data = [];
    } else if (path.endsWith('/reports/profit-loss')) {
      data = { totalRevenue: 100, totalExpenses: 40, netProfit: 60 };
    } else if (path.endsWith('/reports/balance-sheet')) {
      data = { totalAssets: 500 };
    } else {
      throw new Error(`Unexpected API request: ${path}`);
    }
    await route.fulfill({ json: { data, error: null } });
  });
}

async function openDashboard(page: Page) {
  await page.goto(`${baseUrl}/reports`);
  await page.getByRole('button', { name: 'Multi-country overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Multi-country overview/ })).toBeVisible();
  await page.getByRole('button', { name: 'Customize metrics', exact: true }).click();
}

test.beforeEach(async ({ context }) => {
  await mockReports(context);
});

test('keeps the selected financial metrics in a new browser session', async ({
  page,
  context,
  browser,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openDashboard(page);
  const metrics = page.getByRole('region', { name: 'Dashboard metrics', exact: true });
  await expect(metrics.locator('.label')).toHaveText([
    'Countries',
    'Companies',
    'Consolidated revenue',
    'Consolidated net profit',
  ]);
  await page.getByRole('checkbox', { name: 'Countries', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Companies', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Net profit', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Expenses', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Assets', exact: true }).check();
  await expect(metrics.locator('.label')).toHaveText([
    'Consolidated revenue',
    'Consolidated expenses',
    'Consolidated assets',
  ]);
  await expect(metrics.locator('.value')).toHaveText(['€200,00', '€80,00', '€1 000,00']);
  await expect(page.getByRole('cell', { name: 'Total LV', exact: true })).toBeVisible();
  await metrics.screenshot({ path: testInfo.outputPath('desktop-metrics.png') });
  expect(pageErrors).toEqual([]);

  const savedState = await context.storageState();
  await page.close();
  const nextSession = await browser.newContext({ storageState: savedState });
  try {
    await mockReports(nextSession);
    const returningPage = await nextSession.newPage();
    await openDashboard(returningPage);
    await expect(
      returningPage
        .getByRole('region', { name: 'Dashboard metrics', exact: true })
        .locator('.label'),
    ).toHaveText(['Consolidated revenue', 'Consolidated expenses', 'Consolidated assets']);
    await expect(
      returningPage.getByRole('checkbox', { name: 'Countries', exact: true }),
    ).not.toBeChecked();
  } finally {
    await nextSession.close();
  }
});

test('keeps at least one metric selected and explains the constraint', async ({ page }) => {
  await openDashboard(page);
  for (const name of ['Countries', 'Companies', 'Net profit']) {
    await page.getByRole('checkbox', { name, exact: true }).uncheck();
  }
  const revenue = page.getByRole('checkbox', { name: 'Revenue', exact: true });
  await expect(revenue).toBeChecked();
  await expect(revenue).toBeDisabled();
  await expect(revenue).toHaveAccessibleDescription(/Keep at least one metric selected/);
});

test('reset deletes the saved preference and restores defaults after reload', async ({ page }) => {
  await openDashboard(page);
  await page.getByRole('checkbox', { name: 'Assets', exact: true }).check();
  await page.getByRole('button', { name: 'Reset to defaults', exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  await openDashboard(page);
  await expect(
    page.getByRole('region', { name: 'Dashboard metrics', exact: true }).locator('.label'),
  ).toHaveText(['Countries', 'Companies', 'Consolidated revenue', 'Consolidated net profit']);
});

test('invalid saved data shows defaults with a visible warning', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, '["unsupported"]'), storageKey);
  await openDashboard(page);
  await expect(page.getByRole('status')).toContainText('Saved metric choices were invalid');
  await expect(
    page.getByRole('region', { name: 'Dashboard metrics', exact: true }).locator('.label'),
  ).toHaveCount(4);
});

test('failed storage writes keep controls usable without claiming to save', async ({ page }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage is full', 'QuotaExceededError');
      original.call(this, name, value);
    };
  }, storageKey);
  await openDashboard(page);
  await page.getByRole('checkbox', { name: 'Assets', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: 'Assets', exact: true })).toBeChecked();
  await expect(page.getByRole('status')).toContainText('could not be saved');
});

test('blocked preference reads show defaults and an explicit warning', async ({ page }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (name) {
      if (name === key) throw new DOMException('Storage denied', 'SecurityError');
      return original.call(this, name);
    };
  }, storageKey);
  await openDashboard(page);
  await expect(page.getByRole('status')).toContainText('could not be read');
  await expect(
    page.getByRole('region', { name: 'Dashboard metrics', exact: true }).locator('.label'),
  ).toHaveCount(4);
});

test('metric controls work by keyboard on a phone-sized viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openDashboard(page);
  const assets = page.getByRole('checkbox', { name: 'Assets', exact: true });
  await assets.focus();
  await page.keyboard.press('Space');
  await expect(assets).toBeChecked();
  const panel = page.getByRole('group', { name: 'Visible metrics' });
  const box = await panel.boundingBox();
  if (!box) throw new Error('Metric controls are not visible');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await panel.screenshot({ path: testInfo.outputPath('mobile-metrics.png') });
});
