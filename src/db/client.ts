import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // Reuse the pool across hot reloads in dev.
  var __volvoPool: Pool | undefined;
}

// We intentionally don't `throw` at module load on missing DATABASE_URL.
// Next.js evaluates server modules at build time when collecting page
// data (`/_not-found` and friends), and throwing here breaks the build
// inside the Docker container where DATABASE_URL is only injected at
// runtime by Cloud Run. The pool object is cheap to construct; nothing
// connects until the first query, and a real missing-env situation
// surfaces as a connection error on first request.
const url =
  process.env.DATABASE_URL ?? "postgresql://invalid:invalid@127.0.0.1:1/_invalid";

export const pool =
  globalThis.__volvoPool ?? new Pool({ connectionString: url, max: 10 });
if (process.env.NODE_ENV !== "production") globalThis.__volvoPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
