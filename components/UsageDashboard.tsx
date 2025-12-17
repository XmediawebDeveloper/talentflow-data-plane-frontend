import { TrendingUp, TrendingDown, Zap, Target, Video, ClipboardCheck, Calendar, Clock, DollarSign, ChevronDown, Download, Filter, Search, X, BarChart3, PieChart, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

export interface UsageRecord {
  id: string;
  module: 'Resume Scoring' | 'AI Interview' | 'Assessment';
  operation: string;
  unitsConsumed: number;
  timestamp: Date;
  details: string;
  status: 'completed' | 'failed';
  jobTitle?: string;
  candidateCount?: number;
}

interface UsageDashboardProps {
  onBack?: () => void;
}

export default function UsageDashboard({ onBack }: UsageDashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'all'>('month');
  const [selectedModule, setSelectedModule] = useState<'all' | 'Resume Scoring' | 'AI Interview' | 'Assessment'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Mock usage data - in real app, this would come from backend
  const usageRecords: UsageRecord[] = [
    {
      id: '1',
      module: 'Resume Scoring',
      operation: 'Bulk Resume Scoring',
      unitsConsumed: 45,
      timestamp: new Date(2024, 11, 8, 14, 30),
      details: 'Scored 15 resumes for Senior Frontend Developer',
      status: 'completed',
      jobTitle: 'Senior Frontend Developer',
      candidateCount: 15,
    },
    {
      id: '2',
      module: 'AI Interview',
      operation: 'AI Interview Session',
      unitsConsumed: 120,
      timestamp: new Date(2024, 11, 8, 11, 15),
      details: 'Conducted AI interview for Sarah Johnson',
      status: 'completed',
      jobTitle: 'Product Manager',
      candidateCount: 1,
    },
    {
      id: '3',
      module: 'Assessment',
      operation: 'Assessment Evaluation',
      unitsConsumed: 30,
      timestamp: new Date(2024, 11, 8, 9, 45),
      details: 'Evaluated technical assessment for Backend Developer role',
      status: 'completed',
      jobTitle: 'Backend Developer',
      candidateCount: 3,
    },
    {
      id: '4',
      module: 'Resume Scoring',
      operation: 'Single Resume Score',
      unitsConsumed: 3,
      timestamp: new Date(2024, 11, 7, 16, 20),
      details: 'Scored resume for Michael Chen',
      status: 'completed',
      jobTitle: 'UX Designer',
      candidateCount: 1,
    },
    {
      id: '5',
      module: 'AI Interview',
      operation: 'AI Interview Session',
      unitsConsumed: 120,
      timestamp: new Date(2024, 11, 7, 14, 0),
      details: 'Conducted AI interview for Emma Wilson',
      status: 'completed',
      jobTitle: 'Senior Frontend Developer',
      candidateCount: 1,
    },
    {
      id: '6',
      module: 'Assessment',
      operation: 'Assessment Creation',
      unitsConsumed: 15,
      timestamp: new Date(2024, 11, 7, 10, 30),
      details: 'Created technical assessment with AI assistance',
      status: 'completed',
      jobTitle: 'Full Stack Developer',
    },
    {
      id: '7',
      module: 'Resume Scoring',
      operation: 'Bulk Resume Scoring',
      unitsConsumed: 60,
      timestamp: new Date(2024, 11, 6, 15, 45),
      details: 'Scored 20 resumes for Product Manager',
      status: 'completed',
      jobTitle: 'Product Manager',
      candidateCount: 20,
    },
    {
      id: '8',
      module: 'AI Interview',
      operation: 'AI Interview Session',
      unitsConsumed: 120,
      timestamp: new Date(2024, 11, 6, 11, 0),
      details: 'Conducted AI interview for James Anderson',
      status: 'failed',
      jobTitle: 'Data Scientist',
      candidateCount: 1,
    },
    {
      id: '9',
      module: 'Assessment',
      operation: 'Assessment Evaluation',
      unitsConsumed: 25,
      timestamp: new Date(2024, 11, 5, 13, 15),
      details: 'Evaluated coding assessment submissions',
      status: 'completed',
      jobTitle: 'Senior Backend Developer',
      candidateCount: 5,
    },
    {
      id: '10',
      module: 'Resume Scoring',
      operation: 'AI-Powered Matching',
      unitsConsumed: 90,
      timestamp: new Date(2024, 11, 5, 9, 30),
      details: 'AI Talent Match for 30 candidates',
      status: 'completed',
      jobTitle: 'Marketing Manager',
      candidateCount: 30,
    },
  ];

  // Calculate statistics
  const totalUnitsConsumed = usageRecords.reduce((sum, record) => sum + record.unitsConsumed, 0);
  
  const resumeScoringUnits = usageRecords
    .filter(r => r.module === 'Resume Scoring')
    .reduce((sum, r) => sum + r.unitsConsumed, 0);
  
  const aiInterviewUnits = usageRecords
    .filter(r => r.module === 'AI Interview')
    .reduce((sum, r) => sum + r.unitsConsumed, 0);
  
  const assessmentUnits = usageRecords
    .filter(r => r.module === 'Assessment')
    .reduce((sum, r) => sum + r.unitsConsumed, 0);

  // Calculate percentage changes (mock data)
  const resumeScoringChange = +12.5;
  const aiInterviewChange = -8.3;
  const assessmentChange = +23.7;
  const totalChange = +15.2;

  // Monthly quota (example: 10,000 units per month)
  const monthlyQuota = 10000;
  const usagePercentage = (totalUnitsConsumed / monthlyQuota) * 100;

  // Filter records
  const filteredRecords = usageRecords.filter(record => {
    const matchesModule = selectedModule === 'all' || record.module === selectedModule;
    const matchesSearch = searchQuery === '' || 
      record.operation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (record.jobTitle && record.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesModule && matchesSearch;
  });

  const getModuleIcon = (module: string) => {
    switch (module) {
      case 'Resume Scoring':
        return <Target className="w-4 h-4" />;
      case 'AI Interview':
        return <Video className="w-4 h-4" />;
      case 'Assessment':
        return <ClipboardCheck className="w-4 h-4" />;
      default:
        return <Zap className="w-4 h-4" />;
    }
  };

  const getModuleColor = (module: string) => {
    switch (module) {
      case 'Resume Scoring':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'AI Interview':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Assessment':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl text-gray-900">Units Usage Dashboard</h1>
                <p className="text-sm text-gray-600 mt-0.5">
                  Track your AI units consumption across Resume Scoring, AI Interview, and Assessment
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export Report
              </button>
              {onBack && (
                <button
                  onClick={onBack}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Back
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Monthly Quota Overview */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-xl p-8 mb-8 text-white">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl mb-2">Monthly Usage Overview</h2>
              <p className="text-blue-100 text-sm">December 2024 • Resets in 23 days</p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
              <div className="text-xs text-blue-100 mb-1">Monthly Quota</div>
              <div className="text-2xl font-bold">{monthlyQuota.toLocaleString()}</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span>Units Consumed</span>
              <span className="font-bold">{totalUnitsConsumed.toLocaleString()} / {monthlyQuota.toLocaleString()} ({usagePercentage.toFixed(1)}%)</span>
            </div>
            <div className="w-full h-4 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div 
                className={`h-full rounded-full transition-all ${
                  usagePercentage >= 90 ? 'bg-red-400' : 
                  usagePercentage >= 75 ? 'bg-yellow-400' : 
                  'bg-green-400'
                }`}
                style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              />
            </div>
          </div>

          {/* Usage Warning/Info */}
          {usagePercentage >= 90 && (
            <div className="bg-red-500/20 border border-red-300/30 rounded-lg px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-200" />
              <div className="text-sm">
                <span className="font-medium">High Usage Alert:</span> You've used {usagePercentage.toFixed(1)}% of your monthly quota. Consider upgrading your plan.
              </div>
            </div>
          )}
          {usagePercentage < 90 && usagePercentage >= 75 && (
            <div className="bg-yellow-500/20 border border-yellow-300/30 rounded-lg px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-200" />
              <div className="text-sm">
                <span className="font-medium">Moderate Usage:</span> You've used {usagePercentage.toFixed(1)}% of your monthly quota.
              </div>
            </div>
          )}
          {usagePercentage < 75 && (
            <div className="bg-green-500/20 border border-green-300/30 rounded-lg px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-200" />
              <div className="text-sm">
                <span className="font-medium">Healthy Usage:</span> You're on track with {usagePercentage.toFixed(1)}% of your monthly quota used.
              </div>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {/* Total Units */}
          <div className="bg-white rounded-xl shadow-md border-2 border-gray-200 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${
                totalChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {totalChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {Math.abs(totalChange)}%
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {totalUnitsConsumed.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Total Units Used</div>
            <div className="text-xs text-gray-500 mt-2">This month</div>
          </div>

          {/* Resume Scoring */}
          <div className="bg-white rounded-xl shadow-md border-2 border-blue-200 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${
                resumeScoringChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {resumeScoringChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {Math.abs(resumeScoringChange)}%
              </div>
            </div>
            <div className="text-3xl font-bold text-blue-700 mb-1">
              {resumeScoringUnits.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Resume Scoring</div>
            <div className="text-xs text-gray-500 mt-2">
              {((resumeScoringUnits / totalUnitsConsumed) * 100).toFixed(1)}% of total
            </div>
          </div>

          {/* AI Interview */}
          <div className="bg-white rounded-xl shadow-md border-2 border-purple-200 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Video className="w-6 h-6 text-white" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${
                aiInterviewChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {aiInterviewChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {Math.abs(aiInterviewChange)}%
              </div>
            </div>
            <div className="text-3xl font-bold text-purple-700 mb-1">
              {aiInterviewUnits.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">AI Interview</div>
            <div className="text-xs text-gray-500 mt-2">
              {((aiInterviewUnits / totalUnitsConsumed) * 100).toFixed(1)}% of total
            </div>
          </div>

          {/* Assessment */}
          <div className="bg-white rounded-xl shadow-md border-2 border-green-200 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                <ClipboardCheck className="w-6 h-6 text-white" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${
                assessmentChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {assessmentChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {Math.abs(assessmentChange)}%
              </div>
            </div>
            <div className="text-3xl font-bold text-green-700 mb-1">
              {assessmentUnits.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Assessment</div>
            <div className="text-xs text-gray-500 mt-2">
              {((assessmentUnits / totalUnitsConsumed) * 100).toFixed(1)}% of total
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Usage Breakdown Pie Chart */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <PieChart className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg text-gray-900 font-medium">Usage by Module</h3>
              </div>
            </div>
            <div className="space-y-4">
              {/* Resume Scoring */}
              <div>
                <div className="flex items-center justify-between mb-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                    <span className="text-gray-700">Resume Scoring</span>
                  </div>
                  <span className="font-medium text-gray-900">{resumeScoringUnits} units ({((resumeScoringUnits / totalUnitsConsumed) * 100).toFixed(1)}%)</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${(resumeScoringUnits / totalUnitsConsumed) * 100}%` }}
                  />
                </div>
              </div>

              {/* AI Interview */}
              <div>
                <div className="flex items-center justify-between mb-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                    <span className="text-gray-700">AI Interview</span>
                  </div>
                  <span className="font-medium text-gray-900">{aiInterviewUnits} units ({((aiInterviewUnits / totalUnitsConsumed) * 100).toFixed(1)}%)</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-600 rounded-full transition-all"
                    style={{ width: `${(aiInterviewUnits / totalUnitsConsumed) * 100}%` }}
                  />
                </div>
              </div>

              {/* Assessment */}
              <div>
                <div className="flex items-center justify-between mb-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                    <span className="text-gray-700">Assessment</span>
                  </div>
                  <span className="font-medium text-gray-900">{assessmentUnits} units ({((assessmentUnits / totalUnitsConsumed) * 100).toFixed(1)}%)</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-600 rounded-full transition-all"
                    style={{ width: `${(assessmentUnits / totalUnitsConsumed) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Cost Analysis */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-green-600" />
                <h3 className="text-lg text-gray-900 font-medium">Cost Breakdown</h3>
              </div>
            </div>
            <div className="space-y-4">
              {/* Unit costs (example pricing) */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-3">Cost per Unit</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">Resume Scoring</span>
                    <span className="font-medium text-gray-900">$0.03 / unit</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">AI Interview</span>
                    <span className="font-medium text-gray-900">$0.05 / unit</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">Assessment</span>
                    <span className="font-medium text-gray-900">$0.04 / unit</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-3">Estimated Costs This Month</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">Resume Scoring</span>
                    <span className="font-medium text-gray-900">${(resumeScoringUnits * 0.03).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">AI Interview</span>
                    <span className="font-medium text-gray-900">${(aiInterviewUnits * 0.05).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">Assessment</span>
                    <span className="font-medium text-gray-900">${(assessmentUnits * 0.04).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-blue-200 pt-2 mt-2 flex items-center justify-between">
                    <span className="font-medium text-gray-900">Total</span>
                    <span className="text-xl font-bold text-blue-700">
                      ${((resumeScoringUnits * 0.03) + (aiInterviewUnits * 0.05) + (assessmentUnits * 0.04)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Log */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg text-gray-900 font-medium">Recent Activity</h3>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2 text-sm"
            >
              <Filter className="w-4 h-4" />
              Filters
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search Activity
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by job, candidate, operation..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Filter by Module
                  </label>
                  <select
                    value={selectedModule}
                    onChange={(e) => setSelectedModule(e.target.value as any)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="all">All Modules</option>
                    <option value="Resume Scoring">Resume Scoring</option>
                    <option value="AI Interview">AI Interview</option>
                    <option value="Assessment">Assessment</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Activity Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Timestamp</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Module</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Operation</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Details</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Units Used</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record, index) => (
                  <tr 
                    key={record.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    <td className="py-4 px-4">
                      <div className="text-sm text-gray-900">
                        {record.timestamp.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {record.timestamp.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${getModuleColor(record.module)}`}>
                        {getModuleIcon(record.module)}
                        {record.module}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-sm font-medium text-gray-900">{record.operation}</div>
                      {record.jobTitle && (
                        <div className="text-xs text-gray-500 mt-0.5">{record.jobTitle}</div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-sm text-gray-700 max-w-md">{record.details}</div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg">
                        <Zap className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-sm font-bold text-blue-700">{record.unitsConsumed}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      {record.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                          <X className="w-3 h-3" />
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredRecords.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <BarChart3 className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg text-gray-900 mb-2">No Activity Found</h3>
                <p className="text-gray-600">
                  {searchQuery || selectedModule !== 'all'
                    ? 'No activity matches your current filters.'
                    : 'No usage activity recorded yet.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
