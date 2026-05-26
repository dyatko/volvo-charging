"use client";

import { useEffect, useState } from "react";

const KEY = "volvo-charging.oauth-form";

type Stored = { clientId: string; clientSecret: string; vccApiKey: string };

export function OAuthForm() {
  const [v, setV] = useState<Stored>({ clientId: "", clientSecret: "", vccApiKey: "" });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setV({ ...{ clientId: "", clientSecret: "", vccApiKey: "" }, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  function persist(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const next: Stored = {
      clientId: String(fd.get("clientId") ?? ""),
      clientSecret: String(fd.get("clientSecret") ?? ""),
      vccApiKey: String(fd.get("vccApiKey") ?? ""),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  return (
    <form
      action="/api/auth/start"
      method="POST"
      onSubmit={persist}
      className="mt-4 space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <label className="block">
        <span className="text-sm font-medium">Client ID</span>
        <input
          required
          name="clientId"
          autoComplete="off"
          defaultValue={v.clientId}
          key={`cid-${v.clientId}`}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Client secret</span>
        <input
          required
          type="password"
          name="clientSecret"
          autoComplete="off"
          defaultValue={v.clientSecret}
          key={`cs-${v.clientSecret}`}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">VCC API key (Primary)</span>
        <input
          required
          name="vccApiKey"
          autoComplete="off"
          defaultValue={v.vccApiKey}
          key={`vcc-${v.vccApiKey}`}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Sign in with Volvo ID
      </button>
      <p className="text-center text-xs text-zinc-500">
        Fields are persisted in your browser's localStorage so you don't re-paste each visit.
      </p>
    </form>
  );
}
