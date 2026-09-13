import Link from "next/link";
import { DEITIES } from "@devaform/asset-system";
import { SiteNav } from "@/components/site/SiteNav";

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-surface-950 text-stone-200">
      <SiteNav />

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 md:grid-cols-2 md:px-10 md:py-20">
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-saffron-600">
            Where the Divine Takes Form
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight text-stone-100 md:text-5xl">
            Create your own
            <span className="text-saffron-500"> divine form</span>.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-stone-400">
            Shape a deity in real time — face, mudras, ornaments, attributes, asana and
            materials — inside Divine Studio, then keep it in your library, share it, and
            walk the path toward a premium 3D-printed statue.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/studio/ganesha"
              className="rounded-xl bg-saffron-500 px-6 py-3 text-sm font-semibold text-surface-950 transition-colors hover:bg-saffron-400"
            >
              Enter Divine Studio
            </Link>
            <Link
              href="/deities"
              className="rounded-xl border border-surface-700 px-6 py-3 text-sm font-medium text-stone-300 transition-colors hover:border-saffron-600 hover:text-saffron-400"
            >
              Explore Deities
            </Link>
          </div>
          <p className="mt-6 text-xs text-stone-600">
            Available now: <span className="text-stone-400">Ganesha</span> and{" "}
            <span className="text-stone-400">Shiva</span> — five more divine forms in
            preparation.
          </p>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 shadow-2xl">
            {/* Real Divine Studio render, captured from the application. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero-ganesha.png"
              alt="A customizable Ganesha statue rendered in Divine Studio"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <p className="mt-2 text-center text-[11px] text-stone-600">
            Rendered live in Divine Studio
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-surface-800/60 bg-surface-900/40">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-12 md:grid-cols-3 md:px-10">
          {[
            {
              title: "Customize",
              body: "Heads, eyes, trunk, tusks, mudras, held attributes, crowns, jewellery, clothing, poses and materials — every option is real and live in 3D.",
            },
            {
              title: "Keep & Share",
              body: "Save creations to your library with real previews, return to them anytime, and share a link that reconstructs the exact configuration.",
            },
            {
              title: "Toward the Statue",
              body: "Every creation stores the exact component versions needed to manufacture it. Export renders, configurations and posed 3D models today.",
            },
          ].map((feature) => (
            <div key={feature.title} className="rounded-xl border border-surface-800 bg-surface-900 p-5">
              <h2 className="font-display text-lg text-saffron-500">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-400">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Deity strip */}
      <section className="mx-auto max-w-6xl px-6 py-12 md:px-10">
        <h2 className="font-display text-xl text-stone-100">The Divine Forms</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {DEITIES.map((deity) => (
            <Link
              key={deity.id}
              href={deity.available ? `/studio/${deity.id}` : "/deities"}
              className={`rounded-xl border p-3 text-center transition-colors ${
                deity.available
                  ? "border-saffron-700/60 bg-surface-900 hover:border-saffron-500"
                  : "border-surface-800 bg-surface-900/50 opacity-70 hover:opacity-100"
              }`}
            >
              <span
                className="mx-auto block h-2 w-8 rounded-full"
                style={{ backgroundColor: deity.accent }}
                aria-hidden
              />
              <span className="mt-2 block font-display text-sm text-stone-200">{deity.name}</span>
              <span className="block text-[10px] text-stone-500">
                {deity.available ? "Available now" : "Coming soon"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-surface-800/60 px-6 py-8 text-center text-xs text-stone-600">
        DevaForm — Where the Divine Takes Form.
      </footer>
    </div>
  );
}
