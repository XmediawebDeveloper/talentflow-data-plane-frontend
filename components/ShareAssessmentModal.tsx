import { X, Mail, Plus, Trash2, Send, CheckCircle, Clock, FileText, Users, Upload, Database, AlertTriangle, ShieldAlert, Info, FolderOpen, Folder, ChevronRight, ChevronDown, Loader2, FileSpreadsheet } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { assessmentService } from '@/lib/services';
import api from '@/lib/services/api';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import VersionBadge from './VersionBadge';
import SuccessAnimation from '@/components/ui/success-animation';
import { toast } from 'sonner';
import { useQuota } from '@/contexts/QuotaContext';
import { isValidEmailFormat } from '@/lib/utils/email';
import readXlsxFile from 'read-excel-file/browser';

// Delegates to the one shared, comprehensive format rule (lib/utils/email),
// used everywhere else a candidate email is entered or edited, rather than
// this file's own looser regex (which passed things like "user@example.c").
const isValidEmail = (email: string): boolean => isValidEmailFormat(email);

interface ShareAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: {
    id: string;
    title: string;
    duration: string;
    questions: number;
    type: string;
    short_id?: string; // Assessment ID like AS-022
    version?: number; // Assessment's live version (e.g., 19) — drives the AS-version badge
    jd_short_id?: string; // JD ID like JD-025
    jd_title?: string; // JD title
    jd_version?: number; // JD version number — distinct from assessment.version
    // Section-enable flags so the modal can render all configured sections
    // ("Technical • Coding • HR" etc.) instead of the single legacy `type`
    // label which only showed one section.
    hr_enabled?: boolean;
    technical_enabled?: boolean;
    coding_enabled?: boolean;
  };
  prefilledCandidates?: CandidateEmail[]; // Optional pre-filled candidates from resume selection
  inviteSource?: string; // Source context: "Resume Scoring", "JD", "Assessment", "Internal DB", "Manual"
  onInviteSent?: (count: number) => void;
  additionalAssessments?: Array<{
    id: string;
    title: string;
    duration: string;
    questions: number;
    type: string;
    short_id?: string; // Assessment ID like AS-022
    version?: number; // Assessment's live version
    jd_short_id?: string; // JD ID like JD-025
    jd_title?: string; // JD title
    jd_version?: number; // JD version number
    hr_enabled?: boolean;
    technical_enabled?: boolean;
    coding_enabled?: boolean;
  }>; // Additional assessments for bulk invite
}

interface CandidateEmail {
  id: string;
  name: string;
  email: string;
  phone?: string; // Phone number
  source?: 'manual' | 'database'; // Track source
  resumeId?: string; // Link to resume if from database
}

interface Resume {
  id: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  experience: string;
  skills: string[];
}

export default function ShareAssessmentModal({ isOpen, onClose, assessment, prefilledCandidates, inviteSource, onInviteSent, additionalAssessments }: ShareAssessmentModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { quotaData } = useQuota();

  // Quota stats state
  const [quotaStats, setQuotaStats] = useState<{
    total_quota: number;
    consumed: number;
    pending: number;
    available: number;
  } | null>(null);
  const [quotaStatsLoading, setQuotaStatsLoading] = useState(false);

  // Remove "- Version X" from title for email display
  const assessmentTitleForEmail = stripVersionFromTitle(assessment.title);

  // All assessments to send invitations for (main + additional)
  const allAssessments = [assessment, ...(additionalAssessments || [])];

  const [inputMode, setInputMode] = useState<'manual' | 'database'>('manual');
  /* Upload Excel's hidden file input — the Share AI Interview via Email
     dialog's control, which this one now mirrors. Declared up here with the
     other hooks, ahead of the `!isOpen` early return. */
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [candidates, setCandidates] = useState<CandidateEmail[]>(
    prefilledCandidates && prefilledCandidates.length > 0
      ? prefilledCandidates
      : [{ id: '1', name: '', email: '', source: 'manual' }]
  );
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Database tab state
  const [dbTab, setDbTab] = useState<'my-resumes' | 'internal-db'>('my-resumes');
  const [myResumesData, setMyResumesData] = useState<Resume[]>([]);
  const [internalDbData, setInternalDbData] = useState<Resume[]>([]);
  const [myFolders, setMyFolders] = useState<{ id: string; name: string; parentId?: string | null }[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [myResumesLoaded, setMyResumesLoaded] = useState(false);
  const [internalDbLoaded, setInternalDbLoaded] = useState(false);
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);

  // RBAC checks
  const hasMyResumesAccess = !!(user?.permissions?.canUploadResumes || user?.permissions?.canViewResumes);
  const hasInternalDBAccess = !!(user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB);
  const defaultDbTab: 'my-resumes' | 'internal-db' = hasMyResumesAccess ? 'my-resumes' : 'internal-db';

  // Legacy — kept for filteredResumes used in Send logic
  const resumeDatabase = dbTab === 'my-resumes' ? myResumesData : internalDbData;

  // Update candidates when pre-filled candidates change
  useEffect(() => {
    if (prefilledCandidates && prefilledCandidates.length > 0) {
      setCandidates(prefilledCandidates);
    }
  }, [prefilledCandidates]);

  // Fetch quota stats when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setQuotaStatsLoading(true);
    assessmentService.getInvitationStats().then((stats) => {
      setQuotaStats(stats);
    }).finally(() => setQuotaStatsLoading(false));
  }, [isOpen]);

  // Load resumes when database mode is selected
  useEffect(() => {
    if (inputMode === 'database') {
      const tab = hasMyResumesAccess ? 'my-resumes' : 'internal-db';
      setDbTab(tab);
      if (tab === 'my-resumes') loadMyResumes();
      else loadInternalDb();
    }
  }, [inputMode]);

  // Load the selected tab's data when tab changes
  useEffect(() => {
    if (inputMode !== 'database') return;
    if (dbTab === 'my-resumes' && !myResumesLoaded) loadMyResumes();
    if (dbTab === 'internal-db' && !internalDbLoaded) loadInternalDb();
    setSelectedFolder('all');
    setSelectedResumes([]);
    setSearchQuery('');
  }, [dbTab]);

  const mapResume = (r: any): Resume => ({
    id: r.id,
    name: r.candidate_name || 'Unknown',
    email: r.email || r.candidate_email || '',
    phone: r.phone || '',
    position: r.current_title || 'Not specified',
    experience: r.experience_years ? `${r.experience_years} years` : 'Not specified',
    skills: r.skills || [],
  });

  const loadMyResumes = async () => {
    if (myResumesLoaded) return;
    setIsLoadingResumes(true);
    try {
      const [resumeRes, folderRes] = await Promise.all([
        api.get('/resumes', { params: { source: 'my-resumes', page_size: 200 } }),
        api.get('/folders'),
      ]);
      const items = resumeRes.data?.items ?? [];
      setMyResumesData(items.map(mapResume));
      setMyFolders((folderRes.data ?? []).map((f: any) => ({ id: f.id, name: f.name, parentId: f.parent_id ?? null })));
      setMyResumesLoaded(true);
    } catch {
      toast.error('Failed to load My Resumes');
    } finally {
      setIsLoadingResumes(false);
    }
  };

  const loadInternalDb = async () => {
    if (internalDbLoaded) return;
    setIsLoadingResumes(true);
    try {
      const res = await api.get('/resumes', { params: { source: 'internal-db', page_size: 200 } });
      const items = res.data?.items ?? [];
      setInternalDbData(items.map(mapResume));
      setInternalDbLoaded(true);
    } catch {
      toast.error('Failed to load Shared Database');
    } finally {
      setIsLoadingResumes(false);
    }
  };

  const toggleExpandFolder = (id: string) => {
    setExpandedFolders(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const renderFolderTree = (parentId?: string | null, level = 0): React.ReactNode => {
    const children = myFolders.filter(f => {
      const isTop = !parentId && (f.parentId === null || f.parentId === undefined);
      const isChild = parentId && f.parentId === parentId;
      return isTop || isChild;
    });
    return children.map(folder => {
      const isExpanded = expandedFolders.includes(folder.id);
      const isSelected = selectedFolder === folder.id;
      const hasChildren = myFolders.some(f => f.parentId === folder.id);
      const count = myResumesData.filter(r => (r as any).folderId === folder.id).length;
      return (
        <div key={folder.id}>
          <button
            onClick={() => setSelectedFolder(folder.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${isSelected ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 font-medium' : 'text-gray-700 dark:text-slate-300 hover:bg-slate-100'}`}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            {hasChildren ? (
              <button onClick={e => { e.stopPropagation(); toggleExpandFolder(folder.id); }} className="p-0.5 hover:bg-slate-200 rounded">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : <div className="w-5" />}
            {isExpanded ? (
              <FolderOpen className={`w-4 h-4 ${isSelected ? '' : 'text-gray-400 dark:text-slate-500'}`} />
            ) : (
              <Folder className={`w-4 h-4 ${isSelected ? '' : 'text-gray-400 dark:text-slate-500'}`} />
            )}
            <span className="flex-1 text-left truncate">{folder.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-gray-600 dark:text-slate-400">{count}</span>
          </button>
          {isExpanded && hasChildren && <div>{renderFolderTree(folder.id, level + 1)}</div>}
        </div>
      );
    });
  };

  const [customMessage, setCustomMessage] = useState(
    `You have been invited to take an assessment:\n\nImportant Instructions:\n• Ensure you have a stable internet connection\n• Find a quiet place without distractions\n• Complete the assessment in one sitting\n• Your responses will be automatically saved\n\nGood luck!`
  );
  const [expiryDays, setExpiryDays] = useState(1);
  const [sendCopy, setSendCopy] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  // Duplicate invitation popup state
  const [showDuplicateError, setShowDuplicateError] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState('');

  if (!isOpen) return null;

  /* Upload Excel — ported from the Share AI Interview via Email dialog, same
     parsing and the same rules: .xlsx/.xls (every sheet) or .csv, an "Email"
     column required and a "Name" column optional, invalid and duplicate
     addresses skipped. Imported rows join the candidate list as ordinary
     manual entries, so they are validated and sent exactly as typed ones. */
  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (line[i] === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += line[i];
        }
      }
      result.push(current.trim());
      return result;
    };
    const headers = parseRow(lines[0]);
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const values = parseRow(line);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
      return obj;
    });
  };

  const extractFromSheet = (rawRows: any[][]): CandidateEmail[] => {
    if (rawRows.length < 2) return [];
    const headers = rawRows[0].map((h: any) => String(h ?? '').trim());
    const nameCol = headers.find((h: string) => /^(name|full.?name|candidate.?name|first.?name)$/i.test(h));
    const emailCol = headers.find((h: string) => /^(email|e.?mail|candidate.?email|email.?address)$/i.test(h));
    if (!emailCol) return [];
    const results: CandidateEmail[] = [];
    const seenInSheet = new Set<string>();
    for (const row of rawRows.slice(1)) {
      const rowObj: Record<string, string> = {};
      headers.forEach((h: string, i: number) => { rowObj[h] = String(row[i] ?? '').trim(); });
      const email = (rowObj[emailCol] || '').trim().toLowerCase();
      const name = nameCol ? (rowObj[nameCol] || '').trim() : '';
      if (email && isValidEmail(email) && !seenInSheet.has(email)) {
        seenInSheet.add(email);
        results.push({
          id: Date.now().toString() + Math.random(),
          name: name || email.split('@')[0],
          email,
          source: 'manual' as const,
        });
      }
    }
    return results;
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (excelInputRef.current) excelInputRef.current.value = '';

    try {
      const parsed: CandidateEmail[] = [];

      if (file.name.toLowerCase().endsWith('.csv')) {
        const rows = parseCSV(await file.text());
        if (rows.length === 0) { toast.error('No data found in the CSV file'); return; }
        const headerKeys = Object.keys(rows[0]);
        const emailCol = headerKeys.find(h => /^(email|e.?mail|candidate.?email|email.?address)$/i.test(h.trim()));
        const nameCol = headerKeys.find(h => /^(name|full.?name|candidate.?name|first.?name)$/i.test(h.trim()));
        if (!emailCol) {
          toast.error(`Could not find an "Email" column. Found: ${headerKeys.join(', ')}`);
          return;
        }
        for (const row of rows) {
          const email = (row[emailCol] || '').trim().toLowerCase();
          const name = nameCol ? (row[nameCol] || '').trim() : '';
          if (email && isValidEmail(email)) {
            parsed.push({ id: Date.now().toString() + Math.random(), name: name || email.split('@')[0], email, source: 'manual' });
          }
        }
      } else {
        // readXlsxFile returns { sheet: string, data: Row[][] }[] — all sheets at once
        const allSheets = await readXlsxFile(file) as any[];

        if (allSheets.length > 1) {
          toast.info(`Found ${allSheets.length} sheets (${allSheets.map((sh: any) => sh.sheet).join(', ')}) — combining all.`);
        }

        const seenEmails = new Set<string>();
        let sheetsWithData = 0;

        for (const sheetObj of allSheets) {
          const rows: any[][] = sheetObj.data ?? sheetObj;
          const sheetCandidates = extractFromSheet(rows);
          if (sheetCandidates.length > 0) sheetsWithData++;
          for (const c of sheetCandidates) {
            if (!seenEmails.has(c.email.toLowerCase())) {
              seenEmails.add(c.email.toLowerCase());
              parsed.push(c);
            }
          }
        }

        if (allSheets.length > 1 && sheetsWithData < allSheets.length) {
          toast.info(`${allSheets.length - sheetsWithData} sheet(s) had no recognisable email column and were skipped.`);
        }
      }

      if (parsed.length === 0) {
        toast.error('No valid email addresses found. Make sure your file has a column named "Email" or "name".');
        return;
      }

      // Deduplicate against candidates already in the list
      const existingValid = candidates.filter(c => c.name.trim() && c.email.trim());
      const existingEmails = new Set(existingValid.map(c => c.email.toLowerCase().trim()));
      const newOnly = parsed.filter(c => !existingEmails.has(c.email.toLowerCase().trim()));
      const duplicates = parsed.length - newOnly.length;

      if (duplicates > 0) {
        toast.warning(`${duplicates} duplicate email${duplicates > 1 ? 's' : ''} skipped — already in the list`);
      }

      if (newOnly.length === 0) {
        toast.warning('All emails from the file are already in the list');
        return;
      }

      // Quota warning: inform how many can actually be sent
      if (quotaStats && quotaStats.total_quota < 999999) {
        const totalAfterAdd = existingValid.length + newOnly.length;
        if (totalAfterAdd > quotaStats.available) {
          const canSend = Math.max(0, quotaStats.available - existingValid.length);
          toast.warning(
            `Quota: ${quotaStats.available} unit${quotaStats.available !== 1 ? 's' : ''} available. ` +
            `${newOnly.length} candidates imported — only the first ${canSend} will be sent. Remove unwanted rows before sending.`
          );
        }
      }

      setCandidates(existingValid.length > 0 ? [...existingValid, ...newOnly] : newOnly);
      toast.success(`${newOnly.length} candidate${newOnly.length !== 1 ? 's' : ''} imported from ${file.name}`);
      setInputMode('manual');
    } catch (err) {
      console.error('Failed to parse file:', err);
      toast.error('Failed to parse file. Please ensure it is a valid .xlsx or .csv file.');
    }
  };

  const addCandidate = () => {
    setCandidates([...candidates, { id: Date.now().toString(), name: '', email: '', source: 'manual' }]);
  };

  const removeCandidate = (id: string) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter(c => c.id !== id));
    }
  };

  const updateCandidate = (id: string, field: 'name' | 'email', value: string) => {
    const normalizedValue = field === 'email' ? value.toLowerCase() : value;
    setCandidates(candidates.map(c =>
      c.id === id ? { ...c, [field]: normalizedValue } : c
    ));
  };
  
  // Handle resume selection from database
  const toggleResumeSelection = (resumeId: string) => {
    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };
  
  // Add selected resumes to candidates list
  const handleAddFromDatabase = () => {
    const selectedResumeData = resumeDatabase.filter(r => selectedResumes.includes(r.id));
    const newCandidates = selectedResumeData.map(resume => ({
      id: Date.now().toString() + Math.random(),
      name: resume.name,
      email: resume.email,
      source: 'database' as const,
      resumeId: resume.id
    }));
    
    // Filter out manual entries with empty fields
    const validManualCandidates = candidates.filter(c => 
      c.source === 'manual' && c.name.trim() && c.email.trim()
    );
    
    setCandidates([...validManualCandidates, ...newCandidates]);
    setSelectedResumes([]);
    setInputMode('manual');
  };
  
  // Filter resumes based on active tab, folder (My Resumes only), and search
  const activeResumes = dbTab === 'my-resumes' ? myResumesData : internalDbData;
  const folderFiltered = dbTab === 'my-resumes' && selectedFolder !== 'all'
    ? activeResumes.filter(r => (r as any).folderId === selectedFolder)
    : activeResumes;
  const filteredResumes = folderFiltered.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.position.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSend = async () => {
    setIsSubmitting(true);
    try {
      // Filter candidates with name and email
      const candidatesWithData = candidates.filter(c => c.name.trim() && c.email.trim());

      if (candidatesWithData.length === 0) {
        toast.warning('Please add at least one candidate with name and email');
        setIsSubmitting(false);
        return;
      }

      // Validate all email addresses
      const invalidEmails = candidatesWithData.filter(c => !isValidEmail(c.email));
      if (invalidEmails.length > 0) {
        const invalidEmailList = invalidEmails.map(c => c.email).join(', ');
        toast.error(`Invalid email address(es): ${invalidEmailList}. Please enter valid email addresses.`);
        setIsSubmitting(false);
        return;
      }

      const validCandidates = candidatesWithData;

      // Quota check — block if not enough available slots
      const needed = validCandidates.length * allAssessments.length;
      if (quotaStats !== null && quotaStats.total_quota < 999999) {
        if (quotaStats.available < needed) {
          const pendingMsg = quotaStats.pending > 0
            ? ` ${quotaStats.pending} unit${quotaStats.pending > 1 ? 's' : ''} are held by pending invitations and will be released when their links expire.`
            : '';
          toast.error(
            `Insufficient quota. You have ${quotaStats.available} unit${quotaStats.available !== 1 ? 's' : ''} available but need ${needed} to send these invitations.${pendingMsg}`
          );
          setIsSubmitting(false);
          return;
        }
      } else {
        // Fallback: check via QuotaContext
        const asQuota = quotaData?.quotas?.AS;
        const totalRemaining = typeof asQuota?.total_remaining === 'number' ? asQuota.total_remaining : null;
        if (totalRemaining !== null && totalRemaining < needed) {
          toast.error(`Insufficient quota. You have ${totalRemaining} assessment unit${totalRemaining !== 1 ? 's' : ''} remaining but need ${needed}.`);
          setIsSubmitting(false);
          return;
        }
      }

      // Check if we're sending to multiple assessments
      if (allAssessments.length > 1) {
        // Bulk invite for multiple assessments
        const totalInvites = allAssessments.length * validCandidates.length;
        let sentCount = 0;
        let failedCount = 0;

        toast.loading(`Sending ${totalInvites} invitation${totalInvites > 1 ? 's' : ''}...`, { id: 'bulk-invite-multi' });

        for (const assessmentToInvite of allAssessments) {
          try {
            const candidateData = validCandidates.map(c => ({
              candidate_name: c.name,
              candidate_email: c.email,
              candidate_phone: c.phone,
              invite_source: inviteSource || (c.source === 'database' ? 'Internal DB' : 'Manual'),
              resume_id: c.resumeId,
            }));

            const results = await assessmentService.bulkInvite(assessmentToInvite.id, {
              candidates: candidateData,
              custom_message: customMessage,
              expiry_days: expiryDays,
            });

            // The request not throwing only means the API call itself went
            // through — a per-candidate send can still have failed (bad
            // domain, SMTP rejection) while the response is still 200, with
            // that row's own status set to 'failed'. Counting every row here
            // as sent is what let this screen say "Successfully sent" for an
            // invite the backend had already marked failed.
            const failedHere = results.filter((r) => r.status === 'failed').length;
            sentCount += validCandidates.length - failedHere;
            failedCount += failedHere;
            toast.loading(`Sent ${sentCount}/${totalInvites} invitations...`, { id: 'bulk-invite-multi' });
          } catch (error: any) {
            console.error(`Failed to send invitations for assessment ${assessmentToInvite.title}:`, error);
            failedCount += validCandidates.length;
          }
        }

        setIsSubmitting(false);

        // Nothing went out — say so and leave the form open to retry, rather
        // than showing the success popup over a batch that fully failed.
        if (sentCount === 0) {
          toast.error('Failed to send invitations. Please try again.', { id: 'bulk-invite-multi' });
          return;
        }

        // The success popup below is the confirmation, so the progress toast
        // is dismissed rather than turned into a second "sent" message. A
        // partial failure still gets its warning.
        if (failedCount === 0) {
          toast.dismiss('bulk-invite-multi');
        } else {
          toast.warning(`Sent ${sentCount} invitations successfully. ${failedCount} failed.`, { id: 'bulk-invite-multi' });
        }

        setSentCount(sentCount);
        onInviteSent?.(sentCount);
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          onClose();
        }, 2000);
        return;
      }

      // Single assessment invite (existing logic)
      // The API call not throwing only means the request itself succeeded —
      // a candidate's own send can still fail (bad domain, SMTP rejection)
      // with the response still 200 and that invitation's status set to
      // 'failed'. Reading each result's own status, rather than treating
      // "no exception" as "delivered", is what stops this screen from
      // showing "Successfully sent!" for an invite the backend already
      // marked as failed — the recruiter would only find out later, back on
      // the tracker.
      let failedHere = 0;
      if (validCandidates.length === 1) {
        // Single invite
        const result = await assessmentService.invite(assessment.id, {
          candidate_name: validCandidates[0].name,
          candidate_email: validCandidates[0].email,
          candidate_phone: validCandidates[0].phone,
          invite_source: inviteSource || (validCandidates[0].source === 'database' ? 'Internal DB' : 'Manual'),
          resume_id: validCandidates[0].resumeId,
          custom_message: customMessage,
          expiry_days: expiryDays,
        });
        if (result.status === 'failed') failedHere = 1;
      } else {
        // Bulk invite
        const candidateData = validCandidates.map(c => ({
          candidate_name: c.name,
          candidate_email: c.email,
          candidate_phone: c.phone,
          invite_source: inviteSource || (c.source === 'database' ? 'Internal DB' : 'Manual'),
          resume_id: c.resumeId,
        }));
        const results = await assessmentService.bulkInvite(assessment.id, {
          candidates: candidateData,
          custom_message: customMessage,
          expiry_days: expiryDays,
        });
        failedHere = results.filter((r) => r.status === 'failed').length;
      }

      setIsSubmitting(false);
      const successCount = validCandidates.length - failedHere;
      onInviteSent?.(successCount);

      if (failedHere === validCandidates.length) {
        // Every candidate failed — never show the success screen for a batch
        // that fully failed.
        toast.error(
          validCandidates.length === 1
            ? `Invite Failed: ${validCandidates[0].email} could not be delivered — check the email address and domain, then edit and resend it from Invite Status Tracking.`
            : `All ${validCandidates.length} invitations failed to deliver — check the email addresses, then edit and resend them from Invite Status Tracking.`
        );
        return;
      }
      if (failedHere > 0) {
        toast.warning(`Sent ${successCount} invitation${successCount > 1 ? 's' : ''} successfully. ${failedHere} failed to deliver — check Invite Status Tracking.`);
      }

      setSentCount(successCount);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 2000);
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      setIsSubmitting(false);

      // Check for duplicate invitation error (409 Conflict)
      const is409Error = error?.response?.status === 409 ||
                         error?.message?.includes('status code 409') ||
                         error?.message?.includes('already been invited') ||
                         error?.message?.includes('DUPLICATE_INVITATION');

      if (is409Error) {
        // Extract email from different possible response formats
        const email = error?.response?.data?.detail?.candidate_email ||
                      error?.response?.data?.candidate_email ||
                      candidates[0]?.email ||
                      'this candidate';
        setDuplicateEmail(email);
        setShowDuplicateError(true);
        return;
      }

      handleQuotaError(error, router, `Failed to send invitations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Check if all candidates have valid name and email
  const isValid = candidates.every(c => c.name.trim() && c.email.trim() && isValidEmail(c.email));

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4" role="dialog" aria-modal="true">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-md w-full p-5 sm:p-6 text-center max-h-[calc(100dvh-2rem)] overflow-y-auto">
          {/* The same animated tick the AI Interview share popup plays. The
              static badge this popup used to show is the fallback — while the
              player loads, for reduced motion, or if the CDN never answers. */}
          <div className="flex justify-center mb-3">
            <SuccessAnimation
              className="w-14 h-14 sm:w-16 sm:h-16"
              fallback={
                <div className="w-12 h-12 bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-brand-blue" />
                </div>
              }
            />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight mb-1">Assessment shared successfully</h3>
          <p className="text-gray-600 dark:text-slate-400 text-sm">
            Email invitations have been sent to {sentCount} candidate{sentCount > 1 ? 's' : ''}
          </p>
        </div>
      </div>
    );
  }

  // Duplicate invitation error popup
  if (showDuplicateError) {
    return (
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-md w-full p-5 sm:p-6 max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
          <div className="shrink-0 text-center mb-4">
            <div className="w-12 h-12 bg-warning-subtle ring-1 ring-warning-line rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 text-warning" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight mb-1">Invitation Already Sent</h3>
            <p className="text-gray-600 dark:text-slate-400 text-sm">
              An invitation has already been sent to <span className="font-medium text-gray-800 dark:text-slate-100">{duplicateEmail}</span> for this assessment.
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 rounded-lg p-3 sm:p-4 mb-4">
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-2">You can:</p>
            <ul className="text-sm text-gray-600 dark:text-slate-400 space-y-1">
              <li>• Try a <span className="font-medium">different email address</span></li>
              <li>• Send invitation for a <span className="font-medium">different assessment</span></li>
              <li>• Check the candidate&apos;s existing invitation status</li>
            </ul>
          </div>

          <div className="shrink-0 flex flex-wrap gap-2">
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmail('');
              }}
              className="flex-1 px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg transition-colors"
            >
              Try Different Email
            </button>
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmail('');
                onClose();
              }}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-3xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Share Assessment via Email</h2>
              <div className="flex items-center gap-2">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 truncate">{assessmentTitleForEmail}</p>
                <VersionBadge version={assessment.version} size="sm" variant="success" />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-lg p-2 transition-colors"
           aria-label="Close">
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {/* Assessment Info Banner */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-lg p-3 mb-3 sm:mb-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                  <span className="text-gray-900 dark:text-slate-50">{assessmentTitleForEmail}</span>
                  {/* Job version, then assessment version — the two are
                      different facts about this row and the banner used to show
                      only the second, so "V4" read as the job's version to
                      anyone who did not already know. Both are labelled now:
                      "Job V3 · Assessment V4".

                      `jd_version` comes off the assessment record the modal is
                      already given — the same field the Linked line below used
                      to print — so this adds no request and nothing is
                      hardcoded. Absent on an assessment with no job, which is
                      why the badge is conditional rather than defaulting to
                      v1. */}
                  {typeof assessment.jd_version === 'number' && (
                    <span className="inline-flex items-center text-2xs sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 whitespace-nowrap">
                      Job V{assessment.jd_version}
                    </span>
                  )}
                  {typeof assessment.version === 'number' && (
                    <span className="inline-flex items-center text-2xs sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 whitespace-nowrap">
                      Assessment V{assessment.version}
                    </span>
                  )}
                  {allAssessments.length > 1 && (
                    <span className="text-2xs sm:text-xs px-1.5 sm:px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded-full font-medium">
                      +{allAssessments.length - 1} more
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-4 text-2xs sm:text-sm text-gray-600 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                    {assessment.duration}
                  </span>
                  {/* Static question count removed — the actual count is
                      generated dynamically per attempt by the AI and was
                      misleading as a fixed badge.
                      Section labels now reflect every enabled round on the
                      assessment ("Technical • Coding" / "HR • Technical"
                      etc.) instead of the single legacy `type` field which
                      only ever surfaced one round. */}
                  {(() => {
                    const sections: string[] = [];
                    if (assessment.hr_enabled) sections.push('HR');
                    if (assessment.technical_enabled) sections.push('Technical');
                    if (assessment.coding_enabled) sections.push('Coding');
                    // Fall back to the legacy `type` label if none of the
                    // enable flags are populated (older callers that haven't
                    // been updated yet).
                    const label = sections.length > 0 ? sections.join(' • ') : assessment.type;
                    if (!label) return null;
                    return (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span className="hidden sm:inline">{label}</span>
                      </>
                    );
                  })()}
                </div>
                {/* The "Linked: JD-232 - Robotics v3" line stood here. It
                    repeated the job the title above already names and carried
                    the job version as a bare "v3" beside an unlabelled "V4",
                    which was the pair that made the two versions impossible to
                    tell apart. The version it carried now reads as "Job V3" in
                    the title row. */}
                {allAssessments.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-slate-700">
                    <p className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 font-medium mb-1">
                      Invitations for {allAssessments.length} assessments:
                    </p>
                    <div className="space-y-1">
                      {allAssessments.map((a, idx) => (
                        <div key={idx} className="text-2xs sm:text-xs px-2 py-1 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] text-gray-700 dark:text-slate-300 rounded">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="truncate">{stripVersionFromTitle(a.title)}</span>
                          </div>
                          {a.jd_short_id && (
                            <div className="text-gray-500 dark:text-slate-500 mt-0.5">
                              Linked: {a.jd_short_id}
                              {a.jd_title && ` - ${a.jd_title}`}
                              {a.jd_version && ` v${a.jd_version}`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quota Banner */}
          {(() => {
            const asQuota = quotaData?.quotas?.AS;
            const subscriptionLimit = typeof asQuota?.subscription?.limit === 'number' ? asQuota.subscription.limit : null;
            const subscriptionUsed = asQuota?.subscription?.used ?? 0;

            if (quotaStatsLoading) {
              return (
                <div className="mb-4 px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-700/60 rounded-lg flex items-center gap-2 text-sm text-gray-500 dark:text-slate-500">
                  <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />
                  Checking assessment quota...
                </div>
              );
            }

            if (quotaStats) {
              const { total_quota, consumed, pending, available } = quotaStats;
              const isUnlimited = total_quota >= 999999;
              const isInsufficient = !isUnlimited && available === 0;
              const isLow = !isUnlimited && !isInsufficient && available <= 3;

              if (isUnlimited) {
                return (
                  <div className="mb-4 px-4 py-3 rounded-lg border text-sm bg-brand-blue/5 border-brand-blue/20 ring-1 ring-brand-blue/20 text-brand-blue">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium">Unlimited assessment units</span>
                    </div>
                  </div>
                );
              }

              return (
                <div className={`mb-4 px-4 py-3 rounded-lg border text-sm ${
                  isInsufficient
                    ? 'bg-destructive-subtle border-destructive-line text-destructive-strong'
                    : isLow
                    ? 'bg-warning-subtle border-warning-line ring-1 ring-warning-line text-warning-strong'
                    : 'bg-brand-blue/5 border-brand-blue/20 ring-1 ring-brand-blue/20 text-brand-blue'
                }`}>
                  <div className="flex items-start gap-2">
                    {isInsufficient
                      ? <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      : <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    }
                    <div className="flex-1">
                      <div className="font-medium mb-1">
                        {isInsufficient
                          ? 'No assessment units available'
                          : isLow
                          ? `Only ${available} unit${available !== 1 ? 's' : ''} available`
                          : `${available} assessment unit${available !== 1 ? 's' : ''} available`
                        }
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs opacity-80">
                        <span>Total: {total_quota}</span>
                        <span>Attended (consumed): {consumed}</span>
                        {pending > 0 && (
                          <span>Pending invitations (held): {pending}</span>
                        )}
                      </div>
                      {pending > 0 && (
                        <p className="text-xs mt-1 opacity-80">
                          {pending} unit{pending > 1 ? 's' : ''} held by active invitations — released automatically when links expire.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            // Fallback to QuotaContext data
            if (subscriptionLimit !== null) {
              const remaining = subscriptionLimit - subscriptionUsed;
              const isInsufficient = remaining <= 0;
              const isLow = !isInsufficient && remaining <= 3;
              return (
                <div className={`mb-4 px-4 py-3 rounded-lg border text-sm ${
                  isInsufficient
                    ? 'bg-destructive-subtle border-destructive-line text-destructive-strong'
                    : isLow
                    ? 'bg-warning-subtle border-warning-line ring-1 ring-warning-line text-warning-strong'
                    : 'bg-brand-blue/5 border-brand-blue/20 ring-1 ring-brand-blue/20 text-brand-blue'
                }`}>
                  <div className="flex items-center gap-2">
                    {isInsufficient
                      ? <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                      : <Info className="w-4 h-4 flex-shrink-0" />
                    }
                    <span>
                      <span className="font-medium">{Math.max(0, remaining)} assessment unit{remaining !== 1 ? 's' : ''} remaining</span>
                      <span className="opacity-80 ml-1">({subscriptionUsed} used of {subscriptionLimit})</span>
                    </span>
                  </div>
                </div>
              );
            }

            return null;
          })()}

          {/* Candidate Emails Section */}
          <div className="mb-4 sm:mb-6">
            {/* Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
              <label className="text-xs sm:text-base text-gray-900 dark:text-slate-50 font-medium">Select Candidates</label>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                <button
                  onClick={() => setInputMode('manual')}
                  className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors ${
                    inputMode === 'manual'
                      ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20'
                      : 'bg-slate-100 text-gray-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Upload className="w-3 h-3 sm:w-4 sm:h-4" />
                  Manually
                </button>
                {/* Upload Excel — beside Manually, as in the Share AI
                    Interview via Email dialog. Opens the file picker; the rows
                    it reads land in the Manually list, which is why it never
                    shows as the active mode itself. */}
                <button
                  onClick={() => excelInputRef.current?.click()}
                  className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors bg-slate-100 text-gray-700 dark:text-slate-300 hover:bg-slate-200"
                >
                  <FileSpreadsheet className="w-3 h-3 sm:w-4 sm:h-4" />
                  Upload Excel
                </button>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelUpload}
                  className="hidden"
                />
                <button
                  onClick={() => setInputMode('database')}
                  className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors ${
                    inputMode === 'database'
                      ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20'
                      : 'bg-slate-100 text-gray-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  Select From
                </button>
              </div>
            </div>

            {/* Manual Input Mode */}
            {inputMode === 'manual' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 sm:mb-3">
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">Enter candidate details</p>
                  <button
                    onClick={addCandidate}
                    className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Add
                  </button>
                </div>

                <div className="space-y-2 sm:space-y-3">
                  {candidates.map((candidate, index) => (
                    <div key={candidate.id} className={`flex items-start sm:items-center gap-2 sm:gap-3 p-2.5 sm:p-4 border rounded-lg ${
                      candidate.source === 'database'
                        ? 'bg-slate-50 dark:bg-slate-950 border-gray-200 dark:border-slate-700'
                        : 'bg-slate-50 dark:bg-slate-950 border-gray-100 dark:border-slate-700/60'
                    }`}>
                      {candidate.source === 'database' && (
                        <div className="flex-shrink-0">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg flex items-center justify-center">
                            <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                          </div>
                        </div>
                      )}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        <div>
                          <label className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-0.5 sm:mb-1 block">Full Name</label>
                          <input
                            type="text"
                            value={candidate.name}
                            onChange={(e) => updateCandidate(candidate.id, 'name', e.target.value)}
                            placeholder="e.g., John Doe"
                            readOnly={candidate.source === 'database'}
                            className={`w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-black placeholder-gray-400 ${
                              candidate.source === 'database' ? 'bg-gray-100 dark:bg-slate-800 cursor-not-allowed' : ''
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-0.5 sm:mb-1 block">Email Address</label>
                          <input
                            type="email"
                            value={candidate.email}
                            onChange={(e) => updateCandidate(candidate.id, 'email', e.target.value)}
                            placeholder="e.g., john@example.com"
                            readOnly={candidate.source === 'database'}
                            className={`w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 text-black placeholder-gray-400 ${
                              candidate.source === 'database'
                                ? 'bg-gray-100 dark:bg-slate-800 cursor-not-allowed border-gray-200 dark:border-slate-700'
                                : candidate.email.trim() && !isValidEmail(candidate.email)
                                  ? 'border-destructive focus:ring-destructive'
                                  : 'border-gray-200 dark:border-slate-700 focus:ring-brand-blue/40 focus:border-brand-blue'
                            }`}
                          />
                          {candidate.email.trim() && !isValidEmail(candidate.email) && (
                            <p className="text-2xs sm:text-xs text-destructive mt-0.5 sm:mt-1">Enter a valid email</p>
                          )}
                        </div>
                      </div>
                      {(candidates.length > 1 || candidate.source === 'database') && (
                        <button
                          onClick={() => removeCandidate(candidate.id)}
                          className="p-1.5 text-destructive hover:bg-destructive-subtle rounded-lg transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Database Selection Mode */}
            {inputMode === 'database' && (
              <div className="border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-lg overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950">
                  {hasMyResumesAccess && (
                    <button
                      onClick={() => setDbTab('my-resumes')}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                        dbTab === 'my-resumes'
                          ? 'border-brand-blue text-brand-blue bg-white dark:bg-slate-900'
                          : 'border-transparent text-gray-500 dark:text-slate-500 hover:text-gray-700'
                      }`}
                    >
                      <FolderOpen className="w-4 h-4" />
                      My Resumes
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-200 text-gray-700 dark:text-slate-300">{myResumesData.length}</span>
                    </button>
                  )}
                  {(hasInternalDBAccess || (!hasMyResumesAccess && !hasInternalDBAccess)) && (
                    <button
                      onClick={() => setDbTab('internal-db')}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                        dbTab === 'internal-db'
                          ? 'border-brand-blue text-brand-blue bg-white dark:bg-slate-900'
                          : 'border-transparent text-gray-500 dark:text-slate-500 hover:text-gray-700'
                      }`}
                    >
                      <Database className="w-4 h-4" />
                      Shared Database
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-200 text-gray-700 dark:text-slate-300">{internalDbData.length}</span>
                    </button>
                  )}
                </div>

                {/* Content: folder sidebar + resume list */}
                <div className="flex flex-col sm:flex-row" style={{ minHeight: '320px', maxHeight: '400px' }}>
                  {/* Folder Sidebar (My Resumes only) — a short scrollable strip
                      on top for mobile, a fixed left column from sm up. */}
                  {dbTab === 'my-resumes' && myFolders.length > 0 && (
                    <div className="w-full sm:w-48 max-h-28 sm:max-h-none border-b sm:border-b-0 sm:border-r border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 overflow-y-auto flex-shrink-0 p-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-slate-500 uppercase mb-2 px-1">Folders</p>
                      <button
                        onClick={() => setSelectedFolder('all')}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 ${selectedFolder === 'all' ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 font-medium' : 'text-gray-700 dark:text-slate-300 hover:bg-slate-100'}`}
                      >
                        <FolderOpen className="w-4 h-4" />
                        <span className="flex-1 text-left">All Resumes</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-200 text-gray-600 dark:text-slate-400">{myResumesData.length}</span>
                      </button>
                      <div className="space-y-0.5">{renderFolderTree(undefined, 0)}</div>
                    </div>
                  )}

                  {/* Resume List */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Search + Select All */}
                    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100 dark:border-slate-700/60">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by name, email, or position..."
                        className="flex-1 min-w-[10rem] px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                      />
                      <button
                        onClick={() => {
                          if (selectedResumes.length === filteredResumes.length && filteredResumes.length > 0) {
                            setSelectedResumes([]);
                          } else {
                            setSelectedResumes(filteredResumes.map(r => r.id));
                          }
                        }}
                        className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg hover:bg-slate-100 whitespace-nowrap text-gray-700 dark:text-slate-300"
                      >
                        {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? 'Deselect All' : 'Select All'}
                      </button>
                      <span className="text-sm text-gray-500 dark:text-slate-500 whitespace-nowrap">{selectedResumes.length} selected</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {isLoadingResumes ? (
                        <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                          <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                        </div>
                      ) : filteredResumes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-slate-500">
                          <Database className="w-8 h-8 mb-2" />
                          <p className="text-sm">{searchQuery ? 'No resumes match your search' : 'No resumes found'}</p>
                        </div>
                      ) : filteredResumes.map(resume => (
                        <div
                          key={resume.id}
                          onClick={() => toggleResumeSelection(resume.id)}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedResumes.includes(resume.id) ? 'bg-brand-blue/5 border-brand-blue ring-1 ring-brand-blue/20' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] hover:border-brand-blue/30'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                            selectedResumes.includes(resume.id) ? 'bg-brand-blue border-brand-blue' : 'border-gray-300 dark:border-slate-700'
                          }`}>
                            {selectedResumes.includes(resume.id) && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{resume.name}</span>
                              <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">{resume.experience}</span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{resume.email}</div>
                            <div className="text-xs text-gray-400 dark:text-slate-500 truncate">{resume.position}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950">
                      <span className="text-xs text-gray-500 dark:text-slate-500">{selectedResumes.length} candidate{selectedResumes.length !== 1 ? 's' : ''} selected</span>
                      <button
                        onClick={handleAddFromDatabase}
                        disabled={selectedResumes.length === 0}
                        className="flex items-center gap-2 px-3 sm:px-4 py-1.5 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg text-xs sm:text-sm font-medium transition-colors disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        <Users className="w-4 h-4" />
                        Add Selected
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Custom Message */}
          <div className="mb-4 sm:mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 sm:mb-2">
              <label className="text-xs sm:text-sm text-gray-900 dark:text-slate-50 font-medium">Email Message</label>
              <span className="text-2xs sm:text-xs text-brand-blue font-medium">✓ Live preview</span>
            </div>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={6}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue resize-none font-mono text-black placeholder-gray-400"
              placeholder="Edit the message content here..."
            />
            <p className="text-2xs sm:text-xs text-gray-500 dark:text-slate-500 mt-1">
              Use <code className="bg-slate-100 px-1 rounded">[Candidate Name]</code> as a placeholder.
            </p>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div>
              <label className="text-xs sm:text-base text-gray-900 dark:text-slate-50 mb-1.5 sm:mb-2 block font-medium">Link Expiry</label>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                className="w-full px-3 sm:px-4 py-1.5 sm:py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-black"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={0}>No expiry</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendCopy}
                  onChange={(e) => setSendCopy(e.target.checked)}
                  className="w-4 h-4 text-brand-blue border-gray-300 dark:border-slate-700 rounded focus:ring-brand-blue/40"
                />
                <span className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">Send me a copy</span>
              </label>
            </div>
          </div>

          {/* Email Preview - Exact match of actual email */}
          {/* Flat slate, hairline border. Was a gray-50 -> gray-100 gradient inside
              a 2px brand ring: two neutral stops and the heaviest border in
              the dialog, for a panel that only frames a preview. */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-lg p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Mail className="w-4 h-4 text-brand-blue" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Email Preview</h3>
              </div>
              <span className="text-2xs sm:text-xs text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                Exact format
              </span>
            </div>
            <p className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-3 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-1.5 border border-gray-200 dark:border-slate-700">
              This is how the email will appear to candidates.
            </p>

            {/* Actual Email Template Preview */}
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
              {/* Brand Header */}
              <div className="bg-brand-blue px-4 sm:px-6 py-4 sm:py-5 text-center">
                <h1 className="text-white text-sm sm:text-base font-semibold mb-0.5">Assessment Invitation</h1>
                <p className="text-white/80 text-2xs sm:text-xs">TalentFlow</p>
              </div>

              {/* Email Body */}
              <div className="p-4 sm:p-5">
                {/* Greeting and Message */}
                <div className="mb-3 sm:mb-4 text-gray-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                  {customMessage.replace('[Candidate Name]', candidates[0].name || '[Candidate Name]')}
                </div>

                {/* Assessment Title Box */}
                <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-lg p-3 sm:p-4 text-center mb-3 sm:mb-4">
                  <div className="text-sm font-semibold text-brand-blue break-words">
                    {assessmentTitleForEmail}
                  </div>
                </div>

                {/* CTA Button */}
                <div className="text-center mb-3 sm:mb-4">
                  <div className="inline-block bg-brand-blue text-white px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-semibold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    Start Assessment
                  </div>
                </div>

                {/* Expiry Info */}
                <p className="text-center text-gray-600 dark:text-slate-400 text-2xs sm:text-xs mb-0">
                  Expires: <strong>{expiryDays > 0 ? `${expiryDays} day${expiryDays > 1 ? 's' : ''}` : 'No expiry'}</strong>
                </p>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 dark:bg-slate-800/50 px-4 sm:px-6 py-3 text-center border-t border-gray-200 dark:border-slate-700">
                <p className="text-gray-500 dark:text-slate-500 text-2xs sm:text-xs mb-1 sm:mb-2">© 2026 TalentFlow. All rights reserved.</p>
                <p className="text-gray-400 dark:text-slate-500 text-2xs sm:text-xs">If you did not expect this email, please ignore it.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t border-gray-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-sm text-gray-600 dark:text-slate-400">
            {(() => {
              const validCount = candidates.filter(c => c.name.trim() && c.email.trim()).length;
              const needed = validCount * allAssessments.length;
              const available = quotaStats?.available ?? null;
              const isUnlimited = available !== null && available >= 999999;
              const insufficientQuota = !isUnlimited && available !== null && available < needed;
              return (
                <span className={insufficientQuota ? 'text-destructive' : ''}>
                  {validCount} candidate{validCount !== 1 ? 's' : ''} will receive {allAssessments.length > 1 ? `${allAssessments.length} assessments` : 'this assessment'}
                  {insufficientQuota && (
                    <span className="ml-2 font-medium">— only {available} unit{available !== 1 ? 's' : ''} available</span>
                  )}
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="px-3 sm:px-5 py-1.5 sm:py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 transition-colors text-xs sm:text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!isValid || isSubmitting || (quotaStats !== null && quotaStats.available === 0 && quotaStats.total_quota < 999999)}
              className="px-4 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-medium bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg transition-colors disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Send Invitations</span>
                  <span className="sm:hidden">Send</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
