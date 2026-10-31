import { Upload, UserPlus, Search, FileText, BarChart3, Settings, Zap, Clock } from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  icon: any;
  shortcut?: string;
  onClick: () => void;
  color: string;
  description: string;
}

interface QuickActionsProps {
  isOpen: boolean;
  onClose: () => void;
  actions: QuickAction[];
}

export default function QuickActions({ isOpen, onClose, actions }: QuickActionsProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Quick Actions Panel */}
      <div className="fixed inset-x-0 top-20 z-50 flex justify-center px-4">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-7rem)] flex flex-col overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-gray-800" />
                <h2 className="text-gray-900">Quick Actions</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="tf-meta">Press ESC to close</span>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          {/* Actions Grid */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-3">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => {
                      action.onClick();
                      onClose();
                    }}
                    className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-left group"
                  >
                    <div className={`p-2 rounded-lg ${action.color} group-hover:scale-110 transition-transform`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-900">{action.label}</span>
                        {action.shortcut && (
                          <span className="tf-meta bg-gray-100 px-2 py-0.5 rounded">
                            {action.shortcut}
                          </span>
                        )}
                      </div>
                      <p className="tf-meta-strong">{action.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recently Used */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 tf-meta-strong">
              <Clock className="w-3.5 h-3.5" />
              <span>Tip: Use keyboard shortcuts for faster access</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
