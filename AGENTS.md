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
    ├── polling.ts              # pollOne + pollAllVehicles (IO shell) + latestSnapshot
    ├── snapshot.ts             # PURE: deriveSnapshot / dedup / plug-transition (tested)
    ├── sessions.ts             # PURE: energyKwhFromSoc — shared poller ↔ dashboard
    ├── pollCadence.ts          # PURE: adaptive next-poll interval + haversine + isPollStale (tested)
    ├── log.ts                  # structured logger: JSON for Cloud Logging in prod, readable in dev
    ├── env.ts                  # optionalEnv(): env value or null (SET_ME placeholder)
    ├── brand.ts                # brand palette + hexToRgb (logo / ring / map pins)
    ├── soc-color.ts            # PURE: socRingColor — SOC ring colour interpolation
    ├── format.ts               # PURE: round1 / fmtKwh / fmtKw — shared number formatting
    ├── internalAuth.ts         # OIDC verification for /api/internal/*
    ├── dashboard/              # the VehicleDashboard view-model
    │   ├── types.ts            #   prop shapes + sessionLatLng (end ?? start) rule
    │   └── adapt.ts            #   DB rows → props (toVehicleDashboardProps) + demo data
    ├── geocoding/              # reverse-geocode → coarse "Area · City" (cached)
    │   ├── service.ts          #   reverseGeocode: quantise → cache → Google → upsert
    │   ├── labels.ts           #   resolveLocationLabels: batched, deduped name lookup
    │   ├── address.ts          #   PURE: deriveAddress (Google result → label)
    │   ├── quantize.ts         #   PURE: quantizeCoord / coordKey (~100 m grid)
    │   └── config.ts           #   getGoogleMapsApiKey (server-side geocode key)
    ├── maps/                   # overview-map helpers
    │   ├── clusters.ts         #   PURE: clusterSessionsByLocation
    │   ├── bounds.ts           #   PURE: inBounds (viewport filter, antimeridian-safe)
    │   └── config.ts           #   browser Maps JS key + Map ID
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
- **The landing demo mirrors the real dashboard.** The `Example` preview on `/` (`DashboardPreview` in `src/app/page.tsx`) and the signed-in `/dashboard` render the *same* `VehicleDashboard` component (`src/components/vehicle-dashboard.tsx`) — the only difference is the data. Both sides build the one view-model in `src/lib/dashboard/`: the dashboard adapts real DB rows via `toVehicleDashboardProps()` (`adapt.ts`), the landing uses `demoVehicleDashboard()` (also `adapt.ts`, `demo: true`); the prop shapes live in `types.ts`. Keep `VehicleDashboard` and its child components presentational and data-agnostic. When you add or change any dashboard feature (a new field, pill, map, session column, etc.), extend the view-model in `types.ts` and you MUST update BOTH `toVehicleDashboardProps()` *and* `demoVehicleDashboard()` so the public landing example never lags the real thing.
- **No secrets in code or images.** `.env*` is gitignored. In production, secrets come from Google Secret Manager.
- **Public origin, not `req.url`.** Cloud Run hands the Node process `http://0.0.0.0:8080/…` as the request URL. Every `NextResponse.redirect()` target and every public URL we mint (OAuth `redirect_uri`, OG metadata, etc.) MUST go through `publicOrigin(req)` / `publicUrl(req, path)` in `src/lib/origin.ts`. Otherwise users get redirected to literal `0.0.0.0:8080` URLs.
- **`/api/healthz`, never `/healthz`.** Cloud Run's front-end intercepts some top-level reserved paths and returns its own 404 before the request reaches the container. Keep health and similar endpoints under `/api/*`.
- **pnpm 11 + `minimumReleaseAge=24h`.** Pinned via `packageManager` in `package.json`; corepack picks it up in both local dev and the Dockerfile. The CI/CD pipeline runs `pnpm install --frozen-lockfile` inside the container, so packages younger than 24h cause a build failure — *that's the policy working*. Regenerate the lockfile with `pnpm install` (under pnpm 11) once a day or two have passed.
- **`pnpm approve-builds`** writes to `pnpm-workspace.yaml`. That file is required at install time (including in the Docker build) — keep it in the COPY list.

## Dates & times

- **Store UTC, format in the browser.** Timestamps live in the DB as UTC. Never
  format an absolute date/time in a server component — Cloud Run's locale is
  `en-US`/UTC, so `new Date(x).toLocaleString()` on the server shows the wrong
  zone. Render through `<LocalTime iso={…} />` (or `formatLocalDateTime()` for a
  string) from `src/components/local-time.tsx`, which formats in the viewer's
  locale + timezone client-side. Relative labels use `<RelativeTime>` (elapsed
  time is zone-independent); it shows the absolute local time on hover.

## Writing style

- **British English everywhere.** All user-facing copy, metadata, and comments use UK spelling and vocabulary: `colour` not `color`, `organise`/`authorise`/`recognise` not `-ize`, `licence` (noun), `tyre` not `tire`, `behaviour`, `centre` (prose only), etc. Do **not** rename code identifiers, CSS classes (`text-center`, `color:`), API field names, or generated files — spelling rules apply to prose, not code.

## UI

- **11px is the floor for any rendered text.** Never use a font size below 11px — no `text-[10px]`, `text-[9px]`, or any arbitrary value under `text-[11px]`. The smallest acceptable sizes are `text-[11px]` and Tailwind's `text-xs` (12px). This applies to every surface: dashboard, sessions, pills, footnotes, badges, the landing example — everywhere. When something feels like it needs to be tiny, use `text-[11px]` plus `leading-tight` and muted colour (`text-zinc-500`) rather than shrinking the type.

## Common tasks

- **Run `nvm use` first.** This project needs Node 24 (`.nvmrc`; `engines.node >=24`).
  On an older Node, pnpm prints an "Unsupported engine" warning and the build/dev may
  misbehave — `nvm use` selects the right version before any `pnpm` command.

| Goal | Command |
|---|---|
| Run app locally | `pnpm dev` (a `predev` hook runs `db:up` + `db:migrate` first) |
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
