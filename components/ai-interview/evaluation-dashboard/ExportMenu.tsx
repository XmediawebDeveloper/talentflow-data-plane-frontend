'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import ExportFormatModal, { type ExportFileFormat } from '@/components/ExportFormatModal';

interface Props {
  /** Writes the file in the format picked in the CSV / Excel popup. */
  onExport: (format: ExportFileFormat) => void | Promise<void>;
  /** "dark" fits the Coverage hero (white-on-dark); "light" fits white panels. */
  variant?: 'dark' | 'light';
  label?: string;
  /** Popup heading, row count and column list. */
  title?: string;
  recordCount?: number;
  columns?: string[];
}

export function ExportMenu({ onExport, variant = 'light', label = 'Export', title, recordCount, columns }: Props) {
  const [open, setOpen] = useState(false);

  const buttonCls =
    variant === 'dark'
      ? 'bg-white/10 hover:bg-white/20 border border-white/15 text-white'
      : 'bg-gray-900 hover:bg-gray-800 text-white';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${buttonCls}`}
      >
        <Download className="w-3.5 h-3.5" />
        {label}
      </button>
      <ExportFormatModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        recordCount={recordCount}
        columns={columns}
        onExport={onExport}
      />
    </>
  );
}
