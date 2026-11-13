'use client';

/* TEMP interactive preview — a first-time-user friendly version of the
   Score Resumes / Assessment / AI Interview / Invite flows, with ONE progress
   + minimize/restore pattern for every background job. Mock data and fake
   timers only: nothing here calls the API or touches the live pages. */

import { useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from 'react';
import {
  FileSearch, ClipboardList, Bot, Briefcase, Upload, Folder, Check, CheckCircle2,
  ChevronRight, ChevronLeft, Minimize2, X, Info, Sparkles, Send, Mail, Clock, Shield,
  Video, Code, MessageSquare, Loader2, ArrowRight, Lightbulb, RotateCcw, Coins, Activity,
  Database, UserPlus, HelpCircle, Eye,
} from 'lucide-react';

/* ───────────────────────────── Mock data ───────────────────────────── */

type Icon = ComponentType<{ className?: string }>;

interface MockJob {
  id: string; code: string; title: string; version: number; dept: string;
  hasAssessment: boolean; hasInterview: boolean; note?: string;
}
interface MockResume { id: string; name: string; role: string; exp: number; folder: string; source: 'mine' | 'shared' }
interface ScoreRow { resume: MockResume; score: number }
type TaskKind = 'score' | 'invite';
interface Task {
  id: string; kind: TaskKind; title: string; subtitle: string; total: number; done: number;
  failed: number; minimized: boolean; results?: ScoreRow[]; jobId: string;
}

const JOBS: MockJob[] = [
  { id: 'j329', code: 'JD-329', title: 'Food Tester', version: 3, dept: 'Quality', hasAssessment: false, hasInterview: true, note: 'v4 already has an assessment — showing v3' },
  { id: 'j354', code: 'JD-354', title: 'GTA Game Developer', version: 1, dept: 'Games', hasAssessment: false, hasInterview: false },
  { id: 'j142', code: 'JD-142', title: 'Senior Frontend Engineer', version: 2, dept: 'Engineering', hasAssessment: true, hasInterview: false },
];

const RESUMES: MockResume[] = [
  { id: 'r1', name: 'Priya Raman', role: 'Game Developer', exp: 6, folder: 'Games 2026', source: 'mine' },
  { id: 'r2', name: 'Arun Kumar', role: 'Unity Developer', exp: 4, folder: 'Games 2026', source: 'mine' },
  { id: 'r3', name: 'Meena S', role: 'QA Analyst', exp: 3, folder: 'Quality', source: 'mine' },
  { id: 'r4', name: 'Rahul P', role: 'Frontend Engineer', exp: 7, folder: 'Engineering', source: 'mine' },
  { id: 'r5', name: 'Divya K', role: 'Unreal Engineer', exp: 5, folder: 'Games 2026', source: 'mine' },
  { id: 'r6', name: 'Karthik V', role: 'Food Technologist', exp: 8, folder: 'Quality', source: 'shared' },
  { id: 'r7', name: 'Anu R', role: 'Gameplay Programmer', exp: 2, folder: 'Campus', source: 'shared' },
  { id: 'r8', name: 'Sanjay M', role: 'Backend Engineer', exp: 5, folder: 'Engineering', source: 'shared' },
];

const GLOSSARY: Record<string, string> = {
  Units: 'Credits in your plan. Scoring one resume, sending one assessment or one AI interview each uses 1 unit.',
  Version: 'Every time a job description is edited and re-published it gets a new version (v1, v2…). Each version can have its own assessment and AI interview.',
  'Skill topics': 'Groups of related skills the AI interviewer asks about (earlier called “clusters”). Generated from the job description — you can edit them.',
  Rounds: 'Parts of the assessment: HR questions, Technical questions and a Coding task. Turn on the ones you need.',
  Match: 'Strong match = 80+ score, Partial match = 50–79, Not a match = below 50.',
  Minimize: 'Hides the progress window. The work keeps running — find it any time in “Activity” at the bottom-right.',
};

/* ───────────────────────────── Small UI pieces ───────────────────────────── */

function Term({ k, children }: { k: keyof typeof GLOSSARY; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center gap-0.5">
      <span className="border-b border-dotted border-gray-400">{children ?? k}</span>
      <button type="button" aria-label={`What is ${k}?`} onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)} className="text-gray-400 hover:text-brand-blue">
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span className="absolute left-0 top-6 z-30 w-64 rounded-lg border border-gray-200 bg-white p-3 text-xs font-normal text-gray-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <b className="block text-gray-900 dark:text-slate-100">{k}</b>{GLOSSARY[k]}
        </span>
      )}
    </span>
  );
}

function Guide({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return null;
  return (
    <div className="mb-5 flex gap-3 rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-3 text-sm text-gray-700 dark:text-slate-200">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
      <div>{children}</div>
    </div>
  );
}

function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'todo';
        return (
          <li key={s} className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              state === 'done' ? 'bg-success-subtle text-success-strong' : state === 'now' ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-500 dark:bg-slate-800'
            }`}>{state === 'done' ? <Check className="h-4 w-4" /> : i + 1}</span>
            <span className={`text-sm ${state === 'now' ? 'font-semibold text-gray-900 dark:text-slate-100' : 'text-gray-500'}`}>{s}</span>
            {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300" />}
          </li>
        );
      })}
    </ol>
  );
}

function Footer({ onBack, backLabel = 'Back', next, nextLabel, nextDisabled, hint }: {
  onBack?: () => void; backLabel?: string; next: () => void; nextLabel: string; nextDisabled?: boolean; hint?: ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-slate-700">
      <div>{onBack && <button onClick={onBack} className="tf-btn tf-btn-md tf-btn-secondary"><ChevronLeft className="h-4 w-4" />{backLabel}</button>}</div>
      <div className="flex items-center gap-3">
        {hint && <span className="tf-meta">{hint}</span>}
        <button onClick={next} disabled={nextDisabled} className="tf-btn tf-btn-md tf-btn-primary">{nextLabel}<ArrowRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label, desc, icon: I }: { on: boolean; onChange: (v: boolean) => void; label: string; desc: string; icon: Icon }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${on ? 'border-brand-blue/40 bg-brand-blue/5' : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
      <I className={`mt-0.5 h-5 w-5 ${on ? 'text-brand-blue' : 'text-gray-400'}`} />
      <span className="flex-1"><span className="tf-row-title block">{label}</span><span className="tf-meta">{desc}</span></span>
      <span className={`mt-1 h-5 w-9 rounded-full p-0.5 transition ${on ? 'bg-brand-blue' : 'bg-gray-300'}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${on ? 'translate-x-4' : ''}`} /></span>
    </button>
  );
}

const verdict = (s: number) => (s >= 80 ? { t: 'Strong match', c: 'tf-stat-chip-success' } : s >= 50 ? { t: 'Partial match', c: 'tf-stat-chip-warning' } : { t: 'Not a match', c: 'tf-stat-chip-danger' });

/* ───────────────────────────── Job picker (shared) ───────────────────────────── */

function JobPicker({ value, onPick, need }: { value: string | null; onPick: (id: string) => void; need: 'score' | 'assessment' | 'interview' }) {
  return (
    <div className="space-y-3">
      {JOBS.map((j) => {
        const taken = (need === 'assessment' && j.hasAssessment) || (need === 'interview' && j.hasInterview);
        const sel = value === j.id;
        return (
          <button key={j.id} type="button" disabled={taken} onClick={() => onPick(j.id)}
            className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition ${
              taken ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-slate-700 dark:bg-slate-800/40'
                : sel ? 'border-brand-blue bg-brand-blue/5' : 'border-gray-200 bg-white hover:border-brand-blue/40 dark:border-slate-700 dark:bg-slate-900'
            }`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${sel ? 'border-brand-blue bg-brand-blue' : 'border-gray-300'}`}>{sel && <Check className="h-3 w-3 text-white" />}</span>
            <Briefcase className="h-5 w-5 text-gray-400" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><span className="tf-row-title">{j.title}</span><span className="tf-id-chip">{j.code} · v{j.version}</span></span>
              <span className="tf-meta block">{j.dept}{j.note && need !== 'score' ? ` · ${j.note}` : ''}</span>
            </span>
            {taken && <span className="tf-stat-chip tf-stat-chip-success">Already has {need === 'assessment' ? 'an assessment' : 'an AI interview'}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Flows ───────────────────────────── */

type FlowName = 'home' | 'score' | 'assessment' | 'interview' | 'invite';
interface InviteSeed { target: 'assessment' | 'interview'; jobId: string; candidates: string[] }

function ScoreFlow({ guide, onStart, onCancel }: { guide: boolean; onStart: (jobId: string, ids: string[]) => void; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [job, setJob] = useState<string | null>(null);
  const [tab, setTab] = useState<'mine' | 'shared'>('mine');
  const [picked, setPicked] = useState<string[]>([]);
  const list = RESUMES.filter((r) => r.source === tab);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const jobObj = JOBS.find((j) => j.id === job);

  return (
    <>
      <Stepper steps={['Choose a job', 'Choose resumes', 'Review & start']} current={step} />
      {step === 0 && (
        <>
          <Guide on={guide}>Pick the job you are hiring for. We compare every resume against this job description and give each one a score out of 100.</Guide>
          <JobPicker value={job} onPick={setJob} need="score" />
          <Footer onBack={onCancel} backLabel="Cancel" next={() => setStep(1)} nextLabel="Next: choose resumes" nextDisabled={!job} />
        </>
      )}
      {step === 1 && (
        <>
          <Guide on={guide}>Tick the resumes to score. <b>My Resumes</b> are ones you uploaded; <b>Shared Database</b> holds resumes your whole team can use. Your picks stay on the right — no second confirmation popup.</Guide>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="tf-card-soft tf-card-pad">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {(['mine', 'shared'] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={`tf-btn tf-btn-sm ${tab === t ? 'tf-btn-primary' : 'tf-btn-secondary'}`}>
                    {t === 'mine' ? <Folder className="h-3.5 w-3.5" /> : <Database className="h-3.5 w-3.5" />}{t === 'mine' ? 'My Resumes' : 'Shared Database'}
                  </button>
                ))}
                <button className="tf-btn tf-btn-sm tf-btn-secondary ml-auto"><Upload className="h-3.5 w-3.5" />Upload new</button>
              </div>
              <button className="tf-meta mb-2 underline" onClick={() => setPicked((p) => Array.from(new Set([...p, ...list.map((r) => r.id)])))}>Select all {list.length}</button>
              <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                {list.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-2.5">
                      <input type="checkbox" className="tf-checkbox h-4 w-4" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
                      <span className="flex-1"><span className="tf-row-name block">{r.name}</span><span className="tf-meta">{r.role} · {r.exp} yrs · {r.folder}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <aside className="tf-card-soft tf-card-pad h-fit">
              <p className="tf-eyebrow">Selected</p>
              <p className="tf-stat-value">{picked.length}</p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
                {picked.map((id) => {
                  const r = RESUMES.find((x) => x.id === id)!;
                  return <li key={id} className="flex items-center justify-between tf-body"><span>{r.name}</span><button onClick={() => toggle(id)} aria-label={`Remove ${r.name}`}><X className="h-3.5 w-3.5 text-gray-400" /></button></li>;
                })}
              </ul>
            </aside>
          </div>
          <Footer onBack={() => setStep(0)} next={() => setStep(2)} nextLabel="Next: review" nextDisabled={!picked.length} />
        </>
      )}
      {step === 2 && jobObj && (
        <>
          <Guide on={guide}>Check everything once. Scoring runs in the background — you can <Term k="Minimize">minimize</Term> it and keep working.</Guide>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="tf-card-soft tf-card-pad"><p className="tf-eyebrow">Job</p><p className="tf-row-title">{jobObj.title}</p><p className="tf-meta">{jobObj.code} · <Term k="Version">v{jobObj.version}</Term></p></div>
            <div className="tf-card-soft tf-card-pad"><p className="tf-eyebrow">Resumes</p><p className="tf-stat-value">{picked.length}</p></div>
            <div className="tf-card-soft tf-card-pad"><p className="tf-eyebrow"><Term k="Units" /> needed</p><p className="tf-stat-value">{picked.length}</p><p className="tf-meta">You have 120 · {120 - picked.length} left after</p></div>
          </div>
          <Footer onBack={() => setStep(1)} next={() => onStart(jobObj.id, picked)} nextLabel={`Start scoring ${picked.length} resumes`} hint={<span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />~{Math.max(1, Math.ceil(picked.length / 4))} min</span>} />
        </>
      )}
    </>
  );
}

function AssessmentFlow({ guide, presetJob, onPublished, onCancel }: { guide: boolean; presetJob?: string; onPublished: (jobId: string) => void; onCancel: () => void }) {
  const [step, setStep] = useState(presetJob ? 1 : 0);
  const [job, setJob] = useState<string | null>(presetJob ?? null);
  const [rounds, setRounds] = useState({ hr: true, tech: true, code: false });
  const [secure, setSecure] = useState({ camera: true, screen: true, tab: true });
  const [mins, setMins] = useState(45);
  const jobObj = JOBS.find((j) => j.id === job);
  const enabled = Object.values(rounds).filter(Boolean).length;

  return (
    <>
      <Stepper steps={['Choose a job', 'Rounds', 'Security', 'Review & publish']} current={step} />
      {step === 0 && (
        <>
          <Guide on={guide}>An assessment is an online test candidates take by themselves. Pick the job it is for — questions are generated from that job description.</Guide>
          <JobPicker value={job} onPick={setJob} need="assessment" />
          <Footer onBack={onCancel} backLabel="Cancel" next={() => setStep(1)} nextLabel="Next: rounds" nextDisabled={!job} />
        </>
      )}
      {step === 1 && (
        <>
          <Guide on={guide}>Choose the <Term k="Rounds">rounds</Term>. We split the time between them automatically — you can fine-tune later.</Guide>
          <div className="grid gap-3 md:grid-cols-3">
            <Toggle on={rounds.hr} onChange={(v) => setRounds({ ...rounds, hr: v })} icon={MessageSquare} label="HR questions" desc="Communication & culture fit, from your question bank" />
            <Toggle on={rounds.tech} onChange={(v) => setRounds({ ...rounds, tech: v })} icon={ClipboardList} label="Technical questions" desc="Multiple-choice on the job's skills" />
            <Toggle on={rounds.code} onChange={(v) => setRounds({ ...rounds, code: v })} icon={Code} label="Coding task" desc="Hands-on problem in a code editor" />
          </div>
          <div className="tf-card-soft tf-card-pad mt-4">
            <label className="tf-label">Total time: <b>{mins} min</b></label>
            <input type="range" min={15} max={90} step={5} value={mins} onChange={(e) => setMins(+e.target.value)} className="mt-2 w-full accent-[var(--brand-blue)]" />
            <p className="tf-meta mt-1">{enabled ? `About ${Math.round(mins / enabled)} min per round` : 'Turn on at least one round'}</p>
          </div>
          <Footer onBack={presetJob ? onCancel : () => setStep(0)} next={() => setStep(2)} nextLabel="Next: security" nextDisabled={!enabled} />
        </>
      )}
      {step === 2 && (
        <>
          <Guide on={guide}>Security keeps the test fair. Everything is on by default; candidates see these rules before they start.</Guide>
          <div className="grid gap-3 md:grid-cols-3">
            <Toggle on={secure.camera} onChange={(v) => setSecure({ ...secure, camera: v })} icon={Video} label="Camera recording" desc="Records the candidate's camera" />
            <Toggle on={secure.screen} onChange={(v) => setSecure({ ...secure, screen: v })} icon={Eye} label="Screen recording" desc="Records the candidate's screen" />
            <Toggle on={secure.tab} onChange={(v) => setSecure({ ...secure, tab: v })} icon={Shield} label="Tab-switch alerts" desc="Flags when they leave the test" />
          </div>
          <Footer onBack={() => setStep(1)} next={() => setStep(3)} nextLabel="Next: review" />
        </>
      )}
      {step === 3 && jobObj && (
        <>
          <Guide on={guide}><b>Publish</b> makes the assessment ready to send. <b>Save as draft</b> keeps it private so you can finish later. Nothing is sent to candidates yet.</Guide>
          <dl className="tf-card-soft tf-card-pad grid gap-4 sm:grid-cols-2">
            <div><dt className="tf-meta">Job</dt><dd className="tf-row-name">{jobObj.title} · {jobObj.code} v{jobObj.version}</dd></div>
            <div><dt className="tf-meta">Rounds</dt><dd className="tf-row-name">{[rounds.hr && 'HR', rounds.tech && 'Technical', rounds.code && 'Coding'].filter(Boolean).join(' + ')}</dd></div>
            <div><dt className="tf-meta">Time</dt><dd className="tf-row-name">{mins} minutes</dd></div>
            <div><dt className="tf-meta">Security</dt><dd className="tf-row-name">{[secure.camera && 'Camera', secure.screen && 'Screen', secure.tab && 'Tab alerts'].filter(Boolean).join(', ') || 'Off'}</dd></div>
          </dl>
          <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-gray-200 pt-4 dark:border-slate-700">
            <button onClick={() => setStep(2)} className="tf-btn tf-btn-md tf-btn-secondary"><ChevronLeft className="h-4 w-4" />Back</button>
            <div className="flex gap-2">
              <button onClick={onCancel} className="tf-btn tf-btn-md tf-btn-secondary">Save as draft</button>
              <button onClick={() => onPublished(jobObj.id)} className="tf-btn tf-btn-md tf-btn-primary"><Check className="h-4 w-4" />Publish assessment</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function InterviewFlow({ guide, presetJob, onPublished, onCancel }: { guide: boolean; presetJob?: string; onPublished: (jobId: string) => void; onCancel: () => void }) {
  const [step, setStep] = useState(presetJob ? 1 : 0);
  const [job, setJob] = useState<string | null>(presetJob ?? null);
  const [mode, setMode] = useState<'timed' | 'chat'>('timed');
  const [topics, setTopics] = useState(['Gameplay programming', 'Performance & optimisation', 'Team collaboration', 'Problem solving']);
  const [regen, setRegen] = useState(false);
  const jobObj = JOBS.find((j) => j.id === job);

  return (
    <>
      <Stepper steps={['Choose a job', 'Interview style', 'Skill topics', 'Review & publish']} current={step} />
      {step === 0 && (
        <>
          <Guide on={guide}>An AI interview is a video interview run by an AI interviewer. Candidates answer spoken questions; you get a scored report and the recording.</Guide>
          <JobPicker value={job} onPick={setJob} need="interview" />
          <Footer onBack={onCancel} backLabel="Cancel" next={() => setStep(1)} nextLabel="Next: interview style" nextDisabled={!job} />
        </>
      )}
      {step === 1 && (
        <>
          <Guide on={guide}>Choose how the interview feels. Both take about 30 minutes.</Guide>
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle on={mode === 'timed'} onChange={() => setMode('timed')} icon={Clock} label="Timed" desc="Fixed time per question — best for comparing candidates fairly" />
            <Toggle on={mode === 'chat'} onChange={() => setMode('chat')} icon={MessageSquare} label="Conversational" desc="AI asks follow-ups based on answers — feels like a real chat" />
          </div>
          <Footer onBack={presetJob ? onCancel : () => setStep(0)} next={() => setStep(2)} nextLabel="Next: skill topics" />
        </>
      )}
      {step === 2 && (
        <>
          <Guide on={guide}>These <Term k="Skill topics">skill topics</Term> were created from the job description. Remove any you don&apos;t need or regenerate them.</Guide>
          <div className="tf-card-soft tf-card-pad">
            <div className="flex flex-wrap gap-2">
              {regen ? <span className="tf-meta inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Generating…</span> : topics.map((t) => (
                <span key={t} className="tf-stat-chip tf-stat-chip-info text-sm">{t}<button aria-label={`Remove ${t}`} onClick={() => setTopics(topics.filter((x) => x !== t))}><X className="h-3 w-3" /></button></span>
              ))}
            </div>
            <button className="tf-btn tf-btn-sm tf-btn-secondary mt-4" onClick={() => { setRegen(true); setTimeout(() => { setTopics(['Game engine (Unity/Unreal)', 'C++ & scripting', 'Performance', 'Teamwork']); setRegen(false); }, 1200); }}>
              <Sparkles className="h-3.5 w-3.5" />Regenerate with AI
            </button>
          </div>
          <Footer onBack={() => setStep(1)} next={() => setStep(3)} nextLabel="Next: review" nextDisabled={!topics.length || regen} />
        </>
      )}
      {step === 3 && jobObj && (
        <>
          <Guide on={guide}><b>Publish</b> makes the interview ready to send. Nothing goes to candidates until you invite them.</Guide>
          <dl className="tf-card-soft tf-card-pad grid gap-4 sm:grid-cols-2">
            <div><dt className="tf-meta">Job</dt><dd className="tf-row-name">{jobObj.title} · {jobObj.code} v{jobObj.version}</dd></div>
            <div><dt className="tf-meta">Style</dt><dd className="tf-row-name">{mode === 'timed' ? 'Timed' : 'Conversational'} · ~30 min</dd></div>
            <div className="sm:col-span-2"><dt className="tf-meta">Skill topics</dt><dd className="tf-row-name">{topics.join(', ')}</dd></div>
          </dl>
          <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-gray-200 pt-4 dark:border-slate-700">
            <button onClick={() => setStep(2)} className="tf-btn tf-btn-md tf-btn-secondary"><ChevronLeft className="h-4 w-4" />Back</button>
            <div className="flex gap-2">
              <button onClick={onCancel} className="tf-btn tf-btn-md tf-btn-secondary">Save as draft</button>
              <button onClick={() => onPublished(jobObj.id)} className="tf-btn tf-btn-md tf-btn-primary"><Check className="h-4 w-4" />Publish AI interview</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function PublishedScreen({ kind, jobId, onInvite, onHome }: { kind: 'assessment' | 'interview'; jobId: string; onInvite: () => void; onHome: () => void }) {
  const j = JOBS.find((x) => x.id === jobId)!;
  return (
    <div className="mx-auto max-w-lg py-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle"><CheckCircle2 className="h-8 w-8 text-success-strong" /></div>
      <h2 className="tf-page-title">{kind === 'assessment' ? 'Assessment' : 'AI interview'} published</h2>
      <p className="tf-body-muted mt-1">{j.title} · {j.code} v{j.version} is ready. <b>Next step:</b> invite candidates.</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button onClick={onInvite} className="tf-btn tf-btn-md tf-btn-primary"><Send className="h-4 w-4" />Invite candidates</button>
        <button onClick={onHome} className="tf-btn tf-btn-md tf-btn-secondary">I&apos;ll do it later</button>
      </div>
    </div>
  );
}

function InviteFlow({ guide, seed, onSend, onCancel, onNeedCreate }: {
  guide: boolean; seed: InviteSeed; onSend: (s: InviteSeed) => void; onCancel: () => void; onNeedCreate: (s: InviteSeed) => void;
}) {
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(seed.target);
  const [picked, setPicked] = useState<string[]>(seed.candidates);
  const [expiry, setExpiry] = useState(7);
  const job = JOBS.find((j) => j.id === seed.jobId)!;
  const exists = target === 'assessment' ? job.hasAssessment : job.hasInterview;
  const what = target === 'assessment' ? 'assessment' : 'AI interview';

  return (
    <>
      <Stepper steps={['What to send', 'Who gets it', 'Message & send']} current={step} />
      {step === 0 && (
        <>
          <Guide on={guide}>Choose what to send for <b>{job.title}</b>. If it doesn&apos;t exist yet we&apos;ll help you create it first, then bring you straight back here.</Guide>
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle on={target === 'assessment'} onChange={() => setTarget('assessment')} icon={ClipboardList} label="Assessment" desc={job.hasAssessment ? `Ready · ${job.code} v${job.version}` : 'Not created yet for this job'} />
            <Toggle on={target === 'interview'} onChange={() => setTarget('interview')} icon={Bot} label="AI interview" desc={job.hasInterview ? `Ready · ${job.code} v${job.version}` : 'Not created yet for this job'} />
          </div>
          {!exists && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-warning-strong/30 bg-warning-subtle p-3 text-sm text-warning-strong">
              <Info className="h-4 w-4" />This job has no {what} yet.
              <button className="tf-btn tf-btn-sm tf-btn-primary ml-auto" onClick={() => onNeedCreate({ target, jobId: job.id, candidates: picked })}>Create {what} now</button>
            </div>
          )}
          <Footer onBack={onCancel} backLabel="Cancel" next={() => setStep(1)} nextLabel="Next: choose candidates" nextDisabled={!exists} />
        </>
      )}
      {step === 1 && (
        <>
          <Guide on={guide}>{seed.candidates.length ? 'We pre-selected the strong matches from your scoring. ' : ''}Add or remove candidates. Each one uses 1 <Term k="Units">unit</Term>.</Guide>
          <div className="mb-3 flex flex-wrap gap-2">
            {[['Scored resumes', FileSearch], ['My Resumes', Folder], ['Upload Excel', Upload], ['Add manually', UserPlus]].map(([l, I]) => {
              const C = I as Icon;
              return <button key={l as string} className="tf-btn tf-btn-sm tf-btn-secondary"><C className="h-3.5 w-3.5" />{l as string}</button>;
            })}
          </div>
          <ul className="tf-card-soft divide-y divide-gray-100 dark:divide-slate-700">
            {RESUMES.slice(0, 6).map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                  <input type="checkbox" className="tf-checkbox h-4 w-4" checked={picked.includes(r.id)} onChange={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))} />
                  <span className="flex-1 tf-row-name">{r.name}</span><span className="tf-meta">{r.role}</span>
                </label>
              </li>
            ))}
          </ul>
          <Footer onBack={() => setStep(0)} next={() => setStep(2)} nextLabel="Next: message" nextDisabled={!picked.length} hint={`${picked.length} selected`} />
        </>
      )}
      {step === 2 && (
        <>
          <Guide on={guide}>Candidates get an email with a personal link. Sending happens in the background — you can minimize and keep working.</Guide>
          <div className="tf-card-soft tf-card-pad space-y-4">
            <div><label className="tf-label">Email message</label>
              <textarea className="tf-input mt-1 h-28 py-2" defaultValue={`Hi {name},\n\nYou're invited to the ${what} for ${job.title}. Please complete it before the link expires.\n\nThanks`} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="tf-label">Link expires in</label>
              {[3, 7, 14].map((d) => <button key={d} onClick={() => setExpiry(d)} className={`tf-btn tf-btn-sm ${expiry === d ? 'tf-btn-primary' : 'tf-btn-secondary'}`}>{d} days</button>)}
              <span className="tf-meta ml-auto inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5" />Uses {picked.length} units · 120 available</span>
            </div>
          </div>
          <Footer onBack={() => setStep(1)} next={() => onSend({ target, jobId: job.id, candidates: picked })} nextLabel={`Send to ${picked.length} candidates`} />
        </>
      )}
    </>
  );
}

/* ───────────────────────────── Progress window + Activity dock ───────────────────────────── */

function ProgressWindow({ task, onMinimize, onClose, onNext }: { task: Task; onMinimize: () => void; onClose: () => void; onNext: (target: 'assessment' | 'interview') => void }) {
  const finished = task.done + task.failed >= task.total;
  const pct = Math.round(((task.done + task.failed) / task.total) * 100);
  const strong = task.results?.filter((r) => r.score >= 80) ?? [];
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 p-5 dark:border-slate-700">
          <div>
            <p className="tf-eyebrow">{task.kind === 'score' ? 'Scoring resumes' : 'Sending invites'}</p>
            <h2 className="tf-section-title">{task.title}</h2>
            <p className="tf-meta">{task.subtitle}</p>
          </div>
          <div className="flex gap-1">
            {/* Same two buttons, same words, in every progress window. */}
            <button onClick={onMinimize} className="tf-btn tf-btn-sm tf-btn-secondary" title="Keeps running — find it in Activity"><Minimize2 className="h-3.5 w-3.5" />Minimize</button>
            {finished && <button onClick={onClose} className="tf-icon-btn" aria-label="Close"><X className="h-4 w-4" /></button>}
          </div>
        </header>
        <div className="p-5">
          <div className="flex items-baseline justify-between">
            <span className="tf-row-title">{finished ? 'All done' : `${task.done + task.failed} of ${task.total} ${task.kind === 'score' ? 'scored' : 'sent'}`}</span>
            <span className="tf-meta tabular-nums">{pct}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-slate-700"><div className="h-2 rounded-full bg-brand-blue transition-all" style={{ width: `${pct}%` }} /></div>
          {!finished && <p className="tf-meta mt-2 inline-flex items-center gap-1.5"><Info className="h-3.5 w-3.5" />You can minimize this — it keeps running and you&apos;ll get a notification when it&apos;s done.</p>}

          {task.kind === 'score' && task.results && (
            <ul className="mt-4 max-h-60 divide-y divide-gray-100 overflow-auto rounded-lg border border-gray-200 dark:divide-slate-700 dark:border-slate-700">
              {task.results.map((r, i) => {
                const doneRow = i < task.done;
                const v = verdict(r.score);
                return (
                  <li key={r.resume.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="tf-row-name flex-1">{r.resume.name}</span>
                    {doneRow ? <><span className="tf-row-title tabular-nums">{r.score}</span><span className={`tf-stat-chip ${v.c}`}>{v.t}</span></> : <span className="tf-meta inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Scoring…</span>}
                  </li>
                );
              })}
            </ul>
          )}

          {finished && task.kind === 'score' && (
            <div className="mt-5 rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-4">
              <p className="tf-row-title flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-blue" />What next?</p>
              <p className="tf-body mt-1">{strong.length} strong <Term k="Match">match{strong.length === 1 ? '' : 'es'}</Term>. Invite them to the next round:</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={!strong.length} onClick={() => onNext('assessment')} className="tf-btn tf-btn-sm tf-btn-primary"><ClipboardList className="h-3.5 w-3.5" />Send assessment to {strong.length}</button>
                <button disabled={!strong.length} onClick={() => onNext('interview')} className="tf-btn tf-btn-sm tf-btn-secondary"><Bot className="h-3.5 w-3.5" />Send AI interview to {strong.length}</button>
                <button onClick={onClose} className="tf-btn tf-btn-sm tf-btn-secondary">View all results</button>
              </div>
            </div>
          )}
          {finished && task.kind === 'invite' && (
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-success-subtle p-4 text-success-strong">
              <CheckCircle2 className="h-5 w-5" /><span className="text-sm">{task.done} invites sent. Track who opened and completed them in <b>Invite status</b>.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityDock({ tasks, onOpen, onClear }: { tasks: Task[]; onOpen: (id: string) => void; onClear: () => void }) {
  const [open, setOpen] = useState(true);
  const minimized = tasks.filter((t) => t.minimized);
  if (!minimized.length) return null;
  const running = minimized.filter((t) => t.done + t.failed < t.total).length;
  return (
    <div className="fixed bottom-4 right-4 z-30 w-80 max-w-[calc(100vw-2rem)]">
      {open ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-slate-700">
            <span className="tf-row-title inline-flex items-center gap-2"><Activity className="h-4 w-4 text-brand-blue" />Activity {running > 0 && <span className="tf-stat-chip tf-stat-chip-info">{running} running</span>}</span>
            <div className="flex gap-1">
              <button onClick={onClear} className="tf-meta px-1 hover:underline">Clear done</button>
              <button onClick={() => setOpen(false)} className="tf-icon-btn h-7 w-7" aria-label="Hide activity"><ChevronRight className="h-4 w-4 rotate-90" /></button>
            </div>
          </div>
          <ul className="max-h-72 divide-y divide-gray-100 overflow-auto dark:divide-slate-700">
            {minimized.map((t) => {
              const finished = t.done + t.failed >= t.total;
              const pct = Math.round(((t.done + t.failed) / t.total) * 100);
              return (
                <li key={t.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {t.kind === 'score' ? <FileSearch className="h-4 w-4 text-gray-400" /> : <Mail className="h-4 w-4 text-gray-400" />}
                    <span className="tf-row-name flex-1 truncate">{t.title}</span>
                    {finished ? <CheckCircle2 className="h-4 w-4 text-success-strong" /> : <span className="tf-meta tabular-nums">{pct}%</span>}
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-slate-700"><div className={`h-1.5 rounded-full ${finished ? 'bg-success-strong' : 'bg-brand-blue'}`} style={{ width: `${pct}%` }} /></div>
                  <button onClick={() => onOpen(t.id)} className="tf-meta mt-1 hover:text-brand-blue hover:underline">{finished ? (t.kind === 'score' ? 'View results & next steps' : 'View details') : 'Open'}</button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="ml-auto flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 text-sm text-white shadow-xl dark:bg-slate-100 dark:text-slate-900">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Activity · {minimized.length}
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────── Page ───────────────────────────── */

export default function RecruitmentFlowPreview() {
  const [flow, setFlow] = useState<FlowName>('home');
  const [guide, setGuide] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [published, setPublished] = useState<{ kind: 'assessment' | 'interview'; jobId: string } | null>(null);
  const [inviteSeed, setInviteSeed] = useState<InviteSeed | null>(null);
  const [returnTo, setReturnTo] = useState<InviteSeed | null>(null);
  const [presetJob, setPresetJob] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);
  const [, force] = useState(0);
  const notified = useRef(new Set<string>());

  // Fake progress: every task advances one item every ~0.9 s.
  useEffect(() => {
    const t = setInterval(() => {
      setTasks((list) => list.map((k) => (k.done + k.failed < k.total ? { ...k, done: k.done + 1 } : k)));
    }, 900);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    tasks.forEach((t) => {
      if (t.done + t.failed >= t.total && !notified.current.has(t.id)) {
        notified.current.add(t.id);
        if (t.minimized) setToast(`${t.kind === 'score' ? 'Scoring' : 'Invites'} finished: ${t.title}`);
      }
    });
  }, [tasks]);
  useEffect(() => { if (toast) { const x = setTimeout(() => setToast(null), 4000); return () => clearTimeout(x); } }, [toast]);

  const home = () => { setFlow('home'); setPublished(null); setInviteSeed(null); setPresetJob(undefined); };
  const current = useMemo(() => tasks.find((t) => t.id === openTask) ?? null, [tasks, openTask]);

  const startScoring = (jobId: string, ids: string[]) => {
    const j = JOBS.find((x) => x.id === jobId)!;
    const id = `t${Date.now()}`;
    const results = ids.map((rid) => ({ resume: RESUMES.find((r) => r.id === rid)!, score: 35 + Math.floor(Math.random() * 64) }));
    setTasks((l) => [...l, { id, kind: 'score', title: `${j.title} · v${j.version}`, subtitle: `${ids.length} resumes`, total: ids.length, done: 0, failed: 0, minimized: false, results, jobId }]);
    setOpenTask(id);
    home();
  };
  const sendInvites = (s: InviteSeed) => {
    const j = JOBS.find((x) => x.id === s.jobId)!;
    const id = `t${Date.now()}`;
    setTasks((l) => [...l, { id, kind: 'invite', title: `${s.target === 'assessment' ? 'Assessment' : 'AI interview'} · ${j.title}`, subtitle: `${s.candidates.length} candidates`, total: s.candidates.length, done: 0, failed: 0, minimized: false, jobId: s.jobId }]);
    setOpenTask(id);
    home();
  };
  const minimize = (id: string) => { setTasks((l) => l.map((t) => (t.id === id ? { ...t, minimized: true } : t))); setOpenTask(null); };
  const closeTask = (id: string) => { setTasks((l) => l.filter((t) => t.id !== id)); setOpenTask(null); };

  const nextFromScore = (task: Task, target: 'assessment' | 'interview') => {
    const strong = (task.results ?? []).filter((r) => r.score >= 80).map((r) => r.resume.id);
    closeTask(task.id);
    setInviteSeed({ target, jobId: task.jobId, candidates: strong });
    setFlow('invite');
  };
  const needCreate = (s: InviteSeed) => {
    setReturnTo(s); setPresetJob(s.jobId); setFlow(s.target === 'assessment' ? 'assessment' : 'interview');
  };
  const onPublished = (kind: 'assessment' | 'interview', jobId: string) => {
    const j = JOBS.find((x) => x.id === jobId)!;
    if (kind === 'assessment') j.hasAssessment = true; else j.hasInterview = true;
    force((n) => n + 1);
    if (returnTo && returnTo.jobId === jobId) {
      setToast(`${kind === 'assessment' ? 'Assessment' : 'AI interview'} published — back to your invite`);
      setInviteSeed({ ...returnTo, target: kind }); setReturnTo(null); setPresetJob(undefined); setFlow('invite');
      return;
    }
    setPublished({ kind, jobId });
  };

  const CARDS: { key: FlowName; icon: Icon; title: string; what: string; need: string; time: string }[] = [
    { key: 'score', icon: FileSearch, title: 'Score resumes', what: 'Rank resumes against a job — see who fits best.', need: 'A job + resumes', time: '~1 min per 4 resumes' },
    { key: 'assessment', icon: ClipboardList, title: 'Create an assessment', what: 'An online test candidates take on their own.', need: 'A published job', time: '~3 min to set up' },
    { key: 'interview', icon: Bot, title: 'Create an AI interview', what: 'A video interview run by an AI interviewer.', need: 'A published job', time: '~3 min to set up' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#111827]">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-3">
          <span className="tf-eyebrow">Preview · Hiring flow (mock data)</span>
          <button onClick={home} className="tf-btn tf-btn-sm tf-btn-secondary">Start over</button>
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="tf-checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />First-time guide
          </label>
          <span className="tf-stat-chip tf-stat-chip-neutral"><Coins className="h-3.5 w-3.5" /><Term k="Units">120 units</Term></span>
        </div>
      </div>

      <main className="tf-page">
        <div className="mx-auto w-full max-w-[1100px]">
          <div className="tf-page-sheet">
            {published ? (
              <PublishedScreen kind={published.kind} jobId={published.jobId} onHome={home}
                onInvite={() => { setInviteSeed({ target: published.kind, jobId: published.jobId, candidates: [] }); setPublished(null); setFlow('invite'); }} />
            ) : flow === 'home' ? (
              <>
                <h1 className="tf-page-title">What would you like to do?</h1>
                <p className="tf-page-desc mb-6">Most teams go in this order: <b>score resumes → send an assessment → send an AI interview</b>. You can start anywhere.</p>
                <div className="grid gap-4 md:grid-cols-3">
                  {CARDS.map((c, i) => (
                    <button key={c.key} onClick={() => setFlow(c.key)} className="tf-card-soft group flex flex-col p-5 text-left transition hover:border-brand-blue/40 hover:shadow-md">
                      <span className="flex items-center gap-2"><span className="tf-meta">Step {i + 1}</span></span>
                      <c.icon className="mt-3 h-8 w-8 text-brand-blue" />
                      <span className="tf-section-title mt-3">{c.title}</span>
                      <span className="tf-body-muted mt-1 flex-1">{c.what}</span>
                      <span className="tf-meta mt-4 block">You need: {c.need}</span>
                      <span className="tf-meta block">Time: {c.time}</span>
                      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-blue">Start <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
                    </button>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 p-4 dark:border-slate-700">
                  <Send className="h-5 w-5 text-gray-400" />
                  <span className="tf-body flex-1">Already have an assessment or AI interview? Send it to candidates.</span>
                  <button onClick={() => { setInviteSeed({ target: 'assessment', jobId: 'j142', candidates: [] }); setFlow('invite'); }} className="tf-btn tf-btn-sm tf-btn-secondary">Invite candidates</button>
                </div>
              </>
            ) : flow === 'score' ? (
              <><h1 className="tf-page-title mb-4">Score resumes</h1><ScoreFlow guide={guide} onStart={startScoring} onCancel={home} /></>
            ) : flow === 'assessment' ? (
              <><h1 className="tf-page-title mb-4">Create an assessment</h1><AssessmentFlow key={presetJob ?? 'a'} guide={guide} presetJob={presetJob} onPublished={(j) => onPublished('assessment', j)} onCancel={returnTo ? () => { setFlow('invite'); setPresetJob(undefined); } : home} /></>
            ) : flow === 'interview' ? (
              <><h1 className="tf-page-title mb-4">Create an AI interview</h1><InterviewFlow key={presetJob ?? 'i'} guide={guide} presetJob={presetJob} onPublished={(j) => onPublished('interview', j)} onCancel={returnTo ? () => { setFlow('invite'); setPresetJob(undefined); } : home} /></>
            ) : flow === 'invite' && inviteSeed ? (
              <><h1 className="tf-page-title mb-4">Invite candidates</h1><InviteFlow key={JSON.stringify(inviteSeed)} guide={guide} seed={inviteSeed} onSend={sendInvites} onCancel={home} onNeedCreate={needCreate} /></>
            ) : null}

            {returnTo && (flow === 'assessment' || flow === 'interview') && (
              <p className="tf-meta mt-4 inline-flex items-center gap-1.5"><RotateCcw className="h-3.5 w-3.5" />After publishing you&apos;ll return to your invite with {returnTo.candidates.length} candidates still selected.</p>
            )}
          </div>
        </div>
      </main>

      {current && !current.minimized && (
        <ProgressWindow task={current} onMinimize={() => minimize(current.id)} onClose={() => closeTask(current.id)} onNext={(t) => nextFromScore(current, t)} />
      )}
      <ActivityDock
        tasks={tasks}
        onOpen={(id) => { setTasks((l) => l.map((t) => (t.id === id ? { ...t, minimized: false } : t))); setOpenTask(id); }}
        onClear={() => setTasks((l) => l.filter((t) => !(t.minimized && t.done + t.failed >= t.total)))}
      />
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-xl">{toast}</div>
      )}
    </div>
  );
}
