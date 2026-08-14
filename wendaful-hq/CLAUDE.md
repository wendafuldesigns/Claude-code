# Wendaful HQ

Wenda's personal business dashboard. One calm place to check content, habits,
revenue, client work, goals, and creative projects instead of bouncing
between ClickUp, Apple Calendar, and five apps.

This file is project memory. Read it at the start of a session so you don't
have to re-derive decisions already made.

## Who this is for

Wenda runs Wendaful Planning (planners, ClickUp templates, the Planning Lab
membership) and does content/marketing work for a client called SCMC. She
posts across TikTok, Instagram, and YouTube. She plans on paper but keeps her
real calendar in Apple Calendar and her content calendar in ClickUp.

## Tech stack

- Next.js 16 (App Router, TypeScript, Turbopack)
- Tailwind CSS v4 (config lives in `src/app/globals.css` via `@theme`, no
  `tailwind.config.ts`)
- Prisma 7 + SQLite, via the `@prisma/adapter-better-sqlite3` driver adapter
- Framer Motion for page transitions and small UI motion
- lucide-react for icons

### Why the driver adapter

Prisma 7 removed built-in datasource URLs and requires a driver adapter for
every provider, including SQLite. `prisma/schema.prisma` has no `url` on the
datasource block. The actual connection lives in two places:

- `prisma.config.ts` — `datasource.url` (from `DATABASE_URL` in `.env`), used
  by the Prisma CLI for `db push` / `studio` / seeding.
- `src/lib/db.ts` — constructs `PrismaClient` with a
  `PrismaBetterSqlite3` adapter instance, used by the app at runtime.

Both need to be updated if the database file location ever changes.

Also note: generated Prisma model types live in
`src/generated/prisma/models/*` and are named `<Model>Model`
(e.g. `ClientTaskModel`), not the bare model name — that's a Prisma 7 naming
convention, not a mistake.

### Why no real enums in the schema

SQLite doesn't support Prisma's native `enum` type. Fields like `platform`,
`stage`, `source`, `status`, `timeframe`, and `category` are plain `String`
columns. The valid values for each are documented as comments above the
model in `prisma/schema.prisma`, and as label maps in `src/lib/labels.ts`.
Validate against those lists in code (forms, seed data) rather than adding a
new value ad hoc.

## Running it

```bash
npm run dev        # dev server, http://localhost:3000
npm run build       # production build
npm run db:push     # push schema.prisma changes to dev.db (no migration history)
npm run db:seed     # wipe and reseed all tables with placeholder data
npm run db:studio   # Prisma Studio, browse/edit the SQLite db visually
```

The database is a single file at `dev.db` (SQLite), gitignored. Anyone
cloning this repo needs to run `npm run db:push && npm run db:seed` once to
get a working local database.

We're using `db push`, not migrations — this is a single-user local app, not
a team project with a shared production database. If that ever changes,
switch to `prisma migrate dev`.

## Design system

Dark theme only (no light mode toggle — this is a personal tool, not a
public site). Sage green as the primary accent; a muted terracotta as the
secondary "pay attention" accent, used only for the urgent-flags section and
similar warnings. Both were shown to Wenda; sage won as the primary, and
terracotta found a natural second job instead of being dropped.

Tokens live in `src/app/globals.css` as CSS custom properties, exposed to
Tailwind via `@theme inline` so they're usable as normal utility classes
(`bg-surface`, `text-accent`, `border-border`, etc). Don't hardcode hex
colors in components — add a token if you need a new one.

| Token | Value | Use |
|---|---|---|
| `background` | `#121410` | page background |
| `surface` | `#191c16` | cards |
| `surface-hover` | `#21251c` | hover states |
| `border` | `#2b2f25` | card/divider borders |
| `foreground` | `#edede4` | primary text |
| `muted` | `#9a9d8f` | secondary text |
| `accent` | `#9cb38a` | sage — active nav, primary actions, positive state |
| `warn` | `#c98a5e` | terracotta — urgent flags only |

Cards: `rounded-xl border border-border bg-surface p-5` (see
`src/components/ui/Card.tsx`). Reuse it rather than rebuilding card chrome
per page.

## Brand voice

Casual, warm, like a friend at the kitchen counter talking to Wenda directly
(she's the only user). Rules for any copy in the UI:

- Short sentences.
- No em dashes.
- No "journey," "streamline," "delve," "level up," "ultimate," or other
  corporate/hustle language.
- Empty states should feel encouraging, not clinical — e.g. "Nothing urgent
  today. Enjoy that." not "No items found."
- "Something is always better than nothing" is a real design principle here,
  not just a tagline — prefer showing a rough, partial, or placeholder view
  over showing nothing.

## Layout and navigation

`src/app/layout.tsx` renders a fixed left `Sidebar` (`src/components/layout/
Sidebar.tsx`) next to the routed page content, wrapped in `PageTransition`
(`src/components/layout/PageTransition.tsx`) for a Framer Motion
fade/slide between routes.

The sidebar also renders an "Everyday tools" row: six small icon-only
placeholders for ClickUp, Apple Calendar, Gmail, Instagram, TikTok, and
YouTube. These are visual placeholders only — no auth, no links, no data.
lucide-react v1 dropped brand/logo icons, so these use generic stand-ins
(checklist for ClickUp, camera for Instagram, music note for TikTok, etc.)
— see `toolItems` in `src/lib/nav.ts` if you want to swap them for real
brand marks later.

Nav items and routes are defined once in `src/lib/nav.ts`
(`navItems`) — add a page there and it shows up in the sidebar
automatically, no need to touch `Sidebar.tsx`.

## Pages

| Page | Route | Status |
|---|---|---|
| Home | `/` | **Built** — morning overview |
| Content Pipeline | `/content` | **Built** — kanban board |
| Habits | `/habits` | Stub |
| Revenue | `/revenue` | Stub |
| Client Work | `/clients` | Stub |
| Goals | `/goals` | Stub |
| Creative Projects | `/projects` | Stub |

Stub pages use the shared `ComingSoon` component
(`src/components/ui/ComingSoon.tsx`) so the nav doesn't 404 while the rest
of the app gets built. They intentionally do nothing else — replace the
whole file when building that page for real, don't build on top of the stub.

**Build order rule:** build one page at a time, confirm with Wenda, then
move to the next. Don't get ahead of approved scope.

### Home (`src/app/page.tsx`)

Server component, fetches directly from `db` (no API routes — this is a
single Next.js app, server components talk to Prisma directly). Order on
the page, top to bottom, is fixed by the original brief:

1. Date + time-aware greeting (`src/lib/greeting.ts` — "Wenda" is
   hardcoded as the name since this is single-user)
2. Today's top 3 priorities (`PrioritiesCard` — interactive, checkbox
   toggle calls the `togglePriority` server action in `src/app/actions.ts`
   and revalidates the page)
3. Today's calendar (`CalendarCard`, read-only)
4. Revenue snapshot for the current calendar month (`RevenueSnapshotCard`
   — received vs. pending, broken down by source)
5. Urgent flags (`UrgentFlagsCard`, logic in `src/lib/urgent.ts`) — not a
   database table, it's computed from live data: overdue `ClientTask`s,
   `ContentPost`s due today/overdue and not yet posted, and
   `CreativeProject`s with a deadline within the next
   `UPCOMING_DEADLINE_DAYS` (5) days. Extend that function, don't add a
   separate "flags" table, if new urgency sources come up.

### Content Pipeline (`src/app/content/page.tsx`)

Server component fetches all `ContentPost`s, hands them to
`ContentPipelineView` (client) which owns filter state (All/TikTok/
Instagram/YouTube tabs) and renders a horizontally-scrolling kanban board,
one column per `contentStageOrder` entry (`src/lib/labels.ts`). Each
`ContentCard` has a "move to next stage" arrow that calls the
`advanceContentStage` server action (`src/app/content/actions.ts`) —
setting `postedDate` automatically when a post lands on "posted" — with an
optimistic local update so the card moves instantly instead of waiting on
the round trip. No create/edit/delete UI yet; that's the natural next
increment if Wenda wants to add posts from the app instead of just
triage/track them.

The kanban board intentionally scrolls horizontally inside its own
container rather than squeezing into the page's `max-w-5xl` — six columns
don't fit at readable width otherwise, and ClickUp's own board view works
the same way.

## Database schema

One Prisma model per page/section (`prisma/schema.prisma`):

- `Priority` — daily top 3, keyed by `date` + `order`
- `CalendarEvent` — mirrors Apple Calendar, entered by hand for now
- `ContentPost` — content pipeline; `platform` (tiktok/instagram/youtube) ×
  `stage` (idea → scripting → filming → editing → scheduled → posted)
- `Habit` + `HabitCheckin` — one row per habit per day checked in; streaks
  are computed in code from consecutive checkins, not stored
- `RevenueEntry` — `source` (clickup_affiliate/youtube_ads/sponsorship/
  planning_lab) × `status` (received/pending)
- `ClientTask` — SCMC work; `client` field defaults to `"SCMC"` but isn't
  hardcoded, in case a second client shows up later
- `Goal` — `timeframe` (monthly/quarterly/yearly), `progress` is 0–100
- `CreativeProject` — `category` (content_series/product_launch/other) ×
  `status` (planning/in_progress/review/done)

Seed data (`prisma/seed.ts`) uses day offsets from "today" (whenever you run
the seed), not fixed dates, so the app always looks current when reseeded.
It's meant to feel lived-in: mixed stages, a couple of overdue items so the
urgent-flags section has something to show, realistic streak gaps in
habits, a few months of revenue history.

## Known quirks worth remembering

- Next.js 16 regenerates `AGENTS.md` on `next dev` with a note that this
  version may differ from training data — check `node_modules/next/dist/
  docs/` for current docs before assuming App Router behavior from memory,
  especially around caching (`cacheComponents` / `"use cache"` — this app
  does **not** opt into Cache Components, it uses the default fetch model,
  which is what you want for a small local dashboard reading SQLite live).
- ESLint's `react/no-unescaped-entities` rule fires on raw apostrophes in
  JSX text — use `&apos;` in copy strings.
