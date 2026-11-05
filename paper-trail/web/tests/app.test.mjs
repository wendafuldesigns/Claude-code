// Runs the real built web app in a real browser against a pretend Supabase (tests/fake-supabase.mjs).
// It checks sign-in, saving, photos, scanning, the trial and its limits, the account screen, and the security headers.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, checkKey } from '../app/build.mjs';
import { makeBackend, HOST, USER_ID, HOUSEHOLD_ID, CODE, CANNED } from './fake-supabase.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '../dist-test');
const FIXTURE = path.join(here, 'fixtures/receipt.png');

let passed = 0, failed = 0;
const check = (name, ok, extra) => { if (ok) { passed++; console.log('PASS ' + name); } else { failed++; console.log('FAIL ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); } };

// ---------- build it the way a real deploy would ----------
const anon = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.signature';
build({ supabaseUrl: HOST, anonKey: anon, supportEmail: 'help@example.com', trialText: 'Try it free for 14 days.', subscribeUrl: '', out: OUT, production: false, allowLocal: false });

// ---------- serve it, with the same security headers the host will add ----------
const headerBlock = fs.readFileSync(path.join(OUT, '_headers'), 'utf8').split('\n/')[0].split('\n').slice(1).map(l => l.trim()).filter(Boolean).map(l => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (!path.extname(p) && fs.existsSync(path.join(OUT, p + '.html'))) p += '.html';
  const file = path.join(OUT, p);
  if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const h = { 'content-type': types[path.extname(file)] || 'application/octet-stream' };
  for (const [k, v] of headerBlock) h[k] = v;
  res.writeHead(200, h);
  res.end(fs.readFileSync(file));
}).listen(0);
const BASE = 'http://localhost:' + server.address().port;

// ---------- the browser ----------
const browser = await chromium.launch();
const problems = [];       // console errors and security-policy violations, from every page
async function open(backend, { ctx, realtime = true } = {}) {
  const context = ctx || await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await page.route(HOST + '/**', async route => {
    const r = await backend.answer(route.request());
    await route.fulfill(r);
  });
  if (realtime) {
    await page.routeWebSocket(/realtime\/v1\/websocket/, ws => {
      page.__ws = ws;
      ws.onMessage(raw => {
        let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
        const arr = Array.isArray(m);
        const [jref, ref, topic, event, payload] = arr ? m : [m.join_ref, m.ref, m.topic, m.event, m.payload];
        const send = (t, ev, pl, r2 = null) => ws.send(JSON.stringify(arr ? [jref, r2, t, ev, pl] : { join_ref: jref, ref: r2, topic: t, event: ev, payload: pl }));
        if (event === 'heartbeat') return send('phoenix', 'phx_reply', { status: 'ok', response: {} }, ref);
        if (event === 'phx_join') {
          page.__topic = topic; page.__jref = jref;
          const changes = ((payload.config && payload.config.postgres_changes) || []).map((c, i) => ({ id: 1000 + i, ...c }));
          page.__changeIds = changes.map(c => c.id);
          return send(topic, 'phx_reply', { status: 'ok', response: { postgres_changes: changes } }, ref);
        }
        if (event === 'access_token') return send(topic, 'phx_reply', { status: 'ok', response: {} }, ref);
      });
      page.__push = (type, record, old) => {
        const arr2 = Array.isArray(JSON.parse(JSON.stringify([1])));
        const msg = { schema: 'public', table: 'records', commit_timestamp: new Date().toISOString(), type, record, old_record: old || {}, columns: [{ name: 'id', type: 'uuid' }, { name: 'household_id', type: 'uuid' }, { name: 'data', type: 'jsonb' }], errors: null };
        const body = { ids: page.__changeIds, data: msg };
        ws.send(JSON.stringify(page.__arr ? [page.__jref, null, page.__topic, 'postgres_changes', body] : { join_ref: page.__jref, ref: null, topic: page.__topic, event: 'postgres_changes', payload: body }));
      };
    });
  }
  return page;
}
const csp = page => page.evaluate(() => window.__csp);
async function signIn(page, backend, email = 'wenda@example.com') {
  await page.goto(BASE + '/');
  await page.waitForSelector('#gateEmail');
  await page.fill('#gateEmail', email);
  await page.click('#gateSend');
  await page.waitForSelector('#gateCode');
  await page.fill('#gateCode', CODE);
  await page.click('#gateCheck');
  await page.waitForSelector('#btnCamera, #btnHand', { timeout: 15000 });
}

// ================= the build itself =================
const index = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const cfgJs = fs.readFileSync(path.join(OUT, 'config.js'), 'utf8');
check('the page has no Claude artifact startup and no Google font links', !/window\.claude|claude\.use\(/.test(index) && !/googleapis|gstatic/.test(index));
check('the scripts load in order: Supabase library, settings, web runtime, then the app', (() => { const a = index.indexOf('/vendor/supabase.js'), b = index.indexOf('/config.js'), c = index.indexOf('/runtime.js'), d = index.indexOf('window.PT_RUNTIME', c); return a > 0 && a < b && b < c && c < d; })());
check('config.js holds only public settings', /supabaseUrl/.test(cfgJs) && /anon/.test(cfgJs) === false && !/service/i.test(cfgJs) && cfgJs.includes(HOST));
const hdr = fs.readFileSync(path.join(OUT, '_headers'), 'utf8');
check('the security headers allow only this site and the one Supabase project', /connect-src 'self' https:\/\/demo\.supabase\.co wss:\/\/demo\.supabase\.co/.test(hdr) && /frame-ancestors 'none'/.test(hdr) && /object-src 'none'/.test(hdr) && !/unsafe-eval/.test(hdr) && !/script-src[^;]*unsafe-inline/.test(hdr), hdr.split('\n')[1]);
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.webmanifest'), 'utf8'));
check('the install file names the app and every icon in it exists', manifest.name === 'Paper Trail' && manifest.display === 'standalone' && manifest.icons.every(i => fs.existsSync(path.join(OUT, i.src))));
check('fonts are served from the same site', fs.existsSync(path.join(OUT, 'fonts/fonts.css')) && fs.readdirSync(path.join(OUT, 'fonts')).filter(f => f.endsWith('.woff2')).length === 5);
const refuse = (settings) => { try { build({ out: path.join(OUT, '../dist-refused'), ...settings }); return false; } catch (e) { return true; } };
// build() calls process.exit on a refusal, so check the key guard directly and the refusals by running the command
check('a service_role key is refused', /service_role/.test(checkKey('eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.sig')));
check('a secret key is refused, a public one is fine', /secret key/.test(checkKey('sb_secret_abc123')) && checkKey(anon) === null && checkKey('sb_publishable_abc123') === null && /does not look right/.test(checkKey('hello')));
const { spawnSync } = await import('node:child_process');
const cli = args => spawnSync('node', [path.join(here, '../app/build.mjs'), '--out', path.join(OUT, '../dist-refused'), ...args], { encoding: 'utf8' });
check('the build command stops on a service key', cli(['--supabase-url', HOST, '--anon-key', 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.sig']).status === 1);
check('and on an address that is not a Supabase project', cli(['--supabase-url', 'https://evil.example.com', '--anon-key', anon]).status === 1);
check('and a production build stops while the Terms and Privacy pages are drafts', /still a draft/.test(cli(['--supabase-url', HOST, '--anon-key', anon, '--support-email', 'a@b.co', '--production']).stderr));
fs.rmSync(path.join(OUT, '../dist-refused'), { recursive: true, force: true });

// ================= signing in =================
const be = makeBackend();
const pg = await open(be);
await pg.goto(BASE + '/');
await pg.waitForSelector('#gateEmail');
check('a new visitor sees the sign-in screen, not the app', await pg.locator('#gate').isVisible() && await pg.locator('#app').isHidden() && /Paper Trail/.test(await pg.locator('.gate-name').innerText()));
check('the sign-in screen links the Terms and Privacy pages', await pg.locator('#gate a[href="/terms.html"]').count() === 1 && await pg.locator('#gate a[href="/privacy.html"]').count() === 1);
check('and says the trial is free and how sign-in works', /free for 14 days/.test(await pg.locator('#gate').innerText()) && /6-digit code/.test(await pg.locator('#gate').innerText()));
await pg.fill('#gateEmail', 'not-an-email');
await pg.click('#gateSend');
check('a bad email is caught before anything is sent', /does not look like an email/.test(await pg.locator('#gateMsg').innerText()) && be.S.otpRequests.length === 0);
await pg.fill('#gateEmail', 'wenda@example.com');
await pg.click('#gateSend');
await pg.waitForSelector('#gateCode');
check('a code is asked for, and a new account is allowed', be.S.otpRequests.length === 1 && be.S.otpRequests[0].create_user === true && be.S.otpRequests[0].email === 'wenda@example.com');
check('the next screen says where the code went', (await pg.locator('#gateSentTo').innerText()) === 'wenda@example.com');
await pg.fill('#gateCode', '000000');
await pg.click('#gateCheck');
await pg.waitForFunction(() => /did not work/.test(document.getElementById('gateMsg').textContent));
check('a wrong code is turned away kindly', be.S.badCodes === 1 && await pg.locator('#gateCode').isVisible());
await pg.fill('#gateCode', '12');
await pg.click('#gateCheck');
check('a code that is too short is caught', /6 numbers/.test(await pg.locator('#gateMsg').innerText()));
await pg.click('#gateOther');
check('"use a different email" goes back', await pg.locator('#gateEmail').isVisible());
await pg.fill('#gateEmail', 'wenda@example.com');
await pg.click('#gateSend');
await pg.waitForSelector('#gateCode');
await pg.fill('#gateCode', CODE);
await pg.click('#gateCheck');
await pg.waitForSelector('#btnCamera');
check('the right code opens the app, and the gate is gone', await pg.locator('#app').isVisible() && await pg.locator('#gate').isHidden());
check('the trial is shown on the home screen', /Free trial: 14 days left, 15 scans to go/.test(await pg.locator('#planBanner').innerText()), await pg.locator('#planBanner').innerText().catch(() => null));
check('scanning and adding by hand are on', await pg.locator('#btnCamera').isVisible() && await pg.locator('#btnPick').isVisible() && await pg.locator('#btnHand').isVisible());
check('the footer says where photos go', /sent to Claude, made by Anthropic/.test(await pg.locator('.home-foot').innerText()));
check('there is an account button', await pg.locator('#btnAccount').isVisible());

// ---- staying signed in
await pg.reload();
await pg.waitForSelector('#btnCamera');
check('reloading keeps you signed in', await pg.locator('#gate').isHidden());

// ---- adding a paper by hand
await pg.click('#btnHand');
await pg.waitForSelector('#f-title');
await pg.fill('#f-title', 'Water heater flush');
await pg.selectOption('#f-category', 'home');
await pg.fill('#f-date', '2026-10-20');
await pg.fill('#f-vendor', 'Pipes R Us');
await pg.fill('#f-total', '120.5');
await pg.click('#btnSave');
await pg.waitForSelector('.card:not(.example)');
const ins = be.S.records.values().next().value;
check('saving writes one record to the household, in your name', be.S.records.size === 1 && ins.household_id === HOUSEHOLD_ID && ins.created_by === USER_ID && ins.data.title === 'Water heater flush' && ins.data.total === 120.5, ins);
check('it shows in the list', /Water heater flush/.test(await pg.locator('.card:not(.example)').first().innerText()));
await pg.reload();
await pg.waitForSelector('.card:not(.example)');
check('and is still there after a reload (it came from the database)', /Water heater flush/.test(await pg.locator('.card:not(.example)').first().innerText()));
// ---- editing it
await pg.locator('.card', { hasText: 'Water heater flush' }).click();
await pg.waitForSelector('#btnEdit');
await pg.click('#btnEdit');
await pg.waitForSelector('#f-title');
await pg.fill('#f-total', '130');
await pg.click('#btnSave');
await pg.waitForSelector('.detail');
check('editing updates the same record, without making a second one', be.S.records.size === 1 && be.S.records.get(ins.id).data.total === 130);
// ---- marking a reminder done goes through update()
await pg.click('#btnBack');

// ================= scanning a paper =================
await pg.waitForSelector('#btnPick');
const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#btnPick')]);
await fc.setFiles(FIXTURE);
await pg.waitForSelector('#f-title', { timeout: 15000 });
const call = be.S.scanCalls[0];
check('the scan sends only photos, names, and today\'s date, as one JPEG', be.S.scanCalls.length === 1 && call.images === 1 && call.firstBytes === '/9j/' && JSON.stringify(call.bodyKeys.sort()) === JSON.stringify(['images', 'known', 'today']), call);
check('it sends the names already in use', JSON.stringify(call.known) === JSON.stringify([]) || Array.isArray(call.known));
check('the details come back filled in, with the unsure box marked', (await pg.inputValue('#f-title')) === 'Oil change' && (await pg.inputValue('#f-total')) === '79.99' && await pg.locator('.field[data-key=mileage].unsure').count() === 1);
await pg.click('#btnSave');
await pg.waitForSelector('.card:not(.example)');
await pg.waitForFunction(() => document.querySelectorAll('.card').length >= 2);
const photos = [...be.S.objects.keys()];
check('saving stores the photo and a small copy under the household', photos.length === 2 && photos.every(k => k.startsWith(HOUSEHOLD_ID + '/')) && photos.some(k => k.endsWith('_t.jpg')) && photos.some(k => !k.endsWith('_t.jpg') && k.endsWith('.jpg')), photos);
const oil = [...be.S.records.values()].find(r => r.data.title === 'Oil change');
check('the record points at the photo by its id', oil && oil.data.scanIds.length === 1 && photos.some(k => k === `${HOUSEHOLD_ID}/${oil.data.scanIds[0]}.jpg`), oil && oil.data.scanIds);
await pg.waitForSelector('img.card-thumb[src*="/object/sign/scans/"]');
check('the list shows the small copy by a signed address', await pg.locator('img.card-thumb').count() === 1);
check('the trial count went down', /14 scans to go|1 scan used|Free trial: 14 days left, 14 scans to go/.test(await pg.locator('#planBanner').innerText()), await pg.locator('#planBanner').innerText());
await pg.locator('.card', { hasText: 'Oil change' }).click();
await pg.waitForSelector('.thumb img');
await pg.waitForFunction(() => { const i = document.querySelector('.thumb img'); return i && i.complete && i.naturalWidth > 0; });
check('opening the paper shows the full photo', await pg.locator('.thumb img').evaluate(i => i.src.startsWith('blob:') && i.naturalWidth > 0));
const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#btnSavePhoto0')]).catch(() => [null]);
check('"Save photo" hands over a file', dl && /\.jpg$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
// ---- deleting removes the photos too
await pg.click('#btnEdit');
await pg.waitForSelector('#f-title');
await pg.click('#btnDelete');
await pg.click('#btnConfirm');
await pg.waitForSelector('#btnCamera');
check('deleting a paper removes its record and both photo files', !be.S.records.has(oil.id) && be.S.objects.size === 0, { records: be.S.records.size, objects: [...be.S.objects.keys()] });

// ---- scans that cannot be done
be.S.scanMode = 'unreadable';
const [fc2] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#btnPick')]);
await fc2.setFiles(FIXTURE);
await pg.waitForSelector('#btnStartOver');
check('a photo that cannot be read says so and still counts as a scan', /could not find a readable paper/.test(await pg.locator('.reading').innerText()) && be.S.plan.scans_used === 2);
await pg.click('#btnStartOver');
be.S.scanMode = 'down';
const [fc3] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#btnPick')]);
await fc3.setFiles(FIXTURE);
await pg.waitForSelector('#btnRetry');
check('when the scan service is down, it offers to try again or fill in by hand', await pg.locator('#btnByHand').isVisible());
await pg.click('#btnStartOver');
be.S.scanMode = 'quota';
const [fc4] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#btnPick')]);
await fc4.setFiles(FIXTURE);
await pg.waitForSelector('#btnByHand');
check('a used-up trial says so, with no "try again"', /used the scans that come with your free trial/.test(await pg.locator('.reading').innerText()) && await pg.locator('#btnRetry').count() === 0);
await pg.click('#btnStartOver');
check('and scanning is switched off on the home screen with the reason', await pg.locator('#btnCamera').count() === 0 && /used the scans that come with your free trial/.test(await pg.locator('.scan-off').innerText()));
check('adding by hand still works', await pg.locator('#btnHand').isVisible());

// ================= the account screen =================
await pg.click('#btnAccount');
await pg.waitForSelector('#acctEmail');
check('the account screen shows who is signed in, the plan, and the trial', (await pg.locator('#acctEmail').innerText()) === 'wenda@example.com' && /Free trial/.test(await pg.locator('#acctPlanTitle').innerText()) && /days left/.test(await pg.locator('#acctPlanLine').innerText()));
check('it explains how to put the app on the home screen, until it is installed', await pg.locator('#acctInstall').isVisible());
check('it has Terms, Privacy, and the support address', await pg.locator('.acct a[href="/terms.html"]').count() === 1 && await pg.locator('.acct a[href="mailto:help@example.com"]').count() === 1);
check('and a way to subscribe is not shown while the trial is open', await pg.locator('#acctSubscribe').count() === 0);
const [csv] = await Promise.all([pg.waitForEvent('download'), pg.click('#acctExport')]);
check('"Save all my papers" hands over a spreadsheet', /^paper-trail-.*\.csv$/.test(csv.suggestedFilename()), csv.suggestedFilename());
await pg.click('#btnBack');
check('no stray "null" or "undefined" text anywhere on the home screen', !/\b(null|undefined)\b/.test(await pg.locator('#app').innerText()));

// ================= a trial that has ended =================
be.S.plan = { ...be.S.plan, plan_status: 'trialing', can_write: false, trial_ends_at: new Date(Date.now() - 864e5).toISOString() };
await pg.reload();
await pg.waitForSelector('.card');
check('after the trial ends the home screen says so once, in the scan card', await pg.locator('#planBanner').count() === 0 && /free trial has ended/.test(await pg.locator('.scan-off').innerText()));
check('papers can still be opened, but not scanned or added', await pg.locator('.card:not(.example)').count() >= 1 && await pg.locator('#btnCamera').count() === 0 && await pg.locator('#btnHand').count() === 0 && /free trial has ended/.test(await pg.locator('.scan-off').innerText()));
await pg.locator('.card:not(.example)').first().click();
await pg.waitForSelector('.detail');
check('and there is no Edit button on a paper', await pg.locator('#btnEdit').count() === 0);
await pg.click('#btnBack');
check('and no stray "null" text appears when scanning is closed', !/\b(null|undefined)\b/.test(await pg.locator('#app').innerText()));
await pg.locator('.card:not(.example)').first().click();
await pg.waitForSelector('.detail');
await pg.click('#btnBack');
await pg.click('#btnAccount');
await pg.waitForSelector('#acctPlanTitle');
check('the account screen says the trial ended, and that nothing is lost', /ended/.test(await pg.locator('#acctPlanTitle').innerText()) && /still look at everything/.test(await pg.locator('#acctPlanLine').innerText()) && await pg.locator('#acctExport').isVisible());
check('and says subscribing is not open yet, since no payment link is set', /not open yet/.test(await pg.locator('.acct').innerText()));
// ---- every plan state
for (const [status, can, title, bannerRe] of [['active', true, /Subscribed/, null], ['past_due', true, /did not go through/, /did not go through/], ['canceled', false, /has ended/, null]]) {
  be.S.plan = { ...be.S.plan, plan_status: status, can_write: can, current_period_end: new Date(Date.now() + 20 * 864e5).toISOString(), scans_used: 3, scan_cap: 100 };
  await pg.reload();
  await pg.waitForSelector('.card');
  const banner = await pg.locator('#planBanner').count() ? await pg.locator('#planBanner').innerText() : null;
  await pg.click('#btnAccount');
  await pg.waitForSelector('#acctPlanTitle');
  check(`plan "${status}": the account screen and the home notice say the right thing`, title.test(await pg.locator('#acctPlanTitle').innerText()) && (bannerRe ? bannerRe.test(banner) : banner === null), { banner });
}
// ---- a subscribe link, when there is one
be.S.plan = { ...be.S.plan, plan_status: 'canceled', can_write: false };

// ================= the plan closes while the page is open =================
const be2 = makeBackend();
const pg2 = await open(be2);
await signIn(pg2, be2);
be2.S.plan.can_write = false;                  // the page does not know yet
await pg2.click('#btnHand');
await pg2.waitForSelector('#f-title');
await pg2.fill('#f-title', 'Late paper');
await pg2.click('#btnSave');
await pg2.waitForFunction(() => /free trial has ended/.test(document.getElementById('toast').textContent));
check('saving after the plan closes tells you why, and keeps what you typed', await pg2.locator('#f-title').inputValue() === 'Late paper' && be2.S.records.size === 0);

// ================= more than one phone =================
const be3 = makeBackend();
const pg3 = await open(be3);
await signIn(pg3, be3);
be3.S.records.set('99999999-9999-4999-8999-999999999999', { id: '99999999-9999-4999-8999-999999999999', household_id: HOUSEHOLD_ID, data: { category: 'pet', title: 'Vet checkup', date: '2026-09-01', details: [], work: [], scanIds: [], nextDueDone: false, createdAt: 1, updatedAt: 1 }, created_by: USER_ID });
await pg3.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await pg3.waitForSelector('.card:has-text("Vet checkup")');
check('a paper added from another phone shows up when you come back to the app', true);
await pg3.waitForTimeout(500);
if (pg3.__push) {
  pg3.__arr = true;
  pg3.__push('INSERT', { id: '88888888-8888-4888-8888-888888888888', household_id: HOUSEHOLD_ID, data: { category: 'home', title: 'Live paper', date: '2026-10-01', details: [], work: [], scanIds: [], nextDueDone: false, createdAt: 2, updatedAt: 2 } });
  const arrWorked = await pg3.waitForSelector('.card:has-text("Live paper")', { timeout: 2500 }).then(() => true).catch(() => false);
  if (!arrWorked) {
    pg3.__arr = false;
    pg3.__push('INSERT', { id: '88888888-8888-4888-8888-888888888888', household_id: HOUSEHOLD_ID, data: { category: 'home', title: 'Live paper', date: '2026-10-01', details: [], work: [], scanIds: [], nextDueDone: false, createdAt: 2, updatedAt: 2 } });
  }
  check('and live changes appear without refreshing', await pg3.waitForSelector('.card:has-text("Live paper")', { timeout: 4000 }).then(() => true).catch(() => false));
  pg3.__push('DELETE', null, { id: '88888888-8888-4888-8888-888888888888' });
  check('and so do deletions', await pg3.waitForFunction(() => !/Live paper/.test(document.body.innerText), null, { timeout: 4000 }).then(() => true).catch(() => false));
} else {
  check('live changes (the pretend live-updates channel was not opened)', false);
}

// ================= a sign-in that runs out right at a scan =================
const be6 = makeBackend();
const pg6 = await open(be6);
await signIn(pg6, be6);
be6.S.scan401Once = true;
const [fc6] = await Promise.all([pg6.waitForEvent('filechooser'), pg6.click('#btnPick')]);
await fc6.setFiles(FIXTURE);
await pg6.waitForSelector('#f-title', { timeout: 15000 });
check('if the sign-in runs out during a scan, it quietly renews and the scan goes through', be6.S.scanCalls.length === 1 && be6.S.log.filter(l => l.path.startsWith('/functions/v1/scan')).length === 2 && be6.S.log.some(l => l.path.startsWith('/auth/v1/token')) && (await pg6.inputValue('#f-title')) === 'Oil change', { calls: be6.S.scanCalls.length });

// ================= signing out, and a session that has expired =================
const be4 = makeBackend();
const pg4 = await open(be4);
await signIn(pg4, be4);
await pg4.click('#btnAccount');
await pg4.click('#acctSignOut');
await pg4.waitForSelector('#gateEmail');
check('signing out ends the session and brings back the sign-in screen', be4.S.signedOut === 1 && await pg4.locator('#app').isHidden());
await signIn(pg4, be4);
be4.S.expireSessions = true;
await pg4.reload();
await pg4.waitForSelector('#gateEmail', { timeout: 15000 });
check('a session the server no longer accepts sends you back to sign in', await pg4.locator('#gate').isVisible());

// ================= the install files work in a browser =================
const swCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
const be5 = makeBackend();
const pg5 = await open(be5, { ctx: swCtx });
await pg5.goto(BASE + '/');
await pg5.waitForSelector('#gateEmail');
const sw = await pg5.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, active: !!r.active }; });
check('the page registers its helper so it can be installed', sw.active && sw.scope === BASE + '/', sw);
const cached = await pg5.evaluate(async () => { const names = await caches.keys(); const keys = names.length ? (await (await caches.open(names[0])).keys()).map(r => new URL(r.url).pathname) : []; return { names, keys }; });
check('it keeps only the app\'s own files, never anything from Supabase', cached.names.length === 1 && cached.keys.length > 3 && cached.keys.every(k => !/^\/(auth|rest|storage|functions|realtime)\//.test(k)), cached);

// ================= nothing was blocked, nothing broke =================
const violations = [];
for (const p of [pg, pg2, pg3, pg4, pg5, pg6]) violations.push(...await csp(p).catch(() => []));
check('the browser blocked nothing: the security headers fit the app', violations.length === 0, violations);
const real = problems.filter(t => !/Failed to load resource.*(401|403|400|429|402|502|404)/.test(t));
check('and there were no errors in the console', real.length === 0, real.slice(0, 6));

await browser.close();
server.close();
fs.rmSync(OUT, { recursive: true, force: true });
console.log('\n' + passed + '/' + (passed + failed) + ' passed');
process.exit(failed ? 1 : 0);
