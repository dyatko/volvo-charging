import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  smallint,
  doublePrecision,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  real,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  // VIN the user is currently viewing. Null until the first vehicle is linked.
  // Not a FK because it would cycle with vehicles.user_id; we enforce
  // consistency at write time and tolerate orphan vins on user delete.
  activeVin: text("active_vin"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// BYOC mode: stash each user's own Volvo OAuth client credentials.
// Becomes nullable / unused once the published app is approved.
export const volvoCredentials = pgTable("volvo_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  clientSecretEnc: text("client_secret_enc").notNull(),
  vccApiKeyEnc: text("vcc_api_key_enc").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Token storage supports two shapes:
//   1. OAuth — one access_token covers all APIs; we also have a refresh_token.
//      We write access_token_enc + refresh_token_enc + expires_at; per-API
//      columns stay null.
//   2. Test-mode — Volvo's portal issues a separate test access token per
//      API. We write whichever per-API columns the user provided; the OAuth
//      columns stay null.
export const volvoTokens = pgTable("volvo_tokens", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // OAuth (Authorization Code) shared token + refresh.
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scope: text("scope"),
  // Test-mode per-API tokens.
  energyTokenEnc: text("energy_token_enc"),
  energyExpiresAt: timestamp("energy_expires_at", { withTimezone: true }),
  conveTokenEnc: text("conve_token_enc"),
  conveExpiresAt: timestamp("conve_expires_at", { withTimezone: true }),
  locationTokenEnc: text("location_token_enc"),
  locationExpiresAt: timestamp("location_expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vehicles = pgTable(
  "vehicles",
  {
    vin: text("vin").primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    model: text("model"),
    modelYear: smallint("model_year"),
    fuelType: text("fuel_type"),
    externalColour: text("external_colour"),
    batteryCapacityKwh: real("battery_capacity_kwh"),
    exteriorImageUrl: text("exterior_image_url"),
    capabilitiesJson: jsonb("capabilities_json"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    nextPollAt: timestamp("next_poll_at", { withTimezone: true }).defaultNow().notNull(),
    consecutiveFailures: smallint("consecutive_failures").default(0).notNull(),
  },
  (t) => [index("vehicles_user_idx").on(t.userId), index("vehicles_next_poll_idx").on(t.nextPollAt)],
);

// Append-only source of truth. Insert a row only when at least one observable
// field has changed since the previous snapshot for the VIN.
export const stateSnapshots = pgTable(
  "state_snapshots",
  {
    vin: text("vin")
      .references(() => vehicles.vin, { onDelete: "cascade" })
      .notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    soc: smallint("soc"),
    rangeKm: smallint("range_km"),
    connectionStatus: text("connection_status"),
    chargingStatus: text("charging_status"),
    chargingType: text("charging_type"),
    chargerPowerStatus: text("charger_power_status"),
    chargingPowerKw: real("charging_power_kw"),
    targetSoc: smallint("target_soc"),
    currentLimitA: smallint("current_limit_a"),
  },
  (t) => [
    // Unique on (vin, observed_at) doubles as the ordered scan index for "give me recent snapshots".
    uniqueIndex("state_snapshots_vin_observed_idx").on(t.vin, t.observedAt),
  ],
);

// Derived from state_snapshots — rebuildable end to end.
// Location columns are captured at transition time and persisted here
// since the Location API doesn't backfill historical positions.
export const chargingSessions = pgTable(
  "charging_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vin: text("vin")
      .references(() => vehicles.vin, { onDelete: "cascade" })
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    startSoc: smallint("start_soc").notNull(),
    endSoc: smallint("end_soc"),
    energyKwh: real("energy_kwh"),
    peakPowerKw: real("peak_power_kw"),
    connectionType: text("connection_type"),
    startLat: doublePrecision("start_lat"),
    startLng: doublePrecision("start_lng"),
    endLat: doublePrecision("end_lat"),
    endLng: doublePrecision("end_lng"),
    isOpen: boolean("is_open").notNull().default(true),
    derivedAt: timestamp("derived_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("charging_sessions_vin_started_idx").on(t.vin, t.startedAt),
    uniqueIndex("charging_sessions_open_per_vin_idx")
      .on(t.vin)
      .where(sql`"is_open" = true`),
  ],
);
