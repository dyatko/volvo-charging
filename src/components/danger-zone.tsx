"use client";

import { useState } from "react";

export function DangerZone() {
  const [showConfirm, setShowConfirm] = useState(false);
  return (
    <details className="mt-6 rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      <summary className="cursor-pointer">Privacy & account</summary>
      <div className="mt-3 space-y-2">
        <p>
          We hold your VIN, charging state, and session history. You can take it with you or
          delete everything.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/account/export"
            className="rounded-md border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Export my data (JSON)
          </a>
          {!showConfirm ? (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="rounded-md border border-rose-300 px-2 py-1 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/30"
            >
              Delete my account
            </button>
          ) : (
            <form action="/api/account/delete" method="POST" className="flex items-center gap-2">
              <span className="text-rose-700 dark:text-rose-300">
                This drops every row we have for you and revokes your Volvo refresh token.
              </span>
              <button
                type="submit"
                className="rounded-md bg-rose-600 px-2 py-1 text-white hover:bg-rose-700"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>
    </details>
  );
}
