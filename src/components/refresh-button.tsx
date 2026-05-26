"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  async function onClick() {
    setFeedback(null);
    const res = await fetch("/api/poll", { method: "POST" });
    const body = (await res.json()) as
      | { ok: true; snapshotInserted: boolean; transition?: string; observedAt: string }
      | { ok: false; reason: string; status?: number };
    if (!body.ok) {
      setFeedback(`✗ ${body.reason}${body.status ? ` (${body.status})` : ""}`);
      return;
    }
    setFeedback(
      body.snapshotInserted
        ? `↻ new snapshot${body.transition !== "none" ? ` · session ${body.transition}` : ""}`
        : "↻ no change since last poll",
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {isPending ? "Refreshing…" : "Refresh now"}
      </button>
      {feedback ? (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{feedback}</span>
      ) : null}
    </div>
  );
}
