'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ClipboardList, FilePlus2, Lock, Upload, Video, Zap, type LucideIcon } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { ResumeScoringIcon, TalentMatchIcon } from '@/components/icons/nav-icons';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { isRouteAuthorized } from '@/lib/navigation/routeAccess';
import { PLAN_LOCKED_MESSAGE, type PlanFeatureKey } from '@/lib/types/planFeatures';
import { PERMISSION_DENIED_MESSAGE } from '@/components/shared/PermissionLockedOverlay';

/* Header "Quick actions" (UI/UX guidelines §1: the fixed top header carries
   Profile, Notifications, Plan status and Quick actions).

   One click from any page to the start of the main recruiter workflows. Each
   row is gated the same way the dashboard tiles are: a missing permission or a
   plan that lacks the feature keeps the row visible but locked, with the reason
   on hover — never hidden (same rule as the profile menu and nav tiles). */

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon | typeof ResumeScoringIcon;
  /** Built per click so jd-creation gets a fresh `?new=` (see job-openings). */
  href: () => string;
  /** The action's own permission — must hold at least one. */
  permissions: string[];
  planFeature?: PlanFeatureKey;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'create-jd',
    label: 'Create JD',
    description: 'Write or generate a job description',
    icon: FilePlus2,
    // The jd-creation segment is cached by the App Router; a unique `new`
    // forces a blank form instead of reusing an in-progress one.
    href: () => `/recruitment/jd-creation?new=${Date.now()}`,
    permissions: ['canCreateJD'],
  },
  {
    id: 'upload-resumes',
    label: 'Upload Resumes',
    description: 'Add resumes to My Resumes',
    icon: Upload,
    href: () => '/recruitment/resume-database?tab=my-resumes&upload=1',
    permissions: ['canUploadResumes'],
    planFeature: 'resume_upload',
  },
  {
    id: 'score-resumes',
    label: 'Score Resumes',
    description: 'Pick a JD and score resumes against it',
    icon: ResumeScoringIcon,
    href: () => '/recruitment/resume-scoring/jd-selection',
    permissions: ['canRunScoring'],
    planFeature: 'resume_scoring',
  },
  {
    id: 'ai-talent-match',
    label: 'AI Talent Match',
    description: 'Find the best candidates for a JD',
    icon: TalentMatchIcon,
    href: () => '/recruitment/ai-talent-match',
    permissions: ['canRunAiMatch'],
    planFeature: 'ai_talent_match',
  },
  {
    id: 'create-assessment',
    label: 'Create Assessment',
    description: 'Build an AI assessment for a JD',
    icon: ClipboardList,
    href: () => '/recruitment/assessments/create',
    permissions: ['canCreateAssessments'],
    planFeature: 'assessment',
  },
  {
    id: 'create-ai-interview',
    label: 'Create AI Interview',
    description: 'Set up an AI interview for a JD',
    icon: Video,
    href: () => '/recruitment/ai-interviews/jd-selection',
    permissions: ['canCreateAIInterviews', 'canRunAiInterviews'],
    planFeature: 'ai_interview',
  },
];

const SUBSCRIPTION_LOCKED_MESSAGE = 'Your subscription is inactive. Renew your plan to use this.';

interface QuickActionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionExpired?: boolean;
}

export default function QuickActions({ open, onOpenChange, subscriptionExpired }: QuickActionsProps) {
  const router = useRouter();
  const { isTenantAdmin, hasPermission } = useAuth();
  const { hasPlanFeature, loading: planLoading } = usePlanFeatures();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ESC closes and hands focus back to the trigger; opening moves focus into
  // the panel so the rows are reachable straight from the keyboard (§14).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const lockReason = (action: QuickAction): string | null => {
    if (subscriptionExpired) return SUBSCRIPTION_LOCKED_MESSAGE;
    if (action.planFeature) {
      if (planLoading) return 'Checking your plan…';
      if (!hasPlanFeature(action.planFeature)) return PLAN_LOCKED_MESSAGE;
    }
    const permitted =
      isTenantAdmin ||
      (action.permissions.some(hasPermission) &&
        isRouteAuthorized(action.href().split('?')[0], { isTenantAdmin, hasPermission }));
    return permitted ? null : PERMISSION_DENIED_MESSAGE;
  };

  return (
    <div className="relative">
      <Tooltip content="Quick actions" position="bottom">
        <button
          ref={triggerRef}
          onClick={() => onOpenChange(!open)}
          className="relative p-1.5 sm:p-2 text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/25"
          aria-label="Quick actions"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </Tooltip>

      {open && (
        <>
          {/* Same z-band as the other header dropdowns (see the plan menu). */}
          <div className="fixed inset-0 z-[80]" onClick={() => onOpenChange(false)} />
          {/* Phones: full-width sheet under the header. md+: anchored to the bolt. */}
          <div
            ref={panelRef}
            role="menu"
            aria-label="Quick actions"
            className="fixed left-3 right-3 top-[4.25rem] md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-[340px] max-h-[calc(100dvh-5rem)] overflow-y-auto bg-white rounded-xl shadow-xl border border-gray-200 z-[85]"
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand-blue" />
              <span className="tf-row-name">Quick actions</span>
            </div>
            <div className="divide-y divide-gray-100">
              {QUICK_ACTIONS.map((action) => {
                const reason = lockReason(action);
                const locked = reason !== null;
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    role="menuitem"
                    onClick={() => {
                      if (locked) return;
                      onOpenChange(false);
                      router.push(action.href());
                    }}
                    aria-disabled={locked}
                    title={reason ?? undefined}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-2.5 transition-colors focus-visible:outline-none focus-visible:bg-brand-blue/[0.06] ${
                      locked ? 'opacity-60 cursor-not-allowed' : 'group hover:bg-brand-blue/[0.04]'
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 transition-colors group-hover:bg-brand-blue/15">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block tf-row-name truncate">{action.label}</span>
                      <span className="block tf-meta truncate">{locked ? reason : action.description}</span>
                    </span>
                    {locked ? (
                      <Lock className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-300 transition-colors group-hover:text-brand-blue" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
