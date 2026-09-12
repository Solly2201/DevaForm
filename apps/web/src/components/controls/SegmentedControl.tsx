"use client";

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-surface-800 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            option.value === value
              ? "bg-saffron-500 text-surface-950"
              : "text-stone-400 hover:bg-surface-700 hover:text-stone-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
