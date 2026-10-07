import type { Config } from "tailwindcss"

/* Paleta y tipografía del manual de marca de Apex (Desktop\apex\MANUAL-DE-MARCA.md).
   El rojo es de la marca, no significa error: lo pendiente o mal va en ámbar y
   lo resuelto en verde. */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: { DEFAULT: "#070B17", 2: "#121833", glow: "#1B2350" },
        red: { DEFAULT: "#E8380D", deep: "#B8300F", btn: "#C8360F", glow: "#FF4A1C" },
        paper: { DEFAULT: "#F6F1E8", 2: "#EDE6D8" },
        ink: { DEFAULT: "#0E1422", 2: "#4A5263", mute: "#8A8F9C" },
        snow: { DEFAULT: "#F3F5FB", 2: "#B9C0D4", mute: "#8790A8" },
        amber: { bg: "#FDF1D8", DEFAULT: "#B45309" },
        green: { bg: "#DCF5E4", DEFAULT: "#15803D" },
      },
      fontFamily: {
        sans: ['"Mona Sans"', '"Segoe UI"', "system-ui", "sans-serif"],
        mono: ['"Cascadia Mono"', "Consolas", "monospace"],
      },
      borderRadius: { none: "0" },
      boxShadow: {
        hard: "4px 4px 0 0 #0E1422",
        "hard-sm": "2px 2px 0 0 #0E1422",
        "hard-lg": "7px 7px 0 0 #0E1422",
        "hard-red": "4px 4px 0 0 #E8380D",
      },
      screens: { xs: "480px" },
    },
  },
  plugins: [],
}

export default config
