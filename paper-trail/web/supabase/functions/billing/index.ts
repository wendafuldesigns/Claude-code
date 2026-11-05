// Supabase Edge Function entry (Deno). All the logic is in handler.js so it can be tested without Deno.
// Secrets it reads (Supabase dashboard, Edge Functions, Secrets):
//   STRIPE_SECRET_KEY        your Stripe secret key (starts with sk_ or rk_)
//   STRIPE_PRICE_MONTHLY     the id of your monthly price in Stripe (starts with price_)
//   STRIPE_PRICE_YEARLY      optional: the id of a yearly price
//   SITE_URL                 the address of the web app, for example https://papertrail.example.com
//   ALLOWED_ORIGINS          the same address (more than one can be separated by commas)
// Supabase fills in SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY for you.
import { handle } from './handler.js';

Deno.serve((req: Request) =>
  handle(req, {
    env: Deno.env.toObject(),
    fetch,
    log: (line: unknown) => console.log(JSON.stringify(line)),
  }));
