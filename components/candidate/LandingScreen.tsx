'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import {
  Briefcase,
  ChevronDown,
  Building2,
  MapPin,
  Award,
  Clock,
  FileText,
  Code,
  Users,
  CheckCircle,
  AlertTriangle,
  Monitor,
  Camera,
  Mic,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import CandidateHeader from './CandidateHeader';
import CandidateStepper from './CandidateStepper';
import { AssessmentInfo } from '@/lib/services/candidateService';
/* The candidate flow's container — see the note on the constant. Every band
   below keeps its own full-bleed background and puts this inside it, so the
   colour still reaches the screen edges while the text lines up with the
   stepper above and with every other candidate screen. */
import {
  CANDIDATE_PAGE,
  RECRUITER_SHELL,
  RECRUITER_WRAP,
  RECRUITER_CARD,
  PAGE_ICON_TILE,
  T_PAGE_TITLE,
  T_PAGE_SUBTITLE,
  T_EYEBROW,
  T_CARD_TITLE,
  T_HELP,
  T_BODY,
  ICON_INLINE,
  CARD_MUTED,
  ICON_TILE,
  ICON,
  TILE_BRAND,
  TILE_ACCENT,
  TILE_SUCCESS,
} from '@/lib/constants/candidateLayout';

interface LandingScreenProps {
  assessmentInfo: AssessmentInfo;
  onBegin: () => void;
}

export function LandingScreen({ assessmentInfo, onBegin }: LandingScreenProps) {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
  };

  const rounds = [
    {
      type: 'hr',
      enabled: assessmentInfo.has_hr_round,
      name: 'HR Round',
      icon: Users,
      /* The three rounds take the flow's three tones rather than three raw
         palette solids (purple-500 / blue-500 / green). Same tile, same size,
         only the tone differs — and each tone is a global token. */
      tone: TILE_ACCENT
    },
    {
      type: 'technical',
      enabled: assessmentInfo.has_technical_round,
      name: 'Technical Round',
      icon: FileText,
      tone: TILE_BRAND
    },
    {
      type: 'coding',
      enabled: assessmentInfo.has_coding_round,
      name: 'Coding Round',
      icon: Code,
      tone: TILE_SUCCESS
    }
  ].filter(r => r.enabled);

  /* The Job Description accordion — collapsed on arrival. Everything in it is
     the assessment's own JD as the candidate endpoint returns it; a field that
     is empty is left out, and with no JD content at all the section is not
     drawn. */
  const [jdOpen, setJdOpen] = useState(false);
  const jdDescription = assessmentInfo.jd_description?.trim() || '';
  const jdAdditionalDetails = assessmentInfo.jd_additional_details?.trim() || '';
  const mustHaveSkills = assessmentInfo.jd_must_have_skills?.filter(Boolean) ?? [];
  const niceToHaveSkills = assessmentInfo.jd_nice_to_have_skills?.filter(Boolean) ?? [];
  const { jd_experience_min: expMin, jd_experience_max: expMax } = assessmentInfo;
  const experience = expMin != null && expMax != null
    ? `${expMin}–${expMax} yrs experience`
    : expMin != null ? `${expMin}+ yrs experience`
    : expMax != null ? `Up to ${expMax} yrs experience`
    : null;
  const jdMeta = [
    { Icon: Building2, text: assessmentInfo.jd_department },
    { Icon: MapPin, text: assessmentInfo.jd_location },
    { Icon: Briefcase, text: [assessmentInfo.jd_employment_type, assessmentInfo.jd_remote_type].filter(Boolean).join(' · ') },
    { Icon: Award, text: experience },
  ].filter((m): m is { Icon: typeof Building2; text: string } => !!m.text);
  const hasJd = !!jdDescription || !!jdAdditionalDetails || mustHaveSkills.length > 0 || niceToHaveSkills.length > 0;

  return (
    <div className={CANDIDATE_PAGE}>
      {/* Header + stepper: the shared pair, so the logo, the bar height and
          every dot match the screen before and after this one. */}
      <div className="sticky top-0 z-50">
        <CandidateHeader />
        <CandidateStepper current={2} />
      </div>

      {/* The recruiter page shell: slate page, 1400px column, one white
          rounded card holding everything. The bands this replaces were
          full-bleed tinted strips stacked down the page — a structure that
          appears nowhere in the signed-in UI. */}
      <main className={RECRUITER_SHELL}>
        <div className={RECRUITER_WRAP}>
          <div className={RECRUITER_CARD}>

            {/* Page header — the recruiter pattern exactly: 36px brand tile,
                `text-lg sm:text-xl` title, `text-xs sm:text-sm` subtitle. The
                blue gradient hero with a `text-4xl` title that stood here is
                the single loudest reason these pages read as another app. */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
              <div className="flex items-start gap-3 min-w-0">
                <div className={PAGE_ICON_TILE}>
                  <FileText className={`${ICON} text-brand-blue`} />
                </div>
                <div className="min-w-0">
                  <h1 className={`${T_PAGE_TITLE} break-words`}>{assessmentInfo.assessment_title}</h1>
                  <p className={`${T_PAGE_SUBTITLE} break-words`}>{assessmentInfo.jd_title}</p>
                </div>
              </div>
              {/* Duration, as the recruiter meta chip. */}
              <span className="inline-flex items-center gap-2 bg-brand-blue/5 text-brand-blue px-3 py-1.5 rounded-lg ring-1 ring-brand-blue/20 self-start shrink-0">
                <Clock className={ICON_INLINE} />
                <span className="text-sm font-medium whitespace-nowrap">{formatDuration(assessmentInfo.duration_minutes)}</span>
              </span>
            </div>

            {/* Candidate */}
            <div className="mb-5">
              <h2 className={`${T_EYEBROW} mb-3`}>Candidate</h2>
              <div className={`${CARD_MUTED} flex items-center gap-3`}>
                <div className={`${ICON_TILE} ${TILE_BRAND} rounded-full`}>
                  <Users className={ICON} />
                </div>
                <div className="min-w-0">
                  <p className={`${T_CARD_TITLE} break-words`}>{assessmentInfo.candidate_name}</p>
                  <p className={`${T_HELP} break-all`}>{assessmentInfo.candidate_email}</p>
                </div>
              </div>
            </div>

            {/* Job Description — an accordion, collapsed by default. The header
                is a real button (keyboard + screen reader via aria-expanded),
                full width so it is an easy tap target on a phone. */}
            {hasJd && (
              <div className="mb-5">
                <h2 className={`${T_EYEBROW} mb-3`}>Job Description</h2>
                <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] bg-slate-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setJdOpen((open) => !open)}
                    aria-expanded={jdOpen}
                    aria-controls="candidate-jd-panel"
                    className="w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
                  >
                    <div className={`${ICON_TILE} ${TILE_BRAND}`}>
                      <Briefcase className={ICON} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`${T_CARD_TITLE} break-words`}>{assessmentInfo.jd_title || 'Job Description'}</p>
                      <p className={T_HELP}>{jdOpen ? 'Hide the full job description' : 'View the full job description'}</p>
                    </div>
                    <ChevronDown
                      className={`${ICON_INLINE} text-gray-500 transition-transform duration-200 ${jdOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>

                  {jdOpen && (
                    <div id="candidate-jd-panel" className="border-t border-gray-100 bg-white p-3 sm:p-5 space-y-4 min-w-0">
                      {jdMeta.length > 0 && (
                        <div className={`${T_HELP} flex flex-wrap gap-x-4 gap-y-2`}>
                          {jdMeta.map(({ Icon, text }) => (
                            <span key={text} className="inline-flex items-center gap-1.5 min-w-0 break-words">
                              <Icon className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                              {text}
                            </span>
                          ))}
                        </div>
                      )}

                      {jdDescription && (
                        /* Markdown, as the JD is stored and as the AI Interview
                           candidate screen renders it. break-words + min-w-0 keep
                           long lines and URLs inside the card at 320px. */
                        <div className="prose prose-sm max-w-none min-w-0 break-words text-gray-700 leading-relaxed prose-headings:font-semibold prose-headings:text-gray-900 prose-strong:text-gray-900 prose-p:my-1.5 prose-li:my-0.5 prose-a:text-brand-blue prose-pre:overflow-x-auto">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{jdDescription}</ReactMarkdown>
                        </div>
                      )}

                      {/* The recruiter's own words, verbatim — kept apart from
                          the description, as on the AI Interview JD screen. */}
                      {jdAdditionalDetails && (
                        <div>
                          <h3 className={`${T_EYEBROW} mb-2`}>Additional Details</h3>
                          <p className={`${T_BODY} whitespace-pre-wrap break-words`}>{jdAdditionalDetails}</p>
                        </div>
                      )}

                      {(mustHaveSkills.length > 0 || niceToHaveSkills.length > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {([
                            { label: 'Required Skills', skills: mustHaveSkills },
                            { label: 'Nice to Have', skills: niceToHaveSkills },
                          ]).filter(({ skills }) => skills.length > 0).map(({ label, skills }) => (
                            <div key={label} className="min-w-0">
                              <h3 className={`${T_EYEBROW} mb-2`}>{label}</h3>
                              <div className="flex flex-wrap gap-1.5">
                                {skills.map((skill) => (
                                  <span key={skill} className="bg-slate-100 text-gray-700 text-xs px-2.5 py-1 rounded-full ring-1 ring-gray-200 break-words max-w-full">
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Assessment Rounds */}
            <div className="mb-5">
              <h2 className={`${T_EYEBROW} mb-3`}>Assessment Rounds</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {rounds.map((round) => (
                  <div key={round.type} className={`${CARD_MUTED} flex items-center gap-3`}>
                    <div className={`${ICON_TILE} ${round.tone}`}>
                      <round.icon className={ICON} />
                    </div>
                    <p className={`${T_CARD_TITLE} min-w-0 break-words`}>{round.name}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* System Requirements */}
            <div className="mb-5">
              <h2 className={`${T_EYEBROW} mb-3`}>System Requirements</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {([
                  { label: 'Stable Internet', help: 'Reliable connection required', Icon: Monitor, tone: TILE_BRAND },
                  { label: 'Camera Access', help: 'Required for proctoring', Icon: Camera, tone: TILE_SUCCESS },
                  { label: 'Microphone Access', help: 'Required for proctoring', Icon: Mic, tone: TILE_ACCENT },
                ]).map(({ label, help, Icon, tone }) => (
                  <div key={label} className={`${CARD_MUTED} flex items-center gap-3`}>
                    <div className={`${ICON_TILE} ${tone}`}>
                      <Icon className={ICON} />
                    </div>
                    <div className="min-w-0">
                      <p className={`${T_CARD_TITLE} break-words`}>{label}</p>
                      <p className={T_HELP}>{help}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Important Notes — the recruiter warning panel, inside the card
                rather than a full-bleed amber strip across the viewport. */}
            <div className="rounded-xl border border-warning-line bg-warning-subtle p-3 sm:p-4 mb-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className={`${ICON_INLINE} text-warning mt-0.5`} />
                <div className="min-w-0">
                  <p className={`${T_CARD_TITLE} text-warning-strong mb-2`}>Important Notes</p>
                  <ul className={`${T_BODY} text-warning grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2`}>
                    {([
                      'Recovery is supported if a network or client failure occurs',
                      'Tab switching is monitored',
                      'Copy/paste actions are tracked',
                      'Answer all questions before submitting',
                    ]).map((note) => (
                      <li key={note} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 bg-warning rounded-full shrink-0 mt-1.5" />
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Action row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 text-success min-w-0">
                <CheckCircle className={ICON_INLINE} />
                <span className={T_CARD_TITLE}>Ready to begin your assessment</span>
              </div>
              <Button onClick={onBegin} variant="primary" size="md" className="w-full sm:w-auto">
                Continue to System Check
                <ArrowRight className={`${ICON_INLINE} ml-2`} />
              </Button>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-5 text-center bg-white border-t border-gray-200">
        <p className={T_HELP}>
          Having trouble? Contact us at{' '}
          <a href="mailto:support@talentflow.com" className="text-brand-blue hover:underline font-medium break-all">
            support@talentflow.com
          </a>
        </p>
      </footer>
    </div>
  );
}
