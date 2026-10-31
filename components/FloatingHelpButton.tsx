import { HelpCircle, MessageSquare, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import SupportTicketPanel from './SupportTicketPanel';

interface FloatingHelpButtonProps {
  onNavigateToSupport: () => void;
}

export default function FloatingHelpButton({ onNavigateToSupport }: FloatingHelpButtonProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-30">
        {/* Menu */}
        {showMenu && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowMenu(false)}
            />
            
            {/* Menu Options */}
            <div className="absolute bottom-16 right-0 bg-white rounded-lg shadow-xl border border-gray-200 py-2 w-56 max-w-[calc(100vw-3rem)] max-h-[70dvh] overflow-y-auto z-50">
              <button
                onClick={() => {
                  setShowMenu(false);
                  setIsPanelOpen(true);
                }}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3"
              >
                <MessageSquare className="w-5 h-5 text-gray-800" />
                <div>
                  <div className="text-sm text-gray-900">Quick Support</div>
                  <div className="tf-meta">Open support panel</div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  setShowMenu(false);
                  onNavigateToSupport();
                }}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3"
              >
                <ExternalLink className="w-5 h-5 text-gray-800" />
                <div>
                  <div className="text-sm text-gray-900">Support Center</div>
                  <div className="tf-meta">Go to full page</div>
                </div>
              </button>
            </div>
          </>
        )}

        {/* Main Button — aria-label only, no native `title`: the styled bubble
            below is the visible tooltip, and a `title` drew a second one on top
            of it with the same text. */}
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="w-14 h-14 bg-gray-800 text-white rounded-full shadow-lg hover:bg-gray-900 hover:shadow-xl transition-all flex items-center justify-center group relative"
          aria-label="Get Help & Support"
        >
          <HelpCircle className="w-6 h-6" />
          
          {/* Tooltip (only when menu is closed) */}
          {!showMenu && (
            <div className="absolute right-full mr-3 px-3 py-2 bg-gray-700 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Get Help & Support
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full border-4 border-transparent border-l-gray-700"></div>
            </div>
          )}
        </button>
      </div>

      {/* Support Panel */}
      <SupportTicketPanel 
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
      />
    </>
  );
}