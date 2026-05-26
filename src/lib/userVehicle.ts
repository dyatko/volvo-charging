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

export type ApiKind = "energy" | "conve" | "location";

export type Loaded = {
  user: UserVehicle;
  vccApiKey: string;
  /**
   * Resolve usable Volvo credentials for a given API.
   * Prefers the OAuth shared access_token (if not expired); falls back to a
   * test-mode per-API token. Returns null if neither is usable.
   */
  credsFor: (api: ApiKind) => VolvoCreds | null;
  /** True if the most recent OAuth attempt was refreshed within this load. */
  refreshed: boolean;
};

const REFRESH_WINDOW_MS = 60_000;

export async function loadUserVehicleAndCreds(userId: string): Promise<Loaded | null> {
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
        energyTokenEnc: volvoTokens.energyTokenEnc,
        energyExpiresAt: volvoTokens.energyExpiresAt,
        conveTokenEnc: volvoTokens.conveTokenEnc,
        conveExpiresAt: volvoTokens.conveExpiresAt,
        locationTokenEnc: volvoTokens.locationTokenEnc,
        locationExpiresAt: volvoTokens.locationExpiresAt,
      })
      .from(users)
      .innerJoin(vehicles, eq(vehicles.userId, users.id))
      .innerJoin(volvoCredentials, eq(volvoCredentials.userId, users.id))
      .innerJoin(volvoTokens, eq(volvoTokens.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1)
  )[0];

  if (!row) return null;

  const vccApiKey = decrypt(row.vccApiKeyEnc);

  // Refresh OAuth shared token if present and near expiry. The OAuth path
  // covers all three APIs, so a successful refresh fixes Energy, Conve, and
  // Location at once.
  let oauthAccessToken: string | null = row.accessTokenEnc ? decrypt(row.accessTokenEnc) : null;
  let oauthExpiresAt: Date | null = row.expiresAt;
  let refreshed = false;

  const isTestModePrimary = row.clientId === "test-token";
  if (!isTestModePrimary && row.refreshTokenEnc && oauthExpiresAt) {
    const expiresInMs = oauthExpiresAt.getTime() - Date.now();
    if (expiresInMs < REFRESH_WINDOW_MS) {
      try {
        const clientSecret = decrypt(row.clientSecretEnc);
        const refreshToken = decrypt(row.refreshTokenEnc);
        const tokens = await refreshAccessToken({
          clientId: row.clientId,
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
              scope: tokens.scope ?? row.scope ?? "",
              updatedAt: new Date(),
            })
            .where(eq(volvoTokens.userId, userId));
          refreshed = true;
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
    energy: decryptIfFresh(row.energyTokenEnc, row.energyExpiresAt),
    conve: decryptIfFresh(row.conveTokenEnc, row.conveExpiresAt),
    location: decryptIfFresh(row.locationTokenEnc, row.locationExpiresAt),
  };

  function credsFor(api: ApiKind): VolvoCreds | null {
    const token = oauthFresh ?? perApi[api];
    if (!token) return null;
    return { accessToken: token, vccApiKey };
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
    vccApiKey,
    credsFor,
    refreshed,
  };
}
