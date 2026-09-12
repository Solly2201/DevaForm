"use client";

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
      {deity.categories.map((category) => {
        const active = category.id === activeCategoryId;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => setActiveCategory(category.id)}
            title={category.description}
            className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-[11px] font-medium transition-colors ${
              active
                ? "bg-surface-700 text-saffron-400"
                : "text-stone-500 hover:bg-surface-850 hover:text-stone-300"
            }`}
          >
            <CategoryIcon icon={category.icon} />
            {category.label}
          </button>
        );
      })}
    </nav>
  );
}
