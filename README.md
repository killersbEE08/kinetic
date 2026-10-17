# Kinetic

Turns your notes into an animated, editable presentation. Built from the product docs one folder up (`../01-PRD.md` … `../06-Anti-Slop-Standards.md`).

**Stack:** Next.js 16 (App Router) on **Cloudflare Workers** via OpenNext · **Clerk** sign-in · **Supabase** Postgres with row-level security · **Gemini** for AI · **Dodo Payments** for subscriptions.

## Run it now (no keys needed)

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

With no keys set, the app runs in **demo mode**. Decks are saved in your browser, and the AI is a built-in offline engine that reorganises your own text without making anything up. Every screen works: landing, new deck, outline, style, generation, editor, AI edits, and present mode.

## What's in this build

| Area | Status |
|---|---|
| Landing page | Built to the design brief: announcement bar, hero with a working prompt box, live demos (overview player, a real edit run by the edit engine, quality checks counted live), use cases, gallery, sample stories, guides, FAQ, footer |
| Sample decks | 22 hand-written decks (6 pitches, 4 launches, 4 sales proposals, 4 lessons, 4 reports), each with its own brand kit (colour, logo mark, heading font, pattern), photos, drawn product screens, icon grids, charts with a highlighted number, timelines and team slides. Browse at `/templates`, preview at `/t/<id>`, then "Use this deck" to copy one. All companies and numbers are fictional |
| Visual assets | 15 CC0 / public-domain photos in `public/media` (sources in `public/media/CREDITS.md`), Lucide icons (ISC licence), vector brand patterns drawn in code. Photos can be swapped from the Design panel |
| New deck flow | Input → editable outline (reorder, merge, delete, layout hint, source chips) → style picker previewed with your content → slides stream in one by one. "Start editing now" opens the editor as soon as slide 1 is written; the rest keep arriving in the background, and slides you change are never overwritten |
| Deck engine | Zod schema, 20 layouts, 6 themes (contrast-tested), 9 motion presets, build steps, count-up numbers, SVG bar/line/KPI charts |
| Hand editing | Insert bar: text (heading, body, caption), photos (uploads or library), 8 shapes with text inside, 70 icons, tables, bar/line charts and big numbers. Click to select, click again to type, drag to move with snap guides, 8 resize handles, rotation handle (Shift for 15° steps), Shift-click or drag a box to select several, Ctrl A, move / align / space evenly / group (Ctrl G) several at once, arrow-key nudge, Delete, Ctrl D duplicate, Ctrl C / V between slides, undo. Format panel: exact position and size, align to slide, layer order, opacity, text size / bold / italic / underline / alignment / font / colour (theme colours follow theme changes), fill, border, corners, icon picker, table rows and columns, photo fit. Layout elements can be moved too ("Back to layout position" resets). Blank slides. Everything exports to PowerPoint as native, editable objects (shapes and tables included) |
| Editor | Slide rail (drag to reorder, duplicate, delete), inline text editing, layout swap that keeps content, chart data editor, motion panel, speaker notes, unlimited undo/redo, autosave with conflict detection |
| AI edits | Scoped to deck, slide, or element. Shown as a dashed "Suggested" preview; Accept (Ctrl+Enter) or Discard (Esc). The scope is enforced in code before anything is returned |
| Quality gates (PRD §9) | Word and bullet limits (extra text moves to speaker notes), one headline per slide, banned-phrase rewrite, motion budget, and numbers missing from your notes are flagged as Suggested |
| Present mode | Fullscreen, arrow keys/clicker, build steps, `N` notes + timer + next slide, `B` blackout, `?` help |
| Billing | Dodo checkout, customer portal, signed webhook → plan in Supabase; Free plan limited to 3 decks and AI credits per month (enforced in SQL) |
| Dashboard (`/dashboard`) | Where users land after signing in. One box to describe the talk, pick a type, and drop files and photos; usage meters (decks, AI credits, photo storage); recent decks with Edit / Present / Download; template picker with "Use design" or "Copy deck"; photo strip |
| File import | PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), CSV, TXT, Markdown. Read in the browser (nothing is uploaded to read them). Headings become slide titles, lists become points, tables become `Label: value` lines that turn into charts. Photos inside Word, PowerPoint and PDF files are saved to the photo library |
| Photo library (`/assets`) | Upload JPG/PNG/WebP/GIF. Resized to 2560 px and re-encoded in the browser (removes phone GPS data). Stored privately in Cloudflare R2; Free 100 MB, Pro 5 GB, Team 20 GB (enforced in SQL). Without R2 or in demo mode, photos stay in the browser (IndexedDB). Rename, alt text, delete |
| Photos in decks | Chosen photos are placed after generation: the first behind the title, the rest on point and statement slides, never two in a row. In the editor: "Add a photo to this slide", swap any photo for an upload, choose which part stays in view |
| Template designs | Any of the 22 templates can lend its theme, brand colours, heading font and pattern to a new deck, with the user's own name in the logo |
| Download | **PowerPoint**: every slide as native, editable text boxes, shapes, pictures and real charts (data editable in PowerPoint); build animations matching Kinetic's motion (fade up, wipe, zoom, word-by-word type-on, on-click steps); fade, push and Morph transitions (Morph falls back to fade before PowerPoint 2019); speaker notes; deck fonts or Office-safe fonts. **PDF**: one slide per page, or a handout with notes. **PNG**: the current slide at 1920×1080. All made in the browser |
| App shell and dashboard | Left sidebar (collapses to icons, remembered), phone tab bar, Ctrl/? K search across decks, templates and actions. Dashboard: one create box with four ways to start (describe, paste notes, import files, redesign a .pptx) that writes the outline straight away, "continue where you left off" with a check-status line, first-visit checklist and sample, templates |
| Settings | Account details, plan and credit usage, "Download my data" (ZIP of decks and photos), delete account (type DELETE; blocked while a paid plan is active) |
| Safety | Per-user rate limits (Cloudflare rate-limit binding: AI 20/min, uploads 30/min), HSTS, a report-only content security policy, browser error reports to `/api/report` (no deck content), credit cost shown on every AI button |
| Not built yet | Brand kit editor, MP4 export, shared team workspace and roles, @mentions, real-time co-editing, text recognition for scanned PDFs |
| Review tab | One list of what to check before presenting: details not in your notes, too much text, low contrast, photos without alt text, hype wording, placeholder text, colours outside the brand, long titles, missing speaker notes. One-click fixes (one at a time or "all"), each one undoable. "Change the whole deck" runs one AI pass over every slide (e.g. "Shorten every title"); you untick slides to keep and apply the rest in one step |
| Comments | Threads pinned to a slide (optionally an element), with replies and resolve. Share links can allow comments: viewers comment without an account, and the owner sees them in the editor with the link name ("via Acme investors") |
| Share alerts | A bell in the app: "Acme investors opened your deck", then a summary when they leave ("viewed for 2m 10s, most time on slide 4, Pricing"), and new comments. Email (Resend) and a Slack channel are optional, set in Settings → Alerts. Turn alerts off per link |
| Measurement | Activation funnel (sign-up → outline → deck → first edit → present / share / download), timings for generation, export and save, server errors as JSON log lines, optional Sentry. `/api/health` reports missing migrations |

## Connect the real services

Copy `.env.example` → `.env.local` (for `pnpm dev`) and fill in what you have. Each service turns on independently.

### 1. Supabase (database)
1. Create a project. Copy the **Project URL**, **publishable key**, and **service role key**.
2. Run the schema: open **SQL Editor**, paste `supabase/migrations/20261014000000_init.sql`, and run it (or use `supabase db push`).

### 2. Clerk (sign-in), connected to Supabase
1. Create a Clerk app and copy the publishable and secret keys.
2. In Clerk, open **[Connect with Supabase](https://dashboard.clerk.com/setup/supabase)** and follow it. This adds the `role: authenticated` claim that Supabase needs.
3. In Supabase, go to **Authentication → Sign In / Providers → Third-Party Auth**, add **Clerk**, and enter your Clerk domain.

Row-level security then reads the Clerk user id from the token (`auth.jwt()->>'sub'`), so each user can only read and write their own decks, even if the API had a bug.

### 3. Gemini (AI)
Create a key in [Google AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_API_KEY`. The default model is `gemini-3.8-flash` (change it with `GEMINI_MODEL`). The key is only used on the server.

### 4. Dodo Payments
1. Create two **subscription** products, Pro and Team (Team uses quantity as seats), and set `DODO_PRODUCT_PRO` and `DODO_PRODUCT_TEAM`.
2. Create an API key → `DODO_PAYMENTS_API_KEY`.
3. Add a webhook endpoint at `https://<your-domain>/api/webhooks/dodo` with the `subscription.*` events, and copy its signing secret → `DODO_PAYMENTS_WEBHOOK_KEY`.
4. Keep `DODO_PAYMENTS_ENVIRONMENT=test_mode` until you go live.

Plans change **only** through the signed webhook. The browser can never set its own plan, because the `profiles.plan` column can't be updated by users.

### 5. Cloudflare R2 (photo storage)
1. `pnpm exec wrangler r2 bucket create kinetic-assets` (the binding `ASSETS_BUCKET` is already in `wrangler.jsonc`).
2. Run `supabase/migrations/20261015000000_assets.sql` in Supabase after the first migration.

Files are stored under `u/<clerk user id>/<photo id>` and served only through `/api/assets/<id>` to the signed-in owner (row checked under RLS, then the key). The server checks the file's first bytes, so a renamed file can't pass as an image; SVG is not accepted. If the bucket isn't set up, uploads fall back to the browser.

### 6. Share links, brand kits and stock photos
1. Run `supabase/migrations/20261015120000_ai_rate_limit.sql` and then `supabase/migrations/20261016000000_sharing_brand.sql` in the Supabase SQL Editor. Until then, those pages answer "migration needed".
2. Stock photos: create an app at [unsplash.com/developers](https://unsplash.com/developers) and set its Access Key as `UNSPLASH_ACCESS_KEY`. Without it, the "Free stock photos" option is hidden. Photos are hotlinked from Unsplash's CDN, the photographer is credited, and Unsplash's download counter is pinged when a photo is used, as their API guidelines require.
3. Optional: `SHARE_SIGNING_SECRET`, a long random value used to sign viewer sessions. If unset, one is derived from the Supabase service key.

Share links hold a snapshot of the deck, so later edits don't show until you press "Update to latest". Viewers are counted with a hash that changes every day, and no IP addresses are stored. The redesign view (`/redesign`) draws the original .pptx in the browser with [@aiden0z/pptx-renderer](https://github.com/aiden0z/pptx-renderer) (Apache-2.0), loaded only on that page.

### 7. Comments, alerts and measurement
1. Run `supabase/migrations/20261017000000_versions_trash.sql` and `supabase/migrations/20261018000000_activity_comments_alerts.sql`. Open `/api/health`: it answers 200 when every migration is in, and lists what is missing otherwise.
2. Optional email alerts: create a [Resend](https://resend.com) key and a verified sender, then set `RESEND_API_KEY` and `ALERT_EMAIL_FROM` (e.g. `Kinetic <alerts@yourdomain.com>`). Slack needs no server setup: each user pastes an incoming-webhook URL in Settings → Alerts.
3. Optional error tracking: set `SENTRY_DSN`. Server errors and browser error reports are sent to Sentry; without it they are JSON lines in `wrangler tail` / Workers Observability (`server_error`, `client_error`, `slow_request`, `timing`, `migration_needed`).
4. Activation: in the SQL editor, `select count(*) filter (where activated) * 100.0 / count(*) from activation_funnel where signed_up_at > now() - interval '30 days';`. The view has one row per user with the time of each step. Events hold names, ids and small numbers only, never deck text.

### 8. Abuse reports and bot checks
1. Run `supabase/migrations/20261019000000_abuse_reports.sql`.
2. Anyone can report a shared deck (Report link on `/v/<id>`, or the `/report` page) or a comment. A reported comment is hidden from other viewers until the owner presses "Keep it" or deletes it. Deck reports are logged (`abuse_report`) and, with `ABUSE_REPORT_EMAIL` plus the Resend keys, emailed to you with a ready-made takedown line.
3. To take a link down: `insert into blocked_links (link_id, reason) values ('<link id>', 'phishing');`. Viewers then see "This link was removed", photos stop loading and comments close. Delete the row to restore it. Open reports: `select * from abuse_reports where status = 'open' order by created_at desc;`.
4. Optional bot check on viewer comments and reports: create a [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) widget and set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (build time) and `TURNSTILE_SECRET_KEY` (secret). Set both or neither. `NEXT_PUBLIC_ABUSE_EMAIL` shows a contact address for legal requests on `/report`.
5. When the deck owner opens their own share link while signed in, the visit isn't counted and sends no alert (the viewer shows "Your link · views not counted").

### 9. Free-tier abuse guard (throwaway accounts)
Run `supabase/migrations/20261020000000_free_tier_guard.sql`. Then:
- **Starter credits:** new free accounts get 40 AI credits (about one deck plus edits). The full 100 a month arrive after 48 hours, or as soon as they share a deck.
- **Throwaway emails** (a built-in list plus `DISPOSABLE_EMAIL_DOMAINS`) get no free AI credits; the offline engine still works.
- **Many accounts from one network** (more than 3 in 30 days) wait 6 days for the full allowance instead of 2. Only a keyed hash of the /24 network is kept, and it's cleared after 30 days.
- **Daily cap for all free users together** (20,000 credits by default). When it's reached, free users get the offline engine until midnight UTC; paid users are never affected. You get a `free_cap_reached` log line and an email (`OPS_ALERT_EMAIL`), and a `free_cap_80` warning at 80%.
- **Cheaper model for free users:** set `GEMINI_MODEL_FREE` (e.g. a Flash-Lite model).
- **Check and tune** in the SQL editor: `select * from free_tier_watch;` and `update free_tier_config set daily_credit_cap = 30000, starter_credits = 40, unlock_hours = 48 where id = 1;`

Set your daily cap from your budget: credits ≈ slides generated, and one credit costs you roughly one Gemini call's worth of tokens for a slide. Start low and raise it as real usage grows.

## Deploy to Cloudflare

```bash
pnpm exec wrangler login
# Secrets (server-only)
pnpm exec wrangler secret put CLERK_SECRET_KEY
pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY
pnpm exec wrangler secret put GEMINI_API_KEY
pnpm exec wrangler secret put UNSPLASH_ACCESS_KEY     # optional, stock photos
pnpm exec wrangler secret put SHARE_SIGNING_SECRET    # optional
pnpm exec wrangler secret put RESEND_API_KEY          # optional, email alerts (+ ALERT_EMAIL_FROM)
pnpm exec wrangler secret put SENTRY_DSN              # optional, error tracking
pnpm exec wrangler secret put DODO_PAYMENTS_API_KEY
pnpm exec wrangler secret put DODO_PAYMENTS_WEBHOOK_KEY
pnpm exec wrangler secret put DODO_PRODUCT_PRO
pnpm exec wrangler secret put DODO_PRODUCT_TEAM
pnpm exec wrangler secret put NEXT_PUBLIC_APP_URL      # e.g. https://kinetic.example.com
pnpm run deploy
```

`NEXT_PUBLIC_*` values (Clerk publishable key, Supabase URL and publishable key) are built into the browser bundle, so they must be in `.env.local` (or your CI environment) **when you run `pnpm run deploy`**.

To test in the real Workers runtime locally, copy `.dev.vars.example` → `.dev.vars` and run `pnpm run preview` (serves on :8787).

## Automatic checks (GitHub Actions)

`.github/workflows/ci.yml` runs typecheck, lint, slop-lint, tests and a build on every push. Pushes to `main` also deploy, once these are set in GitHub ? Settings ? Secrets and variables ? Actions:

- Secrets: `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers"), `CLOUDFLARE_ACCOUNT_ID`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GEMINI_API_KEY`
- Variable: `NEXT_PUBLIC_APP_URL`

Without the Cloudflare token the deploy step is skipped. `gemini-contract.yml` checks every night that Gemini still accepts the app's JSON formats (`pnpm test:gemini` runs it locally).

### Browser tests
- `pnpm test:e2e`: builds the app in demo mode (keys blanked) on :3100 and runs Playwright: create from the sample memo, rename, whole-deck AI pass with one slide kept, comment and resolve, restore a version, download .pptx and .pdf (files checked), present, Trash and restore, activation events, plus axe accessibility checks (fails on serious or critical problems). Runs in CI on every push and pull request; deploy waits for it. `E2E_SKIP_BUILD=1` reuses the last build.
- `pnpm test:e2e:cloud`: signed-in mode against a running app with real keys (`pnpm dev`, or `E2E_CLOUD_URL`). Needs `E2E_CLERK_USER_EMAIL`, an existing user in a Clerk development instance (`pk_test_` keys only). Adds share links with a password, a viewer comment from a signed-out browser, owner alerts, reload-from-server checks, and that Trash closes share links. It deletes its deck at the end. In CI it runs when the `E2E_CLOUD_URL` variable and the `E2E_CLERK_USER_EMAIL`, `E2E_CLERK_PUBLISHABLE_KEY`, `E2E_CLERK_SECRET_KEY` secrets are set.
- Not automated: a screen-reader pass over the slide canvas (NVDA or VoiceOver: select, edit text, move between slides).

### Migrations on deploy
Set the `SUPABASE_DB_URL` secret (Supabase → Connect → Session pooler connection string). The deploy job runs `supabase db push` before deploying, then calls `/api/health` and fails if a migration is missing. If you ran earlier migrations by hand in the SQL editor, tell the CLI once so it doesn't run them again:

```bash
npx supabase@2.121.0 migration repair --db-url "$SUPABASE_DB_URL" --status applied 20261014000000 20261015000000 20261015120000 20261016000000 20261017000000
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm test:gemini` | Sends every AI response format to the configured Gemini model (needs `GEMINI_API_KEY`) |
| `pnpm test` | Unit tests (deck schema, patches, scope rules, quality gates, deck review, alerts, webhook signatures, plan mapping) |
| `pnpm test:e2e` / `pnpm test:e2e:cloud` | Browser tests in demo mode / signed-in mode (see above) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm slop-lint` | Fails on banned copy and visuals from docs/06 (hype words, exclamation marks, gradients, glassmorphism, idle animation, emoji) |
| `pnpm run preview` | Build for Workers and run locally in workerd |
| `pnpm run deploy` | Build and deploy to Cloudflare |

## How it's put together

```
src/lib/deck/      Deck schema, JSON Patch + undo + scope rules, layouts, themes, motion timeline, quality gates
src/lib/ai/        Gemini client (REST, JSON schema output + one repair retry), prompts, offline engine, scoped edits
src/lib/billing/   Dodo client, Standard Webhooks verification (Web Crypto), plan mapping
src/lib/server/    Env config, Clerk token check, Supabase clients, error handling
src/lib/export/    Slide ? PowerPoint (native shapes, charts, animation XML), PDF, PNG
src/lib/client/    import.ts (file reading), assets.ts (photo cache, resize), and one UI-facing backend with two implementations: cloud (API) and demo (browser)
src/app/api/       assets, decks, ai/{outline,generate,edit}, billing/{checkout,portal}, webhooks/dodo, me
supabase/          SQL schema with RLS, deck limit trigger, AI credit functions
```

Design decisions worth knowing:
- **No Next.js proxy/middleware.** Next 16's proxy runs on Node.js, and OpenNext on Cloudflare doesn't support that yet. Instead, every API route verifies the Clerk token itself, and Supabase RLS checks access again.
- **The AI only fills slots.** Gemini returns content for named slots in a fixed layout list; the server builds the slide, assigns ids and motion, and runs the quality gates. It can't invent layouts or touch slides outside the selection.
- **Next.js is pinned to 16.3.8.** OpenNext 1.20.11 crashes on 16.4.0 (`Unexpected loadManifest(preview-props.json)`). Upgrade when OpenNext adds support.
- **`nodeLinker: hoisted`** in `pnpm-workspace.yaml` lets the Workers build run on Windows without Developer Mode (OpenNext otherwise needs symlinks).
- **One exception to doc 06's gradient rule.** Textures and gradients are allowed only in `src/components/marketing/marketing.css` (demo panels, CTA banner, story cards, hero edge). `slop-lint` allows that one file and nothing else.
- **Templates live in code** (`src/lib/deck/templates/`). A test requires every template to pass all quality gates with zero fixes, so add new ones the same way.

## Security notes
- All API routes need a valid Clerk session token, except the Dodo webhook (signed), `/api/health`, `/api/report` and `/api/abuse` (rate-limited; abuse reports also pass Turnstile when configured), and the share-link viewer routes `/api/v/*`. Those use the service role and check the link id, expiry, password and a signed viewer token themselves; viewer comments also need the owner to have turned comments on for that link, and are capped at 300 per link.
- Slack alert URLs must be `https://hooks.slack.com/services/…` (checked in the API and in the database), so a user can't make the server post to arbitrary addresses.
- The Supabase service role key is used only by the webhook, account deletion, the share-link viewer routes, alerts and `/api/health`. Everything else runs as the signed-in user, under RLS.
- Request bodies are size-limited and validated with Zod; error messages never include internal details.
- Rate limits are per user (and per IP for `/api/report`), applied per Cloudflare location. Monthly AI budgets are enforced in Postgres.
- The content security policy is report-only. Check `wrangler tail` for `csp_violation` lines for a week, then switch the header to `Content-Security-Policy` in `next.config.ts`.
- Not done yet: an outside security review.
