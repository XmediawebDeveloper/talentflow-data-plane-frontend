import Image from "next/image";

interface PublicFooterProps {
  onNavigate: (page: string) => void;
}

export function PublicFooter({ onNavigate }: PublicFooterProps) {
  return (
    <footer className="bg-[var(--raw-111827)] dark:bg-[var(--raw-020617)] text-white py-12 transition-colors duration-300 border-t border-[var(--raw-1f2937)] dark:border-[var(--raw-0f172a)]">
      <div className="container mx-auto max-w-[1440px] px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <button
              onClick={() => onNavigate("home")}
              className="flex items-center mb-4 hover:opacity-80 transition-opacity"
            >
                <img
              src="/logos/talent_flow_logo.png"
              alt="TalentFlow"
              className="h-10 w-auto"
            />
            </button>
            <p className="text-[var(--raw-9ca3af)] text-[14px] leading-relaxed">
              AI-powered recruitment solutions for agencies, companies, and
              freelance recruiters.
            </p>
          </div>

          <div>
            <h4 className="text-white mb-4">Product</h4>
            <ul className="space-y-2 text-[14px]">
              <li>
                <button
                  onClick={() => onNavigate("features")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  Features
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("pricing")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  Pricing
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("how-it-works")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("demo")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  Request Demo
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white mb-4">Company</h4>
            <ul className="space-y-2 text-[14px]">
              <li>
                <button
                  onClick={() => onNavigate("about")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  About Us
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("contact")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  Contact
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("faq")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  FAQ
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("careers")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  Careers
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white mb-4">Legal</h4>
            <ul className="space-y-2 text-[14px]">
              <li>
                <button
                  onClick={() => onNavigate("privacy")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("terms")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  Terms of Service
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("cookies")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  Cookie Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("gdpr")}
                  className="text-[var(--raw-9ca3af)] hover:text-white transition-colors"
                >
                  GDPR Compliance
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[var(--raw-374151)] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[var(--raw-9ca3af)] text-[14px]">
            &copy; 2026 BusinessIntegra. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a
              href="#"
              className="text-[var(--raw-9ca3af)] hover:text-white transition-colors text-[14px]"
            >
              LinkedIn
            </a>
            <a
              href="#"
              className="text-[var(--raw-9ca3af)] hover:text-white transition-colors text-[14px]"
            >
              Twitter
            </a>
            <a
              href="#"
              className="text-[var(--raw-9ca3af)] hover:text-white transition-colors text-[14px]"
            >
              Facebook
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
