# Delivery runbook

## Environments
- Frontend: Cloudflare Pages, project `accountant-client-link`. Every merge to `main` deploys; every PR gets a preview.
- Backend: Supabase project `kjdokftgjldqriwyeuox` (Postgres + RLS, auth, storage, edge function `g50-pdf`).
- Frontend env vars (set in Cloudflare Pages, Production and Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Both are public values. Never put the `service_role` key in the frontend or in Cloudflare build variables.
- Edge function secret: `CLOUDCONVERT_API_KEY` (`supabase secrets set CLOUDCONVERT_API_KEY=...`).

## Checks
The `Verify production deploy` workflow runs after every push to `main`: it waits for the Cloudflare Pages check on that commit and checks that the live site serves the CSP and HSTS headers. A red run means production did not update. `SITE_URL` in the workflow is the default pages.dev address; change it if a custom domain is used.
`.github/workflows/ci.yml` runs typecheck, lint, tests and build on every PR and push to `main`. Merge only when it is green.

## Database tests
`scripts/test-db.sh` (`npm run test:db`) applies every file in `supabase/migrations` to an empty PostgreSQL database, using stand-ins for Supabase's `auth` and `storage` schemas (`supabase/tests/bootstrap.sql`), then runs `supabase/tests/*.test.sql`. CI runs it as the `database` job against a Postgres 15 service container; locally it starts a throwaway server if PostgreSQL is installed (or set `DATABASE_URL`). `rls.test.sql` covers signup, invite and activation flows and tenant isolation. Add a check there whenever a policy or trigger changes. Migrations must apply cleanly from scratch, so write new ones to be safe on a fresh database.

## Browser tests
`npm run test:e2e` (CI job `e2e`) builds the app against a fake Supabase origin and drives Chromium through sign-up, email confirmation, sign-in, the pending-accountant screen, session restore on reload and route guards. `e2e/fakeSupabase.ts` answers the Auth and REST calls inside the browser, so no database is needed; real triggers and RLS are covered by the `database` job. Locally run `npx playwright install chromium` once (or set `PW_CHROMIUM_PATH` to an existing Chromium). When the sign-in or sign-up screens change, update the selectors in `e2e/auth.spec.ts`.

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
Both `package-lock.json` (npm) and `bun.lock` (bun) are kept in sync; the `lockfiles` CI job fails if either drifts from `package.json`. After changing dependencies run `npm install` and `npx bun@1.2.15 install` and commit both (newer bun versions write lockfileVersion 2, which the bun on Cloudflare cannot parse, so use 1.2.15). `bun.lock` was regenerated from the public registry (the old one pointed at a private Lovable mirror that returns 403) and the stale binary `bun.lockb` was removed.
