/**
 * The placeholder value infra/bootstrap.sh seeds into Secret Manager so a Cloud
 * Run deploy (which hard-requires every referenced secret to have a `latest`
 * version) stays green before a real value is provisioned. Treated as "unset"
 * everywhere so the dependent feature stays dark until an operator overwrites it.
 */
const PLACEHOLDER_KEY = "SET_ME";

/**
 * Read an optional configuration value from the environment. Returns null when
 * the variable is unset, blank, or still the bootstrap placeholder — so callers
 * can treat null uniformly as "not configured / feature off".
 */
export function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value || value === PLACEHOLDER_KEY) return null;
  return value;
}
