import Link from "next/link";
import { VehicleSwitcher } from "@/components/vehicle-switcher";
import type { VehicleRow } from "@/lib/userVehicle";

type Props =
  | { signedIn: false }
  | { signedIn: true; vehicles: VehicleRow[]; activeVin: string | null };

export function Nav(props: Props) {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div
        className={
          "mx-auto flex items-center gap-3 px-4 py-3 " +
          (props.signedIn ? "max-w-3xl justify-between" : "max-w-3xl justify-center")
        }
      >
        <Link
          href={props.signedIn ? "/dashboard" : "/"}
          className="whitespace-nowrap font-semibold tracking-tight"
        >
          ⚡ EV Charging History
        </Link>
        {props.signedIn ? (
          <div className="flex flex-1 items-center justify-end gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <VehicleSwitcher vehicles={props.vehicles} activeVin={props.activeVin} />
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
