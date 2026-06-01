import Image from "next/image";
import { SocPill } from "@/components/soc-pill";
import { RelativeTime } from "@/components/relative-time";
import { SessionsSection } from "@/components/sessions-section";
import { Pill, MapLink, Divider, fmtCoord, friendly } from "@/components/vehicle-dashboard-bits";
import { fmtKw, fmtKwh } from "@/lib/format";
import { isConnected } from "@/lib/pollCadence";
import { socRingColor } from "@/lib/soc-color";
import type { VehicleDashboardProps } from "@/lib/dashboard/types";

// The vehicle "snapshot" UI — header + status pill + charging-session list.
// Presentational and data-agnostic so it can render real signed-in data on the
// dashboard *and* locally-generated mock data as a demo on the landing page.
// Its prop shapes (and the real/demo data sources) live in src/lib/dashboard/.

export function VehicleDashboard({
  vehicle,
  latest,
  sessions,
  demo = false,
  mapApiKey = null,
  mapId = "DEMO_MAP_ID",
}: VehicleDashboardProps) {
  // Charging power is the live charge rate, so it's only meaningful while the
  // cable is in. Show it when the car is plugged in or actively charging, and
  // only when we actually have a reading — chargingPower can come back
  // ERROR/NOT_SUPPORTED even on a charging car, and a null shouldn't render as
  // a misleading "0 kW".
  const chargingKw = latest?.chargingPowerKw;
  const showChargingKw =
    (isConnected(latest?.connectionStatus) || latest?.chargingStatus === "CHARGING") &&
    chargingKw != null;
  const chargingKwLabel = showChargingKw ? fmtKw(chargingKw) : null;

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            {vehicle.model ? `Volvo ${vehicle.model}` : "Volvo"}
            {vehicle.modelYear ? (
              <span className="ml-1 font-normal text-zinc-500">· {vehicle.modelYear}</span>
            ) : null}
          </h1>
          <p className="mt-0.5 break-all text-xs text-zinc-500">
            {vehicle.batteryCapacityKwh != null ? (
              <span className="tabular-nums">{fmtKwh(vehicle.batteryCapacityKwh)}</span>
            ) : null}
            {vehicle.batteryCapacityKwh != null ? <span> · </span> : null}
            <span className="font-mono">{vehicle.vin}</span>
          </p>
        </div>
        {vehicle.exteriorImageUrl ? (
          <Image
            src={vehicle.exteriorImageUrl}
            alt={vehicle.model ? `${vehicle.model} exterior` : "Vehicle exterior"}
            width={120}
            height={72}
            className="h-16 w-24 shrink-0 rounded object-cover"
            unoptimized
          />
        ) : null}
      </header>

      <SocPill
        value={latest?.soc ?? 0}
        ringColor={latest?.soc != null ? socRingColor(latest.soc) : null}
        targetSoc={latest?.targetSoc ?? null}
      >
        <div className="px-3 py-3">
          {/* Top: location · last updated, one-liner spanning the full width */}
          <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 px-2 text-[10px] leading-tight text-zinc-500">
            {vehicle.currentLat != null && vehicle.currentLng != null ? (
              <span className={vehicle.locationName ? undefined : "font-mono tabular-nums"}>
                <span aria-hidden>📍</span>{" "}
                <MapLink
                  lat={vehicle.currentLat}
                  lng={vehicle.currentLng}
                  label={vehicle.locationName ?? fmtCoord(vehicle.currentLat, vehicle.currentLng) ?? ""}
                  demo={demo}
                  className="underline-offset-2 hover:text-zinc-700 hover:underline dark:hover:text-zinc-300"
                />
              </span>
            ) : (
              <span className="text-zinc-400">No location</span>
            )}
            <span aria-hidden className="text-zinc-300 dark:text-zinc-700">
              ·
            </span>
            <span>
              Updated <RelativeTime iso={vehicle.lastSeenAt ?? latest?.observedAt ?? null} />
            </span>
          </div>

          <Divider className="my-2.5" />

          {/* battery | charging */}
          <div className="flex items-stretch">
            {/* Battery: level · range · target */}
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-3 text-center">
              <div className="text-xl font-semibold leading-none tabular-nums">
                {latest?.soc != null ? latest.soc : "—"}
                <span className="text-xs font-normal text-zinc-500">%</span>
              </div>
              <div className="text-[10px] leading-tight text-zinc-500">
                {latest?.rangeKm != null ? <>~{latest.rangeKm}&nbsp;km</> : "range —"}
                {latest?.targetSoc != null ? <> · target&nbsp;{latest.targetSoc}%</> : null}
              </div>
            </div>

            <Divider orientation="vertical" />

            {/* Charging speed · statuses */}
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-3 text-center">
              {chargingKwLabel ? (
                <div className="whitespace-nowrap text-sm font-medium leading-none tabular-nums">
                  {chargingKwLabel}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-center gap-1">
                <Pill label={friendly[latest?.connectionStatus ?? ""] ?? "—"} />
                <Pill label={friendly[latest?.chargingStatus ?? ""] ?? "—"} />
                {latest?.chargingType && latest.chargingType !== "NONE" ? (
                  <Pill label={friendly[latest.chargingType] ?? latest.chargingType} />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </SocPill>

      <section className="mt-6">
        {/* Heading (with the date-range pickers) lives inside SessionsSection. */}
        <SessionsSection
          sessions={sessions}
          latestSoc={latest?.soc ?? null}
          batteryCapacityKwh={vehicle.batteryCapacityKwh}
          demo={demo}
          mapApiKey={mapApiKey}
          mapId={mapId}
        />
      </section>
    </>
  );
}
