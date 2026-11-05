// Loads the one-file version of the scan service the way Supabase would (with Deno's start function stubbed),
// sends one scan through it, and prints what came back. scan.test.mjs runs this.
process.env.X = '';
const env = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', ANTHROPIC_API_KEY: 'k', ALLOWED_ORIGINS: 'https://app.example.com' };
globalThis.Deno = { env: { toObject: () => env }, serve: h => { globalThis.__handler = h; } };
const reply = { readable: true, category: 'pet', title: 'Vet checkup', date: '2026-10-01', total: 95 };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const j = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
  if (u.endsWith('/auth/v1/user')) return j(200, { id: 'u1', email_confirmed_at: 'x' });
  if (u.endsWith('/rpc/begin_scan')) return j(200, { ok: true, household_id: 'h1', used: 1, cap: 15 });
  if (u.includes('api.anthropic.com')) return j(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply) }] });
  return j(500, {});
};
await import('../scan-function-single-file.ts');
const res = await globalThis.__handler(new Request('https://proj.supabase.co/functions/v1/scan', {
  method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://app.example.com', 'content-type': 'application/json' },
  body: JSON.stringify({ images: ['/9j/' + 'A'.repeat(200)], known: [], today: new Date().toISOString().slice(0, 10) }),
}));
console.log(JSON.stringify({ status: res.status, body: await res.json() }));
