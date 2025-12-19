'use client';

import { AlertTriangle, Search, Clock, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
import { useState } from 'react';

const mockDisputes: Array<{
  id: string;
  date: string;
  amount: string;
  status: string;
  reason: string;
  invoiceId: string;
  resolution?: string;
}> = [];

export default function DisputeHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDisputes = mockDisputes.filter(disp =>
    disp.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    disp.reason.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    open: 'bg-yellow-100 text-yellow-700',
    resolved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-600 to-orange-700 rounded-xl flex items-center justify-center shadow-lg">
              <AlertTriangle className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Dispute History</h1>
              <p className="text-sm text-gray-600">View and manage billing disputes</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search disputes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Empty State */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Disputes</h3>
          <p className="text-sm text-gray-500 mb-6">You haven't filed any billing disputes.</p>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <MessageSquare className="w-4 h-4" />
            Contact Support
          </button>
        </div>

        {/* Info Card */}
        <div className="mt-8 bg-orange-50 border border-orange-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-orange-900">About Disputes</h3>
              <p className="text-sm text-orange-700 mt-1">
                If you believe you were incorrectly charged, you can file a dispute. Our team will review your case within 5-7 business days. For immediate assistance, please contact our support team.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
