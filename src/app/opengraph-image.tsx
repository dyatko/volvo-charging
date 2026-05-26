import { ImageResponse } from "next/og";

// Statically optimized at build time by default; no runtime export needed.
// Works on Cloud Run's Node runtime — no Edge dependency.

export const alt =
  "EV Charging History — live charging status & session log for your Volvo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "radial-gradient(120% 80% at 0% 0%, #064e3b 0%, #0a0a0a 55%, #000 100%)",
          color: "#fafafa",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              color: "#0a0a0a",
              fontWeight: 700,
            }}
          >
            ⚡
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: "0.02em",
              color: "#a7f3d0",
            }}
          >
            EV Charging History
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 78,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              maxWidth: 980,
            }}
          >
            Your Volvo&apos;s charging, in one quiet dashboard.
          </div>
          <div
            style={{
              fontSize: 30,
              lineHeight: 1.3,
              color: "#a1a1aa",
              maxWidth: 900,
            }}
          >
            Live state of charge, every session you&apos;ve had, where it
            happened — built on Volvo&apos;s official APIs.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#71717a",
          }}
        >
          <span>Free · Open source · Mobile-first</span>
          <span style={{ color: "#a7f3d0" }}>ev.marat.online</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
