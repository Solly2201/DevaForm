import Link from "next/link";
import { DEITIES } from "@devaform/asset-system";
import { SiteNav } from "@/components/site/SiteNav";

export const metadata = { title: "Deities — DevaForm | Divine Studio" };

export default function DeitiesPage() {
  return (
    <div className="min-h-dvh bg-surface-950 text-stone-200">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        <h1 className="font-display text-3xl text-stone-100">Choose a Divine Form</h1>
        <p className="mt-2 max-w-xl text-sm text-stone-400">
          Each deity opens in Divine Studio with its own anatomy, components, attributes and
          poses. Ganesha, Shiva and Vishnu are available; five more forms are in preparation.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEITIES.map((deity) => {
            const card = (
              <div
                className={`flex h-full flex-col rounded-2xl border p-5 transition-colors ${
                  deity.available
                    ? "border-saffron-700/60 bg-surface-900 hover:border-saffron-500"
                    : "border-surface-800 bg-surface-900/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="block h-2.5 w-10 rounded-full"
                    style={{ backgroundColor: deity.accent }}
                    aria-hidden
                  />
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      deity.available
                        ? "bg-saffron-500/15 text-saffron-400"
                        : "bg-surface-800 text-stone-500"
                    }`}
                  >
                    {deity.available ? "Available" : "Coming soon"}
                  </span>
                </div>
                <h2 className="mt-4 font-display text-2xl text-stone-100">{deity.name}</h2>
                <p className="text-xs uppercase tracking-wider text-stone-500">{deity.epithet}</p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-stone-400">
                  {deity.description}
                </p>
                <span
                  className={`mt-4 inline-block text-sm font-medium ${
                    deity.available ? "text-saffron-400" : "text-stone-600"
                  }`}
                >
                  {deity.available ? "Enter Divine Studio →" : "In preparation"}
                </span>
              </div>
            );
            return deity.available ? (
              <Link key={deity.id} href={`/studio?form=${deity.id}`} className="h-full">
                {card}
              </Link>
            ) : (
              <div key={deity.id} className="h-full" aria-disabled>
                {card}
              </div>
            );
          })}
        </div>

        {/*
          What the product does, said once.

          These three statements were the landing page's, and the landing
          page is gone — the root is the Studio now. They are kept because
          they are the only place the journey PAST the editor is stated:
          a customer looking at a catalogue of gods is entitled to know
          that what they make is kept, shareable and headed somewhere
          physical. Inside the Studio they would be an advertisement; here
          they are an answer.
        */}
        <section className="mt-12 grid gap-4 border-t border-surface-800/60 pt-8 md:grid-cols-3">
          {[
            {
              title: "Customize",
              body: "Heads, eyes, mudras, held attributes, crowns, jewellery, clothing, poses and materials — every option is real and live in 3D.",
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
            <div key={feature.title}>
              <h2 className="font-display text-lg text-saffron-500">{feature.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-400">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-surface-800/60 px-6 py-8 text-center text-xs text-stone-600">
        DevaForm — Where the Divine Takes Form.
      </footer>
    </div>
  );
}
