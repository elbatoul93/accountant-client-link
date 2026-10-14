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

## Database
Schema lives in `supabase/migrations`. Apply with `supabase link --project-ref <ref> && supabase db push`.
Edge function `g50-pdf` needs the `CLOUDCONVERT_API_KEY` secret: `supabase functions deploy g50-pdf`.

## Roles
Accountants self-register; clients can only sign up through an accountant's invite link. The role and accountant link
are stored in `profiles` and cannot be changed by users (see the RLS hardening migration).
