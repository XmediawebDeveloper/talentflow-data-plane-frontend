import { ChevronDown } from 'lucide-react';

export default function TopNav() {
  return (
    <nav className="h-16 bg-white border-b border-gray-200 flex items-center px-8">
      <div className="flex items-center">
        <div className="text-gray-800 mr-12">
          <span className="text-xl">TalentFlow</span>
        </div>
        
        <div className="flex items-center gap-8">
          <a href="#" className="text-gray-700 hover:text-gray-900">Jobs</a>
          <a href="#" className="text-gray-700 hover:text-gray-900">Candidates</a>
          <a href="#" className="text-gray-900 border-b-2 border-gray-800 pb-[22px]">My Resumes</a>
          <a href="#" className="text-gray-700 hover:text-gray-900">Workflow</a>
          <a href="#" className="text-gray-700 hover:text-gray-900">Analytics</a>
          <a href="#" className="text-gray-700 hover:text-gray-900">Settings</a>
        </div>
      </div>
      
      <div className="ml-auto flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-800 text-white flex items-center justify-center">
          <span className="text-sm">JD</span>
        </div>
        <div className="flex items-center gap-1">
          <div>
            <div className="tf-body">John Recruiter</div>
            <div className="tf-meta">Agency Pro</div>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-500" />
        </div>
      </div>
    </nav>
  );
}