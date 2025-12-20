interface PublicFooterProps {
  onNavigate: (page: string) => void;
}

export function PublicFooter({ onNavigate }: PublicFooterProps) {
  return (
    <footer className="bg-[#111827] dark:bg-[#020617] text-white py-12 transition-colors duration-300 border-t border-[#1F2937] dark:border-[#0F172A]">
      <div className="container mx-auto max-w-[1440px] px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <button
              onClick={() => onNavigate("home")}
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
            </button>
            <p className="text-[#9CA3AF] text-[14px] leading-relaxed">
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
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Features
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("pricing")}
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Pricing
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("how-it-works")}
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("demo")}
                  className="text-[#9CA3AF] hover:text-white transition-colors"
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
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  About Us
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("contact")}
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Contact
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("faq")}
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  FAQ
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("careers")}
                  className="text-[#9CA3AF] hover:text-white transition-colors"
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
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("terms")}
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Terms of Service
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("cookies")}
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  Cookie Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("gdpr")}
                  className="text-[#9CA3AF] hover:text-white transition-colors"
                >
                  GDPR Compliance
                </button>
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
