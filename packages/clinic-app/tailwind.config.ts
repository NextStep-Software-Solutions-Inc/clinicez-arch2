import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic colors that work with dark mode
        primary: "#3B82F6", // blue-500
        secondary: "#A855F7", // purple-500
        accent: "#F59E0B", // amber-500
        success: "#10B981", // emerald-500
        warning: "#F59E0B", // amber-500
        error: "#EF4444", // red-500
        info: "#3B82F6", // blue-500

        // Theme-aware colors using Tailwind's defaults
        background: "#FFFFFF", // white in light, will use dark: variants for dark mode
        foreground: "#111827", // gray-900 in light, will use dark: variants
        border: "#E5E7EB", // gray-200
        input: "#F3F4F6", // gray-100
        ring: "#3B82F6", // blue-500
        muted: {
          DEFAULT: "#6B7280", // gray-500
          foreground: "#9CA3AF", // gray-400
        },
        surface: "#F9FAFB", // gray-50
      }
    },
  },
  plugins: [],
} satisfies Config;

// const { lightTheme, darkTheme } = require("./src/lib/theme-colors");

// /** @type {import('tailwindcss').Config} */
// module.exports = {
//   content: [
//     "./src/**/*.{js,ts,jsx,tsx}",
//     "./src/components/**/*.{js,ts,jsx,tsx}",
//   ],
//   presets: [require("nativewind/preset")],
//   theme: {
//     extend: {
//       colors: {
//         // Semantic color system using CSS variables
//         primary: {
//           DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
//           foreground: "rgb(var(--color-primary-foreground) / <alpha-value>)",
//         },
//         secondary: {
//           DEFAULT: "rgb(var(--color-secondary) / <alpha-value>)",
//           foreground: "rgb(var(--color-secondary-foreground) / <alpha-value>)",
//         },
//         background: "rgb(var(--color-background) / <alpha-value>)",
//         surface: {
//           DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
//           elevated: "rgb(var(--color-surface-elevated) / <alpha-value>)",
//         },
//         foreground: "rgb(var(--color-foreground) / <alpha-value>)",
//         muted: {
//           DEFAULT: "rgb(var(--color-muted) / <alpha-value>)",
//           foreground: "rgb(var(--color-muted-foreground) / <alpha-value>)",
//         },
//         success: {
//           DEFAULT: "rgb(var(--color-success) / <alpha-value>)",
//           foreground: "rgb(var(--color-success-foreground) / <alpha-value>)",
//         },
//         warning: {
//           DEFAULT: "rgb(var(--color-warning) / <alpha-value>)",
//           foreground: "rgb(var(--color-warning-foreground) / <alpha-value>)",
//         },
//         error: {
//           DEFAULT: "rgb(var(--color-error) / <alpha-value>)",
//           foreground: "rgb(var(--color-error-foreground) / <alpha-value>)",
//         },
//         info: {
//           DEFAULT: "rgb(var(--color-info) / <alpha-value>)",
//           foreground: "rgb(var(--color-info-foreground) / <alpha-value>)",
//         },
//         accent: {
//           DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
//           foreground: "rgb(var(--color-accent-foreground) / <alpha-value>)",
//         },
//         border: "rgb(var(--color-border) / <alpha-value>)",
//         input: "rgb(var(--color-input-border) / <alpha-value>)",
//         ring: "rgb(var(--color-focus-ring) / <alpha-value>)",
//       },
//     },
//   },
//   plugins: [
//     // Set default CSS variables for light and dark themes
//     ({ addBase }) => {
//       addBase({
//         ":root": lightTheme,
//         ".dark": darkTheme,
//       });
//     },
//   ],
// };

