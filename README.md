# EV Charging History

A mobile-first PWA where Volvo owners sign in and see their car's **current charging status** plus **derived charging-session history** with start/end locations — built on Volvo's public APIs.

> Brand: this is the user-visible name. The repository, Cloud Run service, Artifact Registry repo, and Cloud SQL instance keep the internal identifier `volvo-charging` so the existing WIF binding, secrets, and infra references don't have to change.

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

A "session" here is the **plug interval**, not the active-charging interval. The session opens when the cable goes in and stays open until it comes out — `chargingStatus` (IDLE / CHARGING / DONE) does not trigger a transition. So a charge that hits the target SOC and pauses, or gets load-balanced, remains one session for the whole plug-in time. This matches what humans usually mean by "this charge" and prevents fragmenting one physical session into many when the car briefly stops drawing power.

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
- **Hosting**: Google Cloud Run + Cloud SQL Postgres in `europe-north1` (Stockholm), Cloud Scheduler for the per-minute tick, GitHub Actions deploy via Workload Identity Federation.

## Deploying to Google Cloud Run

Target region: **`europe-north1` (Stockholm)** for everything.

| Service | Allowance | Our footprint |
|---|---|---|
| Cloud Run | 2M req / 360k vCPU-s / 180k GiB-s memory per month, always-free | ≪ limits |
| Artifact Registry | 0.5 GB always-free | One image ~50–120 MB |
| Cloud Scheduler | 3 jobs/month always-free | 1 (`tick-1min`) |
| Secret Manager | 6 versions, 10k accesses/month always-free | 4 secrets |
| Workload Identity Federation | unlimited | — |
| Cloud Logging | 50 GiB/month always-free | — |
| **Cloud SQL Postgres** | **no free tier — see below** | db-f1-micro, 10 GB SSD, zonal, no HA, no backups → ~**$9/month** |

Postgres is the only line item that costs money on GCP — there's no Cloud SQL free tier, and Compute Engine's always-free `e2-micro` is only available in three US regions, not Stockholm. If you want zero infra spend instead, swap `DATABASE_URL` to a free Postgres hosted elsewhere (Neon's free plan in AWS `eu-north-1` is the closest geographically, ~5 ms from Cloud Run). The pipeline doesn't care which Postgres you point it at.

### 1. One-shot GCP setup

Edit `PROJECT_ID` and `GITHUB_REPO` at the top of `infra/bootstrap.sh`, then:

```bash
gcloud config set project <YOUR_PROJECT_ID>
bash infra/bootstrap.sh
```

The script is idempotent — re-runs safely. It:

- enables the APIs (Run, Artifact Registry, Scheduler, Secret Manager, SQL Admin, STS, IAM Credentials);
- creates the Artifact Registry Docker repo;
- creates three service accounts (`app@`, `deployer@`, `scheduler@`) with minimal roles, including `cloudsql.client` on `app@` and `deployer@`;
- wires Workload Identity Federation so GitHub Actions can mint short-lived OIDC tokens for `deployer@` — no long-lived JSON keys;
- provisions Cloud SQL Postgres 16 (`db-f1-micro`, zonal, 10 GB SSD, no backups, deletion protection on) — this is the slow step, ~5–10 minutes the first time;
- creates the `volvo` database and `volvo` user with a generated 32-char alphanumeric password stored in Secret Manager as `DB_PASSWORD`;
- writes `DATABASE_URL` (Unix-socket form pointing at `/cloudsql/<instance>` for Cloud Run), `SESSION_SECRET`, and `DATA_ENCRYPTION_KEK` to Secret Manager.

At the end it prints the four values you'll paste into GitHub.

### 2. GitHub repository variables

In **Settings → Secrets and variables → Actions → Variables**, add four **repository variables**:

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | `<your project id>` |
| `GCP_PROJECT_NUMBER` | numeric |
| `GCP_DEPLOYER_SA` | `deployer@<project>.iam.gserviceaccount.com` |
| `GCP_WIF_PROVIDER` | `projects/<NUMBER>/locations/global/workloadIdentityPools/github/providers/github-provider` |

No GitHub *secrets* are needed.

### 3. First deploy

Push any commit to `main`. The [`Deploy` workflow](./.github/workflows/deploy.yml):

1. Authenticates as `deployer@` via WIF.
2. Builds the multi-stage Docker image and pushes to Artifact Registry (tagged `:${sha}` and `:latest`).
3. Spawns `cloud-sql-proxy` on the runner, connects drizzle-kit through `127.0.0.1:5432`, runs migrations against Cloud SQL.
4. Deploys a no-traffic revision with `--add-cloudsql-instances=<instance>` so the runtime gets a Unix socket at `/cloudsql/<instance>`. `DATABASE_URL` from Secret Manager points there.
5. Curls `/healthz` on the revision URL.
6. Flips 100% traffic to the new revision.

### 4. Per-minute tick

After the first deploy succeeds:

```bash
bash infra/scheduler.sh
```

This creates the `tick-1min` Cloud Scheduler job pointing at `/api/internal/tick`, with OIDC auth using the `scheduler@` SA. The endpoint validates the OIDC token in code (see [`src/lib/internalAuth.ts`](./src/lib/internalAuth.ts)) — Cloud Run itself stays `--allow-unauthenticated` because the public site lives on the same service.

### Cost guard-rails

- `--max-instances=2` on Cloud Run caps autoscaling, so a request storm can't run up the bill.
- `--min-instances=0` keeps the service cold when idle.
- Artifact Registry: prune old images periodically if you push past 0.5 GB:
  ```bash
  gcloud artifacts docker images list europe-north1-docker.pkg.dev/<PROJECT>/volvo-charging/app
  gcloud artifacts docker images delete <IMAGE@sha256:…>
  ```
- Cloud SQL has `--no-backup` and `--availability-type=zonal` (no HA) to keep the cost at the floor. If you want point-in-time recovery, run `gcloud sql instances patch volvo-db --backup-start-time=03:00 --enable-point-in-time-recovery` — adds storage cost for retained WAL.

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
