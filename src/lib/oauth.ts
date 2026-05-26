import * as oidc from "openid-client";

const ISSUER_URL = new URL("https://volvoid.eu.volvocars.com");

export const VOLVO_SCOPES = [
  "openid",
  "energy:state:read",
  "energy:capability:read",
  "conve:vehicle_relation",
  "location:read",
].join(" ");

/**
 * Run OIDC discovery against the Volvo issuer with the given client credentials.
 * One small network round-trip; cheap to call per request.
 */
export function discoverVolvo(clientId: string, clientSecret: string) {
  return oidc.discovery(ISSUER_URL, clientId, clientSecret);
}

export type StartedAuth = {
  authorizeUrl: string;
  codeVerifier: string;
  state: string;
};

export async function startAuthCodeFlow(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<StartedAuth> {
  const config = await discoverVolvo(opts.clientId, opts.clientSecret);
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: opts.redirectUri,
    scope: VOLVO_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  return { authorizeUrl: url.href, codeVerifier, state };
}

export async function exchangeAuthorizationCode(opts: {
  clientId: string;
  clientSecret: string;
  currentUrl: URL;
  codeVerifier: string;
  expectedState: string;
}) {
  const config = await discoverVolvo(opts.clientId, opts.clientSecret);
  return oidc.authorizationCodeGrant(config, opts.currentUrl, {
    pkceCodeVerifier: opts.codeVerifier,
    expectedState: opts.expectedState,
    idTokenExpected: true,
  });
}

export async function refreshAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const config = await discoverVolvo(opts.clientId, opts.clientSecret);
  return oidc.refreshTokenGrant(config, opts.refreshToken);
}

/**
 * Best-effort token revocation at Volvo. Per RFC 7009, revoke endpoint
 * returns 200 even for invalid tokens, so failures only matter as
 * telemetry. Pingfederate (Volvo's IDP) exposes the revoke endpoint at
 * /as/revoke_token.oauth2.
 */
export async function revokeToken(opts: {
  clientId: string;
  clientSecret: string;
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token";
}): Promise<void> {
  const body = new URLSearchParams({
    token: opts.token,
    ...(opts.tokenTypeHint ? { token_type_hint: opts.tokenTypeHint } : {}),
  });
  const auth = Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64");
  try {
    await fetch("https://volvoid.eu.volvocars.com/as/revoke_token.oauth2", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body,
    });
  } catch (e) {
    console.error("token revoke failed (non-fatal)", e instanceof Error ? e.message : String(e));
  }
}
