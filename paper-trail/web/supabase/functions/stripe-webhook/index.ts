// Supabase Edge Function entry (Deno). All the logic is in handler.js so it can be tested without Deno.
// Secret it reads (Supabase dashboard, Edge Functions, Secrets):
//   STRIPE_WEBHOOK_SECRET    the signing secret Stripe shows for this endpoint (starts with whsec_)
// Supabase fills in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for you.
// Turn OFF "Enforce JWT verification" for this function: Stripe does not send a Supabase token. The signature is the check.
import { handle } from './handler.js';

Deno.serve((req: Request) =>
  handle(req, {
    env: Deno.env.toObject(),
    fetch,
    log: (line: unknown) => console.log(JSON.stringify(line)),
  }));
