import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

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
          Use a test token
        </a>
      </div>

      {!showTestToken ? <OAuthForm /> : <TestTokenForm />}
    </main>
  );
}

function OAuthForm() {
  return (
    <>
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

      <form
        action="/api/auth/start"
        method="POST"
        className="mt-4 space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="block">
          <span className="text-sm font-medium">Client ID</span>
          <input
            required
            name="clientId"
            autoComplete="off"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Client secret</span>
          <input
            required
            type="password"
            name="clientSecret"
            autoComplete="off"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">VCC API key (Primary)</span>
          <input
            required
            name="vccApiKey"
            autoComplete="off"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Sign in with Volvo ID
        </button>
        <p className="text-center text-xs text-zinc-500">
          You'll be redirected to volvoid.eu.volvocars.com to authorize, then bounced back here.
          Tokens refresh automatically in the background.
        </p>
      </form>
    </>
  );
}

function TestTokenForm() {
  return (
    <>
      <details className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900" open>
        <summary className="cursor-pointer font-medium">
          When to use this — unpublished app, just kicking the tires
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-zinc-600 dark:text-zinc-400">
          <li>
            Open{" "}
            <a
              className="underline"
              href="https://developer.volvocars.com/apis/docs/test-access-tokens/"
              target="_blank"
              rel="noreferrer"
            >
              developer.volvocars.com → Test access tokens
            </a>
            .
          </li>
          <li>
            Select your application and check all of: <code className="text-xs">openid</code>,{" "}
            <code className="text-xs">energy:state:read</code>,{" "}
            <code className="text-xs">energy:capability:read</code>,{" "}
            <code className="text-xs">conve:vehicle_relation</code>,{" "}
            <code className="text-xs">location:read</code>.
          </li>
          <li>Pair the token with <strong>your own VIN</strong>, not the demo car, so Connected Vehicle and Location return real data.</li>
          <li>Copy the access token and the VCC API key (Primary) from the application page.</li>
        </ol>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Test tokens expire after 30 minutes and there's no refresh token. Polling will stop
          working until you paste a fresh one. Publish the app to get real OAuth.
        </p>
      </details>

      <form
        action="/api/auth/test-mode"
        method="POST"
        className="mt-4 space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="block">
          <span className="text-sm font-medium">Access token</span>
          <textarea
            required
            name="accessToken"
            rows={3}
            placeholder="eyJhbGciOi..."
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">VCC API key (Primary)</span>
          <input
            required
            name="vccApiKey"
            autoComplete="off"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">VIN <span className="text-zinc-500">(optional)</span></span>
          <input
            name="vin"
            placeholder="YV1..."
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Leave empty to use the first VIN your token's scopes can see.
          </span>
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Connect with test token
        </button>
      </form>
    </>
  );
}
