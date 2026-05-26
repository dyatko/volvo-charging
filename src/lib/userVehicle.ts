import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, volvoCredentials, volvoTokens, vehicles } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/oauth";
import type { VolvoCreds } from "@/lib/volvo/client";

export type VehicleRow = {
  vin: string;
  model: string | null;
  modelYear: number | null;
  fuelType: string | null;
  externalColour: string | null;
  batteryCapacityKwh: number | null;
  gearbox: string | null;
  upholstery: string | null;
  steering: string | null;
  exteriorImageUrl: string | null;
  internalImageUrl: string | null;
  currentLat: number | null;
  currentLng: number | null;
  locationUpdatedAt: Date | null;
  lastSeenAt: Date | null;
};

export type ApiKind = "energy" | "conve" | "location";

export type UserCreds = {
  vccApiKey: string;
  credsFor: (api: ApiKind) => VolvoCreds | null;
};

export type UserContext = UserCreds & {
  userId: string;
  email: string | null;
  vehicles: VehicleRow[];
  activeVehicle: VehicleRow | null;
};

const REFRESH_WINDOW_MS = 60_000;

/**
 * Load everything we need to render a signed-in page:
 *   - user identity
 *   - per-API Volvo credentials (auto-refreshed if the OAuth token is near
 *     expiry)
 *   - all vehicles linked to this user (the polling loop iterates them)
 *   - the vehicle currently selected for display (users.active_vin)
 *
 * Returns null if the user no longer exists or token refresh failed.
 */
export async function loadUserContext(userId: string): Promise<UserContext | null> {
  const userRow = (
    await db.select().from(users).where(eq(users.id, userId)).limit(1)
  )[0];
  if (!userRow) return null;

  // Credentials + tokens (one row per user).
  const credsRow = (
    await db
      .select()
      .from(volvoCredentials)
      .where(eq(volvoCredentials.userId, userId))
      .limit(1)
  )[0];
  const tokensRow = (
    await db
      .select()
      .from(volvoTokens)
      .where(eq(volvoTokens.userId, userId))
      .limit(1)
  )[0];
  if (!credsRow || !tokensRow) return null;

  const vccApiKey = decrypt(credsRow.vccApiKeyEnc);

  // Refresh OAuth shared token if present and within the refresh window.
  let oauthAccessToken: string | null = tokensRow.accessTokenEnc
    ? decrypt(tokensRow.accessTokenEnc)
    : null;
  let oauthExpiresAt: Date | null = tokensRow.expiresAt;

  const isTestModePrimary = credsRow.clientId === "test-token";
  if (!isTestModePrimary && tokensRow.refreshTokenEnc && oauthExpiresAt) {
    const expiresInMs = oauthExpiresAt.getTime() - Date.now();
    if (expiresInMs < REFRESH_WINDOW_MS) {
      try {
        const clientSecret = decrypt(credsRow.clientSecretEnc);
        const refreshToken = decrypt(tokensRow.refreshTokenEnc);
        const tokens = await refreshAccessToken({
          clientId: credsRow.clientId,
          clientSecret,
          refreshToken,
        });
        if (tokens.access_token) {
          oauthAccessToken = tokens.access_token;
          oauthExpiresAt = new Date(Date.now() + (tokens.expires_in ?? 1800) * 1000);
          await db
            .update(volvoTokens)
            .set({
              accessTokenEnc: encrypt(oauthAccessToken),
              refreshTokenEnc: encrypt(tokens.refresh_token ?? refreshToken),
              expiresAt: oauthExpiresAt,
              scope: tokens.scope ?? tokensRow.scope ?? "",
              updatedAt: new Date(),
            })
            .where(eq(volvoTokens.userId, userId));
        }
      } catch (e) {
        console.error("token refresh failed", e);
        return null;
      }
    }
  }

  function decryptIfFresh(enc: string | null, expiresAt: Date | null): string | null {
    if (!enc || !expiresAt) return null;
    if (expiresAt.getTime() <= Date.now()) return null;
    return decrypt(enc);
  }

  const oauthFresh =
    oauthAccessToken && oauthExpiresAt && oauthExpiresAt.getTime() > Date.now()
      ? oauthAccessToken
      : null;

  const perApi: Record<ApiKind, string | null> = {
    energy: decryptIfFresh(tokensRow.energyTokenEnc, tokensRow.energyExpiresAt),
    conve: decryptIfFresh(tokensRow.conveTokenEnc, tokensRow.conveExpiresAt),
    location: decryptIfFresh(tokensRow.locationTokenEnc, tokensRow.locationExpiresAt),
  };

  function credsFor(api: ApiKind): VolvoCreds | null {
    const token = oauthFresh ?? perApi[api];
    if (!token) return null;
    return { accessToken: token, vccApiKey };
  }

  // All vehicles linked to this user.
  const vehicleRows = await db
    .select({
      vin: vehicles.vin,
      model: vehicles.model,
      modelYear: vehicles.modelYear,
      fuelType: vehicles.fuelType,
      externalColour: vehicles.externalColour,
      batteryCapacityKwh: vehicles.batteryCapacityKwh,
      gearbox: vehicles.gearbox,
      upholstery: vehicles.upholstery,
      steering: vehicles.steering,
      exteriorImageUrl: vehicles.exteriorImageUrl,
      internalImageUrl: vehicles.internalImageUrl,
      currentLat: vehicles.currentLat,
      currentLng: vehicles.currentLng,
      locationUpdatedAt: vehicles.locationUpdatedAt,
      lastSeenAt: vehicles.lastSeenAt,
    })
    .from(vehicles)
    .where(eq(vehicles.userId, userId))
    .orderBy(vehicles.vin);

  // Resolve active vehicle. Auto-correct if active_vin points at a vehicle
  // that's been removed, or if it was never set.
  let activeVehicle = userRow.activeVin
    ? vehicleRows.find((v) => v.vin === userRow.activeVin) ?? null
    : null;
  if (!activeVehicle && vehicleRows.length > 0) {
    activeVehicle = vehicleRows[0];
    await db.update(users).set({ activeVin: activeVehicle.vin }).where(eq(users.id, userId));
  }

  return {
    userId: userRow.id,
    email: userRow.email,
    vccApiKey,
    credsFor,
    vehicles: vehicleRows,
    activeVehicle,
  };
}

/** Set the user's active vehicle. Throws if vin doesn't belong to the user. */
export async function setActiveVehicle(userId: string, vin: string): Promise<boolean> {
  const owned = (
    await db
      .select({ vin: vehicles.vin })
      .from(vehicles)
      .where(and(eq(vehicles.userId, userId), eq(vehicles.vin, vin)))
      .limit(1)
  )[0];
  if (!owned) return false;
  await db.update(users).set({ activeVin: vin }).where(eq(users.id, userId));
  return true;
}
