import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (session.userId) redirect("/dashboard");

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Connect your Volvo</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        While we wait for full OAuth approval, paste a short-lived test access token from the
        Volvo developer portal to try the app end-to-end.
      </p>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
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
          Generate a test access token with scopes <code>energy:state:read</code>,{" "}
          <code>energy:capability:read</code>, <code>conve:vehicle_relation</code>, and{" "}
          <code>location:read</code>. Pair it with your own vehicle.
        </li>
        <li>Copy the token + VCC API key (Primary) here.</li>
      </ol>

      <form
        action="/api/auth/test-mode"
        method="POST"
        className="mt-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="block">
          <span className="text-sm font-medium">Access token (Bearer)</span>
          <textarea
            required
            name="accessToken"
            rows={3}
            placeholder="eyJhbGciOi..."
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">VCC API key</span>
          <input
            required
            name="vccApiKey"
            placeholder="1c07d4e7a8fe..."
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">VIN (optional)</span>
          <input
            name="vin"
            placeholder="YV1..."
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Leave empty to use the first VIN your account has access to.
          </span>
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Connect
        </button>
      </form>
    </main>
  );
}
