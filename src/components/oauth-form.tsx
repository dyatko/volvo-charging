"use client";

import { useEffect, useRef } from "react";

const KEY = "volvo-charging.oauth-form";

type Stored = { clientId: string; clientSecret: string; vccApiKey: string };

const empty: Stored = { clientId: "", clientSecret: "", vccApiKey: "" };

export function OAuthForm() {
  const clientIdRef = useRef<HTMLInputElement>(null);
  const clientSecretRef = useRef<HTMLInputElement>(null);
  const vccApiKeyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const v: Stored = { ...empty, ...JSON.parse(raw) };
      if (clientIdRef.current) clientIdRef.current.value = v.clientId;
      if (clientSecretRef.current) clientSecretRef.current.value = v.clientSecret;
      if (vccApiKeyRef.current) vccApiKeyRef.current.value = v.vccApiKey;
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
          ref={clientIdRef}
          required
          name="clientId"
          autoComplete="off"
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Client secret</span>
        <input
          ref={clientSecretRef}
          required
          type="password"
          name="clientSecret"
          autoComplete="off"
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">VCC API key (Primary)</span>
        <input
          ref={vccApiKeyRef}
          required
          name="vccApiKey"
          autoComplete="off"
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
        Fields are persisted in your browser&apos;s localStorage so you don&apos;t re-paste each visit.
      </p>
    </form>
  );
}
