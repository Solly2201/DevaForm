import Link from "next/link";

/**
 * Shared navigation for the non-studio pages.
 *
 * IT WRAPS RATHER THAN OVERFLOWS. The wordmark and four links came to
 * four hundred and twenty-nine pixels of content in a three hundred and
 * ninety pixel phone — measured on the share page, which is the one page
 * here somebody is actually likely to open on a phone, because it is what
 * arrives in a message. The statue below it rendered perfectly; the
 * header pushed the whole document sideways.
 *
 * Wrapping, rather than hiding the links behind a menu: there are four of
 * them, a second row costs nothing, and a navigation a customer cannot
 * see is a worse answer to a narrow screen than one that takes two lines.
 */
export function SiteNav() {
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-y-2 px-4 py-3 sm:px-6 sm:py-0 md:px-10">
      {/* The mark goes to the product, not to a landing page: there is
          no longer one, and the root simply resolves here. Naming the
          destination saves the customer a redirect. */}
      <Link href="/studio" className="flex items-baseline gap-2">
        <span className="font-display text-xl font-semibold tracking-wide text-saffron-500">
          DevaForm
        </span>
        <span className="hidden text-[10px] uppercase tracking-widest text-stone-600 sm:inline">
          Where the Divine Takes Form
        </span>
      </Link>
      <nav className="flex flex-wrap items-center gap-1 sm:gap-2" aria-label="Main">
        <Link
          href="/deities"
          className="rounded-lg px-2 py-1.5 text-sm text-stone-400 transition-colors hover:text-stone-200 sm:px-3"
        >
          Deities
        </Link>
        <Link
          href="/library"
          className="rounded-lg px-2 py-1.5 text-sm text-stone-400 transition-colors hover:text-stone-200 sm:px-3"
        >
          Library
        </Link>
        <Link
          href="/account"
          className="rounded-lg px-2 py-1.5 text-sm text-stone-400 transition-colors hover:text-stone-200 sm:px-3"
        >
          Account
        </Link>
        <Link
          href="/studio"
          className="rounded-lg bg-saffron-500 px-3 py-1.5 text-sm font-semibold text-surface-950 transition-colors hover:bg-saffron-400 sm:px-4"
        >
          Divine Studio
        </Link>
      </nav>
    </header>
  );
}
