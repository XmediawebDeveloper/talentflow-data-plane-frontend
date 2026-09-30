'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';

interface Props {
  onExportCsv: () => void;
  onExportXlsx: () => void | Promise<void>;
  /** "dark" fits the Coverage hero (white-on-dark); "light" fits white panels. */
  variant?: 'dark' | 'light';
  label?: string;
}

export function ExportMenu({ onExportCsv, onExportXlsx, variant = 'light', label = 'Export' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const buttonCls =
    variant === 'dark'
      ? 'bg-white/10 hover:bg-white/20 border border-white/15 text-white'
      : 'bg-gray-900 hover:bg-gray-800 text-white';

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${buttonCls}`}
      >
        <Download className="w-3.5 h-3.5" />
        {label}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-40 max-w-[calc(100vw-1.5rem)] bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          <button
            type="button"
            onClick={() => { setOpen(false); onExportCsv(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
          >
            <FileText className="w-3.5 h-3.5 text-gray-500" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); Promise.resolve(onExportXlsx()); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            XLSX
          </button>
        </div>
      )}
    </div>
  );
}
