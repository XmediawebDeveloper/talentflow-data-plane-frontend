"use client";

import { Menu, X, Moon, Sun } from "lucide-react";
import { useState } from "react";
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
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();

  const toggleDarkMode = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <header className="bg-white dark:bg-[#0F172A] border-b border-[#E5E7EB] dark:border-[#1E293B] sticky top-0 z-50 transition-colors duration-300">
      <div className="container mx-auto max-w-[1440px] px-6">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] rounded-lg flex items-center justify-center">
                <span className="text-white text-[14px]">BI</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#6B7280] dark:text-[#94A3B8] text-[10px] uppercase tracking-wide">
                  BusinessIntegra
                </span>
                <span className="text-[#111827] dark:text-white leading-none">
                  TalentFlow
                </span>
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`transition-colors ${
                  pathname === item.href
                    ? "text-[#2563EB] dark:text-[#60A5FA]"
                    : "text-[#374151] dark:text-[#CBD5E1] hover:text-[#2563EB] dark:hover:text-[#60A5FA]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors"
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5 text-[#F59E0B]" />
              ) : (
                <Moon className="w-5 h-5 text-[#6B7280]" />
              )}
            </button>

            <Button variant="outline" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Start Free Trial</Link>
            </Button>
          </div>

          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors"
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5 text-[#F59E0B]" />
              ) : (
                <Moon className="w-5 h-5 text-[#6B7280]" />
              )}
            </button>

            <button
              className="p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-[#374151] dark:text-[#CBD5E1]" />
              ) : (
                <Menu className="w-6 h-6 text-[#374151] dark:text-[#CBD5E1]" />
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-[#E5E7EB] dark:border-[#334155]">
            <nav className="flex flex-col gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-left py-2 ${
                    pathname === item.href
                      ? "text-[#2563EB] dark:text-[#60A5FA]"
                      : "text-[#374151] dark:text-[#CBD5E1]"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="flex flex-col gap-2 pt-4 border-t border-[#E5E7EB] dark:border-[#334155]">
                <Button
                  variant="outline"
                  className="w-full dark:border-[#334155] dark:text-white dark:hover:bg-[#1E293B]"
                  asChild
                >
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button className="w-full" asChild>
                  <Link href="/signup">Start Free Trial</Link>
                </Button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
