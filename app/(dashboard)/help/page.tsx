'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Book,
  Search,
  FileText,
  ChevronRight,
  Briefcase,
  Upload,
  Users,
  ClipboardCheck,
  BarChart3,
  CreditCard,
  Settings,
  MessageCircle,
  ArrowLeft,
  Clock,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  Zap,
  LifeBuoy,
  Sparkles,
  Bot,
  ListChecks,
  Send,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';

/* ─────────────────────────────────────────────────────────────────────────────
   Help Center / User Guide.

   Every article describes the app AS IT IS — labels, limits and rules are the
   ones the UI and backend actually use (button text in quotes is the exact
   label). When a module changes, update its article here; a guide that names a
   button that no longer exists is worse than no guide.
   ───────────────────────────────────────────────────────────────────────────── */

// ── Building blocks ──────────────────────────────────────────────────────────

const H2 = ({ icon: Icon, children }: { icon?: LucideIcon; children: React.ReactNode }) => (
  <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4 flex items-center gap-2">
    {Icon && <Icon className="w-5 h-5 text-brand-blue flex-shrink-0" />}
    {children}
  </h2>
);

const Section = ({ title, icon, children, last = false }: { title: string; icon?: LucideIcon; children: React.ReactNode; last?: boolean }) => (
  <section className={last ? '' : 'mb-10'}>
    <H2 icon={icon}>{title}</H2>
    {children}
  </section>
);

const P = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-gray-600 dark:text-slate-400 leading-relaxed mb-4 ${className}`}>{children}</p>
);

const Step = ({ number, title, children }: { number: number; title: string; children: React.ReactNode }) => (
  <div className="flex gap-4 mb-6">
    <div className="flex-shrink-0 w-8 h-8 bg-brand-blue text-white rounded-full flex items-center justify-center text-sm font-semibold shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
      {number}
    </div>
    <div className="flex-1 min-w-0">
      <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-2">{title}</h4>
      <div className="text-gray-600 dark:text-slate-400 leading-relaxed">{children}</div>
    </div>
  </div>
);

const Tip = ({ type = 'tip', children }: { type?: 'tip' | 'warning' | 'info'; children: React.ReactNode }) => {
  const styles = {
    tip: { bg: 'bg-brand-cyan/5', border: 'ring-1 ring-brand-cyan/20', icon: Lightbulb, iconColor: 'text-brand-cyan', label: 'Pro Tip' },
    warning: { bg: 'bg-brand-orange/5', border: 'ring-1 ring-brand-orange/20', icon: AlertTriangle, iconColor: 'text-brand-orange-deep', label: 'Important' },
    info: { bg: 'bg-brand-blue/5', border: 'ring-1 ring-brand-blue/15', icon: Info, iconColor: 'text-brand-blue', label: 'Note' },
  };
  const style = styles[type];
  const Icon = style.icon;
  return (
    <div className={`${style.bg} ${style.border} rounded-xl p-4 my-6`}>
      <div className="flex gap-3">
        <Icon className={`w-5 h-5 ${style.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="min-w-0">
          <span className={`font-semibold ${style.iconColor} text-sm`}>{style.label}</span>
          <div className="text-gray-700 dark:text-slate-300 mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
};

const FeatureItem = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-3 py-1.5">
    <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
    <span className="text-gray-700 dark:text-slate-300 min-w-0">{children}</span>
  </li>
);

const Features = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="space-y-0.5 mb-4">{items.map((item, i) => <FeatureItem key={i}>{item}</FeatureItem>)}</ul>
);

/** "Where to find it" breadcrumb. The last crumb links to the page when `href` is set. */
const NavPath = ({ items, href }: { items: string[]; href?: string }) => (
  <div className="mb-3 flex flex-wrap items-center gap-y-2">
    {items.map((item, i) => {
      const isLast = i === items.length - 1;
      const chip = isLast && href ? (
        <Link href={href} className="bg-brand-blue/10 text-brand-blue px-2 py-1 rounded tf-label hover:bg-brand-blue/15 inline-flex items-center gap-1">
          {item}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      ) : (
        <span className="bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded tf-label">{item}</span>
      );
      return (
        <span key={item} className="inline-flex items-center">
          {chip}
          {!isLast && <ChevronRight className="w-4 h-4 mx-1.5 text-gray-400 dark:text-slate-500" />}
        </span>
      );
    })}
  </div>
);

const CardGrid = ({ items, cols = 2 }: { items: [title: string, text: React.ReactNode][]; cols?: 2 | 3 }) => (
  <div className={`grid gap-3 mb-4 ${cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
    {items.map(([title, text]) => (
      <div key={title} className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg min-w-0">
        <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">{title}</div>
        <div className="tf-body-secondary">{text}</div>
      </div>
    ))}
  </div>
);

/** Two-or-more column reference table; cards on phones, a table from lg up. */
const RefTable = ({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) => (
  <div className="mb-4">
    <div className={`overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700 tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
      <table className="w-full">
        <thead className="bg-white dark:bg-slate-900">
          <tr>{head.map((h) => <th key={h} className="tf-th-cell text-left tf-th">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className={`tf-td ${c === 0 ? 'tf-row-name' : 'tf-body-secondary'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <MobileRecordList>
      {rows.map((row, r) => (
        <MobileRecordCard
          key={r}
          title={row[0]}
          fields={row.slice(1).map((value, c) => ({ label: head[c + 1], value }))}
        />
      ))}
    </MobileRecordList>
  </div>
);

const Pills = ({ items }: { items: string[] }) => (
  <div className="flex flex-wrap gap-2 mb-4">
    {items.map((item) => (
      <span key={item} className="px-3 py-1 bg-gray-100 dark:bg-slate-800 rounded-full tf-body">{item}</span>
    ))}
  </div>
);

const StatusBand = ({ tone, label, text }: { tone: 'success' | 'warning' | 'muted'; label: string; text: React.ReactNode }) => {
  const toneClass = {
    success: 'bg-success-subtle ring-1 ring-success-line text-success-strong',
    warning: 'bg-warning-subtle ring-1 ring-warning-line text-warning-strong',
    muted: 'bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300',
  }[tone];
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 p-4 rounded-lg ${toneClass}`}>
      <div className="font-semibold sm:w-36 flex-shrink-0">{label}</div>
      <div className="text-sm min-w-0">{text}</div>
    </div>
  );
};

// ── Articles ─────────────────────────────────────────────────────────────────

type Article = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  readTime: string;
  icon: LucideIcon;
  /** Extra words the search box should match (labels, synonyms). */
  keywords: string;
  content: React.ReactNode;
};

const helpArticles: Record<string, Article> = {
  'getting-started': {
    id: 'getting-started',
    title: 'Getting Started with TalentFlow',
    subtitle: 'Find your way around and set up your hiring workflow',
    category: 'basics',
    readTime: '5 min',
    icon: Book,
    keywords: 'dashboard quick access navigation menu profile header units chat notifications bell first steps',
    content: (
      <>
        <Section title="Welcome to TalentFlow" icon={Zap}>
          <P>
            TalentFlow is an AI-powered recruitment platform: create job descriptions, build a resume database,
            score and match candidates with AI, then evaluate them with AI Assessments and AI Interviews.
          </P>
        </Section>

        <Section title="Finding your way around" icon={ListChecks}>
          <CardGrid items={[
            ['Dashboard → Quick access', 'Tiles for Job Descriptions, Resume Scoring, AI Talent Match, AI Assessments, AI Interviews, Resume Database, User Management and Teams.'],
            ['Profile menu (your name, top right)', 'Profile Settings, Upgrade Plans, Company Profile, Audit Log, User Guide, Support Tickets and Sign Out.'],
            ['Units pill (header)', 'Shows how many units you have left. Open it to see each unit type, or click "Purchase Add-ons".'],
            ['Chat & notifications (header)', 'The chat icon opens Team Chat with its own unread badge; the bell shows system notifications.'],
          ]} />
          <Tip type="info">
            Items you cannot use are never hidden — they are greyed out, and hovering them tells you why (missing
            permission or not in your plan). Ask your account owner if you need access.
          </Tip>
        </Section>

        <Section title="Quick start">
          <Step number={1} title="Complete your company profile">
            <NavPath items={['Profile menu', 'Company Profile']} href="/organization/company-profile" />
            <p>Add contact details, industry, company size, headquarters address and an About section.</p>
          </Step>
          <Step number={2} title="Invite your team">
            <NavPath items={['Dashboard', 'User Management']} href="/organization/user-management" />
            <p>Click <strong>“Invite User”</strong> and pick a role. They receive an email with a temporary password and set their own on first login.</p>
          </Step>
          <Step number={3} title="Create a job description">
            <NavPath items={['Dashboard', 'Job Descriptions']} href="/recruitment/job-openings" />
            <p>Click <strong>“Create New Job”</strong>, let AI write it (or paste your own), review the extracted skills and publish.</p>
          </Step>
          <Step number={4} title="Upload resumes">
            <NavPath items={['Dashboard', 'Resume Database']} href="/recruitment/resume-database" />
            <p>Click <strong>“Upload Resume”</strong> — one file or up to 100 at once. AI extracts the candidate details.</p>
          </Step>
          <Step number={5} title="Find and evaluate candidates">
            <Features items={[
              <><strong>AI Talent Match</strong> — find the closest resumes for a job (free)</>,
              <><strong>Resume Scoring</strong> — a detailed AI score out of 10 per candidate</>,
              <><strong>AI Assessments</strong> and <strong>AI Interviews</strong> — invite shortlisted candidates</>,
            ]} />
          </Step>
        </Section>

        <Section title="Need more help?" last>
          <P className="mb-0">
            Raise a ticket from <Link href="/support-tickets" className="text-brand-blue hover:underline">Support Tickets</Link> or
            email <a href="mailto:support@talentflow.com" className="text-brand-blue hover:underline">support@talentflow.com</a>.
          </P>
        </Section>
      </>
    ),
  },

  'create-job-description': {
    id: 'create-job-description',
    title: 'How to Create a Job Description',
    subtitle: 'AI-generated or manual JDs, extraction, publishing and versions',
    category: 'recruitment',
    readTime: '7 min',
    icon: Briefcase,
    keywords: 'jd job opening create new job ai generated manual extract review publish republish draft disable archive version must-have nice-to-have skills salary',
    content: (
      <>
        <Section title="Overview">
          <P>
            Every job description (JD) is the source for scoring, matching, assessments and AI interviews — the
            skills you mark as <strong>Must-Have</strong> and <strong>Nice-to-Have</strong> drive how candidates are evaluated.
          </P>
          <NavPath items={['Dashboard', 'Job Descriptions']} href="/recruitment/job-openings" />
        </Section>

        <Section title="Creating a JD">
          <Step number={1} title="Click &quot;Create New Job&quot;">
            <p className="mb-3">Choose how to start:</p>
            <CardGrid items={[
              ['AI-Generated JD', 'Enter the job title and a short brief; AI writes a professional job description.'],
              ['Manual Input', 'Write or paste your own job description.'],
            ]} />
          </Step>
          <Step number={2} title="Extract">
            <p className="mb-3">AI reads the JD and fills in the structured details. Fields marked * are required:</p>
            <Pills items={['Must-Have Skills *', 'Nice-to-Have Skills', 'Must-Have / Nice-to-Have Additional Requirements', 'Experience *', 'Industry Type *', 'Locations *', 'Employment Type', 'Work Mode', 'Salary Range', 'Certifications', 'Domain Keywords']} />
            <p>Drag a skill (or use the arrow buttons) to move it between Must-Have and Nice-to-Have.</p>
          </Step>
          <Step number={3} title="Review">
            <p>Check everything, then click <strong>“Confirm &amp; Publish”</strong> — or <strong>“Save as Draft”</strong> to finish later.</p>
          </Step>
          <Step number={4} title="Publish">
            <p>Only <strong>Published</strong> jobs can be scored, matched, assessed or interviewed. Drafts are not offered anywhere else.</p>
          </Step>
        </Section>

        <Tip type="tip">
          Be precise with Must-Have skills: a candidate who fails any required criterion is a <strong>No Match</strong> in
          Resume Scoring. Put desirable-but-optional skills in Nice-to-Have.
        </Tip>

        <Section title="Private and shared notes">
          <RefTable head={['Field', 'Who sees it']} rows={[
            ['Additional Details', 'Visible to candidates'],
            ['Assessment Guidance', 'Visible to the assessment team'],
            ['Internal Recruiter Notes', 'Private'],
          ]} />
        </Section>

        <Section title="Editing and versions">
          <Features items={[
            'A JD that is not in use yet is edited in place.',
            <>A JD already used for scoring, matching, assessments or interviews cannot be changed — choose <strong>“Create New Version”</strong>. The new version starts as a draft; publishing it makes it the latest.</>,
            'A job can have at most 5 versions. Click "View Versions" on a row to see its version history.',
          ]} />
        </Section>

        <Section title="Managing jobs" last>
          <RefTable head={['Action', 'What it does']} rows={[
            ['Edit / View', 'Open the JD (icons on each row)'],
            ['View Scored · AI Talent Match · Score Resumes', 'Jump straight to that job in each module (row ⋮ menu)'],
            ['Invite Assessment · Invite AI Interview', 'Available on published jobs'],
            ['Disable Job / Re-enable JD', 'Stop using a job without archiving it'],
            ['Archive Job / Unarchive Job', 'Move closed positions out of the way'],
            ['Delete Job', 'Permanent — if the JD is in use, disabling is recommended instead'],
            ['Export Selected', 'Tick jobs and export them (bulk bar)'],
          ]} />
        </Section>
      </>
    ),
  },

  'upload-parse-resumes': {
    id: 'upload-parse-resumes',
    title: 'How to Upload & Manage Resumes',
    subtitle: 'Resume Database, uploads, duplicates, versions and folders',
    category: 'recruitment',
    readTime: '6 min',
    icon: Upload,
    keywords: 'resume database my resumes shared database upload bulk pdf doc docx file size duplicate overwrite new version folder archive download zip english',
    content: (
      <>
        <Section title="Overview">
          <NavPath items={['Dashboard', 'Resume Database']} href="/recruitment/resume-database" />
          <CardGrid items={[
            ['My Resumes', 'Resumes you uploaded, organised in your own folders.'],
            ['Shared Database', 'Resumes shared across your organisation — searchable by anyone with access.'],
          ]} />
        </Section>

        <Section title="Uploading">
          <Step number={1} title="Click &quot;Upload Resume&quot; (My Resumes tab)">
            <p>Pick <strong>Single Upload</strong> or <strong>Bulk Upload</strong>, choose a folder, then drag &amp; drop or browse.</p>
          </Step>
          <Step number={2} title="AI parses each resume">
            <p>Name, email, phone, location, experience, skills, education, work history and more are extracted automatically.</p>
          </Step>
          <RefTable head={['Rule', 'Limit']} rows={[
            ['File types', 'PDF, DOC, DOCX (RTF and TXT are also accepted)'],
            ['File size', 'Up to 3 MB per file'],
            ['Bulk upload', 'Up to 100 resumes at a time'],
            ['Language', 'English resumes only — upload an English version'],
            ['Units', '1 Resume Storage unit per resume (refunded if the upload is rejected)'],
          ]} />
          <Tip type="tip">
            Text-based PDFs with standard fonts parse best. Scanned images and heavily designed layouts lose detail.
          </Tip>
        </Section>

        <Section title="Duplicates and versions">
          <P>If a resume for the same candidate already exists, you choose what happens:</P>
          <RefTable head={['Option', 'Result']} rows={[
            ['Discard New Resume', 'Keeps the existing resume; the new file is dropped'],
            ['Overwrite Existing Resume', 'Replaces the resume content with the new file'],
            ['Save as New Version (recommended)', 'Keeps both — the new file becomes the latest version'],
          ]} />
          <Features items={[
            'A candidate can have up to 5 resume versions.',
            'Each score stays linked to the resume version that was scored — scoring a new version never relabels older scores.',
            'Exact duplicate files are skipped automatically.',
          ]} />
        </Section>

        <Section title="Organising your database" last>
          <CardGrid items={[
            ['Folders', 'Create folders and subfolders (up to 3 levels) under My Folders; Upload to Folder, Rename or Delete from the folder menu.'],
            ['Archive', 'Archived resumes move to "Archived Resumes" and cannot be scored until unarchived.'],
            ['Search & filters', 'Search by name, email, phone, skills, title or company; filter by experience, location, education, company, notice period, upload date and source.'],
            ['Bulk actions', 'Tick resumes to Move to Folder, Score, Invite Assessment, Invite AI Interview, Download (ZIP), Archive or Delete.'],
          ]} />
        </Section>
      </>
    ),
  },

  'resume-scoring': {
    id: 'resume-scoring',
    title: 'Using Resume Scoring',
    subtitle: 'Score candidates against a job with an AI rating out of 10',
    category: 'recruitment',
    readTime: '7 min',
    icon: BarChart3,
    keywords: 'score resumes exact match partial match no match rating out of 10 required preferred criteria scorecard pdf download units rs',
    content: (
      <>
        <Section title="Overview">
          <P>
            Resume Scoring evaluates each candidate against every criterion in a job description and gives an
            <strong> Overall Rating out of 10</strong> with a <strong>match status</strong>, AI reasoning, strengths and weaknesses.
          </P>
          <NavPath items={['Dashboard', 'Resume Scoring']} href="/recruitment/resume-scoring" />
        </Section>

        <Section title="Scoring resumes">
          <Step number={1} title="Click &quot;Score Resumes&quot;">
            <p>Select a <strong>Published</strong> job (Drafts are not listed; Disabled and Archived jobs are greyed out). Use “View Versions” to pick a specific job version.</p>
          </Step>
          <Step number={2} title="Click &quot;Select Resumes&quot;">
            <p>Choose candidates from <strong>My Resumes</strong> or the <strong>Shared Database</strong> — or upload new ones right there; they are selected automatically.</p>
          </Step>
          <Step number={3} title="Click &quot;Score N Resumes&quot; and confirm">
            <p>Scoring runs in the background with a progress window you can minimise. Candidates already scored for that job are skipped; failed rows can be retried.</p>
          </Step>
          <P className="mb-0">You can also start scoring from a job’s ⋮ menu (<strong>Score Resumes</strong>) or from AI Talent Match results.</P>
        </Section>

        <Section title="Understanding the result">
          <P>Each criterion is rated 0–10; 6 or above is a pass. Criteria are either <strong>Required</strong> or <strong>Preferred</strong>:</P>
          <div className="space-y-3 mb-4">
            <StatusBand tone="success" label="Exact Match" text="Every Required criterion passes and their average is 8.0 or higher." />
            <StatusBand tone="warning" label="Partial Match" text="Every Required criterion passes but their average is below 8.0." />
            <StatusBand tone="muted" label="No Match" text="At least one Required criterion is below 6." />
          </div>
          <RefTable head={['Criterion type', 'Includes']} rows={[
            ['Always Required', 'Must-Have Skills, Must-Have Additional Requirements'],
            ['Required when marked mandatory on the JD', 'Experience Level, Education Level, Industry Type, Location'],
            ['Preferred', 'Job title, Job hopping, Nice-to-Have Skills and requirements'],
          ]} />
          <Tip type="info">
            Preferred criteria only add to the rating once every Required criterion has passed. Use the rating to
            prioritise, then read the AI reasoning before deciding.
          </Tip>
        </Section>

        <Section title="Working with scores" last>
          <Features items={[
            <>Stat cards <strong>All Scored · Exact Match · Partial Match · No Match</strong> filter the list; switch the view between <strong>Job</strong> and <strong>Candidates</strong>.</>,
            <>Each row shows the <strong>Job Version</strong> and the <strong>Resume Version</strong> that were scored.</>,
            <>Open a candidate for the <strong>Overview</strong> (AI Analysis, Strengths, Weaknesses) and the <strong>Score Table</strong> (rating, eligibility and reasoning per criterion).</>,
            <><strong>Download Scorecard</strong> (PDF), Share via Email, or “Download All Scorecards” for a job as a ZIP.</>,
            <>Invite straight from a score: <strong>Create / Send Assessment</strong> or <strong>Create / Send AI Interview</strong>.</>,
            <>Each resume scored uses <strong>1 Resume Scoring unit</strong>; failed scorings are refunded.</>,
          ]} />
        </Section>
      </>
    ),
  },

  'ai-talent-match': {
    id: 'ai-talent-match',
    title: 'Using AI Talent Match',
    subtitle: 'Find the closest candidates in your database — free',
    category: 'recruitment',
    readTime: '4 min',
    icon: Sparkles,
    keywords: 'run ai match find matches rank rating free no units shared database best candidates',
    content: (
      <>
        <Section title="Overview">
          <P>
            AI Talent Match scans your company’s <strong>Shared Database</strong> and ranks the resumes closest to a job.
            It is <strong>free</strong> — no units are used. Units are only used if you then score a matched resume.
          </P>
          <NavPath items={['Dashboard', 'AI Talent Match']} href="/recruitment/ai-talent-match" />
        </Section>

        <Section title="Running a match">
          <Step number={1} title="Click &quot;Run AI Match&quot;">
            <p>Pick a <strong>Published</strong> job (or use “AI Talent Match” from the job’s ⋮ menu and confirm “Yes, find matches”).</p>
          </Step>
          <Step number={2} title="Review the ranked candidates">
            <p>Only active, non-archived resumes are searched, and only the latest version of each candidate.</p>
          </Step>
        </Section>

        <Section title="Understanding results">
          <Features items={[
            <><strong>Matched Rating 1–10</strong> is relative to that run: the closest candidate gets 10. Bands: Rating 10 · Rating 9–7 · Rating Below 7.</>,
            <>Filter by rating, <strong>Scored Status</strong> (Scored / Not Scored) or experience; sort by rating, name, score or experience.</>,
            <>Use <strong>Run Again</strong> after adding resumes, or <strong>New AI Match</strong> for another job.</>,
          ]} />
          <Tip type="tip">
            The match rating shows similarity, not suitability. Score the top matches to get a full evaluation with strengths and gaps.
          </Tip>
        </Section>

        <Section title="Taking action" last>
          <CardGrid items={[
            ['Preview Resume', 'Open the candidate’s resume'],
            ['Score Resume / View Scorecard', 'Run Resume Scoring (1 unit), or open the existing score'],
            ['Invite Assessment / AI Interview', 'Send an evaluation to selected candidates'],
            ['Export', 'Download the matched candidates'],
          ]} />
        </Section>
      </>
    ),
  },

  'invite-candidates': {
    id: 'invite-candidates',
    title: 'Inviting Candidates',
    subtitle: 'The invite flow shared by AI Assessments and AI Interviews',
    category: 'evaluation',
    readTime: '4 min',
    icon: Send,
    keywords: 'invite send link excel csv manual email expiry resend revoke copy link track invites invitation status',
    content: (
      <>
        <Section title="One invite flow everywhere">
          <P>
            Whether you invite from a job, a scored candidate, AI Talent Match, the Resume Database or the assessment /
            interview itself, the same invite window opens with four steps:
          </P>
          <Pills items={['1. Choose version', '2. Add candidates', '3. Review candidates', '4. Send invite']} />
        </Section>

        <Section title="Adding candidates">
          <RefTable head={['Source', 'How']} rows={[
            ['Manual', 'Type full name and email, then "Add Candidate" (or press Enter)'],
            ['Excel upload', '.xlsx, .xls or .csv with Name and Email columns'],
            ['AI Talent Match / Scored Resumes', 'Pick from a job’s matched or scored candidates'],
            ['My Resumes / Shared Database', 'Pick from your resume database'],
          ]} />
          <P>Use the review filters (All, Selected, Not selected, Needs attention) to fix problems before sending.</P>
        </Section>

        <Section title="Sending">
          <Features items={[
            <>Edit the <strong>Email message</strong> — [Candidate Name] is filled in for each person.</>,
            <>Set <strong>Link expires in</strong>: 1, 3 or 7 days.</>,
            'Candidates already invited to that version are skipped — use Resend Email instead.',
            'Large batches send in the background; you can minimise the progress window.',
          ]} />
          <Tip type="info">
            Units are not used at invite time. One Assessment / AI Interview unit is used when the candidate actually starts.
          </Tip>
        </Section>

        <Section title="Tracking invites" last>
          <P>Open the assessment or interview and go to <strong>Invitation Status</strong>. Each candidate shows a timeline (Invited, Email Read, System Check, Started, Completed, Expired, Terminated…) and actions:</P>
          <Pills items={['Copy Link', 'View Results', 'Resend Email', 'Edit Email', 'Revoke invite']} />
        </Section>
      </>
    ),
  },

  'create-assessments': {
    id: 'create-assessments',
    title: 'Creating & Managing AI Assessments',
    subtitle: 'JD-based tests with technical, coding and HR rounds',
    category: 'evaluation',
    readTime: '8 min',
    icon: ClipboardCheck,
    keywords: 'assessment create ai assessment technical coding hr round mcq question pass mark 70 proctoring terminated results export pdf version duplicate 30 minutes',
    content: (
      <>
        <Section title="Overview">
          <P>
            AI Assessments generate questions from the job description. <strong>Every candidate receives a unique,
            freshly generated question set</strong>, so answers can’t be shared between candidates.
          </P>
          <NavPath items={['Dashboard', 'AI Assessments']} href="/recruitment/assessments" />
        </Section>

        <Section title="Creating an assessment">
          <Step number={1} title="Click &quot;Create AI Assessment&quot; and select a job">
            <p>Pick a published job (or “Create New Job”). The job’s version is recorded with the assessment.</p>
          </Step>
          <Step number={2} title="Configure the rounds">
            <RefTable head={['Round', 'What it covers']} rows={[
              ['Technical Round', 'Domain knowledge and job-specific skills — multiple-choice questions, plus some written answers when Coding is off'],
              ['Coding Round', 'Hands-on coding questions with hidden test cases; the candidate picks one of the languages you allow'],
              ['HR Round', 'Up to 5 questions from the HR Question Bank — informational, not scored'],
            ]} />
            <p className="mb-2">Turn on at least one round and split the percentages to total 100%. You can add topics with “Add Topic”.</p>
            <p>Difficulty follows the JD’s experience level, and the assessment is <strong>fixed at 30 minutes</strong>.</p>
          </Step>
          <Step number={3} title="Save as Draft or Publish">
            <p>After publishing, use <strong>Invite</strong> to send it to candidates — see <Link href="/help?article=invite-candidates" className="text-brand-blue hover:underline">Inviting Candidates</Link>.</p>
          </Step>
        </Section>

        <Section title="How it is scored">
          <Features items={[
            <>Pass / Fail is decided by the <strong>Technical and Coding</strong> rounds only; the pass mark is <strong>70</strong>.</>,
            'Unanswered questions score 0. Multiple-choice answers are checked against the answer key; coding answers by their test results.',
            'Written answers are evaluated by AI.',
          ]} />
        </Section>

        <Section title="What candidates go through">
          <Pills items={['Job & Consent', 'System Check', 'HR Questions (if on)', 'Assessment']} />
          <Tip type="warning">
            The assessment runs in full screen with camera proctoring. Switching tabs or windows, leaving full screen, or
            using the Windows / ⌘ key ends the assessment immediately — tell candidates before they start.
          </Tip>
        </Section>

        <Section title="Reviewing results" last>
          <Features items={[
            <>The <strong>Results</strong> tab lists every candidate with Tech and Coding scores, status and source; filter by Pass / Fail.</>,
            <>Open a candidate for per-round answers, the <strong>Recording</strong>, <strong>Violations</strong> and AI-Generated Candidate Insights.</>,
            <>Export results as <strong>CSV or Excel</strong>, or download candidate <strong>PDF reports</strong>.</>,
            <>Once anyone is invited, changing the content creates a <strong>new version</strong> (up to 5); <strong>Duplicate</strong> copies an assessment.</>,
          ]} />
        </Section>
      </>
    ),
  },

  'ai-interviews': {
    id: 'ai-interviews',
    title: 'Running AI Interviews',
    subtitle: 'Voice interviews with Bina, our AI interviewer',
    category: 'evaluation',
    readTime: '8 min',
    icon: Bot,
    keywords: 'ai interview bina voice timed conversational clusters must-have nice-to-have weight hr round identity otp system check recording transcript violations recommended to hire proctoring risk',
    content: (
      <>
        <Section title="Overview">
          <P>
            In an AI Interview, <strong>Bina</strong> — TalentFlow’s AI interviewer — talks with the candidate, asks
            questions based on the job’s skills and adapts follow-ups to their answers. The candidate answers by speaking.
          </P>
          <NavPath items={['Dashboard', 'AI Interviews']} href="/recruitment/ai-interviews" />
        </Section>

        <Section title="Setting up an interview">
          <P>Click <strong>“Create AI Interview”</strong> and follow the four steps:</P>
          <Step number={1} title="Select JD">
            <p>Pick the published job the interview is for.</p>
          </Step>
          <Step number={2} title="Configure">
            <RefTable head={['Setting', 'Options']} rows={[
              ['Interview Mode', 'Timed (30 min, a time per question) or Conversational (30 min, the AI adapts) — plus 5 minutes buffer'],
              ['Must-To-Have / Nice-To-Have Skills', 'Give each a weight (minimum 10%); the weights must total 100%'],
              ['HR Round', 'Pick questions from the HR Question Bank, asked at the opening or the close'],
              ['Additional Settings', 'Introduction video (up to 1 min) and QR verification of the candidate’s room with a phone'],
            ]} />
          </Step>
          <Step number={3} title="Clusters">
            <p>Skills are grouped into clusters that plan which questions Bina asks. Skills are locked once clusters are generated.</p>
          </Step>
          <Step number={4} title="Preview & Publish">
            <p>Check the summary, publish, then invite candidates.</p>
          </Step>
        </Section>

        <Section title="What candidates go through">
          <Pills items={['Job Details & Consent', 'Identity (email OTP + photo)', 'System Check', 'Practice', 'Interview']} />
          <Features items={[
            'The system check covers webcam, microphone, internet, lighting, background noise and that only one person is visible.',
            'A desktop or laptop is required — mobile devices are not supported.',
            'If the camera or microphone drops, the interview pauses for up to 3 minutes before it ends.',
          ]} />
          <Tip type="warning">
            Like assessments, leaving the interview screen ends the interview. Ask candidates to close other apps first.
          </Tip>
        </Section>

        <Section title="Reviewing results" last>
          <Features items={[
            <>The <strong>Results</strong> tab shows Score, Result and <strong>Proctoring Risk</strong> (Clean, Low, Medium, High) for every candidate.</>,
            <>A candidate passes when their Must-Have score is at least <strong>6.0 / 10</strong> — the verdict reads “Recommended to Hire” or “Does Not Meet Requirements”.</>,
            <>Candidate tabs: <strong>Evaluation Report, Skill Breakdown, Question Analysis, Recording, Transcript, Violations</strong> and QR Verification.</>,
            <><strong>Download Report</strong> for the evaluation PDF; export the transcript as PDF or text.</>,
            'Terminated interviews do not get a final recommendation.',
            <>Each interview uses <strong>1 AI Interview unit</strong> when the candidate clicks Start Interview.</>,
          ]} />
        </Section>
      </>
    ),
  },

  'hr-question-bank': {
    id: 'hr-question-bank',
    title: 'Using the HR Question Bank',
    subtitle: 'Reusable HR questions for assessments and interviews',
    category: 'evaluation',
    readTime: '2 min',
    icon: MessageCircle,
    keywords: 'hr question bank add question text answer yes no reusable informational not scored',
    content: (
      <>
        <Section title="Overview">
          <P>
            Keep a library of HR questions and reuse them in both AI Assessments and AI Interviews. HR answers are
            <strong> informational only — they are not scored</strong>; responses are shared with the recruiter for review.
          </P>
          <NavPath items={['AI Assessments or AI Interviews', 'HR Question Bank']} href="/recruitment/hr-question-bank" />
        </Section>

        <Section title="Adding questions" last>
          <Step number={1} title="Click &quot;Add Question&quot;">
            <p>Enter the question text.</p>
          </Step>
          <Step number={2} title="Choose an Answer Type">
            <p><strong>Text Answer</strong>, or <strong>Yes / No / Need to Explain More</strong>.</p>
          </Step>
          <P>You can also add a question while building an assessment (“Add Quiz”) or an AI Interview (“Add Question To HR Question Bank”). An assessment can include up to 5 HR questions.</P>
        </Section>
      </>
    ),
  },

  'team-management': {
    id: 'team-management',
    title: 'Managing Users, Roles & Teams',
    subtitle: 'Invite users, control access and work together',
    category: 'organization',
    readTime: '6 min',
    icon: Users,
    keywords: 'user management invite user role permissions admin recruiter billing manager viewer custom role reset password deactivate teams team chat channels direct messages user id',
    content: (
      <>
        <Section title="Inviting users">
          <NavPath items={['Dashboard', 'User Management']} href="/organization/user-management" />
          <Step number={1} title="Click &quot;Invite User&quot;">
            <p>Enter their details and choose a role — Invite stays disabled until a role is picked.</p>
          </Step>
          <Step number={2} title="They receive a temporary password by email">
            <p>On first login they are taken to <strong>Set your password</strong>, which shows the account’s email so they can confirm it’s theirs, and click <strong>“Activate account”</strong>.</p>
          </Step>
          <Tip type="info">If you’ve used every seat in your plan, the button changes to “Buy More Seats”.</Tip>
        </Section>

        <Section title="Roles and permissions">
          <P>Access comes entirely from a user’s role. The account owner always has full access.</P>
          <RefTable head={['Built-in role', 'Access']} rows={[
            ['Admin', 'Full access to all features and settings'],
            ['Recruiter', 'Day-to-day recruiting: jobs, resumes, scoring, assessments, interviews'],
            ['Billing Manager', 'Read-only billing, invoices and usage'],
            ['Viewer', 'View-only access across the platform'],
          ]} />
          <P>
            Built-in roles can’t be edited — <strong>duplicate</strong> one, or click <strong>“Create Role”</strong>, to build a custom role and
            switch individual permissions on or off per module (Job Description, Resume Scoring, Assessment, AI Interview, Billing and more).
          </P>
        </Section>

        <Section title="Managing a user">
          <RefTable head={['Action', 'What it does']} rows={[
            ['Activate / Deactivate', 'Turn access on or off without deleting the user'],
            ['Reset Password', 'Email a temporary password, or set one directly (optionally forcing a change on next login)'],
            ['Force password change', 'Signs them out and requires a new password at next login'],
            ['Edit User', 'Changing identity details is confirmed with a verification code'],
            ['Copy User ID', 'Each user has an ID like US-001 — quote it when contacting support'],
          ]} />
        </Section>

        <Section title="Teams and Team Chat" last>
          <CardGrid items={[
            ['Teams', '"Create Team", assign a Team Lead and members, and track each team’s hiring activity and unit usage.'],
            ['Team Chat', 'Open to everyone — public or private channels and direct messages, with online status, reactions, pinned messages and image attachments.'],
          ]} />
        </Section>
      </>
    ),
  },

  'subscription-billing': {
    id: 'subscription-billing',
    title: 'Understanding Your Subscription & Units',
    subtitle: 'Plans, units, add-ons and billing history',
    category: 'billing',
    readTime: '5 min',
    icon: CreditCard,
    keywords: 'units credits plan upgrade downgrade add-on purchase usage quotas billing history invoice refund dispute unit dispute payment methods seats',
    content: (
      <>
        <Section title="How units work">
          <P>Your plan includes units for each AI feature. The <strong>units left</strong> pill in the header shows your total balance.</P>
          <RefTable head={['Unit', 'Used when', 'Refunded when']} rows={[
            ['Resume Storage', 'A resume is uploaded', 'The upload is rejected or fails'],
            ['Resume Scoring', 'A resume is scored against a job', 'Scoring fails'],
            ['Assessments', 'A candidate starts an assessment', '—'],
            ['AI Interviews', 'A candidate clicks Start Interview', '—'],
            ['AI Talent Match', 'Free — never uses units', '—'],
          ]} />
          <Tip type="tip">
            Inviting candidates and copying links don’t use units — only an actual start does.
          </Tip>
        </Section>

        <Section title="Your plan">
          <NavPath items={['Profile menu', 'Upgrade Plans']} href="/subscription/current-plan" />
          <Features items={[
            'Compare Starter, Professional and Enterprise plans with the Monthly / Yearly toggle, then "Upgrade" or "Downgrade".',
            'Plans set your Team Seats and Job Postings limits as well as your unit allowance.',
            <>Need units mid-cycle? Open the units pill and click <strong>“Purchase Add-ons”</strong> — add-on units are available immediately.</>,
          ]} />
        </Section>

        <Section title="Billing pages" last>
          <RefTable head={['Page', 'Use it to']} rows={[
            ['Usage & Quotas', 'See plan and add-on units used and remaining per feature'],
            ['Billing History', 'View and download invoices'],
            ['Payment Methods', 'Add or manage cards (account owner)'],
            ['Refund History · Dispute History', 'Follow refunds and payment disputes'],
            ['Unit Disputes', 'Ask for units back when a system error used them'],
          ]} />
        </Section>
      </>
    ),
  },

  'support-security': {
    id: 'support-security',
    title: 'Support, Security & Audit Logs',
    subtitle: 'Get help, protect your account and review activity',
    category: 'support',
    readTime: '4 min',
    icon: ShieldCheck,
    keywords: 'support ticket help desk two-factor 2fa authenticator sessions password audit log audit trail activity notifications profile settings',
    content: (
      <>
        <Section title="Getting help">
          <CardGrid items={[
            ['Support Tickets', <>Contact the TalentFlow team: “Submit New Ticket”, choose a category and priority, and follow it through Open → In Progress → Resolved. <Link href="/support-tickets" className="text-brand-blue hover:underline">Open</Link></>],
            ['Help Desk', <>Ask your own administrator for access or help inside your organisation. <Link href="/help-desk" className="text-brand-blue hover:underline">Open</Link></>],
          ]} />
          <Tip type="tip">Mark a ticket Urgent only when you or your team cannot use TalentFlow at all.</Tip>
        </Section>

        <Section title="Securing your account">
          <NavPath items={['Profile menu', 'Profile Settings']} href="/settings/general-settings" />
          <Features items={[
            <>Turn on <strong>Two-Factor Authentication</strong> with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy).</>,
            <>Review <strong>Active Sessions</strong> and revoke the ones you don’t recognise.</>,
            'Choose which email and push notifications you receive under the Notifications tab.',
          ]} />
        </Section>

        <Section title="Audit logs" last>
          <RefTable head={['Page', 'Shows']} rows={[
            ['Audit Log', 'Audited actions and live activity across your organisation (Profile menu → Audit Log)'],
            ['Audit Trail', 'Every change with user, module, status and units used — account owner only'],
          ]} />
        </Section>
      </>
    ),
  },
};

const categories = [
  { id: 'all', name: 'All Articles', icon: Book },
  { id: 'basics', name: 'Getting Started', icon: Lightbulb },
  { id: 'recruitment', name: 'Recruitment', icon: Briefcase },
  { id: 'evaluation', name: 'Assessments & Interviews', icon: ClipboardCheck },
  { id: 'organization', name: 'Organization', icon: Users },
  { id: 'billing', name: 'Billing', icon: CreditCard },
  { id: 'support', name: 'Support & Security', icon: LifeBuoy },
];

const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

const matchesQuery = (article: Article, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${article.title} ${article.subtitle} ${article.keywords}`.toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
};

export default function HelpCenterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const articleId = searchParams.get('article');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const allArticles = Object.values(helpArticles);
  const selectedArticle = articleId ? helpArticles[articleId] : null;

  const filteredArticles = allArticles.filter(
    (article) => matchesQuery(article, searchQuery) && (selectedCategory === 'all' || article.category === selectedCategory),
  );

  // Link to an article that doesn't exist (old bookmark, typo).
  if (articleId && !selectedArticle) {
    return (
      <main className="tf-page">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="tf-page-sheet">
            <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Help Center', href: '/help' }]} />
            <div className="tf-card-soft p-8 text-center">
              <Search className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-slate-600" />
              <h1 className="tf-section-title mb-1">Article not found</h1>
              <p className="tf-body-muted mb-5">This help article may have moved or been renamed.</p>
              <button onClick={() => router.push('/help')} className="tf-btn-primary inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Help Center
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Article view
  if (selectedArticle) {
    const sameCategory = allArticles.filter((a) => a.id !== selectedArticle.id && a.category === selectedArticle.category);
    const others = allArticles.filter((a) => a.id !== selectedArticle.id && a.category !== selectedArticle.category);
    const related = [...sameCategory, ...others].slice(0, 2);

    return (
      <main className="tf-page">
        <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Help Center', href: '/help' }, { label: selectedArticle.title }]} />
          <button
            onClick={() => router.push('/help')}
            className="inline-flex items-center gap-2 text-sm sm:text-base text-gray-600 dark:text-slate-400 hover:text-brand-blue mb-4 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Help Center</span>
          </button>

          <div className="mb-5 flex flex-col gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                <selectedArticle.icon className="h-5 w-5 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <h1 className="tf-page-title">{selectedArticle.title}</h1>
                <p className="mt-0.5 tf-body-secondary">{selectedArticle.subtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 tf-body-muted">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {selectedArticle.readTime} read
              </span>
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-700 dark:text-slate-300">{categoryName(selectedArticle.category)}</span>
            </div>
          </div>

          <div className="tf-card-soft p-5 sm:p-8 md:p-10">
            {selectedArticle.content}
          </div>

          {related.length > 0 && (
            <div className="mt-10">
              <h3 className="tf-section-title mb-4">Related Articles</h3>
              <div className="tf-grid-2">
                {related.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => router.push(`/help?article=${article.id}`)}
                    className="p-4 sm:p-5 tf-card-soft hover:border-brand-blue/30 hover:shadow-md transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 transition-colors">
                        <article.icon className="h-5 w-5 text-brand-blue" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-gray-900 dark:text-slate-50 group-hover:text-brand-blue">{article.title}</h4>
                        <p className="tf-body-muted mt-0.5">{article.readTime} read</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>
      </main>
    );
  }

  // Help center home
  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Help Center' }]} />
        <div className="mb-5 flex flex-col gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
              <LifeBuoy className="h-5 w-5 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h1 className="tf-page-title">Help Center</h1>
              <p className="mt-0.5 tf-body-secondary">Find answers, guides, and tutorials to help you succeed</p>
            </div>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search help, e.g. units, invite, version"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search help articles"
              className="tf-input pl-9 pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-hide -mx-1 px-1 justify-start sm:flex-wrap">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-5 rounded-full text-sm transition-all font-medium whitespace-nowrap flex-shrink-0 ${
                selectedCategory === category.id
                  ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                  : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:text-brand-blue'
              }`}
            >
              <category.icon className="w-4 h-4" />
              {category.name}
            </button>
          ))}
        </div>

        <div className="tf-grid-3 mb-5">
          <button
            onClick={() => router.push('/help?article=getting-started')}
            className="p-4 sm:p-6 tf-card-soft hover:border-brand-blue/30 hover:shadow-md transition-all text-left"
          >
            <Lightbulb className="w-6 h-6 sm:w-8 sm:h-8 mb-2 sm:mb-3 text-brand-blue" />
            <div className="tf-section-title sm:text-lg">Quick Start Guide</div>
            <div className="tf-body-muted mt-0.5 sm:mt-1">New to TalentFlow? Start here</div>
          </button>
          <button
            onClick={() => router.push('/support-tickets')}
            className="p-4 sm:p-6 tf-card-soft hover:border-brand-blue/30 hover:shadow-md transition-all text-left"
          >
            <MessageCircle className="w-6 h-6 sm:w-8 sm:h-8 mb-2 sm:mb-3 text-brand-blue" />
            <div className="tf-section-title sm:text-lg">Contact Support</div>
            <div className="tf-body-muted mt-0.5 sm:mt-1">Raise a ticket with our team</div>
          </button>
          <button
            onClick={() => router.push('/settings/general-settings')}
            className="p-4 sm:p-6 tf-card-soft hover:border-brand-blue/30 hover:shadow-md transition-all text-left"
          >
            <Settings className="w-6 h-6 sm:w-8 sm:h-8 mb-2 sm:mb-3 text-brand-blue" />
            <div className="tf-section-title sm:text-lg">Profile Settings</div>
            <div className="tf-body-muted mt-0.5 sm:mt-1">Profile, notifications and security</div>
          </button>
        </div>

        <div className="mb-5">
          <h2 className="tf-section-title sm:text-lg lg:text-xl mb-4 sm:mb-6">
            {searchQuery.trim() ? 'Search results' : categoryName(selectedCategory)}
            <span className="text-gray-400 dark:text-slate-500 font-normal ml-2">({filteredArticles.length})</span>
          </h2>

          {filteredArticles.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-slate-500">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">No articles found{searchQuery.trim() ? ` for "${searchQuery.trim()}"` : ''}</p>
              <button
                onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                className="text-brand-blue hover:underline text-sm"
              >
                Show all articles
              </button>
            </div>
          ) : (
            <div className="tf-grid-3">
              {filteredArticles.map((article) => (
                <button
                  key={article.id}
                  onClick={() => router.push(`/help?article=${article.id}`)}
                  className="p-4 sm:p-5 tf-card-soft hover:border-brand-blue/30 hover:shadow-md transition-all text-left group"
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                      <article.icon className="h-5 w-5 text-brand-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-slate-50 group-hover:text-brand-blue mb-1 line-clamp-2">
                        {article.title}
                      </h3>
                      <p className="tf-body-muted line-clamp-2 mb-1.5">{article.subtitle}</p>
                      <div className="flex items-center gap-2 tf-body-muted">
                        <Clock className="w-3.5 h-3.5" />
                        {article.readTime}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 dark:text-slate-500 group-hover:text-brand-blue group-hover:translate-x-1 transition-all flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="tf-card-soft p-4 sm:p-5">
          <h2 className="tf-section-title mb-6">Still need help?</h2>
          <div className="tf-grid-2">
            <a
              href="mailto:support@talentflow.com"
              className="flex items-center gap-4 p-5 bg-brand-blue/[0.04] dark:bg-brand-blue/10 ring-1 ring-brand-blue/10 dark:ring-brand-blue/20 rounded-xl hover:bg-brand-blue/[0.08] dark:hover:bg-brand-blue/15 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <MessageCircle className="h-5 w-5 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 dark:text-slate-50">Email Support</div>
                <div className="text-gray-500 dark:text-slate-400 truncate">support@talentflow.com</div>
              </div>
            </a>
            <button
              onClick={() => router.push('/support-tickets')}
              className="flex items-center gap-4 p-5 bg-brand-blue/[0.04] dark:bg-brand-blue/10 ring-1 ring-brand-blue/10 dark:ring-brand-blue/20 rounded-xl hover:bg-brand-blue/[0.08] dark:hover:bg-brand-blue/15 transition-colors text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <FileText className="h-5 w-5 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 dark:text-slate-50">Support Ticket</div>
                <div className="text-gray-500 dark:text-slate-400">Track your requests</div>
              </div>
            </button>
          </div>
        </div>
      </div>
      </div>
    </main>
  );
}
