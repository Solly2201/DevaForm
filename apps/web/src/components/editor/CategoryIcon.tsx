"use client";

/** Minimal inline icon set keyed by category icon id. */
export function CategoryIcon({ icon, className = "h-5 w-5" }: { icon: string; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (icon) {
    case "head":
      return (
        <svg {...common}>
          <circle cx="12" cy="10" r="6" />
          <path d="M8 15c-1.5 1.5-2 4-2 6M16 15c1.5 1.5 2 4 2 6" />
        </svg>
      );
    case "face":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
          <path d="M12 11v4c0 2-1.5 3-3 3" />
          <circle cx="12" cy="11" r="8" />
        </svg>
      );
    case "body":
      return (
        <svg {...common}>
          <circle cx="12" cy="5" r="2.5" />
          <path d="M12 8v6M7 10l5-1 5 1M9 21l3-7 3 7" />
        </svg>
      );
    case "clothing":
      return (
        <svg {...common}>
          <path d="M8 4l4 2 4-2 4 4-3 2v10H7V10L4 8l4-4z" />
        </svg>
      );
    case "ornaments":
      return (
        <svg {...common}>
          <path d="M5 9l3-4h8l3 4-7 10L5 9z" />
          <path d="M9 9h6" />
        </svg>
      );
    case "attributes":
      return (
        <svg {...common}>
          <path d="M12 3c1 3 4 4 4 8a4 4 0 1 1-8 0c0-4 3-5 4-8z" />
          <path d="M12 15v6" />
        </svg>
      );
    case "pose":
      return (
        <svg {...common}>
          <circle cx="12" cy="4.5" r="2" />
          <path d="M12 7v6M12 9l-5 3M12 9l5-2M12 13l-3 7M12 13l4 6" />
        </svg>
      );
    case "color":
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a3 3 0 0 0 3-3c0-5-3.5-9-8-9z" />
          <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="10" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "base":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="17" rx="8" ry="3" />
          <path d="M4 17v-2c0-1.7 3.6-3 8-3s8 1.3 8 3v2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}
