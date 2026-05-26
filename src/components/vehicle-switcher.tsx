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
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-mono disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
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
