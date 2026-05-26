import { makeEnergyClient } from "@/lib/volvo/client";
import { readField, type EnergyState } from "@/lib/volvo/state";

export const dynamic = "force-dynamic";

async function fetchState(): Promise<
  | { ok: true; vin: string; state: EnergyState }
  | { ok: false; reason: string; status?: number }
> {
  const accessToken = process.env.VOLVO_ACCESS_TOKEN;
  const vccApiKey = process.env.VCC_API_KEY;
  const vin = process.env.VOLVO_VIN;
  if (!accessToken || !vccApiKey || !vin) {
    return {
      ok: false,
      reason:
        "Set VOLVO_ACCESS_TOKEN, VCC_API_KEY, and VOLVO_VIN in .env.local",
    };
  }
  const client = makeEnergyClient({ accessToken, vccApiKey });
  const { data, error, response } = await client.GET(
    "/vehicles/{vin}/state",
    { params: { path: { vin } } },
  );
  if (error || !data) {
    return {
      ok: false,
      reason: JSON.stringify(error ?? "unknown error"),
      status: response?.status,
    };
  }
  return { ok: true, vin, state: data };
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
        (ok
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300")
      }
    >
      {label}
    </span>
  );
}

function FieldRow({
  label,
  value,
  unit,
  updatedAt,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  updatedAt?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-zinc-200 py-2 dark:border-zinc-800">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-right">
        <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
          {value}
          {unit ? <span className="ml-1 text-xs text-zinc-500">{unit}</span> : null}
        </span>
        {updatedAt ? (
          <div className="text-xs text-zinc-500">{new Date(updatedAt).toLocaleString()}</div>
        ) : null}
      </span>
    </div>
  );
}

function renderField(label: string, field: EnergyState[keyof EnergyState]) {
  const r = readField(field);
  if (r.ok) {
    return (
      <FieldRow
        key={label}
        label={label}
        value={String(r.value)}
        unit={r.unit}
        updatedAt={r.updatedAt}
      />
    );
  }
  return (
    <FieldRow
      key={label}
      label={label}
      value={
        <span className="text-zinc-400">
          <StatusPill label={r.code} ok={false} />
        </span>
      }
    />
  );
}

export default async function DashboardPage() {
  const result = await fetchState();

  return (
    <main className="mx-auto min-h-svh max-w-md p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Charging</h1>
        {result.ok ? (
          <p className="text-xs text-zinc-500">VIN ••• {result.vin.slice(-4)}</p>
        ) : null}
      </header>

      {!result.ok ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          <p className="font-medium">Cannot reach Volvo Energy API.</p>
          <p className="mt-1">
            {result.status ? `HTTP ${result.status}. ` : ""}
            {result.reason}
          </p>
        </div>
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {renderField("Battery", result.state.batteryChargeLevel)}
          {renderField("Range", result.state.electricRange)}
          {renderField("Connection", result.state.chargerConnectionStatus)}
          {renderField("Charging status", result.state.chargingStatus)}
          {renderField("Charging type", result.state.chargingType)}
          {renderField("Charger power", result.state.chargerPowerStatus)}
          {renderField("Charging power", result.state.chargingPower)}
          {renderField("Target SOC", result.state.targetBatteryChargeLevel)}
          {renderField("Current limit", result.state.chargingCurrentLimit)}
          {renderField(
            "Time to target",
            result.state.estimatedChargingTimeToTargetBatteryChargeLevel,
          )}
        </section>
      )}
    </main>
  );
}
