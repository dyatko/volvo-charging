import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-zinc-200 bg-white/50 px-4 py-6 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
      <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Not affiliated with AB Volvo, Volvo Car Group, Volvo Car USA LLC, or any other
          Volvo company.
        </p>
        <nav className="flex items-center gap-3">
          <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Terms
          </Link>
          <a
            href="https://github.com/dyatko/volvo-charging"
            target="_blank"
            rel="noreferrer"
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Source
          </a>
        </nav>
      </div>
    </footer>
  );
}
