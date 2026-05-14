# datamapr

CSV → HubSpot ingestion portal. Connect a HubSpot account, upload data from a CSV / Airtable / Google Sheet, map columns to HubSpot properties (auto-create missing ones), normalize + validate + dedup before importing, and review every successful and failed record in import history.

## Tech stack

- **Next.js 15** (App Router, React 19, TypeScript)
- **Tailwind CSS v4** + shadcn/ui (Radix primitives)
- **Supabase** for auth (Google OAuth + email/password) and persistence
- **HubSpot CRM API** for record creation and property management
- **papaparse** for CSV parsing

## Prerequisites

- Node.js 20+
- A Supabase project — needs Auth enabled (email + Google provider) and the SQL migrations below applied
- A HubSpot private app token with the relevant CRM scopes (entered in-app per portal, no env var)

## Setup

```bash
git clone <repo-url>
cd datamapr
npm install
cp .env.local.example .env.local   # then fill in values (see below)
npm run dev
```

App runs at `http://localhost:3000`.

### Environment variables

All four values come from your Supabase project's **Settings → API** page. The `NEXT_PUBLIC_*` pair is used in the browser (auth); the unprefixed pair is used server-side (data writes). They hold the same values, just exposed at different layers.

| Variable | Used by |
|---|---|
| `SUPABASE_URL` | Server-side DB access from API routes |
| `SUPABASE_PUBLISHABLE_KEY` | Server-side DB access from API routes |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-side Supabase auth client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-side Supabase auth client |

### Database migrations

Run each file in `supabase/migrations/` against your Supabase project (SQL editor in the Supabase dashboard), in order:

1. `0001_data_source_credentials.sql` — HubSpot tokens + other source credentials
2. `0002_object_validation_rules.sql` — per-object validation profiles
3. `0003_import_history.sql` — one row per import with JSONB success/failure records
4. `0004_update_table_anon_role.sql` — RLS policy adjustments for the anon role

All files use `create … if not exists` and `drop policy if exists`, so re-running is safe.

### Auth callback configuration

In Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` (for local dev) and your production URL
- **Redirect URLs**: `http://localhost:3000/auth/callback` and `https://<your-deployment>/auth/callback`

For Google sign-in, add `https://<your-supabase-project>.supabase.co/auth/v1/callback` to the Google Cloud Console OAuth client's authorized redirect URIs.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build locally |
| `npm run lint` | ESLint (Next.js + Prettier rules) |
| `npm run format` | Prettier write |

## Project structure

```
src/
├── app/
│   ├── (app)/             # Authenticated app shell
│   │   ├── page.tsx       # Main import flow (Source → Destination → Mapping → Review)
│   │   ├── settings/      # Validation rule profiles per object
│   │   ├── hubspot-accounts/  # Manage HubSpot portal connections
│   │   └── import-history/    # Past imports with success/failure records
│   ├── api/               # Route handlers (HubSpot, Supabase, pipeline)
│   └── auth/login/        # Supabase Auth UI
├── components/            # UI (shadcn) + app-specific components
├── lib/
│   ├── pipeline/          # Multi-stage ingestion: normalize → validate → map → dedup → import
│   ├── hubspot/           # Token resolver + resilient fetch wrapper (429/5xx backoff)
│   ├── supabase/          # Server + browser clients, middleware session sync
│   ├── validators.ts      # Per-field validation (email / phone / url / domain)
│   └── required-headers.ts  # Per-object required-identifier preflight
supabase/migrations/       # SQL files to apply to your Supabase project
```

## Deployment

A step-by-step Vercel deployment guide for the Hobby tier lives at `C:\Users\Jeson\.claude\plans\now-i-want-to-woolly-trinket.md`. Key caveat: the streaming `/api/pipeline` route is bound by Vercel's 10-second function timeout on Hobby — split large imports into batches of ~50–100 rows or upgrade to Pro and set `export const maxDuration = 300` on that route.

## Notable design choices

- **HubSpot calls are wrapped** in [`hubspotFetch`](src/lib/hubspot/fetch.ts) — exponential backoff with jitter on `429` and `5xx`, honors `Retry-After`. Other 4xx pass through unchanged so callers can handle 409-as-success in property creation.
- **Property creation can reuse existing.** If you ask the auto-create flow to make a property whose label already exists in HubSpot under a different internal name, the server reads the existing property and returns it as `reused: true`; the client then rewrites the column mapping so data flows into the existing property.
- **Required-header preflight** ([`src/lib/required-headers.ts`](src/lib/required-headers.ts)) blocks "Continue" from Mapping until at least one source column maps to the object's identifier (`email` for contacts, `name`/`domain` for companies, etc.). Alias-aware via `HS_OBJECTS.<id>.nameAliases`.
- **Empty-cell trap is handled.** [`normalize.ts`](src/lib/pipeline/normalize.ts) turns blank strings into `null`, and [`import.ts`](src/lib/pipeline/import.ts) skips `null`/`undefined` properties so empty cells never wipe existing HubSpot values.
- **Import history is one row, atomically.** Each migration writes a single `import_history` row with `successful_records` and `failed_records` as JSONB arrays — failures include the source row's values and the stage that rejected them, exportable as a CSV from the History page.

## License

Private — internal tooling.
