import { Upload, Search, ClipboardCheck, Video, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Upload Resumes",
    description: "Bulk upload resumes in any format. Our AI automatically parses and extracts key information.",
    icon: Upload,
    gradient: "from-gray-700 to-gray-700",
  },
  {
    number: "02",
    title: "AI Screening",
    description: "Our AI analyzes each resume against your job requirements and ranks candidates automatically.",
    icon: Search,
    gradient: "from-gray-700 to-pink-500",
  },
  {
    number: "03",
    title: "Assessments",
    description: "Send customized skill assessments to shortlisted candidates with automatic grading.",
    icon: ClipboardCheck,
    gradient: "from-pink-500 to-orange-500",
  },
  {
    number: "04",
    title: "Video Interviews",
    description: "Conduct AI-powered video interviews with sentiment analysis and transcription.",
    icon: Video,
    gradient: "from-orange-500 to-red-500",
  },
  {
    number: "05",
    title: "Hire",
    description: "Make data-driven hiring decisions with comprehensive candidate insights and reports.",
    icon: CheckCircle,
    gradient: "from-green-500 to-teal-500",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="py-20">
      <div className="container mx-auto max-w-[1400px] px-6">
        {/* Hero */}
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 rounded-full bg-gray-100 dark:bg-purple-900/30 text-gray-900 dark:text-gray-300 border-0">
            How It Works
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
            From resume to hire in 5 simple steps
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Our streamlined process helps you find the best candidates faster than ever.
          </p>
        </div>

        {/* Steps */}
        <div className="max-w-4xl mx-auto mb-20">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="relative flex gap-8 pb-16 last:pb-0">
                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-[39px] top-24 w-0.5 h-[calc(100%-6rem)] bg-gradient-to-b from-gray-700 to-transparent" />
                )}

                {/* Step Number */}
                <div className="flex-shrink-0">
                  <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-lg`}>
                    <Icon className="w-10 h-10 text-white" />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 pt-2">
                  <div className={`text-6xl font-bold bg-gradient-to-br ${step.gradient} bg-clip-text text-transparent mb-2`}>
                    {step.number}
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    {step.title}
                  </h3>
                  <p className="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="text-center bg-gradient-to-r from-[#667EEA] to-[#764BA2] rounded-3xl p-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to streamline your hiring?
          </h2>
          <p className="text-white/90 mb-8 max-w-2xl mx-auto">
            Join thousands of companies already using TalentFlow to hire smarter.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              prefetch={false}
              className="h-12 px-8 inline-flex items-center justify-center rounded-lg bg-white text-gray-800 font-medium hover:bg-gray-100 transition-colors"
            >
              Start Free Trial
            </Link>
            <Link
              href="/demo"
              prefetch={false}
              className="h-12 px-8 inline-flex items-center justify-center rounded-lg border border-white text-white font-medium hover:bg-white/10 transition-colors"
            >
              Watch Demo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
