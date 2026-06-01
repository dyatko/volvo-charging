"use client";

import { useEffect, useSyncExternalStore } from "react";

// A small System / Light / Dark segmented control. Persists the choice to
// localStorage under "theme" ("light" | "dark"; removed → follow the OS) and
// writes the resolved theme onto <html data-theme>, which the `dark:` variant
// keys off (see the @custom-variant in src/app/globals.css). The pre-paint
// script in the root layout reads the same key, so a reload restores the choice
// without a flash.

type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "theme";
// Same-tab notification: the native "storage" event only fires in *other* tabs,
// so pick() dispatches this so the subscription re-reads in this tab too.
const CHOICE_EVENT = "themechoicechange";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Resolve a choice to the concrete theme and paint it onto <html>. */
function applyTheme(choice: ThemeChoice) {
  const resolved =
    choice === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : choice;
  document.documentElement.dataset.theme = resolved;
}

/** The persisted choice, or "system" when nothing is stored. */
function readChoice(): ThemeChoice {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function subscribeChoice(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHOICE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHOICE_EVENT, onChange);
  };
}

export function ThemeToggle() {
  // SSR + first hydration render assume "system" (the pre-paint script's default
  // branch) so the markup matches; useSyncExternalStore swaps in the stored
  // choice straight after hydration, with no mismatch warning and no
  // setState-in-effect. localStorage is browser-only, hence the server snapshot.
  const choice = useSyncExternalStore(
    subscribeChoice,
    readChoice,
    () => "system" as ThemeChoice,
  );

  // While "System" is active, follow live OS theme changes too.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  function pick(next: ThemeChoice) {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    // Notify useSyncExternalStore in this tab to re-read the new choice.
    window.dispatchEvent(new Event(CHOICE_EVENT));
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500 dark:text-zinc-400">Theme</span>
      <div
        role="group"
        aria-label="Theme"
        className="inline-flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700"
      >
        {OPTIONS.map((opt, i) => {
          const active = choice === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => pick(opt.value)}
              aria-pressed={active}
              className={[
                "px-2 py-1 transition-colors",
                i > 0 ? "border-l border-zinc-300 dark:border-zinc-700" : "",
                active
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
              ].join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
