import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms — EV Charging History",
  description: "Terms of use for EV Charging History.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Terms of use
      </h1>
      <p className="mt-1 text-xs text-zinc-500">Last updated 2026-05-26</p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Not affiliated with Volvo
      </h2>
      <p className="mt-2">
        EV Charging History is an independent, personal/hobby project. It is not affiliated with,
        endorsed by, or sponsored by AB Volvo, Volvo Car Group, Volvo Car USA LLC, or any
        other Volvo company. References to &quot;Volvo&quot;, the Volvo Iron Mark, and named
        Volvo APIs are made only to identify their owner.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        What you&apos;re using
      </h2>
      <p className="mt-2">
        A free, best-effort dashboard that reads from Volvo&apos;s public Developer Portal
        APIs (Connected Vehicle, Energy, Location) using credentials you grant via OAuth.
        It is provided on an &quot;as is&quot; basis without warranty of any kind, express
        or implied. We do not promise availability, accuracy, or fitness for any
        particular purpose.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Acceptable use
      </h2>
      <p className="mt-2">
        Don&apos;t try to extract data about anyone other than yourself or vehicles you have
        legitimate access to via your own Volvo ID. Don&apos;t share your account or your
        Volvo credentials with anyone. Don&apos;t use this service for any commercial
        resale of the data we surface.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Limitation of liability
      </h2>
      <p className="mt-2">
        To the maximum extent permitted by law, the operator of Volvo Charging is not
        liable for any direct, indirect, incidental, consequential, or punitive damages
        arising out of your use of this service, including but not limited to: relying on
        inaccurate charging data, missed notifications, service downtime, loss of session
        history, or changes to Volvo&apos;s APIs that break this service.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Volvo&apos;s own terms apply too
      </h2>
      <p className="mt-2">
        Your use of Volvo&apos;s APIs through this service remains subject to Volvo&apos;s
        own{" "}
        <a
          className="underline"
          href="https://developer.volvocars.com/terms-and-conditions/apis-terms-and-conditions/"
          target="_blank"
          rel="noreferrer"
        >
          API Agreement
        </a>{" "}
        and{" "}
        <a
          className="underline"
          href="https://developer.volvocars.com/terms-and-conditions/oip-information-notice/"
          target="_blank"
          rel="noreferrer"
        >
          privacy notice
        </a>
        . You authorise this app when you complete OAuth; you may revoke that
        authorisation at any time by signing out, deleting your account here, or revoking
        the consent inside your Volvo developer portal.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Changes
      </h2>
      <p className="mt-2">
        These terms may change. Material changes will be reflected by bumping the
        &quot;Last updated&quot; date at the top.
      </p>

      <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Governing law
      </h2>
      <p className="mt-2">
        These terms are governed by Swedish law, with disputes subject to the exclusive
        jurisdiction of the Stockholm District Court (Stockholms tingsrätt).
      </p>
    </main>
  );
}
