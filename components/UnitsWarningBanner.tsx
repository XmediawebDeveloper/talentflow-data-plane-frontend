import { AlertCircle, TrendingUp } from 'lucide-react';
import { Tenant, getRemainingUnits } from '@/lib/types/tenant';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface UnitsWarningBannerProps {
  tenant: Tenant;
  onUpgrade: () => void;
}

export default function UnitsWarningBanner({ tenant, onUpgrade }: UnitsWarningBannerProps) {
  const { subscription } = tenant;
  
  // Check if any units are running low (< 20% remaining)
  const warnings: Array<{ type: string; remaining: number | 'unlimited'; total: number | 'unlimited'; percentage: number }> = [];
  
  const checkUnit = (type: 'resumeUploads' | 'jobPostings' | 'assessments' | 'aiInterviews', label: string) => {
    const remaining = getRemainingUnits(type, subscription);
    const total = subscription.limits[type];
    
    if (remaining === 'unlimited' || total === 'unlimited') return;
    
    const percentage = (remaining / (total as number)) * 100;
    
    if (percentage < 20 && percentage > 0) {
      warnings.push({ type: label, remaining, total, percentage });
    } else if (remaining === 0) {
      warnings.push({ type: label, remaining, total, percentage: 0 });
    }
  };
  
  checkUnit('resumeUploads', 'Resume Storage');
  checkUnit('jobPostings', 'Job Postings');
  checkUnit('assessments', 'Assessments');
  checkUnit('aiInterviews', 'AI Interviews');
  
  // Don't show banner if no warnings
  if (warnings.length === 0) return null;
  
  const depleted = warnings.filter(w => w.remaining === 0);
  const low = warnings.filter(w => w.remaining !== 0);
  
  return (
    <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-yellow-900 mb-2 flex items-center gap-2">
            {depleted.length > 0 ? 'Units Depleted' : 'Units Running Low'}
          </h3>
          
          {depleted.length > 0 && (
            <div className="mb-3">
              <p className="text-sm text-yellow-800 mb-2">
                You've used all available units for:
              </p>
              <ul className="space-y-1">
                {depleted.map((warning, idx) => (
                  <li key={idx} className="text-sm text-yellow-700 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                    <strong>{warning.type}:</strong> {warning.total} / {warning.total} used (0 remaining)
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {low.length > 0 && (
            <div className={depleted.length > 0 ? 'mb-3' : 'mb-2'}>
              <p className="text-sm text-yellow-800 mb-2">
                {depleted.length > 0 ? 'Also running low:' : 'Your units are running low:'}
              </p>
              <ul className="space-y-1">
                {low.map((warning, idx) => (
                  <li key={idx} className="text-sm text-yellow-700 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-yellow-600 rounded-full"></span>
                    <strong>{warning.type}:</strong> {warning.remaining} of {warning.total} remaining ({Math.round(warning.percentage)}%)
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={onUpgrade}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              Upgrade Plan
            </button>
            <p className="text-xs text-yellow-700">
              Renews on {formatISTDate(subscription.renewalDate)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
