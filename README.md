# Managementik

A web platform that connects accountants with their clients. Accountants sign up directly and invite clients through invite links; both sides get their own dashboard.

See the [requirements document](docs/REQUIREMENTS-1.0.md) ([العربية](docs/REQUIREMENTS-1.0.ar.md)) for the full feature set.

## Tech stack

- React + TypeScript, built with Vite
- Tailwind CSS and shadcn/ui
- Supabase (auth, Postgres database, edge functions)
- Vitest for tests

## Getting started

Requires Node.js 18+.

```sh
npm install
```

Create a `.env` file in the project root with your Supabase project's credentials:

```sh
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-public-key>
```

Then start the dev server:

```sh
npm run dev
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run the test suite once |

## Supabase

Database migrations live in `supabase/migrations` and edge functions in `supabase/functions`. Apply them with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```sh
supabase link --project-ref <project-id>
supabase db push
supabase functions deploy
```

Email confirmation is enabled for sign-ups. In the Supabase dashboard, under **Authentication → URL Configuration**, set the **Site URL** to the production domain and add `https://<your-domain>/login` to **Redirect URLs** so confirmation links work.

## Deployment

The app is a static site: run `npm run build` and deploy the `dist/` folder to any static host, with the `VITE_SUPABASE_*` environment variables set at build time. Configure the host to serve `index.html` for all routes (client-side routing).
