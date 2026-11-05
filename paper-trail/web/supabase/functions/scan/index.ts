// Supabase Edge Function entry (Deno). All the logic is in handler.js so it can be tested without Deno.
// Secrets it reads (set them in the Supabase dashboard, never in code):
//   ANTHROPIC_API_KEY        your Anthropic key
//   ALLOWED_ORIGINS          the address of the web app, for example https://papertrail.example.com (comma separated for more)
// Supabase fills in SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY for you.
// Optional: SCAN_MODEL (default claude-haiku-5-5), SCAN_EFFORT (low, medium, or high), REQUIRE_CONFIRMED_EMAIL (default true).
import { handle } from './handler.js';

Deno.serve((req: Request) =>
  handle(req, {
    env: Deno.env.toObject(),
    fetch,
    log: (line: unknown) => console.log(JSON.stringify(line)),
  }));
