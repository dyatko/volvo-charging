import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { startAuthCodeFlow } from "@/lib/oauth";
import { publicOrigin, publicUrl } from "@/lib/origin";
import { getPublishedAppCreds } from "@/lib/volvoConfig";

export async function GET(req: Request) {
  const creds = getPublishedAppCreds();
  if (!creds) {
    return NextResponse.redirect(
      publicUrl(req, `/?oauth_error=${encodeURIComponent("server_missing_volvo_credentials")}`),
      { status: 303 },
    );
  }

  const redirectUri = `${publicOrigin(req)}/api/auth/callback`;

  let started;
  try {
    started = await startAuthCodeFlow({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      redirectUri,
    });
  } catch (e) {
    return NextResponse.redirect(
      publicUrl(
        req,
        `/?oauth_error=${encodeURIComponent(
          `discovery failed: ${e instanceof Error ? e.message : String(e)}`,
        )}`,
      ),
      { status: 303 },
    );
  }

  const session = await getSession();
  session.pending = {
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    vccApiKey: creds.vccApiKey,
    codeVerifier: started.codeVerifier,
    state: started.state,
    redirectUri,
  };
  await session.save();

  return NextResponse.redirect(started.authorizeUrl, { status: 303 });
}
