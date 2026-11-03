import { Users, Award, Globe, Heart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const stats = [
  { label: "Customers", value: "2,500+", icon: Users },
  { label: "Countries", value: "50+", icon: Globe },
  { label: "Resumes Processed", value: "5M+", icon: Award },
  { label: "Team Members", value: "100+", icon: Heart },
];

export default function AboutPage() {
  return (
    <div className="py-10 sm:py-14 md:py-20">
      <div className="container mx-auto max-w-[1400px] px-4 md:px-8">
        {/* Hero */}
        <div className="text-center mb-8 sm:mb-12 md:mb-16">
          <Badge className="mb-3 sm:mb-4 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gray-100 dark:bg-purple-900/30 tf-body border-0">
            About Us
          </Badge>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 px-2 sm:px-0">
            We&apos;re on a mission to transform hiring
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto px-2 sm:px-0">
            TalentFlow was founded in 2020 with a simple goal: make hiring
            smarter, faster, and more human.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-10 sm:mb-14 md:mb-20">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="p-4 sm:p-5 md:p-6 text-center sm:text-center flex flex-row sm:flex-col items-center sm:items-center gap-3 sm:gap-0">
                <Icon className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-gray-700 sm:mx-auto sm:mb-4 flex-shrink-0" />
                <div className="text-left sm:text-center">
                  <div className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white sm:mb-1">
                    {stat.value}
                  </div>
                  <div className="text-base text-gray-600 dark:text-gray-400">
                    {stat.label}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Story */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-5 md:mb-6">
            Our Story
          </h2>
          <div className="prose prose-sm sm:prose-base md:prose-lg dark:prose-invert">
            <p className="tf-body-secondary sm:text-base md:text-lg mb-4 sm:mb-5 md:mb-6">
              TalentFlow started when our founders experienced firsthand the
              challenges of modern recruitment. As hiring managers at growing
              tech companies, they spent countless hours sifting through
              resumes, coordinating interviews, and managing candidate pipelines.
            </p>
            <p className="tf-body-secondary sm:text-base md:text-lg mb-4 sm:mb-5 md:mb-6">
              They knew there had to be a better way. So they built TalentFlow
              &mdash; an AI-powered platform that automates the tedious parts of
              recruiting while keeping the human element at its core.
            </p>
            <p className="tf-body-secondary sm:text-base md:text-lg">
              Today, TalentFlow helps thousands of companies around the world
              find and hire the best talent. Our platform processes millions of
              resumes annually and has helped place candidates in roles at
              companies ranging from startups to Fortune 500 enterprises.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
