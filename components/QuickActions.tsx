'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, FilePlus2, HelpCircle, History, Lock, Upload, Video, type LucideIcon } from 'lucide-react';
import { ZapAnimatedIcon } from '@/components/icons/HeaderAnimatedIcons';
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
  {
    id: 'usage-history',
    label: 'Usage History',
    description: 'Units used across the organisation',
    icon: History,
    href: () => '/organization/usage-history',
    // Account owner only (routeAccess adminOnly) — no permission opens it, so
    // everyone else sees the tile locked.
    permissions: [],
  },
  {
    id: 'support-tickets',
    label: 'Support Tickets',
    description: 'Help & support requests',
    icon: HelpCircle,
    href: () => '/support-tickets',
    permissions: ['canViewSupport'],
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
          data-active={open || undefined}
          className={`tf-hbtn relative p-1.5 sm:p-2 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/25 ${
            open ? 'bg-brand-blue/5 text-brand-blue' : 'text-gray-500'
          }`}
          aria-label="Quick actions"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <ZapAnimatedIcon className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </Tooltip>

      {open && (
        <>
          {/* Same z-band as the other header dropdowns (see the plan menu). */}
          <div className="fixed inset-0 z-[80]" onClick={() => onOpenChange(false)} />
          {/* Compact grid: icon over title, four per row (the description,
              or the lock reason, is the tile's tooltip). The whole box pops
              out of the bolt — scales up from its top-right corner
              (tailwindcss-animate utilities). */}
          <div
            ref={panelRef}
            role="menu"
            aria-label="Quick actions"
            /* Phones: a compact box centred under the header (the bolt sits
               too far left for a box anchored to it) — fixed width, centred by
               left-3 right-3 + mx-auto, so it never stretches across a wide
               phone. md+: anchored to the bolt. */
            className="animate-in fade-in zoom-in-90 slide-in-from-top-1 duration-200 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:animate-none origin-top md:origin-top-right fixed left-3 right-3 mx-auto w-[21rem] max-w-[calc(100vw-1.5rem)] top-[4.25rem] md:absolute md:left-auto md:right-0 md:mx-0 md:top-full md:mt-2 md:w-[24rem] max-h-[calc(100dvh-5rem)] overflow-y-auto p-1.5 md:p-2 grid grid-cols-4 gap-0.5 md:gap-1 bg-white dark:bg-slate-900 rounded-xl shadow-xl shadow-slate-900/10 ring-1 ring-gray-200/80 dark:ring-slate-700 z-[85]"
          >
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
                  title={reason ?? action.description}
                  className={`relative flex flex-col items-center justify-start gap-1 md:gap-1.5 px-1 md:px-1.5 pt-2 pb-1.5 md:pt-3 md:pb-2.5 rounded-lg text-center text-xs font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:bg-brand-blue/[0.1] dark:focus-visible:bg-blue-400/15 ${
                    locked
                      ? 'text-gray-400 dark:text-slate-500 cursor-not-allowed'
                      : 'group text-gray-700 dark:text-slate-200 hover:bg-brand-blue/[0.1] hover:text-brand-blue dark:hover:bg-blue-400/15 dark:hover:text-blue-300'
                  }`}
                >
                  <span className={`flex h-8 w-8 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    locked
                      ? 'bg-gray-100 dark:bg-slate-800'
                      : 'bg-brand-blue/10 text-brand-blue dark:bg-blue-400/15 dark:text-blue-300 group-hover:bg-brand-blue group-hover:text-white dark:group-hover:bg-blue-400 dark:group-hover:text-slate-900'
                  }`}>
                    <Icon className="w-[18px] h-[18px]" />
                  </span>
                  <span className="line-clamp-2">{action.label}</span>
                  {locked && <Lock className="absolute top-1.5 right-1.5 w-3 h-3" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
