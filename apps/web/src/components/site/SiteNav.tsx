import Link from "next/link";

/** Shared navigation for the non-studio pages. */
export function SiteNav() {
  return (
    <header className="flex h-16 items-center justify-between px-6 md:px-10">
      <Link href="/" className="flex items-baseline gap-2">
        <span className="font-display text-xl font-semibold tracking-wide text-saffron-500">
          DevaForm
        </span>
        <span className="hidden text-[10px] uppercase tracking-widest text-stone-600 sm:inline">
          Where the Divine Takes Form
        </span>
      </Link>
      <nav className="flex items-center gap-2" aria-label="Main">
        <Link
          href="/deities"
          className="rounded-lg px-3 py-1.5 text-sm text-stone-400 transition-colors hover:text-stone-200"
        >
          Deities
        </Link>
        <Link
          href="/library"
          className="rounded-lg px-3 py-1.5 text-sm text-stone-400 transition-colors hover:text-stone-200"
        >
          Library
        </Link>
        <Link
          href="/studio/ganesha"
          className="rounded-lg bg-saffron-500 px-4 py-1.5 text-sm font-semibold text-surface-950 transition-colors hover:bg-saffron-400"
        >
          Divine Studio
        </Link>
      </nav>
    </header>
  );
}
