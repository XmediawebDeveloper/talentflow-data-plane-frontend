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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-gray-900">Customize Columns</h2>
            <p className="text-sm text-gray-600 mt-1">
              {enabledCount} of {selectedColumns.length} columns selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Column List */}
        <div className="p-6 max-h-96 overflow-y-auto">
          <div className="space-y-2">
            {selectedColumns.map((column) => (
              <label
                key={column.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={column.enabled}
                    onChange={() => toggleColumn(column.id)}
                    className="w-5 h-5 text-gray-800 rounded border-gray-300 focus:ring-2 focus:ring-gray-600"
                  />
                  {column.enabled && (
                    <Check className="w-3 h-3 text-white absolute top-1 left-1 pointer-events-none" />
                  )}
                </div>
                <span className="text-sm text-gray-900">{column.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={enabledCount === 0}
            className="px-6 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
