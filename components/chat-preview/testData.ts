/* Chat test page — TEMPORARY TEST DATA. Only /tmp-chat-preview reads this;
   it never reaches the live app or any API. */

import type { Conversation, Job, Person } from './types';

const MIN = 60_000;
const at = (base: number, minutesAgo: number) => base - minutesAgo * MIN;

export const TINTS = ['from-sky-200 to-indigo-200', 'from-amber-200 to-rose-200', 'from-emerald-200 to-teal-200'];

export const PEOPLE: Person[] = [
  { id: 'u-anitha', name: 'Anitha Krishnan', role: 'super_admin', title: 'Head of Talent', email: 'anitha@company.com', presence: 'online' },
  { id: 'u-karthik', name: 'Karthik Subramani', role: 'hr_admin', title: 'HR Manager', email: 'karthik@company.com', presence: 'online', jobIds: ['j-py', 'j-de', 'j-ux'] },
  { id: 'u-mani', name: 'Manigandan M', role: 'recruiter', title: 'Senior Recruiter', email: 'manigandan@company.com', presence: 'online', jobIds: ['j-py', 'j-de'] },
  { id: 'u-priya', name: 'Priya Sharma', role: 'recruiter', title: 'Recruiter', email: 'priya@company.com', presence: 'online', jobIds: ['j-py', 'j-ux'] },
  { id: 'u-sam', name: 'Samuel Joseph', role: 'hiring_manager', title: 'Engineering Manager', email: 'samuel@company.com', presence: 'away', jobIds: ['j-py', 'j-de'] },
  { id: 'u-arun', name: 'Arun Raj', role: 'interviewer', title: 'Staff Engineer', email: 'arun@company.com', presence: 'offline', jobIds: ['j-py'] },
  { id: 'u-divya', name: 'Divya Nair', role: 'interviewer', title: 'Design Lead', email: 'divya@company.com', presence: 'online', jobIds: ['j-ux'] },
  { id: 'c-rahul', name: 'Rahul Verma', role: 'candidate', title: 'Candidate', email: 'rahul.v@gmail.com', presence: 'online' },
  { id: 'c-sneha', name: 'Sneha Iyer', role: 'candidate', title: 'Candidate', email: 'sneha.iyer@gmail.com', presence: 'offline' },
];

export const JOBS: Job[] = [
  { id: 'j-py', code: 'JD-450', title: 'Senior Python Developer', version: 2, department: 'Engineering', location: 'Chennai · Hybrid' },
  { id: 'j-de', code: 'JD-462', title: 'Data Engineer', version: 1, department: 'Data', location: 'Bengaluru · Remote' },
  { id: 'j-ux', code: 'JD-471', title: 'Product Designer', version: 3, department: 'Design', location: 'Chennai · On-site' },
];

/** The viewer each role switch signs in as. */
export const PERSONA_BY_ROLE: Record<Person['role'], string> = {
  super_admin: 'u-anitha',
  hr_admin: 'u-karthik',
  recruiter: 'u-mani',
  hiring_manager: 'u-sam',
  interviewer: 'u-arun',
  candidate: 'c-rahul',
};

export function seedConversations(now: number): Conversation[] {
  return [
    {
      id: 'ch-py', kind: 'channel', jobId: 'j-py', createdAt: at(now, 60 * 72),
      description: 'Hiring channel for JD-450 · Senior Python Developer. Created automatically with the job.',
      memberIds: ['u-karthik', 'u-mani', 'u-priya', 'u-sam', 'u-arun'], adminIds: ['u-mani'],
      unreadFor: { 'u-mani': 3, 'u-sam': 1, 'u-karthik': 2, 'u-arun': 4, 'u-anitha': 0 }, typingIds: ['u-priya'],
      messages: [
        { id: 'py0', authorId: 'system', text: 'Channel created for JD-450 · Senior Python Developer (v1)', at: at(now, 60 * 72), reactions: [] },
        { id: 'py1', authorId: 'u-karthik', text: 'Morning all — v2 of the JD is published. Please start sourcing.', at: at(now, 60 * 26), reactions: [{ emoji: '👍', userIds: ['u-priya', 'u-mani'] }], readBy: ['u-mani', 'u-priya', 'u-sam'] },
        { id: 'py2', authorId: 'u-mani', text: 'On it. Running AI Talent Match on the shared database first. @Samuel any must-haves?', at: at(now, 60 * 26 - 3), reactions: [], status: 'sent', readBy: ['u-karthik', 'u-sam', 'u-priya'] },
        { id: 'py3', authorId: 'u-sam', text: 'FastAPI + Postgres, and at least one production migration story.', at: at(now, 60 * 25), reactions: [{ emoji: '✅', userIds: ['u-mani'] }], replyToId: 'py2', pinned: true, readBy: ['u-mani'] },
        { id: 'py4', authorId: 'system', text: 'Samuel Joseph added Arun Raj to the channel', at: at(now, 120), reactions: [] },
        { id: 'py5', authorId: 'u-arun', text: 'Interview rubric for round 2 attached.', at: at(now, 95), reactions: [], attachments: [{ id: 'a1', kind: 'pdf', name: 'Round-2-rubric.pdf', size: '284 KB' }] },
        { id: 'py6', authorId: 'u-priya', text: 'Shortlist so far:', at: at(now, 30), reactions: [], attachments: [{ id: 'a2', kind: 'xls', name: 'JD-450-shortlist.xlsx', size: '48 KB' }, { id: 'a3', kind: 'image', name: 'score-distribution.png', size: '412 KB', tint: 'from-sky-200 to-indigo-200' }] },
        { id: 'py7', authorId: 'u-sam', text: 'Can we schedule AI interviews for the top 5 this week?', at: at(now, 9), reactions: [] },
        { id: 'py8', authorId: 'u-karthik', text: 'Thursday and Friday afternoons work for the panel.', at: at(now, 8), reactions: [], editedAt: at(now, 7) },
      ],
    },
    {
      id: 'ch-de', kind: 'channel', jobId: 'j-de', createdAt: at(now, 60 * 120),
      description: 'Hiring channel for JD-462 · Data Engineer.',
      memberIds: ['u-karthik', 'u-mani', 'u-sam'], adminIds: [],
      unreadFor: {}, mutedBy: ['u-mani'],
      messages: [
        { id: 'de0', authorId: 'system', text: 'Channel created for JD-462 · Data Engineer (v1)', at: at(now, 60 * 120), reactions: [] },
        { id: 'de1', authorId: 'u-sam', text: 'Offer band for this role is approved.', at: at(now, 60 * 5), reactions: [], pinned: true },
        { id: 'de2', authorId: 'u-mani', text: 'Thanks Samuel, I will update the JD salary range.', at: at(now, 60 * 5 - 4), reactions: [], status: 'sent', readBy: ['u-sam'] },
      ],
    },
    {
      id: 'ch-ux', kind: 'channel', jobId: 'j-ux', createdAt: at(now, 60 * 200), archived: true,
      description: 'Hiring channel for JD-471 · Product Designer. Archived after the role was filled.',
      memberIds: ['u-karthik', 'u-priya', 'u-divya'], adminIds: ['u-priya'], unreadFor: {},
      messages: [
        { id: 'ux0', authorId: 'system', text: 'Channel created for JD-471 · Product Designer (v3)', at: at(now, 60 * 200), reactions: [] },
        { id: 'ux1', authorId: 'u-priya', text: 'Offer accepted 🎉 Closing this channel.', at: at(now, 60 * 50), reactions: [{ emoji: '🎉', userIds: ['u-divya', 'u-karthik'] }] },
        { id: 'ux2', authorId: 'system', text: 'Karthik Subramani archived the channel', at: at(now, 60 * 49), reactions: [] },
      ],
    },
    {
      id: 'dm-priya', kind: 'direct', participantIds: ['u-mani', 'u-priya'], memberIds: ['u-mani', 'u-priya'], createdAt: at(now, 60 * 400),
      unreadFor: { 'u-mani': 2 },
      messages: [
        { id: 'dp1', authorId: 'u-mani', text: 'Hi Priya, can you share the assessment results for JD-450?', at: at(now, 40), reactions: [], status: 'sent', readBy: ['u-priya'] },
        { id: 'dp2', authorId: 'u-priya', text: 'Sure! 7 candidates completed, 4 passed the cut-off.', at: at(now, 12), reactions: [] },
        { id: 'dp3', authorId: 'u-priya', text: 'Report attached.', at: at(now, 11), reactions: [], attachments: [{ id: 'a4', kind: 'doc', name: 'Assessment-summary.docx', size: '96 KB' }] },
      ],
    },
    {
      id: 'dm-sam', kind: 'direct', participantIds: ['u-mani', 'u-sam'], memberIds: ['u-mani', 'u-sam'], createdAt: at(now, 60 * 500),
      unreadFor: {},
      messages: [
        { id: 'ds1', authorId: 'u-sam', text: 'Please review the onboarding checklist when you get a chance.', at: at(now, 60 * 30), reactions: [] },
        { id: 'ds2', authorId: 'u-mani', text: 'Will do today.', at: at(now, 60 * 29), reactions: [{ emoji: '👍', userIds: ['u-sam'] }], status: 'sent', readBy: ['u-sam'] },
      ],
    },
    {
      id: 'cd-rahul-py', kind: 'candidate', jobId: 'j-py', participantIds: ['u-mani', 'c-rahul'], memberIds: ['u-mani', 'c-rahul'], applicationStatus: 'AI Interview', createdAt: at(now, 60 * 48),
      unreadFor: { 'u-mani': 1 },
      messages: [
        { id: 'cr1', authorId: 'u-mani', text: 'Hi Rahul, congratulations on clearing the assessment for Senior Python Developer! Your AI interview link has been emailed.', at: at(now, 60 * 20), reactions: [], status: 'sent', readBy: ['c-rahul'] },
        { id: 'cr2', authorId: 'c-rahul', text: 'Thank you! Is there a deadline to complete it?', at: at(now, 25), reactions: [] },
      ],
    },
    {
      id: 'cd-rahul-de', kind: 'candidate', jobId: 'j-de', participantIds: ['u-mani', 'c-rahul'], memberIds: ['u-mani', 'c-rahul'], applicationStatus: 'Applied', createdAt: at(now, 60 * 10),
      unreadFor: {},
      messages: [
        { id: 'crd1', authorId: 'u-mani', text: 'Hi Rahul, thanks for applying to Data Engineer as well. We will review and get back this week.', at: at(now, 60 * 9), reactions: [], status: 'sent', readBy: [] },
      ],
    },
    {
      id: 'cd-sneha-py', kind: 'candidate', jobId: 'j-py', participantIds: ['u-mani', 'c-sneha'], memberIds: ['u-mani', 'c-sneha'], applicationStatus: 'Shortlisted', createdAt: at(now, 60 * 30),
      unreadFor: {},
      messages: [
        { id: 'cs1', authorId: 'u-mani', text: 'Hi Sneha, you are shortlisted for Senior Python Developer. An assessment invite is on its way.', at: at(now, 60 * 28), reactions: [], status: 'sent', readBy: [] },
      ],
    },
  ];
}

/** Job applications a recruiter can open a candidate chat for (one chat per application). */
export const APPLICATIONS: { candidateId: string; jobId: string; status: import('./types').ApplicationStatus }[] = [
  { candidateId: 'c-rahul', jobId: 'j-py', status: 'AI Interview' },
  { candidateId: 'c-rahul', jobId: 'j-de', status: 'Applied' },
  { candidateId: 'c-sneha', jobId: 'j-py', status: 'Shortlisted' },
  { candidateId: 'c-sneha', jobId: 'j-ux', status: 'Assessment' },
];
