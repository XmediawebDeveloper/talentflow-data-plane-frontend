import { FileText, Calendar, Folder, TrendingUp } from 'lucide-react';

interface StatsCardsProps {
  totalResumes: number;
  resumesThisMonth: number;
  folderCount: number;
}

export default function StatsCards({ totalResumes, resumesThisMonth, folderCount }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-gray-800" />
          </div>
          <span className="text-sm text-gray-500">Total Resumes</span>
        </div>
        <div className="text-3xl text-gray-900 mb-1">{totalResumes.toLocaleString()}</div>
        <div className="text-xs text-gray-500">Active candidates</div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-green-600" />
          </div>
          <span className="text-sm text-gray-500">Resumes This Month</span>
        </div>
        <div className="text-3xl text-gray-900 mb-1">{resumesThisMonth}</div>
        <div className="flex items-center gap-1 text-xs text-green-600">
          <TrendingUp className="w-3 h-3" />
          <span>+12% vs last month</span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <Folder className="w-5 h-5 text-gray-800" />
          </div>
          <span className="text-sm text-gray-500">Folders</span>
        </div>
        <div className="text-3xl text-gray-900 mb-1">{folderCount}</div>
        <div className="text-xs text-gray-500">Organized collections</div>
      </div>
    </div>
  );
}
