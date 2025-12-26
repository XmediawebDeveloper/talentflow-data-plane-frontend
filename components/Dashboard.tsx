import { 
  Users, 
  Briefcase, 
  FileText, 
  Video, 
  TrendingUp, 
  TrendingDown,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertCircle,
  Crown,
  Zap,
  BarChart3,
  Calendar,
  MapPin,
  Building2,
  Sparkles
} from 'lucide-react';

import { User, Tenant, getRemainingUnits } from '@/lib/types/tenant';
import UnitsWarningBanner from './UnitsWarningBanner';

interface DashboardProps {
  onNavigateToJobs?: () => void;
  onAIMatch?: (job: any) => void;
  onNavigateToJDCreation?: () => void;
  onNavigateToMyResumes?: () => void;
  onNavigateToAssessments?: () => void;
  onNavigateToAIInterview?: () => void;
  onNavigateToAnalytics?: () => void;
  onNavigateToUsage?: () => void;
  onViewJobDetails?: (job: any) => void;
  onUpgradePlan?: () => void;
  user?: User;
  tenant?: Tenant;
}

export default function Dashboard({ 
  onNavigateToJobs, 
  onAIMatch,
  onNavigateToJDCreation,
  onNavigateToMyResumes,
  onNavigateToAssessments,
  onNavigateToAIInterview,
  onNavigateToAnalytics,
  onNavigateToUsage,
  onViewJobDetails,
  onUpgradePlan,
  user,
  tenant
}: DashboardProps = {}) {
  
  // Get usage data from tenant
  const subscription = tenant?.subscription;
  const usage = subscription?.usage;
  const limits = subscription?.limits;
  return (
    <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-6">
          <h1 className="text-gray-900 mb-2">Welcome back, {user?.name.split(' ')[0] || 'there'}! 👋</h1>
          <p className="text-gray-600 text-lg">Here's what's happening with your recruitment today.</p>
        </div>

        {/* Units Warning Banner */}
        {tenant && onUpgradePlan && (
          <UnitsWarningBanner tenant={tenant} onUpgrade={onUpgradePlan} />
        )}

        {/* Main Stats Grid */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                <Users className="w-6 h-6 text-gray-800" />
              </div>
              <span className="flex items-center gap-1 text-sm text-green-600">
                <TrendingUp className="w-4 h-4" />
                +12%
              </span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">1,247</div>
            <div className="text-sm text-gray-600">Total Candidates</div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-green-600" />
              </div>
              <span className="flex items-center gap-1 text-sm text-green-600">
                <TrendingUp className="w-4 h-4" />
                +8%
              </span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">42</div>
            <div className="text-sm text-gray-600">Active Jobs</div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                <Video className="w-6 h-6 text-gray-800" />
              </div>
              <span className="flex items-center gap-1 text-sm text-red-600">
                <TrendingDown className="w-4 h-4" />
                -3%
              </span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">24</div>
            <div className="text-sm text-gray-600">Scheduled Interviews</div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center">
                <FileText className="w-6 h-6 text-yellow-600" />
              </div>
              <span className="flex items-center gap-1 text-sm text-green-600">
                <TrendingUp className="w-4 h-4" />
                +15%
              </span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">18</div>
            <div className="text-sm text-gray-600">Active Assessments</div>
          </div>
        </div>

        {/* Active Plan & Available Units Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-6 pb-6 border-b border-gray-200">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Crown className="w-6 h-6 text-gray-800" />
                <h2 className="text-gray-900 text-2xl">{subscription?.planName || 'Agency Pro Plan'}</h2>
              </div>
              <p className="text-sm text-gray-600">
                {subscription?.status === 'active' 
                  ? 'Your subscription is active and running smoothly' 
                  : `Subscription ${subscription?.status || 'status unknown'}`}
              </p>
            </div>
            <div className="text-right bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">Renews on</div>
              <div className="text-gray-900 mb-2">
                {subscription?.renewalDate 
                  ? new Date(subscription.renewalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Jan 15, 2026'}
              </div>
              <button className="text-sm text-gray-800 hover:text-gray-900 underline transition-colors">
                Upgrade Plan
              </button>
            </div>
          </div>

          {/* Usage Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {/* Resume Upload Units */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-gray-800" />
                </div>
              </div>
              <div className="text-2xl text-gray-900 mb-1">{limits?.resumeUploads?.toLocaleString() || '2,450'}</div>
              <div className="text-xs text-gray-600 mb-3">Resume Uploads</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gray-800 h-2 rounded-full" 
                    style={{ width: `${limits?.resumeUploads ? Math.round((usage?.resumeUploads || 0) / limits.resumeUploads * 100) : 65}%` }}
                  ></div>
                </div>
                <span className="text-xs text-gray-600 w-10 text-right">
                  {limits?.resumeUploads ? Math.round((usage?.resumeUploads || 0) / limits.resumeUploads * 100) : 65}%
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {usage?.resumeUploads?.toLocaleString() || '1,593'} used of {limits?.resumeUploads?.toLocaleString() || '2,450'}
              </div>
            </div>

            {/* Job Posting Units */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-green-600" />
                </div>
              </div>
              <div className="text-2xl text-gray-900 mb-1">{limits?.jobPostings || '100'}</div>
              <div className="text-xs text-gray-600 mb-3">Job Postings</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full" 
                    style={{ width: `${limits?.jobPostings ? Math.round((usage?.jobPostings || 0) / limits.jobPostings * 100) : 42}%` }}
                  ></div>
                </div>
                <span className="text-xs text-gray-600 w-10 text-right">
                  {limits?.jobPostings ? Math.round((usage?.jobPostings || 0) / limits.jobPostings * 100) : 42}%
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {usage?.jobPostings || '42'} used of {limits?.jobPostings || '100'}
              </div>
            </div>

            {/* Assessment Units */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-yellow-600" />
                </div>
              </div>
              <div className="text-2xl text-gray-900 mb-1">{limits?.assessments || '500'}</div>
              <div className="text-xs text-gray-600 mb-3">Assessments</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-yellow-600 h-2 rounded-full" 
                    style={{ width: `${limits?.assessments ? Math.round((usage?.assessments || 0) / limits.assessments * 100) : 28}%` }}
                  ></div>
                </div>
                <span className="text-xs text-gray-600 w-10 text-right">
                  {limits?.assessments ? Math.round((usage?.assessments || 0) / limits.assessments * 100) : 28}%
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {usage?.assessments || '140'} used of {limits?.assessments || '500'}
              </div>
            </div>

            {/* AI Interview Units */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Video className="w-5 h-5 text-gray-800" />
                </div>
              </div>
              <div className="text-2xl text-gray-900 mb-1">
                {limits?.aiInterviews === 'unlimited' ? 'Unlimited' : limits?.aiInterviews || 'Unlimited'}
              </div>
              <div className="text-xs text-gray-600 mb-3">AI Interviews</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gray-800 h-2 rounded-full" 
                    style={{ 
                      width: limits?.aiInterviews === 'unlimited' 
                        ? '100%' 
                        : `${typeof limits?.aiInterviews === 'number' ? Math.round((usage?.aiInterviews || 0) / limits.aiInterviews * 100) : 100}%` 
                    }}
                  ></div>
                </div>
                <span className="text-xs text-gray-600 w-10 text-right">
                  {limits?.aiInterviews === 'unlimited' ? '∞' : 
                    typeof limits?.aiInterviews === 'number' ? `${Math.round((usage?.aiInterviews || 0) / limits.aiInterviews * 100)}%` : '∞'}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {limits?.aiInterviews === 'unlimited' 
                  ? `${usage?.aiInterviews || '87'} conducted this month`
                  : `${usage?.aiInterviews || '87'} used of ${limits?.aiInterviews || 'Unlimited'}`}
              </div>
            </div>
          </div>

          {/* Plan Features */}
          <div className="pt-4 border-t border-gray-200">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Unlimited Team Members</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Advanced Analytics</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Priority Support</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Custom Branding</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">API Access</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">White Label Option</span>
              </div>
            </div>
          </div>
        </div>

        {/* Existing Job Descriptions Section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-gray-900 text-2xl mb-2">Existing Job Descriptions</h2>
                <p className="text-sm text-gray-600">Manage and track all your active job postings</p>
              </div>
              <button 
                onClick={() => onNavigateToJDCreation?.()}
                className="px-5 py-2.5 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition-colors flex items-center gap-2 shadow-sm"
              >
                <Briefcase className="w-4 h-4" />
                Post New Job
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-5">
              {[
                {
                  id: 'JD-001',
                  title: 'Senior Java Developer',
                  department: 'Engineering',
                  location: 'San Francisco, CA',
                  type: 'Full-time',
                  description: 'Looking for an experienced Java developer with 5+ years of experience in building scalable applications.',
                  posted: '3 days ago',
                  applicants: 45,
                  status: 'Hot',
                  statusColor: 'red',
                },
                {
                  id: 'JD-002',
                  title: 'Product Manager',
                  department: 'Product',
                  location: 'Remote',
                  type: 'Full-time',
                  description: 'Seeking a strategic product manager to lead our B2B SaaS product roadmap and drive growth.',
                  posted: '5 days ago',
                  applicants: 32,
                  status: 'Active',
                  statusColor: 'green',
                },
                {
                  id: 'JD-003',
                  title: 'UI/UX Designer',
                  department: 'Design',
                  location: 'New York, NY',
                  type: 'Full-time',
                  description: 'Creative designer needed to craft beautiful and intuitive user experiences for our platform.',
                  posted: '1 week ago',
                  applicants: 28,
                  status: 'Active',
                  statusColor: 'green',
                },
                {
                  id: 'JD-004',
                  title: 'DevOps Engineer',
                  department: 'Infrastructure',
                  location: 'Austin, TX',
                  type: 'Full-time',
                  description: 'Expert DevOps engineer to build and maintain our cloud infrastructure and CI/CD pipelines.',
                  posted: '2 days ago',
                  applicants: 24,
                  status: 'New',
                  statusColor: 'blue',
                },
                {
                  id: 'JD-005',
                  title: 'Data Scientist',
                  department: 'Analytics',
                  location: 'Remote',
                  type: 'Contract',
                  description: 'Data scientist to develop ML models and drive data-driven decision making across the organization.',
                  posted: '1 week ago',
                  applicants: 19,
                  status: 'Active',
                  statusColor: 'green',
                },
              ].map((job) => (
                <div
                  key={job.id}
                  className="border border-gray-200 rounded-xl p-6 hover:border-gray-300 hover:shadow-md transition-all bg-white"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-gray-900 text-xl">{job.title}</h3>
                        <span
                          className={`px-3 py-1 rounded-full text-xs ${
                            job.statusColor === 'red'
                              ? 'bg-red-100 text-red-700'
                              : job.statusColor === 'green'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          {job.status}
                        </span>
                        <span className="text-sm text-gray-500">{job.id}</span>
                      </div>
                      <p className="text-sm text-gray-600 mb-4 leading-relaxed">{job.description}</p>
                      <div className="flex items-center gap-5 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          {job.department}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          {job.location}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          {job.type}
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          Posted {job.posted}
                        </div>
                      </div>
                    </div>
                    <div className="text-center ml-8 bg-gray-50 rounded-xl p-4 min-w-[120px]">
                      <div className="text-3xl text-gray-800 mb-1">{job.applicants}</div>
                      <div className="text-xs text-gray-600 mb-3">Applicants</div>
                      <button className="px-4 py-2 text-sm text-gray-800 border border-gray-800 rounded-lg hover:bg-gray-50 transition-colors w-full">
                        View Details
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                    {onAIMatch && (
                      <>
                        <button 
                          onClick={() => onAIMatch(job)}
                          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gray-800 to-gray-800 text-white rounded-lg hover:from-gray-700 hover:to-gray-900 transition-all text-sm shadow-sm"
                        >
                          <Sparkles className="w-4 h-4" />
                          AI Talent Match
                        </button>
                        <span className="text-gray-300">•</span>
                      </>
                    )}
                    <button className="text-sm text-gray-600 hover:text-gray-800 transition-colors">
                      View Applicants
                    </button>
                    <span className="text-gray-300">•</span>
                    <button className="text-sm text-gray-600 hover:text-gray-800 transition-colors">
                      Edit JD
                    </button>
                    <span className="text-gray-300">•</span>
                    <button className="text-sm text-gray-600 hover:text-gray-800 transition-colors">
                      Share
                    </button>
                    <span className="text-gray-300">•</span>
                    <button className="text-sm text-gray-600 hover:text-gray-800 transition-colors">
                      Duplicate
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">View Analytics</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">Showing 5 of 42 active jobs</div>
              <button className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-2 transition-colors">
                View All Jobs
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Two Column Layout - Recent Activity & Quick Actions */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* Recent Activity */}
          <div className="col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-gray-900">Recent Activity</h2>
                <button className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-1">
                  View all
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {[
                  {
                    icon: Users,
                    color: 'blue',
                    title: 'New candidate applied',
                    description: 'Sarah Williams applied for Senior Java Developer',
                    time: '5 minutes ago',
                  },
                  {
                    icon: Video,
                    color: 'gray',
                    title: 'AI Interview completed',
                    description: 'Michael Chen - Product Manager position',
                    time: '1 hour ago',
                  },
                  {
                    icon: FileText,
                    color: 'green',
                    title: 'Assessment submitted',
                    description: 'Emily Rodriguez completed Technical Assessment',
                    time: '2 hours ago',
                  },
                  {
                    icon: Briefcase,
                    color: 'yellow',
                    title: 'New job posted',
                    description: 'DevOps Engineer position is now live',
                    time: '3 hours ago',
                  },
                  {
                    icon: Users,
                    color: 'blue',
                    title: 'Candidate shortlisted',
                    description: 'David Kim moved to final round for Backend Developer',
                    time: '5 hours ago',
                  },
                ].map((activity, index) => {
                  const Icon = activity.icon;
                  const bgColor = {
                    blue: 'bg-gray-100',
                    gray: 'bg-gray-100',
                    green: 'bg-green-100',
                    yellow: 'bg-yellow-100',
                  }[activity.color];
                  const iconColor = {
                    blue: 'text-gray-800',
                    gray: 'text-gray-800',
                    green: 'text-green-600',
                    yellow: 'text-yellow-600',
                  }[activity.color];

                  return (
                    <div key={index} className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-5 h-5 ${iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 mb-1">{activity.title}</div>
                        <div className="text-sm text-gray-600">{activity.description}</div>
                        <div className="text-xs text-gray-500 mt-1">{activity.time}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h3 className="text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button 
                  onClick={() => onNavigateToMyResumes?.()}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Users className="w-4 h-4 text-gray-800" />
                  </div>
                  <span className="text-sm text-gray-900">Upload Resume</span>
                </button>
                <button 
                  onClick={() => onNavigateToJDCreation?.()}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-sm text-gray-900">Post New Job</span>
                </button>
                <button 
                  onClick={() => onNavigateToAIInterview?.()}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Video className="w-4 h-4 text-gray-800" />
                  </div>
                  <span className="text-sm text-gray-900">Schedule Interview</span>
                </button>
                <button 
                  onClick={() => onNavigateToAssessments?.()}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-yellow-600" />
                  </div>
                  <span className="text-sm text-gray-900">Create Assessment</span>
                </button>
                <button 
                  onClick={() => onNavigateToUsage?.()}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-700 to-gray-700 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm text-gray-900">View Units Usage</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Job Performance */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-gray-900 mb-6">Top Performing Jobs</h2>
            <div className="space-y-4">
              {[
                { title: 'Senior Java Developer', applicants: 45, status: 'Hot', color: 'red' },
                { title: 'Product Manager', applicants: 32, status: 'Active', color: 'green' },
                { title: 'UI/UX Designer', applicants: 28, status: 'Active', color: 'green' },
                { title: 'DevOps Engineer', applicants: 24, status: 'New', color: 'blue' },
              ].map((job, index) => (
                <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <div className="text-sm text-gray-900 mb-1">{job.title}</div>
                    <div className="text-xs text-gray-600">{job.applicants} applicants</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    job.color === 'red' ? 'bg-red-100 text-red-700' :
                    job.color === 'green' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-900'
                  }`}>
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-gray-900 mb-6">Recruitment Pipeline</h2>
            <div className="space-y-4">
              {[
                { stage: 'Applied', count: 156, color: 'blue', icon: Users },
                { stage: 'Screening', count: 84, color: 'gray', icon: FileText },
                { stage: 'Interview', count: 42, color: 'yellow', icon: Video },
                { stage: 'Offer', count: 12, color: 'green', icon: CheckCircle },
              ].map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <div key={index} className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg bg-${stage.color}-100 flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 text-${stage.color}-600`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-900">{stage.stage}</span>
                        <span className="text-sm text-gray-900">{stage.count}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`bg-${stage.color}-600 h-2 rounded-full`}
                          style={{ width: `${(stage.count / 156) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm text-yellow-900 mb-1">Action Required</div>
            <div className="text-sm text-yellow-800">
              You have 8 pending candidate reviews and 3 interview feedback forms to complete.
            </div>
          </div>
          <button className="ml-auto text-sm text-yellow-600 hover:text-yellow-700 whitespace-nowrap">
            View all
          </button>
        </div>
      </div>
    </div>
  );
}