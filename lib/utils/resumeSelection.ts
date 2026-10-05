/* Shared by the three invite pickers ("Select From" in ShareAIInterviewModal,
   ShareAssessmentModal and InviteToAssessmentModal).

   A pick keeps the resume's own name/email and the tab it was ticked on, so the
   selection survives switching tabs or folders, and the picker can say how many
   came from each source. The same resume can appear in both tabs (My Resumes is
   a subset of the Shared Database) — it shares one id, so it's picked once. */

export type PickSource = 'my-resumes' | 'shared-db';

export interface PickedResume {
  id: string;
  name: string;
  email: string;
  origin: PickSource;
}

export type ResumePicks = Record<string, PickedResume>;

export interface PickPartition {
  /** Will become candidates. */
  accepted: PickedResume[];
  /** No email on the resume — can't be invited. */
  noEmail: PickedResume[];
  /** Email already in the candidate list, or on another picked resume. */
  duplicate: PickedResume[];
}

export const togglePick = (picks: ResumePicks, resume: { id: string; name: string; email: string }, origin: PickSource): ResumePicks => {
  if (picks[resume.id]) {
    const { [resume.id]: _removed, ...rest } = picks;
    return rest;
  }
  return { ...picks, [resume.id]: { id: resume.id, name: resume.name, email: resume.email, origin } };
};

/** Tick every row shown, or untick them all when all are already ticked — picks elsewhere are kept. */
export const toggleAllPicks = (picks: ResumePicks, shown: { id: string; name: string; email: string }[], origin: PickSource): ResumePicks => {
  const allPicked = shown.length > 0 && shown.every((r) => picks[r.id]);
  const next = { ...picks };
  for (const r of shown) {
    if (allPicked) delete next[r.id];
    else if (!next[r.id]) next[r.id] = { id: r.id, name: r.name, email: r.email, origin };
  }
  return next;
};

export const partitionPicks = (picks: ResumePicks, existingEmails: Iterable<string>): PickPartition => {
  const seen = new Set<string>();
  for (const e of existingEmails) if (e.trim()) seen.add(e.trim().toLowerCase());
  const out: PickPartition = { accepted: [], noEmail: [], duplicate: [] };
  for (const p of Object.values(picks)) {
    const key = p.email.trim().toLowerCase();
    if (!key) out.noEmail.push(p);
    else if (seen.has(key)) out.duplicate.push(p);
    else { seen.add(key); out.accepted.push(p); }
  }
  return out;
};

export const countBySource = (list: { origin: PickSource }[]) => ({
  myResumes: list.filter((p) => p.origin === 'my-resumes').length,
  sharedDb: list.filter((p) => p.origin === 'shared-db').length,
});

/** "My Resumes 2 · Shared Database 1 · Manual 1" for the send footer — nonzero sources only. */
export const sourceBreakdown = (list: { origin?: string; source?: string }[]): string => {
  const labels: [string, string][] = [['my-resumes', 'My Resumes'], ['shared-db', 'Shared Database'], ['database', 'Resumes'], ['excel', 'Excel'], ['manual', 'Manual']];
  const counts: Record<string, number> = {};
  for (const c of list) {
    // Rows without an origin: prefilled ones came from a resume page, typed ones are manual.
    const key = c.origin ?? (c.source === 'database' ? 'database' : 'manual');
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return labels.filter(([k]) => counts[k]).map(([k, label]) => `${label} ${counts[k]}`).join(' · ');
};
