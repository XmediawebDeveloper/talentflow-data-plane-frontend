"use client";

import { Menu, X, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Careers", href: "/careers" },
  { label: "Contact", href: "/contact" },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isSubdomain, setIsSubdomain] = useState(false);
  const [isOrgLogin, setIsOrgLogin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();

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

  const toggleDarkMode = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 transition-colors duration-300">
      <div className="container mx-auto max-w-[1440px] px-6">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
              <img
              src="/logos/talent_flow_logo.png"
              alt="TalentFlow"
              className="h-10 w-auto"
            />
          </Link>

          {!isLoggedIn && !isOrgLogin && (
            <nav className="hidden md:flex items-center gap-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`transition-colors font-medium ${
                    pathname === item.href
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="hidden md:flex items-center gap-3">
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
              <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800" asChild>
                <Link href="/signup">Sign Up</Link>
              </Button>
            )}
            {!isLoggedIn && !isOrgLogin && (
              <Button className="bg-gray-900 hover:bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200" asChild>
                <Link href="/signup">Start Free Trial</Link>
              </Button>
            )}
          </div>

          <div className="flex md:hidden items-center gap-2">
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

            {!isLoggedIn && !isOrgLogin && (
              <button
                className="p-2"
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

        {mobileMenuOpen && !isLoggedIn && !isOrgLogin && (
          <div className="md:hidden py-4 border-t border-gray-200 dark:border-gray-700">
            <nav className="flex flex-col gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-left py-2 font-medium ${
                    pathname === item.href
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  className="w-full border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  asChild
                >
                  <Link href="/signup" prefetch={false}>Sign Up</Link>
                </Button>
                <Button className="w-full bg-gray-900 hover:bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200" asChild>
                  <Link href="/signup" prefetch={false}>Start Free Trial</Link>
                </Button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
