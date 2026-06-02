import Link from "next/link";

export function Footer() {
  return (
    <footer
      id="site-footer"
      className="mt-12 border-t border-zinc-200 bg-white/50 py-6 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400"
    >
      <div className="mx-auto max-w-3xl px-6">
        <p>
          Made by{" "}
          <a
            href="https://marat.online"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white"
          >
            Marat
          </a>{" "}
          in Hagastaden 🇸🇪 ·{" "}
          <a
            href="mailto:i@marat.online"
            className="font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white"
          >
            Contact by email
          </a>
        </p>
      </div>
      <div className="mx-auto mt-3 flex max-w-3xl flex-col gap-2 px-6 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Not affiliated with AB Volvo, Volvo Car Group, Volvo Car USA LLC, or any other
          Volvo company.
        </p>
        <nav className="flex items-center gap-3">
          <Link href="/privacy" className="font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
