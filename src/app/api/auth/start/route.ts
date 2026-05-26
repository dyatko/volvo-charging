import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { startAuthCodeFlow } from "@/lib/oauth";

const Form = z.object({
  clientId: z.string().min(1, "client_id is required"),
  clientSecret: z.string().min(1, "client_secret is required"),
  vccApiKey: z.string().min(20, "vcc-api-key must be 20+ chars"),
});

export async function POST(req: Request) {
  const form = await req.formData();
  const parsed = Form.safeParse({
    clientId: form.get("clientId"),
    clientSecret: form.get("clientSecret"),
    vccApiKey: form.get("vccApiKey"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid form", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/callback`;

  let started;
  try {
    started = await startAuthCodeFlow({
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret,
      redirectUri,
    });
  } catch (e) {
    return NextResponse.redirect(
      new URL(
        `/?oauth_error=${encodeURIComponent(
          `discovery failed: ${e instanceof Error ? e.message : String(e)}`,
        )}`,
        req.url,
      ),
      { status: 303 },
    );
  }

  const session = await getSession();
  session.pending = {
    clientId: parsed.data.clientId,
    clientSecret: parsed.data.clientSecret,
    vccApiKey: parsed.data.vccApiKey,
    codeVerifier: started.codeVerifier,
    state: started.state,
    redirectUri,
  };
  await session.save();

  return NextResponse.redirect(started.authorizeUrl, { status: 303 });
}
