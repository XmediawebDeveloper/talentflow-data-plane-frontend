"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Calendar, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function DemoPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/signup");
  };

  return (
    <div className="py-20">
      <div className="container mx-auto max-w-[1400px] px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Side */}
          <div>
            <Badge className="mb-4 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-0">
              <Play className="w-4 h-4 mr-2" />
              Request Demo
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
              See TalentFlow in action
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
              Schedule a personalized demo with our team and discover how TalentFlow can transform your hiring process.
            </p>

            <div className="space-y-4">
              {[
                "Personalized walkthrough of all features",
                "See how AI scoring and matching works",
                "Learn about integrations with your tools",
                "Get answers to all your questions",
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                  <span className="text-gray-700 dark:text-gray-300">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Side - Form */}
          <Card className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <Calendar className="w-6 h-6 text-purple-500" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Book your demo
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Work Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  placeholder="Your Company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <Button type="submit" className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90">
                Request Demo
              </Button>

              <p className="text-sm text-gray-500 text-center">
                Or start your{" "}
                <a href="/signup" className="text-purple-600 hover:underline">
                  14-day free trial
                </a>{" "}
                now
              </p>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
