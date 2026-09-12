"use client";

interface ColorControlProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

export function ColorControl({ label, value, onChange }: ColorControlProps) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs text-stone-400">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-[10px] uppercase tabular-nums text-stone-500">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-surface-700 bg-transparent p-0.5"
        />
      </span>
    </label>
  );
}
