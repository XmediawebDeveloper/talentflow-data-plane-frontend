import { Sparkles, Video, BarChart3, FileText, Users, Shield, Zap, Clock, Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const features = [
  {
    icon: Sparkles,
    title: "AI Resume Scoring",
    description: "Automatically rank and score candidates based on job requirements with 95% accuracy. Our AI analyzes skills, experience, and cultural fit.",
    gradient: "from-gray-700 to-gray-700",
  },
  {
    icon: Video,
    title: "Video Interviews",
    description: "Conduct asynchronous or live video interviews with AI-powered sentiment analysis, transcription, and candidate insights.",
    gradient: "from-gray-700 to-pink-500",
  },
  {
    icon: BarChart3,
    title: "Advanced Analytics",
    description: "Get real-time insights into your hiring pipeline with customizable dashboards, reports, and predictive analytics.",
    gradient: "from-green-500 to-teal-500",
  },
  {
    icon: FileText,
    title: "Smart Assessments",
    description: "Create custom skills tests and assessments with automatic grading, plagiarism detection, and detailed reports.",
    gradient: "from-orange-500 to-red-500",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Work together seamlessly with hiring managers, interviewers, and recruiters. Share feedback and make decisions faster.",
    gradient: "from-pink-500 to-gray-700",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "SOC 2 Type II certified with bank-level encryption, SSO support, and GDPR compliance built-in.",
    gradient: "from-teal-500 to-gray-500",
  },
  {
    icon: Zap,
    title: "API & Integrations",
    description: "Connect with your existing tools. Integrate with ATS systems, HRIS platforms, calendars, and more.",
    gradient: "from-yellow-500 to-orange-500",
  },
  {
    icon: Clock,
    title: "Automated Workflows",
    description: "Set up custom workflows to automate candidate communication, interview scheduling, and task assignments.",
    gradient: "from-indigo-500 to-gray-700",
  },
  {
    icon: Globe,
    title: "Global Hiring",
    description: "Hire talent from anywhere in the world with multi-language support, timezone management, and localized compliance.",
    gradient: "from-cyan-500 to-gray-500",
  },
];

export default function FeaturesPage() {
  return (
    <div className="py-10 sm:py-14 md:py-20">
      <div className="container mx-auto max-w-[1400px] px-4 md:px-8">
        {/* Hero */}
        <div className="text-center mb-10 sm:mb-12 md:mb-16">
          <Badge className="mb-3 sm:mb-4 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gray-100 dark:bg-purple-900/30 text-gray-900 dark:text-gray-300 border-0 text-sm">
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            Features
          </Badge>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 px-2 sm:px-0 tracking-tight">
            Powerful tools for modern recruiting
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto px-2 sm:px-0">
            Everything you need to find, evaluate, and hire the best talent. All in one platform.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-10 sm:mb-12 md:mb-16">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card key={index} className="p-5 sm:p-6 md:p-8 hover:shadow-md hover:border-[var(--border-dark)] transition-all group">
                <div
                  className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 sm:mb-5 md:mb-6 group-hover:scale-110 transition-transform`}
                >
                  <Icon className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-white" />
                </div>
                <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">
                  {feature.title}
                </h3>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            );
          })}
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">
            Ready to see it in action?
          </h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-6 sm:mb-8 max-w-md mx-auto px-4 sm:px-0">
            Start your free trial today and experience the future of recruiting.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 max-w-md sm:max-w-none mx-auto px-4 sm:px-0">
            <Link
              href="/signup"
              prefetch={false}
              className="h-11 sm:h-12 px-6 sm:px-8 inline-flex items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:bg-[var(--primary-hover)] shadow-sm hover:shadow-md transition-all"
            >
              Start Free Trial
            </Link>
            <Link
              href="/demo"
              prefetch={false}
              className="h-11 sm:h-12 px-6 sm:px-8 inline-flex items-center justify-center rounded-lg border border-border text-foreground font-medium hover:bg-accent/50 transition-colors"
            >
              Request Demo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
