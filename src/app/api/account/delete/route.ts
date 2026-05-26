import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, volvoCredentials, volvoTokens } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { revokeToken } from "@/lib/oauth";
import { getSession } from "@/lib/session";
import { publicUrl } from "@/lib/origin";

/**
 * Hard-deletes the signed-in user: revokes their Volvo refresh token, then
 * `DELETE FROM users WHERE id=…` — every other table (volvo_credentials,
 * volvo_tokens, vehicles, state_snapshots, charging_sessions) cascades.
 *
 * GDPR Art. 17 ("right to erasure"). The redirect terminates the session
 * cookie so the user immediately lands back on /.
 */
export async function POST(req: Request) {
  const session = await getSession();
  const userId = session.userId;
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "not signed in" }, { status: 401 });
  }

  const tokens = (
    await db.select().from(volvoTokens).where(eq(volvoTokens.userId, userId)).limit(1)
  )[0];
  const creds = (
    await db.select().from(volvoCredentials).where(eq(volvoCredentials.userId, userId)).limit(1)
  )[0];

  if (tokens?.refreshTokenEnc && creds && creds.clientId !== "test-token") {
    await revokeToken({
      clientId: creds.clientId,
      clientSecret: decrypt(creds.clientSecretEnc),
      token: decrypt(tokens.refreshTokenEnc),
      tokenTypeHint: "refresh_token",
    });
  }

  // Cascade does the rest.
  await db.delete(users).where(eq(users.id, userId));

  session.destroy();
  return NextResponse.redirect(publicUrl(req, "/?deleted=1"), { status: 303 });
}
