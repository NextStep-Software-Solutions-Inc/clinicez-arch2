import type { Config } from "tailwindcss";
import { tailwindColorPalette } from "./src/theme/colors";

export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ...tailwindColorPalette,
      },
    },
  },
  plugins: [],
} satisfies Config;
