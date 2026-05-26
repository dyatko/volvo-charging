import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type AppSession = {
  userId?: string;
  // Held only between /api/auth/start and /api/auth/callback.
  // iron-session encrypts the cookie with SESSION_SECRET, so the BYOC secret
  // is opaque to the browser; cleared as soon as the callback completes.
  pending?: {
    clientId: string;
    clientSecret: string;
    vccApiKey: string;
    codeVerifier: string;
    state: string;
    redirectUri: string;
  };
};

function options(): SessionOptions {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 chars");
  }
  return {
    password: secret,
    cookieName: "volvo_charging_session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

export async function getSession(): Promise<IronSession<AppSession>> {
  return getIronSession<AppSession>(await cookies(), options());
}
