# EV Charging History — the Volvo charging history the app doesn't give you

A mobile-first PWA where Volvo owners sign in and see **every charging session their car has ever had** — home, work, public, everywhere — with start/end locations, kWh delivered, and duration. Fills the gap left by the Volvo Cars app, which only logs sessions at Volvo's Public Charging partners. Built on Volvo's public APIs.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> Brand: this is the user-visible name. The repository, Cloud Run service, Artifact Registry repo, and Cloud SQL instance keep the internal identifier `volvo-charging` so the existing WIF binding, secrets, and infra references don't have to change.

Live at **https://ev.marat.online** — Cloud Run in `europe-north1` (Stockholm), Cloud Scheduler in `europe-west1` (Scheduler isn't offered in `europe-north1` yet).

## Why?

The Volvo Cars app shows the **current** charging state and a *Public Charging* history — but the latter only covers sessions at the public chargers Volvo has a payment partnership with. Plug in at home, at work, at a friend's place, or at any of the dozens of CPOs Volvo doesn't have a deal with, and there's no record of it anywhere: no kWh delivered, no start/end time, no location, no answer to "when did I plug in, where, for how long, and how many kWh did I add?"

This app fills that gap. It polls Volvo's official Connected Vehicle, Energy, and Location APIs every minute and derives a per-session log — every plug-in interval, regardless of where you charged or who runs the charger — that you can scroll through, export as JSON, or delete on demand.

It's a personal project, free, open source, and intentionally narrow in scope. Not affiliated with Volvo in any way.

## What works today

- One-page dashboard at `/dashboard`: SOC ring + target overlay, plug / charging / connection-type pills, range, charging power (W → kW normalised), live coordinates (📍 lat,lng) folded into the state card, auto-refresh every 15 s while the tab is visible. Below it: reverse-chronological session list with in-progress kWh + SOC computed on the fly.
- Vehicle switcher in the header when the user owns more than one VIN; single-vehicle users see no chrome.
- Installable PWA: web app manifest, app icons (incl. maskable + apple-touch), and a service worker that caches the dashboard HTML so "Add to Home Screen" works and you still see the last known state when offline.
- One-click "Sign in with Volvo ID" — real OAuth 2.0 + PKCE via `openid-client` using the app's own published credentials (server-side env vars, no per-user paperwork). A development-only test-token mode (`?mode=test`) is available when running locally with `NODE_ENV !== "production"`, for forking and tinkering without publishing your own Volvo app.
- Typed clients for **three** Volvo APIs generated from vendored OpenAPI specs:
  - **Energy API v2** (`state` + `capabilities`)
  - **Connected Vehicle v2** (`GET /vehicles`, `GET /vehicles/{vin}` — full surface available via generated types if needed later)
  - **Location v1** (`GET /v1/vehicles/{vin}/location` — GeoJSON Point)
- Every Volvo call goes through `src/lib/volvo/retry.ts`: exponential backoff + full jitter + `Retry-After` for 429/5xx, capped at 4 attempts.
- Drizzle schema + 4 migrations: users (with `active_vin`), encrypted credential storage (AES-256-GCM), refreshable Volvo tokens + per-API test-token slots, vehicles (model / year / battery / photos / live location), append-only `state_snapshots`, derived `charging_sessions` with start/end coordinates.
- GDPR endpoints: `POST /api/account/delete` (revokes refresh token at Volvo, then cascade-drops every row), `GET /api/account/export` (full JSON dump), `DELETE /api/vehicles/[vin]` (disconnect a single car).
- Privacy + Terms pages at `/privacy`, `/terms`. Site-wide footer disclaimer (*Not affiliated with AB Volvo / Volvo Car Group / Volvo Car USA LLC*). SEO landing at `/` with OG tags + JSON-LD `WebApplication`. `robots.txt` and `sitemap.xml` are generated.

## How it got here

The phases the project went through, in order:

| Phase | |
|---|---|
| ✅ 1 | Local-first vertical slice: BYOC OAuth (auth-code + PKCE) via `openid-client`, Connected Vehicle bootstrap, Energy state polling on demand, session derivation with Location |
| ✅ 2 | GitHub Actions CI: lint, typecheck, test, codegen-drift gate, Deploy workflow with WIF auth |
| ✅ 3 | Pre-publish hardening: 429 + Retry-After backoff, sign-out revokes Volvo refresh token, GDPR endpoints (delete account, export, disconnect vehicle), privacy + terms pages, SEO-ready landing page, rebrand to *EV Charging History* |
| ✅ 4 | Cloud Run + Cloud SQL (`db-f1-micro` Enterprise edition, europe-north1) + Artifact Registry + Secret Manager + WIF — provisioned by `infra/bootstrap.sh` |
| ✅ 5 | First production deploy through GHA. pnpm 11 with supply-chain `minimumReleaseAge=24h` enforced both locally and in the container. Custom domain `ev.marat.online` mapped (managed TLS) |
| ✅ 6 | `infra/scheduler.sh` runs the 1-min OIDC-authenticated tick from Cloud Scheduler in `europe-west1` (Scheduler isn't offered in `europe-north1`), driving polling independent of any browser session |
| ✅ 7 | PWA shell: `manifest.webmanifest`, app icons (incl. maskable + apple-touch), service worker registered in production. The SW network-first-caches the dashboard HTML so the last RSC-rendered state is what you see offline — there's no client-side state API to layer SWR over since `router.refresh()` re-fetches the HTML directly. Web Push intentionally skipped — Volvo's own app already notifies on session events. |
| ✅ 8 | App published with Volvo. OAuth flow uses server-side `VOLVO_CLIENT_ID` / `VOLVO_CLIENT_SECRET` / `VOLVO_VCC_API_KEY` (Secret Manager) — no per-user credential paperwork. |

## Quick start (local)

You need Node 24 (see `.nvmrc`), pnpm 11 (auto-installed via `corepack`), and Docker for the local Postgres.

```bash
# 1. Install deps & generate typed Volvo clients
pnpm install
pnpm gen:api

# 2. Bring up local Postgres
pnpm db:up
pnpm db:migrate

# 3. Local secrets
cp .env.example .env.local
# Required:
#   SESSION_SECRET       — random 32+ char string (e.g. openssl rand -base64 48)
#   DATA_ENCRYPTION_KEK  — random 32+ char string (same)
# Optional, for real OAuth locally:
#   VOLVO_CLIENT_ID, VOLVO_CLIENT_SECRET, VOLVO_VCC_API_KEY
#   — obtained by registering and publishing your own app at
#     developer.volvocars.com (see "Adding your Volvo credentials" below).

# 4. Run the app
pnpm dev
open http://localhost:3000
```

### Two sign-in paths

The home page exposes **Sign in with Volvo ID** (real OAuth via the app's own published credentials) by default. In local dev (`NODE_ENV !== "production"`) a second **Use test tokens** tab is also visible for developers who haven't published their own Volvo app yet. In production the test-token tab is hidden and `?mode=test` is silently ignored.

#### Path A — Sign in with Volvo ID

The app holds its own `VOLVO_CLIENT_ID`, `VOLVO_CLIENT_SECRET`, and `VOLVO_VCC_API_KEY` (from Secret Manager in prod, `.env.local` locally). End users just click **Sign in with Volvo ID**:

1. `GET /api/auth/start` reads the three env vars, runs OIDC discovery against `volvoid.eu.volvocars.com`, mints a PKCE verifier + state, parks them in the iron-session cookie, and 303s to Volvo's authorize endpoint with our `redirect_uri`.
2. After the user approves, Volvo bounces back to `/api/auth/callback`. We exchange the code (PKCE + state checked by `openid-client`), decode the `id_token` to identify the Volvo ID (`sub` claim becomes our user key), fetch the user's VIN list and `VehicleDetails` from Connected Vehicle, and persist tokens encrypted (AES-256-GCM keyed off `DATA_ENCRYPTION_KEK`).
3. Access tokens last 30 minutes; we refresh them automatically using the refresh token whenever a request is within 60 s of expiry, so the polling loop never carries an expired token.

#### Path B — Use a test access token (local dev only)

For developers who fork this repo and want to try it without publishing their own app at Volvo. Generate **test access tokens** at [developer.volvocars.com/apis/docs/test-access-tokens/](https://developer.volvocars.com/apis/docs/test-access-tokens/):

1. Select your application and check scopes `openid`, `energy:state:read`, `energy:capability:read`, `conve:vehicle_relation`, `location:read`.
2. Pair the token with **your own VIN** (not the demo car) so Connected Vehicle and Location return real data.
3. Open `http://localhost:3000/?mode=test`, paste the access token + VCC API key.

Test tokens expire after 30 minutes and **have no refresh token**, so polling stops working until you paste a fresh one. Treat this as a demo path; publish the app for unattended polling.

### Adding your Volvo credentials

You need a published Volvo developer application to run the OAuth flow against real users.

1. Go to [developer.volvocars.com](https://developer.volvocars.com/account/#your-api-applications), create an application.
2. Click **Publish** on it. In the publish form, select scopes `openid`, `energy:state:read`, `energy:capability:read`, `conve:vehicle_relation`, `location:read` and add your redirect URI (e.g. `https://your.domain/api/auth/callback` — Volvo doesn't accept localhost for published apps).
3. Once approved, the portal gives you a `client_id`, `client_secret`, and a primary VCC API key. Put them into `.env.local` for dev and into Secret Manager for prod:
   ```bash
   echo -n 'dc-...' | gcloud secrets create VOLVO_CLIENT_ID --replication-policy=automatic --data-file=-
   echo -n '...' | gcloud secrets create VOLVO_CLIENT_SECRET --replication-policy=automatic --data-file=-
   echo -n '...' | gcloud secrets create VOLVO_VCC_API_KEY --replication-policy=automatic --data-file=-
   gcloud secrets add-iam-policy-binding VOLVO_CLIENT_ID --member="serviceAccount:cloud-run-app@<PROJECT>.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
   # repeat the binding for the other two
   ```
4. The Deploy workflow already mounts these three secrets on Cloud Run (see [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) → `--update-secrets`). Push to `main` to roll a new revision that picks them up.

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
- **Rate limit**: 100 req/min per (Volvo ID, client ID) **and** a 10 000 req/day per-app quota. We poll Energy state every minute, call Location only on observable-state changes, and wrap every call in exponential backoff that respects `Retry-After`.
- **Published-app credentials**: real OAuth requires the three server-side env vars (`VOLVO_CLIENT_ID`, `VOLVO_CLIENT_SECRET`, `VOLVO_VCC_API_KEY`) to be set. If any is missing, `/api/auth/start` redirects back to the landing page with `?oauth_error=server_missing_volvo_credentials`.
- **Per-field statuses**: each Energy property is independently `OK` or `ERROR`. Capabilities can falsely claim support — handle per-field errors in UI.
- **Stale fields**: every property has its own `updatedAt`; the response is not "now". A parked car can have a 4-month-old `chargingCurrentLimit` alongside a minute-old SOC.

## Stack

- **Runtime**: Node 24 (pinned via `.nvmrc`, `package.json#engines`, and `node:24-alpine` in the Dockerfile), pnpm 11 with supply-chain `minimumReleaseAge=24h`.
- **App**: Next.js 16 (App Router, RSC, Turbopack), React 19, TypeScript, Tailwind 4.
- **Auth**: `openid-client` for Volvo OIDC + PKCE; `iron-session` for encrypted, 30-day session cookies; AES-256-GCM at rest for refresh tokens and VCC API keys.
- **DB**: Postgres 16 (Cloud SQL in prod, Docker locally) + Drizzle ORM + drizzle-kit migrations.
- **Volvo client**: `openapi-fetch` over types generated by `openapi-typescript` from vendored specs in `openapi/`.
- **Validation**: Zod for the small set of values OpenAPI types as plain `string` (enum-like fields).
- **PWA**: file-based `manifest.webmanifest`, app icons (SVG + maskable + apple-touch), service worker registered in production only.
- **Hosting**: Google Cloud Run + Cloud SQL Postgres in `europe-north1` (Stockholm), Cloud Scheduler for the per-minute tick in `europe-west1`, GitHub Actions deploy via Workload Identity Federation.

## Deploying to Google Cloud Run

Target region: **`europe-north1` (Stockholm)** for Cloud Run + Cloud SQL + Artifact Registry. Cloud Scheduler lives in **`europe-west1`** because Scheduler isn't offered in `europe-north1` yet — cross-region HTTP for a 1/min cron is negligible.

| Service | Allowance | Our footprint |
|---|---|---|
| Cloud Run | 2M req / 360k vCPU-s / 180k GiB-s memory per month, always-free | ≪ limits |
| Artifact Registry | 0.5 GB always-free | One image ~50–120 MB |
| Cloud Scheduler | 3 jobs/month always-free | 1 (`tick-1min`, in `europe-west1`) |
| Secret Manager | 6 versions, 10k accesses/month always-free | 7 secrets (`DB_PASSWORD`, `DATABASE_URL`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEK`, `VOLVO_CLIENT_ID`, `VOLVO_CLIENT_SECRET`, `VOLVO_VCC_API_KEY`) |
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

It does **not** create the three Volvo OAuth secrets (`VOLVO_CLIENT_ID`, `VOLVO_CLIENT_SECRET`, `VOLVO_VCC_API_KEY`) — you create those once your Volvo developer app is approved (see [Adding your Volvo credentials](#adding-your-volvo-credentials)).

At the end the script prints the four values you'll paste into GitHub.

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
2. Builds the multi-stage Docker image (`pnpm@11.3.0` enforced via `corepack` + the `packageManager` field — the in-container build also runs under `minimumReleaseAge=24h`) and pushes to Artifact Registry tagged `:${sha}` and `:latest`.
3. Spawns `cloud-sql-proxy` on the runner, connects drizzle-kit through `127.0.0.1:5432`, runs migrations against Cloud SQL.
4. `gcloud run deploy` — single shot. `--add-cloudsql-instances=<instance>` so the runtime gets a Unix socket at `/cloudsql/<instance>`, `--cpu-boost` for faster cold starts, `--max-instances=2` as a cost guard-rail, every secret mounted from Secret Manager (`DATABASE_URL`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEK`, `VOLVO_CLIENT_ID`, `VOLVO_CLIENT_SECRET`, `VOLVO_VCC_API_KEY`). Cloud Run does atomic revision swaps — if the new revision fails to become Ready, the previous one keeps serving.
5. Curls `/api/healthz` on the service URL as a smoke test.

If a deploy ever regresses, roll back with one line:
```bash
gcloud run services update-traffic volvo-charging \
  --region=europe-north1 --to-revisions=<prev-revision>=100
```

### 4. Custom domain (optional)

Already done for `ev.marat.online`. To map your own:

```bash
gcloud beta run domain-mappings create \
  --service=volvo-charging \
  --domain=<your.domain> \
  --region=europe-north1
```

`gcloud` prints the DNS records to add at your registrar (usually a `CNAME` to `ghs.googlehosted.com.` for a subdomain). Once DNS propagates, Google provisions a managed TLS cert automatically (~minutes). Then set the canonical URL so the OG tags + sitemap point at the real domain:

```bash
gcloud run services update volvo-charging \
  --region=europe-north1 \
  --update-env-vars=NEXT_PUBLIC_SITE_URL=https://<your.domain>
```

### 5. Per-minute tick

After the first deploy succeeds:

```bash
bash infra/scheduler.sh
```

This creates the `tick-1min` Cloud Scheduler job in **`europe-west1`** pointing at `/api/internal/tick` on the Cloud Run service in `europe-north1`, with OIDC auth using the `scheduler@` SA. The endpoint validates the OIDC token in code (see [`src/lib/internalAuth.ts`](./src/lib/internalAuth.ts)) — Cloud Run itself stays `--allow-unauthenticated` because the public site lives on the same service. The OIDC audience comparison uses the public origin via `publicOrigin(req)` so Cloud Run's internal `0.0.0.0:8080` bind doesn't get mistaken for the actual service URL.

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

## Contributing

This is a personal project, so I'm not actively soliciting feature contributions — but bug reports, security issues, and PRs that fix something obviously broken are very welcome. Open an issue or PR.

If you want a fundamentally different version (different stack, different scope, different storage backend), forking is encouraged — the pipeline is designed to be re-pointable.

## License

[MIT](./LICENSE) © 2026 Marat Dyatko. Not affiliated with AB Volvo, Volvo Car Group, Volvo Car USA LLC, or any other Volvo company. "Volvo" and Volvo API names are used descriptively to refer to their owner.
