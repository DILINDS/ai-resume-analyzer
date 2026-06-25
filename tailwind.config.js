/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    "text-emerald-400", "bg-emerald-500/10", "border-emerald-500/20",
    "text-red-400", "bg-red-500/10", "border-red-500/20",
    "text-yellow-400", "bg-yellow-500/10", "border-yellow-500/20",
    "text-emerald-400/70", "text-red-400/70", "text-yellow-400/70",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
