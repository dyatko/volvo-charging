import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { users, volvoCredentials, volvoTokens, vehicles } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";
import { makeConveClient } from "@/lib/volvo/client";

const FormSchema = z.object({
  accessToken: z.string().min(40),
  vccApiKey: z.string().min(20),
  // Optional — if omitted we use the first VIN returned by Connected Vehicle.
  vin: z.string().optional(),
});

function decodeJwtSub(jwt: string): string | null {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const obj = JSON.parse(json) as { sub?: string; exp?: number };
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
    accessToken: form.get("accessToken"),
    vccApiKey: form.get("vccApiKey"),
    vin: form.get("vin") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid form", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { accessToken, vccApiKey } = parsed.data;
  let vin = parsed.data.vin;

  const conve = makeConveClient({ accessToken, vccApiKey });

  if (!vin) {
    const { data, error, response } = await conve.GET("/vehicles");
    if (error || !data?.data?.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not list vehicles. Check the token, VCC API key, and that the user has `conve:vehicle_relation` scope.",
          status: response?.status,
          volvoError: error,
        },
        { status: 400 },
      );
    }
    vin = data.data[0].vin;
  }
  if (!vin) {
    return NextResponse.json({ ok: false, error: "No VIN available" }, { status: 400 });
  }

  // Pull vehicle details (model, batteryCapacityKWH, exteriorImageUrl) so the UI looks good.
  const { data: details, error: detailsErr } = await conve.GET("/vehicles/{vin}", {
    params: { path: { vin } },
  });

  const volvoSub = decodeJwtSub(accessToken);
  const expiresAt = decodeJwtExp(accessToken);

  // Upsert user keyed by Volvo ID (sub). Email is unknown until id_token flow is wired.
  const externalIdSentinel = volvoSub ? `volvo:${volvoSub}` : null;

  const result = await db.transaction(async (tx) => {
    // Try to find an existing user by the Volvo sub stored in users.email column as a fallback
    // (we don't have a dedicated external_id column yet; revisit when adding real OAuth).
    let userRow = externalIdSentinel
      ? (await tx.select().from(users).where(eq(users.email, externalIdSentinel)).limit(1))[0]
      : undefined;

    if (!userRow) {
      userRow = (
        await tx
          .insert(users)
          .values({ email: externalIdSentinel })
          .returning()
      )[0];
    }

    await tx
      .insert(volvoCredentials)
      .values({
        userId: userRow.id,
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
        userId: userRow.id,
        accessTokenEnc: encrypt(accessToken),
        // Test tokens have no refresh token. Store empty-encrypted as a sentinel.
        refreshTokenEnc: encrypt(""),
        expiresAt,
        scope: "energy:state:read energy:capability:read conve:vehicle_relation",
      })
      .onConflictDoUpdate({
        target: volvoTokens.userId,
        set: {
          accessTokenEnc: encrypt(accessToken),
          expiresAt,
          updatedAt: new Date(),
        },
      });

    await tx
      .insert(vehicles)
      .values({
        vin: vin!,
        userId: userRow.id,
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
          userId: userRow.id,
          model: details?.descriptions?.model ?? null,
          modelYear: details?.modelYear ?? null,
          fuelType: details?.fuelType ?? null,
          externalColour: details?.externalColour ?? null,
          batteryCapacityKwh: details?.batteryCapacityKWH ?? null,
          exteriorImageUrl: details?.images?.exteriorImageUrl ?? null,
        },
      });

    return userRow;
  });

  const session = await getSession();
  session.userId = result.id;
  await session.save();

  // Surface vehicle-details error in the redirect query for debugging.
  const url = new URL("/dashboard", req.url);
  if (detailsErr) url.searchParams.set("details_err", "1");
  return NextResponse.redirect(url, { status: 303 });
}

// Imported here at the bottom to keep the route's top noise low.
import { eq } from "drizzle-orm";
