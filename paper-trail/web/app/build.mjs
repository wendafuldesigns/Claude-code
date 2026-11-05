// Builds the web app into dist/, a plain folder you can drop on Netlify or Cloudflare Pages.
//
//   node app/build.mjs --supabase-url https://abcd1234.supabase.co --anon-key <the anon or publishable key> --support-email you@example.com
//   node app/build.mjs --production ...      refuses to build while the Terms and Privacy pages are still drafts
//   node app/build.mjs --billing --plan-text "$6 a month" ...   shows the Subscribe and Manage buttons (needs the billing service set up)
//
// The same values can come from a .env file next to package.json (SUPABASE_URL, SUPABASE_ANON_KEY, SUPPORT_EMAIL).
// Only PUBLIC values go in. The anon key is meant to be public; the database rules protect each family's papers.
// The build stops if it is handed a secret key by mistake.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const APP_FILE = path.join(root, '../paper-trail.html');

// ---------- settings ----------
function readEnvFile() {
  const f = path.join(root, '.env');
  const out = {};
  if (!fs.existsSync(f)) return out;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const arg = n => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
const env = { ...readEnvFile(), ...process.env };

export function buildSettings() {
  return {
    supabaseUrl: (arg('supabase-url') || env.SUPABASE_URL || '').replace(/\/+$/, ''),
    anonKey: arg('anon-key') || env.SUPABASE_ANON_KEY || '',
    supportEmail: arg('support-email') || env.SUPPORT_EMAIL || '',
    trialText: arg('trial-text') || env.TRIAL_TEXT || 'Try it free for 14 days.',
    subscribeUrl: arg('subscribe-url') || env.SUBSCRIBE_URL || '',
    billing: flag('billing') || /^(on|true|1|yes)$/i.test(env.BILLING || ''),
    planText: arg('plan-text') || env.PLAN_TEXT || '',
    yearlyText: arg('yearly-text') || env.YEARLY_TEXT || '',
    out: path.resolve(arg('out') || path.join(root, 'dist')),
    production: flag('production'),
    allowLocal: flag('allow-local'),
  };
}

function fail(msg) { console.error('STOP: ' + msg); process.exit(1); }

// a key that can act as an admin must never reach a browser
export function checkKey(key) {
  if (/^sb_secret_/.test(key)) return 'That is a secret key (it starts with sb_secret_). Use the publishable key instead.';
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const role = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role;
      if (role === 'service_role') return 'That is the service_role key. It can read everyone\'s papers. Use the anon (public) key instead.';
      if (role && role !== 'anon') return `That key has the role "${role}". Use the anon (public) key.`;
    } catch (e) { return 'That key does not look right. Copy the anon (public) key from Project Settings, API.'; }
    return null;
  }
  return /^sb_publishable_[\w-]+$/.test(key) ? null : 'That key does not look right. Copy the anon or publishable key from Project Settings, API.';
}

// ---------- the build ----------
export function build(s) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(s.supabaseUrl) && !(s.allowLocal && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(s.supabaseUrl))) {
    fail('--supabase-url should look like https://abcd1234.supabase.co');
  }
  const keyProblem = checkKey(s.anonKey);
  if (keyProblem) fail(keyProblem);
  if (s.production && !s.supportEmail) fail('--support-email is needed for a production build: people need a way to reach you.');
  for (const page of ['terms.html', 'privacy.html']) {
    const text = fs.readFileSync(path.join(here, 'static', page), 'utf8');
    if (s.production && text.includes('REVIEW-BEFORE-LAUNCH')) fail(`${page} is still a draft. Have it reviewed, then remove the REVIEW-BEFORE-LAUNCH lines (or build without --production while testing).`);
  }

  fs.rmSync(s.out, { recursive: true, force: true });
  fs.mkdirSync(path.join(s.out, 'vendor'), { recursive: true });
  fs.mkdirSync(path.join(s.out, 'fonts'), { recursive: true });

  // 1. the page: the app file with its Claude-only startup removed, wrapped as a real web page
  let html = fs.readFileSync(APP_FILE, 'utf8');
  const strip = /\/\* <adapter:artifact> \*\/[\s\S]*?\/\* <\/adapter:artifact> \*\/\n?/;
  if (!strip.test(html)) fail('could not find the artifact adapter block in the app file');
  html = html.replace(strip, '');
  const cut = html.indexOf('<main class="wrap" id="app">');
  if (cut < 0) fail('could not find the app container in the app file');
  let head = html.slice(0, cut), body = html.slice(cut);
  head = head.replace(/<meta name="claude:[^>]*>\s*/g, '')
    .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
    .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/, '<link rel="stylesheet" href="/fonts/fonts.css">\n');
  if (/googleapis|gstatic/.test(head)) fail('a Google Fonts link is still in the page');
  const lastScript = body.lastIndexOf('<script>');
  body = body.slice(0, lastScript)
    + '<script src="/vendor/supabase.js"></script>\n<script src="/config.js"></script>\n<script src="/runtime.js"></script>\n'
    + body.slice(lastScript) + '\n<script src="/register-sw.js"></script>\n';
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#54645b">
<meta name="description" content="Scan a receipt, bill, or form. Check the details. Find it again when you need it.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Paper Trail">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
${head.trim()}
<link rel="stylesheet" href="/standalone.css">
</head>
<body>
<div id="gate"></div>
${body.trim()}
</body>
</html>
`;
  if (/window\.claude|claude\.use\(/.test(page)) fail('the page still talks to Claude\'s artifact features');
  fs.writeFileSync(path.join(s.out, 'index.html'), page);

  // 2. the web app's own files
  for (const f of ['runtime.js', 'standalone.css']) fs.copyFileSync(path.join(here, f), path.join(s.out, f));
  fs.copyFileSync(path.join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), path.join(s.out, 'vendor/supabase.js'));
  fs.cpSync(path.join(here, 'static/icons'), path.join(s.out, 'icons'), { recursive: true });
  for (const f of ['terms.html', 'privacy.html', 'register-sw.js']) fs.copyFileSync(path.join(here, 'static', f), path.join(s.out, f));
  fs.writeFileSync(path.join(s.out, 'config.js'), '// Public settings. Nothing in this file is secret.\nwindow.PT_CONFIG = ' + JSON.stringify({
    supabaseUrl: s.supabaseUrl, supabaseAnonKey: s.anonKey, supportEmail: s.supportEmail || undefined, trialText: s.trialText, subscribeUrl: s.subscribeUrl || undefined,
    billing: s.billing || undefined, planText: s.planText || undefined, yearlyText: s.yearlyText || undefined,
  }, null, 2) + ';\n');

  // 3. fonts, kept on your own site so no visit goes to Google
  const faces = [['instrument-sans', 'Instrument Sans', [400, 500, 600]], ['playfair-display', 'Playfair Display', [500, 600]]];
  let css = '/* Self-hosted fonts: Instrument Sans and Playfair Display (SIL Open Font License) */\n';
  for (const [pkg, family, weights] of faces) {
    for (const w of weights) {
      const file = `${pkg}-latin-${w}-normal.woff2`;
      fs.copyFileSync(path.join(root, 'node_modules/@fontsource', pkg, 'files', file), path.join(s.out, 'fonts', file));
      css += `@font-face{font-family:"${family}";font-style:normal;font-weight:${w};font-display:swap;src:url(/fonts/${file}) format("woff2")}\n`;
    }
  }
  fs.writeFileSync(path.join(s.out, 'fonts/fonts.css'), css);

  // 4. install files
  fs.writeFileSync(path.join(s.out, 'manifest.webmanifest'), JSON.stringify({
    name: 'Paper Trail', short_name: 'Paper Trail', description: 'Scan a receipt, bill, or form and find it again later.',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait', background_color: '#faf5f0', theme_color: '#54645b',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }, null, 2) + '\n');
  const version = crypto.createHash('sha256').update(fs.readFileSync(path.join(s.out, 'index.html'))).update(fs.readFileSync(path.join(s.out, 'runtime.js'))).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(s.out, 'sw.js'), fs.readFileSync(path.join(here, 'static/sw.template.js'), 'utf8').replace('__VERSION__', version));

  // 5. security headers. The page's own scripts and styles are allowed by fingerprint, and nothing else inline is.
  const hash = t => `'sha256-${crypto.createHash('sha256').update(t, 'utf8').digest('base64')}'`;
  const inline = tag => [...page.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g'))].map(m => hash(m[1]));
  const host = new URL(s.supabaseUrl).host;
  const ws = (s.supabaseUrl.startsWith('https') ? 'wss://' : 'ws://') + host;
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${inline('script').join(' ')}`.trim(),
    `style-src 'self' ${inline('style').join(' ')}`.trim(),
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: ${s.supabaseUrl}`,
    "font-src 'self'",
    `connect-src 'self' ${s.supabaseUrl} ${ws}`,
    "manifest-src 'self'", "worker-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  fs.writeFileSync(path.join(s.out, '_headers'), [
    '/*',
    '  Content-Security-Policy: ' + csp,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()',
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    '/sw.js',
    '  Cache-Control: no-cache',
    '/index.html',
    '  Cache-Control: no-cache',
    '/config.js',
    '  Cache-Control: no-cache',
    '',
  ].join('\n'));

  return { out: s.out, version, csp };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = build(buildSettings());
  const files = fs.readdirSync(r.out, { recursive: true }).filter(f => fs.statSync(path.join(r.out, f)).isFile());
  console.log(`Built ${files.length} files into ${path.relative(process.cwd(), r.out) || '.'} (version ${r.version}).`);
}
