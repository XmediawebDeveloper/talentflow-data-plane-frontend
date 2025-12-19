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
    <div className="py-20">
      <div className="container mx-auto max-w-[1400px] px-6">
        {/* Hero */}
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-0">
            About Us
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
            We&apos;re on a mission to transform hiring
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            TalentFlow was founded in 2020 with a simple goal: make hiring
            smarter, faster, and more human.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-20">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="p-6 text-center">
                <Icon className="w-8 h-8 text-purple-500 mx-auto mb-4" />
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-gray-600 dark:text-gray-400">
                  {stat.label}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Story */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
            Our Story
          </h2>
          <div className="prose prose-lg dark:prose-invert">
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              TalentFlow started when our founders experienced firsthand the
              challenges of modern recruitment. As hiring managers at growing
              tech companies, they spent countless hours sifting through
              resumes, coordinating interviews, and managing candidate pipelines.
            </p>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              They knew there had to be a better way. So they built TalentFlow
              &mdash; an AI-powered platform that automates the tedious parts of
              recruiting while keeping the human element at its core.
            </p>
            <p className="text-gray-600 dark:text-gray-400">
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
