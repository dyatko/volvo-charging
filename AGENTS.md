<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (16.2.6) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Quick reference for what is new vs. older Next:
- Turbopack is the default for both `dev` and `build` (no `--turbopack` flag needed).
- Async Request APIs are mandatory: `cookies()`, `headers()`, `draftMode()`, and `params` / `searchParams` props are all `Promise`-shaped — `await` them.
- `next lint` is gone; use the ESLint CLI directly.
- `middleware` is being renamed to `proxy`.
- `turbopack` is a top-level field in `next.config.ts`, no longer under `experimental.turbopack`.
- Use `next typegen` to refresh `PageProps`, `LayoutProps`, `RouteContext` helpers after route changes.
<!-- END:nextjs-agent-rules -->

# EV Charging History — agent notes

## Project shape

```
src/
├── app/
│   ├── page.tsx                # SEO landing + sign-in tabs (signed-in users → /dashboard)
│   ├── dashboard/page.tsx      # One-pager: SOC ring + sessions list + Refresh button + DangerZone
│   ├── privacy/page.tsx        # GDPR-aware data + retention disclosure
│   ├── terms/page.tsx          # Not-affiliated-with-Volvo language, Swedish law
│   ├── robots.ts / sitemap.ts  # Generated metadata
│   └── api/
│       ├── healthz/route.ts    # Cloud Run smoke target (NOT /healthz — see Rules of the road)
│       ├── internal/tick/      # Cloud Scheduler target; OIDC-verified
│       ├── auth/{start,callback,signout,test-mode}/
│       ├── account/{delete,export}/
│       ├── vehicles/[vin]/, vehicles/active/, poll/
├── db/
│   ├── client.ts               # Drizzle + node-postgres pool (lazy, survives next-build)
│   └── schema.ts               # users / volvo_credentials / volvo_tokens / vehicles /
│                               # state_snapshots / charging_sessions
└── lib/
    ├── origin.ts               # publicOrigin(req) / publicUrl(req, path)
    ├── session.ts              # iron-session wrapper
    ├── crypto.ts               # AES-256-GCM at-rest encryption
    ├── oauth.ts                # openid-client wrapper + RFC-7009 revoke
    ├── userVehicle.ts          # loadUserContext: per-API credsFor + active vehicle
    ├── vehicleBootstrap.ts     # bootstrapVehiclesFromConve (handles { data: … } wrapper)
    ├── polling.ts              # pollOne + pollAllVehicles + session derivation
    ├── internalAuth.ts         # OIDC verification for /api/internal/*
    └── volvo/
        ├── client.ts           # makeEnergyClient / makeConveClient / makeLocationClient
        ├── retry.ts            # withRetry(): exp-backoff + jitter + Retry-After
        ├── state.ts            # readField helper for per-field OK|ERROR union
        ├── energy.gen.ts       # generated — do not edit
        ├── conve.gen.ts        # generated — do not edit
        └── location.gen.ts     # generated — do not edit

openapi/                        # vendored OpenAPI specs (source of truth)
drizzle/                        # generated SQL migrations (committed)
infra/                          # bootstrap.sh + scheduler.sh (one-shot GCP setup)
scripts/refresh-vehicle-details.ts   # one-off Connected Vehicle backfill
docker-compose.yml              # local Postgres 16
drizzle.config.ts
Dockerfile                      # multi-stage Node 22 + standalone Next 16
.github/workflows/              # ci.yml, deploy.yml (WIF auth, cloud-sql-proxy migrate)
pnpm-workspace.yaml             # onlyBuiltDependencies allow-list (pnpm 11 supply-chain)
```

## Rules of the road

- **Specs are the source of truth.** When the Volvo API surface changes, replace files in `openapi/` and re-run `pnpm gen:api`. Never hand-edit `*.gen.ts`.
- **Per-field statuses.** Every Energy `state` property is `{status: "OK", value, unit?, updatedAt}` or `{status: "ERROR", code, message}`. Always route through `readField()` instead of accessing `.value` directly.
- **Per-field freshness.** Each property carries its own `updatedAt`. A response is not "now"; treat each field independently. Use the max changed `updatedAt` as `observed_at` for `state_snapshots` rows.
- **Capabilities can lie.** A capability with `isSupported: true` can still come back as `ERROR PROPERTY_NOT_FOUND` in state. Always handle the error branch in the UI.
- **Dedup on change.** A new `state_snapshots` row is only written when at least one observable field actually changed since the previous row. Unique index on `(vin, observed_at)` enforces it.
- **Rate budget.** 100 req/min per (Volvo ID, client ID) AND a 10 000 req/day per-app quota. Default polling cadence is 1/min/VIN; Location is only called when a `state_snapshots` row is actually being inserted (i.e. some observable field changed) so a parked car emits ~1 Location/day. Every outbound Volvo HTTP call MUST go through `withRetry()` in `src/lib/volvo/retry.ts` — exp-backoff with full jitter, capped at 4 attempts, respects `Retry-After` on 429.
- **Charging sessions are derived.** They are written from `state_snapshots` transitions and can be rebuilt end-to-end. Location is the one exception (Location API only returns current position), so `*_lat/lng` columns are captured at transition time, not regenerable.
- **Sessions are plug intervals, not charge intervals.** A session opens on DISCONNECTED → CONNECTED* and closes on CONNECTED* → DISCONNECTED. `chargingStatus` (IDLE / CHARGING / DONE) does *not* trigger a transition: a session that hits target SOC and pauses, or that gets load-balanced, stays one session for the whole plug interval. This matches what humans mean by "this charge."
- **No secrets in code or images.** `.env*` is gitignored. In production, secrets come from Google Secret Manager.
- **Public origin, not `req.url`.** Cloud Run hands the Node process `http://0.0.0.0:8080/…` as the request URL. Every `NextResponse.redirect()` target and every public URL we mint (OAuth `redirect_uri`, OG metadata, etc.) MUST go through `publicOrigin(req)` / `publicUrl(req, path)` in `src/lib/origin.ts`. Otherwise users get redirected to literal `0.0.0.0:8080` URLs.
- **`/api/healthz`, never `/healthz`.** Cloud Run's front-end intercepts some top-level reserved paths and returns its own 404 before the request reaches the container. Keep health and similar endpoints under `/api/*`.
- **pnpm 11 + `minimumReleaseAge=24h`.** Pinned via `packageManager` in `package.json`; corepack picks it up in both local dev and the Dockerfile. The CI/CD pipeline runs `pnpm install --frozen-lockfile` inside the container, so packages younger than 24h cause a build failure — *that's the policy working*. Regenerate the lockfile with `pnpm install` (under pnpm 11) once a day or two have passed.
- **`pnpm approve-builds`** writes to `pnpm-workspace.yaml`. That file is required at install time (including in the Docker build) — keep it in the COPY list.

## Common tasks

| Goal | Command |
|---|---|
| Run app locally | `pnpm dev` |
| Regenerate typed Volvo clients | `pnpm gen:api` |
| Start local Postgres | `pnpm db:up` |
| Stop local Postgres | `pnpm db:down` |
| Create a new migration after schema edits | `pnpm db:generate` |
| Apply migrations | `pnpm db:migrate` |
| Type-check | `pnpm exec tsc --noEmit` |
| Tests | `pnpm test` |

## Pointers

- Full design doc and decisions: `~/.claude/plans/i-want-to-build-zippy-sparkle.md`.
- The Volvo developer portal: <https://developer.volvocars.com/>.
