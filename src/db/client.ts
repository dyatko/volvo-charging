import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

declare global {
  // Reuse the pool across hot reloads in dev.
  // eslint-disable-next-line no-var
  var __volvoPool: Pool | undefined;
}

export const pool = globalThis.__volvoPool ?? new Pool({ connectionString: url, max: 10 });
if (process.env.NODE_ENV !== "production") globalThis.__volvoPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
