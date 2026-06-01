"use client";

import { useEffect, useRef, useState } from "react";

const TRACK_WIDTH = 2; // px — light-grey "100%" track (the CSS border)
const ARC_WIDTH = 4; // px — the target + current progress arcs
// Large sentinel → fully-rounded "stadium" ends like the Volvo cluster pill.
// Both the CSS border-radius and the SVG path radius clamp to half the height,
// so they stay aligned at any size.
const RADIUS = 9999; // px — outer corner radius of the pill

/**
 * A Volvo-cluster-style status pill: content sits inside a rounded "stadium"
 * whose border doubles as a charge-progress indicator. Three layers, all
 * starting at top-centre and running clockwise, stacked from the outer edge in:
 *
 *   1. the faint CSS border — a thin (2px) grey track for the whole 100%
 *      perimeter (always painted, so there's no flash before measurement);
 *   2. a slightly darker grey 4px arc up to `targetSoc`% — the target marker;
 *   3. the coloured 4px arc up to `value`% — the current charge, on top.
 *
 * So the filled part is a fat coloured band, the gap up to the target shows as
 * a darker grey band, and the remainder is the thin light track.
 *
 * The element is measured client-side (ResizeObserver) so the SVG can be sized
 * to exact device pixels — that keeps the corners crisp and the dash maths
 * correct at any width, which `preserveAspectRatio="none"` could not.
 */
export function SocPill({
  value,
  ringColor,
  targetSoc = null,
  children,
}: {
  value: number; // 0..100
  ringColor: string | null;
  /** Target SOC (0..100); drawn as the darker-grey middle arc. */
  targetSoc?: number | null;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Geometry for the 4px arcs. They sit flush to the pill's outer edge (inset
  // half a stroke), so they nest cleanly over the thin track without poking out.
  // The path is hand-built so it *starts at top-centre* and runs clockwise — a
  // plain <rect> stroke would start at the top-left corner instead.
  let dPath = "";
  let perim = 1;
  let valueDash = 0;
  let targetDash = 0;
  if (box) {
    const inset = ARC_WIDTH / 2;
    const w = box.w - ARC_WIDTH;
    const h = box.h - ARC_WIDTH;
    const x0 = inset;
    const y0 = inset;
    const r = Math.min(RADIUS - inset, h / 2, w / 2);
    const left = x0;
    const right = x0 + w;
    const top = y0;
    const bottom = y0 + h;
    const cx = x0 + w / 2;
    const straightX = Math.max(0, w - 2 * r);
    const straightY = Math.max(0, h - 2 * r);
    perim = 2 * straightX + 2 * straightY + 2 * Math.PI * r;
    valueDash = (perim * Math.max(0, Math.min(100, value))) / 100;
    targetDash =
      targetSoc != null ? (perim * Math.max(0, Math.min(100, targetSoc))) / 100 : 0;
    dPath = [
      `M ${cx} ${top}`,
      `L ${right - r} ${top}`,
      `A ${r} ${r} 0 0 1 ${right} ${top + r}`,
      `L ${right} ${bottom - r}`,
      `A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
      `L ${left + r} ${bottom}`,
      `A ${r} ${r} 0 0 1 ${left} ${bottom - r}`,
      `L ${left} ${top + r}`,
      `A ${r} ${r} 0 0 1 ${left + r} ${top}`,
      `L ${cx} ${top}`,
    ].join(" ");
  }

  const showTarget = box && targetSoc != null && targetSoc > 0;
  const showValue = box && ringColor && value > 0;

  return (
    <div
      ref={ref}
      className="relative border-zinc-200/80 dark:border-zinc-800"
      style={{ borderStyle: "solid", borderWidth: TRACK_WIDTH, borderRadius: RADIUS }}
    >
      {showTarget || showValue ? (
        <svg
          width={box!.w}
          height={box!.h}
          aria-hidden
          className="pointer-events-none absolute"
          style={{ top: -TRACK_WIDTH, left: -TRACK_WIDTH, overflow: "visible" }}
        >
          {/* Target arc (drawn first, under the colour) — darker grey to the
              target's perimeter distance. */}
          {showTarget ? (
            <path
              d={dPath}
              fill="none"
              className="text-zinc-300 dark:text-zinc-600"
              stroke="currentColor"
              strokeWidth={ARC_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${targetDash} ${perim}`}
            />
          ) : null}
          {/* Current charge arc — the colour, on top. */}
          {showValue ? (
            <path
              d={dPath}
              fill="none"
              stroke={ringColor!}
              strokeWidth={ARC_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${valueDash} ${perim}`}
            />
          ) : null}
        </svg>
      ) : null}
      {children}
    </div>
  );
}
