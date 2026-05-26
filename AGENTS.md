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
├── app/                       # Next.js App Router (RSC by default)
│   ├── page.tsx               # → redirects to /dashboard
│   └── dashboard/page.tsx     # Phase-1 vertical slice (env-var creds + state)
├── db/
│   ├── client.ts              # Drizzle + node-postgres pool (singleton across HMR)
│   └── schema.ts              # users / volvo_credentials / volvo_tokens / vehicles / state_snapshots / charging_sessions
└── lib/volvo/
    ├── client.ts              # makeEnergyClient / makeConveClient / makeLocationClient
    ├── state.ts               # readField helper for the per-field OK|ERROR union
    ├── energy.gen.ts          # generated — do not edit
    ├── conve.gen.ts           # generated — do not edit
    └── location.gen.ts        # generated — do not edit

openapi/                       # vendored OpenAPI specs (source of truth)
drizzle/                       # generated SQL migrations (committed)
docker-compose.yml             # local Postgres 16
drizzle.config.ts
```

## Rules of the road

- **Specs are the source of truth.** When the Volvo API surface changes, replace files in `openapi/` and re-run `pnpm gen:api`. Never hand-edit `*.gen.ts`.
- **Per-field statuses.** Every Energy `state` property is `{status: "OK", value, unit?, updatedAt}` or `{status: "ERROR", code, message}`. Always route through `readField()` instead of accessing `.value` directly.
- **Per-field freshness.** Each property carries its own `updatedAt`. A response is not "now"; treat each field independently. Use the max changed `updatedAt` as `observed_at` for `state_snapshots` rows.
- **Capabilities can lie.** A capability with `isSupported: true` can still come back as `ERROR PROPERTY_NOT_FOUND` in state. Always handle the error branch in the UI.
- **Dedup on change.** A new `state_snapshots` row is only written when at least one observable field actually changed since the previous row. Unique index on `(vin, observed_at)` enforces it.
- **Rate budget.** 100 req/min per (Volvo ID, client ID). Default polling cadence is 1/min/VIN — Location is called only on session-boundary transitions, never on every poll.
- **Charging sessions are derived.** They are written from `state_snapshots` transitions and can be rebuilt end-to-end. Location is the one exception (Location API only returns current position), so `*_lat/lng` columns are captured at transition time, not regenerable.
- **Sessions are plug intervals, not charge intervals.** A session opens on DISCONNECTED → CONNECTED* and closes on CONNECTED* → DISCONNECTED. `chargingStatus` (IDLE / CHARGING / DONE) does *not* trigger a transition: a session that hits target SOC and pauses, or that gets load-balanced, stays one session for the whole plug interval. This matches what humans mean by "this charge."
- **No secrets in code or images.** `.env*` is gitignored. In production, secrets come from Google Secret Manager.

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
