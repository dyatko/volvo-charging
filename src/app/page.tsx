import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { publicOriginFromHeaders } from "@/lib/origin";
import { TestTokenForm } from "@/components/test-token-form";

// Canonicalize the landing on `/` so query-string variants
// (?mode=test, ?oauth_error=…, ?deleted=1) don't fragment the index.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

type Search = Promise<{ oauth_error?: string; mode?: string; deleted?: string }>;

const features = [
  {
    title: "Live state of charge",
    body: "Battery %, target SOC, plug status, real-time charging power. Auto-refreshes while the tab is open.",
  },
  {
    title: "Session history",
    body: "Every plug-in becomes a row: duration, energy delivered, peak power, start and end location. Derived from your car, not entered by hand.",
  },
  {
    title: "Where it charged",
    body: "Coordinates captured from Volvo's Location API at the moment you plug in and unplug, so a charge at home and one at a supercharger don't blur together.",
  },
  {
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
          "Mobile-first dashboard for your Volvo's state of charge, charging session history, and live location. Built on Volvo's official Connected Vehicle, Energy, and Location APIs.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        publisher: { "@id": `${siteUrl}/#org` },
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "EV Charging History",
        description:
          "Live charging status and session log for your Volvo, built on Volvo's official APIs.",
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

export default async function Home({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (session.userId) redirect("/dashboard");

  const { oauth_error, mode, deleted } = await searchParams;
  const isDev = process.env.NODE_ENV !== "production";
  const showTestToken = isDev && mode === "test";
  const jsonLd = buildJsonLd(publicOriginFromHeaders(await headers()));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero ─────────────────────────────────────────────────────── */}
      <section className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          ⚡ For Volvo BEV &amp; PHEV owners
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          Your Volvo&apos;s charging, in one quiet dashboard.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
          Live state of charge, every charging session you&apos;ve had, where it happened —
          stitched together from Volvo&apos;s own Connected Vehicle, Energy, and Location
          APIs. Free, open source, mobile-first.
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
          {!showTestToken ? <OAuthSignIn /> : <><TestTokenIntro /><TestTokenForm /></>}
        </div>
      </section>

      {/* Features ─────────────────────────────────────────────────── */}
      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <article
            key={f.title}
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {f.title}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{f.body}</p>
          </article>
        ))}
      </section>

      {/* Trust / scope ────────────────────────────────────────────── */}
      <section className="mt-14 rounded-xl border border-zinc-200 bg-white p-5 text-sm leading-6 text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
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
          You can{" "}
          <a className="underline" href="/api/account/export">
            export everything we have on you
          </a>{" "}
          as JSON anytime, and delete it in one click from the dashboard. See the{" "}
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
      </section>

      {/* Open source closer ───────────────────────────────────────── */}
      <section className="mt-14 rounded-xl border border-zinc-200 bg-white p-5 text-center text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Open source — nothing to hide
        </h2>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
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
    </main>
  );
}

function OAuthSignIn() {
  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-zinc-600 dark:text-zinc-400">
        You&apos;ll be sent to Volvo&apos;s sign-in page. After approving access, you&apos;ll
        land back on your dashboard with your live charging state ready.
      </p>
      <a
        href="/api/auth/start"
        className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Sign in with Volvo ID →
      </a>
      <p className="mt-3 text-center text-xs text-zinc-500">
        Uses Volvo&apos;s official OAuth 2.0 + PKCE. We never see your password.
      </p>
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
        When to use this — unpublished app, just kicking the tires
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
