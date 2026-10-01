import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        border: "var(--border)",
        input: "var(--input)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        ring: "var(--ring)",
      },
      // Consistent radius scale (cards = 12px).
      borderRadius: {
        lg: "0.75rem",
        md: "0.625rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
      },
      keyframes: {
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "none" },
        },
        "drawer-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "none" },
        },
        "bar-grow": {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.3s ease-out both",
        "fade-in": "fade-in 0.2s ease-out both",
        "pop-in": "pop-in 0.2s ease-out both",
        "toast-in": "toast-in 0.25s ease-out both",
        "drawer-in": "drawer-in 0.25s ease-out both",
        "bar-grow": "bar-grow 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
