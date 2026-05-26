import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users, volvoCredentials, volvoTokens } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";
import { bootstrapVehiclesFromConve } from "@/lib/vehicleBootstrap";

// Each token is the access_token from a separate test-access-token page
// in Volvo's developer portal (one per API).
// Conve token is required — we use it to list VINs via Connected Vehicle so
// the user never types one.
const FormSchema = z.object({
  vccApiKey: z.string().min(20, "vcc-api-key must be 20+ chars"),
  energyToken: z.string().min(40, "Energy API token is required"),
  conveToken: z.string().min(40, "Connected Vehicle API token is required (we use it to list your VINs)"),
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
    energyToken: form.get("energyToken"),
    conveToken: form.get("conveToken"),
    locationToken: form.get("locationToken") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid form", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { vccApiKey, energyToken, conveToken, locationToken } = parsed.data;

  // Identity: pick any JWT (they all share the same Volvo ID sub).
  const volvoSub =
    decodeJwtSub(energyToken) ?? decodeJwtSub(conveToken) ?? (locationToken ? decodeJwtSub(locationToken) : null);
  const externalIdSentinel = volvoSub ? `volvo:${volvoSub}` : null;

  const energyExpiresAt = decodeJwtExp(energyToken);
  const conveExpiresAt = decodeJwtExp(conveToken);
  const locationExpiresAt = locationToken ? decodeJwtExp(locationToken) : null;

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
        accessTokenEnc: null,
        refreshTokenEnc: null,
        expiresAt: null,
        scope: null,
        energyTokenEnc: encrypt(energyToken),
        energyExpiresAt,
        conveTokenEnc: encrypt(conveToken),
        conveExpiresAt,
        locationTokenEnc: locationToken ? encrypt(locationToken) : null,
        locationExpiresAt,
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
          conveTokenEnc: encrypt(conveToken),
          conveExpiresAt,
          locationTokenEnc: locationToken ? encrypt(locationToken) : null,
          locationExpiresAt,
          updatedAt: new Date(),
        },
      });

    return u;
  });

  // Discover ALL user's VINs via Connected Vehicle.
  const vins = await bootstrapVehiclesFromConve({
    userId: userRow.id,
    conveCreds: { accessToken: conveToken, vccApiKey },
  });
  const conveError = vins.length === 0
    ? "Connected Vehicle returned no vehicles for this token"
    : null;

  const session = await getSession();
  session.userId = userRow.id;
  await session.save();

  const url = new URL("/dashboard", req.url);
  if (conveError) url.searchParams.set("conve_err", conveError);
  return NextResponse.redirect(url, { status: 303 });
}
