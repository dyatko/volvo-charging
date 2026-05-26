"use client";

import { useEffect, useState } from "react";

const KEY = "volvo-charging.test-token-form";

type Stored = {
  vccApiKey: string;
  vin: string;
  energyToken: string;
  conveToken: string;
  locationToken: string;
};

const empty: Stored = {
  vccApiKey: "",
  vin: "",
  energyToken: "",
  conveToken: "",
  locationToken: "",
};

export function TestTokenForm() {
  const [v, setV] = useState<Stored>(empty);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setV({ ...empty, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  function persist(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const next: Stored = {
      vccApiKey: String(fd.get("vccApiKey") ?? ""),
      vin: String(fd.get("vin") ?? ""),
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <label className="block">
          <span className="text-sm font-medium">VIN</span>
          <input
            required
            name="vin"
            placeholder="YV1..."
            defaultValue={v.vin}
            key={`vin-${v.vin}`}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      <TokenField
        name="energyToken"
        label="Energy API token"
        required
        link={{
          href: "https://developer.volvocars.com/apis/energy/v2/overview/",
          label: "Energy API docs → Test access tokens",
        }}
        scopes="energy:state:read, energy:capability:read"
        initial={v.energyToken}
      />
      <TokenField
        name="conveToken"
        label="Connected Vehicle API token"
        link={{
          href: "https://developer.volvocars.com/apis/connected-vehicle/v2/overview/",
          label: "Connected Vehicle API docs → Test access tokens",
        }}
        scopes="conve:vehicle_relation"
        hint="Optional. Enables model name, battery capacity, and the car photo."
        initial={v.conveToken}
      />
      <TokenField
        name="locationToken"
        label="Location API token"
        link={{
          href: "https://developer.volvocars.com/apis/location/v1/overview/",
          label: "Location API docs → Test access tokens",
        }}
        scopes="location:read"
        hint="Optional. Captures lat/lng on charging-session start and end."
        initial={v.locationToken}
      />

      <button
        type="submit"
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Connect with test tokens
      </button>
      <p className="text-center text-xs text-zinc-500">
        Fields are persisted in your browser's localStorage so you only paste fresh tokens.
      </p>
    </form>
  );
}

function TokenField({
  name,
  label,
  link,
  scopes,
  required = false,
  hint,
  initial,
}: {
  name: string;
  label: string;
  link: { href: string; label: string };
  scopes: string;
  required?: boolean;
  hint?: string;
  initial: string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        {required ? null : <span className="text-xs font-normal text-zinc-500">optional</span>}
      </span>
      <textarea
        required={required}
        name={name}
        rows={3}
        placeholder="eyJhbGciOi..."
        defaultValue={initial}
        key={`${name}-${initial.slice(0, 16)}`}
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
