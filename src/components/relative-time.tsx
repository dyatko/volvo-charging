"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (ms == null) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [ms]);

  const label = ms != null ? format(ms) : "—";
  return <span suppressHydrationWarning>{label}</span>;
}
