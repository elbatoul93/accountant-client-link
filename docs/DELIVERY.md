# Delivery runbook

## Environments
- Frontend: Cloudflare Pages, project `accountant-client-link`. Every merge to `main` deploys; every PR gets a preview.
- Backend: Supabase project `kjdokftgjldqriwyeuox` (Postgres + RLS, auth, storage, edge function `g50-pdf`).
- Frontend env vars (set in Cloudflare Pages, Production and Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Both are public values. Never put the `service_role` key in the frontend or in Cloudflare build variables.
- Edge function secret: `CLOUDCONVERT_API_KEY` (`supabase secrets set CLOUDCONVERT_API_KEY=...`).

## Checks
`.github/workflows/ci.yml` runs typecheck, lint, tests and build on every PR and push to `main`. Merge only when it is green.

## Releasing a change that needs a database change
Order matters, because `main` goes live as soon as it is merged and the database does not:

1. Merge nothing yet. Get the PR green.
2. Run the **Supabase deploy** workflow (Actions tab > Supabase deploy > Run workflow) with `dry_run` on. It lists the pending migrations.
3. Run it again with `dry_run` off (and `deploy_functions` on if an edge function changed). The `production` environment can require an approval.
4. Only then merge the frontend PR.

Manual alternative from a machine with the CLI: `supabase link --project-ref kjdokftgjldqriwyeuox && supabase db push && supabase functions deploy`.

Migrations must be backward compatible with the frontend currently live (add columns/functions first, remove them in a later release).

### Secrets the workflow needs (GitHub > Settings > Secrets and variables > Actions)
- `SUPABASE_ACCESS_TOKEN`: personal access token from https://supabase.com/dashboard/account/tokens
- `SUPABASE_DB_PASSWORD`: the project's database password (Supabase dashboard > Project Settings > Database)

## Security headers
`public/_headers` sets HSTS, nosniff, frame denial, referrer/permissions policies and an enforced Content-Security-Policy. Scripts must be same-origin (no inline `<script>`, including in `document.write` popups). If a new feature needs another origin (fonts, images, API, analytics), add it to the matching directive in `_headers`; a blocked resource shows as a "Refused to ..." console error. Error reporting (Sentry) and Cloudflare Web Analytics hosts are already allowed.

## Lockfiles
`package-lock.json` is the one CI uses. `bun.lock` / `bun.lockb` are leftovers from the Lovable template; do not edit them by hand.
