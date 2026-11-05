# Paper Trail web app

The same Paper Trail screens, running as a real website: people sign in with an emailed code, their papers live in your Supabase project, and scans are read by a small service you control.

```
paper-trail.html            the app itself (also what runs as a Claude artifact)
web/
  app/
    runtime.js              the web app's plug-in: sign-in, records, photos, scanning, the account screen
    build.mjs               builds the deployable site into dist/
    extract-shared.mjs      copies the paper types and reading instructions to the server
    bundle-function.mjs     makes the one-file scan service for pasting into Supabase
    make-icons.mjs          draws the app icons
    static/                 install files, the service worker, and the draft Terms and Privacy pages
  supabase/
    migrations/0001_init.sql  the tables, privacy rules, scan counter, and photo rules
    migrations/0002_billing.sql  subscriptions: the plan rules the webhook uses
    functions/scan/           the scan service (handler.js, prompt.js, index.ts)
    functions/billing/        opens Stripe's pages for subscribing and managing
    functions/stripe-webhook/ the only thing that turns a plan on or off
    functions/_shared/        helpers the last two share
    *-function-single-file.ts the same services, each as one file for pasting into Supabase
    tests/                    database and scan service tests
  tests/                    the browser tests for the whole web app
  docs/                     DEPLOY.md, COSTS.md, LAUNCH-CHECKLIST.md
  netlify.toml              build settings for Netlify
```

## How it fits together

The app talks to its runtime through a small interface (`caps` in `paper-trail.html`): `db`, `scan`, `assets`, `assetUrl`, `downloads`, plus an account screen and a notice banner. On Claude, the runtime is Claude's own artifact features. On the web, it's `app/runtime.js`, which uses Supabase. The screens don't know the difference.

Payments: the app opens a Stripe page (through the billing service) and Stripe tells the webhook when someone has paid. Only the webhook changes a plan, and only after checking Stripe's signature. The price lives in Stripe, not in the app.

Scanning never sends instructions from the browser. The browser sends photos, the family's saved names, and today's date. The service builds the instructions itself, from the same code the app uses, and checks the plan and the monthly cap in the database first.

## Commands

```
npm install
npm test            all the checks (database, scan service, payments, and the browser tests)
npm run build       build the site into dist/ (needs SUPABASE_URL and SUPABASE_ANON_KEY)
npm run shared      refresh the server's copy of the paper types and instructions
npm run bundle      refresh the one-file versions of the three services
```

If you change the paper types or the reading instructions in `paper-trail.html`, run `npm run shared` and `npm run bundle`. `npm test` fails if you forget.

## Where to start

Read `docs/DEPLOY.md`.
