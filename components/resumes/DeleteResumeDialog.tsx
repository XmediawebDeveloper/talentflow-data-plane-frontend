'use client';

import { useEffect, useState } from 'react';
import { Trash2, Lock, AlertCircle, HelpCircle, Layers, Loader2 } from 'lucide-react';
import { resumeService } from '@/lib/services/resumeService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** A single version picked in the version picker. Absent → every version. */
export interface DeleteResumeVersionTarget {
  id: string;
  version: number;
}

interface VersionRow {
  id: string;
  version: number;
  created_at?: string | null;
  file_name?: string | null;
}

interface DeleteResumeDialogProps {
  open: boolean;
  /** Display names of the resumes being deleted — one entry per resume. */
  names: string[];
  /** The resume being deleted, when it is one. Its versions are loaded and,
   *  if there are two or more, the user picks which one to delete. */
  resumeId?: string;
  onCancel: () => void;
  /** No argument: delete the resume (every version). A target: delete only
   *  that version (resumeService.delete(id, { onlyThisVersion: true })). */
  onConfirm: (version?: DeleteResumeVersionTarget) => void;
}

const uploadedOn = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * The one Delete Resume confirmation — Search Resume (Job Openings → ⋮ →
 * Search Resume) and My Resumes both render this, so the warnings, layout and
 * buttons can't drift apart again. No corner X (`hideClose`): it is dismissed
 * by the footer's Cancel (or Esc), next to the destructive Delete.
 */
export default function DeleteResumeDialog({ open, names, resumeId, onCancel, onConfirm }: DeleteResumeDialogProps) {
  const count = names.length;
  const single = count <= 1;

  /* Versions of the one resume being deleted. Loaded each time the dialog
     opens; the picker shows only when there are two or more. */
  const pickFor = open && single && resumeId ? resumeId : null;
  const [versions, setVersions] = useState<{ for: string; rows: VersionRow[] } | null>(null);
  const [choice, setChoice] = useState<'all' | string>('all');
  useEffect(() => {
    if (!pickFor) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice('all');
    resumeService.getVersions(pickFor)
      .then((data: VersionRow[]) => {
        if (!alive) return;
        const rows = (Array.isArray(data) ? data : [])
          .map((v) => ({ id: String(v.id), version: Number(v.version) || 1, created_at: v.created_at, file_name: v.file_name }))
          .sort((a, b) => b.version - a.version);
        setVersions({ for: pickFor, rows });
      })
      .catch(() => { if (alive) setVersions({ for: pickFor, rows: [] }); });
    return () => { alive = false; };
  }, [pickFor]);
  const rows = versions && versions.for === pickFor ? versions.rows : null;
  const loadingVersions = !!pickFor && rows === null;
  const multi = !!rows && rows.length > 1;
  const picked = multi && choice !== 'all' ? rows.find((r) => r.id === choice) ?? null : null;
  const pickedLabel = picked ? `Version ${picked.version}` : null;

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogContent className="sm:max-w-lg" hideClose>
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <div className="flex-1 pt-1">
              <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                {single ? 'Delete Resume' : `Delete ${count} Resumes`}
              </AlertDialogTitle>
              <p className="mt-1 tf-body-muted">This action is permanent and cannot be undone.</p>
            </div>
          </div>
          <AlertDialogDescription asChild>
            <div className="mt-2 space-y-4">
              <div className="space-y-4 rounded-xl border border-red-100 bg-red-50/60 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                    <Lock className="h-4 w-4" />
                  </span>
                  <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                  <p className="tf-body">
                    {picked ? `Deleted ${pickedLabel?.toLowerCase()}` : single ? 'Deleted resume' : 'Deleted resumes'}{' '}
                    <span className="font-semibold text-red-600">cannot be restored</span>.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                    <AlertCircle className="h-4 w-4" />
                  </span>
                  <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                  <p className="tf-body">
                    All associated data will be <span className="font-semibold text-red-600">permanently removed</span>.
                  </p>
                </div>
              </div>
              {loadingVersions && (
                <p className="flex items-center gap-2 tf-body-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking versions…
                </p>
              )}
              {multi && rows && (
                <fieldset className="space-y-2">
                  <legend className="mb-2 flex items-center gap-2 tf-row-title">
                    <Layers className="h-4 w-4 text-brand-blue" />
                    This resume has {rows.length} versions — which one do you want to delete?
                  </legend>
                  {[{ id: 'all', title: `All versions (${rows.length})`, sub: 'Removes the whole resume' },
                    ...rows.map((r, i) => ({
                      id: r.id,
                      title: `Version ${r.version}${i === 0 ? ' · Latest' : ''}`,
                      sub: [uploadedOn(r.created_at) ? `Uploaded ${uploadedOn(r.created_at)}` : null, r.file_name].filter(Boolean).join(' · ')
                        + (i === 0 ? ' — the previous version becomes the latest' : ''),
                    }))].map((o) => (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${choice === o.id
                        ? 'border-red-300 bg-red-50/60'
                        : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      <input
                        type="radio"
                        name="delete-resume-version"
                        value={o.id}
                        checked={choice === o.id}
                        onChange={() => setChoice(o.id)}
                        className="mt-1 accent-red-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900">{o.title}</span>
                        {o.sub && <span className="block text-xs text-gray-500 [overflow-wrap:anywhere]">{o.sub}</span>}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-brand-orange text-brand-orange">
                  <HelpCircle className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="break-words tf-row-title">
                    {picked ? (
                      <>Are you sure you want to delete {pickedLabel} of &ldquo;{names[0] ?? ''}&rdquo;?</>
                    ) : single ? (
                      <>Are you sure you want to delete &ldquo;{names[0] ?? ''}&rdquo;{multi ? ' and all its versions' : ''}?</>
                    ) : (
                      <>Are you sure you want to delete {count} resumes?</>
                    )}
                  </p>
                  <p className="mt-0.5 tf-body-muted">This action cannot be reversed.</p>
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="border-t border-gray-100 pt-4">
          {/* The dialog focuses Cancel when it opens, so the base focus ring
              showed on every open. Ring only for keyboard focus. */}
          <AlertDialogCancel
            onClick={onCancel}
            className="focus:ring-0 focus-visible:ring-2 focus-visible:ring-brand-blue/30"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(picked ? { id: picked.id, version: picked.version } : undefined)}
            disabled={loadingVersions}
            className="gap-2 bg-red-600 text-white hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4" />
            {picked ? `Delete ${pickedLabel}` : single ? 'Delete Resume' : 'Delete Resumes'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
