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
export function publicOrigin(req: Request): string {
  const headers = req.headers;
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
  const host =
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

/** Build a fully-qualified URL on the public origin from a relative path. */
export function publicUrl(req: Request, path: string): URL {
  return new URL(path, publicOrigin(req));
}
