import Link from "next/link";
import { VehicleSwitcher } from "@/components/vehicle-switcher";
import type { VehicleRow } from "@/lib/userVehicle";

type Props =
  | { signedIn: false }
  | { signedIn: true; vehicles: VehicleRow[]; activeVin: string | null };

export function Nav(props: Props) {
  return (
    <header className="sticky top-0 z-10 px-4 pt-3 pb-1">
      <div
        className={
          "mx-auto flex max-w-3xl items-center gap-3 rounded-full border border-zinc-200/70 bg-white/70 py-1.5 pl-4 pr-2 shadow-lg shadow-black/5 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-zinc-900/60 dark:shadow-black/30 " +
          (props.signedIn ? "justify-between" : "justify-center")
        }
      >
        <Link
          href={props.signedIn ? "/dashboard" : "/"}
          className="whitespace-nowrap text-sm font-semibold tracking-tight"
        >
          ⚡ EV Charging History
        </Link>
        {props.signedIn ? (
          <div className="flex flex-1 items-center justify-end gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            <VehicleSwitcher vehicles={props.vehicles} activeVin={props.activeVin} />
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="rounded-full px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-900 dark:hover:bg-white/5 dark:hover:text-zinc-100"
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
