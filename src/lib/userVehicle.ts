import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, volvoCredentials, volvoTokens, vehicles } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
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

/**
 * Resolve everything we need to talk to Volvo for a given user.
 * Returns null if the user no longer exists, has no vehicle, or has no token.
 */
export async function loadUserVehicleAndCreds(userId: string): Promise<
  | { user: UserVehicle; creds: VolvoCreds }
  | null
> {
  const row = await db
    .select({
      userId: users.id,
      email: users.email,
      vin: vehicles.vin,
      model: vehicles.model,
      modelYear: vehicles.modelYear,
      externalColour: vehicles.externalColour,
      batteryCapacityKwh: vehicles.batteryCapacityKwh,
      exteriorImageUrl: vehicles.exteriorImageUrl,
      vccApiKeyEnc: volvoCredentials.vccApiKeyEnc,
      accessTokenEnc: volvoTokens.accessTokenEnc,
    })
    .from(users)
    .innerJoin(vehicles, eq(vehicles.userId, users.id))
    .innerJoin(volvoCredentials, eq(volvoCredentials.userId, users.id))
    .innerJoin(volvoTokens, eq(volvoTokens.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const r = row[0];
  if (!r) return null;
  return {
    user: {
      userId: r.userId,
      email: r.email,
      vin: r.vin,
      model: r.model,
      modelYear: r.modelYear,
      externalColour: r.externalColour,
      batteryCapacityKwh: r.batteryCapacityKwh,
      exteriorImageUrl: r.exteriorImageUrl,
    },
    creds: {
      accessToken: decrypt(r.accessTokenEnc),
      vccApiKey: decrypt(r.vccApiKeyEnc),
    },
  };
}
