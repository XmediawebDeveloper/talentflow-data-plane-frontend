import { Briefcase, MapPin, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const jobs = [
  { title: "Senior Frontend Engineer", location: "Remote", type: "Full-time", department: "Engineering" },
  { title: "Product Designer", location: "San Francisco, CA", type: "Full-time", department: "Design" },
  { title: "Sales Development Representative", location: "New York, NY", type: "Full-time", department: "Sales" },
  { title: "Customer Success Manager", location: "Remote", type: "Full-time", department: "Customer Success" },
  { title: "Data Scientist", location: "Remote", type: "Full-time", department: "Engineering" },
  { title: "Marketing Manager", location: "San Francisco, CA", type: "Full-time", department: "Marketing" },
];

export default function CareersPage() {
  return (
    <div className="py-10 sm:py-14 md:py-20">
      <div className="container mx-auto max-w-[1400px] px-4 md:px-8">
        <div className="text-center mb-10 sm:mb-12 md:mb-16">
          <Badge className="mb-3 sm:mb-4 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gray-100 dark:bg-purple-900/30 text-gray-900 dark:text-gray-300 border-0 text-sm">
            Careers
          </Badge>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 px-2 sm:px-0 tracking-tight">
            Join our team
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto px-2 sm:px-0">
            Help us transform the future of recruiting. We&apos;re always looking for talented people to join our mission.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
            Open Positions
          </h2>
          <div className="space-y-3 sm:space-y-4">
            {jobs.map((job, index) => (
              <Card key={index} className="p-4 sm:p-6 hover:shadow-md hover:border-[var(--border-dark)] transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <Badge className="mb-2" variant="secondary">{job.department}</Badge>
                    <h3 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 dark:text-white">
                      {job.title}
                    </h3>
                    <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1.5 mt-2 text-sm text-gray-600 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {job.location}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {job.type}
                      </span>
                    </div>
                  </div>
                  <Button className="w-full sm:w-auto">
                    <Briefcase className="w-4 h-4 mr-2" />
                    Apply Now
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
