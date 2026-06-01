"use client";

import { useEffect, useState } from "react";
import { formatLocalDateTime, useIsClient } from "@/components/local-time";

function format(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function RelativeTime({ iso }: { iso: string | null }) {
  const ms = iso ? Date.parse(iso) : null;
  // Drive re-renders with a 1-Hz tick; derive the label during render so we
  // don't setState synchronously inside the effect (react-hooks/set-state-in-effect).
  const [, setTick] = useState(0);
  const isClient = useIsClient();

  useEffect(() => {
    if (ms == null) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [ms]);

  const label = ms != null ? format(ms) : "—";
  // Absolute local time for the hover tooltip — only on the client, so it
  // reflects the viewer's locale + timezone without an SSR mismatch.
  const title = isClient && iso ? formatLocalDateTime(iso) || undefined : undefined;
  return (
    <span suppressHydrationWarning title={title}>
      {label}
    </span>
  );
}
