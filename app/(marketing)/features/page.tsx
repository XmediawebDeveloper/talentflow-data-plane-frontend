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
    <div className="py-20">
      <div className="container mx-auto max-w-[1400px] px-6">
        {/* Hero */}
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 rounded-full bg-gray-100 dark:bg-purple-900/30 text-gray-900 dark:text-gray-300 border-0">
            <Zap className="w-4 h-4 mr-2" />
            Features
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
            Powerful tools for modern recruiting
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Everything you need to find, evaluate, and hire the best talent. All in one platform.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card key={index} className="p-8 hover:shadow-lg transition-shadow group">
                <div
                  className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}
                >
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            );
          })}
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Ready to see it in action?
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Start your free trial today and experience the future of recruiting.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              prefetch={false}
              className="h-12 px-8 inline-flex items-center justify-center rounded-lg bg-gray-800 text-white font-medium hover:bg-gray-900 transition-colors"
            >
              Start Free Trial
            </Link>
            <Link
              href="/demo"
              prefetch={false}
              className="h-12 px-8 inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Request Demo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
