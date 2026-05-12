import { X, Check } from 'lucide-react';
import { useState } from 'react';

interface ColumnOption {
  id: string;
  label: string;
  enabled: boolean;
}

interface ColumnCustomizationModalProps {
  columns: ColumnOption[];
  onClose: () => void;
  onApply: (selectedColumns: string[]) => void;
}

export default function ColumnCustomizationModal({ columns, onClose, onApply }: ColumnCustomizationModalProps) {
  const [selectedColumns, setSelectedColumns] = useState<ColumnOption[]>(columns);

  const toggleColumn = (id: string) => {
    setSelectedColumns(prev =>
      prev.map(col =>
        col.id === id ? { ...col, enabled: !col.enabled } : col
      )
    );
  };

  const handleApply = () => {
    const enabled = selectedColumns.filter(col => col.enabled).map(col => col.id);
    onApply(enabled);
    onClose();
  };

  const enabledCount = selectedColumns.filter(col => col.enabled).length;

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 bg-slate-50 flex-shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Customize Columns</h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
              {enabledCount} of {selectedColumns.length} columns selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-brand-blue rounded-lg hover:bg-brand-blue/5 transition-colors"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Column List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-1">
            {selectedColumns.map((column) => (
              <label
                key={column.id}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-brand-blue/5 cursor-pointer transition-colors"
              >
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={column.enabled}
                    onChange={() => toggleColumn(column.id)}
                    className="w-4 h-4 accent-brand-blue rounded focus:ring-2 focus:ring-brand-blue/40"
                  />
                </div>
                <span className="text-sm text-gray-900">{column.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 bg-slate-50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-white border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={enabledCount === 0}
            className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
