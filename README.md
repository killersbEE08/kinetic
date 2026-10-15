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
| New deck flow | Input → editable outline (reorder, merge, delete, layout hint, source chips) → style picker previewed with your content → slides stream in one by one |
| Deck engine | Zod schema, 20 layouts, 6 themes (contrast-tested), 9 motion presets, build steps, count-up numbers, SVG bar/line/KPI charts |
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
| Not built yet | Brand kit editor, share links, MP4 export, teams, text recognition for scanned PDFs |

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

## Deploy to Cloudflare

```bash
pnpm exec wrangler login
# Secrets (server-only)
pnpm exec wrangler secret put CLERK_SECRET_KEY
pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY
pnpm exec wrangler secret put GEMINI_API_KEY
pnpm exec wrangler secret put DODO_PAYMENTS_API_KEY
pnpm exec wrangler secret put DODO_PAYMENTS_WEBHOOK_KEY
pnpm exec wrangler secret put DODO_PRODUCT_PRO
pnpm exec wrangler secret put DODO_PRODUCT_TEAM
pnpm exec wrangler secret put NEXT_PUBLIC_APP_URL      # e.g. https://kinetic.example.com
pnpm run deploy
```

`NEXT_PUBLIC_*` values (Clerk publishable key, Supabase URL and publishable key) are built into the browser bundle, so they must be in `.env.local` (or your CI environment) **when you run `pnpm run deploy`**.

To test in the real Workers runtime locally, copy `.dev.vars.example` → `.dev.vars` and run `pnpm run preview` (serves on :8787).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm test` | Unit tests (deck schema, patches, scope rules, quality gates, webhook signatures, plan mapping) |
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
- All API routes need a valid Clerk session token, except the Dodo webhook, which needs a valid signature less than 5 minutes old. Duplicate webhook deliveries are ignored.
- The Supabase service role key is used only by the webhook. Everything else runs as the signed-in user, under RLS.
- Request bodies are size-limited and validated with Zod; error messages never include internal details.
- Not done yet: per-IP rate limiting (add Cloudflare rate-limiting rules or a KV counter before launch), CSP headers, and an outside security review.
