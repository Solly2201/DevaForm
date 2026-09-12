import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeity } from "@devaform/asset-system";
import { SiteNav } from "@/components/site/SiteNav";
import { StudioClient } from "./StudioClient";

type Params = { params: Promise<{ deity: string }> };

export async function generateMetadata({ params }: Params) {
  const { deity: deityId } = await params;
  const deity = getDeity(deityId);
  return {
    title: deity
      ? `${deity.name} — DevaForm | Divine Studio`
      : "DevaForm | Divine Studio",
  };
}

export default async function StudioPage({ params }: Params) {
  const { deity: deityId } = await params;
  const deity = getDeity(deityId);
  if (!deity) notFound();

  if (!deity.available) {
    return (
      <div className="min-h-dvh bg-surface-950 text-stone-200">
        <SiteNav />
        <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
          <span
            className="block h-2.5 w-12 rounded-full"
            style={{ backgroundColor: deity.accent }}
            aria-hidden
          />
          <h1 className="mt-6 font-display text-4xl text-stone-100">{deity.name}</h1>
          <p className="text-xs uppercase tracking-wider text-stone-500">{deity.epithet}</p>
          <p className="mt-4 text-sm leading-relaxed text-stone-400">
            {deity.description} This divine form is still being prepared for Divine Studio.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              href="/studio/ganesha"
              className="rounded-xl bg-saffron-500 px-5 py-2.5 text-sm font-semibold text-surface-950 hover:bg-saffron-400"
            >
              Create Ganesha instead
            </Link>
            <Link
              href="/deities"
              className="rounded-xl border border-surface-700 px-5 py-2.5 text-sm text-stone-300 hover:border-saffron-600"
            >
              All deities
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return <StudioClient deityId={deity.id} />;
}
