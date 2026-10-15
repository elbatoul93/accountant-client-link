# Delivery runbook

## Environments
- Frontend: Cloudflare Pages, project `accountant-client-link`. Every merge to `main` deploys; every PR gets a preview.
- Backend: Supabase project `kjdokftgjldqriwyeuox` (Postgres + RLS, auth, storage, edge function `g50-pdf`).
- Frontend env vars (set in Cloudflare Pages, Production and Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Both are public values. Never put the `service_role` key in the frontend or in Cloudflare build variables.
- Edge functions need no extra secrets (`g50-pdf` draws onto the bundled official form; see `supabase/functions/g50-pdf/assets/README.md`).

## Checks
The `Verify production deploy` workflow runs after every push to `main`: it waits for the Cloudflare Pages check on that commit and checks that the live site serves the CSP and HSTS headers. A red run means production did not update. Production is **https://managementik.com**, a custom domain on the same Cloudflare Pages project as `accountant-client-link.pages.dev` (Cloudflare's built-in address for the project; both serve the same build and use the same Supabase project). The workflow checks pages.dev first, then renders https://managementik.com/login in headless Chromium and fails on a blank page, a console error or a script served as HTML. It also reports (without failing) when managementik.com and pages.dev serve different builds; the two can lag each other.
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
`public/_headers` sets HSTS, nosniff, frame denial, referrer/permissions policies and an enforced Content-Security-Policy. Scripts must be same-origin (no inline `<script>`, including in `document.write` popups). If a new feature needs another origin (fonts, images, API, analytics), add it to the matching directive in `_headers`; a blocked resource shows as a "Refused to ..." console error. Error reporting (Sentry) and Cloudflare Web Analytics hosts are already allowed. The `e2e` job (`e2e/csp.spec.ts`) signs in as an accountant and as a client against the fake Supabase with the exact policy from `_headers` and fails on any violation, so a new blocked origin is caught on the PR (it exercises the dashboards' tabs, the add-client dialog and /account, not every dialog).

## Uptime

`.github/workflows/uptime.yml` checks https://managementik.com every hour (`scripts/uptime-check.mjs`: /login is HTML with #root and every script it references is served as JavaScript, three tries 20 s apart). On failure it opens one issue labelled `uptime` assigned to the owner and does not open another while it is open; when the check passes again it closes the issue. About 1 minute of Actions time per run, roughly 720 minutes a month. It cannot see a Supabase outage or a login that breaks without the page changing.

## Build limit

Cloudflare Pages builds every pushed commit, previews included, and the free plan caps builds per month. Skip flags in commit messages (`[skip ci]`, `[CI Skip]`, `[cf-pages skip]`) are NOT used: a squash merge copies the branch's commit messages into the commit on `main`, so a flag would skip the production deploy (and `[skip ci]` also skips the GitHub checks). The safe switch is in Cloudflare: project Settings > Builds > Branch control > Preview branches: None. Push once per PR.

## Lockfiles
Both `package-lock.json` (npm) and `bun.lock` (bun) are kept in sync; the `lockfiles` CI job fails if either drifts from `package.json`. After changing dependencies run `npm install` and `npx bun@1.2.15 install` and commit both (newer bun versions write lockfileVersion 2, which the bun on Cloudflare cannot parse, so use 1.2.15). `bun.lock` was regenerated from the public registry (the old one pointed at a private Lovable mirror that returns 403) and the stale binary `bun.lockb` was removed.
