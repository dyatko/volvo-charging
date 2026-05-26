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
  const [label, setLabel] = useState<string>(ms != null ? format(ms) : "—");

  useEffect(() => {
    if (ms == null) return;
    setLabel(format(ms));
    const id = setInterval(() => setLabel(format(ms)), 1000);
    return () => clearInterval(id);
  }, [ms]);

  return <span suppressHydrationWarning>{label}</span>;
}
