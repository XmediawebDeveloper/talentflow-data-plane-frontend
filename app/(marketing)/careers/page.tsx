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
    <div className="py-20">
      <div className="container mx-auto max-w-[1400px] px-6">
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-0">
            Careers
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
            Join our team
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Help us transform the future of recruiting. We&apos;re always looking for talented people to join our mission.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Open Positions
          </h2>
          <div className="space-y-4">
            {jobs.map((job, index) => (
              <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <Badge className="mb-2" variant="secondary">{job.department}</Badge>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {job.title}
                    </h3>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {job.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {job.type}
                      </span>
                    </div>
                  </div>
                  <Button>
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
