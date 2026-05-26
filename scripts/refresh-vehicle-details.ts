/**
 * One-shot: re-fetch VehicleDetails for every linked vehicle of every user
 * whose Conve (or OAuth) token is still valid, and re-upsert the row.
 *
 *   pnpm tsx scripts/refresh-vehicle-details.ts
 *
 * Useful after adding new columns to `vehicles` — existing rows pick up
 * the new fields without needing the user to sign in again.
 */
import "dotenv/config";
import { db, pool } from "@/db/client";
import { users } from "@/db/schema";
import { loadUserContext } from "@/lib/userVehicle";
import { bootstrapVehiclesFromConve } from "@/lib/vehicleBootstrap";

async function main() {
  const allUsers = await db.select({ id: users.id }).from(users);
  for (const u of allUsers) {
    const ctx = await loadUserContext(u.id);
    if (!ctx) {
      console.log(`user ${u.id}: no context (token expired?)`);
      continue;
    }
    const conveCreds = ctx.credsFor("conve");
    if (!conveCreds) {
      console.log(`user ${u.id}: no Conve creds`);
      continue;
    }
    const persisted = await bootstrapVehiclesFromConve({ userId: u.id, conveCreds });
    console.log(`user ${u.id}: refreshed ${persisted.length} vehicle(s): ${persisted.join(", ")}`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
