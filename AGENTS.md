# Agents

## Cursor Cloud specific instructions

### Overview

**Mileage Tracker Pro** is a Next.js 16 (App Router) single-page web app for tracking business mileage. It uses Supabase for auth and database, with optional Google Gemini API for AI trip parsing.

### Running the app

- `npm run dev` starts the Next.js dev server (default port 3000).
- Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. Without valid Supabase credentials the app renders but auth/data calls fail with "Failed to fetch".
- The root route (`/`) is a server component that redirects unauthenticated users to `/auth/login`.

### Lint / Build / Test

- `npm run lint` — runs ESLint. Note: `eslint` is **not** in `devDependencies` (v0-generated project), so this command fails with "eslint: not found" out of the box. To fix, run `npm install --save-dev eslint eslint-config-next`.
- `npm run build` — runs `next build`. TypeScript errors are ignored via `typescript.ignoreBuildErrors: true` in `next.config.mjs`.
- No automated test framework is configured (no Jest, Vitest, or Playwright).

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous API key |
| `GEMINI_API_KEY` | No | Google Gemini API key (AI trip assistant) |
| `GOOGLE_MAPS_API_KEY` | No | Google Maps Directions API (distance lookup) |

### Gotchas

- The app uses `next/font/google` (Montserrat). First dev server start may be slow due to font download.
- `package-lock.json` is present — always use `npm` (not pnpm/yarn).
- Admin scripts in `scripts/` require `SUPABASE_SERVICE_ROLE_KEY` and are not part of normal dev workflow.
