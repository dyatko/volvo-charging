/**
 * Return the **public** origin the user sees in their browser, even when
 * Node sees the container's internal bind (e.g. http://0.0.0.0:8080 on
 * Cloud Run). Prefers `X-Forwarded-Host` + `X-Forwarded-Proto` (set by
 * Cloud Run / any standard load balancer); falls back to the `Host` header;
 * last resort is `new URL(req.url).origin`.
 *
 * Use this in every `NextResponse.redirect(new URL(path, …))` and every
 * place we mint a public URL (OAuth redirect_uri, OG metadata, etc.).
 */
function originFromHeaders(headers: Headers): string | null {
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
  const host =
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    headers.get("host");
  return host ? `${proto}://${host}` : null;
}

export function publicOrigin(req: Request): string {
  return originFromHeaders(req.headers) ?? new URL(req.url).origin;
}

/**
 * Same as {@link publicOrigin} but for callers that only have a `Headers`
 * instance (e.g. metadata routes via `next/headers`). Falls back to
 * localhost only when no forwarded host is present — i.e. dev.
 */
export function publicOriginFromHeaders(headers: Headers): string {
  return originFromHeaders(headers) ?? "http://localhost:3000";
}

/** Build a fully-qualified URL on the public origin from a relative path. */
export function publicUrl(req: Request, path: string): URL {
  return new URL(path, publicOrigin(req));
}
