import type { SVGProps } from "react";
import { BRAND_GREEN, BRAND_ORANGE, BRAND_RED } from "@/lib/brand";

export type ChargingLogoState = "low" | "mid" | "high";

export function stateFromSoc(soc: number | null | undefined): ChargingLogoState {
  if (soc == null) return "high";
  if (soc < 33) return "low";
  if (soc < 66) return "mid";
  return "high";
}

type Props = Omit<SVGProps<SVGSVGElement>, "viewBox" | "children"> & {
  soc?: number | null;
  state?: ChargingLogoState;
  title?: string;
};

const BAR_Y = [42, 55, 68] as const;

export function ChargingLogo({ soc, state: override, title, ...rest }: Props) {
  const state = override ?? stateFromSoc(soc);
  const active =
    state === "low" ? BRAND_RED : state === "mid" ? BRAND_ORANGE : BRAND_GREEN;
  const filled =
    state === "low" ? [false, false, true] : state === "mid" ? [false, true, true] : [true, true, true];

  return (
    <svg
      viewBox="4 11 84 84"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      <circle cx="42" cy="58" r="34" fill="none" stroke="currentColor" strokeWidth="7" />
      <path d="M 87 13 L 77 23 L 88 29 L 62 38 L 70 27 L 60 21 Z" fill="currentColor" />
      {BAR_Y.map((y, i) =>
        filled[i] ? (
          <rect key={y} x="22" y={y} width="40" height="9" rx="2" fill={active} />
        ) : (
          <rect
            key={y}
            x="22"
            y={y}
            width="40"
            height="9"
            rx="2"
            className="fill-zinc-200 dark:fill-zinc-800"
          />
        ),
      )}
    </svg>
  );
}
