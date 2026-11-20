# Kelvin’s POS

Kelvin’s POS is a React and Vite retail point-of-sale application backed by Supabase Auth and PostgreSQL.

## Run locally

Use Node.js 22. Copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using the intended Supabase project’s public client configuration.

```sh
cd frontend
npm ci
npm run dev
npm run build
```

The production frontend is hosted on Vercel with `frontend` as its root. Supabase migrations and the `register-staff` Edge Function are under `supabase/`. Staff need an authorized account for the configured project.

Local environment files, CLI state, and shop data stay outside the public repository. Older prototype modules are included for reference and have no production routes.
