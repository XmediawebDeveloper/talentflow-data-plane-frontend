"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteFooter } from "./SiteFooter";
import { REDESIGNED_ROUTES } from "./fonts";

function ClassicFooter() {
  return (
    <footer className="bg-gray-900 text-white py-12 transition-colors duration-300 border-t border-gray-800">
      <div className="container mx-auto max-w-[1440px] px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <Link
              href="/"
              prefetch={false}
              className="flex items-center mb-4 hover:opacity-80 transition-opacity"
            >
             <img
              src="/logos/talent_flow_logo.png"
              alt="TalentFlow"
              className="h-10 w-auto"
            />
            </Link>
            <p className="tf-body-muted leading-relaxed">
              From JD to hire, all with AI. Any industry, any role.
            </p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Product</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/features"
                  prefetch={false}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  prefetch={false}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/how-it-works"
                  prefetch={false}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  How It Works
                </Link>
              </li>
              <li>
                <Link
                  href="/demo"
                  prefetch={false}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Request Demo
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Company</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/about"
                  prefetch={false}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  prefetch={false}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/privacy"
                  prefetch={false}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  prefetch={false}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="tf-body-muted">
            &copy; 2026 BusinessIntegra. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Landing and pricing use the redesigned footer; every other marketing page keeps the classic one. */
export function Footer() {
  const pathname = usePathname();
  return REDESIGNED_ROUTES.has(pathname) ? <SiteFooter /> : <ClassicFooter />;
}
