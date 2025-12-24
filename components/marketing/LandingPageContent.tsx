"use client";

import {
  ArrowRight,
  Play,
  Sparkles,
  TrendingUp,
  Users,
  Shield,
  Zap,
  Clock,
  CheckCircle2,
  Star,
  BarChart3,
  Video,
  FileText,
  X,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Upload,
  Search,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import Link from "next/link";

export function LandingPageContent() {
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <div className="min-h-screen overflow-hidden">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#667EEA] via-[#764BA2] to-[#F093FB] opacity-10 dark:opacity-20"></div>

        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div
          className="absolute top-40 right-20 w-96 h-96 bg-gray-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="absolute -bottom-20 left-1/2 w-80 h-80 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"
          style={{ animationDelay: "4s" }}
        ></div>

        <div className="container relative mx-auto max-w-[1400px] px-6 py-20">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/80 dark:bg-white/10 border border-white/20 dark:border-white/10 backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-[#667EEA] dark:text-[#A78BFA]" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Rated 4.9/5 by 2,500+ recruitment teams
              </span>
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-3 h-3 fill-[#667EEA] text-[#667EEA]"
                  />
                ))}
              </div>
            </div>

            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-[1.1] tracking-tight">
              <span className="text-gray-900 dark:text-white">
                Hire Smarter with
              </span>
              <br />
              <span className="bg-gradient-to-r from-[#667EEA] to-[#764BA2] bg-clip-text text-transparent">
                AI-Powered Recruiting
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Transform your hiring process with intelligent resume screening,
              automated assessments, and AI-powered interviews. Save{" "}
              <span className="font-semibold text-[#667EEA]">
                15+ hours per week
              </span>
              .
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
              <Button
                size="lg"
                className="h-16 px-10 text-lg rounded-2xl bg-gradient-to-r from-[#667EEA] to-[#764BA2] hover:opacity-90 shadow-lg"
                asChild
              >
                <Link href="/signup">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-16 px-10 text-lg rounded-2xl bg-white/80 dark:bg-white/10 border-2"
                onClick={() => setDemoModalOpen(true)}
              >
                <Play className="w-5 h-5 mr-2" />
                Watch Demo
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-gray-600 dark:text-gray-400 pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>14-day free trial</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>Setup in 5 minutes</span>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-gray-400 dark:border-gray-600 rounded-full flex items-start justify-center p-2">
            <div className="w-1 h-2 bg-gray-400 dark:bg-gray-600 rounded-full"></div>
          </div>
        </div>
      </section>

      {/* Demo Video Modal */}
      {demoModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={`relative w-full ${isFullscreen ? "h-full max-w-full" : "max-w-5xl"} transition-all duration-300`}
          >
            <Card className="overflow-hidden relative bg-white dark:bg-gray-900">
              <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-700 to-pink-500 flex items-center justify-center">
                    <Play className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">
                      TalentFlow Product Demo
                    </h3>
                    <p className="text-sm text-white/80">
                      See how TalentFlow transforms recruiting
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDemoModalOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>

              <div
                className={`relative ${isFullscreen ? "h-screen" : "aspect-video"} bg-gradient-to-br from-gray-900 via-purple-900 to-pink-900`}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-6 p-8">
                    <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-gray-700 to-pink-500 flex items-center justify-center animate-pulse">
                      <Video className="w-16 h-16 text-white" />
                    </div>
                    <div className="space-y-3">
                      <h4 className="text-3xl font-bold text-white">
                        Product Demo Video
                      </h4>
                      <p className="text-lg text-white/80 max-w-2xl">
                        Watch how TalentFlow streamlines your entire recruiting
                        process from resume upload to final hiring decision
                      </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto mt-8">
                      {[
                        { icon: Upload, text: "Bulk Resume Upload & Parsing" },
                        { icon: Search, text: "AI-Powered Candidate Scoring" },
                        { icon: Send, text: "Automated Assessment Delivery" },
                        { icon: Video, text: "AI Video Interview Analysis" },
                      ].map((feature, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4"
                        >
                          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                            <feature.icon className="w-5 h-5 text-white" />
                          </div>
                          <p className="text-white text-sm font-medium text-left">
                            {feature.text}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
                      <Button
                        size="lg"
                        className="bg-gradient-to-r from-gray-700 to-pink-500 h-12 px-8 rounded-2xl shadow-lg"
                        onClick={() => setDemoModalOpen(false)}
                        asChild
                      >
                        <Link href="/signup">
                          Start Free Trial
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </Link>
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-12 px-8 rounded-2xl border-2 border-white text-white hover:bg-white/10"
                        onClick={() => setDemoModalOpen(false)}
                        asChild
                      >
                        <Link href="/contact">Schedule Live Demo</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Stats Section */}
      <section className="relative py-20 bg-white dark:bg-[#0F172A]">
        <div className="container mx-auto max-w-[1400px] px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { number: "2,500+", label: "Active Customers", icon: Users, gradient: "from-gray-700 to-gray-700" },
              { number: "5M+", label: "Resumes Processed", icon: FileText, gradient: "from-gray-700 to-pink-500" },
              { number: "40%", label: "Faster Hiring", icon: TrendingUp, gradient: "from-green-500 to-teal-500" },
              { number: "98%", label: "Satisfaction", icon: Star, gradient: "from-orange-500 to-red-500" },
            ].map((stat, index) => {
              const Icon = stat.icon;
              return (
                <Card key={index} className="p-8 text-center group hover:shadow-lg transition-shadow">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{stat.number}</div>
                  <div className="text-gray-600 dark:text-gray-400">{stat.label}</div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-gray-50 dark:bg-[#1E293B]/50">
        <div className="container mx-auto max-w-[1400px] px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 px-4 py-2 rounded-full bg-gray-100 dark:bg-purple-900/30 text-gray-900 dark:text-gray-300 border-0">
              <Zap className="w-4 h-4 mr-2" />
              Powerful Features
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Everything You Need to Hire Better
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              AI-powered tools that streamline every step of your recruitment process
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Sparkles, title: "AI Resume Scoring", description: "Automatically rank candidates based on job requirements with 95% accuracy", gradient: "from-gray-700 to-gray-700" },
              { icon: Video, title: "Video Interviews", description: "Conduct and record video interviews with AI-powered sentiment analysis", gradient: "from-gray-700 to-pink-500" },
              { icon: BarChart3, title: "Advanced Analytics", description: "Get insights into your hiring pipeline with real-time dashboards", gradient: "from-green-500 to-teal-500" },
              { icon: FileText, title: "Smart Assessments", description: "Create custom tests and quizzes with automatic grading", gradient: "from-orange-500 to-red-500" },
              { icon: Users, title: "Team Collaboration", description: "Work together with hiring managers and interviewers in real-time", gradient: "from-pink-500 to-gray-700" },
              { icon: Shield, title: "Enterprise Security", description: "SOC 2 Type II certified with bank-level encryption", gradient: "from-teal-500 to-gray-500" },
            ].map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index} className="group p-8 hover:shadow-lg transition-shadow">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{feature.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{feature.description}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-white dark:bg-[#0F172A]">
        <div className="container mx-auto max-w-[1400px] px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 px-4 py-2 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-0">
              <Clock className="w-4 h-4 mr-2" />
              Simple Process
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Three simple steps to transform your hiring process
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            {[
              { step: "01", title: "Create Your Account", description: "Sign up in under 2 minutes with no credit card required", gradient: "from-gray-700 to-gray-700" },
              { step: "02", title: "Post Your Jobs", description: "Add job descriptions and let our AI automatically parse requirements", gradient: "from-gray-700 to-pink-500" },
              { step: "03", title: "Start Hiring", description: "Receive ranked candidates and schedule interviews instantly", gradient: "from-pink-500 to-orange-500" },
            ].map((item, index) => (
              <div key={index} className="text-center group">
                <div className={`text-8xl font-bold bg-gradient-to-br ${item.gradient} bg-clip-text text-transparent mb-6 group-hover:scale-110 transition-transform`}>
                  {item.step}
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{item.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#667EEA] to-[#764BA2] opacity-90"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-20 left-20 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-pink-400 rounded-full mix-blend-overlay filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: "3s" }}></div>
        </div>

        <div className="container relative mx-auto max-w-[1400px] px-6 text-center">
          <div className="max-w-4xl mx-auto space-y-8">
            <h2 className="text-4xl md:text-6xl font-bold text-white leading-tight">
              Ready to Transform Your Hiring?
            </h2>
            <p className="text-xl text-white/90 max-w-2xl mx-auto leading-relaxed">
              Join 2,500+ companies using TalentFlow to build amazing teams faster
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
              <Button size="lg" className="h-16 px-12 text-lg rounded-2xl bg-white text-gray-800 hover:bg-gray-50 shadow-2xl" asChild>
                <Link href="/signup">
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="h-16 px-12 text-lg rounded-2xl border-2 border-white text-white hover:bg-white/10" asChild>
                <Link href="/pricing">View Pricing</Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 text-white/80 pt-8">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                <span>SOC 2 Certified</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                <span>2,500+ Customers</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 fill-current" />
                <span>4.9/5 Rating</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
