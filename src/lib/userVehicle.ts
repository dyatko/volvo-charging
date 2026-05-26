import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, volvoCredentials, volvoTokens, vehicles } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/oauth";
import type { VolvoCreds } from "@/lib/volvo/client";

export type UserVehicle = {
  userId: string;
  email: string | null;
  vin: string;
  model: string | null;
  modelYear: number | null;
  externalColour: string | null;
  batteryCapacityKwh: number | null;
  exteriorImageUrl: string | null;
};

const REFRESH_WINDOW_MS = 60_000;

/**
 * Resolve everything needed to talk to Volvo for a given user.
 * If the access token is within 60s of expiring and we have a refresh
 * token + client_secret, refresh and persist the new pair in the same call.
 * Returns null if the user has no vehicle, no token, or the refresh failed.
 */
export async function loadUserVehicleAndCreds(userId: string): Promise<
  | { user: UserVehicle; creds: VolvoCreds }
  | null
> {
  const row = (
    await db
      .select({
        userId: users.id,
        email: users.email,
        vin: vehicles.vin,
        model: vehicles.model,
        modelYear: vehicles.modelYear,
        externalColour: vehicles.externalColour,
        batteryCapacityKwh: vehicles.batteryCapacityKwh,
        exteriorImageUrl: vehicles.exteriorImageUrl,
        clientId: volvoCredentials.clientId,
        clientSecretEnc: volvoCredentials.clientSecretEnc,
        vccApiKeyEnc: volvoCredentials.vccApiKeyEnc,
        accessTokenEnc: volvoTokens.accessTokenEnc,
        refreshTokenEnc: volvoTokens.refreshTokenEnc,
        expiresAt: volvoTokens.expiresAt,
        scope: volvoTokens.scope,
      })
      .from(users)
      .innerJoin(vehicles, eq(vehicles.userId, users.id))
      .innerJoin(volvoCredentials, eq(volvoCredentials.userId, users.id))
      .innerJoin(volvoTokens, eq(volvoTokens.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1)
  )[0];

  if (!row) return null;

  let accessToken = decrypt(row.accessTokenEnc);
  const vccApiKey = decrypt(row.vccApiKeyEnc);
  const refreshToken = decrypt(row.refreshTokenEnc);
  const clientSecret = decrypt(row.clientSecretEnc);

  // Test-token mode: no client_secret / refresh_token, sentinel client_id "test-token".
  const isTestToken = row.clientId === "test-token";

  const expiresInMs = row.expiresAt.getTime() - Date.now();
  if (!isTestToken && refreshToken && expiresInMs < REFRESH_WINDOW_MS) {
    try {
      const tokens = await refreshAccessToken({
        clientId: row.clientId,
        clientSecret,
        refreshToken,
      });
      if (tokens.access_token) {
        accessToken = tokens.access_token;
        const newExpiresAt = new Date(Date.now() + (tokens.expires_in ?? 1800) * 1000);
        await db
          .update(volvoTokens)
          .set({
            accessTokenEnc: encrypt(accessToken),
            refreshTokenEnc: encrypt(tokens.refresh_token ?? refreshToken),
            expiresAt: newExpiresAt,
            scope: tokens.scope ?? row.scope,
            updatedAt: new Date(),
          })
          .where(eq(volvoTokens.userId, userId));
      }
    } catch (e) {
      // Refresh failed — most likely the user revoked consent or the refresh
      // token expired. Force the caller to redirect back to the sign-in flow.
      console.error("token refresh failed", e);
      return null;
    }
  } else if (isTestToken && expiresInMs <= 0) {
    // Test token expired and there's no refresh path — force re-auth.
    return null;
  }

  return {
    user: {
      userId: row.userId,
      email: row.email,
      vin: row.vin,
      model: row.model,
      modelYear: row.modelYear,
      externalColour: row.externalColour,
      batteryCapacityKwh: row.batteryCapacityKwh,
      exteriorImageUrl: row.exteriorImageUrl,
    },
    creds: { accessToken, vccApiKey },
  };
}
