// Joins the scan service (handler.js, prompt.js, index.ts) into ONE file you can paste into Supabase's dashboard:
// Edge Functions, Deploy a new function, "via Editor". The result is supabase/scan-function-single-file.ts.
// Usage: node app/bundle-function.mjs          writes it
//        node app/bundle-function.mjs --check  fails if it is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '../supabase/functions/scan');
export const BUNDLE_FILE = path.join(here, '../supabase/scan-function-single-file.ts');

export function bundle() {
  const prompt = fs.readFileSync(path.join(dir, 'prompt.js'), 'utf8')
    .replace(/^\/\/ GENERATED.*\n/, '').replace(/\nexport \{ CATS, buildScanPrompt \};\n?$/, '\n');
  const handler = fs.readFileSync(path.join(dir, 'handler.js'), 'utf8')
    .replace(/^import \{ CATS, buildScanPrompt \} from '\.\/prompt\.js';\n/m, '')
    .replace(/^export async function handle/m, 'async function handle')
    .replace(/^export function cleanResult/m, 'function cleanResult');
  const entry = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8')
    .replace(/^import \{ handle \} from '\.\/handler\.js';\n/m, '');
  if (/^\s*(import|export)\s/m.test(prompt + handler)) throw new Error('an import or export is left in the bundle');
  return [
    '// Paper Trail scan service, as one file for pasting into the Supabase dashboard.',
    '// GENERATED from supabase/functions/scan by app/bundle-function.mjs. Do not edit by hand.',
    '',
    '// ---------- the paper types and the reading instructions (shared with the app) ----------',
    prompt.trim(),
    '',
    '// ---------- the service ----------',
    handler.trim(),
    '',
    '// ---------- start ----------',
    entry.replace(/^\/\/ Supabase Edge Function entry[\s\S]*?(?=Deno\.serve)/, '').trim(),
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = bundle();
  if (process.argv.includes('--check')) {
    const have = fs.existsSync(BUNDLE_FILE) ? fs.readFileSync(BUNDLE_FILE, 'utf8') : '';
    if (have !== out) { console.error('scan-function-single-file.ts is out of date. Run: node app/bundle-function.mjs'); process.exit(1); }
    console.log('scan-function-single-file.ts is up to date');
  } else {
    fs.writeFileSync(BUNDLE_FILE, out);
    console.log('wrote ' + path.relative(process.cwd(), BUNDLE_FILE));
  }
}
