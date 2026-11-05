// Pulls the pieces the server shares with the screens out of ../../paper-trail.html: the list of paper types and the
// instructions for reading a paper. They live in the app file between marker comments, so there is one copy to edit.
// Usage: node app/extract-shared.mjs          writes supabase/functions/scan/prompt.js
//        node app/extract-shared.mjs --check  fails if prompt.js is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_FILE = path.join(here, '../../paper-trail.html');
export const PROMPT_FILE = path.join(here, '../supabase/functions/scan/prompt.js');

export function between(html, name) {
  const open = `/* <shared:${name}> */`, close = `/* </shared:${name}> */`;
  const a = html.indexOf(open), b = html.indexOf(close);
  if (a < 0 || b < 0 || b < a) throw new Error(`marker ${name} not found in the app file`);
  return html.slice(a + open.length, b).trim();
}

export function promptModule(html) {
  return [
    '// GENERATED from paper-trail.html by app/extract-shared.mjs. Do not edit by hand: change the app file and run it again.',
    between(html, 'cats'),
    '',
    between(html, 'prompt'),
    '',
    'export { CATS, buildScanPrompt };',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = promptModule(fs.readFileSync(APP_FILE, 'utf8'));
  if (process.argv.includes('--check')) {
    const have = fs.existsSync(PROMPT_FILE) ? fs.readFileSync(PROMPT_FILE, 'utf8') : '';
    if (have !== out) { console.error('prompt.js is out of date. Run: node app/extract-shared.mjs'); process.exit(1); }
    console.log('prompt.js is up to date');
  } else {
    fs.writeFileSync(PROMPT_FILE, out);
    console.log('wrote ' + path.relative(process.cwd(), PROMPT_FILE));
  }
}
