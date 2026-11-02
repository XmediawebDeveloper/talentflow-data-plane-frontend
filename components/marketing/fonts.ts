import { Manrope } from "next/font/google";

/**
 * Display face for the redesigned marketing pages (landing + pricing).
 * Body copy keeps Inter from the root layout; Manrope only sets headlines,
 * prices and figures, so the two roles stay clearly apart.
 *
 * Apply `display.variable` on each page root, then `DISPLAY` on the elements
 * that should use it.
 */
export const display = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const DISPLAY = "font-[family-name:var(--font-display)]";

/** Pages that use the redesigned header and footer. */
export const REDESIGNED_ROUTES = new Set([
  "/",
  "/pricing",
  "/how-it-works",
  "/faq",
  "/about",
  "/contact",
  "/features",
  "/demo",
  "/careers",
  "/privacy",
  "/terms",
]);
