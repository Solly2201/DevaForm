"use client";

import { DIVINE_FORM_CATEGORY } from "@devaform/asset-system";
import { useDeity } from "@/state/deityContext";
import { useUiStore } from "@/state/uiStore";
import { CategoryIcon } from "./CategoryIcon";

export function CategorySidebar() {
  const deity = useDeity();
  const activeCategoryId = useUiStore((s) => s.activeCategoryId);
  const setActiveCategory = useUiStore((s) => s.setActiveCategory);

  return (
    <nav
      className="flex h-full w-20 flex-col items-stretch gap-1 overflow-y-auto border-r border-surface-800 bg-surface-900 p-2"
      aria-label="Customization categories"
    >
      {/* WHICH form, then everything about it. The deity is a choice in
          the editor rather than the route the editor lives at, so it
          belongs in the same rail — at the top, because it is the first
          thing a creation is. */}
      {[DIVINE_FORM_CATEGORY, ...deity.categories].map((category) => {
        const active = category.id === activeCategoryId;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => setActiveCategory(category.id)}
            title={category.description}
            // Colour alone is not a state. Anyone using a screen reader,
            // or a customer who cannot separate saffron from stone, was
            // told which category they were in by nothing at all.
            aria-current={active ? "true" : undefined}
            // Compact on a short window. Twelve categories at full
            // spacing need seven hundred pixels of rail; a 620-tall
            // window has five hundred and sixty, so the last two sat
            // below the fold behind a scrollbar nobody was looking for.
            className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-[11px] font-medium transition-colors [@media(max-height:820px)]:gap-0.5 [@media(max-height:820px)]:py-1.5 [@media(max-height:700px)]:text-[10px] ${
              active
                ? "bg-surface-700 text-saffron-400"
                : "text-stone-500 hover:bg-surface-850 hover:text-stone-300"
            }`}
          >
            <CategoryIcon
              icon={category.icon}
              className="h-5 w-5 [@media(max-height:820px)]:h-4 [@media(max-height:820px)]:w-4"
            />
            {category.label}
          </button>
        );
      })}
    </nav>
  );
}
