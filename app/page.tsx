'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles, TrendingUp, Users } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      {/* Header/Navigation */}
      <header className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Sparkles className="w-8 h-8 text-blue-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">TalentFlow</span>
            </div>
            <nav className="hidden md:flex items-center space-x-8">
              <Link href="/features" className="text-gray-700 hover:text-blue-600 transition">
                Features
              </Link>
              <Link href="/pricing" className="text-gray-700 hover:text-blue-600 transition">
                Pricing
              </Link>
              <Link href="/about" className="text-gray-700 hover:text-blue-600 transition">
                About
              </Link>
              <Link href="/contact" className="text-gray-700 hover:text-blue-600 transition">
                Contact
              </Link>
            </nav>
            <div className="flex items-center space-x-4">
              <Link
                href="/login"
                className="text-gray-700 hover:text-blue-600 transition font-medium"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              AI-Powered Recruitment
              <br />
              <span className="text-blue-600">Made Simple</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              Transform your hiring process with intelligent candidate matching,
              automated screening, and data-driven insights.
            </p>
            <div className="flex items-center justify-center space-x-4">
              <Link
                href="/signup"
                className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold text-lg flex items-center"
              >
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
              <Link
                href="/demo"
                className="px-8 py-4 bg-white text-gray-900 rounded-lg border-2 border-gray-300 hover:border-blue-600 transition font-semibold text-lg"
              >
                Watch Demo
              </Link>
            </div>
          </div>

          {/* Features Grid */}
          <div className="mt-24 grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                AI Talent Matching
              </h3>
              <p className="text-gray-600">
                Automatically match candidates to jobs using advanced AI algorithms
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Resume Screening
              </h3>
              <p className="text-gray-600">
                Automatically score and rank resumes based on job requirements
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                AI Assessments
              </h3>
              <p className="text-gray-600">
                Create and manage automated assessments for candidates
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-gray-600">
            <p>&copy; 2025 TalentFlow. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
