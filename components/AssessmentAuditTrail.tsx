import { useState } from 'react';
import { Search, Filter, Download, X, CheckCircle, XCircle, Clock, AlertTriangle, FileText, RefreshCw, Eye, Calendar, Mail, User, Building2, Hash, Activity } from 'lucide-react';

interface AuditLog {
  id: string;
  tenantId: string;
  tenantName: string;
  jdId: string;
  jdTitle: string;
  candidateEmail: string;
  candidateName: string;
  invitedBy: string;
  invitedByEmail: string;
  startTime: string | null;
  endTime: string | null;
  completionStatus: 'Not Started' | 'In Progress' | 'Completed' | 'Failed' | 'Expired';
  unitConsumed: boolean;
  errors: string[];
  consentAccepted: boolean;
  consentAcceptedAt: string | null;
  consentIpAddress: string | null;
  assessmentName: string;
  invitedDate: string;
  expiryDate: string;
  refundStatus: 'None' | 'Requested' | 'Approved' | 'Rejected';
  refundReason?: string;
  refundRequestedBy?: string;
  refundRequestedAt?: string;
}

interface AssessmentAuditTrailProps {
  logs?: AuditLog[];
}

export default function AssessmentAuditTrail({ logs: initialLogs }: AssessmentAuditTrailProps) {
  // Mock audit logs data
  const mockLogs: AuditLog[] = initialLogs || [
    {
      id: 'audit-1',
      tenantId: 'tenant-001',
      tenantName: 'TalentFlow Enterprise',
      jdId: 'jd-001',
      jdTitle: 'Senior Software Engineer',
      candidateEmail: 'sarah.johnson@email.com',
      candidateName: 'Sarah Johnson',
      invitedBy: 'Alex Morgan',
      invitedByEmail: 'alex.morgan@talentflow.com',
      startTime: '2025-12-01T10:15:00Z',
      endTime: '2025-12-01T11:00:00Z',
      completionStatus: 'Completed',
      unitConsumed: true,
      errors: [],
      consentAccepted: true,
      consentAcceptedAt: '2025-12-01T10:14:30Z',
      consentIpAddress: '192.168.1.100',
      assessmentName: 'Senior Software Engineer Assessment',
      invitedDate: '2025-11-28',
      expiryDate: '2025-12-05',
      refundStatus: 'None'
    },
    {
      id: 'audit-2',
      tenantId: 'tenant-001',
      tenantName: 'TalentFlow Enterprise',
      jdId: 'jd-001',
      jdTitle: 'Senior Software Engineer',
      candidateEmail: 'michael.chen@email.com',
      candidateName: 'Michael Chen',
      invitedBy: 'Jessica Lee',
      invitedByEmail: 'jessica.lee@talentflow.com',
      startTime: '2025-12-02T14:30:00Z',
      endTime: '2025-12-02T15:22:00Z',
      completionStatus: 'Completed',
      unitConsumed: true,
      errors: [],
      consentAccepted: true,
      consentAcceptedAt: '2025-12-02T14:29:45Z',
      consentIpAddress: '192.168.1.101',
      assessmentName: 'Senior Software Engineer Assessment',
      invitedDate: '2025-11-29',
      expiryDate: '2025-12-06',
      refundStatus: 'None'
    },
    {
      id: 'audit-3',
      tenantId: 'tenant-001',
      tenantName: 'TalentFlow Enterprise',
      jdId: 'jd-001',
      jdTitle: 'Senior Software Engineer',
      candidateEmail: 'david.kim@email.com',
      candidateName: 'David Kim',
      invitedBy: 'Jessica Lee',
      invitedByEmail: 'jessica.lee@talentflow.com',
      startTime: '2025-12-01T09:00:00Z',
      endTime: null,
      completionStatus: 'Failed',
      unitConsumed: true,
      errors: ['Connection timeout at round 2', 'Session expired due to inactivity'],
      consentAccepted: true,
      consentAcceptedAt: '2025-12-01T08:59:30Z',
      consentIpAddress: '192.168.1.102',
      assessmentName: 'Senior Software Engineer Assessment',
      invitedDate: '2025-11-29',
      expiryDate: '2025-12-06',
      refundStatus: 'Requested',
      refundReason: 'Technical error - Session timeout during assessment',
      refundRequestedBy: 'Jessica Lee',
      refundRequestedAt: '2025-12-01T10:30:00Z'
    },
    {
      id: 'audit-4',
      tenantId: 'tenant-001',
      tenantName: 'TalentFlow Enterprise',
      jdId: 'jd-001',
      jdTitle: 'Senior Software Engineer',
      candidateEmail: 'emily.rodriguez@email.com',
      candidateName: 'Emily Rodriguez',
      invitedBy: 'Alex Morgan',
      invitedByEmail: 'alex.morgan@talentflow.com',
      startTime: '2025-11-30T16:45:00Z',
      endTime: '2025-11-30T17:33:00Z',
      completionStatus: 'Completed',
      unitConsumed: true,
      errors: [],
      consentAccepted: true,
      consentAcceptedAt: '2025-11-30T16:44:20Z',
      consentIpAddress: '192.168.1.103',
      assessmentName: 'Senior Software Engineer Assessment',
      invitedDate: '2025-11-27',
      expiryDate: '2025-12-04',
      refundStatus: 'None'
    },
    {
      id: 'audit-5',
      tenantId: 'tenant-001',
      tenantName: 'TalentFlow Enterprise',
      jdId: 'jd-001',
      jdTitle: 'Senior Software Engineer',
      candidateEmail: 'robert.taylor@email.com',
      candidateName: 'Robert Taylor',
      invitedBy: 'Jessica Lee',
      invitedByEmail: 'jessica.lee@talentflow.com',
      startTime: null,
      endTime: null,
      completionStatus: 'Not Started',
      unitConsumed: false,
      errors: [],
      consentAccepted: false,
      consentAcceptedAt: null,
      consentIpAddress: null,
      assessmentName: 'Senior Software Engineer Assessment',
      invitedDate: '2025-11-30',
      expiryDate: '2025-12-07',
      refundStatus: 'None'
    },
    {
      id: 'audit-6',
      tenantId: 'tenant-001',
      tenantName: 'TalentFlow Enterprise',
      jdId: 'jd-001',
      jdTitle: 'Senior Software Engineer',
      candidateEmail: 'amanda.white@email.com',
      candidateName: 'Amanda White',
      invitedBy: 'Alex Morgan',
      invitedByEmail: 'alex.morgan@talentflow.com',
      startTime: '2025-11-29T11:00:00Z',
      endTime: '2025-11-29T11:42:00Z',
      completionStatus: 'Completed',
      unitConsumed: true,
      errors: [],
      consentAccepted: true,
      consentAcceptedAt: '2025-11-29T10:59:50Z',
      consentIpAddress: '192.168.1.104',
      assessmentName: 'Senior Software Engineer Assessment',
      invitedDate: '2025-11-26',
      expiryDate: '2025-12-03',
      refundStatus: 'None'
    },
    {
      id: 'audit-7',
      tenantId: 'tenant-001',
      tenantName: 'TalentFlow Enterprise',
      jdId: 'jd-001',
      jdTitle: 'Senior Software Engineer',
      candidateEmail: 'john.doe@email.com',
      candidateName: 'John Doe',
      invitedBy: 'Alex Morgan',
      invitedByEmail: 'alex.morgan@talentflow.com',
      startTime: '2025-11-28T13:30:00Z',
      endTime: null,
      completionStatus: 'In Progress',
      unitConsumed: true,
      errors: [],
      consentAccepted: true,
      consentAcceptedAt: '2025-11-28T13:29:15Z',
      consentIpAddress: '192.168.1.105',
      assessmentName: 'Senior Software Engineer Assessment',
      invitedDate: '2025-11-25',
      expiryDate: '2025-12-02',
      refundStatus: 'None'
    },
    {
      id: 'audit-8',
      tenantId: 'tenant-001',
      tenantName: 'TalentFlow Enterprise',
      jdId: 'jd-002',
      jdTitle: 'Frontend Developer',
      candidateEmail: 'lisa.anderson@email.com',
      candidateName: 'Lisa Anderson',
      invitedBy: 'Jessica Lee',
      invitedByEmail: 'jessica.lee@talentflow.com',
      startTime: null,
      endTime: null,
      completionStatus: 'Expired',
      unitConsumed: false,
      errors: ['Assessment expired without completion'],
      consentAccepted: true,
      consentAcceptedAt: '2025-11-20T10:00:00Z',
      consentIpAddress: '192.168.1.106',
      assessmentName: 'Frontend Developer Assessment',
      invitedDate: '2025-11-20',
      expiryDate: '2025-11-27',
      refundStatus: 'None'
    }
  ];

  const [logs, setLogs] = useState<AuditLog[]>(mockLogs);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRefundStatus, setFilterRefundStatus] = useState<string>('all');
  const [filterUnitConsumed, setFilterUnitConsumed] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterJdId, setFilterJdId] = useState('');

  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedRefundLog, setSelectedRefundLog] = useState<AuditLog | null>(null);
  const [refundReason, setRefundReason] = useState('');

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.candidateEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.jdTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.invitedBy.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || log.completionStatus === filterStatus;
    const matchesRefundStatus = filterRefundStatus === 'all' || log.refundStatus === filterRefundStatus;
    const matchesUnitConsumed = 
      filterUnitConsumed === 'all' || 
      (filterUnitConsumed === 'true' && log.unitConsumed) ||
      (filterUnitConsumed === 'false' && !log.unitConsumed);
    
    const matchesDateRange = 
      (!filterDateFrom || new Date(log.invitedDate) >= new Date(filterDateFrom)) &&
      (!filterDateTo || new Date(log.invitedDate) <= new Date(filterDateTo));
    
    const matchesJdId = !filterJdId || log.jdId.toLowerCase().includes(filterJdId.toLowerCase());
    
    return matchesSearch && matchesStatus && matchesRefundStatus && matchesUnitConsumed && matchesDateRange && matchesJdId;
  });

  const clearFilters = () => {
    setFilterStatus('all');
    setFilterRefundStatus('all');
    setFilterUnitConsumed('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterJdId('');
  };

  const activeFiltersCount = 
    (filterStatus !== 'all' ? 1 : 0) +
    (filterRefundStatus !== 'all' ? 1 : 0) +
    (filterUnitConsumed !== 'all' ? 1 : 0) +
    (filterDateFrom ? 1 : 0) +
    (filterDateTo ? 1 : 0) +
    (filterJdId ? 1 : 0);

  const handleExportAuditLogs = () => {
    console.log('Exporting audit logs:', filteredLogs);
    alert(`Exporting ${filteredLogs.length} audit log entries to CSV`);
  };

  const handleRequestRefund = (log: AuditLog) => {
    setSelectedRefundLog(log);
    setRefundReason('');
    setShowRefundModal(true);
  };

  const handleSubmitRefund = () => {
    if (!selectedRefundLog || !refundReason.trim()) {
      alert('Please provide a refund reason');
      return;
    }

    setLogs(logs.map(log => 
      log.id === selectedRefundLog.id
        ? {
            ...log,
            refundStatus: 'Requested',
            refundReason,
            refundRequestedBy: 'Current User',
            refundRequestedAt: new Date().toISOString()
          }
        : log
    ));

    setShowRefundModal(false);
    setSelectedRefundLog(null);
    setRefundReason('');
    alert('Refund request submitted successfully');
  };

  const handleApproveRefund = (logId: string) => {
    if (confirm('Approve this refund request? This will restore 1 assessment unit.')) {
      setLogs(logs.map(log => 
        log.id === logId ? { ...log, refundStatus: 'Approved' as const } : log
      ));
      alert('Refund approved. 1 assessment unit has been restored.');
    }
  };

  const handleRejectRefund = (logId: string) => {
    const reason = prompt('Reason for rejecting this refund:');
    if (reason) {
      setLogs(logs.map(log => 
        log.id === logId ? { ...log, refundStatus: 'Rejected' as const } : log
      ));
      alert('Refund request rejected.');
    }
  };

  const getStatusBadge = (status: AuditLog['completionStatus']) => {
    const styles = {
      'Completed': 'bg-green-100 text-green-700 border-green-300',
      'In Progress': 'bg-gray-100 text-gray-900 border-gray-300',
      'Not Started': 'bg-gray-100 text-gray-700 border-gray-300',
      'Failed': 'bg-red-100 text-red-700 border-red-300',
      'Expired': 'bg-orange-100 text-orange-700 border-orange-300'
    };

    const icons = {
      'Completed': <CheckCircle className="w-3 h-3" />,
      'In Progress': <Clock className="w-3 h-3" />,
      'Not Started': <Clock className="w-3 h-3" />,
      'Failed': <XCircle className="w-3 h-3" />,
      'Expired': <AlertTriangle className="w-3 h-3" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${styles[status]}`}>
        {icons[status]}
        {status}
      </span>
    );
  };

  const getRefundStatusBadge = (status: AuditLog['refundStatus']) => {
    if (status === 'None') return null;

    const styles = {
      'Requested': 'bg-yellow-100 text-yellow-700 border-yellow-300',
      'Approved': 'bg-green-100 text-green-700 border-green-300',
      'Rejected': 'bg-red-100 text-red-700 border-red-300'
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${styles[status]}`}>
        <RefreshCw className="w-3 h-3" />
        Refund {status}
      </span>
    );
  };

  const formatDuration = (startTime: string | null, endTime: string | null) => {
    if (!startTime || !endTime) return 'N/A';
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end.getTime() - start.getTime();
    const minutes = Math.floor(durationMs / 60000);
    
    return `${minutes} min`;
  };

  const stats = {
    total: logs.length,
    completed: logs.filter(l => l.completionStatus === 'Completed').length,
    inProgress: logs.filter(l => l.completionStatus === 'In Progress').length,
    failed: logs.filter(l => l.completionStatus === 'Failed').length,
    notStarted: logs.filter(l => l.completionStatus === 'Not Started').length,
    expired: logs.filter(l => l.completionStatus === 'Expired').length,
    unitsConsumed: logs.filter(l => l.unitConsumed).length,
    refundRequested: logs.filter(l => l.refundStatus === 'Requested').length,
    refundApproved: logs.filter(l => l.refundStatus === 'Approved').length
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Total Logs</span>
            <Activity className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl text-gray-900">{stats.total}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Completed</span>
            <CheckCircle className="w-4 h-4 text-green-600" />
          </div>
          <div className="text-2xl text-green-600">{stats.completed}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Units Consumed</span>
            <Hash className="w-4 h-4 text-gray-800" />
          </div>
          <div className="text-2xl text-gray-800">{stats.unitsConsumed}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Failed</span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl text-red-600">{stats.failed}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Refund Pending</span>
            <RefreshCw className="w-4 h-4 text-yellow-600" />
          </div>
          <div className="text-2xl text-yellow-600">{stats.refundRequested}</div>
        </div>
      </div>

      {/* Main Audit Trail Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-gray-900">Assessment Audit Trail</h2>
              <p className="text-sm text-gray-600 mt-1">
                Complete compliance log for all assessment activities
              </p>
            </div>
            
            <button
              onClick={handleExportAuditLogs}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export Audit Logs
            </button>
          </div>

          {/* Search and Filter Bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by candidate, email, JD, or recruiter..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 text-sm border rounded-md transition-colors flex items-center gap-2 ${
                showFilters || activeFiltersCount > 0
                  ? 'border-gray-300 text-gray-900 bg-gray-50'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="px-1.5 py-0.5 bg-gray-800 text-white rounded text-xs">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm text-gray-900">Filters</h3>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-gray-800 hover:text-gray-900 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Clear All
                  </button>
                )}
              </div>

              <div className="grid grid-cols-6 gap-4">
                {/* Completion Status */}
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                  >
                    <option value="all">All</option>
                    <option value="Completed">Completed</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Not Started">Not Started</option>
                    <option value="Failed">Failed</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>

                {/* Refund Status */}
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Refund Status</label>
                  <select
                    value={filterRefundStatus}
                    onChange={(e) => setFilterRefundStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                  >
                    <option value="all">All</option>
                    <option value="None">No Refund</option>
                    <option value="Requested">Requested</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>

                {/* Unit Consumed */}
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Unit Consumed</label>
                  <select
                    value={filterUnitConsumed}
                    onChange={(e) => setFilterUnitConsumed(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                  >
                    <option value="all">All</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                {/* JD ID */}
                <div>
                  <label className="block text-sm text-gray-700 mb-1">JD ID</label>
                  <input
                    type="text"
                    placeholder="jd-001"
                    value={filterJdId}
                    onChange={(e) => setFilterJdId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                </div>

                {/* Date From */}
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Date From</label>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Date To</label>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm text-gray-600">Candidate</th>
                <th className="text-left py-3 px-4 text-sm text-gray-600">JD Title</th>
                <th className="text-left py-3 px-4 text-sm text-gray-600">Status</th>
                <th className="text-left py-3 px-4 text-sm text-gray-600">Invited By</th>
                <th className="text-left py-3 px-4 text-sm text-gray-600">Duration</th>
                <th className="text-left py-3 px-4 text-sm text-gray-600">Unit</th>
                <th className="text-left py-3 px-4 text-sm text-gray-600">Consent</th>
                <th className="text-left py-3 px-4 text-sm text-gray-600">Refund</th>
                <th className="text-left py-3 px-4 text-sm text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <div className="text-gray-400">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No audit logs found</p>
                      {searchTerm && (
                        <p className="text-xs mt-1">Try adjusting your search or filters</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, index) => (
                  <>
                    <tr
                      key={log.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                      }`}
                    >
                      {/* Candidate */}
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-900">{log.candidateName}</div>
                        <div className="text-xs text-gray-500">{log.candidateEmail}</div>
                      </td>

                      {/* JD Title */}
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-900">{log.jdTitle}</div>
                        <div className="text-xs text-gray-500">ID: {log.jdId}</div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {getStatusBadge(log.completionStatus)}
                      </td>

                      {/* Invited By */}
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-900">{log.invitedBy}</div>
                        <div className="text-xs text-gray-500">{log.invitedDate}</div>
                      </td>

                      {/* Duration */}
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-700">
                          {formatDuration(log.startTime, log.endTime)}
                        </div>
                      </td>

                      {/* Unit Consumed */}
                      <td className="py-3 px-4">
                        {log.unitConsumed ? (
                          <span className="inline-flex items-center gap-1 text-sm text-red-600">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Yes
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">No</span>
                        )}
                      </td>

                      {/* Consent */}
                      <td className="py-3 px-4">
                        {log.consentAccepted ? (
                          <span className="inline-flex items-center gap-1 text-sm text-green-600">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Yes
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">No</span>
                        )}
                      </td>

                      {/* Refund Status */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          {getRefundStatusBadge(log.refundStatus)}
                          {log.refundStatus === 'Requested' && (
                            <div className="flex gap-1 mt-1">
                              <button
                                onClick={() => handleApproveRefund(log.id)}
                                className="text-xs text-green-600 hover:text-green-700 underline"
                              >
                                Approve
                              </button>
                              <span className="text-gray-300">|</span>
                              <button
                                onClick={() => handleRejectRefund(log.id)}
                                className="text-xs text-red-600 hover:text-red-700 underline"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedLog(selectedLog === log.id ? null : log.id)}
                            className="p-1.5 text-gray-800 hover:bg-gray-50 rounded-md transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {log.completionStatus === 'Failed' && log.unitConsumed && log.refundStatus === 'None' && (
                            <button
                              onClick={() => handleRequestRefund(log)}
                              className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-md transition-colors"
                              title="Request Refund"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Details */}
                    {selectedLog === log.id && (
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <td colSpan={9} className="p-6">
                          <div className="grid grid-cols-3 gap-6">
                            {/* Column 1 - Tenant & Assessment Info */}
                            <div>
                              <h4 className="text-sm text-gray-900 mb-3">Tenant & Assessment</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-gray-400" />
                                  <span className="text-gray-600">Tenant:</span>
                                  <span className="text-gray-900">{log.tenantName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Hash className="w-4 h-4 text-gray-400" />
                                  <span className="text-gray-600">Tenant ID:</span>
                                  <span className="text-gray-900 font-mono text-xs">{log.tenantId}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-gray-400" />
                                  <span className="text-gray-600">Assessment:</span>
                                  <span className="text-gray-900">{log.assessmentName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-gray-400" />
                                  <span className="text-gray-600">Invited:</span>
                                  <span className="text-gray-900">{log.invitedDate}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-gray-400" />
                                  <span className="text-gray-600">Expires:</span>
                                  <span className="text-gray-900">{log.expiryDate}</span>
                                </div>
                              </div>
                            </div>

                            {/* Column 2 - Timeline & Consent */}
                            <div>
                              <h4 className="text-sm text-gray-900 mb-3">Timeline & Consent</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex items-start gap-2">
                                  <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                                  <div>
                                    <span className="text-gray-600">Start Time:</span>
                                    <div className="text-gray-900">{log.startTime || 'N/A'}</div>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                                  <div>
                                    <span className="text-gray-600">End Time:</span>
                                    <div className="text-gray-900">{log.endTime || 'N/A'}</div>
                                  </div>
                                </div>
                                {log.consentAccepted && (
                                  <>
                                    <div className="flex items-start gap-2">
                                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                                      <div>
                                        <span className="text-gray-600">Consent Accepted:</span>
                                        <div className="text-gray-900">{log.consentAcceptedAt}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-600">IP Address:</span>
                                      <span className="text-gray-900 font-mono text-xs">{log.consentIpAddress}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Column 3 - Errors & Refund */}
                            <div>
                              <h4 className="text-sm text-gray-900 mb-3">Errors & Refund</h4>
                              <div className="space-y-2 text-sm">
                                {log.errors.length > 0 ? (
                                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                    <div className="flex items-start gap-2 mb-2">
                                      <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                                      <span className="text-red-700">Errors Detected:</span>
                                    </div>
                                    <ul className="list-disc list-inside text-red-600 text-xs space-y-1 ml-6">
                                      {log.errors.map((error, idx) => (
                                        <li key={idx}>{error}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  <div className="text-gray-500 text-xs">No errors recorded</div>
                                )}

                                {log.refundStatus !== 'None' && (
                                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
                                    <div className="space-y-1">
                                      <div className="text-gray-600">Status: <span className="text-gray-900">{log.refundStatus}</span></div>
                                      {log.refundReason && (
                                        <div className="text-gray-600">Reason: <span className="text-gray-900">{log.refundReason}</span></div>
                                      )}
                                      {log.refundRequestedBy && (
                                        <div className="text-gray-600">By: <span className="text-gray-900">{log.refundRequestedBy}</span></div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <div className="text-sm text-gray-600 text-center">
            Showing {filteredLogs.length} of {logs.length} audit log entries
          </div>
        </div>
      </div>

      {/* Refund Request Modal */}
      {showRefundModal && selectedRefundLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-gray-900">Request Assessment Unit Refund</h3>
              <p className="text-sm text-gray-600 mt-1">
                Submit a refund request for this failed assessment
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-gray-600">Candidate:</div>
                  <div className="text-gray-900">{selectedRefundLog.candidateName}</div>
                  
                  <div className="text-gray-600">Assessment:</div>
                  <div className="text-gray-900">{selectedRefundLog.assessmentName}</div>
                  
                  <div className="text-gray-600">Status:</div>
                  <div>{getStatusBadge(selectedRefundLog.completionStatus)}</div>
                  
                  <div className="text-gray-600">Unit Consumed:</div>
                  <div className="text-gray-900">{selectedRefundLog.unitConsumed ? 'Yes' : 'No'}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Refund Reason <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Provide a detailed reason for the refund request..."
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-900">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>
                    Refund requests are reviewed manually. If approved, 1 assessment unit will be restored to your account.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowRefundModal(false);
                  setSelectedRefundLog(null);
                  setRefundReason('');
                }}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRefund}
                disabled={!refundReason.trim()}
                className="px-4 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Refund Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
