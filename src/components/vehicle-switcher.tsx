"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { VehicleRow } from "@/lib/userVehicle";

export function VehicleSwitcher({
  vehicles,
  activeVin,
}: {
  vehicles: VehicleRow[];
  activeVin: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (vehicles.length <= 1) return null;

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const vin = e.target.value;
    await fetch("/api/vehicles/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vin }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <select
      value={activeVin ?? ""}
      onChange={onChange}
      disabled={isPending}
      className="rounded-full border border-zinc-300/70 bg-white/60 px-3 py-1 text-xs font-mono backdrop-blur disabled:opacity-50 dark:border-white/10 dark:bg-zinc-800/60"
      aria-label="Switch vehicle"
    >
      {vehicles.map((v) => (
        <option key={v.vin} value={v.vin}>
          {v.model ?? "Volvo"}
          {v.modelYear ? ` ${v.modelYear}` : ""} · {v.vin}
        </option>
      ))}
    </select>
  );
}
