// Builds the six "method" graphics as PNGs (1080x1350, exported at 2x = 2160x2700).
// Run from the project folder:  node wendaful-method-graphics/build.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const FONT_DIR = path.join(__dirname, 'fonts');

// Wendaful Elevate palette
const C = {
  evergreen: '#54645b',
  sage: '#94a69c',
  lightSage: '#dadfdc',
  charcoal: '#373a40',
  gray: '#545454',
  warm: '#dfdad4',
  bg: '#faf5f0',
  white: '#ffffff',
};

const METHODS = [
  {
    file: '01-the-night-before-method',
    title: 'Night Before',
    bullets: [
      'Plan tomorrow before bed',
      'Schedule first, tasks fill in around it',
      'Wake up already knowing the plan',
    ],
  },
  {
    file: '02-the-one-job-method',
    title: 'One Job',
    bullets: [
      'Give every tool one job',
      'Calendar = appointments',
      'Planner = tasks and brain dumps',
      'Nothing gets planned in two places',
    ],
  },
  {
    file: '03-the-top-3-method',
    title: 'Top 3',
    bullets: [
      'Pick 3 things that matter today',
      'Everything else is a bonus',
      'Done with 3? That’s a good day',
    ],
  },
  {
    file: '04-the-brain-dump-method',
    title: 'Brain Dump',
    bullets: [
      'Write down everything in your head',
      'Sort it later',
      'Your brain stops holding it all',
    ],
  },
  {
    file: '05-the-sunday-reset-method',
    title: 'Sunday Reset',
    bullets: [
      '15 minutes once a week',
      'Look back, look ahead',
      'Pick your top 3 for the week',
    ],
  },
  {
    file: '06-the-reset-dont-restart-method',
    title: 'Reset Don’t Restart',
    bullets: [
      'Missed a few days? Skip the blank pages',
      'Pick up on today',
      'No new planner needed',
    ],
  },
];

const fontFace = [400, 500, 600, 700]
  .map((w) => {
    const b64 = fs
      .readFileSync(path.join(FONT_DIR, `instrument-sans-latin-${w}-normal.woff2`))
      .toString('base64');
    return `@font-face{font-family:'Instrument Sans';font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  })
  .join('\n');

const check =
  '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#54645b" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 12.8l4.2 4.2L18.5 7.8"/></svg>';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function html(m) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace}
:root{--evergreen:${C.evergreen};--sage:${C.sage};--light-sage:${C.lightSage};--charcoal:${C.charcoal};--gray:${C.gray};--warm:${C.warm};--bg:${C.bg};--white:${C.white}}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1350px;background:var(--bg);font-family:'Instrument Sans',sans-serif;color:var(--charcoal);position:relative;overflow:hidden;-webkit-font-smoothing:antialiased}
.blob{position:absolute;border-radius:50%}
.b1{width:640px;height:640px;top:-250px;right:-210px;background:var(--light-sage);opacity:.75}
.b2{width:520px;height:520px;bottom:-250px;left:-200px;background:var(--warm);opacity:.6}
.wrap{position:relative;height:100%;padding:90px 72px 76px;display:flex;flex-direction:column}
.main{flex:1;display:flex;flex-direction:column;justify-content:center}
.kicker{font-size:34px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;color:var(--gray)}
h1{font-size:132px;font-weight:700;color:var(--evergreen);letter-spacing:-.025em;line-height:1.03;margin:20px 0 24px;text-wrap:balance}
.card{margin-top:60px;background:var(--white);border:2px solid var(--warm);border-radius:40px;padding:56px 52px}
ul{list-style:none;display:flex;flex-direction:column;gap:36px}
li{display:flex;gap:26px;align-items:flex-start;font-size:46px;font-weight:500;line-height:1.22;letter-spacing:-.005em}
li span:last-child{text-wrap:balance}
.box{flex:none;width:52px;height:52px;border-radius:15px;background:var(--light-sage);display:grid;place-items:center;margin-top:2px}
.foot{text-align:center;font-size:30px;font-weight:500;letter-spacing:.06em;color:var(--evergreen)}
</style></head><body>
<div class="blob b1"></div><div class="blob b2"></div>
<div class="wrap">
  <div class="main">
    <div class="kicker">The</div>
    <h1>${esc(m.title)}</h1>
    <div class="kicker">Method</div>
    <div class="card"><ul>
      ${m.bullets.map((b) => `<li><span class="box">${check}</span><span>${esc(b)}</span></li>`).join('\n      ')}
    </ul></div>
  </div>
  <div class="foot">@wendafulplanning</div>
</div>
</body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  for (const m of METHODS) {
    await page.setContent(html(m), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const ok = await page.evaluate(
      () => document.fonts.check("700 132px 'Instrument Sans'") && document.fonts.check("500 46px 'Instrument Sans'")
    );
    if (!ok) throw new Error('Instrument Sans did not load');
    // Real content check (the decorative circles bleed off the edge on purpose).
    const fit = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { top: r('.kicker').top, gap: r('.foot').top - r('.card').bottom };
    });
    if (fit.top < 60 || fit.gap < 40) console.warn(`WARNING: ${m.file} is too tight`, fit);
    else console.log(`${m.file}: ok (top ${Math.round(fit.top)}px, gap to footer ${Math.round(fit.gap)}px)`);
    await page.screenshot({ path: path.join(OUT, `${m.file}.png`) });
    console.log('wrote', `${m.file}.png`);
  }
  await browser.close();
})();
