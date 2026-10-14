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
`public/_headers` sets HSTS, nosniff, frame denial, referrer and permissions policies. The Content-Security-Policy is in Report-Only mode because the payslip and liasse print popups write an inline `<script>`; once those call `w.print()` from the opener, rename the header to `Content-Security-Policy` to enforce it.

## Lockfiles
Both `package-lock.json` (npm) and `bun.lock` (bun) are kept in sync; the `lockfiles` CI job fails if either drifts from `package.json`. After changing dependencies run `npm install` and `npx bun@1.2.15 install` and commit both (newer bun versions write lockfileVersion 2, which the bun on Cloudflare cannot parse, so use 1.2.15). `bun.lock` was regenerated from the public registry (the old one pointed at a private Lovable mirror that returns 403) and the stale binary `bun.lockb` was removed.
