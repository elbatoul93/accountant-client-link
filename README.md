# Accountant–Client Portal

React + Vite + Tailwind/shadcn front end on Supabase (auth, Postgres with RLS, storage, edge functions).

Production: https://managementik.com (Cloudflare Pages; `accountant-client-link.pages.dev` is Cloudflare's built-in address for the same project).

## Develop
```
npm ci
npm run dev      # http://localhost:8080
npm test
npm run lint
npm run build
```
Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
CI, releases and database deploys are described in [docs/DELIVERY.md](docs/DELIVERY.md).

## Source layout

```
src/
  features/      one folder per product area (auth, accountant, client, admin,
                 billing, chat, notifications, account, help, legal, landing);
                 each holds its screens, plus components/ and lib/ when it has them
  components/    shared UI: ui/ (shadcn), layout/ (header, logo, language
                 switcher), common/ (used by both accountant and client screens)
  lib/           shared logic: accounting/ (tax, payroll, engine), i18n/, formatting, vault
  hooks/         shared hooks
  contexts/      app-wide React context
  integrations/  Supabase client and generated types
  test/          unit tests and setup
supabase/        migrations, edge functions, tests (Supabase CLI path)
public/          static files, incl. the G50 template
```

## Database
Schema lives in `supabase/migrations`. Apply with `supabase link --project-ref <ref> && supabase db push`.
Edge function `g50-pdf` needs no secret and no third-party service: it draws the values onto a copy of the official G50 form kept in `supabase/functions/g50-pdf/assets` (regenerate with `node scripts/g50-overlay/build.mjs` after changing `public/templates/G50_template.xlsx`). Deploy: `supabase functions deploy g50-pdf`.

## Roles
Accountants self-register; clients can only sign up through an accountant's invite link. The role and accountant link
are stored in `profiles` and cannot be changed by users (see the RLS hardening migration).
