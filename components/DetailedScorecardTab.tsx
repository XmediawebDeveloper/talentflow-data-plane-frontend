import type { ReactNode } from 'react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Calendar, User, BarChart3, CheckSquare, CheckCircle, XCircle, Briefcase, Award, Target, GraduationCap, MapPin, Building2, MessageSquare, TrendingUp, Info } from 'lucide-react';
import { formatIST } from '@/lib/utils/dateUtils';
import { Tooltip } from '@/components/ui/tooltip';

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
  // criteria scored 7+, each worth `weight_each`, earning `weighted_percentage`
  // of `max_weight` (60 for Required, 40 for Preferred). `raw_percentage` is
  // the plain rating average and is no longer displayed.
  weighted_percentage?: number;
  passed?: number;
  total?: number;
  weight_each?: number;
  max_weight?: number;
  // Preferred Total only: false when a Required criterion scored below 7, in
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

  const showReasoningTooltip = (e: React.MouseEvent<HTMLElement>, text: string) => {
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
  const hideReasoningTooltip = () => setReasoningTooltip(null);

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
    // False when a Required criterion scored below 7: Preferred is shown but
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
    // criteria exist, what each is worth, how many cleared the 7-point cliff,
    // and what that earns - computed from the same per-criterion data the
    // table below renders, so it can never disagree with what's on screen.
    {
      const _reqItems = regularItems.filter(item => item.requirement === 'Required' || item.is_essential);
      const _prefItems = regularItems.filter(item => item.requirement === 'Preferred' || !item.is_essential);
      const _numReq = _reqItems.length;
      const _numPref = _prefItems.length;
      if (_numReq > 0 || _numPref > 0) {
        const _reqPassed = _reqItems.filter(item => (item.rating ?? 0) >= 7).length;
        const _prefPassed = _prefItems.filter(item => (item.rating ?? 0) >= 7).length;
        const _perReq = _numReq > 0 ? 60 / _numReq : 0;
        const _perPref = _numPref > 0 ? 40 / _numPref : 0;
        const _reqEarned = Math.min(Math.round(_reqPassed * _perReq * 100) / 100, 60);
        // Odoo rule: Preferred is discarded entirely unless Required earned the
        // full 60 - must match compute_odoo_scores() or this tooltip would
        // describe a total that doesn't match the number shown next to it.
        const _prefEarned = _reqEarned >= 60 ? Math.min(Math.round(_prefPassed * _perPref * 100) / 100, 40) : 0;

        weightedScoreExplanation = (
          <div className="space-y-1.5">
            <p>Required criteria share 60% of the total, Preferred criteria share 40%. Each side's budget splits evenly across its own criteria, and a criterion only earns its share if it scored 7 or higher - no partial credit below that.</p>
            {_numReq > 0 && (
              <p>Required: {_numReq} criteria → each worth 60% ÷ {_numReq} = {_perReq.toFixed(1)}%. {_reqPassed} of {_numReq} scored 7+ → {_reqPassed} × {_perReq.toFixed(1)}% = {_reqEarned.toFixed(1)}%.</p>
            )}
            {_numPref > 0 && (
              <p>
                Preferred: {_numPref} criteria → each worth 40% ÷ {_numPref} = {_perPref.toFixed(1)}%. {_prefPassed} of {_numPref} scored 7+ → {_prefPassed} × {_perPref.toFixed(1)}% = {_prefEarned.toFixed(1)}%.
                {_reqEarned < 60 && _numReq > 0 && ' Not added - a Required criterion scored below 7, so only the Required credit counts.'}
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
      // share at 7 or higher and nothing below. Preferred is only added once
      // every Required criterion has passed.
      const requiredItems = regularItems.filter(item => item.requirement === 'Required' || item.is_essential);
      const preferredItems = regularItems.filter(item => item.requirement === 'Preferred' || !item.is_essential);
      const requiredTotal = requiredItems.reduce((sum, item) => sum + (item.rating || 0), 0);
      const preferredTotal = preferredItems.reduce((sum, item) => sum + (item.rating || 0), 0);
      const reqCount = requiredItems.length;
      const prefCount = preferredItems.length;
      const reqPassed = requiredItems.filter(item => (item.rating ?? 0) >= 7).length;
      const prefPassed = preferredItems.filter(item => (item.rating ?? 0) >= 7).length;
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
    // full share at 7+ and nothing below, Preferred added only once every
    // Required criterion has passed.
    const reqCount = requiredItems.length;
    const prefCount = preferredItems.length;
    const reqPassed = requiredItems.filter(item => item.rating >= 7).length;
    const prefPassed = preferredItems.filter(item => item.rating >= 7).length;
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

  const getRatingRange = (rating: number): string => {
    if (rating === 10) return 'Excellent';
    if (rating === 9) return 'Very Good';
    if (rating === 8) return 'Good';
    if (rating === 7) return 'Average';
    return 'Below Average';
  };

  const getRatingBgColor = (rating: number): string => {
    if (rating === 10) return 'bg-green-100 border-green-300 text-green-700';
    if (rating === 9) return 'bg-green-100 border-green-300 text-green-700';
    if (rating === 8) return 'bg-gray-100 border-gray-300 text-gray-900';
    if (rating === 7) return 'bg-yellow-100 border-yellow-300 text-yellow-700';
    return 'bg-red-100 border-red-300 text-red-700';
  };

  // React 19 moved the JSX namespace under React (@types/react 19 no longer declares a
  // global one), so bare `JSX.Element` no longer resolves.
  const getEligibleStatus = (rating: number): { status: string; icon: React.JSX.Element; color: string } => {
    if (rating >= 7) {
      return {
        status: 'Eligible',
        icon: <CheckCircle className="w-5 h-5 text-green-600" />,
        color: 'text-green-700'
      };
    }
    return {
      status: 'Not Eligible',
      icon: <XCircle className="w-5 h-5 text-red-600" />,
      color: 'text-red-700'
    };
  };

  // Same three colors as the Match Status badge shown next to this score
  // elsewhere on the page (Overview tab, Scored Resumes table).
  const getOverallScoreColor = (matchStatus?: string): string => {
    const normalized = matchStatus?.toLowerCase().replace(/[_\s]/g, '');
    if (normalized === 'exactmatch' || normalized === 'excellentmatch') return 'text-green-600';
    if (normalized === 'partialmatch') return 'text-brand-orange-deep';
    return 'text-red-600';
  };

  const getRatingRangeColor = (rating: number): string => {
    if (rating === 10) return 'text-green-700 font-semibold';
    if (rating === 9) return 'text-green-700 font-semibold';
    if (rating === 8) return 'text-gray-900 font-semibold';
    if (rating === 7) return 'text-yellow-700 font-semibold';
    return 'text-red-700 font-semibold';
  };

  return (
    <div className="space-y-4">
      {/* Score Summary Header - Compact */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-700 flex items-center gap-1">
          Overall Score:
          {(weightedScoreExplanation || resume.scoreFormula) && (
            <Tooltip content={weightedScoreExplanation || resume.scoreFormula} position="bottom">
              <Info className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
            </Tooltip>
          )}
        </span>
        <span className={`text-2xl font-bold ${getOverallScoreColor(resume.matchStatus)}`}>
          {resume.scorePercentage}%
        </span>
        <span className="text-gray-400">|</span>
        {summaryData && (
          <>
            <span className="text-gray-700 flex items-center gap-1">
              Required: <span className="font-semibold text-gray-900">{summaryData.requiredPercentage.toFixed(0)}%</span>
              <Tooltip
                content={`Required (essential) criteria share 60% of the total, split equally: ${summaryData.requiredCount} criteria → ${summaryData.requiredWeightEach.toFixed(1)}% each. A criterion earns its full share at a rating of 7 or higher and nothing below. ${summaryData.requiredPassed} of ${summaryData.requiredCount} scored 7+ → ${summaryData.requiredPassed} × ${summaryData.requiredWeightEach.toFixed(1)}% = ${summaryData.requiredPercentage.toFixed(1)}% of 60%.${summaryData.preferredAdded ? ' Every Required criterion passed, so the Preferred credit is added on top.' : ' A Required criterion scored below 7, so this is the whole Overall Score - Preferred is not added.'}`}
                position="bottom"
              >
                <Info className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
              </Tooltip>
            </span>
            <span className="text-gray-700 flex items-center gap-1">
              Preferred: <span className="font-semibold text-gray-900">{summaryData.preferredPercentage.toFixed(0)}%</span>
              {!summaryData.preferredAdded && summaryData.preferredCount > 0 && (
                <span className="text-xs text-gray-500">(not added)</span>
              )}
              <Tooltip
                content={`Preferred (nice-to-have) criteria share 40% of the total, split equally: ${summaryData.preferredCount} criteria → ${summaryData.preferredWeightEach.toFixed(1)}% each. A criterion earns its full share at a rating of 7 or higher and nothing below. ${summaryData.preferredPassed} of ${summaryData.preferredCount} scored 7+ → ${summaryData.preferredPassed} × ${summaryData.preferredWeightEach.toFixed(1)}% = ${summaryData.preferredPercentage.toFixed(1)}% of 40%.${summaryData.preferredAdded ? ' Added to the Required credit to make the Overall Score.' : ' Not added to the Overall Score because a Required criterion scored below 7 - shown so you can see what the candidate would have earned.'}`}
                position="bottom"
              >
                <Info className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
              </Tooltip>
            </span>
            <span className="text-gray-600">|</span>
          </>
        )}
        <span className="text-gray-600">
          {resume.scoredDate && !isNaN(new Date(resume.scoredDate).getTime())
            ? formatIST(resume.scoredDate)
            : 'N/A'}
        </span>
        <span className="text-gray-600">by {resume.scoredBy || 'System'}</span>
      </div>

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

          <div className="tf-table-shell">
            <table className="w-full table-fixed">
              <thead className="bg-gray-50 border-b border-gray-200">
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
                    AI Reasoning
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
                            ? 'bg-red-100 text-red-700 border border-red-300'
                            : 'bg-gray-100 text-gray-900 border border-gray-300'
                        }`}>
                          {criteria.criteriaType}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          onMouseEnter={(e) => showReasoningTooltip(e, criteria.aiReasoning)}
                          onMouseLeave={hideReasoningTooltip}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 whitespace-nowrap cursor-default"
                        >
                          {criteria.aiReasoning.split(' ').slice(0, 4).join(' ')}
                          {criteria.aiReasoning.split(' ').length > 4 ? '…' : ''}
                        </span>
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
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-700">
              {criteriaScores.filter(c => c.rating >= 7).length}
            </div>
            <div className="text-sm font-medium text-gray-800 mt-1">Eligible Criteria</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-700">
              {criteriaScores.filter(c => c.rating < 7).length}
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
          className="fixed z-[100] max-w-[95vw] pointer-events-none"
          style={{
            left: reasoningTooltip.left,
            width: reasoningTooltip.width,
            top: reasoningTooltip.top,
            transform: reasoningTooltip.openUp ? 'translateY(-100%)' : undefined,
          }}
        >
          <div className="whitespace-normal bg-[#e1ebed] text-gray-800 text-xs rounded-xl py-2.5 px-3.5 shadow-xl border border-gray-200 leading-relaxed">
            {reasoningTooltip.text}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
