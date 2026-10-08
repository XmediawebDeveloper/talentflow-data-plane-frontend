import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Calendar, User, BarChart3, CheckSquare, CheckCircle, XCircle, Briefcase, Award, Target, GraduationCap, MapPin, Building2, MessageSquare, TrendingUp, Info, Copy, Check, ChevronsUpDown, ChevronsDownUp } from 'lucide-react';
import { toast } from 'sonner';
import { formatIST } from '@/lib/utils/dateUtils';
import { Tooltip } from '@/components/ui/tooltip';
import { RATING_PASS_THRESHOLD } from '@/lib/utils/matchStatus';

interface DetailedScores {
  titleMatch: number;
  experienceMatch: number;
  skillsMatch: number;
  educationMatch: number;
  locationMatch: number;
}

interface ScoreBreakdownItem {
  category: string;
  score: number;
  rating?: number;
  max_rating?: number;
  reasoning: string;
  match_status?: string;
  requirement?: string;
  eligible?: boolean;
  is_summary?: boolean;
  // Marks a criterion the backend treats as essential (routers/resume_scoring.py
  // sets it per criterion, e.g. must_have_skills: True). Read below but never declared.
  is_essential?: boolean;
  percentage?: number;
  raw_percentage?: number;
  // Summary rows only (Required Total / Preferred Total / Final Score). The
  // weighted credit is what the Score Table header shows: `passed` of `total`
  // criteria scored 6+, each worth `weight_each`, earning `weighted_percentage`
  // of `max_weight` (60 for Required, 40 for Preferred). `raw_percentage` is
  // the plain rating average and is no longer displayed.
  weighted_percentage?: number;
  passed?: number;
  total?: number;
  weight_each?: number;
  max_weight?: number;
  // Preferred Total only: false when a Required criterion scored below 6, in
  // which case the Preferred credit is computed but not added to the total.
  added?: boolean;
  key?: string;
}

interface ScoredResumeDetail {
  scorePercentage: number;
  // Per-candidate breakdown of how scorePercentage was derived - shown as a
  // tooltip so the Overall Score never looks like a plain average of the
  // Required/Preferred percentages shown beside it.
  scoreFormula?: string;
  // Colors the "Overall Score" header below to match the same status the
  // rest of the app keys its score colors off, rather than its own separate
  // score-threshold scale.
  matchStatus?: string;
  // Mean rating across the Required criteria (0-10); null/undefined when the JD
  // defines no Required criteria, where the average is undefined rather than 0.
  // Displayed because it is the ONLY value separating Exact Match (>= 8) from
  // Partial Match (< 8) - without it a recruiter cannot tell why a candidate who
  // passed every Required criterion got one label rather than the other.
  essentialAverage?: number | null;
  // Resume Match Rating Mechanism (client doc, "Final Version A", Sept 2026):
  // the 0-10 Overall Rating shown as the headline number below, plus its two
  // components (Must-Have / Nice-to-Have Average). Additive alongside
  // scorePercentage/essentialAverage above - match classification and its
  // color are untouched, only where the numeric Overall Score itself gets
  // its value and scale is affected.
  essentialRating10?: number;
  nonEssentialRating10?: number | null;
  // Internal step only (Essential + Non-Essential) / 2 - used for the Overall
  // Rating tooltip's worked-through explanation, never displayed on its own.
  combinedAverage10?: number | null;
  overallRating10?: number;
  ratingCapApplied?: boolean;
  ratingSummaryText?: string;
  scoredDate: string;
  scoredBy: string;
  detailedScores: DetailedScores;
  // Certifications may arrive as plain strings or as structured objects with a
  // name field (from the candidate-detail endpoint). The scorecard only reads
  // them for display so a permissive union is sufficient.
  certifications?: Array<string | { name?: string; date?: string; issuer?: string; credential_id?: string }>;
  education?: string;
  location?: string;
  title?: string;
  scoreBreakdown?: ScoreBreakdownItem[];
  criteriaScores?: Record<string, { score: number; eligible: boolean; reasoning: string }>;
}

interface DetailedScorecardTabProps {
  resume: ScoredResumeDetail;
  jobTitle: string;
  aiReasoning?: string;
  getScoreColor: (score: number) => string;
  getScoreBgColor: (score: number) => string;
  getProgressBarColor: (score: number) => string;
}

export default function DetailedScorecardTab({ resume, jobTitle, aiReasoning, getScoreColor, getScoreBgColor, getProgressBarColor }: DetailedScorecardTabProps) {
  // The AI Reasoning pill's full-text hover box. Rendered through a portal
  // (see the end of this component) and positioned from real viewport
  // coordinates rather than CSS `absolute`/`group-hover` — the pill sits
  // inside several nested scroll/overflow-hidden containers (the table
  // shell, the modal body, the modal card), any of which clipped a
  // CSS-positioned tooltip depending on which row was hovered. A portal to
  // <body> with measured coordinates has nothing left to clip it against.
  const [reasoningTooltip, setReasoningTooltip] = useState<{ text: string; left: number; width: number; top: number; openUp: boolean } | null>(null);
  // The pill and the tooltip are siblings (the tooltip is a portal, not a DOM
  // child of the pill), so the mouse crosses a real gap between them —
  // hiding the instant it leaves the pill closed the tooltip before it could
  // reach the text underneath. Hiding is deferred a beat instead, and
  // cancelled if the pointer lands on either the pill or the tooltip within
  // that window, so crossing the gap (or reading/selecting the tooltip
  // itself) keeps it open.
  const hideReasoningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHideReasoningTooltip = () => {
    if (hideReasoningTimeoutRef.current) {
      clearTimeout(hideReasoningTimeoutRef.current);
      hideReasoningTimeoutRef.current = null;
    }
  };

  const showReasoningTooltip = (e: React.MouseEvent<HTMLElement>, text: string) => {
    cancelHideReasoningTooltip();
    const rect = e.currentTarget.getBoundingClientRect();
    // Spans the AI Reasoning column's own cell (left-aligned to it) rather
    // than a fixed width centered on the pill — wide enough to read the
    // reasoning comfortably without spilling past that column into the
    // ones before it.
    const cellRect = e.currentTarget.closest('td')?.getBoundingClientRect();
    // Rough budget for the tooltip's own height — flips upward whenever the
    // space below the pill, to the viewport's bottom edge, can't fit it.
    const estimatedTooltipHeight = 160;
    const openUp = window.innerHeight - rect.bottom < estimatedTooltipHeight + 16;
    setReasoningTooltip({
      text,
      left: cellRect?.left ?? rect.left,
      width: cellRect?.width ?? 288,
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      openUp,
    });
  };
  const hideReasoningTooltip = () => {
    cancelHideReasoningTooltip();
    hideReasoningTimeoutRef.current = setTimeout(() => setReasoningTooltip(null), 150);
  };
  useEffect(() => () => cancelHideReasoningTooltip(), []);

  // One switch for the whole column, toggled from the AI Reasoning header.
  // Collapsed (default) keeps the compact 4-word pill with the hover box;
  // expanded lays every criterion's full reasoning out inline so all of them
  // can be read and compared at once without hovering row by row. Any hover
  // box still open when the column expands is dropped — the text it would
  // show is already on the page.
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const toggleReasoningExpanded = () => {
    cancelHideReasoningTooltip();
    setReasoningTooltip(null);
    setReasoningExpanded(current => !current);
  };

  // Briefly swaps the copy icon for a checkmark on the row just copied —
  // cleared after a beat rather than left to the next click, so it always
  // reads as "just now" instead of stale state from an earlier copy.
  const [copiedReasoningIndex, setCopiedReasoningIndex] = useState<number | null>(null);
  const copyReasoning = async (index: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedReasoningIndex(index);
      toast.success('AI reasoning copied to clipboard');
      setTimeout(() => setCopiedReasoningIndex(current => (current === index ? null : current)), 1500);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  // Convert percentage scores to rating out of 10
  const convertToRating = (percentage: number): number => {
    return Math.round((percentage / 100) * 10);
  };

  // Map icon names to components (handle both display names and API keys)
  const iconMap: Record<string, any> = {
    'Title': Briefcase,
    'Job Title': Briefcase,
    'Job_title': Briefcase,
    'Experience Level': Award,
    'Experience': Award,
    'Education Level': GraduationCap,
    'Education': GraduationCap,
    'Industry Type': Building2,
    'Industry': Building2,
    'Must Have Skills': Target,
    'Must_have_skills': Target,
    'Skills': Target,
    'Nice To Have Skills': Target,
    'Nice_to_have_skills': Target,
    'Must Have Additional Requirements': MessageSquare,
    'Nice To Have Additional Requirements': MessageSquare,
    'Must_have_comments': MessageSquare,
    'Comments': MessageSquare,
    'Location': MapPin,
    'Job Hopping': TrendingUp,
    'Job_hobbing': TrendingUp,
    'Stability': TrendingUp,
  };

  // Generate reasoning based on score
  const generateReasoning = (category: string, score: number): string => {
    const reasoningMap: Record<string, { high: string; medium: string; low: string }> = {
      'Title': {
        high: 'Candidate\'s title perfectly aligns with the position requirements. The role progression shows excellent match with expected seniority level.',
        medium: 'Good title alignment with minor differences in specialization. The candidate has relevant role experience with some variance.',
        low: 'Title shows significant differences. Candidate may be transitioning from a different specialization or seniority level.'
      },
      'Experience Level': {
        high: 'Outstanding career progression with the right amount of experience. Candidate demonstrates consistent growth in relevant domains.',
        medium: 'Appropriate experience level with good progression. Some gaps in specific technical areas but overall solid background.',
        low: 'Experience level below requirements. Candidate shows potential but needs further development in key areas.'
      },
      'Education Level': {
        high: 'Exceptional educational background. Academic credentials exceed the position requirements.',
        medium: 'Meets educational baseline with standard qualifications.',
        low: 'Educational qualifications fall below preferred standards. Practical experience may compensate.'
      },
      'Skills': {
        high: 'All critical skills are present with strong proficiency levels. Technical stack matches well with role requirements.',
        medium: 'Core skills are present with good proficiency. Some gaps in advanced areas but foundation is strong.',
        low: 'Significant skills gap identified in critical areas. Would require training and development.'
      },
      'Location': {
        high: 'Perfect location match with no relocation required.',
        medium: 'Location is workable with remote/hybrid options.',
        low: 'Location mismatch requires consideration. Relocation or remote arrangement needed.'
      }
    };

    const reasoning = reasoningMap[category] || reasoningMap['Skills'];
    if (score >= 85) return reasoning?.high || 'Excellent match for this criterion.';
    if (score >= 60) return reasoning?.medium || 'Good match with some minor gaps.';
    return reasoning?.low || 'Below requirements for this criterion.';
  };

  // Build criteria scores from real data or fallback to detailedScores
  let criteriaScores: Array<{
    name: string;
    rating: number;
    icon: any;
    criteriaType: string;
    aiReasoning: string;
  }> = [];

  // Extract summary rows (Required Total, Preferred Total, Final Score).
  // requiredPercentage / preferredPercentage are the WEIGHTED credits (earned of
  // 60% / of 40%) - the same arithmetic as the Overall Score, so the three
  // numbers in the header describe one calculation. They used to be the plain
  // rating averages, a different formula, which put "Overall 0%" next to
  // "Required 40%" for a candidate who failed every Required criterion.
  let summaryData: {
    requiredPercentage: number;
    preferredPercentage: number;
    finalPercentage: number;
    requiredTotal: number;
    requiredMax: number;
    preferredTotal: number;
    preferredMax: number;
    requiredPassed: number;
    requiredCount: number;
    requiredWeightEach: number;
    preferredPassed: number;
    preferredCount: number;
    preferredWeightEach: number;
    // False when a Required criterion scored below 6: Preferred is shown but
    // not added to the Overall Score.
    preferredAdded: boolean;
  } | null = null;

  // Worked-through explanation for the Overall Score tooltip - shows WHERE
  // each number comes from (how many criteria, what each is worth, how many
  // passed) rather than just the final percentage, so a reader can verify the
  // arithmetic themselves instead of taking "94%" on faith.
  let weightedScoreExplanation: ReactNode = null;

  // Single source of truth: scoreBreakdown (from API score_breakdown array)
  // This is built by build_criteria_breakdown() in the router from scoring_details,
  // ensuring consistent data. criteriaScores (raw dict) is NOT used for display.
  if (resume.scoreBreakdown && resume.scoreBreakdown.length > 0) {
    // Separate summary rows from regular criteria rows
    const regularItems: ScoreBreakdownItem[] = [];
    let requiredSummary: ScoreBreakdownItem | undefined;
    let preferredSummary: ScoreBreakdownItem | undefined;
    let finalSummary: ScoreBreakdownItem | undefined;

    resume.scoreBreakdown.forEach((item: ScoreBreakdownItem) => {
      if (item.is_summary) {
        if (item.key === 'required_total') requiredSummary = item;
        else if (item.key === 'preferred_total') preferredSummary = item;
        else if (item.key === 'final_score') finalSummary = item;
      } else {
        // nice_to_have_comments used to be filtered out here. It is a scored criterion
        // and the PDF always printed it, so hiding it made the screen and the download
        // disagree - and now that an INFERRED education requirement is routed to
        // Nice-to-Have Additional Requirements, hiding the row would hide how the
        // candidate's qualification was graded.
        regularItems.push(item);
      }
    });

    // Worked-through Overall Score derivation: how many Required/Preferred
    // criteria exist, what each is worth, how many cleared the pass cliff
    // (RATING_PASS_THRESHOLD, 6 or higher), and what that earns - computed
    // from the same per-criterion data the table below renders, so it can
    // never disagree with what's on screen.
    {
      const _reqItems = regularItems.filter(item => item.requirement === 'Required' || item.is_essential);
      const _prefItems = regularItems.filter(item => item.requirement === 'Preferred' || !item.is_essential);
      const _numReq = _reqItems.length;
      const _numPref = _prefItems.length;
      if (_numReq > 0 || _numPref > 0) {
        const _reqPassed = _reqItems.filter(item => (item.rating ?? 0) >= RATING_PASS_THRESHOLD).length;
        const _prefPassed = _prefItems.filter(item => (item.rating ?? 0) >= RATING_PASS_THRESHOLD).length;
        const _perReq = _numReq > 0 ? 60 / _numReq : 0;
        const _perPref = _numPref > 0 ? 40 / _numPref : 0;
        const _reqEarned = Math.min(Math.round(_reqPassed * _perReq * 100) / 100, 60);
        // Odoo rule: Preferred is discarded entirely unless Required earned the
        // full 60 - must match compute_odoo_scores() or this tooltip would
        // describe a total that doesn't match the number shown next to it.
        const _prefEarned = _reqEarned >= 60 ? Math.min(Math.round(_prefPassed * _perPref * 100) / 100, 40) : 0;

        weightedScoreExplanation = (
          <div className="space-y-1.5">
            <p>Required criteria share 60% of the total, Preferred criteria share 40%. Each side's budget splits evenly across its own criteria, and a criterion only earns its share if it scored {RATING_PASS_THRESHOLD} or higher - no partial credit below that.</p>
            {_numReq > 0 && (
              <p>Required: {_numReq} criteria → each worth 60% ÷ {_numReq} = {_perReq.toFixed(1)}%. {_reqPassed} of {_numReq} scored {RATING_PASS_THRESHOLD}+ → {_reqPassed} × {_perReq.toFixed(1)}% = {_reqEarned.toFixed(1)}%.</p>
            )}
            {_numPref > 0 && (
              <p>
                Preferred: {_numPref} criteria → each worth 40% ÷ {_numPref} = {_perPref.toFixed(1)}%. {_prefPassed} of {_numPref} scored {RATING_PASS_THRESHOLD}+ → {_prefPassed} × {_perPref.toFixed(1)}% = {_prefEarned.toFixed(1)}%.
                {_reqEarned < 60 && _numReq > 0 && ` Not added - a Required criterion scored below ${RATING_PASS_THRESHOLD}, so only the Required credit counts.`}
              </p>
            )}
            <p className="font-semibold">Total: {_reqEarned.toFixed(1)}% + {_prefEarned.toFixed(1)}% = {resume.scorePercentage}%</p>
          </div>
        );
      }
    }

    // Build summary data from summary rows (weighted credits from the API).
    if (requiredSummary || preferredSummary || finalSummary) {
      const reqCount = requiredSummary?.total ?? 0;
      const prefCount = preferredSummary?.total ?? 0;
      const reqPassed = requiredSummary?.passed ?? 0;
      const prefPassed = preferredSummary?.passed ?? 0;
      summaryData = {
        requiredPercentage: requiredSummary?.weighted_percentage ?? requiredSummary?.percentage ?? 0,
        preferredPercentage: preferredSummary?.weighted_percentage ?? preferredSummary?.percentage ?? 0,
        finalPercentage: finalSummary?.percentage || resume.scorePercentage,
        requiredTotal: requiredSummary?.rating || 0,
        requiredMax: requiredSummary?.max_rating || 60,
        preferredTotal: preferredSummary?.rating || 0,
        preferredMax: preferredSummary?.max_rating || 40,
        requiredPassed: reqPassed,
        requiredCount: reqCount,
        requiredWeightEach: requiredSummary?.weight_each ?? (reqCount > 0 ? 60 / reqCount : 0),
        preferredPassed: prefPassed,
        preferredCount: prefCount,
        preferredWeightEach: preferredSummary?.weight_each ?? (prefCount > 0 ? 40 / prefCount : 0),
        preferredAdded: preferredSummary?.added ?? (reqCount === 0 || reqPassed === reqCount),
      };
    } else {
      // Fallback: derive the same weighted credits from the per-criterion rows.
      // Required shares 60% equally, Preferred shares 40%; a criterion earns its
      // share at RATING_PASS_THRESHOLD or higher and nothing below. Preferred
      // is only added once every Required criterion has passed.
      const requiredItems = regularItems.filter(item => item.requirement === 'Required' || item.is_essential);
      const preferredItems = regularItems.filter(item => item.requirement === 'Preferred' || !item.is_essential);
      const requiredTotal = requiredItems.reduce((sum, item) => sum + (item.rating || 0), 0);
      const preferredTotal = preferredItems.reduce((sum, item) => sum + (item.rating || 0), 0);
      const reqCount = requiredItems.length;
      const prefCount = preferredItems.length;
      const reqPassed = requiredItems.filter(item => (item.rating ?? 0) >= RATING_PASS_THRESHOLD).length;
      const prefPassed = preferredItems.filter(item => (item.rating ?? 0) >= RATING_PASS_THRESHOLD).length;
      const reqEarned = reqCount > 0 ? Math.round((60 * reqPassed / reqCount) * 100) / 100 : 0;
      const prefEarned = prefCount > 0 ? Math.round((40 * prefPassed / prefCount) * 100) / 100 : 0;
      summaryData = {
        requiredPercentage: reqEarned,
        preferredPercentage: prefEarned,
        finalPercentage: resume.scorePercentage,
        requiredTotal,
        requiredMax: reqCount * 10 || 60,
        preferredTotal,
        preferredMax: prefCount * 10 || 40,
        requiredPassed: reqPassed,
        requiredCount: reqCount,
        requiredWeightEach: reqCount > 0 ? 60 / reqCount : 0,
        preferredPassed: prefPassed,
        preferredCount: prefCount,
        preferredWeightEach: prefCount > 0 ? 40 / prefCount : 0,
        preferredAdded: reqCount === 0 || reqPassed === reqCount,
      };
    }

    // Build criteria rows — use rating (0-10) and requirement from score_breakdown
    criteriaScores = regularItems.map((item: ScoreBreakdownItem) => ({
      name: item.category,
      rating: item.rating ?? convertToRating(item.score),
      icon: iconMap[item.category] || Target,
      criteriaType: item.requirement || (item.is_essential ? 'Required' : 'Preferred'),
      aiReasoning: item.reasoning || generateReasoning(item.category, item.score),
    }));
  }
  // Fallback: build from criteriaScores dict if no scoreBreakdown
  else if (resume.criteriaScores && Object.keys(resume.criteriaScores).length > 0) {
    // Odoo essential criteria keys (6 essential, 4 non-essential)
    const essentialKeys = ['job_title', 'experience', 'must_have_skills', 'must_have_comments', 'education', 'job_hopping'];
    let requiredTotal = 0;
    let preferredTotal = 0;

    criteriaScores = Object.entries(resume.criteriaScores)
      .filter(([key]) => !key.startsWith('_'))  // Skip internal keys only - see the note above
      .map(([key, value]: [string, any]) => {
        if (!value || typeof value !== 'object') return null;
        const rawScore = value.score ?? 0;
        const rating = rawScore <= 10 ? Math.round(rawScore) : convertToRating(rawScore);
        const displayName = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        const isEssential = value.is_essential === true || essentialKeys.includes(key);
        if (isEssential) requiredTotal += rating; else preferredTotal += rating;
        return {
          name: displayName,
          rating,
          icon: iconMap[displayName] || iconMap[key] || Target,
          criteriaType: isEssential ? 'Required' : 'Preferred',
          aiReasoning: value.reasoning || generateReasoning(key, rawScore <= 10 ? rawScore * 10 : rawScore),
        };
      }).filter((item): item is NonNullable<typeof item> => item !== null);

    const requiredItems = criteriaScores.filter(item => item.criteriaType === 'Required');
    const preferredItems = criteriaScores.filter(item => item.criteriaType === 'Preferred');
    // Same weighted credits as the summary-row path: 60% / 40% split equally,
    // full share at RATING_PASS_THRESHOLD+ and nothing below, Preferred added
    // only once every Required criterion has passed.
    const reqCount = requiredItems.length;
    const prefCount = preferredItems.length;
    const reqPassed = requiredItems.filter(item => item.rating >= RATING_PASS_THRESHOLD).length;
    const prefPassed = preferredItems.filter(item => item.rating >= RATING_PASS_THRESHOLD).length;
    summaryData = {
      requiredPercentage: reqCount > 0 ? Math.round((60 * reqPassed / reqCount) * 100) / 100 : 0,
      preferredPercentage: prefCount > 0 ? Math.round((40 * prefPassed / prefCount) * 100) / 100 : 0,
      finalPercentage: resume.scorePercentage,
      requiredTotal,
      requiredMax: reqCount * 10 || 60,
      preferredTotal,
      preferredMax: prefCount * 10 || 40,
      requiredPassed: reqPassed,
      requiredCount: reqCount,
      requiredWeightEach: reqCount > 0 ? 60 / reqCount : 0,
      preferredPassed: prefPassed,
      preferredCount: prefCount,
      preferredWeightEach: prefCount > 0 ? 40 / prefCount : 0,
      preferredAdded: reqCount === 0 || reqPassed === reqCount,
    };
  } else {
    criteriaScores = [];
  }

  // 10 Excellent / 9 Very Good / 8 Good / 6-7 Average (a pass, RATING_PASS_THRESHOLD)
  // / below that Below Average. Matches PDFScorecardService._get_rating_colors exactly.
  const getRatingRange = (rating: number): string => {
    if (rating === 10) return 'Excellent';
    if (rating === 9) return 'Very Good';
    if (rating === 8) return 'Good';
    if (rating >= RATING_PASS_THRESHOLD) return 'Average';
    return 'Below Average';
  };

  const getRatingBgColor = (rating: number): string => {
    if (rating === 10) return 'bg-success-subtle border-success-line text-success';
    if (rating === 9) return 'bg-success-subtle border-success-line text-success';
    if (rating === 8) return 'bg-gray-100 border-gray-300 text-gray-900';
    if (rating >= RATING_PASS_THRESHOLD) return 'bg-warning-subtle border-warning-line text-warning';
    return 'bg-destructive-subtle border-destructive-line text-destructive';
  };

  // React 19 moved the JSX namespace under React (@types/react 19 no longer declares a
  // global one), so bare `JSX.Element` no longer resolves.
  const getEligibleStatus = (rating: number): { status: string; icon: React.JSX.Element; color: string } => {
    if (rating >= RATING_PASS_THRESHOLD) {
      return {
        status: 'Eligible',
        icon: <CheckCircle className="w-5 h-5 text-success" />,
        color: 'text-success'
      };
    }
    return {
      status: 'Not Eligible',
      icon: <XCircle className="w-5 h-5 text-destructive" />,
      color: 'text-destructive'
    };
  };

  // Same three colors as the Match Status badge shown next to this score
  // elsewhere on the page (Overview tab, Scored Resumes table).
  // Mean Required rating. Prefer the API's value (computed by the same code that
  // decided the classification, so the two can never disagree); fall back to the
  // mean of the Required rows on screen for payloads that predate the field.
  // `??` deliberately: an average of 0 is real, undefined/null is "not supplied",
  // and when the JD has no Required criteria both paths yield null - the average
  // is undefined there, not zero, so the whole item is hidden rather than showing 0.
  const requiredRatings = criteriaScores
    .filter(item => item.criteriaType === 'Required')
    .map(item => item.rating);
  const essentialAverageRaw: number | null =
    resume.essentialAverage ??
    (requiredRatings.length > 0
      ? requiredRatings.reduce((sum, r) => sum + r, 0) / requiredRatings.length
      : null);

  // Shown only for the two PASSING classifications, which is what the spec asks
  // for and the only place it means anything. The average is computed over every
  // Required rating including the failing ones, so a No Match can carry a high
  // average - one criterion at 5 (below RATING_PASS_THRESHOLD) among several 9s
  // can still average high while failing outright. Printed beside a "No Match"
  // chip that reads as a contradiction, so for a failed candidate the Required %
  // (below 60) is the number that explains the outcome, not this one.
  const isPassingMatch = (() => {
    const normalized = resume.matchStatus?.toLowerCase().replace(/[_\s]/g, '');
    return normalized === 'exactmatch' || normalized === 'excellentmatch' || normalized === 'partialmatch';
  })();
  const essentialAverageValue = isPassingMatch ? essentialAverageRaw : null;

  const getOverallScoreColor = (matchStatus?: string): string => {
    const normalized = matchStatus?.toLowerCase().replace(/[_\s]/g, '');
    if (normalized === 'exactmatch' || normalized === 'excellentmatch') return 'text-success';
    if (normalized === 'partialmatch') return 'text-brand-orange-deep';
    return 'text-destructive';
  };

  // Worked-through explanation for the Overall Rating tooltip, per the
  // client's 10-point rating document ("Final Version A", Sept 2026). This
  // REPLACES the old Required%/Preferred% weighted-credit explanation
  // (`weightedScoreExplanation` above, now unused here) that used to sit
  // under this same label - that explained a different calculation the
  // headline number no longer uses, so showing it here would describe math
  // that doesn't match the number displayed next to it.
  let overallRatingExplanation: ReactNode = null;
  if (resume.essentialRating10 != null) {
    const normalizedStatus = resume.matchStatus?.toLowerCase().replace(/[_\s]/g, '') || '';
    const isNoMatch = normalizedStatus === 'nomatch';
    const isPartial = normalizedStatus === 'partialmatch';

    overallRatingExplanation = (
      <div className="space-y-1.5">
        <p>Must-Have Average: {resume.essentialRating10.toFixed(1)}/10 - the average of every Must-Have criterion (a rating below {RATING_PASS_THRESHOLD} counts as 0 but still counts toward the average).</p>
        {isNoMatch ? (
          <p>
            One or more Must-Have requirements failed, so the Overall Rating is the Must-Have Average. Nice-to-Have criteria are not used.
            {resume.ratingCapApplied && ' A No Match is never shown above 5.9, so it is capped down to 5.9.'}
          </p>
        ) : resume.nonEssentialRating10 == null ? (
          <p>This job has no Nice-to-Have criteria, so the Overall Rating is the Must-Have Average.</p>
        ) : (
          <>
            <p>
              Nice-to-Have Average: {resume.nonEssentialRating10.toFixed(1)}/10.
              {resume.combinedAverage10 != null && (
                <> Combined Average: ({resume.essentialRating10.toFixed(1)} + {resume.nonEssentialRating10.toFixed(1)}) / 2 = {resume.combinedAverage10.toFixed(1)}.</>
              )}
            </p>
            {resume.combinedAverage10 != null && (
              <p>
                {/* Spelled out the same way the document's own worked
                    examples state it - "Starting Overall Rating: MAX(8.1,
                    8.5) = 8.5" - rather than only describing the rule in
                    words, so a recruiter can see which side actually won.
                    Every value here (essentialRating10, combinedAverage10)
                    is already truncated to one decimal server-side (v3: no
                    rounding anywhere in the pipeline), so there is no
                    remaining raw/rounded distinction to preserve - unlike the
                    pre-v3 version of this tooltip, which had to keep a
                    separate unrounded copy of Combined Average for this line
                    specifically. */}
                Starting Overall Rating: MAX({resume.essentialRating10.toFixed(1)}, {resume.combinedAverage10.toFixed(1)}) = {Math.max(resume.essentialRating10, resume.combinedAverage10).toFixed(1)}.
                {resume.ratingCapApplied && (
                  isPartial
                    ? ' A Partial Match is never shown at 8.0 or above, so it is capped down to 7.9.'
                    : ' The Combined Average was 8.0 or below, so an Exact Match here is capped down to 9.0.'
                )}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  const getRatingRangeColor = (rating: number): string => {
    if (rating === 10) return 'text-success font-semibold';
    if (rating === 9) return 'text-success font-semibold';
    if (rating === 8) return 'text-gray-900 font-semibold';
    if (rating >= RATING_PASS_THRESHOLD) return 'text-warning font-semibold';
    return 'text-destructive font-semibold';
  };

  return (
    <div className="space-y-4">
      {/* Score Summary Header - Compact */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-700 flex items-center gap-1">
          {/* Resume Match Rating Mechanism (client doc, Sept 2026): the headline
              number is now the 0-10 Overall Rating, not a percentage - the color
              keying off match status is untouched. `scorePercentage` stays as a
              fallback only for a response that predates this field. */}
          Overall Rating:
          {(overallRatingExplanation || resume.ratingSummaryText || resume.scoreFormula) && (
            <Tooltip content={overallRatingExplanation || resume.ratingSummaryText || resume.scoreFormula} position="bottom">
              <Info className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
            </Tooltip>
          )}
        </span>
        <span className={`text-2xl font-bold ${getOverallScoreColor(resume.matchStatus)}`}>
          {resume.overallRating10 != null ? (
            <>{resume.overallRating10.toFixed(1)}<span className="text-base font-semibold text-gray-500">/10</span></>
          ) : (
            `${resume.scorePercentage}%`
          )}
        </span>
        {resume.essentialRating10 != null && (
          <>
            <span className="text-gray-400">|</span>
            <span className="text-gray-700 flex items-center gap-1">
              Must-Have Avg: <span className="font-semibold text-gray-900">{resume.essentialRating10.toFixed(1)}</span>
              <span className="text-gray-500">/10</span>
            </span>
          </>
        )}
        {resume.nonEssentialRating10 != null && (
          <span className="text-gray-700 flex items-center gap-1">
            Nice-to-Have Avg: <span className="font-semibold text-gray-900">{resume.nonEssentialRating10.toFixed(1)}</span>
            <span className="text-gray-500">/10</span>
          </span>
        )}
        {/* Internal step in the Overall Rating calculation - (Must-Have +
            Nice-to-Have) / 2 - only ever exists for a Partial/Exact Match
            with Nice-to-Have criteria on the JD (the same condition
            Nice-to-Have Avg above already gates on). The document itself
            doesn't list this as one of the numbers to show (section 9), but
            showing it lets a recruiter verify the Overall Rating's own
            arithmetic instead of taking it on faith. Shown at one decimal,
            matching Must-Have/Nice-to-Have/Overall Rating - a plain
            toFixed(1) is safe here (v3: the backend already truncates this
            value to one decimal before sending it, so there is no remaining
            sub-8.0 value that could round up to a misleading "8.0"). */}
        {resume.combinedAverage10 != null && (
          <>
            <span className="text-gray-400">|</span>
            <span className="text-gray-700 flex items-center gap-1">
              Combined Average: <span className="font-semibold text-gray-900">{resume.combinedAverage10.toFixed(1)}</span>
              <span className="text-gray-500">/10</span>
            </span>
          </>
        )}
        {/* Required %/Preferred % and the old Required Avg Rating used to show
            here too, but they duplicated Must-Have Avg/Nice-to-Have Avg/Overall
            Rating above once the 10-point rating shipped - hidden per the
            client's request, not removed: summaryData/essentialAverageValue
            below are left computed and still feed nothing visible on purpose,
            in case a future surface needs the weighted-% breakdown again. */}
        <span className="text-gray-400">|</span>
        <span className="text-gray-600">
          {resume.scoredDate && !isNaN(new Date(resume.scoredDate).getTime())
            ? formatIST(resume.scoredDate)
            : 'N/A'}
        </span>
        <span className="text-gray-600">by {resume.scoredBy || 'System'}</span>
      </div>

      {/* Status summary sentence for the Overall Rating, per the client's
          10-point rating document (section 9 UI guidance). */}
      {resume.ratingSummaryText && (
        <p className="text-xs text-gray-500 italic">{resume.ratingSummaryText}</p>
      )}

      {/* AI Analysis */}
      {aiReasoning && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-2">AI Analysis</h4>
          <p className="text-gray-900 text-sm leading-relaxed">{aiReasoning}</p>
        </div>
      )}

      {/* Detailed Scoring Table - Only show if real API data exists */}
      {criteriaScores.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
            <h4 className="text-gray-900 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-gray-800" />
              Scoring Rubric & Evaluation
            </h4>
          </div>

          {/* Sideways scroll only — deliberately NOT `.tf-table-shell`.
              That shell is the app's LIST-table treatment: a height cap
              (`100dvh - 20rem`), a sticky header and its own vertical scroller,
              which is right for a table whose row count is unbounded and paged.
              This one is fixed-length — one row per scoring criterion, about
              eight to ten, never more — and it sits inside a page (or a modal
              body) that already scrolls. Capping it there put a SECOND vertical
              scrollbar inside the first, so the last few criteria sat hidden
              behind it while the summary tiles below made the section look
              complete. It grows to its content instead: the page is the only
              vertical scroller and every criterion is visible at once.
              globals.css calls the shell opt-in for exactly this reason. */}
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead className="bg-brand-sky dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  <th className="w-[20%] px-3 py-2.5 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="w-[10%] px-3 py-2.5 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Rating
                  </th>
                  <th className="w-[12%] px-3 py-2.5 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Range
                  </th>
                  <th className="w-[14%] px-3 py-2.5 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Eligible Status
                  </th>
                  <th className="w-[12%] px-3 py-2.5 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Criteria
                  </th>
                  <th className="w-[32%] px-3 py-2.5 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    {/* The toggle sits right after the label, not pushed to the
                        column's far edge, so it reads as part of this header. */}
                    <div className="flex items-center gap-2">
                      <span>AI Reasoning</span>
                      {criteriaScores.length > 0 && (
                        <button
                          type="button"
                          onClick={toggleReasoningExpanded}
                          aria-pressed={reasoningExpanded}
                          aria-label={reasoningExpanded ? 'Collapse all AI reasoning' : 'Expand all AI reasoning'}
                          title={reasoningExpanded ? 'Collapse all reasoning' : 'Expand all reasoning'}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium normal-case tracking-normal text-brand-blue hover:bg-brand-blue/10 transition-colors cursor-pointer"
                        >
                          {reasoningExpanded
                            ? <ChevronsDownUp className="w-3.5 h-3.5" />
                            : <ChevronsUpDown className="w-3.5 h-3.5" />}
                          {reasoningExpanded ? 'Collapse all' : 'Expand all'}
                        </button>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {criteriaScores.map((criteria, index) => {
                  const Icon = criteria.icon;
                  const eligibility = getEligibleStatus(criteria.rating);
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900 truncate">{criteria.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg font-bold border ${getRatingBgColor(criteria.rating)}`}>
                          {criteria.rating}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-sm ${getRatingRangeColor(criteria.rating)}`}>
                          {getRatingRange(criteria.rating)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {eligibility.icon}
                          <span className={`text-sm font-medium truncate ${eligibility.color}`}>
                            {eligibility.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                          criteria.criteriaType === 'Required'
                            ? 'bg-destructive-subtle text-destructive border border-destructive-line'
                            : 'bg-gray-100 text-gray-900 border border-gray-300'
                        }`}>
                          {criteria.criteriaType}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className={`flex gap-1.5 ${reasoningExpanded ? 'items-start' : 'items-center'}`}>
                          {reasoningExpanded ? (
                            <p className="flex-1 min-w-0 text-sm text-gray-700 leading-relaxed whitespace-pre-line break-words">
                              {criteria.aiReasoning}
                            </p>
                          ) : (
                            <span
                              onMouseEnter={(e) => showReasoningTooltip(e, criteria.aiReasoning)}
                              onMouseLeave={hideReasoningTooltip}
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 whitespace-nowrap cursor-default"
                            >
                              {criteria.aiReasoning.split(' ').slice(0, 4).join(' ')}
                              {criteria.aiReasoning.split(' ').length > 4 ? '…' : ''}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => copyReasoning(index, criteria.aiReasoning)}
                            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
                            aria-label="Copy AI reasoning"
                            title="Copy full text"
                          >
                            {copiedReasoningIndex === index
                              ? <Check className="w-3.5 h-3.5 text-success" />
                              : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Stats - Only show if real API data exists */}
      {criteriaScores.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-success-subtle border border-success-line rounded-lg p-4">
            <div className="text-2xl font-bold text-success">
              {criteriaScores.filter(c => c.rating >= RATING_PASS_THRESHOLD).length}
            </div>
            <div className="text-sm font-medium text-gray-800 mt-1">Eligible Criteria</div>
          </div>
          <div className="bg-destructive-subtle border border-destructive-line rounded-lg p-4">
            <div className="text-2xl font-bold text-destructive">
              {criteriaScores.filter(c => c.rating < RATING_PASS_THRESHOLD).length}
            </div>
            <div className="text-sm font-medium text-gray-800 mt-1">Not Eligible Criteria</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">
              {criteriaScores.filter(c => c.criteriaType === 'Required').length}
            </div>
            <div className="text-sm font-medium text-gray-800 mt-1">Required Criteria</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">
              {criteriaScores.filter(c => c.criteriaType === 'Preferred').length}
            </div>
            <div className="text-sm font-medium text-gray-800 mt-1">Preferred Criteria</div>
          </div>
        </div>
      )}

      {/* AI Reasoning pill's full-text hover box — see reasoningTooltip
          above for why this is a portal instead of a CSS-positioned child. */}
      {reasoningTooltip && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[100] max-w-[95vw]"
          style={{
            left: reasoningTooltip.left,
            width: reasoningTooltip.width,
            top: reasoningTooltip.top,
            transform: reasoningTooltip.openUp ? 'translateY(-100%)' : undefined,
          }}
          onMouseEnter={cancelHideReasoningTooltip}
          onMouseLeave={hideReasoningTooltip}
        >
          <div className="whitespace-normal bg-[var(--raw-e1ebed)] text-gray-800 text-xs rounded-xl py-2.5 px-3.5 shadow-xl border border-gray-200 leading-relaxed select-text">
            {reasoningTooltip.text}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
