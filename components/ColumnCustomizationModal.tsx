import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ModalA11y } from '@/components/ui/modal-a11y';

interface ColumnOption {
  id: string;
  label: string;
  enabled: boolean;
  /** Always shown — rendered ticked and disabled, so the table keeps its
   *  identifying columns (e.g. Candidate, Score). */
  locked?: boolean;
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
        col.id === id && !col.locked ? { ...col, enabled: !col.enabled } : col
      )
    );
  };

  const handleApply = () => {
    const enabled = selectedColumns.filter(col => col.enabled || col.locked).map(col => col.id);
    onApply(enabled);
    onClose();
  };

  const enabledCount = selectedColumns.filter(col => col.enabled || col.locked).length;

  return (
    <ModalA11y><div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center p-4 sm:p-5 border-b border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 flex-shrink-0">
          <div>
            <h2 className="tf-section-title sm:text-lg">Customize Columns</h2>
            <p className="tf-body-secondary mt-0.5">
              {enabledCount} of {selectedColumns.length} columns selected
            </p>
          </div>
        </div>

        {/* Column List */}
        <div className="p-4 sm:p-6 max-h-96 overflow-y-auto flex-1">
          <div className="space-y-1">
            {selectedColumns.map((column) => (
              <label
                key={column.id}
                className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                  column.locked ? 'cursor-not-allowed opacity-70' : 'hover:bg-brand-blue/5 cursor-pointer'
                }`}
                title={column.locked ? 'This column is always shown' : undefined}
              >
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={column.locked || column.enabled}
                    disabled={column.locked}
                    onChange={() => toggleColumn(column.id)}
                    className="tf-checkbox accent-brand-blue focus:ring-2 focus:ring-brand-blue/40"
                  />
                </div>
                <span className="tf-body">{column.label}</span>
                {column.locked && <span className="tf-meta ml-auto">Always shown</span>}
              </label>
            ))}
          </div>
        </div>

        {/* Footer — Cancel (drops the unsaved picks), then Apply Changes,
            bottom-right. */}
        <div className="flex flex-wrap items-center justify-end gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 flex-shrink-0">
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={handleApply} disabled={enabledCount === 0}>
            Apply Changes
          </Button>
        </div>
      </div>
    </div></ModalA11y>
  );
}
