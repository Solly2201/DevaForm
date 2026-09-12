import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // DevaForm identity: deep charcoal surfaces with saffron/gold accents.
        surface: {
          950: "#0c0a09",
          900: "#151210",
          850: "#1c1917",
          800: "#242019",
          700: "#2e2a24",
        },
        saffron: {
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
        },
        vermilion: {
          500: "#ea580c",
          600: "#c2410c",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
