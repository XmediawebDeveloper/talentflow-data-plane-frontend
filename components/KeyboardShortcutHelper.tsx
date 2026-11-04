import { useState } from 'react';
import { Command, X } from 'lucide-react';
import { useKeyboardShortcutSingle } from '@/lib/hooks/useKeyboardShortcut';

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const shortcuts: Shortcut[] = [
  // Navigation
  { keys: ['Cmd/Ctrl', 'D'], description: 'Go to Dashboard', category: 'Navigation' },
  { keys: ['Cmd/Ctrl', 'J'], description: 'Go to Job Descriptions', category: 'Navigation' },
  { keys: ['Cmd/Ctrl', 'R'], description: 'Go to Resume Database', category: 'Navigation' },
  { keys: ['Cmd/Ctrl', 'A'], description: 'Go to Assessments', category: 'Navigation' },
  
  // Actions
  { keys: ['Cmd/Ctrl', 'N'], description: 'Create New (context-aware)', category: 'Actions' },
  { keys: ['Cmd/Ctrl', 'K'], description: 'Focus Search', category: 'Actions' },
  { keys: ['Cmd/Ctrl', 'U'], description: 'Upload Resume', category: 'Actions' },
  { keys: ['Cmd/Ctrl', 'F'], description: 'Toggle Filters', category: 'Actions' },
  
  // General
  { keys: ['Esc'], description: 'Close Modal/Dialog', category: 'General' },
  { keys: ['Cmd/Ctrl', '/'], description: 'Show Keyboard Shortcuts', category: 'General' },
  { keys: ['Cmd/Ctrl', 'S'], description: 'Save (in forms)', category: 'General' },
];

interface KeyboardShortcutHelperProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutHelper({ isOpen, onClose }: KeyboardShortcutHelperProps) {
  // Register shortcut to toggle helper - still listen to keyboard
  useKeyboardShortcutSingle('/', () => {
    // This will be handled by parent now
  }, { ctrl: true });
  useKeyboardShortcutSingle('Escape', () => {
    if (isOpen) onClose();
  });

  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  return (
    <>
      {/* Modal */}
      {isOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 animate-in fade-in duration-200"
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-[95vw] sm:max-w-2xl w-full max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-200 flex flex-col">
              {/* Header */}
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <Command className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl text-white font-semibold">Keyboard Shortcuts</h2>
                    <p className="text-sm text-gray-100">Boost your productivity</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
                 aria-label="Close">
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(80dvh-100px)]">
                {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
                  <div key={category} className="mb-6 last:mb-0">
                    <h3 className="tf-row-title mb-3 uppercase tracking-wider">
                      {category}
                    </h3>
                    <div className="space-y-2">
                      {categoryShortcuts.map((shortcut, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <span className="tf-body">{shortcut.description}</span>
                          <div className="flex items-center gap-1">
                            {shortcut.keys.map((key, keyIndex) => (
                              <div key={keyIndex} className="flex items-center gap-1">
                                <kbd className="px-2.5 py-1 tf-caption bg-gray-100 border border-gray-300 rounded-md shadow-sm min-w-[2rem] text-center">
                                  {key}
                                </kbd>
                                {keyIndex < shortcut.keys.length - 1 && (
                                  <span className="tf-hint">+</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                <p className="tf-meta text-center">
                  Press <kbd className="px-2 py-0.5 tf-caption bg-white border border-gray-300 rounded shadow-sm">Esc</kbd> to close
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Export function to open shortcuts from outside
export function useKeyboardShortcutModal() {
  const [isOpen, setIsOpen] = useState(false);
  return { isOpen, openShortcuts: () => setIsOpen(true), closeShortcuts: () => setIsOpen(false) };
}