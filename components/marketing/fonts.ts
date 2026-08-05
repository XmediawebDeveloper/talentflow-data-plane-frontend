import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";

// Marketing-only faces. They are scoped to the landing page wrapper via CSS
// variables so the product UI keeps its Inter stack untouched.
export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display-face",
  weight: ["500", "600", "700", "800"],
  preload: false,
});

// Numerals, ranks and labels — the page treats recruiting data as data.
export const dataFont = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-data-face",
  weight: ["400", "500", "700"],
  preload: false,
});
