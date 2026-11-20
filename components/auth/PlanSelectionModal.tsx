'use client';

// Plan data, prices, quota rows and the billing toggle all come from the shared
// marketing modules the pricing page (app/(marketing)/pricing/page.tsx) uses,
// so this picker and the pricing page always show the same plans and numbers.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useModalA11y } from '@/components/ui/modal-a11y';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowRight, ArrowUpRight, Building2, Check, Gift, LayoutGrid, Rocket, TrendingUp, X,
  type LucideIcon,
} from 'lucide-react';
import { gsap, useGSAP, withMotion } from '@/lib/gsap';
import { encodePlanId } from '@/lib/utils/planEncoder';
import { BillingToggle } from '@/components/marketing/BillingToggle';
import { display, DISPLAY } from '@/components/marketing/fonts';
import {
  ACTIVE_PILL,
  ACTIVE_PILL_COUNT,
  ACTIVE_PILL_TEXT,
  BILLING_TOGGLE_TONE,
  placeTabPill,
  TAB_PILL_CLASS,
  TAB_SWAP_CLASS,
  TAB_SWAP_CSS,
  tabSwapDelay,
} from '@/components/marketing/pillTone';
import {
  fetchMarketingPlans,
  planCheckoutTarget,
  planPrice,
  planQuotaRows,
  type MarketingPlan,
} from '@/components/marketing/plans';
import { IconButton } from '@/components/ui/icon-button';

interface PlanSelectionModalProps {
  isOpen: boolean;
  onPlanSelected: (planParam: string, billingInterval?: 'MONTHLY' | 'ANNUAL') => void;
  onClose?: () => void;
}

/* ------------------------------------------------------------------ *
 * Plan types: one tab per tier, same names and colours as the pricing page.
 * ------------------------------------------------------------------ */

interface GroupMeta {
  label: string;
  blurb: string;
  icon: LucideIcon;
  tone: string;
}

const TIER_META: Record<string, GroupMeta> = {
  trial: {
    label: 'Free Trial',
    blurb: 'Try the full platform first. No credit card required.',
    icon: Gift,
    tone: 'bg-mkt-amber/15 text-mkt-amber-ink',
  },
  STARTER: {
    label: 'Starter',
    blurb: 'Get going with the essentials.',
    icon: Rocket,
    tone: 'bg-mkt-cyan/15 text-mkt-cyan-ink',
  },
  PROFESSIONAL: {
    label: 'Professional',
    blurb: 'More room as your hiring grows.',
    icon: TrendingUp,
    tone: 'bg-mkt-accent-solid/10 text-mkt-accent',
  },
  ENTERPRISE: {
    label: 'Enterprise',
    blurb: 'For large hiring teams, with API access.',
    icon: Building2,
    tone: 'bg-slate-900/[0.07] text-mkt-ink dark:bg-white/10',
  },
};

const TIER_ORDER = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

function metaFor(tier: string): GroupMeta {
  return (
    TIER_META[tier] ?? {
      label: tier.charAt(0) + tier.slice(1).toLowerCase(),
      blurb: 'More ways to buy TalentFlow.',
      icon: LayoutGrid,
      tone: 'bg-slate-900/[0.07] text-mkt-ink dark:bg-white/10',
    }
  );
}

const tierOf = (plan: MarketingPlan) => (plan.isTrial ? 'trial' : (plan.tier || 'OTHER').toUpperCase());

const VISIBLE_FEATURES = 4;

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */

function SelectablePlanCard({
  plan,
  index,
  isYearly,
  selected,
  wide,
  onSelect,
}: {
  plan: MarketingPlan;
  /** Position in the grid; staggers the drift-in. */
  index: number;
  isYearly: boolean;
  selected: boolean;
  /** The only plan in its tab: laid out across the full width. */
  wide: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);
  const checkRef = useRef<HTMLSpanElement>(null);
  const featuresRef = useRef<HTMLUListElement>(null);
  const seen = useRef({ price: false, selected: false, expanded: false });

  // Price rolls when the billing period changes, as on the pricing page.
  useGSAP(
    () => {
      if (!seen.current.price) {
        seen.current.price = true;
        return;
      }
      withMotion(() => {
        gsap.fromTo(
          priceRef.current!.children,
          { yPercent: 40, autoAlpha: 0 },
          { yPercent: 0, autoAlpha: 1, duration: 0.45, stagger: 0.05, ease: 'power3.out' }
        );
      });
    },
    { dependencies: [isYearly] }
  );

  // Picking a card: the check pops in and the card gives a small press-and-settle.
  useGSAP(
    () => {
      if (!seen.current.selected) {
        seen.current.selected = true;
        return;
      }
      if (!selected) return;
      withMotion(() => {
        gsap.fromTo(checkRef.current, { scale: 0.4, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.3, ease: 'power2.out' });
        gsap.fromTo(cardRef.current, { scale: 0.985 }, { scale: 1, duration: 0.3, ease: 'power2.out', clearProps: 'transform' });
      });
    },
    { dependencies: [selected] }
  );

  // Extra features slide in when the list opens.
  useGSAP(
    () => {
      if (!seen.current.expanded) {
        seen.current.expanded = true;
        return;
      }
      if (!expanded) return;
      const extra = Array.from(featuresRef.current?.children ?? []).slice(VISIBLE_FEATURES);
      withMotion(() => {
        gsap.fromTo(extra, { x: -10, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.35, stagger: 0.04, ease: 'power2.out' });
      });
    },
    { dependencies: [expanded] }
  );

  const price = planPrice(plan, isYearly);
  const quotas = planQuotaRows(plan, isYearly);
  const shownFeatures = expanded ? plan.features : plan.features.slice(0, VISIBLE_FEATURES);
  const hiddenCount = plan.features.length - shownFeatures.length;
  const label = plan.isTrial ? 'Free trial' : plan.featured ? 'Recommended' : plan.tier || null;

  const labelTone = plan.isTrial
    ? 'bg-mkt-amber/15 text-mkt-amber-ink'
    : plan.featured
      ? 'bg-mkt-accent-solid/10 text-mkt-accent'
      : 'bg-slate-900/[0.05] text-slate-600 dark:bg-white/10 dark:text-slate-300';

  /* ---- Shared pieces ---- */

  // Label pill + radio: fixed height so names and prices line up across cards.
  const topRow = (
    <div className="flex h-6 items-center justify-between gap-3">
      {label && label.toLowerCase() !== plan.name.toLowerCase() ? (
        <span className={`inline-block truncate rounded-full px-2.5 py-0.5 text-xs font-semibold first-letter:uppercase ${labelTone}`}>
          {label.toLowerCase()}
        </span>
      ) : (
        <span />
      )}
      <span
        aria-hidden="true"
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color] duration-300 ${
          selected
            ? 'border-mkt-accent-solid bg-mkt-accent-solid text-white'
            : 'border-slate-900/20 bg-transparent text-transparent group-hover/card:border-slate-900/40 dark:border-white/25 dark:group-hover/card:border-white/45'
        }`}
      >
        <span ref={checkRef} className="grid place-items-center">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      </span>
    </div>
  );

  const priceBlock = (big: boolean) => (
    <div ref={priceRef} className={`overflow-hidden ${big ? 'mt-6 sm:mt-8' : 'mt-4 sm:mt-5'}`}>
      <p
        className={`${DISPLAY} flex flex-wrap items-baseline gap-x-1.5 font-extrabold leading-none tracking-[-0.03em] tabular-nums text-mkt-ink ${
          big ? 'text-[2.25rem] sm:text-[2.75rem]' : 'text-[1.75rem] sm:text-[2rem]'
        }`}
      >
        {price.amount}
        {price.period && <span className="text-sm font-medium tracking-normal text-slate-500 dark:text-slate-400">{price.period}</span>}
      </p>
      <div className="mt-2 min-h-5">
        {price.wasAmount ? (
          <p className="flex items-center gap-2 text-sm">
            <span className="tabular-nums text-slate-500 line-through dark:text-slate-400">{price.wasAmount}</span>
            {price.savePercent !== null && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Save {price.savePercent}%
              </span>
            )}
          </p>
        ) : price.unavailableNote ? (
          <p className="text-sm text-mkt-amber-ink">{price.unavailableNote}</p>
        ) : null}
      </div>
    </div>
  );

  const cardRoot = (children: ReactNode) => (
    <div
      ref={cardRef}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      data-plan-card
      style={{ animationDelay: tabSwapDelay(index) }}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`${TAB_SWAP_CLASS} group/card relative h-full cursor-pointer rounded-[20px] border text-left transition-[translate,box-shadow,border-color,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid focus-visible:ring-offset-2 focus-visible:ring-offset-mkt-canvas ${
        selected
          ? 'border-mkt-accent-solid bg-mkt-surface shadow-[0_24px_48px_-28px_rgba(15,60,153,0.55)] ring-4 ring-mkt-accent-solid/15'
          : 'border-slate-900/[0.08] bg-mkt-surface hover:-translate-y-1 hover:shadow-[0_24px_48px_-30px_rgba(15,60,153,0.45)] dark:border-white/10'
      } ${wide ? 'overflow-hidden' : 'flex flex-col p-5 sm:p-6'}`}
    >
      {children}
    </div>
  );

  /* ---- Only plan in its tab: a two-panel card across the full width ---- */
  if (wide) {
    return cardRoot(
      <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.55fr)]">
        {/* Identity + price, on a soft brand wash */}
        <div className="flex flex-col border-b border-slate-900/[0.07] bg-[linear-gradient(160deg,var(--raw-rgba-15-60-153-0p07),transparent_75%)] p-6 dark:border-white/10 dark:bg-[linear-gradient(160deg,var(--raw-rgba-123-164-255-0p12),transparent_75%)] sm:p-8 lg:border-b-0 lg:border-r">
          {topRow}
          <h4 className={`${DISPLAY} mt-4 text-xl font-extrabold tracking-[-0.025em] text-mkt-ink sm:text-2xl`}>{plan.name}</h4>
          {plan.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{plan.description}</p>
          )}
          {priceBlock(true)}
          <div className="flex-grow" />
          {/* Shows the state and that a second click undoes it. Visual only: the whole card is the control. */}
          <span
            aria-hidden="true"
            className={`mt-6 inline-flex h-10 w-fit items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-300 ${
              selected
                ? 'bg-mkt-accent-solid text-white'
                : 'border border-slate-900/15 text-mkt-ink group-hover/card:border-mkt-accent-solid/50 dark:border-white/20'
            }`}
          >
            {selected ? (
              <>
                <Check className="h-4 w-4" strokeWidth={3} />
                Selected
                <span className="font-normal opacity-75">· click to undo</span>
              </>
            ) : (
              'Choose this plan'
            )}
          </span>
        </div>

        {/* Usage + features */}
        <div className="p-6 sm:p-8">
          {quotas.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Included usage</p>
              <dl className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {quotas.map((row) => (
                  <div
                    key={row.label}
                    className="flex flex-col-reverse rounded-xl border border-slate-900/[0.07] bg-mkt-canvas px-3.5 py-3 dark:border-white/10"
                  >
                    <dt className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{row.label}</dt>
                    <dd className={`${DISPLAY} text-lg font-bold tabular-nums tracking-[-0.02em] text-mkt-ink`}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {plan.features.length > 0 && (
            <>
              <p className={`text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 ${quotas.length > 0 ? 'mt-6' : ''}`}>
                What&apos;s included
              </p>
              <ul className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-mkt-cyan" strokeWidth={2.5} />
                    {feature}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ---- Regular card in the grid ---- */
  const quotaList = quotas.length > 0 && (
    <dl className="mt-4 space-y-2 border-y border-slate-900/[0.07] py-3.5 text-[13px] dark:border-white/10 sm:mt-5 sm:text-sm">
      {quotas.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3">
          <dt className="text-slate-500 dark:text-slate-400">{row.label}</dt>
          <dd className="font-semibold tabular-nums text-mkt-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );

  const featureList = plan.features.length > 0 && (
    <div className="mt-4">
      <ul ref={featuresRef} className="space-y-2">
        {shownFeatures.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-[13px] text-slate-600 dark:text-slate-400 sm:text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-mkt-cyan" strokeWidth={2.5} />
            {feature}
          </li>
        ))}
      </ul>
      {(hiddenCount > 0 || (expanded && plan.features.length > VISIBLE_FEATURES)) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((open) => !open);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          aria-expanded={expanded}
          className="mt-2.5 rounded pl-[26px] text-[13px] font-medium text-mkt-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid sm:text-sm"
        >
          {expanded ? 'Show fewer' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'feature' : 'features'}`}
        </button>
      )}
    </div>
  );

  return cardRoot(
    <>
      {topRow}
      <h4 className={`${DISPLAY} mt-3 truncate text-base font-bold tracking-[-0.01em] text-mkt-ink sm:text-lg`}>{plan.name}</h4>
      <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 sm:text-sm">
        {plan.description}
      </p>
      {priceBlock(false)}
      {quotaList}
      {featureList}
    </>
  );
}

/* ------------------------------------------------------------------ */

export default function PlanSelectionModal({ isOpen, onPlanSelected, onClose }: PlanSelectionModalProps) {
  const router = useRouter();
  const [plans, setPlans] = useState<MarketingPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isYearly, setIsYearly] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickedTab, setPickedTab] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  // Tab trap + focus return (a11y §14). Escape and initial focus are this
  // modal's own (see the effect below), so closeOnEscape is off here. The
  // overlay keeps its own ref (GSAP animates it).
  const overlayA11y = useModalA11y({ closeOnEscape: false });
  useLayoutEffect(() => {
    overlayA11y(overlayRef.current);
    return () => overlayA11y(null);
  }, [overlayA11y]);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  const pillPlaced = useRef(false);

  /** Plays the panel out, then runs `done` (close or confirm). */
  const leave = useCallback((done: () => void) => {
    if (leaving.current) return;
    if (reduceMotion() || !panelRef.current) {
      done();
      return;
    }
    leaving.current = true;
    gsap
      .timeline({
        onComplete: () => {
          leaving.current = false;
          done();
        },
      })
      .to(panelRef.current, { y: 28, scale: 0.97, autoAlpha: 0, duration: 0.28, ease: 'power2.in' })
      .to(overlayRef.current, { autoAlpha: 0, duration: 0.22, ease: 'power1.in' }, 0.08);
  }, []);

  const handleClose = useCallback(() => {
    leave(() => {
      if (onClose) onClose();
      else router.push('/pricing');
    });
  }, [leave, onClose, router]);

  useEffect(() => {
    if (!isOpen) return;
    // Loading starts true; a retry resets it in its click handler.
    const controller = new AbortController();
    fetchMarketingPlans(controller.signal)
      .then(({ plans: list }) => {
        setPlans(list);
        // Start on the free trial when there is one: no card needed, lowest friction.
        setSelectedId((current) => current ?? list.find((p) => p.isTrial)?.id ?? null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Error fetching plans:', err);
        setError("We couldn't load the plans. Check your connection and try again.");
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [isOpen, reloadKey]);

  // Escape closes, like every other dialog.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && handleClose();
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  const groups = useMemo(() => {
    const byTier = new Map<string, MarketingPlan[]>();
    for (const plan of plans) {
      const key = tierOf(plan);
      byTier.set(key, [...(byTier.get(key) ?? []), plan]);
    }
    const order = ['trial', ...TIER_ORDER, ...[...byTier.keys()].filter((k) => k !== 'trial' && !TIER_ORDER.includes(k))];
    return order.filter((k) => byTier.has(k)).map((k) => ({ id: k, meta: metaFor(k), plans: byTier.get(k)! }));
  }, [plans]);

  const activeTab = pickedTab && groups.some((g) => g.id === pickedTab) ? pickedTab : groups[0]?.id;
  const activeGroup = groups.find((g) => g.id === activeTab);
  const selectedPlan = plans.find((p) => p.id === selectedId) ?? null;
  const selectedTier = selectedPlan ? tierOf(selectedPlan) : null;
  const savePercent = plans.reduce((best, p) => Math.max(best, Math.round(p.discountPercentage ?? 0)), 0);

  // Entrance: scrim fades, the panel springs up, then the header builds line by line.
  useGSAP(
    () => {
      if (!isOpen) return;
      withMotion(() => {
        gsap
          .timeline()
          .fromTo(overlayRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'power1.out' })
          .fromTo(
            panelRef.current,
            { y: 40, autoAlpha: 0, scale: 0.96 },
            { y: 0, autoAlpha: 1, scale: 1, duration: 0.6, ease: 'power3.out' },
            0.05
          )
          .from(
            panelRef.current!.querySelectorAll('[data-enter]'),
            { y: 18, autoAlpha: 0, duration: 0.55, stagger: 0.07, ease: 'power3.out' },
            0.2
          )
          .from(
            panelRef.current!.querySelectorAll('[data-glow]'),
            { scale: 0.6, autoAlpha: 0, duration: 1.2, ease: 'power2.out' },
            0.1
          );
      });
    },
    { dependencies: [isOpen] }
  );

  // Sliding pill behind the active plan type: the shared CSS glide (pillTone.ts),
  // identical to the pricing page's tabs. JS only measures where it should go.
  useIsoLayoutEffect(() => {
    const bar = tabsRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;
    placeTabPill(bar, pill, pillPlaced.current);
    pillPlaced.current = true;
    // Label widths settle once the display font loads.
    const observer = new ResizeObserver(() => placeTabPill(bar, pill, false));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [activeTab, groups.length]);

  // Footer summary slides in fresh whenever the choice (or its price) changes.
  useGSAP(
    () => {
      if (!summaryRef.current) return;
      withMotion(() => {
        gsap.fromTo(
          summaryRef.current!.children,
          { y: 10, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.05, ease: 'power2.out', overwrite: true }
        );
      });
    },
    { dependencies: [selectedId, isYearly] }
  );

  // The billing toggle and type switcher only mount once plans arrive.
  const hasPlans = plans.length > 0;
  useGSAP(
    () => {
      if (!hasPlans || !panelRef.current) return;
      withMotion(() => {
        gsap.fromTo(
          panelRef.current!.querySelectorAll('[data-enter-late]'),
          { y: 14, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.08, ease: 'power3.out' }
        );
      });
    },
    { dependencies: [hasPlans] }
  );

  /* Switching type happens at once: the pill glides while the new set drifts in
     (CSS, TAB_SWAP_CSS). No exit phase to wait on, so it never feels stepped. */
  const selectTab = (id: string) => {
    if (id === activeTab) return;
    if (contentRef.current) contentRef.current.scrollTop = 0;
    setPickedTab(id);
  };

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedPlan) return;
    if (selectedPlan.isTrial) {
      leave(() => onPlanSelected('free_trial'));
      return;
    }
    const { planId, billing } = planCheckoutTarget(selectedPlan, isYearly);
    leave(() => onPlanSelected(encodePlanId(planId), billing));
  };

  const selectedPrice = selectedPlan ? planPrice(selectedPlan, isYearly) : null;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      /* aria-modal lets the background scroll lock in globals.css see this as a modal. */
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-modal-title"
      className="tf-auth-scope fixed inset-0 z-[9999] flex items-end justify-center bg-mkt-navy/60 backdrop-blur-[6px] sm:items-center sm:p-4 lg:p-6"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`${display.variable} relative flex h-[94dvh] w-full max-w-[1240px] flex-col overflow-hidden rounded-t-[28px] bg-mkt-canvas text-mkt-ink shadow-[0_48px_120px_-40px_rgba(8,19,46,0.7)] outline-none ring-1 ring-slate-900/[0.06] dark:ring-white/10 sm:h-[min(92vh,900px)] sm:rounded-[28px]`}
      >
        <style>{TAB_SWAP_CSS}</style>
        {/* Soft brand glow, as on the landing hero. */}
        <div
          aria-hidden="true"
          data-glow
          className="pointer-events-none absolute -right-40 -top-48 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,var(--raw-rgba-7-156-196-0p16),transparent)] dark:bg-[radial-gradient(closest-side,var(--raw-rgba-76-123-232-0p22),transparent)]"
        />

        {/* ------------------------------------------------ Header */}
        <header className="relative shrink-0 px-5 pt-5 sm:px-8 sm:pt-7 lg:px-10">
          <div data-enter className="flex items-center justify-between gap-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-mkt-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-mkt-cyan" />
              Step 1 · Choose a plan
            </p>
            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/pricing"
                prefetch={false}
                className="hidden items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-mkt-ink dark:text-slate-300 sm:inline-flex"
              >
                Compare on pricing page
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <IconButton bare label="Close and go to the pricing page" tooltip="Close"
                type="button"
                onClick={handleClose}
                className="grid h-10 w-10 place-items-center rounded-full border border-slate-900/[0.08] bg-mkt-surface text-slate-500 transition-[color,border-color,rotate] duration-300 hover:rotate-90 hover:border-slate-900/20 hover:text-mkt-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid dark:border-white/10 dark:text-slate-300"
              >
                <X className="h-[18px] w-[18px]" />
              </IconButton>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-4 sm:mt-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h2
                data-enter
                id="plan-modal-title"
                className={`${DISPLAY} text-[clamp(1.5rem,3.2vw,2.25rem)] font-extrabold leading-[1.08] tracking-[-0.035em] text-mkt-ink`}
              >
                Pick the plan that fits your hiring.
              </h2>
              <p data-enter className="mt-2 text-sm text-slate-600 dark:text-slate-400 sm:text-[15px]">
                Start free, or choose a paid plan. You can upgrade or switch anytime.
              </p>
            </div>
            {plans.length > 0 && (
              <div data-enter-late className="shrink-0">
                <BillingToggle
                  isYearly={isYearly}
                  onChange={setIsYearly}
                  savePercent={savePercent}
                  {...BILLING_TOGGLE_TONE}
                />
              </div>
            )}
          </div>

          {/* Tier tabs */}
          {groups.length > 1 && (
            <div
              // A plain button group (not role="tablist"): globals.css restyles every
              // tab on phones, and this switcher should match the pricing page's.
              role="group"
              aria-label="Plan types"
              data-enter-late
              className="-mx-5 mt-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:mt-6 sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              <div
                ref={tabsRef}
                className="relative inline-flex shrink-0 gap-1 rounded-full border border-slate-900/[0.08] bg-mkt-surface p-1 shadow-[0_12px_32px_-24px_rgba(8,19,46,0.45)] dark:border-white/10"
              >
                <span
                  ref={pillRef}
                  aria-hidden="true"
                  className={`${TAB_PILL_CLASS} pointer-events-none absolute left-0 top-1 h-[calc(100%-0.5rem)] rounded-full opacity-0 ${ACTIVE_PILL}`}
                />
                {groups.map((group) => {
                  const Icon = group.meta.icon;
                  const active = group.id === activeTab;
                  const holdsSelection = group.id === selectedTier;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => selectTab(group.id)}
                      className={`group/tab relative z-10 inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid ${
                        active ? ACTIVE_PILL_TEXT : 'text-slate-600 hover:text-mkt-ink dark:text-slate-400'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {group.meta.label}
                      <span
                        className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                          active ? ACTIVE_PILL_COUNT : 'bg-slate-900/[0.06] dark:bg-white/10'
                        }`}
                      >
                        {group.plans.length}
                      </span>
                      {holdsSelection && !active && (
                        <span aria-label="Contains your selected plan" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-mkt-accent-solid ring-2 ring-mkt-surface" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </header>

        {/* ------------------------------------------------ Plans */}
        {/* scrollbar-gutter: stable reserves the scrollbar's width on every tab, so
            switching between short and long types doesn't shove the cards sideways. */}
        <div ref={contentRef} className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] px-5 pb-6 pt-5 sm:px-8 sm:pt-6 lg:px-10">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading plans">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[420px] animate-pulse rounded-[20px] bg-slate-900/[0.05] dark:bg-white/[0.06]" />
              ))}
            </div>
          ) : error ? (
            <div className="mx-auto flex max-w-md flex-col items-center py-14 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400">
                <AlertCircle className="h-6 w-6" />
              </span>
              <p className="mt-4 text-[15px] text-slate-600 dark:text-slate-300">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setIsLoading(true);
                  setReloadKey((k) => k + 1);
                }}
                className="mt-5 inline-flex h-11 items-center rounded-full bg-mkt-accent-solid px-6 text-sm font-semibold text-white transition-colors hover:bg-mkt-accent-solid-hover"
              >
                Try again
              </button>
            </div>
          ) : activeGroup ? (
            // Keyed so each type mounts fresh nodes, which replays the CSS drift-in.
            <div key={activeGroup.id}>
              <div data-group-head className={`${TAB_SWAP_CLASS} flex items-center gap-3 sm:gap-4`}>
                <span data-group-icon aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11 ${activeGroup.meta.tone}`}>
                  <activeGroup.meta.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className={`${DISPLAY} text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:text-xl`}>{activeGroup.meta.label}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{activeGroup.meta.blurb}</p>
                </div>
                <span data-group-rule aria-hidden="true" className="ml-2 hidden h-px flex-1 origin-left bg-slate-900/[0.08] dark:bg-white/10 sm:block" />
              </div>

              <div
                role="radiogroup"
                aria-label={`${activeGroup.meta.label} plans`}
                className={`mt-5 grid gap-4 ${activeGroup.plans.length === 1 ? '' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}
              >
                {activeGroup.plans.map((plan, index) => (
                  <SelectablePlanCard
                    key={plan.id}
                    index={index}
                    plan={plan}
                    isYearly={isYearly}
                    selected={plan.id === selectedId}
                    wide={activeGroup.plans.length === 1}
                    // Clicking the selected card again clears the choice.
                    onSelect={() => setSelectedId((current) => (current === plan.id ? null : plan.id))}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="py-14 text-center text-[15px] text-slate-600 dark:text-slate-300">No plans are available right now.</p>
          )}
        </div>

        {/* ------------------------------------------------ Footer */}
        <footer className="relative flex shrink-0 flex-col gap-3 border-t border-slate-900/[0.08] bg-mkt-surface px-5 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div ref={summaryRef} className="min-w-0" aria-live="polite">
            {selectedPlan && selectedPrice ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Your plan</p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-mkt-ink">
                  <span className={`${DISPLAY} truncate text-base font-bold sm:text-lg`}>{selectedPlan.name}</span>
                  <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
                    {selectedPrice.amount}
                    {selectedPrice.period ? ` ${selectedPrice.period}` : ''}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {selectedPlan.isTrial
                    ? 'No credit card required.'
                    : selectedPrice.contactSales
                      ? 'Our team will be in touch about pricing.'
                      : 'Payment is collected after you create your account.'}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">Select a plan to continue.</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedPlan}
            className="group/cta inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-mkt-accent-solid px-7 text-[15px] font-semibold text-white shadow-[0_14px_30px_-14px_rgba(15,60,153,0.8)] transition-[background-color,scale,opacity] hover:bg-mkt-accent-solid-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid focus-visible:ring-offset-2 focus-visible:ring-offset-mkt-surface active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {selectedPlan?.isTrial ? 'Start free trial' : 'Continue'}
            {selectedPlan && !selectedPlan.isTrial && <span className="max-w-[12rem] truncate font-normal opacity-80">with {selectedPlan.name}</span>}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover/cta:translate-x-1" />
          </button>
        </footer>
      </div>
    </div>
  );
}
