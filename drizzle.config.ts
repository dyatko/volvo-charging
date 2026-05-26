import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://volvo:volvo@localhost:5432/volvo",
  },
  strict: true,
  verbose: true,
} satisfies Config;
