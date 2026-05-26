import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Volvo Charging",
  description:
    "What data Volvo Charging stores, how long, and how to export or delete it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Privacy
      </h1>
      <p className="mt-1 text-xs text-zinc-500">Last updated 2026-05-26</p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">Who we are</h2>
      <p className="mt-2">
        Volvo Charging is a personal/hobby project run by Marat Dyatko
        (<a className="underline" href="mailto:i@marat.online">i@marat.online</a>). It is not
        affiliated with, endorsed by, or sponsored by AB Volvo, Volvo Car Group, Volvo Car USA
        LLC, or any other Volvo company. The Volvo trademark and the names of Volvo APIs are
        used only to describe their owner.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        What data we hold
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          Your <strong>Volvo ID subject identifier</strong> (the <code>sub</code> claim from
          your OAuth ID token). We use it as our user identifier.
        </li>
        <li>
          Your <strong>VIN list</strong> and per-vehicle details fetched from Volvo&apos;s
          Connected Vehicle API: model, year, fuel type, exterior colour, battery capacity,
          gearbox, upholstery, steering side, exterior/interior image URLs.
        </li>
        <li>
          A growing log of <strong>energy-state snapshots</strong> (battery %, range, plug
          status, charging status, charging power, target SOC, current limit) and the derived
          <strong> charging-session</strong> rows (start/end times, SOC delta, kWh,
          start/end coordinates).
        </li>
        <li>
          Your <strong>OAuth refresh and access tokens</strong>, encrypted at rest with
          AES-256-GCM. Used solely to call Volvo&apos;s APIs on your behalf.
        </li>
        <li>
          Your <strong>VCC API key and OAuth client credentials</strong>, encrypted at rest.
          Required to authenticate against Volvo&apos;s APIs.
        </li>
      </ul>
      <p className="mt-2">
        We do <strong>not</strong> store your Volvo ID password or email. We do not embed
        third-party analytics, advertising, or tracking scripts.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Where it lives
      </h2>
      <p className="mt-2">
        All data is processed in <strong>Google Cloud, region <code>europe-north1</code>
        </strong> (Stockholm, Sweden). Sub-processors: Google Cloud Run (compute), Cloud SQL
        for PostgreSQL (storage), Secret Manager (encryption keys), Cloud Scheduler (polling
        timer), Cloud Logging (operational logs, redacted to last-4 VIN). No data leaves the
        European Union.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Why we hold it (legal basis)
      </h2>
      <p className="mt-2">
        <strong>Consent</strong> (GDPR Art. 6(1)(a)), granted when you complete the OAuth
        flow at <code>volvoid.eu.volvocars.com</code> and accept the scopes we request:
        <code>openid</code>, <code>energy:state:read</code>, <code>energy:capability:read</code>,
        <code>conve:vehicle_relation</code>, <code>location:read</code>.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        How long
      </h2>
      <p className="mt-2">
        Until you delete your account. Operational logs in Cloud Logging are rotated out by
        Google after 30 days. We do not back up the database; nothing to retain beyond live
        rows.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Your rights
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>Access / portability</strong> — download everything we have on you as JSON:
          {" "}
          <a className="underline" href="/api/account/export">
            /api/account/export
          </a>
          .
        </li>
        <li>
          <strong>Erasure</strong> — from <Link className="underline" href="/dashboard">
            the dashboard</Link>, hit Sign out, then sign back in and use Delete account.
          One click drops every row we have for you and revokes your refresh token at Volvo.
        </li>
        <li>
          <strong>Withdrawal of consent</strong> — sign out: we revoke your refresh token at
          Volvo and drop our copy. Volvo&apos;s side stops trusting any old access tokens we
          may still be holding.
        </li>
        <li>
          <strong>Rectification</strong> — the vehicle details (model, year, etc.) come
          directly from Volvo. We refresh them at sign-in. If they&apos;re wrong, fix them in
          the Volvo Cars app and sign in again.
        </li>
        <li>
          <strong>Complaints</strong> — you have the right to lodge a complaint with the
          Swedish data-protection authority (IMY).
        </li>
      </ul>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Security
      </h2>
      <p className="mt-2">
        Sensitive fields (tokens, secrets, VCC API key, OAuth client secret) are encrypted
        with AES-256-GCM before being written to PostgreSQL. The encryption key lives in
        Google Secret Manager, only accessible by the running service. Traffic between your
        browser and the app is TLS-only.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Cookies
      </h2>
      <p className="mt-2">
        One session cookie (<code>volvo_charging_session</code>), HTTP-only, encrypted and
        signed by the server using iron-session. No tracking, no analytics, no third-party
        cookies.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Contact
      </h2>
      <p className="mt-2">
        Questions or data requests:{" "}
        <a className="underline" href="mailto:i@marat.online">
          i@marat.online
        </a>
        .
      </p>
    </main>
  );
}
