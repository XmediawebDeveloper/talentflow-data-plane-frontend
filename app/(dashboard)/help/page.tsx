'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import PageBreadcrumb from '@/components/PageBreadcrumb';

// Step component for instructions
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

// Tip/Note component
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
          <p className="text-gray-700 dark:text-slate-300 mt-1">{children}</p>
        </div>
      </div>
    </div>
  );
};

// Feature list item
const FeatureItem = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-3 py-2">
    <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
    <span className="text-gray-700 dark:text-slate-300 min-w-0">{children}</span>
  </li>
);

// Navigation path item
const NavPath = ({ children, isLast = false }: { children: React.ReactNode; isLast?: boolean }) => (
  <span className="inline-flex items-center">
    <span className="bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded text-sm font-medium text-gray-700 dark:text-slate-300">{children}</span>
    {!isLast && <ArrowRight className="w-4 h-4 mx-2 text-gray-400 dark:text-slate-500" />}
  </span>
);

// Help articles content
const helpArticles: Record<string, {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  readTime: string;
  icon: any;
  content: React.ReactNode;
}> = {
  'getting-started': {
    id: 'getting-started',
    title: 'Getting Started with TalentFlow',
    subtitle: 'Everything you need to know to start hiring smarter',
    category: 'basics',
    readTime: '5 min',
    icon: Book,
    content: (
      <>
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-blue" />
            Welcome to TalentFlow
          </h2>
          <p className="text-gray-600 dark:text-slate-400 leading-relaxed mb-4">
            TalentFlow is a comprehensive AI-powered recruitment platform designed to streamline your hiring process.
            From parsing resumes to conducting AI interviews, we've got you covered.
          </p>
          <p className="text-gray-600 dark:text-slate-400 leading-relaxed">
            This guide will walk you through the essential steps to get your recruitment workflow up and running.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-6">Quick Start Steps</h2>

          <Step number={1} title="Set up your company profile">
            <p className="mb-3">Start by configuring your organization's details.</p>
            <div className="mb-3">
              <NavPath>Organization</NavPath>
              <NavPath isLast>Company Profile</NavPath>
            </div>
            <ul className="space-y-1 text-sm">
              <FeatureItem>Add your company logo and branding</FeatureItem>
              <FeatureItem>Enter company name and description</FeatureItem>
              <FeatureItem>Configure notification preferences</FeatureItem>
            </ul>
          </Step>

          <Step number={2} title="Invite your team members">
            <p className="mb-3">Add recruiters and hiring managers to collaborate.</p>
            <div className="mb-3">
              <NavPath>Organization</NavPath>
              <NavPath isLast>User Management</NavPath>
            </div>
            <ul className="space-y-1 text-sm">
              <FeatureItem>Click "Invite User" to add team members</FeatureItem>
              <FeatureItem>Assign roles: Admin, Recruiter, or Viewer</FeatureItem>
              <FeatureItem>Team members receive email invitations</FeatureItem>
            </ul>
          </Step>

          <Step number={3} title="Create your first Job Description">
            <p className="mb-3">Define the position you're hiring for.</p>
            <div className="mb-3">
              <NavPath>Recruitment</NavPath>
              <NavPath isLast>Job Descriptions</NavPath>
            </div>
            <ul className="space-y-1 text-sm">
              <FeatureItem>Click "Create JD" to start</FeatureItem>
              <FeatureItem>Use AI to generate job requirements</FeatureItem>
              <FeatureItem>Add skills, experience, and qualifications</FeatureItem>
            </ul>
          </Step>

          <Step number={4} title="Upload candidate resumes">
            <p className="mb-3">Build your talent pipeline with AI-powered parsing.</p>
            <div className="mb-3">
              <NavPath>Recruitment</NavPath>
              <NavPath isLast>Resume Database</NavPath>
            </div>
            <ul className="space-y-1 text-sm">
              <FeatureItem>Upload individual or bulk resumes (PDF, DOC)</FeatureItem>
              <FeatureItem>AI automatically extracts candidate information</FeatureItem>
              <FeatureItem>Organize candidates into folders</FeatureItem>
            </ul>
          </Step>

          <Step number={5} title="Start screening candidates">
            <p className="mb-3">Use AI tools to find the best matches.</p>
            <ul className="space-y-1 text-sm">
              <FeatureItem>Use <strong>AI Talent Match</strong> to find best candidates</FeatureItem>
              <FeatureItem>Use <strong>Resume Scoring</strong> to rank candidates</FeatureItem>
              <FeatureItem>Create <strong>Assessments</strong> for shortlisted candidates</FeatureItem>
            </ul>
          </Step>
        </section>

        <Tip type="tip">
          Take advantage of the Quick Tour feature (button in the header) for an interactive walkthrough of all features.
        </Tip>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Dashboard Overview</h2>
          <p className="text-gray-600 dark:text-slate-400 leading-relaxed mb-4">
            Your dashboard provides a quick snapshot of your recruitment activity:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Active Job Openings</div>
              <div className="tf-card-desc">Track open positions and their status</div>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Recent Candidates</div>
              <div className="tf-card-desc">Latest applications and uploads</div>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Pending Assessments</div>
              <div className="tf-card-desc">Assessments awaiting completion</div>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Team Activity</div>
              <div className="tf-card-desc">Recent actions by team members</div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Need More Help?</h2>
          <div className="bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-xl p-6">
            <p className="mb-4 text-gray-700 dark:text-slate-300">Our support team is here to help you succeed.</p>
            <div className="flex flex-wrap gap-3">
              <span className="bg-white dark:bg-slate-900 ring-1 ring-brand-blue/15 text-brand-blue px-3 py-1 rounded-full text-sm font-medium">Browse Knowledge Base</span>
              <span className="bg-white dark:bg-slate-900 ring-1 ring-brand-blue/15 text-brand-blue px-3 py-1 rounded-full text-sm font-medium">Contact Support</span>
              <span className="bg-white dark:bg-slate-900 ring-1 ring-brand-blue/15 text-brand-blue px-3 py-1 rounded-full text-sm font-medium">Email: support@talentflow.com</span>
            </div>
          </div>
        </section>
      </>
    ),
  },
  'create-job-description': {
    id: 'create-job-description',
    title: 'How to Create a Job Description',
    subtitle: 'Step-by-step guide to creating effective job postings',
    category: 'recruitment',
    readTime: '8 min',
    icon: Briefcase,
    content: (
      <>
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Overview</h2>
          <p className="text-gray-600 dark:text-slate-400 leading-relaxed">
            Job Descriptions (JDs) are the foundation of your recruitment process. A well-crafted JD helps attract
            the right candidates and enables our AI to make better matches. TalentFlow makes it easy to create
            professional, comprehensive job descriptions.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-6">Step-by-Step Guide</h2>

          <Step number={1} title="Navigate to JD Creation">
            <div className="mb-3">
              <NavPath>Recruitment</NavPath>
              <NavPath>Job Descriptions</NavPath>
              <NavPath isLast>Create JD</NavPath>
            </div>
            <p>Click the "Create JD" button to open the job description form.</p>
          </Step>

          <Step number={2} title="Enter Basic Information">
            <p className="mb-3">Fill in the essential job details:</p>
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between border-b border-gray-200 dark:border-slate-700 pb-2">
                <span className="font-medium text-gray-700 dark:text-slate-300">Job Title</span>
                <span className="tf-body-muted">e.g., "Senior React Developer"</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 dark:border-slate-700 pb-2">
                <span className="font-medium text-gray-700 dark:text-slate-300">Department</span>
                <span className="tf-body-muted">Select or create new</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 dark:border-slate-700 pb-2">
                <span className="font-medium text-gray-700 dark:text-slate-300">Employment Type</span>
                <span className="tf-body-muted">Full-time, Part-time, Contract</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 dark:border-slate-700 pb-2">
                <span className="font-medium text-gray-700 dark:text-slate-300">Location</span>
                <span className="tf-body-muted">Office location or "Remote"</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-gray-700 dark:text-slate-300">Salary Range</span>
                <span className="tf-body-muted">Optional but recommended</span>
              </div>
            </div>
          </Step>

          <Step number={3} title="Define Job Requirements">
            <p className="mb-4">Specify what you're looking for in candidates:</p>

            <div className="mb-4">
              <h5 className="font-medium text-gray-800 dark:text-slate-200 mb-2">Experience Level</h5>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-gray-100 dark:bg-slate-800 rounded-full tf-body">Entry (0-2 yrs)</span>
                <span className="px-3 py-1 bg-gray-100 dark:bg-slate-800 rounded-full tf-body">Mid (2-5 yrs)</span>
                <span className="px-3 py-1 bg-gray-100 dark:bg-slate-800 rounded-full tf-body">Senior (5-8 yrs)</span>
                <span className="px-3 py-1 bg-gray-100 dark:bg-slate-800 rounded-full tf-body">Lead (8+ yrs)</span>
              </div>
            </div>

            <div className="mb-4">
              <h5 className="font-medium text-gray-800 dark:text-slate-200 mb-2">Required Skills</h5>
              <ul className="space-y-1 text-sm">
                <FeatureItem>Add technical skills relevant to the role</FeatureItem>
                <FeatureItem>Include soft skills (communication, teamwork)</FeatureItem>
                <FeatureItem>Mark skills as "Required" or "Nice to have"</FeatureItem>
              </ul>
            </div>
          </Step>

          <Step number={4} title="Use AI-Assisted Content Generation">
            <p className="mb-3">Let AI help you write compelling job descriptions:</p>
            <ul className="space-y-1 text-sm">
              <FeatureItem>Click the <strong>"Generate with AI"</strong> button</FeatureItem>
              <FeatureItem>AI creates professional job descriptions based on your inputs</FeatureItem>
              <FeatureItem>Review and customize the generated content</FeatureItem>
              <FeatureItem>Add company-specific requirements and culture points</FeatureItem>
            </ul>
          </Step>

          <Step number={5} title="Review & Publish">
            <ul className="space-y-1 text-sm">
              <FeatureItem>Preview how the JD will appear to candidates</FeatureItem>
              <FeatureItem>Verify all requirements are accurately listed</FeatureItem>
              <FeatureItem>Click <strong>"Publish"</strong> to make it active</FeatureItem>
            </ul>
          </Step>
        </section>

        <Tip type="tip">
          Be specific about requirements but avoid unnecessarily long lists. Focus on 5-7 key responsibilities
          and must-have skills. This helps attract qualified candidates without deterring good fits.
        </Tip>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Best Practices</h2>
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900 dark:text-slate-50">Use clear, inclusive language</div>
                <div className="tf-card-desc">Avoid jargon and gendered terms</div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900 dark:text-slate-50">Include salary range</div>
                <div className="tf-card-desc">Increases application quality by 30%</div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900 dark:text-slate-50">Highlight growth opportunities</div>
                <div className="tf-card-desc">Mention career paths and learning</div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900 dark:text-slate-50">Describe your team</div>
                <div className="tf-card-desc">Team size, reporting structure, collaboration style</div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Managing Job Descriptions</h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700 tf-table-shell">
            <table className="w-full">
              <thead className="bg-white dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left tf-th">Action</th>
                  <th className="px-4 py-3 text-left tf-th">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Edit JD</td>
                  <td className="px-4 py-3 tf-card-desc">Click on any JD to modify details</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Clone JD</td>
                  <td className="px-4 py-3 tf-card-desc">Duplicate an existing JD as a template</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Archive JD</td>
                  <td className="px-4 py-3 tf-card-desc">Close positions no longer hiring</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Delete JD</td>
                  <td className="px-4 py-3 tf-card-desc">Permanently remove (requires confirmation)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </>
    ),
  },
  'upload-parse-resumes': {
    id: 'upload-parse-resumes',
    title: 'How to Upload & Parse Resumes',
    subtitle: 'Build your talent pipeline with AI-powered resume parsing',
    category: 'recruitment',
    readTime: '6 min',
    icon: Upload,
    content: (
      <>
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Overview</h2>
          <p className="text-gray-600 dark:text-slate-400 leading-relaxed">
            TalentFlow's AI automatically extracts and organizes information from resumes, saving you hours of
            manual data entry. Upload resumes in bulk or individually, and let our AI do the heavy lifting.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-6">Uploading Resumes</h2>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 dark:text-slate-50 mb-3 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                Single Resume Upload
              </h3>
              <ol className="space-y-2 text-sm text-gray-600 dark:text-slate-400">
                <li className="flex gap-2"><span className="font-medium">1.</span> Go to Resume Database</li>
                <li className="flex gap-2"><span className="font-medium">2.</span> Click "Upload Resume"</li>
                <li className="flex gap-2"><span className="font-medium">3.</span> Select your file</li>
                <li className="flex gap-2"><span className="font-medium">4.</span> AI parsing begins automatically</li>
              </ol>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 dark:text-slate-50 mb-3 flex items-center gap-2">
                <Upload className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                Bulk Upload
              </h3>
              <ol className="space-y-2 text-sm text-gray-600 dark:text-slate-400">
                <li className="flex gap-2"><span className="font-medium">1.</span> Click "Bulk Upload" button</li>
                <li className="flex gap-2"><span className="font-medium">2.</span> Select multiple files (up to 50)</li>
                <li className="flex gap-2"><span className="font-medium">3.</span> Or drag & drop files</li>
                <li className="flex gap-2"><span className="font-medium">4.</span> Monitor progress in queue</li>
              </ol>
            </div>
          </div>

          <div className="bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-lg p-4">
            <h4 className="font-semibold text-brand-blue mb-2">Supported File Formats</h4>
            <div className="flex gap-3">
              <span className="px-3 py-1 bg-white dark:bg-slate-900 rounded ring-1 ring-brand-blue/15 text-sm font-medium text-gray-900 dark:text-slate-50">PDF</span>
              <span className="px-3 py-1 bg-white dark:bg-slate-900 rounded ring-1 ring-brand-blue/15 text-sm font-medium text-gray-900 dark:text-slate-50">.DOC</span>
              <span className="px-3 py-1 bg-white dark:bg-slate-900 rounded ring-1 ring-brand-blue/15 text-sm font-medium text-gray-900 dark:text-slate-50">.DOCX</span>
              <span className="px-3 py-1 bg-white dark:bg-slate-900 rounded ring-1 ring-brand-blue/15 text-sm font-medium text-gray-900 dark:text-slate-50">.TXT</span>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">What AI Extracts</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-4">Our AI parser automatically extracts the following information:</p>

          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700 tf-table-shell">
            <table className="w-full">
              <thead className="bg-white dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left tf-th">Field</th>
                  <th className="px-4 py-3 text-left tf-th">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                <tr><td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Name</td><td className="px-4 py-3 tf-card-desc">Candidate's full name</td></tr>
                <tr><td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Email</td><td className="px-4 py-3 tf-card-desc">Contact email address</td></tr>
                <tr><td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Phone</td><td className="px-4 py-3 tf-card-desc">Phone number(s)</td></tr>
                <tr><td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Location</td><td className="px-4 py-3 tf-card-desc">City, State, Country</td></tr>
                <tr><td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Experience</td><td className="px-4 py-3 tf-card-desc">Total years of experience</td></tr>
                <tr><td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Skills</td><td className="px-4 py-3 tf-card-desc">Technical and soft skills</td></tr>
                <tr><td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Education</td><td className="px-4 py-3 tf-card-desc">Degrees, institutions, years</td></tr>
                <tr><td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">Work History</td><td className="px-4 py-3 tf-card-desc">Companies, roles, durations</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <Tip type="tip">
          Clean, well-formatted resumes parse better. PDFs with standard fonts work best.
          Avoid image-heavy or heavily designed resumes for optimal parsing accuracy.
        </Tip>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">After Parsing</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-4">Once parsed, you can:</p>
          <ul className="space-y-2">
            <FeatureItem><strong>Review extracted data</strong> for accuracy and make corrections</FeatureItem>
            <FeatureItem><strong>Add to folders</strong> for organization by role or project</FeatureItem>
            <FeatureItem><strong>Match against JDs</strong> using AI Talent Match</FeatureItem>
            <FeatureItem><strong>Score resumes</strong> for specific positions</FeatureItem>
            <FeatureItem><strong>Invite to assessments</strong> for qualified candidates</FeatureItem>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Managing Your Database</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <Search className="w-5 h-5 text-gray-600 dark:text-slate-400 mb-2" />
              <div className="font-medium text-gray-900 dark:text-slate-50">Search</div>
              <div className="tf-card-desc">Find by name, skills, or experience</div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <BarChart3 className="w-5 h-5 text-gray-600 dark:text-slate-400 mb-2" />
              <div className="font-medium text-gray-900 dark:text-slate-50">Filter</div>
              <div className="tf-card-desc">Filter by location, experience, skills</div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <FileText className="w-5 h-5 text-gray-600 dark:text-slate-400 mb-2" />
              <div className="font-medium text-gray-900 dark:text-slate-50">Folders</div>
              <div className="tf-card-desc">Organize by position or stage</div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <Upload className="w-5 h-5 text-gray-600 dark:text-slate-400 mb-2" />
              <div className="font-medium text-gray-900 dark:text-slate-50">Export</div>
              <div className="tf-card-desc">Download candidate data</div>
            </div>
          </div>
        </section>
      </>
    ),
  },
  'resume-scoring': {
    id: 'resume-scoring',
    title: 'Using Resume Scoring',
    subtitle: 'AI-powered candidate ranking and matching',
    category: 'recruitment',
    readTime: '7 min',
    icon: BarChart3,
    content: (
      <>
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Overview</h2>
          <p className="text-gray-600 dark:text-slate-400 leading-relaxed">
            Resume Scoring uses AI to evaluate how well candidates match your job requirements.
            This helps you quickly identify the best fits from large applicant pools and prioritize
            who to interview first.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">How It Works</h2>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 text-center p-6 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
              <div className="w-12 h-12 bg-brand-blue text-white rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold shadow-md shadow-brand-blue/25 ring-1 ring-white/10">1</div>
              <div className="font-medium text-gray-900 dark:text-slate-50">Select JD</div>
              <div className="tf-card-desc mt-1">Choose the position</div>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="w-6 h-6 text-gray-400 dark:text-slate-500 rotate-90 md:rotate-0" />
            </div>
            <div className="flex-1 text-center p-6 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
              <div className="w-12 h-12 bg-brand-blue text-white rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold shadow-md shadow-brand-blue/25 ring-1 ring-white/10">2</div>
              <div className="font-medium text-gray-900 dark:text-slate-50">Select Resumes</div>
              <div className="tf-card-desc mt-1">Pick candidates to evaluate</div>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="w-6 h-6 text-gray-400 dark:text-slate-500 rotate-90 md:rotate-0" />
            </div>
            <div className="flex-1 text-center p-6 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
              <div className="w-12 h-12 bg-brand-blue text-white rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold shadow-md shadow-brand-blue/25 ring-1 ring-white/10">3</div>
              <div className="font-medium text-gray-900 dark:text-slate-50">AI Analysis</div>
              <div className="tf-card-desc mt-1">AI compares against requirements</div>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="w-6 h-6 text-gray-400 dark:text-slate-500 rotate-90 md:rotate-0" />
            </div>
            <div className="flex-1 text-center p-6 bg-success-subtle rounded-xl ring-1 ring-success-line">
              <div className="w-12 h-12 bg-success-strong text-white rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">4</div>
              <div className="font-medium text-gray-900 dark:text-slate-50">Get Scores</div>
              <div className="tf-card-desc mt-1">View ranked results</div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Understanding Scores</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-4">Scores range from 0-100 based on match quality:</p>

          <div className="space-y-3">
            <div className="flex items-center gap-4 p-4 bg-success-subtle rounded-lg ring-1 ring-success-line">
              <div className="text-2xl font-bold text-success-strong">90-100</div>
              <div>
                <div className="font-medium text-success-strong">Excellent Match</div>
                <div className="text-sm text-success-strong">Top candidate - prioritize for interview</div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-brand-blue/5 rounded-lg ring-1 ring-brand-blue/15">
              <div className="text-2xl font-bold text-brand-blue">75-89</div>
              <div>
                <div className="font-semibold text-brand-blue">Strong Match</div>
                <div className="text-sm text-brand-blue/80">Good fit - consider for interview</div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-warning-subtle rounded-lg ring-1 ring-warning-line">
              <div className="text-2xl font-bold text-warning-strong">60-74</div>
              <div>
                <div className="font-medium text-warning-strong">Moderate Match</div>
                <div className="text-sm text-warning-strong">Potential fit - review manually</div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="text-2xl font-bold text-gray-500 dark:text-slate-400">Below 60</div>
              <div>
                <div className="font-medium text-gray-700 dark:text-slate-300">Low Match</div>
                <div className="tf-card-desc">May not meet key requirements</div>
              </div>
            </div>
          </div>
        </section>

        <Tip type="info">
          Don't rely solely on scores. Use them as a starting point to prioritize candidates,
          then review top scorers manually for cultural fit and other factors AI can't measure.
        </Tip>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-6">Starting a Scoring Session</h2>
          <Step number={1} title="Navigate to Resume Scoring">
            <NavPath>Recruitment</NavPath>
            <NavPath isLast>Resume Scoring</NavPath>
          </Step>
          <Step number={2} title="Click 'New Scoring Session'">
            <p>Start a new batch of scoring</p>
          </Step>
          <Step number={3} title="Select the Job Description">
            <p>Choose which position to score against</p>
          </Step>
          <Step number={4} title="Choose Resumes">
            <p>Select individual resumes or score all in a folder</p>
          </Step>
          <Step number={5} title="Review Results">
            <p>View scores, breakdowns, and take action on candidates</p>
          </Step>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Score Breakdown</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-4">Each score includes detailed analysis:</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Skills Match</div>
              <div className="tf-card-desc">How well technical skills align</div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Experience Match</div>
              <div className="tf-card-desc">Years and relevance of experience</div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Education Match</div>
              <div className="tf-card-desc">Qualifications alignment</div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Overall Fit</div>
              <div className="tf-card-desc">Combined assessment score</div>
            </div>
          </div>
        </section>
      </>
    ),
  },
  'create-assessments': {
    id: 'create-assessments',
    title: 'Creating & Managing Assessments',
    subtitle: 'Evaluate candidates with tests and AI interviews',
    category: 'assessments',
    readTime: '10 min',
    icon: ClipboardCheck,
    content: (
      <>
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Overview</h2>
          <p className="text-gray-600 dark:text-slate-400 leading-relaxed">
            Assessments help you evaluate candidates beyond their resumes through structured tests,
            quizzes, and AI-powered interviews. Create custom assessments tailored to each role.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Types of Assessments</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] bg-white dark:bg-slate-900 rounded-xl">
              <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center mb-3">
                <ClipboardCheck className="w-4 h-4 text-brand-blue" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-slate-50 mb-2">Technical Quiz</h3>
              <p className="tf-card-desc">Multiple choice, coding questions, and problem-solving tests</p>
            </div>
            <div className="p-5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] bg-white dark:bg-slate-900 rounded-xl">
              <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center mb-3">
                <BarChart3 className="w-4 h-4 text-brand-blue" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-slate-50 mb-2">Skill Assessment</h3>
              <p className="tf-card-desc">Practical tasks and hands-on exercises</p>
            </div>
            <div className="p-5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] bg-white dark:bg-slate-900 rounded-xl">
              <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center mb-3">
                <MessageCircle className="w-4 h-4 text-brand-blue" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-slate-50 mb-2">AI Interview</h3>
              <p className="tf-card-desc">Automated video interviews with AI analysis</p>
            </div>
            <div className="p-5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] bg-white dark:bg-slate-900 rounded-xl">
              <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center mb-3">
                <Settings className="w-4 h-4 text-brand-blue" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-slate-50 mb-2">Custom Assessment</h3>
              <p className="tf-card-desc">Your own evaluation criteria and scoring</p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-6">Creating an Assessment</h2>

          <Step number={1} title="Basic Setup">
            <div className="mb-3">
              <NavPath>Recruitment</NavPath>
              <NavPath>Assessments</NavPath>
              <NavPath isLast>Create AI Assessment</NavPath>
            </div>
            <ul className="space-y-1 text-sm">
              <FeatureItem>Enter assessment name and description</FeatureItem>
              <FeatureItem>Link to a Job Description (optional)</FeatureItem>
              <FeatureItem>Select assessment type</FeatureItem>
            </ul>
          </Step>

          <Step number={2} title="Add Questions">
            <p className="mb-3">Build your assessment with various question types:</p>
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-900 dark:text-slate-50">Multiple Choice:</span>
                <span className="text-gray-600 dark:text-slate-400 ml-2">4 options, mark correct answer, set points</span>
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-slate-50">Coding Questions:</span>
                <span className="text-gray-600 dark:text-slate-400 ml-2">Problem description, language, test cases, time limit</span>
              </div>
              <div>
                <span className="font-medium text-gray-900 dark:text-slate-50">Written Response:</span>
                <span className="text-gray-600 dark:text-slate-400 ml-2">Open-ended prompts with word limits</span>
              </div>
            </div>
          </Step>

          <Step number={3} title="Configure Settings">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                <div className="font-medium text-gray-900 dark:text-slate-50">Time Limit</div>
                <div className="text-gray-600 dark:text-slate-400">Total duration allowed</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                <div className="font-medium text-gray-900 dark:text-slate-50">Passing Score</div>
                <div className="text-gray-600 dark:text-slate-400">Minimum score to pass</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                <div className="font-medium text-gray-900 dark:text-slate-50">Randomization</div>
                <div className="text-gray-600 dark:text-slate-400">Shuffle question order</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                <div className="font-medium text-gray-900 dark:text-slate-50">Deadline</div>
                <div className="text-gray-600 dark:text-slate-400">When assessment closes</div>
              </div>
            </div>
          </Step>

          <Step number={4} title="Invite Candidates">
            <ul className="space-y-1 text-sm">
              <FeatureItem>Click "Invite Candidates" button</FeatureItem>
              <FeatureItem>Enter email addresses or select from database</FeatureItem>
              <FeatureItem>Customize the invitation message</FeatureItem>
              <FeatureItem>Candidates receive email with unique link</FeatureItem>
            </ul>
          </Step>
        </section>

        <Tip type="warning">
          Keep assessments focused and respect candidates' time. 30-60 minutes is ideal.
          Very long assessments can lead to candidate drop-off.
        </Tip>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Reviewing Results</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-4">After candidates complete assessments:</p>
          <ul className="space-y-2">
            <FeatureItem>View individual scores and detailed breakdowns</FeatureItem>
            <FeatureItem>Compare candidates side-by-side</FeatureItem>
            <FeatureItem>See time spent on each question</FeatureItem>
            <FeatureItem>Review written responses and code submissions</FeatureItem>
            <FeatureItem>Export results for team review</FeatureItem>
          </ul>
        </section>
      </>
    ),
  },
  'team-management': {
    id: 'team-management',
    title: 'Managing Your Team',
    subtitle: 'User roles, permissions, and collaboration',
    category: 'organization',
    readTime: '6 min',
    icon: Users,
    content: (
      <>
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">User Roles</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-4">TalentFlow has three main roles with different permission levels:</p>

          <div className="space-y-4">
            <div className="p-5 ring-1 ring-brand-blue/20 bg-brand-blue/5 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="px-3 py-1 bg-brand-blue text-white rounded-full text-sm font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10">Admin</div>
              </div>
              <p className="text-gray-700 dark:text-slate-300">Full access to all features including user management, billing, and settings. Can invite and manage other users.</p>
            </div>
            <div className="p-5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] bg-white dark:bg-slate-900 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="px-3 py-1 bg-brand-blue text-white rounded-full text-sm font-medium shadow-md ring-1 ring-white/10">Recruiter</div>
              </div>
              <p className="text-gray-600 dark:text-slate-400">Can create JDs, manage candidates, upload resumes, run assessments, and use AI features. Cannot manage users or billing.</p>
            </div>
            <div className="p-5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] bg-white dark:bg-slate-900 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="px-3 py-1 bg-gray-400 text-white rounded-full text-sm font-medium">Viewer</div>
              </div>
              <p className="text-gray-600 dark:text-slate-400">Read-only access to reports and candidate data. Cannot make changes or take actions.</p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-6">Inviting Team Members</h2>
          <Step number={1} title="Navigate to User Management">
            <NavPath>Organization</NavPath>
            <NavPath isLast>User Management</NavPath>
          </Step>
          <Step number={2} title="Click 'Invite User'">
            <p>Opens the invitation form</p>
          </Step>
          <Step number={3} title="Enter Details">
            <ul className="space-y-1 text-sm">
              <FeatureItem>Enter their email address</FeatureItem>
              <FeatureItem>Select their role (Admin, Recruiter, Viewer)</FeatureItem>
              <FeatureItem>Add to specific teams (optional)</FeatureItem>
            </ul>
          </Step>
          <Step number={4} title="Send Invitation">
            <p>User receives email to set up their account</p>
          </Step>
        </section>

        <Tip type="tip">
          Follow the principle of least privilege - only give users the permissions they need for their job function.
        </Tip>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Creating Teams</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-4">Organize users into teams for project-based hiring:</p>
          <div className="mb-3">
            <NavPath>Organization</NavPath>
            <NavPath isLast>Team Management</NavPath>
          </div>
          <ul className="space-y-2">
            <FeatureItem>Click "Create Team" to start</FeatureItem>
            <FeatureItem>Name the team (e.g., "Engineering Hiring")</FeatureItem>
            <FeatureItem>Add team members from your organization</FeatureItem>
            <FeatureItem>Assign a team lead</FeatureItem>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Team Chat</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-4">Communicate with your team in real-time:</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Channels</div>
              <div className="tf-card-desc">Create topic-based discussions</div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Direct Messages</div>
              <div className="tf-card-desc">Private 1-on-1 conversations</div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Share Candidates</div>
              <div className="tf-card-desc">Discuss profiles with team</div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-1">Notifications</div>
              <div className="tf-card-desc">Stay updated on mentions</div>
            </div>
          </div>
        </section>
      </>
    ),
  },
  'subscription-billing': {
    id: 'subscription-billing',
    title: 'Understanding Your Subscription',
    subtitle: 'Plans, usage, and billing management',
    category: 'billing',
    readTime: '5 min',
    icon: CreditCard,
    content: (
      <>
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Plans Overview</h2>

          <div className="overflow-x-auto tf-table-shell">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-white dark:bg-slate-900">
                  <th className="px-4 py-3 text-left tf-th border border-gray-200 dark:border-slate-700">Feature</th>
                  <th className="px-4 py-3 text-center tf-th border border-gray-200 dark:border-slate-700">Starter</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold border border-gray-200 dark:border-slate-700 bg-brand-blue/5 text-brand-blue">Professional</th>
                  <th className="px-4 py-3 text-center tf-th border border-gray-200 dark:border-slate-700">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3 tf-td border border-gray-200 dark:border-slate-700">Users</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700">3</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">10</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700">Unlimited</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 tf-td border border-gray-200 dark:border-slate-700">Resume Storage</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700">100/mo</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">500/mo</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700">Unlimited</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 tf-td border border-gray-200 dark:border-slate-700">Assessments</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700">10/mo</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">50/mo</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700">Unlimited</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 tf-td border border-gray-200 dark:border-slate-700">AI Features</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700">Basic</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">Advanced</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700">Premium</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 tf-td border border-gray-200 dark:border-slate-700">Support</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700">Email</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">Priority</td>
                  <td className="px-4 py-3 tf-card-desc text-center border border-gray-200 dark:border-slate-700">Dedicated</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Checking Your Usage</h2>
          <div className="mb-3">
            <NavPath>Subscription</NavPath>
            <NavPath isLast>Usage & Quotas</NavPath>
          </div>
          <p className="text-gray-600 dark:text-slate-400 mb-4">Monitor your usage for each feature:</p>
          <ul className="space-y-2">
            <FeatureItem>Resume uploads used vs. remaining</FeatureItem>
            <FeatureItem>Assessments created this billing period</FeatureItem>
            <FeatureItem>AI credits consumed</FeatureItem>
            <FeatureItem>Active users count</FeatureItem>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Managing Your Plan</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-5 border border-gray-200 dark:border-slate-700 rounded-xl">
              <h3 className="font-semibold text-gray-900 dark:text-slate-50 mb-3">Upgrade Plan</h3>
              <ol className="space-y-2 text-sm text-gray-600 dark:text-slate-400">
                <li>1. Go to Subscription → Current Plan</li>
                <li>2. Click "Upgrade"</li>
                <li>3. Select new plan</li>
                <li>4. Confirm payment</li>
                <li>5. New features available immediately</li>
              </ol>
            </div>
            <div className="p-5 border border-gray-200 dark:border-slate-700 rounded-xl">
              <h3 className="font-semibold text-gray-900 dark:text-slate-50 mb-3">Billing History</h3>
              <ol className="space-y-2 text-sm text-gray-600 dark:text-slate-400">
                <li>1. Go to Subscription → Billing History</li>
                <li>2. View all invoices</li>
                <li>3. Download receipts</li>
                <li>4. Check payment status</li>
              </ol>
            </div>
          </div>
        </section>

        <Tip type="info">
          Need more units mid-cycle? You can purchase add-on packs for additional resume uploads,
          assessments, or AI credits without changing your plan.
        </Tip>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Need Billing Help?</h2>
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
            <p className="mb-3 text-gray-900 dark:text-slate-50">Contact our billing support team:</p>
            <div className="space-y-2 tf-card-desc">
              <div>Email: <span className="text-brand-blue">billing@talentflow.com</span></div>
              <div>Include your account ID for faster support</div>
            </div>
          </div>
        </section>
      </>
    ),
  },
  'ai-talent-match': {
    id: 'ai-talent-match',
    title: 'Using AI Talent Match',
    subtitle: 'Find the best candidates with intelligent matching',
    category: 'recruitment',
    readTime: '6 min',
    icon: BarChart3,
    content: (
      <>
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Overview</h2>
          <p className="text-gray-600 dark:text-slate-400 leading-relaxed">
            AI Talent Match intelligently analyzes your job requirements and scans your entire resume
            database to find the best matching candidates. It saves hours of manual screening and
            ensures you don't miss great candidates.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-6">How to Start a Match Session</h2>

          <Step number={1} title="Navigate to AI Talent Match">
            <NavPath>Recruitment</NavPath>
            <NavPath isLast>AI Talent Match</NavPath>
          </Step>

          <Step number={2} title="Click 'New Match Session'">
            <p>Opens the matching wizard</p>
          </Step>

          <Step number={3} title="Select the Job Description">
            <p>Choose which position you're hiring for</p>
          </Step>

          <Step number={4} title="Choose Your Resume Pool">
            <ul className="space-y-1 text-sm">
              <FeatureItem>All resumes in database</FeatureItem>
              <FeatureItem>Specific folder only</FeatureItem>
              <FeatureItem>Recent uploads (last 30 days)</FeatureItem>
            </ul>
          </Step>

          <Step number={5} title="Click 'Find Matches'">
            <p>AI analyzes and ranks candidates within seconds</p>
          </Step>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Understanding Results</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-4">Each matched candidate shows:</p>

          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
              <div className="w-16 h-16 bg-success-subtle rounded-lg flex items-center justify-center">
                <span className="text-2xl font-bold text-success-strong">85</span>
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-slate-50">Match Score</div>
                <div className="tf-card-desc">Overall compatibility rating (0-100)</div>
              </div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-2">Key Strengths</div>
              <div className="tf-card-desc">Why this candidate is a good fit for the role</div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-2">Potential Gaps</div>
              <div className="tf-card-desc">Areas that may need attention or training</div>
            </div>
            <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-slate-50 mb-2">Recommended Actions</div>
              <div className="tf-card-desc">Suggested next steps for this candidate</div>
            </div>
          </div>
        </section>

        <Tip type="tip">
          The more detailed your Job Description, the better the AI can match candidates.
          Include specific skills, experience levels, and nice-to-haves for best results.
        </Tip>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">Taking Action on Matches</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-4">For each matched candidate, you can:</p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="p-3 border border-gray-200 dark:border-slate-700 rounded-lg tf-body">
              <span className="font-medium text-gray-900 dark:text-slate-50">View Profile</span> - See full resume details
            </div>
            <div className="p-3 border border-gray-200 dark:border-slate-700 rounded-lg tf-body">
              <span className="font-medium text-gray-900 dark:text-slate-50">Score Resume</span> - Get detailed scoring
            </div>
            <div className="p-3 border border-gray-200 dark:border-slate-700 rounded-lg tf-body">
              <span className="font-medium text-gray-900 dark:text-slate-50">Invite to Assessment</span> - Send test invitation
            </div>
            <div className="p-3 border border-gray-200 dark:border-slate-700 rounded-lg tf-body">
              <span className="font-medium text-gray-900 dark:text-slate-50">Add to Shortlist</span> - Save for later
            </div>
          </div>
        </section>
      </>
    ),
  },
};

const categories = [
  { id: 'all', name: 'All Articles', icon: Book },
  { id: 'basics', name: 'Getting Started', icon: Lightbulb },
  { id: 'recruitment', name: 'Recruitment', icon: Briefcase },
  { id: 'assessments', name: 'Assessments', icon: ClipboardCheck },
  { id: 'organization', name: 'Organization', icon: Users },
  { id: 'billing', name: 'Billing', icon: CreditCard },
];

export default function HelpCenterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const articleId = searchParams.get('article');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const selectedArticle = articleId ? helpArticles[articleId as keyof typeof helpArticles] : null;

  const filteredArticles = Object.values(helpArticles).filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Article view
  if (selectedArticle) {
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Help Center', href: '/help' }, { label: selectedArticle.title }]} />
          {/* Back button */}
          <button
            onClick={() => router.push('/help')}
            className="inline-flex items-center gap-2 text-sm sm:text-base text-gray-600 dark:text-slate-400 hover:text-brand-blue mb-4 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Help Center</span>
          </button>

          {/* Article header */}
          <div className="mb-5 flex flex-col gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                <selectedArticle.icon className="h-5 w-5 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <h1 className="tf-page-title">{selectedArticle.title}</h1>
                <p className="mt-0.5 tf-card-desc">{selectedArticle.subtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 tf-body-muted">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {selectedArticle.readTime} read
              </span>
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 rounded-full capitalize text-gray-700 dark:text-slate-300">{selectedArticle.category}</span>
            </div>
          </div>

          {/* Article content */}
          <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-5 sm:p-8 md:p-10">
            {selectedArticle.content}
          </div>

          {/* Related articles */}
          <div className="mt-10">
            <h3 className="tf-section-title mb-4">Related Articles</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.values(helpArticles)
                .filter(a => a.id !== selectedArticle.id && a.category === selectedArticle.category)
                .slice(0, 2)
                .map(article => (
                  <button
                    key={article.id}
                    onClick={() => router.push(`/help?article=${article.id}`)}
                    className="p-4 sm:p-5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] hover:border-brand-blue/30 hover:shadow-md transition-all text-left group"
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
        </div>
        </div>
      </main>
    );
  }

  // Help center home
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Help Center' }]} />
        {/* Header */}
        <div className="mb-5 flex flex-col gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
              <LifeBuoy className="h-5 w-5 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h1 className="tf-page-title">Help Center</h1>
              <p className="mt-0.5 tf-card-desc">Find answers, guides, and tutorials to help you succeed</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search for help articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2.5 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
              />
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-hide -mx-1 px-1 justify-start sm:flex-wrap">
          {categories.map(category => (
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

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-5">
          <button
            onClick={() => router.push('/help?article=getting-started')}
            className="p-4 sm:p-6 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] hover:border-brand-blue/30 hover:shadow-md transition-all text-left"
          >
            <Lightbulb className="w-6 h-6 sm:w-8 sm:h-8 mb-2 sm:mb-3 text-brand-blue" />
            <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">Quick Start Guide</div>
            <div className="tf-body-muted mt-0.5 sm:mt-1">New to TalentFlow? Start here</div>
          </button>
          <button
            onClick={() => router.push('/support-tickets')}
            className="p-4 sm:p-6 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] hover:border-brand-blue/30 hover:shadow-md transition-all text-left"
          >
            <MessageCircle className="w-6 h-6 sm:w-8 sm:h-8 mb-2 sm:mb-3 text-brand-blue" />
            <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">Contact Support</div>
            <div className="tf-body-muted mt-0.5 sm:mt-1">Get personalized help</div>
          </button>
          <button
            onClick={() => router.push('/settings/general-settings')}
            className="p-4 sm:p-6 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] hover:border-brand-blue/30 hover:shadow-md transition-all text-left"
          >
            <Settings className="w-6 h-6 sm:w-8 sm:h-8 mb-2 sm:mb-3 text-brand-blue" />
            <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">Settings</div>
            <div className="tf-body-muted mt-0.5 sm:mt-1">Configure your account</div>
          </button>
        </div>

        {/* Articles Grid */}
        <div className="mb-5">
          <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4 sm:mb-6">
            {selectedCategory === 'all' ? 'All Articles' : categories.find(c => c.id === selectedCategory)?.name}
            <span className="text-gray-400 dark:text-slate-500 font-normal ml-2">({filteredArticles.length})</span>
          </h2>

          {filteredArticles.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-slate-500">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg">No articles found matching your search</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
              {filteredArticles.map(article => (
                <button
                  key={article.id}
                  onClick={() => router.push(`/help?article=${article.id}`)}
                  className="p-4 sm:p-5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] hover:border-brand-blue/30 hover:shadow-md transition-all text-left group"
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                      <article.icon className="h-5 w-5 text-brand-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-slate-50 group-hover:text-brand-blue mb-1 line-clamp-2">
                        {article.title}
                      </h3>
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

        {/* Contact Section */}
        <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-4 sm:p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-6">Still need help?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a
              href="mailto:support@talentflow.com"
              className="flex items-center gap-4 p-5 bg-brand-blue/[0.04] dark:bg-brand-blue/10 ring-1 ring-brand-blue/10 dark:ring-brand-blue/20 rounded-xl hover:bg-brand-blue/[0.08] dark:hover:bg-brand-blue/15 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <MessageCircle className="h-5 w-5 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 dark:text-slate-50">Email Support</div>
                <div className="text-gray-500 dark:text-slate-400">support@talentflow.com</div>
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
