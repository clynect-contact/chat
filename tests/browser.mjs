import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
const require = createRequire(import.meta.url);
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
  headless: true,
});
const context = await browser.newContext({
  locale: 'fr-FR',
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = process.env.TEST_BASE_URL ?? 'http://localhost:3001';
await page.goto(base);
await page.getByRole('button', { name: 'Je recrute un talent IT' }).waitFor();
await page.waitForFunction(
  () => !document.querySelector('.intent-card')?.disabled,
);
await mkdir('outputs', { recursive: true });
const widths = [320, 375, 768, 1024, 1440];
const responsive = [];
for (const width of widths) {
  await page.setViewportSize({ width, height: 950 });
  await page.screenshot({
    path: `outputs/welcome-${width}.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(overflow, false, `welcome overflow at ${width}`);
  responsive.push({ width, welcome: 'pass' });
}
await page.setViewportSize({ width: 1440, height: 1000 });
await page.getByRole('button', { name: 'Je recrute un talent IT' }).click();
await page.getByRole('button', { name: 'Essayer un exemple fictif' }).click();
await page
  .getByText('Les informations essentielles sont renseignées.', {
    exact: false,
  })
  .waitFor({ timeout: 15000 });
await page
  .getByRole('button', { name: 'Enregistrer le brouillon privé', exact: true })
  .click();
await page
  .getByRole('button', { name: 'Continuer en session de démonstration' })
  .click();
await page
  .getByRole('button', { name: 'Brouillon enregistré', exact: true })
  .waitFor();
await page.reload();
await page
  .getByRole('button', { name: 'Brouillon enregistré', exact: true })
  .waitFor();
for (const width of widths) {
  await page.setViewportSize({ width, height: 950 });
  await page.screenshot({
    path: `outputs/conversation-${width}.png`,
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    `chat overflow at ${width}`,
  );
}
await page.setViewportSize({ width: 375, height: 850 });
await page
  .getByRole('button', { name: 'Voir le brouillon', exact: true })
  .click();
await page.getByRole('dialog').waitFor();
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
await page.keyboard.press('Escape');
await page.getByRole('dialog').waitFor({ state: 'hidden' });
await page.setViewportSize({ width: 1440, height: 1000 });
await page
  .getByRole('button', { name: 'Nouvelle conversation', exact: true })
  .first()
  .focus();
await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Je cherche une mission' }).focus();
await page.keyboard.press('Enter');
await page
  .getByRole('main')
  .getByText('Nouveau profil', { exact: true })
  .waitFor();
await page.waitForFunction(
  () =>
    !document.querySelector('button[aria-label="Joindre un document"]')
      ?.disabled,
);
await page.getByRole('button', { name: 'Joindre un document' }).focus();
await page.keyboard.press('Enter');
await page.getByRole('dialog').waitFor();
await page.getByRole('checkbox').focus();
await page.keyboard.press('Space');
const cv = zipSync({
  '[Content_Types].xml': strToU8('<Types/>'),
  'word/document.xml': strToU8(
    '<w:document><w:p><w:r><w:t>Développeur Java senior à Paris. 9 ans d’expérience. Java, Spring Boot, Kafka, AWS. Remote. Disponible immédiatement. Minimum 580, cible 620 EUR. Visibilité confidentiel.</w:t></w:r></w:p></w:document>',
  ),
});
await page
  .locator('input[type=file]')
  .setInputFiles({
    name: 'fictional-cv.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(cv),
  });
await page.getByRole('dialog').waitFor({ state: 'hidden' });
await page.getByRole('textbox', { name: 'Votre message' }).focus();
await page.keyboard.press('Enter');
await page
  .getByText('Les informations essentielles sont renseignées.', {
    exact: false,
  })
  .waitFor();
await page
  .getByRole('button', { name: 'Enregistrer le brouillon privé', exact: true })
  .focus();
await page.keyboard.press('Enter');
await page
  .getByRole('button', { name: 'Brouillon enregistré', exact: true })
  .waitFor();
await page.route(
  '**/api/copilot/respond',
  (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'PROVIDER_FAILURE' }),
    }),
  { times: 1 },
);
await page
  .getByRole('textbox', { name: 'Votre message' })
  .fill('TJM minimum 600');
await page.keyboard.press('Enter');
await page.getByRole('alert').waitFor();
assert.equal(
  await page.getByRole('textbox', { name: 'Votre message' }).inputValue(),
  'TJM minimum 600',
);
await expect(page.getByRole('button',{name:'Réessayer',exact:true})).toBeEnabled();
await page.getByRole('button', { name: 'Réessayer', exact: true }).focus();
await page.keyboard.press('Enter');
await page.waitForFunction(() => !document.querySelector('.tool-progress'));
await page
  .getByRole('button', { name: 'Enregistrer le brouillon privé', exact: true })
  .waitFor();
await page.screenshot({ path: 'outputs/profile-1440.png', fullPage: true });
await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
const accessibility = await page.evaluate(
  async () =>
    await window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
      },
    }),
);
assert.equal(
  accessibility.violations.length,
  0,
  JSON.stringify(
    accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ),
);
await writeFile(
  'outputs/browser-report.json',
  JSON.stringify(
    {
      responsive,
      errors,
      accessibility: accessibility.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => n.target),
      })),
    },
    null,
    2,
  ),
);
assert.equal(errors.length, 0, errors.join('\n'));
await browser.close();
console.log(
  'PASS: mission and DOCX profile UI, keyboard controls, private saves, reload, failure retry, five responsive widths, mobile review and zero accessibility violations.',
);
