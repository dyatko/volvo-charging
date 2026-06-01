"use client";

import { useSyncExternalStore } from "react";

/**
 * Absolute date-times are stored in UTC and must be rendered in the *viewer's*
 * locale and timezone — something only the browser knows. Formatting on the
 * server would use Cloud Run's locale/UTC, so it has to happen client-side.
 *
 * Use the `<LocalTime>` component in JSX; use `formatLocalDateTime()` when you
 * just need the string (e.g. a tooltip) from a client component.
 */

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const TIME_FIELDS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/**
 * Default *date* field set, chosen by how old the timestamp is: within the past
 * year we show a short weekday and drop the (obvious) year; older than that we
 * drop the weekday and show the year instead.
 */
function defaultDateFields(d: Date): Intl.DateTimeFormatOptions {
  const age = Date.now() - d.getTime();
  return age >= 0 && age < YEAR_MS
    ? { weekday: "short", day: "numeric", month: "short" }
    : { year: "numeric", day: "numeric", month: "short" };
}

/** Default field set for a date-time: the age-aware date fields plus the time. */
function defaultFields(d: Date): Intl.DateTimeFormatOptions {
  return { ...defaultDateFields(d), ...TIME_FIELDS };
}

/**
 * Format an ISO string as a date only (no time) in the browser's locale +
 * timezone, using the age-aware field set (`defaultDateFields`). "" for empty
 * input.
 */
export function formatLocalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, defaultDateFields(d)).format(d);
}

const emptySubscribe = () => () => {};

/**
 * `false` during SSR and the first hydration render, then `true`. Backed by
 * useSyncExternalStore so React re-renders to the client value without a
 * hydration mismatch and without setState-in-effect.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * Format an ISO string in the browser's locale + timezone. "" for empty input.
 * Defaults to an age-aware field set (see `defaultFields`); pass `options` to
 * override.
 */
export function formatLocalDateTime(
  iso: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, options ?? defaultFields(d)).format(d);
}

export function LocalTime({
  iso,
  options,
  fallback = "—",
}: {
  iso: string | null | undefined;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
}) {
  const isClient = useIsClient();
  if (!iso) return <time suppressHydrationWarning>{fallback}</time>;

  const d = new Date(iso);
  const opts = options ?? defaultFields(d);
  // SSR + first client render use a fixed UTC/en-GB rendering so hydration
  // matches and there's no blank flash; once on the client we re-render in the
  // viewer's real locale + timezone.
  const text = isClient
    ? new Intl.DateTimeFormat(undefined, opts).format(d)
    : new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(d);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
