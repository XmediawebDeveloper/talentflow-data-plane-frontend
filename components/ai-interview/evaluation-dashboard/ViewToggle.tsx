import { BarChart3, Clock, Table2 } from 'lucide-react';

export type ViewMode = 'analysis' | 'timeline' | 'table';

interface ViewToggleProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}

const TABS: Array<{ id: ViewMode; label: string; icon: any }> = [
  { id: 'analysis', label: 'Analysis', icon: BarChart3 },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'table',    label: 'Table',    icon: Table2 },
];

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className="tf-card-soft inline-flex p-1">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-5 py-2.5 rounded-md flex items-center gap-2 transition-all ${
            view === id
              ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Icon size={16} />
          <span className="text-sm font-medium">{label}</span>
        </button>
      ))}
    </div>
  );
}
