import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, volvoCredentials, volvoTokens } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";
import { exchangeAuthorizationCode } from "@/lib/oauth";
import { bootstrapVehiclesFromConve } from "@/lib/vehicleBootstrap";
import { publicUrl } from "@/lib/origin";

function redirectWithError(req: Request, message: string) {
  return NextResponse.redirect(
    publicUrl(req, `/?oauth_error=${encodeURIComponent(message)}`),
    { status: 303 },
  );
}

export async function GET(req: Request) {
  const session = await getSession();
  const pending = session.pending;
  // openid-client compares this URL's origin against the saved redirect_uri
  // when verifying the code grant. Use the public origin so it matches what
  // we registered with Volvo, not the container's internal bind.
  const reqUrl = new URL(req.url);
  const currentUrl = new URL(reqUrl.pathname + reqUrl.search, publicUrl(req, "/"));

  const oauthError = currentUrl.searchParams.get("error");
  if (oauthError) {
    delete session.pending;
    await session.save();
    return redirectWithError(req, oauthError);
  }
  if (!pending) {
    return redirectWithError(req, "no_pending_oauth");
  }

  let tokens;
  try {
    tokens = await exchangeAuthorizationCode({
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      currentUrl,
      codeVerifier: pending.codeVerifier,
      expectedState: pending.state,
    });
  } catch (e) {
    delete session.pending;
    await session.save();
    return redirectWithError(
      req,
      `token_exchange_failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!tokens.access_token || !tokens.refresh_token) {
    delete session.pending;
    await session.save();
    return redirectWithError(req, "missing_tokens_in_response");
  }

  // Identify the user from the id_token claims (sub is the Volvo ID UUID).
  const claims = tokens.claims();
  const volvoSub = typeof claims?.sub === "string" ? claims.sub : null;
  const externalId = volvoSub ? `volvo:${volvoSub}` : null;

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 1800) * 1000);

  const userRow = await db.transaction(async (tx) => {
    let u = externalId
      ? (await tx.select().from(users).where(eq(users.email, externalId)).limit(1))[0]
      : undefined;
    if (!u) {
      u = (await tx.insert(users).values({ email: externalId }).returning())[0];
    }

    await tx
      .insert(volvoCredentials)
      .values({
        userId: u.id,
        clientId: pending.clientId,
        clientSecretEnc: encrypt(pending.clientSecret),
        vccApiKeyEnc: encrypt(pending.vccApiKey),
      })
      .onConflictDoUpdate({
        target: volvoCredentials.userId,
        set: {
          clientId: pending.clientId,
          clientSecretEnc: encrypt(pending.clientSecret),
          vccApiKeyEnc: encrypt(pending.vccApiKey),
        },
      });

    await tx
      .insert(volvoTokens)
      .values({
        userId: u.id,
        accessTokenEnc: encrypt(tokens.access_token!),
        refreshTokenEnc: encrypt(tokens.refresh_token!),
        expiresAt,
        scope: tokens.scope ?? "",
      })
      .onConflictDoUpdate({
        target: volvoTokens.userId,
        set: {
          accessTokenEnc: encrypt(tokens.access_token!),
          refreshTokenEnc: encrypt(tokens.refresh_token!),
          expiresAt,
          scope: tokens.scope ?? "",
          updatedAt: new Date(),
        },
      });

    return u;
  });

  // Persist all vehicles (Conve GET /vehicles + /vehicles/{vin} per row).
  await bootstrapVehiclesFromConve({
    userId: userRow.id,
    conveCreds: { accessToken: tokens.access_token, vccApiKey: pending.vccApiKey },
  });

  session.userId = userRow.id;
  delete session.pending;
  await session.save();

  return NextResponse.redirect(publicUrl(req, "/dashboard"), { status: 303 });
}
