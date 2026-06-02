import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { count } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { publicOriginFromHeaders } from "@/lib/origin";
import { TestTokenForm } from "@/components/test-token-form";
import { StickySignIn } from "@/components/sticky-sign-in";
import { VehicleDashboard } from "@/components/vehicle-dashboard";
import { demoVehicleDashboard } from "@/lib/dashboard/adapt";
import { getGoogleMapsBrowserKey, getGoogleMapsMapId } from "@/lib/maps/config";
import { db } from "@/db/client";
import { chargingSessions, vehicles } from "@/db/schema";
import { loadUserContext } from "@/lib/userVehicle";

// Canonicalize the landing on `/` so query-string variants
// (?mode=test, ?oauth_error=…, ?deleted=1) don't fragment the index.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

type Search = Promise<{ oauth_error?: string; mode?: string; deleted?: string }>;

const features = [
  {
    emoji: "🔋",
    title: "Live state of charge",
    body: "Battery %, target SOC, plug status, real-time charging power. Auto-refreshes while the tab is open.",
  },
  {
    emoji: "📊",
    title: "Session history",
    body: "Every plug-in becomes a row: duration, energy delivered, peak power, start and end location. Derived from your car, not entered by hand.",
  },
  {
    emoji: "📍",
    title: "Where it charged",
    body: "Coordinates captured from Volvo's Location API at the moment you plug in and unplug, so a charge at home and one at a supercharger don't blur together.",
  },
  {
    emoji: "🚗",
    title: "All your Volvos",
    body: "If your Volvo ID owns multiple cars, they all show up in the switcher and get polled in parallel. No extra config.",
  },
];

function buildJsonLd(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${siteUrl}/#app`,
        name: "EV Charging History",
        applicationCategory: "UtilityApplication",
        operatingSystem: "Web",
        description:
          "Charging history for your Volvo — every plug-in session, energy delivered, and location. Fills the gap in the Volvo Cars app, which only logs sessions at Volvo's Public Charging partners. Built on Volvo's official Connected Vehicle, Energy, and Location APIs.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        publisher: { "@id": `${siteUrl}/#org` },
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "EV Charging History",
        description:
          "Volvo charging history — every session, every kWh, every location. The session log the Volvo app doesn't give you, built on Volvo's official APIs.",
        publisher: { "@id": `${siteUrl}/#org` },
        inLanguage: "en",
      },
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#org`,
        name: "EV Charging History",
        url: siteUrl,
        logo: `${siteUrl}/icon.svg`,
        sameAs: ["https://github.com/dyatko/volvo-charging"],
      },
    ],
  };
}

async function loadPublicStats(): Promise<{ sessions: number; vehicles: number } | null> {
  try {
    const [sessionsRow] = await db.select({ n: count() }).from(chargingSessions);
    const [vehiclesRow] = await db.select({ n: count() }).from(vehicles);
    return { sessions: sessionsRow?.n ?? 0, vehicles: vehiclesRow?.n ?? 0 };
  } catch {
    return null;
  }
}

export default async function Home({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (session.userId) {
    // Only redirect to the dashboard if it can actually render for this user.
    // Otherwise /dashboard's own "no context → redirect /" bounces us back
    // here and we get ERR_TOO_MANY_REDIRECTS. We can't destroy the session
    // from a server component (iron-session mutates the cookie, which throws
    // in RSC), so we just fall through and show the landing; the next sign-in
    // overwrites the cookie.
    const ctx = await loadUserContext(session.userId).catch(() => null);
    if (ctx && ctx.activeVehicle) {
      redirect("/dashboard");
    }
  }

  const { oauth_error, mode, deleted } = await searchParams;
  const isDev = process.env.NODE_ENV !== "production";
  const showTestToken = isDev && mode === "test";
  const jsonLd = buildJsonLd(publicOriginFromHeaders(await headers()));
  const stats = await loadPublicStats();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero ─────────────────────────────────────────────────────── */}
      <section className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          ⚡ For Volvo BEV &amp; PHEV owners
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          The charging history the Volvo app doesn&apos;t give you.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
          Every plug-in, every kWh, every location — home, work, and public stalls alike,
          not just sessions at Volvo&apos;s Public Charging partners. Stitched together
          from Volvo&apos;s own Connected Vehicle, Energy, and Location APIs. Free, open
          source, mobile-first.
        </p>

        {deleted ? (
          <div className="mx-auto mt-6 max-w-md rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200">
            Account deleted. Every row we had on you is gone.
          </div>
        ) : null}

        {oauth_error ? (
          <div className="mx-auto mt-6 max-w-md rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-200">
            OAuth failed: <code className="break-all">{oauth_error}</code>
          </div>
        ) : null}

        <div className="mx-auto mt-8 max-w-md text-left">
          {isDev ? (
            <div className="flex justify-center gap-2 text-xs">
              <Link
                href="/"
                className={
                  "rounded-full px-3 py-1 " +
                  (!showTestToken
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
                }
              >
                Sign in with Volvo ID
              </Link>
              <Link
                href="/?mode=test"
                className={
                  "rounded-full px-3 py-1 " +
                  (showTestToken
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
                }
              >
                Use test tokens
              </Link>
            </div>
          ) : null}
          {!showTestToken ? <DashboardPreview /> : <><TestTokenIntro /><TestTokenForm /></>}
        </div>
      </section>

      {/* Features ─────────────────────────────────────────────────── */}
      <section className="mt-16 grid gap-x-10 gap-y-9 sm:grid-cols-2">
        {features.map((f) => (
          <article key={f.title} className="flex gap-3.5">
            <span className="shrink-0 text-2xl leading-none" aria-hidden>
              {f.emoji}
            </span>
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{f.body}</p>
            </div>
          </article>
        ))}
      </section>

      {/* Live stats ───────────────────────────────────────────────── */}
      {stats && stats.vehicles > 0 ? (
        <section className="mt-16 flex flex-col items-center gap-2 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            So far
          </p>
          <p className="text-balance text-lg leading-snug text-zinc-700 dark:text-zinc-300 sm:text-xl">
            <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
              {stats.sessions.toLocaleString("en-US")}
            </span>{" "}
            charging session{stats.sessions === 1 ? "" : "s"} tracked across{" "}
            <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
              {stats.vehicles.toLocaleString("en-US")}
            </span>{" "}
            {stats.vehicles === 1 ? "Volvo" : "Volvos"}.
          </p>
        </section>
      ) : null}

      {/* Trust / scope ────────────────────────────────────────────── */}
      <section className="mt-16 border-t border-zinc-200 pt-10 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          How it works
        </h2>
        <p className="mt-2">
          You sign in with your Volvo ID through Volvo&apos;s official OAuth flow. We never
          see your password. We hold an encrypted refresh token to fetch live state every
          minute. Energy, plug status, and current location come from Volvo&apos;s APIs in
          near-real-time. We poll the public Volvo APIs at a rate well inside their published
          quota — Volvo&apos;s side stays happy, your data stays fresh.
        </p>
        <p className="mt-3">
          From your dashboard you can export everything we have on you as JSON anytime, or
          delete it in one click. See the{" "}
          <Link href="/privacy" className="underline">
            privacy notice
          </Link>{" "}
          for the full data list.
        </p>
        <p className="mt-3 text-xs">
          Supported in Europe / Middle East / Africa and US / Canada / Latin America. Asia
          / Pacific isn&apos;t supported by Volvo&apos;s APIs yet. Works for BEVs (EX30,
          EX40, EX90) and recent PHEVs (XC60 / S90 / V90 MY2022+, XC90 / S60 / V60
          MY2023+).
        </p>
        <h3 className="mt-6 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Open source — nothing to hide
        </h3>
        <p className="mt-2">
          Every line of code that touches your Volvo data is public. Read it, audit the
          OAuth scopes, run your own copy. No analytics, no trackers, no ad networks.
        </p>
        <a
          href="https://github.com/dyatko/volvo-charging"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          View on GitHub →
        </a>
      </section>

      {!showTestToken ? <StickySignIn /> : null}
    </main>
  );
}

function DashboardPreview() {
  return (
    <div className="relative -mx-5.25 mt-4 overflow-hidden rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-4 pt-6 text-sm shadow-2xl shadow-zinc-900/15 ring-1 ring-zinc-900/5 sm:mx-0 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/50 dark:ring-white/10">
      {/* Styled like a phone screen — rounded bezel, speaker notch and a lift
          shadow — so visitors read it as the app on a phone. A working preview
          driven by local mock data; the diagonal corner ribbon flags it as an
          example. The sign-in CTA + disclaimer live in the floating bar
          (StickySignIn), so this block is preview-only. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-zinc-300 dark:bg-zinc-700"
      />
      <div className="pointer-events-none absolute right-0 top-0 h-30 w-30 overflow-hidden">
        <span className="absolute -right-11 top-6.5 w-42.5 rotate-45 bg-emerald-400 py-1.25 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-950 shadow-md">
          Live example
        </span>
      </div>
      <VehicleDashboard
        {...demoVehicleDashboard()}
        mapApiKey={getGoogleMapsBrowserKey()}
        mapId={getGoogleMapsMapId()}
      />
    </div>
  );
}

function TestTokenIntro() {
  return (
    <details
      className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
      open
    >
      <summary className="cursor-pointer font-medium">
        When to use this — unpublished app, just kicking the tyres
      </summary>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Volvo&apos;s portal issues a separate test access token <em>per API</em>. Generate
        one from each API&apos;s <strong>Test access tokens</strong> page (linked next to
        each field), then paste below. The Connected Vehicle token discovers your VINs —
        you don&apos;t need to type any.
      </p>
      <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
        Test tokens expire after 30 minutes and have no refresh. Polling stops working
        until you paste a fresh set. Publish the app to get real OAuth + automatic
        refresh.
      </p>
    </details>
  );
}
