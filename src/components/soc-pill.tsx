"use client";

import { useEffect, useRef, useState } from "react";

const TRACK_WIDTH = 2; // px — light-grey "100%" track (the CSS border)
const ARC_WIDTH = 4; // px — the target + current progress arcs
// Large sentinel → fully-rounded "stadium" ends like the Volvo cluster pill.
// Both the CSS border-radius and the SVG path radius clamp to half the height,
// so they stay aligned at any size.
const RADIUS = 9999; // px — outer corner radius of the pill

// The target arc's final stretch thins from ARC_WIDTH down to a fine tip so it
// melts away into the thin 100% track instead of stopping at a fat rounded cap.
// SVG can't vary stroke-width along one path, so we approximate the taper with a
// short stack of butt-cap segments whose widths lerp across the run.
const TAPER_LEN = 15; // px — how far before the target end the band starts thinning
const TAPER_END_WIDTH = 0.75; // px — width at the very tip (a hairline, thinner than the track)
const TAPER_STEPS = 12; // sub-segments approximating the smooth taper
const TAPER_SEAM = 0.5; // px — overlap so adjacent butt caps leave no hairline gap

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
  // The solid (full-width) head of the target arc, and the tapering tail.
  let targetMainDash = 0;
  const taperSegs: { dash: string; offset: number; width: number }[] = [];
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
    if (targetDash > 0) {
      // Reserve the final TAPER_LEN (or the whole arc, if shorter) for the
      // thinning tail; the rest is drawn at full ARC_WIDTH.
      const taperLen = Math.min(TAPER_LEN, targetDash);
      targetMainDash = targetDash - taperLen;
      const segLen = taperLen / TAPER_STEPS;
      for (let i = 0; i < TAPER_STEPS; i++) {
        const start = targetMainDash + i * segLen;
        const t = (i + 0.5) / TAPER_STEPS; // 0 → ARC_WIDTH, 1 → TAPER_END_WIDTH
        taperSegs.push({
          dash: `${segLen + TAPER_SEAM} ${perim}`,
          offset: -start,
          width: ARC_WIDTH + (TAPER_END_WIDTH - ARC_WIDTH) * t,
        });
      }
    }
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
              target's perimeter distance. Its full-width head is butt-capped so
              the tapering tail can thin it from ARC_WIDTH down to TRACK_WIDTH,
              blending into the thin 100% track instead of a fat rounded cap. */}
          {showTarget ? (
            <>
              {targetMainDash > 0 ? (
                <path
                  d={dPath}
                  fill="none"
                  className="text-zinc-300 dark:text-zinc-600"
                  stroke="currentColor"
                  strokeWidth={ARC_WIDTH}
                  strokeLinecap="butt"
                  strokeDasharray={`${targetMainDash} ${perim}`}
                />
              ) : null}
              {taperSegs.map((s, i) => (
                <path
                  key={i}
                  d={dPath}
                  fill="none"
                  className="text-zinc-300 dark:text-zinc-600"
                  stroke="currentColor"
                  strokeWidth={s.width}
                  strokeLinecap="butt"
                  strokeDasharray={s.dash}
                  strokeDashoffset={s.offset}
                />
              ))}
            </>
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
