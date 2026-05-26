"use client";

import { useEffect, useRef } from "react";

const KEY = "volvo-charging.test-token-form";

type Stored = {
  vccApiKey: string;
  energyToken: string;
  conveToken: string;
  locationToken: string;
};

const empty: Stored = {
  vccApiKey: "",
  energyToken: "",
  conveToken: "",
  locationToken: "",
};

export function TestTokenForm() {
  const vccApiKeyRef = useRef<HTMLInputElement>(null);
  const energyTokenRef = useRef<HTMLTextAreaElement>(null);
  const conveTokenRef = useRef<HTMLTextAreaElement>(null);
  const locationTokenRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const v: Stored = { ...empty, ...JSON.parse(raw) };
      if (vccApiKeyRef.current) vccApiKeyRef.current.value = v.vccApiKey;
      if (energyTokenRef.current) energyTokenRef.current.value = v.energyToken;
      if (conveTokenRef.current) conveTokenRef.current.value = v.conveToken;
      if (locationTokenRef.current) locationTokenRef.current.value = v.locationToken;
    } catch {
      /* ignore */
    }
  }, []);

  function persist(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const next: Stored = {
      vccApiKey: String(fd.get("vccApiKey") ?? ""),
      energyToken: String(fd.get("energyToken") ?? ""),
      conveToken: String(fd.get("conveToken") ?? ""),
      locationToken: String(fd.get("locationToken") ?? ""),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  return (
    <form
      action="/api/auth/test-mode"
      method="POST"
      onSubmit={persist}
      className="mt-4 space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
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

      <TokenField
        innerRef={conveTokenRef}
        name="conveToken"
        label="Connected Vehicle API token"
        required
        link={{
          href: "https://developer.volvocars.com/apis/connected-vehicle/v2/overview/",
          label: "Connected Vehicle API docs → Test access tokens",
        }}
        scopes="conve:vehicle_relation"
        hint="We use this to list your VINs and fetch model / battery / photo."
      />
      <TokenField
        innerRef={energyTokenRef}
        name="energyToken"
        label="Energy API token"
        required
        link={{
          href: "https://developer.volvocars.com/apis/energy/v2/overview/",
          label: "Energy API docs → Test access tokens",
        }}
        scopes="energy:state:read, energy:capability:read"
      />
      <TokenField
        innerRef={locationTokenRef}
        name="locationToken"
        label="Location API token"
        link={{
          href: "https://developer.volvocars.com/apis/location/v1/overview/",
          label: "Location API docs → Test access tokens",
        }}
        scopes="location:read"
        hint="Optional. Captures lat/lng on charging-session start and end."
      />

      <button
        type="submit"
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Connect with test tokens
      </button>
      <p className="text-center text-xs text-zinc-500">
        Fields are persisted in your browser&apos;s localStorage so you only paste fresh tokens.
      </p>
    </form>
  );
}

function TokenField({
  innerRef,
  name,
  label,
  link,
  scopes,
  required = false,
  hint,
}: {
  innerRef: React.Ref<HTMLTextAreaElement>;
  name: string;
  label: string;
  link: { href: string; label: string };
  scopes: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        {required ? null : <span className="text-xs font-normal text-zinc-500">optional</span>}
      </span>
      <textarea
        ref={innerRef}
        required={required}
        name={name}
        rows={3}
        placeholder="eyJhbGciOi..."
        className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <span className="mt-1 block text-xs text-zinc-500">
        Scopes: <code className="text-[10px]">{scopes}</code>.{" "}
        <a className="underline" href={link.href} target="_blank" rel="noreferrer">
          {link.label}
        </a>
        {hint ? ` — ${hint}` : null}
      </span>
    </label>
  );
}
