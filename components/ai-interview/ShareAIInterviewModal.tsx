'use client';

import { X, Mail, Plus, Trash2, Send, CheckCircle, Copy, Clock, FileText, Users, Upload, Database, AlertTriangle, Loader2, FileSpreadsheet, MapPin, ShieldAlert, Info, FolderOpen, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import api from '@/lib/services/api';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';
import readXlsxFile from 'read-excel-file/browser';
import { useQuota } from '@/contexts/QuotaContext';

// Email validation regex
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

interface CandidateEmail {
  id: string;
  name: string;
  email: string;
  // scheduledDate: string;   // Commented out - schedule feature disabled for now
  // scheduledTime: string;   // Commented out - schedule feature disabled for now
  source: 'manual' | 'database';
  resumeId?: string;
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

interface ShareAIInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIInterviewResponse;
  onInviteSent: () => void;
}

const ROUND_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'Technical',
  behavioral: 'Behavioral',
  culture_fit: 'Culture Fit',
  leadership: 'Leadership',
  problem_solving: 'Problem Solving',
  must_have_skills: 'Must-Have Skills',
  nice_to_have_skills: 'Nice-to-Have Skills',
};

export default function ShareAIInterviewModal({ isOpen, onClose, config, onInviteSent }: ShareAIInterviewModalProps) {
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

  const [inputMode, setInputMode] = useState<'manual' | 'database' | 'excel'>('manual');
  const [candidates, setCandidates] = useState<CandidateEmail[]>([
    { id: '1', name: '', email: '', /* scheduledDate: '', scheduledTime: '', */ source: 'manual' },
  ]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [excelFileName, setExcelFileName] = useState<string>('');

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

  // Legacy alias for Send logic
  const resumeDatabase = dbTab === 'my-resumes' ? myResumesData : internalDbData;

  // Email message — populated dynamically with config/user context
  const [customMessage, setCustomMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const companyName = (user as any)?.tenantName || 'Our Company';
    const jobTitle = config.jd_title || config.position || 'the role';
    const location = (config as any).jd_location ? `\nLocation: ${(config as any).jd_location}` : '';
    setCustomMessage(
      `Subject: Invitation to Complete Your AI Interview — ${jobTitle} at ${companyName}\n\nDear Candidate,\n\nWe are pleased to invite you to complete an AI-powered interview for the following position:\n\nRole: ${jobTitle}\nCompany: ${companyName}${location}\n\nThis interview will take approximately 20–30 minutes and must be completed in one sitting.\n\nBefore You Begin:\n\n• Ensure you have a stable internet connection\n• Find a quiet place with good lighting\n• Your camera and microphone will be required\n• Use a laptop or desktop for the best experience\n\nDuring the session, our AI interviewer will guide you through each question step-by-step.\n\nPlease complete the interview by [deadline date].\n\nIf you experience any technical issues, contact us at support@talentflow.com.\n\nWe wish you the best of luck and look forward to learning more about you!\n\nBest regards,\n${companyName} Talent Team`
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const [expiryDays, setExpiryDays] = useState(7);
  const [sendCopy, setSendCopy] = useState(true);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  // Duplicate invitation popup
  const [showDuplicateError, setShowDuplicateError] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState('');

  // Fetch quota stats when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setQuotaStatsLoading(true);
    aiInterviewService.getInvitationStats().then((stats) => {
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
      setMyResumesData((resumeRes.data?.items ?? []).map(mapResume));
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
      setInternalDbData((res.data?.items ?? []).map(mapResume));
      setInternalDbLoaded(true);
    } catch {
      toast.error('Failed to load Internal Database');
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
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${isSelected ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            {hasChildren ? (
              <button onClick={e => { e.stopPropagation(); toggleExpandFolder(folder.id); }} className="p-0.5 hover:bg-gray-200 rounded">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : <div className="w-5" />}
            {isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
            <span className="flex-1 text-left truncate">{folder.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">{count}</span>
          </button>
          {isExpanded && hasChildren && <div>{renderFolderTree(folder.id, level + 1)}</div>}
        </div>
      );
    });
  };

  if (!isOpen) return null;

  const enabledRounds = config.rounds_config ? config.rounds_config.filter((r: any) => r.enabled !== false) : [];

  const interviewLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/ai-interview/${config.interview_token || config.id}`;

  const addCandidate = () => {
    setCandidates([
      ...candidates,
      { id: Date.now().toString(), name: '', email: '', /* scheduledDate: '', scheduledTime: '', */ source: 'manual' },
    ]);
  };

  const removeCandidate = (id: string) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter((c) => c.id !== id));
    }
  };

  const updateCandidate = (id: string, field: keyof CandidateEmail, value: string) => {
    setCandidates(candidates.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  // Handle resume selection from database
  const toggleResumeSelection = (resumeId: string) => {
    setSelectedResumes((prev) =>
      prev.includes(resumeId) ? prev.filter((id) => id !== resumeId) : [...prev, resumeId]
    );
  };

  const selectAllResumes = () => {
    setSelectedResumes(filteredResumes.map((r) => r.id));
  };

  const clearSelection = () => setSelectedResumes([]);

  // Add selected resumes to candidates list and switch to manual view
  const handleAddFromDatabase = () => {
    const selectedResumeData = resumeDatabase.filter((r) => selectedResumes.includes(r.id));
    const validExisting = candidates.filter((c) => c.name.trim() && c.email.trim());
    const existingEmails = new Set(validExisting.map((c) => c.email.toLowerCase().trim()));
    const newCandidates: CandidateEmail[] = selectedResumeData
      .filter((resume) => resume.email && !existingEmails.has(resume.email.toLowerCase().trim()))
      .map((resume) => ({
        id: Date.now().toString() + Math.random(),
        name: resume.name,
        email: resume.email,
        source: 'database' as const,
        resumeId: resume.id,
      }));
    const duplicateCount = selectedResumeData.length - newCandidates.length;
    if (duplicateCount > 0) {
      toast.warning(`${duplicateCount} candidate${duplicateCount > 1 ? 's' : ''} skipped — already in the list`);
    }
    setCandidates(validExisting.length > 0 ? [...validExisting, ...newCandidates] : newCandidates.length > 0 ? newCandidates : [{ id: '1', name: '', email: '', source: 'manual' }]);
    setSelectedResumes([]);
    setInputMode('manual');
  };

  // Send invitations directly to selected database candidates (no manual step)
  const handleSendFromDatabase = async () => {
    const selectedResumeData = resumeDatabase.filter((r) => selectedResumes.includes(r.id) && r.email);
    if (selectedResumeData.length === 0) {
      toast.warning('Please select at least one candidate with a valid email');
      return;
    }

    // Quota check
    if (quotaStats !== null && quotaStats.total_quota < 999999 && quotaStats.available < selectedResumeData.length) {
      toast.error(`Insufficient quota. ${quotaStats.available} unit${quotaStats.available !== 1 ? 's' : ''} available, need ${selectedResumeData.length}.`);
      return;
    }

    setIsSubmitting(true);
    const resolvedMessage = customMessage
      ? customMessage.replace('[deadline date]', expiryDays > 0
          ? formatISTDate(new Date(Date.now() + expiryDays * 86400000).toISOString())
          : 'no specific deadline')
      : undefined;

    let successCount = 0;
    const alreadyInvited: string[] = [];
    const tenantUserEmails: string[] = [];
    const failed: { email: string; reason: string }[] = [];

    for (const resume of selectedResumeData) {
      try {
        await aiInterviewService.inviteCandidate(config.id, {
          candidate_name: resume.name,
          candidate_email: resume.email,
          resume_id: resume.id,
          custom_message: resolvedMessage,
          expiry_days: expiryDays,
          base_url: typeof window !== 'undefined' ? window.location.origin : undefined,
        });
        successCount++;
      } catch (err: any) {
        const errData = err?.response?.data || {};
        const errCode = errData?.error || errData?.detail?.error || '';
        if (err?.response?.status === 409 || errCode === 'DUPLICATE_INVITATION') {
          alreadyInvited.push(resume.email);
        } else if (err?.response?.status === 400 && errCode === 'TENANT_USER_EMAIL') {
          tenantUserEmails.push(resume.email);
        } else {
          failed.push({ email: resume.email, reason: errData?.detail?.message || errData?.message || err?.message || 'Unknown error' });
        }
      }
    }

    setIsSubmitting(false);

    if (successCount > 0) {
      setSentCount(successCount);
      if (alreadyInvited.length > 0) toast.warning(`${alreadyInvited.length} already invited: ${alreadyInvited.join(', ')}`);
      if (tenantUserEmails.length > 0) toast.error(`Team member emails skipped: ${tenantUserEmails.join(', ')}`);
      if (failed.length > 0) toast.error(`${failed.length} failed: ${failed.map(f => f.email).join(', ')}`);
      setShowSuccess(true);
      setTimeout(() => { setShowSuccess(false); onInviteSent(); onClose(); }, 2000);
    } else if (alreadyInvited.length > 0 && failed.length === 0) {
      setDuplicateEmail(alreadyInvited.join(', '));
      setShowDuplicateError(true);
    } else if (tenantUserEmails.length > 0) {
      toast.error(`Cannot invite team member email${tenantUserEmails.length > 1 ? 's' : ''}: ${tenantUserEmails.join(', ')}`);
    } else {
      toast.error('Failed to send invitations. Please try again.');
    }
  };

  // Parse CSV text into array of row objects
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

  // Handle Excel/CSV file upload
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        let rows: Record<string, string>[] = [];

        if (file.name.toLowerCase().endsWith('.csv')) {
          const text = new TextDecoder().decode(arrayBuffer);
          rows = parseCSV(text);
        } else {
          const rawRows = await readXlsxFile(new Blob([arrayBuffer]));
          if (rawRows.length < 2) {
            toast.error('No data found in the file');
            return;
          }
          const headers = rawRows[0].map(h => String(h ?? ''));
          rows = rawRows.slice(1).map(row => {
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => { obj[h] = String(row[i] ?? ''); });
            return obj;
          });
        }

        if (rows.length === 0) {
          toast.error('No data found in the file');
          return;
        }

        // Find name and email columns (case-insensitive, flexible naming)
        const headers = Object.keys(rows[0]);
        const nameCol = headers.find(h =>
          /^(name|full.?name|candidate.?name|first.?name)$/i.test(h.trim())
        );
        const emailCol = headers.find(h =>
          /^(email|e.?mail|candidate.?email|email.?address)$/i.test(h.trim())
        );

        if (!emailCol) {
          toast.error('Could not find an "Email" column. Please include a column named "Email" or "Candidate Email".');
          return;
        }

        const parsed: CandidateEmail[] = [];
        for (const row of rows) {
          const email = String(row[emailCol] || '').trim();
          const name = nameCol ? String(row[nameCol] || '').trim() : '';
          if (email && isValidEmail(email)) {
            parsed.push({
              id: Date.now().toString() + Math.random(),
              name: name || email.split('@')[0],
              email,
              source: 'manual' as const,
            });
          }
        }

        if (parsed.length === 0) {
          toast.error('No valid email addresses found in the file');
          return;
        }

        // Remove duplicates within the file itself
        const unique = parsed.filter(
          (c, i, arr) => i === arr.findIndex(x => x.email.toLowerCase() === c.email.toLowerCase())
        );

        // Keep existing valid candidates and skip emails already present
        const existingValid = candidates.filter(c => c.name.trim() && c.email.trim());
        const existingEmails = new Set(existingValid.map(c => c.email.toLowerCase().trim()));
        const newOnly = unique.filter(c => !existingEmails.has(c.email.toLowerCase().trim()));

        const skipped = unique.length - newOnly.length;
        if (skipped > 0) {
          toast.warning(`${skipped} duplicate${skipped > 1 ? 's' : ''} skipped — already in the list`);
        }

        setCandidates(existingValid.length > 0 ? [...existingValid, ...newOnly] : newOnly);
        toast.success(`${newOnly.length} candidate${newOnly.length !== 1 ? 's' : ''} imported from ${file.name}`);
        setInputMode('manual');
      } catch (err) {
        console.error('Failed to parse Excel file:', err);
        toast.error('Failed to parse file. Please ensure it is a valid Excel (.xlsx) or CSV (.csv) file.');
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input so same file can be re-uploaded
    if (excelInputRef.current) excelInputRef.current.value = '';
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

  const handleCopyLink = () => {
    navigator.clipboard.writeText(interviewLink);
    toast.success('Interview link copied to clipboard!');
  };

  const handleSend = async () => {
    setIsSubmitting(true);
    try {
      // Filter candidates with name and email
      const candidatesWithData = candidates.filter((c) => c.name.trim() && c.email.trim());

      if (candidatesWithData.length === 0) {
        toast.warning('Please add at least one candidate with name and email');
        setIsSubmitting(false);
        return;
      }

      // Validate all email addresses
      const invalidEmails = candidatesWithData.filter((c) => !isValidEmail(c.email));
      if (invalidEmails.length > 0) {
        const invalidEmailList = invalidEmails.map((c) => c.email).join(', ');
        toast.error(`Invalid email address(es): ${invalidEmailList}. Please enter valid email addresses.`);
        setIsSubmitting(false);
        return;
      }

      // Final dedup by email (keep first occurrence) in case duplicates slipped through
      const seen = new Set<string>();
      const deduped = candidatesWithData.filter((c) => {
        const key = c.email.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Quota check — block if not enough available slots
      if (quotaStats !== null && quotaStats.total_quota < 999999) {
        if (quotaStats.available < deduped.length) {
          const pendingMsg = quotaStats.pending > 0
            ? ` ${quotaStats.pending} unit${quotaStats.pending > 1 ? 's' : ''} are held by pending invitations and will be released when their links expire.`
            : '';
          toast.error(
            `Insufficient quota. You have ${quotaStats.available} unit${quotaStats.available !== 1 ? 's' : ''} available but need ${deduped.length} to send these invitations.${pendingMsg}`
          );
          setIsSubmitting(false);
          return;
        }
      } else {
        // Fallback: check via QuotaContext
        const aiuQuota = quotaData?.quotas?.AIU;
        const totalRemaining = typeof aiuQuota?.total_remaining === 'number' ? aiuQuota.total_remaining : null;
        if (totalRemaining !== null && totalRemaining < deduped.length) {
          toast.error(`Insufficient quota. You have ${totalRemaining} AI Interview unit${totalRemaining !== 1 ? 's' : ''} remaining but need ${deduped.length}.`);
          setIsSubmitting(false);
          return;
        }
      }

      const resolvedMessage = customMessage
        ? customMessage.replace('[deadline date]', expiryDays > 0
            ? formatISTDate(new Date(Date.now() + expiryDays * 86400000).toISOString())
            : 'no specific deadline'
          )
        : undefined;

      let successCount = 0;
      const alreadyInvited: string[] = [];
      const tenantUserEmails: string[] = [];
      const failed: { email: string; reason: string }[] = [];

      for (const candidate of deduped) {
        try {
          await aiInterviewService.inviteCandidate(config.id, {
            candidate_name: candidate.name.trim(),
            candidate_email: candidate.email.trim(),
            resume_id: candidate.resumeId,
            custom_message: resolvedMessage,
            expiry_days: expiryDays,
            base_url: typeof window !== 'undefined' ? window.location.origin : undefined,
          });
          successCount++;
        } catch (err: any) {
          const errData = err?.response?.data || {};
          const errCode = errData?.error || errData?.detail?.error || '';
          const is409 =
            err?.response?.status === 409 ||
            err?.message?.includes('status code 409') ||
            err?.message?.includes('already been invited') ||
            errCode === 'DUPLICATE_INVITATION';
          const isTenantUser =
            err?.response?.status === 400 && errCode === 'TENANT_USER_EMAIL';

          // Extract the actual error reason from backend response
          const reason: string =
            (typeof errData?.detail === 'string' ? errData.detail : null) ||
            errData?.detail?.message ||
            errData?.message ||
            err?.message ||
            'Unknown error';

          if (is409) {
            alreadyInvited.push(candidate.email.trim());
          } else if (isTenantUser) {
            tenantUserEmails.push(candidate.email.trim());
          } else {
            failed.push({ email: candidate.email.trim(), reason });
            console.error(`Failed to invite ${candidate.email}:`, err);
          }
        }
      }

      setIsSubmitting(false);

      if (successCount > 0) {
        setSentCount(successCount);
        if (alreadyInvited.length > 0) {
          toast.warning(`${alreadyInvited.length} already invited: ${alreadyInvited.join(', ')}`);
        }
        if (tenantUserEmails.length > 0) {
          toast.error(`Team member emails cannot be invited: ${tenantUserEmails.join(', ')}`);
        }
        if (failed.length > 0) {
          // Show actual error reason alongside failed emails
          const uniqueReasons = [...new Set(failed.map(f => f.reason))];
          const emails = failed.map(f => f.email).join(', ');
          toast.error(`${failed.length} failed: ${emails} — ${uniqueReasons.join('; ')}`);
        }
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          onInviteSent();
          onClose();
        }, 2000);
      } else if (tenantUserEmails.length > 0 && successCount === 0) {
        toast.error(`Cannot invite team member email${tenantUserEmails.length > 1 ? 's' : ''}: ${tenantUserEmails.join(', ')}. AI Interview invitations are for external candidates only.`);
      } else if (alreadyInvited.length > 0 && failed.length === 0 && tenantUserEmails.length === 0) {
        setDuplicateEmail(alreadyInvited.join(', '));
        setShowDuplicateError(true);
      } else if (failed.length > 0) {
        // All failed — show the actual error reason
        const uniqueReasons = [...new Set(failed.map(f => f.reason))];
        toast.error(uniqueReasons.length === 1
          ? uniqueReasons[0]
          : `Invitations failed: ${uniqueReasons.join('; ')}`
        );
      } else {
        toast.error('Failed to send invitations. Please try again.');
      }
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      setIsSubmitting(false);
      toast.error(`Failed to send invitations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Validation: all candidates must have valid name and email
  const isValid = candidates.some((c) => c.name.trim() && c.email.trim() && isValidEmail(c.email));

  // Success screen
  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-gray-900/30 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="text-gray-900 mb-2">Invitations Sent!</h3>
          <p className="text-gray-600 text-sm">
            Email invitations have been sent to {sentCount} candidate{sentCount > 1 ? 's' : ''}
          </p>
        </div>
      </div>
    );
  }

  // Duplicate invitation error popup
  if (showDuplicateError) {
    return (
      <div className="fixed inset-0 bg-gray-900/30 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-10 h-10 text-amber-600" />
            </div>
            <h3 className="text-gray-900 text-lg font-medium mb-2">Invitation Already Sent</h3>
            <p className="text-gray-600 text-sm">
              An invitation has already been sent to{' '}
              <span className="font-medium text-gray-800">{duplicateEmail}</span> for this AI interview.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 mb-2">You can:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>
                • Try a <span className="font-medium">different email address</span>
              </li>
              <li>
                • Send invitation for a <span className="font-medium">different AI interview</span>
              </li>
              <li>• Check the candidate&apos;s existing invitation status</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmail('');
              }}
              className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              Try Different Email
            </button>
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmail('');
                onClose();
              }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white">Send AI Interview via Email</h2>
              <p className="text-gray-100 text-sm">{config.jd_title || config.position} - AI Interview</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Config Info Banner */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-900 font-medium">{config.jd_title || config.position}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {config.duration_minutes} min
                  </span>
                  {enabledRounds.length > 0 && (
                    <>
                      <span>•</span>
                      <span>{enabledRounds.length} rounds</span>
                      <span>•</span>
                      <span className="text-xs text-gray-400">
                        {enabledRounds.map((r: any) => ROUND_LABELS[r.type] || r.type).join(', ')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quota Banner */}
          {(() => {
            const aiuQuota = quotaData?.quotas?.AIU;
            const subscriptionLimit = typeof aiuQuota?.subscription?.limit === 'number' ? aiuQuota.subscription.limit : null;
            const subscriptionUsed = aiuQuota?.subscription?.used ?? 0;

            if (quotaStatsLoading) {
              return (
                <div className="mb-4 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Checking AI interview quota...
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
                  <div className="mb-4 px-4 py-3 rounded-lg border text-sm bg-blue-50 border-blue-200 text-blue-800">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium">Unlimited AI interview units</span>
                    </div>
                  </div>
                );
              }

              return (
                <div className={`mb-4 px-4 py-3 rounded-lg border text-sm ${
                  isInsufficient
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : isLow
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  <div className="flex items-start gap-2">
                    {isInsufficient
                      ? <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      : <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    }
                    <div className="flex-1">
                      <div className="font-medium mb-1">
                        {isInsufficient
                          ? 'No AI interview units available'
                          : isLow
                          ? `Only ${available} unit${available !== 1 ? 's' : ''} available`
                          : `${available} AI interview unit${available !== 1 ? 's' : ''} available`
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
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : isLow
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {isInsufficient
                      ? <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                      : <Info className="w-4 h-4 flex-shrink-0" />
                    }
                    <span>
                      <span className="font-medium">{Math.max(0, remaining)} AI interview unit{remaining !== 1 ? 's' : ''} remaining</span>
                      <span className="opacity-80 ml-1">({subscriptionUsed} used of {subscriptionLimit})</span>
                    </span>
                  </div>
                </div>
              );
            }

            return null;
          })()}

          {/* Candidate Emails Section */}
          <div className="mb-6">
            {/* Mode Switcher */}
            <div className="flex items-center justify-between mb-4">
              <label className="text-gray-900 font-medium">Select Candidates</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setInputMode('manual')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    inputMode === 'manual' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Manual
                </button>
                <button
                  onClick={() => excelInputRef.current?.click()}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    inputMode === 'excel' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
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
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    inputMode === 'database' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-600">Enter candidate details manually</p>
                  <button
                    onClick={addCandidate}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Candidate
                  </button>
                </div>

                <div className="space-y-3">
                  {candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className={`p-4 border rounded-lg ${
                        candidate.source === 'database' ? 'bg-gray-50 border-gray-300' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {candidate.source === 'database' && (
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center">
                              <Database className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        )}
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-600 mb-1 block">Full Name *</label>
                            <input
                              type="text"
                              value={candidate.name}
                              onChange={(e) => updateCandidate(candidate.id, 'name', e.target.value)}
                              placeholder="e.g., John Doe"
                              readOnly={candidate.source === 'database'}
                              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 ${
                                candidate.source === 'database' ? 'bg-gray-100 cursor-not-allowed' : ''
                              }`}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 mb-1 block">Email Address *</label>
                            <input
                              type="email"
                              value={candidate.email}
                              onChange={(e) => updateCandidate(candidate.id, 'email', e.target.value)}
                              placeholder="e.g., john.doe@example.com"
                              readOnly={candidate.source === 'database'}
                              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                                candidate.source === 'database'
                                  ? 'bg-gray-100 cursor-not-allowed border-gray-300'
                                  : candidate.email.trim() && !isValidEmail(candidate.email)
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-gray-300 focus:ring-gray-500'
                              }`}
                            />
                            {candidate.source !== 'database' && candidate.email.trim() && !isValidEmail(candidate.email) && (
                              <p className="text-xs text-red-500 mt-1">Please enter a valid email (e.g., user@example.com)</p>
                            )}
                          </div>
                        </div>
                        {(candidates.length > 1 || candidate.source === 'database') && (
                          <button
                            onClick={() => removeCandidate(candidate.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors self-start"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {/* Schedule row - commented out for now, uncomment when schedule feature is needed */}
                      {/* <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Schedule Date</label>
                          <input
                            type="date"
                            value={candidate.scheduledDate}
                            onChange={(e) => updateCandidate(candidate.id, 'scheduledDate', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Schedule Time</label>
                          <input
                            type="time"
                            value={candidate.scheduledTime}
                            onChange={(e) => updateCandidate(candidate.id, 'scheduledTime', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                          />
                        </div>
                      </div> */}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Database Selection Mode */}
            {inputMode === 'database' && (
              <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-gray-200 bg-gray-50">
                  {hasMyResumesAccess && (
                    <button
                      onClick={() => setDbTab('my-resumes')}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                        dbTab === 'my-resumes'
                          ? 'border-gray-800 text-gray-900 bg-white'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <FolderOpen className="w-4 h-4" />
                      My Resumes
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-200 text-gray-700">{myResumesData.length}</span>
                    </button>
                  )}
                  {(hasInternalDBAccess || (!hasMyResumesAccess && !hasInternalDBAccess)) && (
                    <button
                      onClick={() => setDbTab('internal-db')}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                        dbTab === 'internal-db'
                          ? 'border-gray-800 text-gray-900 bg-white'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Database className="w-4 h-4" />
                      Internal Database
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-200 text-gray-700">{internalDbData.length}</span>
                    </button>
                  )}
                </div>

                {/* Content: folder sidebar + resume list */}
                <div className="flex" style={{ minHeight: '300px', maxHeight: '380px' }}>
                  {/* Folder Sidebar (My Resumes only) */}
                  {dbTab === 'my-resumes' && myFolders.length > 0 && (
                    <div className="w-48 border-r border-gray-200 bg-gray-50 overflow-y-auto flex-shrink-0 p-3">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2 px-1">Folders</p>
                      <button
                        onClick={() => setSelectedFolder('all')}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 ${selectedFolder === 'all' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                      >
                        <FolderOpen className="w-4 h-4" />
                        <span className="flex-1 text-left">All Resumes</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">{myResumesData.length}</span>
                      </button>
                      <div className="space-y-0.5">{renderFolderTree(undefined, 0)}</div>
                    </div>
                  )}

                  {/* Resume List */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Search + Select All */}
                    <div className="flex items-center gap-2 p-3 border-b border-gray-100">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by name, email, or position..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                      <button
                        onClick={() => {
                          if (selectedResumes.length === filteredResumes.length && filteredResumes.length > 0) {
                            setSelectedResumes([]);
                          } else {
                            setSelectedResumes(filteredResumes.map(r => r.id));
                          }
                        }}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap text-gray-700"
                      >
                        {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? 'Deselect All' : 'Select All'}
                      </button>
                      <span className="text-sm text-gray-500 whitespace-nowrap">{selectedResumes.length} selected</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {isLoadingResumes ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                      ) : filteredResumes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                          <Database className="w-8 h-8 mb-2" />
                          <p className="text-sm">{searchQuery ? 'No resumes match your search' : 'No resumes found'}</p>
                        </div>
                      ) : filteredResumes.map(resume => (
                        <div
                          key={resume.id}
                          onClick={() => toggleResumeSelection(resume.id)}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedResumes.includes(resume.id) ? 'bg-gray-50 border-gray-800' : 'bg-white border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                            selectedResumes.includes(resume.id) ? 'bg-gray-800 border-gray-800' : 'border-gray-300'
                          }`}>
                            {selectedResumes.includes(resume.id) && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-gray-900 truncate">{resume.name}</span>
                              <span className="text-xs text-gray-400 flex-shrink-0">{resume.experience}</span>
                            </div>
                            <div className="text-xs text-gray-500 truncate">{resume.email}</div>
                            <div className="text-xs text-gray-400 truncate">{resume.position}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action footer */}
                    <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-gray-50 flex-wrap gap-2">
                      <span className="text-xs text-gray-500">{selectedResumes.length} candidate{selectedResumes.length !== 1 ? 's' : ''} selected</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleAddFromDatabase}
                          disabled={selectedResumes.length === 0}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Users className="w-4 h-4" />
                          Add to List
                        </button>
                        <button
                          onClick={handleSendFromDatabase}
                          disabled={selectedResumes.length === 0 || isSubmitting}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" />Sending...</>
                          ) : (
                            <><Send className="w-4 h-4" />Send ({selectedResumes.length})</>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interview Link */}
          <div className="mb-6">
            <label className="text-gray-900 font-medium mb-2 block">Interview Link</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={interviewLink}
                readOnly
                className="flex-1 px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-600"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              {/* Share buttons */}
              <div className="flex items-center gap-1.5">
                {/* WhatsApp */}
                <button
                  onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`You've been invited to an AI Interview for ${config.jd_title || config.position}. Complete it here: ${interviewLink}`)}`, '_blank')}
                  className="p-2 rounded-lg hover:bg-green-50 transition-colors group" title="Share via WhatsApp"
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-green-500 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </button>
                {/* Facebook */}
                <button
                  onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(interviewLink)}`, '_blank', 'width=600,height=400')}
                  className="p-2 rounded-lg hover:bg-blue-50 transition-colors group" title="Share on Facebook"
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </button>
                {/* LinkedIn */}
                <button
                  onClick={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(interviewLink)}`, '_blank', 'width=600,height=400')}
                  className="p-2 rounded-lg hover:bg-blue-50 transition-colors group" title="Share on LinkedIn"
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-700 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </button>
                {/* X / Twitter */}
                <button
                  onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`AI Interview Invitation for ${config.jd_title || config.position}`)}&url=${encodeURIComponent(interviewLink)}`, '_blank', 'width=600,height=400')}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors group" title="Share on X"
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-900 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </button>
                {/* Telegram */}
                <button
                  onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(interviewLink)}&text=${encodeURIComponent(`AI Interview Invitation for ${config.jd_title || config.position}`)}`, '_blank')}
                  className="p-2 rounded-lg hover:bg-sky-50 transition-colors group" title="Share via Telegram"
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-sky-500 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </button>
                {/* SMS */}
                <button
                  onClick={() => {
                    const body = encodeURIComponent(`You've been invited to an AI Interview for ${config.jd_title || config.position}. Complete it here: ${interviewLink}`);
                    // iOS uses sms:&body= ; Android uses sms:?body=
                    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                    window.location.href = isIOS ? `sms:&body=${body}` : `sms:?body=${body}`;
                  }}
                  className="p-2 rounded-lg hover:bg-green-50 transition-colors group" title="Share via SMS"
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-green-600 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    <line x1="9" y1="10" x2="9" y2="10"/>
                    <line x1="12" y1="10" x2="12" y2="10"/>
                    <line x1="15" y1="10" x2="15" y2="10"/>
                  </svg>
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">This unique link will be included in the email invitation</p>
          </div>

          {/* Custom Message */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-900 font-medium">Email Message</label>
              <span className="text-xs text-emerald-600 font-medium">✓ Live preview below</span>
            </div>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={10}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none font-mono"
              placeholder="Edit the message content here..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Use <code className="bg-gray-100 px-1 rounded">[Candidate Name]</code> as a placeholder — it will be
              replaced with each candidate&apos;s name. Your changes appear in the preview below.
            </p>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-gray-900 font-medium mb-2 block">Link Expiry</label>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
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
                  className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700">Send me a copy</span>
              </label>
            </div>
          </div>

          {/* Email Preview */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-emerald-300 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-emerald-600" />
                <h3 className="text-gray-900 font-semibold">Email Preview</h3>
              </div>
              <span className="text-xs text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full font-medium">
                Exact email format
              </span>
            </div>
            <p className="text-xs text-gray-600 mb-4 bg-white rounded-lg px-3 py-2 border border-emerald-200">
              This is exactly how the email will appear to candidates. Edit the message above to see live changes.
            </p>

            {/* Actual Email Template Preview */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden max-w-xl mx-auto">
              {/* Green Header */}
              <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-8 py-8 text-center">
                <h1 className="text-white text-2xl font-bold mb-2">AI Interview Invitation</h1>
                <p className="text-emerald-100 text-sm">TalentFlow</p>
              </div>

              {/* Email Body */}
              <div className="p-8">
                {/* Greeting and Message */}
                <div className="mb-6 text-gray-700 text-base leading-relaxed whitespace-pre-line">
                  {customMessage
                    .replace('[Candidate Name]', candidates[0]?.name || '[Candidate Name]')
                    .replace('[deadline date]', expiryDays > 0
                      ? formatISTDate(new Date(Date.now() + expiryDays * 86400000).toISOString())
                      : 'no specific deadline'
                    )
                  }
                </div>

                {/* Interview Title Box */}
                <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-500 rounded-xl p-5 text-center mb-6">
                  <div className="text-xl font-bold text-emerald-900">
                    {config.jd_title || config.position}
                  </div>
                  <div className="text-sm text-emerald-700 mt-1 font-medium">
                    {(user as any)?.tenantName || 'Our Company'}
                  </div>
                  {((config as any).jd_location) && (
                    <div className="flex items-center justify-center gap-1.5 mt-1.5 text-emerald-600 text-sm">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{(config as any).jd_location}</span>
                    </div>
                  )}
                </div>

                {/* CTA Button */}
                <div className="text-center mb-6">
                  <div className="inline-block bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-8 py-3 rounded-lg font-semibold">
                    Start Interview
                  </div>
                </div>

                {/* Expiry Info */}
                <p className="text-center text-gray-600 text-sm mb-6">
                  This invitation expires on:{' '}
                  <strong>
                    {expiryDays > 0 ? `${expiryDays} day${expiryDays > 1 ? 's' : ''}` : 'No expiry'}
                  </strong>
                </p>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-8 py-6 text-center border-t border-gray-200">
                <p className="text-gray-500 text-xs mb-2">© 2026 TalentFlow. All rights reserved.</p>
                <p className="text-gray-400 text-xs">If you did not expect this email, please ignore it.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {(() => {
              const validCount = candidates.filter((c) => c.name.trim() && c.email.trim()).length;
              const available = quotaStats?.available ?? null;
              const isUnlimited = available !== null && available >= 999999;
              const insufficientQuota = !isUnlimited && available !== null && available < validCount;
              return (
                <span className={insufficientQuota ? 'text-red-600' : ''}>
                  {validCount} candidate{validCount !== 1 ? 's' : ''} will receive this AI interview
                  {insufficientQuota && (
                    <span className="ml-2 font-medium">— only {available} unit{available !== 1 ? 's' : ''} available</span>
                  )}
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!isValid || isSubmitting || (quotaStats !== null && quotaStats.available === 0 && quotaStats.total_quota < 999999)}
              className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Invitations
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
