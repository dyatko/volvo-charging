import { OAuth2Client } from "google-auth-library";

let client: OAuth2Client | null = null;
function getClient() {
  if (!client) client = new OAuth2Client();
  return client;
}

/**
 * Verify that the incoming request carries a Google-signed OIDC ID token
 * minted for the configured service-account caller (Cloud Scheduler), with
 * the audience set to the request's own origin (matching how Scheduler is
 * configured below in infra/bootstrap.sh).
 *
 * In local dev, set ALLOW_UNAUTHENTICATED_INTERNAL=1 to bypass — this is
 * how `pnpm tick` works against the local server.
 */
export async function verifyInternalCaller(req: Request): Promise<{
  ok: true;
  email: string;
} | { ok: false; reason: string }> {
  if (process.env.ALLOW_UNAUTHENTICATED_INTERNAL === "1") {
    return { ok: true, email: "local-dev" };
  }

  const expectedEmail = process.env.INTERNAL_CALLER_EMAIL;
  if (!expectedEmail) {
    return { ok: false, reason: "INTERNAL_CALLER_EMAIL not configured" };
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return { ok: false, reason: "missing Bearer token" };
  }

  const idToken = auth.slice(7);
  const audience = new URL(req.url).origin;

  try {
    const ticket = await getClient().verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    if (!payload) return { ok: false, reason: "no payload" };
    if (payload.email !== expectedEmail) {
      return { ok: false, reason: `email mismatch: ${payload.email}` };
    }
    if (payload.email_verified !== true) {
      return { ok: false, reason: "email not verified" };
    }
    return { ok: true, email: payload.email };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
