// Joins each Supabase function (handler.js, the files it imports, and index.ts) into ONE file you can paste into
// Supabase's dashboard: Edge Functions, Deploy a new function, "via Editor".
//   scan           ->  supabase/scan-function-single-file.ts
//   billing        ->  supabase/billing-function-single-file.ts
//   stripe-webhook ->  supabase/stripe-webhook-function-single-file.ts
// Usage: node app/bundle-function.mjs          writes them
//        node app/bundle-function.mjs --check  fails if any is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const functionsDir = path.join(here, '../supabase/functions');
export const NAMES = ['scan', 'billing', 'stripe-webhook'];
export const bundleFile = name => path.join(here, '../supabase', `${name}-function-single-file.ts`);

// a module's own text, without its import and export words, so it can sit inside a bigger file
function plain(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/^\/\/ GENERATED.*\n/, '')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export \{[^}]*\};?\n?/gm, '')
    .replace(/^export (async function|function|const|let)\b/gm, '$1')
    .trim();
}

export function bundle(name) {
  const dir = path.join(functionsDir, name);
  const handlerPath = path.join(dir, 'handler.js');
  const handler = fs.readFileSync(handlerPath, 'utf8');
  const parts = [];
  for (const m of handler.matchAll(/^import .* from '(\.[^']+)';$/gm)) {
    parts.push({ title: path.basename(m[1]), text: plain(path.resolve(dir, m[1])) });
  }
  const entry = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8').replace(/^import .*;\n/gm, '').trim();
  const out = [
    `// Paper Trail ${name} service, as one file for pasting into the Supabase dashboard.`,
    `// GENERATED from supabase/functions/${name} by app/bundle-function.mjs. Do not edit by hand.`,
    '',
    ...parts.flatMap(p => [`// ---------- ${p.title} ----------`, p.text, '']),
    '// ---------- the service ----------',
    plain(handlerPath),
    '',
    '// ---------- start ----------',
    entry,
    '',
  ].join('\n');
  if (/^\s*(import|export)\s/m.test(out)) throw new Error(`${name}: an import or export is left in the bundle`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let bad = false;
  for (const name of NAMES) {
    const out = bundle(name);
    const file = bundleFile(name);
    if (check) {
      const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (have !== out) { console.error(`${path.basename(file)} is out of date. Run: node app/bundle-function.mjs`); bad = true; }
    } else {
      fs.writeFileSync(file, out);
      console.log('wrote ' + path.relative(process.cwd(), file));
    }
  }
  if (check) { if (bad) process.exit(1); console.log('the one-file versions are up to date'); }
}
