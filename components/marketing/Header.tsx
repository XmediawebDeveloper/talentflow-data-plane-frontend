"use client";

import { Menu, X, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "./SiteHeader";
import { REDESIGNED_ROUTES } from "./fonts";

// Items with a `section` exist on the one-page landing route, so on "/" the
// menu scrolls to them; an item without one would always navigate to its page.
// Careers and Contact are reachable from the footer rather than this menu.
const navItems: Array<{ label: string; href: string; section?: string }> = [
  { label: "Home", href: "/", section: "home" },
  { label: "Features", href: "/features", section: "features" },
  { label: "How It Works", href: "/how-it-works", section: "how-it-works" },
  { label: "Pricing", href: "/pricing", section: "pricing" },
  { label: "About", href: "/about", section: "about" },
];

function ClassicHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isSubdomain, setIsSubdomain] = useState(false);
  const [isOrgLogin, setIsOrgLogin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const isLanding = pathname === "/";

  useEffect(() => {
    const host = window.location.hostname;
    const parts = host.split('.');
    // Skip subdomain detection for raw IPv4 addresses (e.g. 192.168.1.100)
    const isIPAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    // Subdomain if 3+ parts and not www/app (e.g. acme.0sms.com or acme.localhost)
    const subdomain =
      !isIPAddress &&
      ((parts.length >= 3 && !['www', 'app'].includes(parts[0])) ||
      host.endsWith('.localhost'));
    setIsSubdomain(subdomain);

    // Org-specific login: /login?org=xxx (or subdomain login page)
    const searchParams = new URLSearchParams(window.location.search);
    setIsOrgLogin(subdomain || !!searchParams.get('org'));

    // Hide nav + auth buttons when the user already has an active session
    setIsLoggedIn(!!localStorage.getItem('accessToken'));
  }, [pathname]);

  // Prevent hydration mismatch by only rendering theme-dependent UI after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // On the one-page landing route, highlight the section currently in view.
  useEffect(() => {
    if (!isLanding) return;
    const sections = navItems
      .map((item) => (item.section ? document.getElementById(item.section) : null))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      // Only the band just below the header counts as "current".
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [isLanding]);

  // Hide the entire header on org-specific login pages (?org=xxx or <org>.0sms.com/login)
  if (isOrgLogin) return null;

  const toggleDarkMode = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 transition-colors duration-300">
      <div className="container mx-auto max-w-[1440px] px-4 md:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity flex-shrink-0"
          >
              <img
              src="/logos/talent_flow_logo.png"
              alt="TalentFlow"
              className="h-8 sm:h-10 w-auto"
            />
          </Link>

          {/* The site menu stays available to signed-in visitors — it is the
              section index for the one-page landing route. Only the auth
              buttons below are hidden once there is a session. */}
          {!isOrgLogin && (
            <nav className="hidden lg:flex items-center gap-4 xl:gap-8">
              {navItems.map((item) => {
                // A menu item only tracks the scroll position when it has a
                // section on this route; otherwise it is a plain page link.
                const onPage = isLanding && !!item.section;
                const active = onPage ? activeSection === item.section : pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={onPage ? `#${item.section}` : item.href}
                    aria-current={active ? "true" : undefined}
                    className={`relative py-1 transition-colors font-medium text-sm xl:text-base whitespace-nowrap ${
                      active
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    {item.label}
                    {active && onPage && (
                      <span className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-brand-orange" />
                    )}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="hidden lg:flex items-center gap-2 xl:gap-3 flex-shrink-0">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {mounted ? (
                theme === "dark" ? (
                  <Sun className="w-5 h-5 text-yellow-500" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-500" />
                )
              ) : (
                <div className="w-5 h-5" />
              )}
            </button>

            {/* Only show auth buttons when not logged in */}
            {!isLoggedIn && !isOrgLogin && (
              <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 text-sm xl:text-base" asChild>
                <Link href="/signup">Sign Up</Link>
              </Button>
            )}
            {!isLoggedIn && !isOrgLogin && (
              <Link
                href={`https://${process.env.NEXT_PUBLIC_BASE_DOMAIN}/signup?plan=free_trial`}
                className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm xl:text-base font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors whitespace-nowrap shadow-sm"
              >
                Start Free Trial
              </Link>
            )}
          </div>

          <div className="flex lg:hidden items-center gap-2">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {mounted ? (
                theme === "dark" ? (
                  <Sun className="w-5 h-5 text-yellow-500" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-500" />
                )
              ) : (
                <div className="w-5 h-5" />
              )}
            </button>

            {!isOrgLogin && (
              <button
                className="p-2"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                ) : (
                  <Menu className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                )}
              </button>
            )}
          </div>
        </div>

        {mobileMenuOpen && !isOrgLogin && (
          <div className="lg:hidden py-4 border-t border-gray-200 dark:border-gray-700">
            <nav className="flex flex-col gap-4">
              {navItems.map((item) => {
                // A menu item only tracks the scroll position when it has a
                // section on this route; otherwise it is a plain page link.
                const onPage = isLanding && !!item.section;
                const active = onPage ? activeSection === item.section : pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={isLanding ? `#${item.section}` : item.href}
                    prefetch={false}
                    aria-current={active ? "true" : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-left py-2 font-medium ${
                      active
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              {!isLoggedIn && (
                <div className="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    variant="outline"
                    className="w-full border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                    asChild
                  >
                    <Link href="/signup" prefetch={false}>Sign Up</Link>
                  </Button>
                  <Link
                    href={`https://${process.env.NEXT_PUBLIC_BASE_DOMAIN}/signup?plan=free_trial`}
                    prefetch={false}
                    className="w-full inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors"
                  >
                    Start Free Trial
                  </Link>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

/** Landing and pricing use the redesigned header; every other marketing page keeps the classic one. */
export function Header() {
  const pathname = usePathname();
  return REDESIGNED_ROUTES.has(pathname) ? <SiteHeader /> : <ClassicHeader />;
}
