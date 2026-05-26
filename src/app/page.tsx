import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { OAuthForm } from "@/components/oauth-form";
import { TestTokenForm } from "@/components/test-token-form";

type Search = Promise<{ oauth_error?: string; mode?: string }>;

export default async function Home({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (session.userId) redirect("/dashboard");

  const { oauth_error, mode } = await searchParams;
  const showTestToken = mode === "test";

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Connect your Volvo</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Two paths depending on whether your developer-portal application is published yet.
      </p>

      {oauth_error ? (
        <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-200">
          OAuth failed: <code className="break-all">{oauth_error}</code>
        </div>
      ) : null}

      <div className="mt-5 flex gap-2 text-xs">
        <a
          href="/"
          className={
            "rounded-full px-3 py-1 " +
            (!showTestToken
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
          }
        >
          Sign in with Volvo ID
        </a>
        <a
          href="/?mode=test"
          className={
            "rounded-full px-3 py-1 " +
            (showTestToken
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
          }
        >
          Use test tokens
        </a>
      </div>

      {!showTestToken ? <OAuthIntro /> : <TestTokenIntro />}
      {!showTestToken ? <OAuthForm /> : <TestTokenForm />}
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
        Volvo's portal issues a separate test access token <em>per API</em>. Generate one
        from each API's <strong>Test access tokens</strong> page (linked next to each
        field), then paste below. The Connected Vehicle token discovers your VINs — you
        don't need to type any.
      </p>
      <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
        Test tokens expire after 30 minutes and have no refresh. Polling stops working until
        you paste a fresh set. Publish the app to get real OAuth + automatic refresh.
      </p>
    </details>
  );
}
