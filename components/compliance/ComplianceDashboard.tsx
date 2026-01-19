'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import {
  Shield,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  Clock,
  Lock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  Filter,
  Calendar,
  Eye,
} from 'lucide-react';
import complianceService, {
  ComplianceReport,
  ModificationAttemptSummary,
  AuditCorrection,
  getCorrectionTypeName,
  getTableDisplayName,
} from '@/lib/services/complianceService';

interface ComplianceDashboardProps {
  showFullReport?: boolean;
}

export default function ComplianceDashboard({ showFullReport = true }: ComplianceDashboardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [modSummary, setModSummary] = useState<ModificationAttemptSummary | null>(null);
  const [recentCorrections, setRecentCorrections] = useState<AuditCorrection[]>([]);
  const [selectedRegulation, setSelectedRegulation] = useState<string>('');
  const [expandedSection, setExpandedSection] = useState<string | null>('summary');

  useEffect(() => {
    loadDashboardData();
  }, [selectedRegulation]);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [reportData, modData, correctionsData] = await Promise.all([
        complianceService.generateComplianceReport({
          regulation: selectedRegulation as any || undefined,
        }),
        complianceService.getModificationAttemptSummary(30),
        complianceService.getCorrections({ limit: 5 }),
      ]);

      setReport(reportData);
      setModSummary(modData);
      setRecentCorrections(correctionsData.items);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load compliance data');
    } finally {
      setIsLoading(false);
    }
  };

  const getComplianceStatusColor = (compliant: boolean) => {
    return compliant ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Shield className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Compliance Dashboard</h2>
                <p className="text-sm text-gray-500">
                  Immutable Audit Record Enforcement & Regulatory Compliance
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedRegulation}
                onChange={(e) => setSelectedRegulation(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Regulations</option>
                <option value="GDPR">GDPR (EU)</option>
                <option value="DPDP">DPDP (India)</option>
                <option value="CCPA">CCPA (California)</option>
              </select>
              <button
                onClick={loadDashboardData}
                disabled={isLoading}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Compliance Status Cards */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Immutability Status */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Immutability</span>
              </div>
              <div className={`flex items-center gap-2 ${report?.immutability_status.all_records_immutable ? 'text-green-600' : 'text-red-600'}`}>
                {report?.immutability_status.all_records_immutable ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
                <span className="font-semibold">
                  {report?.immutability_status.all_records_immutable ? 'Enforced' : 'Check Required'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                DB Triggers: {report?.immutability_status.database_triggers_active ? 'Active' : 'Inactive'}
              </p>
            </div>

            {/* Modification Attempts */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Blocked Attempts</span>
              </div>
              <div className={`font-semibold text-2xl ${(modSummary?.total_attempts || 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {modSummary?.total_attempts || 0}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Last 30 days
              </p>
            </div>

            {/* Total Corrections */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Corrections</span>
              </div>
              <div className="font-semibold text-2xl text-gray-900">
                {report?.summary.total_corrections || 0}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Via new records (immutable)
              </p>
            </div>

            {/* Legal Holds */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Legal Holds</span>
              </div>
              <div className="font-semibold text-2xl text-gray-900">
                {report?.summary.records_under_legal_hold || 0}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Records under retention hold
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Flags */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <button
          onClick={() => toggleSection('compliance')}
          className="w-full px-6 py-4 flex items-center justify-between border-b border-gray-200"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Regulatory Compliance Status</h3>
          </div>
          {expandedSection === 'compliance' ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
        </button>
        {expandedSection === 'compliance' && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-4 rounded-lg ${getComplianceStatusColor(report?.compliance_flags.gdpr_compliant || false)}`}>
                <div className="flex items-center gap-2 mb-2">
                  {report?.compliance_flags.gdpr_compliant ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  <span className="font-semibold">GDPR</span>
                </div>
                <p className="text-sm">EU General Data Protection Regulation</p>
              </div>

              <div className={`p-4 rounded-lg ${getComplianceStatusColor(report?.compliance_flags.dpdp_compliant || false)}`}>
                <div className="flex items-center gap-2 mb-2">
                  {report?.compliance_flags.dpdp_compliant ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  <span className="font-semibold">DPDP</span>
                </div>
                <p className="text-sm">India Digital Personal Data Protection Act</p>
              </div>

              <div className={`p-4 rounded-lg ${getComplianceStatusColor(report?.compliance_flags.ccpa_compliant || false)}`}>
                <div className="flex items-center gap-2 mb-2">
                  {report?.compliance_flags.ccpa_compliant ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  <span className="font-semibold">CCPA</span>
                </div>
                <p className="text-sm">California Consumer Privacy Act</p>
              </div>
            </div>

            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Compliance Features</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  {report?.compliance_flags.full_audit_trail ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span>Full Audit Trail</span>
                </div>
                <div className="flex items-center gap-2">
                  {report?.compliance_flags.corrections_via_new_records ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span>Corrections via New Records</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modification Attempts by Table */}
      {modSummary && Object.keys(modSummary.by_table).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <button
            onClick={() => toggleSection('attempts')}
            className="w-full px-6 py-4 flex items-center justify-between border-b border-gray-200"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-gray-900">Blocked Modification Attempts</h3>
              <span className="text-sm text-gray-500">({modSummary.total_attempts} total)</span>
            </div>
            {expandedSection === 'attempts' ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {expandedSection === 'attempts' && (
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Table
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Attempts
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {Object.entries(modSummary.by_table).map(([table, count]) => (
                      <tr key={table} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-gray-900">
                            {getTableDisplayName(table)}
                          </span>
                          <p className="text-xs text-gray-500">{table}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-amber-600 font-semibold">{count}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                            All Blocked
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mt-4">
                All modification attempts were blocked by database triggers. Audit records remain immutable.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Recent Corrections */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <button
          onClick={() => toggleSection('corrections')}
          className="w-full px-6 py-4 flex items-center justify-between border-b border-gray-200"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-gray-900">Recent Corrections</h3>
          </div>
          {expandedSection === 'corrections' ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
        </button>
        {expandedSection === 'corrections' && (
          <div className="p-6">
            {recentCorrections.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No corrections recorded</p>
                <p className="text-xs text-gray-400 mt-1">
                  Corrections are created when audit data needs annotation or clarification
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentCorrections.map((correction) => (
                  <div key={correction.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                          {getCorrectionTypeName(correction.correction_type)}
                        </span>
                        <span className="text-sm text-gray-500">
                          {getTableDisplayName(correction.original_table)}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(correction.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{correction.correction_reason}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      By {correction.corrected_by_email}
                      {correction.requires_approval && !correction.approved_at && (
                        <span className="ml-2 text-amber-600">(Pending Approval)</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audit Summary */}
      {showFullReport && report && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <button
            onClick={() => toggleSection('summary')}
            className="w-full px-6 py-4 flex items-center justify-between border-b border-gray-200"
          >
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-gray-500" />
              <h3 className="font-semibold text-gray-900">Audit Action Summary</h3>
              <span className="text-sm text-gray-500">
                ({report.summary.total_audit_actions} actions)
              </span>
            </div>
            {expandedSection === 'summary' ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {expandedSection === 'summary' && (
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(report.summary.audit_action_breakdown)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 8)
                  .map(([action, count]) => (
                    <div key={action} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 truncate">{action}</p>
                      <p className="text-lg font-semibold text-gray-900">{count}</p>
                    </div>
                  ))}
              </div>
              <div className="mt-4 text-xs text-gray-500">
                <p>Report Period: {new Date(report.period.start_date).toLocaleDateString()} - {new Date(report.period.end_date).toLocaleDateString()}</p>
                <p>Generated: {new Date(report.generated_at).toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
