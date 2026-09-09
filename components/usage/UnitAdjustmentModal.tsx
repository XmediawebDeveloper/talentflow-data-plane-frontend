'use client';

/**
 * UnitAdjustmentModal Component - UN01
 * Modal for Super Admin to adjust tenant unit balances
 */

import React, { useState, useEffect } from 'react';
import type { IconComponent } from '@/lib/types/icon';
import {
  X,
  Loader2,
  Plus,
  Minus,
  Check,
  AlertTriangle,
  ClipboardList,
  ClipboardCheck,
  Video,
  History,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatIST } from '@/lib/utils/dateUtils';
import {
  unitPoolService,
  UnitType,
  UnitPoolStatus,
  AdjustmentLogEntry,
  getUnitTypeName,
} from '@/lib/services/unitPoolService';

interface UnitAdjustmentModalProps {
  tenantId: string;
  tenantName: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

type AdjustmentMode = 'add' | 'deduct' | 'set';

// Icons for each unit type
const UNIT_TYPE_ICONS: Record<UnitType, IconComponent> = {
  RS: ClipboardList,
  AS: ClipboardCheck,
  AIU: Video,
};

export default function UnitAdjustmentModal({
  tenantId,
  tenantName,
  isOpen,
  onClose,
  onUpdate,
}: UnitAdjustmentModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pools, setPools] = useState<Record<UnitType, UnitPoolStatus> | null>(null);
  const [tenantStatus, setTenantStatus] = useState<string | null>(null);
  const [history, setHistory] = useState<AdjustmentLogEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Form state
  const [selectedType, setSelectedType] = useState<UnitType>('RS');
  const [mode, setMode] = useState<AdjustmentMode>('add');
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [referenceType, setReferenceType] = useState<string>('');
  const [referenceId, setReferenceId] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, tenantId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [poolData, historyData] = await Promise.all([
        unitPoolService.getAdminPoolStatus(tenantId),
        unitPoolService.getAdjustmentHistory(tenantId, { limit: 20 }),
      ]);
      setPools(poolData.pools);
      setTenantStatus(poolData.tenant_status);
      setHistory(historyData.items);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load tenant data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for this adjustment');
      return;
    }

    if (amount <= 0 && mode !== 'set') {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsSaving(true);
    try {
      if (mode === 'set') {
        await unitPoolService.setUnits(tenantId, {
          unit_type: selectedType,
          new_balance: amount,
          reason: reason.trim(),
          notes: notes.trim() || undefined,
        });
        toast.success(`Set ${getUnitTypeName(selectedType)} units to ${amount}`);
      } else {
        const adjustment = mode === 'add' ? amount : -amount;
        await unitPoolService.adjustUnits(tenantId, {
          unit_type: selectedType,
          adjustment,
          reason: reason.trim(),
          notes: notes.trim() || undefined,
          reference_type: referenceType.trim() || undefined,
          reference_id: referenceId.trim() || undefined,
        });
        toast.success(
          `${mode === 'add' ? 'Added' : 'Deducted'} ${amount} ${getUnitTypeName(selectedType)} units`
        );
      }

      // Reset form
      setAmount(0);
      setReason('');
      setNotes('');
      setReferenceType('');
      setReferenceId('');

      // Reload data
      await loadData();
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to adjust units');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedPool = pools?.[selectedType];
  const projectedBalance =
    mode === 'set'
      ? amount
      : mode === 'add'
      // available_units is `number | string` (the backend masks it to a sentinel string
      // for users without granular visibility). This modal is billing-manager only, so it
      // always sees the numeric form; cast to keep the arithmetic identical.
      ? ((selectedPool?.available_units as number) || 0) + amount
      : ((selectedPool?.available_units as number) || 0) - amount;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-[95vw] sm:max-w-2xl max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">
              Adjust Unit Pool
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-500 mt-0.5">
              {tenantName}
              {tenantStatus && (
                <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                  tenantStatus === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                  tenantStatus === 'SUSPENDED' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                }`}>
                  {tenantStatus}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-2 rounded-lg transition-colors ${
                showHistory ? 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-50' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              <History className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 dark:text-slate-500 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
             aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-slate-500" />
            </div>
          ) : showHistory ? (
            /* History View */
            <div>
              <h3 className="font-medium text-gray-900 dark:text-slate-50 mb-4">Adjustment History</h3>
              {history.length === 0 ? (
                <p className="text-center py-8 text-gray-500 dark:text-slate-500">No adjustments recorded</p>
              ) : (
                <div className="space-y-3">
                  {history.map(entry => {
                    const Icon = UNIT_TYPE_ICONS[entry.unit_type];
                    const isPositive = entry.units_amount > 0;

                    return (
                      <div key={entry.id} className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded ${
                              isPositive ? 'bg-green-100' : 'bg-red-100'
                            }`}>
                              {isPositive ? (
                                <Plus className="w-4 h-4 text-green-600" />
                              ) : (
                                <Minus className="w-4 h-4 text-red-600" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${
                                  isPositive ? 'text-green-700' : 'text-red-700'
                                }`}>
                                  {isPositive ? '+' : ''}{entry.units_amount} {entry.unit_type}
                                </span>
                                <span className="text-xs bg-gray-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-slate-400">
                                  {entry.action_type}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">
                                {entry.reason}
                              </p>
                              {entry.notes && (
                                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                                  Note: {entry.notes}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-400 dark:text-slate-500">
                            <p>{entry.actor_email || entry.actor_type}</p>
                            <p>{formatIST(entry.created_at)}</p>
                            <p className="mt-1 text-gray-500 dark:text-slate-500">
                              {entry.balance_before} → {entry.balance_after}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Adjustment Form */
            <>
              {/* Current Balances */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">Current Balances</h3>
                <div className="grid grid-cols-3 gap-3">
                  {(['RS', 'AS', 'AIU'] as UnitType[]).map(type => {
                    const pool = pools?.[type];
                    const Icon = UNIT_TYPE_ICONS[type];
                    const isSelected = selectedType === type;

                    return (
                      <button
                        key={type}
                        onClick={() => setSelectedType(type)}
                        className={`p-3 rounded-lg border transition-colors text-left ${
                          isSelected
                            ? 'border-gray-900 bg-gray-50 dark:bg-slate-800/50'
                            : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-gray-900 dark:text-slate-50' : 'text-gray-400 dark:text-slate-500'}`} />
                          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                            {getUnitTypeName(type)}
                          </span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-slate-50 mt-2">
                          {pool?.available_units.toLocaleString() || 0}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-500">
                          of {pool?.total_allocated.toLocaleString() || 0} allocated
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Adjustment Mode */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Adjustment Type
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMode('add')}
                    className={`flex-1 py-2 px-4 rounded-lg border font-medium transition-colors ${
                      mode === 'add'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-gray-300'
                    }`}
                  >
                    <Plus className="w-4 h-4 inline mr-1" />
                    Add
                  </button>
                  <button
                    onClick={() => setMode('deduct')}
                    className={`flex-1 py-2 px-4 rounded-lg border font-medium transition-colors ${
                      mode === 'deduct'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-gray-300'
                    }`}
                  >
                    <Minus className="w-4 h-4 inline mr-1" />
                    Deduct
                  </button>
                  <button
                    onClick={() => setMode('set')}
                    className={`flex-1 py-2 px-4 rounded-lg border font-medium transition-colors ${
                      mode === 'set'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-gray-300'
                    }`}
                  >
                    Set Exact
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  {mode === 'set' ? 'New Balance' : 'Amount'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Enter amount"
                />
                {amount > 0 && (
                  <p className="mt-2 text-sm text-gray-500 dark:text-slate-500">
                    New balance will be:{' '}
                    <span className={`font-medium ${
                      projectedBalance < 0 ? 'text-red-600' : 'text-gray-900 dark:text-slate-50'
                    }`}>
                      {projectedBalance}
                    </span>
                    {projectedBalance < 0 && (
                      <span className="text-red-600 ml-2">
                        <AlertTriangle className="w-4 h-4 inline" /> Negative balance not allowed
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Reason (Required) */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Reason <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="e.g., Customer request, Plan upgrade, Billing adjustment"
                  maxLength={100}
                />
              </div>

              {/* Notes (Optional) */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Additional Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                  rows={2}
                  placeholder="Optional additional details..."
                  maxLength={500}
                />
              </div>

              {/* Reference (Optional) */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    Reference Type
                  </label>
                  <select
                    value={referenceType}
                    onChange={(e) => setReferenceType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">None</option>
                    <option value="ticket">Support Ticket</option>
                    <option value="subscription">Subscription</option>
                    <option value="invoice">Invoice</option>
                    <option value="manual">Manual Override</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    Reference ID
                  </label>
                  <input
                    type="text"
                    value={referenceId}
                    onChange={(e) => setReferenceId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="Optional"
                  />
                </div>
              </div>

              {/* Info */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex gap-2">
                  <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700">
                    All adjustments are logged for audit purposes. Make sure to provide a clear reason for this change.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!showHistory && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-end gap-3 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:text-gray-900 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSaving || projectedBalance < 0 || !reason.trim()}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Apply Adjustment
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
