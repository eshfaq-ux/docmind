import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ui-ux-pro-max: Tech Startup pairing — Space Grotesk (heading) + DM Sans (body)
      fontFamily: {
        heading: ["var(--font-heading)", "Space Grotesk", "system-ui", "sans-serif"],
        sans:    ["var(--font-sans)",    "DM Sans",       "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)",    "JetBrains Mono","monospace"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        input:  "hsl(var(--input))",
        ring:   "hsl(var(--ring))",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        xl:  "calc(var(--radius) + 2px)",
        "2xl": "calc(var(--radius) + 6px)",
      },
      // Fluid animation durations
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "350ms",
      },
    },
  },
  plugins: [],
};

export default config;
