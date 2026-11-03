'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 backdrop-blur-md bg-white/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl sm:text-2xl">💼</span>
              <span className="tf-section-title sm:text-xl truncate">TalentFlow</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3">
              <Link
                href="/login"
                prefetch={false}
                className="inline-flex items-center justify-center h-9 sm:h-10 text-gray-700 hover:text-gray-900 px-3 sm:px-4 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                prefetch={false}
                className="inline-flex items-center justify-center h-9 sm:h-10 bg-[var(--primary)] text-[var(--primary-foreground)] px-3 sm:px-4 text-sm font-medium rounded-lg hover:bg-[var(--primary-hover)] shadow-sm hover:shadow-md transition-all"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20">
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-4 sm:mb-6 tracking-tight">
            AI-Powered Recruitment
            <br />
            <span className="text-gray-700">Made Simple</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 sm:mb-8 max-w-2xl mx-auto px-2 sm:px-0">
            Transform your hiring process with intelligent resume scoring,
            AI talent matching, and automated assessments.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 max-w-md sm:max-w-none mx-auto">
            <Link
              href={`https://${process.env.NEXT_PUBLIC_BASE_DOMAIN}/signup?plan=free_trial`}
              className="inline-flex items-center justify-center h-11 sm:h-12 bg-[var(--primary)] text-[var(--primary-foreground)] px-6 sm:px-8 rounded-lg hover:bg-[var(--primary-hover)] shadow-sm hover:shadow-md transition-all text-base sm:text-lg font-semibold"
            >
              Start Free Trial
            </Link>
            <Link
              href="/pricing"
              prefetch={false}
              className="inline-flex items-center justify-center h-11 sm:h-12 bg-white text-gray-900 px-6 sm:px-8 rounded-lg hover:bg-gray-50 transition-colors text-base sm:text-lg font-semibold border border-gray-300"
            >
              View Pricing
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="tf-grid-3 mt-12 sm:mt-16 md:mt-20">
          <div className="tf-panel shadow-sm p-5 sm:p-6 md:p-8 text-center hover:shadow-md hover:border-[var(--border-dark)] transition-all">
            <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <span className="text-2xl sm:text-3xl">📄</span>
            </div>
            <h3 className="tf-section-title sm:text-lg md:text-xl mb-2">
              Smart Resume Scoring
            </h3>
            <p className="tf-body-secondary sm:text-base leading-relaxed">
              Automatically score and rank candidates based on job requirements
            </p>
          </div>

          <div className="tf-panel shadow-sm p-5 sm:p-6 md:p-8 text-center hover:shadow-md hover:border-[var(--border-dark)] transition-all">
            <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <span className="text-2xl sm:text-3xl">✨</span>
            </div>
            <h3 className="tf-section-title sm:text-lg md:text-xl mb-2">
              AI Talent Matching
            </h3>
            <p className="tf-body-secondary sm:text-base leading-relaxed">
              Find the perfect candidates with intelligent AI-powered matching
            </p>
          </div>

          <div className="tf-panel shadow-sm p-5 sm:p-6 md:p-8 text-center hover:shadow-md hover:border-[var(--border-dark)] transition-all sm:col-span-2 md:col-span-1">
            <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <span className="text-2xl sm:text-3xl">📋</span>
            </div>
            <h3 className="tf-section-title sm:text-lg md:text-xl mb-2">
              Automated Assessments
            </h3>
            <p className="tf-body-secondary sm:text-base leading-relaxed">
              Create and manage technical assessments effortlessly
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12 sm:mt-16 md:mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <p className="text-center tf-body-secondary">
            © 2026 TalentFlow. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
