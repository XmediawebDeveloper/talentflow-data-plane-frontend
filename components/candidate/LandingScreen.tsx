'use client';

import { useEffect } from 'react';
import {
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
