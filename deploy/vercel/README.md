# Clynect Chat — Vercel

Standalone mission and CV Copilot. This deployment uses its own Supabase project; it does not depend on or modify Pilotage. The root app continues to support Sites/Cloudflare D1.

## Deployment

Import `clynect-contact/chat` as a **new** Vercel project, set Root Directory to `deploy/vercel`, use the Vite preset, Node 24, `npm run build`, and output `dist`.

Run `supabase/copilot.sql` in the new Supabase project's SQL editor. It creates service-only tables and atomic quota/save functions. Keep RLS enabled. Schedule `public.clynect_copilot_purge()` daily to physically remove expired data; access expires after seven days even without the cleanup job.

Add these server-only Vercel environment variables (never prefix them with VITE_):

- `SUPABASE_URL`: the new Chat project's URL
- `SUPABASE_SERVICE_ROLE_KEY`: that project's backend key
- `OPENAI_API_KEY`: authorized OpenAI key
- `OPENAI_MODEL`: `gpt-5.5`
- `COPILOT_PROVIDER`: `openai`
- `COPILOT_ENABLED`: `true`
- `COPILOT_WRITES_ENABLED`: `true`
- `ACCESS_SESSION_SECRET`: a separate random secret of at least 32 bytes
- `COPILOT_RETENTION_DAYS`: `7`
- `COPILOT_HOURLY_LIMIT`: `30`
- `COPILOT_GLOBAL_HOURLY_LIMIT`: `100`

The public page opens directly and creates a signed anonymous browser session. The access-code gate is not used. Conversations belong to an HttpOnly signed browser cookie, not a Clynect account. Clearing cookies loses access to that browser's previous conversations. This is a public pilot with per-browser and global AI usage limits; mission publication, matching, pricing, account integration and sending support messages are not connected. Saving creates a private Copilot draft only.

Documents are limited to 4 MiB. Raw uploaded bytes are not retained. Text PDFs and DOCX are supported; scanned PDFs require OCR elsewhere.

## Validation

`npm ci`, `npm run build`, `npm run check:copilot`, `npm run test:copilot`.

Tests exercise the migration and atomic SQL functions in PGlite, ownership, request retries, quotas, expiry, draft edits/saves and document extraction. Test code never uses a live database or the OpenAI key.

Before each deployment, make a private backup of source/configuration and any live database data. Never commit secret files or backup archives.
