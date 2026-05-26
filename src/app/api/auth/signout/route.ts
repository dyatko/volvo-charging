import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { volvoCredentials, volvoTokens } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { revokeToken } from "@/lib/oauth";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSession();
  const userId = session.userId;

  if (userId) {
    // Best-effort revoke at Volvo before we drop the stored row, so the
    // refresh_token can't keep minting new access tokens after sign-out.
    const tokens = (
      await db.select().from(volvoTokens).where(eq(volvoTokens.userId, userId)).limit(1)
    )[0];
    const creds = (
      await db
        .select()
        .from(volvoCredentials)
        .where(eq(volvoCredentials.userId, userId))
        .limit(1)
    )[0];
    if (tokens?.refreshTokenEnc && creds && creds.clientId !== "test-token") {
      await revokeToken({
        clientId: creds.clientId,
        clientSecret: decrypt(creds.clientSecretEnc),
        token: decrypt(tokens.refreshTokenEnc),
        tokenTypeHint: "refresh_token",
      });
    }
    // Drop the stored tokens regardless of whether the revoke succeeded.
    await db.delete(volvoTokens).where(eq(volvoTokens.userId, userId));
  }

  session.destroy();
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
