// Starting point for driving ImageLab in headless Chromium (see SKILL.md).
// Copy it to the scratchpad, adapt the middle part, and run:
//   node drive.mjs <app url> <screenshot dir>
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(import.meta.dirname, '../../..');
const { chromium } = await import(pathToFileURL(`${repo}/node_modules/playwright/index.mjs`).href);
const [url = 'http://localhost:4377/', out = '.'] = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
page.on('pageerror', (e) => problems.push(String(e)));
await page.goto(url);

// A synthetic image, drawn in the page: a blue disc on white.
const png = await page.evaluate(async () => {
  const canvas = new OffscreenCanvas(300, 200);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 300, 200);
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.arc(150, 100, 70, 0, Math.PI * 2);
  ctx.fill();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return [...new Uint8Array(await blob.arrayBuffer())];
});
await page.setInputFiles('input[type=file]', {
  name: 'disc.png',
  mimeType: 'image/png',
  buffer: Buffer.from(png),
});
await page.waitForFunction(() => !document.body.innerText.includes('Reading'));

// --- adapt from here -------------------------------------------------------
const addStep = (title) => page.selectOption('select[aria-label="Add a step"]', { label: title });
await addStep('Remove background');
await addStep('Convert format');
await page.waitForTimeout(1000); // let the preview render
await page.screenshot({ path: `${out}/1-chain.png`, fullPage: true });

await page.click('button.primary');
await page.waitForFunction(() =>
  /^\d+\s+results?/.test(document.querySelector('.summary')?.textContent?.trim() ?? ''),
);
const results = await page.$$eval('.grid li', (items) => items.map((li) => li.innerText));
await page.screenshot({ path: `${out}/2-results.png`, fullPage: true });
// --- to here ---------------------------------------------------------------

console.log(JSON.stringify({ results, problems }, null, 2));
await browser.close();
