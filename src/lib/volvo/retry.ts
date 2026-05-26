/**
 * Volvo asks every client to handle 429 (and transient 5xx) with exponential
 * backoff + jitter, respecting Retry-After when present, capped retries:
 *   https://developer.volvocars.com/news/api-rate-limits/
 *
 * This wrapper accepts the openapi-fetch `client.GET/POST/…` call shape and
 * retries on 429 and 5xx up to `maxAttempts` times. Anything else (4xx,
 * network) is returned as-is so the caller can decide.
 */
type FetchResult<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(MAX_DELAY_MS, seconds * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function backoff(attempt: number): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  // Full jitter: a random delay in [0, exp). Prevents thundering herd.
  return Math.floor(Math.random() * exp);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(call: () => Promise<FetchResult<T>>): Promise<FetchResult<T>> {
  let last: FetchResult<T> | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await call();
    const status = result.response.status;
    if (status !== 429 && status < 500) return result;
    last = result;
    if (attempt === MAX_ATTEMPTS) break;
    const retryAfter = parseRetryAfter(result.response.headers.get("Retry-After"));
    await sleep(retryAfter ?? backoff(attempt));
  }
  return last!;
}
