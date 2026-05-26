# Volvo Charging

A mobile-first PWA where Volvo owners sign in and see their car's **current charging status** plus **derived charging-session history** with start/end locations — built on Volvo's public APIs.

Currently in Phase 1: a local-first vertical slice that server-renders live Energy state for a given VIN using developer-portal credentials.

## What works today

- `GET /dashboard` server-renders the current Energy API state for a single VIN: battery %, range, plug/charging status, target SOC, power, ETA-to-target.
- Typed clients for **three** Volvo APIs generated from vendored OpenAPI specs:
  - **Energy API v2** (`state` + `capabilities`)
  - **Connected Vehicle v2** (only `GET /vehicles` and `GET /vehicles/{vin}` used; rest of the surface available via generated types)
  - **Location v1** (`GET /v1/vehicles/{vin}/location` — GeoJSON Point)
- Drizzle schema + initial migration for users, encrypted credential storage, vehicles, append-only `state_snapshots`, and derived `charging_sessions` with start/end coordinates.

## What's next

| Phase | |
|---|---|
| ✅ 1 | Local-first vertical slice: BYOC OAuth (auth-code + PKCE) via `openid-client`, Connected Vehicle bootstrap, Energy state polling on demand, session derivation with Location |
| 2    | 1-min Cloud Scheduler tick — server-side polling without a user in the request |
| 3    | PWA: install prompt + offline shell + Web Push for "charging complete" |
| 4    | GitHub Actions CI (lint, typecheck, test, codegen-drift gate) |
| 5    | Cloud Run + Cloud SQL + Cloud Scheduler bootstrap, GHA deploy via Workload Identity Federation |
| 6    | Volvo publish approval for our app → drop BYOC requirement; custom domain |

Full plan: `~/.claude/plans/i-want-to-build-zippy-sparkle.md`.

## Quick start (local)

```bash
# 1. Install deps & generate typed Volvo clients
pnpm install
pnpm gen:api

# 2. Bring up local Postgres
pnpm db:up
pnpm db:migrate

# 3. Generate local-only secrets
cp .env.example .env.local
# Then put random 32+ char strings in SESSION_SECRET and DATA_ENCRYPTION_KEK
# e.g.  openssl rand -base64 48

# 4. Run the app
pnpm dev
open http://localhost:3000
```

### Two sign-in paths

The home page lets you choose between **Sign in with Volvo ID** (real OAuth) and **Use a test
token** (fallback for apps you haven't published yet).

#### Path A — Sign in with Volvo ID (recommended once your app is published)

Configure your Volvo API application at
[developer.volvocars.com](https://developer.volvocars.com/account/#your-api-applications):

1. Click **Publish** on your application. **Volvo issues your `client_id` and `client_secret`
   immediately upon submission**, so you can self-test against your own Volvo ID before manual
   review completes.
2. In the Publish form, select scopes: `openid`, `energy:state:read`, `energy:capability:read`,
   `conve:vehicle_relation`, `location:read`.
3. Add the redirect URI `http://localhost:3000/api/auth/callback`.
4. Paste `client_id`, `client_secret`, and the **VCC API key (Primary)** into the home page form.
5. You're redirected to `volvoid.eu.volvocars.com` to authorize, then bounced back to
   `/api/auth/callback`. We exchange the code with PKCE, decode the `id_token` to identify your
   Volvo ID, fetch your VIN list and `VehicleDetails` from Connected Vehicle, and persist
   everything encrypted (AES-256-GCM keyed off `DATA_ENCRYPTION_KEK`).
6. Access tokens last 30 minutes; we refresh them automatically using the refresh token
   whenever a request is within 60 s of expiry, so the polling loop never carries an expired
   token.

#### Path B — Use a test access token (works without publishing)

Until your app is published, the developer portal only exposes VCC API keys — no `client_id` /
`client_secret`. For development you can generate **test access tokens** at
[developer.volvocars.com/apis/docs/test-access-tokens/](https://developer.volvocars.com/apis/docs/test-access-tokens/):

1. Select your application and check scopes `openid`, `energy:state:read`,
   `energy:capability:read`, `conve:vehicle_relation`, `location:read`.
2. Pair the token with **your own VIN** (not the demo car) so Connected Vehicle and Location
   return real data.
3. On the home page, switch to "Use a test token" and paste the access token + VCC API key.

Test tokens expire after 30 minutes and **have no refresh token**, so polling stops working
until you paste a fresh one. Treat this as a demo path; publish the app for unattended polling.

## How the Volvo APIs fit together

```
       OAuth (Volvo ID, PKCE)               ← user grants access
                │
   ┌────────────┴────────────┐
   │ access_token + vcc-api-key (header)
   ▼
┌──────────────────────────────┐      onboarding only (×1, weekly refresh)
│ Connected Vehicle v2         │
│  GET /vehicles               │ → list user's VINs
│  GET /vehicles/{vin}         │ → modelYear, batteryCapacityKWH, exteriorImageUrl
└──────────────────────────────┘
┌──────────────────────────────┐      every 1 min while signed in
│ Energy v2                    │
│  GET /v2/vehicles/{vin}/state│ → SOC, plug, power, target …
│       /capabilities          │ → which fields are observable
└──────────────────────────────┘
┌──────────────────────────────┐      on session start & end (×2/session)
│ Location v1                  │
│  GET /v1/vehicles/{vin}/loc. │ → GeoJSON Point [lng, lat, alt?]
└──────────────────────────────┘
```

Sessions don't exist in the API. We poll Energy state every minute, write a `state_snapshots` row when **any** observable field changes, then derive `charging_sessions` on each transition: a `DISCONNECTED → CONNECTED*` flip opens a row (+ fetches location for `start_lat/lng`); the reverse closes it (+ fetches `end_lat/lng`, computes `energy_kwh` from SOC delta × pack capacity).

## Important caveats

- **Public regions**: EU/MEA + US/CA/LatAm only. Asia/Pacific is unsupported.
- **Supported cars**: BEVs (EX30/EX40/EX90) + recent PHEVs (XC60/S90/V90 MY2022+, XC90/S60/V60 MY2023+).
- **Rate limit**: 100 req/min per (Volvo ID, client ID). We use ~1/min/VIN steady-state, well under.
- **Publish approval**: a true "Sign in with Volvo ID" experience requires Volvo to approve a Published app. Until then, the BYOC mode asks each user to plug in their own Volvo developer client ID/secret/api-key.
- **Per-field statuses**: each Energy property is independently `OK` or `ERROR`. Capabilities can falsely claim support — handle per-field errors in UI.
- **Stale fields**: every property has its own `updatedAt`; the response is not "now". A parked car can have a 4-month-old `chargingCurrentLimit` alongside a minute-old SOC.

## Stack

- **App**: Next.js 16 (App Router, RSC, Turbopack), React 19, TypeScript, Tailwind 4.
- **DB**: Postgres 16 (Cloud SQL in prod, Docker locally) + Drizzle ORM + drizzle-kit migrations.
- **Volvo client**: `openapi-fetch` over types generated by `openapi-typescript` from vendored specs in `openapi/`.
- **Validation**: Zod for the small set of values OpenAPI types as plain `string` (enum-like fields).
- **Hosting (planned)**: Google Cloud Run, GitHub Actions deploy via Workload Identity Federation, Cloud Scheduler for the per-minute tick.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Run Next.js with Turbopack |
| `pnpm build` | Production build |
| `pnpm gen:api` | Regenerate typed Volvo clients from OpenAPI specs |
| `pnpm db:up` / `db:down` | Start / stop local Postgres |
| `pnpm db:generate` | Generate a new Drizzle migration from schema diff |
| `pnpm db:migrate` | Apply migrations |
| `pnpm test` | Run Vitest |
| `pnpm lint` | ESLint |

See [AGENTS.md](./AGENTS.md) for the project's rules-of-the-road when modifying code.
