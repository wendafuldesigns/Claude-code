// Draws the app icons from the logo. Run once (needs Playwright), then commit the pictures in static/icons.
// Usage: node app/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'static/icons');
fs.mkdirSync(out, { recursive: true });

// the same drawing as the logo in the app: an evergreen square with a cream page
const mark = (rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <rect width="40" height="40" rx="${rounded ? 11 : 0}" fill="#54645b"/>
  <path d="M12.5 9.5h10.2l6 6V29a2 2 0 0 1-2 2H12.5a2 2 0 0 1-2-2V11.5a2 2 0 0 1 2-2z" fill="#fdfff0"/>
  <path d="M22.7 9.5v6h6z" fill="#94a69c"/>
  <path d="M14.6 20.4h9.8M14.6 24.4h6" stroke="#54645b" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>`;
fs.writeFileSync(path.join(out, 'icon.svg'), mark(true));

const browser = await chromium.launch();
async function png(file, size, svg, scale = 1) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // a maskable icon keeps the picture inside the middle 80%, so a phone can crop the corners
  const inner = Math.round(size * scale), pad = Math.round((size - inner) / 2);
  await page.setContent(`<body style="margin:0;background:#54645b"><div style="position:absolute;left:${pad}px;top:${pad}px;width:${inner}px;height:${inner}px">${svg}</div></body>`);
  await page.locator('svg').evaluate((el, n) => { el.setAttribute('width', n); el.setAttribute('height', n); }, inner);
  await page.screenshot({ path: path.join(out, file), omitBackground: false });
  await page.close();
}
await png('icon-192.png', 192, mark(false));
await png('icon-512.png', 512, mark(false));
await png('icon-maskable-512.png', 512, mark(false), 0.8);
await png('apple-touch-icon.png', 180, mark(false));
await browser.close();
console.log(fs.readdirSync(out).join('\n'));
