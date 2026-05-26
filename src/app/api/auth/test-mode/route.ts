import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users, volvoCredentials, volvoTokens, vehicles } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";
import { makeConveClient } from "@/lib/volvo/client";

// Each token is the access_token from a separate test-access-token page
// in Volvo's developer portal (one per API).
const FormSchema = z.object({
  vccApiKey: z.string().min(20, "vcc-api-key must be 20+ chars"),
  vin: z.string().min(11, "VIN is required when using test tokens").max(20),
  energyToken: z.string().min(40, "Energy API token is required"),
  conveToken: z.string().optional(),
  locationToken: z.string().optional(),
});

function decodeJwtSub(jwt: string): string | null {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const obj = JSON.parse(json) as { sub?: string };
    return obj.sub ?? null;
  } catch {
    return null;
  }
}

function decodeJwtExp(jwt: string): Date {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return new Date(Date.now() + 30 * 60_000);
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const { exp } = JSON.parse(json) as { exp?: number };
    return exp ? new Date(exp * 1000) : new Date(Date.now() + 30 * 60_000);
  } catch {
    return new Date(Date.now() + 30 * 60_000);
  }
}

export async function POST(req: Request) {
  const form = await req.formData();
  const parsed = FormSchema.safeParse({
    vccApiKey: form.get("vccApiKey"),
    vin: form.get("vin"),
    energyToken: form.get("energyToken"),
    conveToken: form.get("conveToken") || undefined,
    locationToken: form.get("locationToken") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid form", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { vccApiKey, vin, energyToken, conveToken, locationToken } = parsed.data;

  // Identity: pick whichever JWT we have. Volvo issues one sub per Volvo ID,
  // so any of them yields the same sub.
  const volvoSub =
    decodeJwtSub(energyToken) ??
    (conveToken ? decodeJwtSub(conveToken) : null) ??
    (locationToken ? decodeJwtSub(locationToken) : null);
  const externalIdSentinel = volvoSub ? `volvo:${volvoSub}` : null;

  const energyExpiresAt = decodeJwtExp(energyToken);
  const conveExpiresAt = conveToken ? decodeJwtExp(conveToken) : null;
  const locationExpiresAt = locationToken ? decodeJwtExp(locationToken) : null;

  // If we have a Connected Vehicle token, fetch model/photo/battery details up
  // front. Otherwise the vehicle row is populated with VIN only — the UI will
  // show a more spartan dashboard until the user supplies a Conve token later.
  let details:
    | {
        descriptions?: { model?: string };
        modelYear?: number;
        fuelType?: string;
        externalColour?: string;
        batteryCapacityKWH?: number;
        images?: { exteriorImageUrl?: string };
      }
    | undefined;
  let conveError: string | null = null;
  if (conveToken) {
    const conve = makeConveClient({ accessToken: conveToken, vccApiKey });
    const r = await conve.GET("/vehicles/{vin}", { params: { path: { vin } } });
    if (r.error) conveError = `details fetch failed: HTTP ${r.response.status}`;
    else details = r.data ?? undefined;
  }

  const userRow = await db.transaction(async (tx) => {
    let u = externalIdSentinel
      ? (await tx.select().from(users).where(eq(users.email, externalIdSentinel)).limit(1))[0]
      : undefined;
    if (!u) {
      u = (await tx.insert(users).values({ email: externalIdSentinel }).returning())[0];
    }

    await tx
      .insert(volvoCredentials)
      .values({
        userId: u.id,
        clientId: "test-token",
        clientSecretEnc: encrypt("test-token"),
        vccApiKeyEnc: encrypt(vccApiKey),
      })
      .onConflictDoUpdate({
        target: volvoCredentials.userId,
        set: { vccApiKeyEnc: encrypt(vccApiKey), clientId: "test-token" },
      });

    await tx
      .insert(volvoTokens)
      .values({
        userId: u.id,
        // OAuth columns null; we only use per-API columns in test-mode.
        accessTokenEnc: null,
        refreshTokenEnc: null,
        expiresAt: null,
        scope: null,
        energyTokenEnc: encrypt(energyToken),
        energyExpiresAt,
        conveTokenEnc: conveToken ? encrypt(conveToken) : null,
        conveExpiresAt: conveExpiresAt,
        locationTokenEnc: locationToken ? encrypt(locationToken) : null,
        locationExpiresAt: locationExpiresAt,
      })
      .onConflictDoUpdate({
        target: volvoTokens.userId,
        set: {
          accessTokenEnc: null,
          refreshTokenEnc: null,
          expiresAt: null,
          scope: null,
          energyTokenEnc: encrypt(energyToken),
          energyExpiresAt,
          conveTokenEnc: conveToken ? encrypt(conveToken) : null,
          conveExpiresAt: conveExpiresAt,
          locationTokenEnc: locationToken ? encrypt(locationToken) : null,
          locationExpiresAt: locationExpiresAt,
          updatedAt: new Date(),
        },
      });

    await tx
      .insert(vehicles)
      .values({
        vin,
        userId: u.id,
        model: details?.descriptions?.model ?? null,
        modelYear: details?.modelYear ?? null,
        fuelType: details?.fuelType ?? null,
        externalColour: details?.externalColour ?? null,
        batteryCapacityKwh: details?.batteryCapacityKWH ?? null,
        exteriorImageUrl: details?.images?.exteriorImageUrl ?? null,
      })
      .onConflictDoUpdate({
        target: vehicles.vin,
        set: {
          userId: u.id,
          model: details?.descriptions?.model ?? null,
          modelYear: details?.modelYear ?? null,
          fuelType: details?.fuelType ?? null,
          externalColour: details?.externalColour ?? null,
          batteryCapacityKwh: details?.batteryCapacityKWH ?? null,
          exteriorImageUrl: details?.images?.exteriorImageUrl ?? null,
        },
      });

    return u;
  });

  const session = await getSession();
  session.userId = userRow.id;
  await session.save();

  const url = new URL("/dashboard", req.url);
  if (conveError) url.searchParams.set("conve_err", conveError);
  return NextResponse.redirect(url, { status: 303 });
}
