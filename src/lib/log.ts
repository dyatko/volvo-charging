/**
 * Structured logging for Cloud Run / Cloud Logging.
 *
 * Cloud Logging parses a single-line JSON object on stdout/stderr into a
 * LogEntry: the `severity` field sets the level, `message` becomes the summary,
 * and every other field lands in `jsonPayload` — so `jsonPayload.vin="…"` and
 * `severity>=WARNING` become first-class filters in the Logs Explorer. Locally
 * (`pnpm dev`) we print a readable one-liner instead so the console stays legible.
 *
 * Keep call sites cheap: `log.warn("poll failed", { vin, status })`. Pass a
 * normalised string via `errText()` rather than a raw Error, whose stack would
 * bloat the payload and isn't queryable.
 */

type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR";

const isProd = process.env.NODE_ENV === "production";

function emit(severity: Severity, message: string, fields?: Record<string, unknown>) {
  const hasFields = fields && Object.keys(fields).length > 0;
  const line = isProd
    ? JSON.stringify({ severity, message, ...fields })
    : `[${severity}] ${message}${hasFields ? " " + JSON.stringify(fields) : ""}`;
  // Route by severity so Cloud Logging picks up ERROR/WARNING from stderr too.
  if (severity === "ERROR") console.error(line);
  else if (severity === "WARNING") console.warn(line);
  else console.log(line);
}

/** Normalise an unknown thrown value to a short string for log/db fields. */
export function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("DEBUG", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("INFO", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("WARNING", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("ERROR", message, fields),
};
