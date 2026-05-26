import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { OAuthForm } from "@/components/oauth-form";
import { TestTokenForm } from "@/components/test-token-form";

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

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "EV Charging History",
  applicationCategory: "UtilityApplication",
  operatingSystem: "Web",
  description:
    "Mobile-first dashboard for your Volvo's state of charge, charging session history, and live location. Built on Volvo's official Connected Vehicle, Energy, and Location APIs.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
};

export default async function Home({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (session.userId) redirect("/dashboard");

  const { oauth_error, mode, deleted } = await searchParams;
  const showTestToken = mode === "test";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero ─────────────────────────────────────────────────────── */}
      <section className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          ⚡ For Volvo BEV & PHEV owners
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          Your Volvo&apos;s charging, in one quiet dashboard.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
          Live state of charge, every charging session you&apos;ve had, where it happened —
          stitched together from Volvo&apos;s own Connected Vehicle, Energy, and Location
          APIs. Free, open source, mobile-first.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <a
            href="#connect"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Connect your Volvo →
          </a>
          <a
            href="https://github.com/dyatko/volvo-charging"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            View on GitHub
          </a>
        </div>
      </section>

      {deleted ? (
        <div className="mx-auto mt-8 max-w-md rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-center text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200">
          Account deleted. Every row we had on you is gone.
        </div>
      ) : null}

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

      {/* Connect ──────────────────────────────────────────────────── */}
      <section id="connect" className="mt-14 scroll-mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Connect your Volvo
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Two paths depending on whether your developer-portal application is published
          yet.
        </p>

        {oauth_error ? (
          <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-200">
            OAuth failed: <code className="break-all">{oauth_error}</code>
          </div>
        ) : null}

        <div className="mt-5 flex gap-2 text-xs">
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
            href="/?mode=test#connect"
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

        {!showTestToken ? <OAuthIntro /> : <TestTokenIntro />}
        {!showTestToken ? <OAuthForm /> : <TestTokenForm />}
      </section>
    </main>
  );
}

function OAuthIntro() {
  return (
    <details className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer font-medium">
        One-time setup — publishing your app at developer.volvocars.com
      </summary>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-zinc-600 dark:text-zinc-400">
        <li>
          Open{" "}
          <a
            className="underline"
            href="https://developer.volvocars.com/account/#your-api-applications"
            target="_blank"
            rel="noreferrer"
          >
            developer.volvocars.com → your API applications
          </a>
          .
        </li>
        <li>
          Click <strong>Publish</strong> on your application. In the form, select scopes:
          <code className="ml-1 text-xs">openid</code>,{" "}
          <code className="text-xs">energy:state:read</code>,{" "}
          <code className="text-xs">energy:capability:read</code>,{" "}
          <code className="text-xs">conve:vehicle_relation</code>,{" "}
          <code className="text-xs">location:read</code>.
        </li>
        <li>
          Add this redirect URI:
          <div className="mt-1 select-all rounded bg-zinc-100 px-2 py-1 font-mono text-xs dark:bg-zinc-800">
            http://localhost:3000/api/auth/callback
          </div>
        </li>
        <li>
          Submit for review. <strong>Volvo issues your client_id and client_secret immediately</strong>{" "}
          so you can self-test before approval lands.
        </li>
      </ol>
    </details>
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
