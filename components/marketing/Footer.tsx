import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-[#111827] dark:bg-[#020617] text-white py-12 transition-colors duration-300 border-t border-[#1F2937] dark:border-[#0F172A]">
      <div className="container mx-auto max-w-[1440px] px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <Link
              href="/"
              className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] rounded-lg flex items-center justify-center">
                <span className="text-white text-[14px]">BI</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#9CA3AF] text-[10px] uppercase tracking-wide">
                  BusinessIntegra
                </span>
                <span className="text-white leading-none">TalentFlow</span>
              </div>
            </Link>
            <p className="text-[#9CA3AF] text-[14px] leading-relaxed">
              AI-powered recruitment solutions for agencies, companies, and
              freelance recruiters.
            </p>
          </div>

          <div>
            <h4 className="text-white mb-4">Product</h4>
            <ul className="space-y-2 text-[14px]">
              <li>
                <Link
                  href="/features"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/how-it-works"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  How It Works
                </Link>
              </li>
              <li>
                <Link
                  href="/demo"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Request Demo
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white mb-4">Company</h4>
            <ul className="space-y-2 text-[14px]">
              <li>
                <Link
                  href="/about"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  FAQ
                </Link>
              </li>
              <li>
                <Link
                  href="/careers"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Careers
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white mb-4">Legal</h4>
            <ul className="space-y-2 text-[14px]">
              <li>
                <Link
                  href="/privacy"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <a
                  href="#"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Cookie Policy
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  GDPR Compliance
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#374151] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[#9CA3AF] text-[14px]">
            &copy; 2025 BusinessIntegra. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a
              href="#"
              className="text-[#9CA3AF] hover:text-white transition-colors text-[14px]"
            >
              LinkedIn
            </a>
            <a
              href="#"
              className="text-[#9CA3AF] hover:text-white transition-colors text-[14px]"
            >
              Twitter
            </a>
            <a
              href="#"
              className="text-[#9CA3AF] hover:text-white transition-colors text-[14px]"
            >
              Facebook
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
