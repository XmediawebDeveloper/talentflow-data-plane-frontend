'use client';

import { useState } from 'react';
import { Eye, FileText, Loader2, Mail, Paperclip, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Resume } from '@/lib/types/types';
import { resumeService } from '@/lib/services/resumeService';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';

/**
 * Share Resume — one dialog for every list that offers the action, so a resume
 * is sent the same way from the table, the cards, or the resume itself.
 *
 * The recipient and the message are what actually travel: the API takes a
 * resume id, an address and a body. The attachment card names the file that
 * goes with them and opens it for reading, so nothing is sent unseen.
 */

interface ShareResumeModalProps {
  resume: Resume;
  onClose: () => void;
  /** Fired after a successful send, before the dialog closes. */
  onShared?: () => void;
}

export default function ShareResumeModal({ resume, onClose, onShared }: ShareResumeModalProps) {
  const row = resume as any;

  const fileName = resume.fileName || `${resume.name}.${resume.fileType || 'pdf'}`;
  const fileType = (resume.fileType || fileName.split('.').pop() || '').toUpperCase();
  const sizeKb = row.fileSizeKb ?? row.file_size_kb;

  /* Subject and body are written for the recruiter, who then edits them. Built
     once, on open — retyping them on every keystroke would fight the user. */
  const [shareEmail, setShareEmail] = useState('');
  const [shareSubject, setShareSubject] = useState(
    () => `Resume: ${resume.name} - ${row.title || row.current_title || 'Candidate'}`,
  );
  const [shareMessage, setShareMessage] = useState(() => {
    const skills = Array.isArray(resume.skills) ? resume.skills.slice(0, 5).join(', ') : '';
    // `experience` is a label on list rows but an array on API records — only
    // the label is worth putting in an email.
    const experience = typeof resume.experience === 'string' ? resume.experience : '';
    const resumeLink =
      typeof window !== 'undefined' ? `${window.location.origin}/recruitment/resume-view/${resume.id}` : '';

    return `Hi,

I'm sharing the resume of ${resume.name} for your review.

Candidate Details:
- Name: ${resume.name}
- Title: ${row.title || row.current_title || 'N/A'}
- Experience: ${experience || 'N/A'}
- Location: ${resume.location || 'N/A'}
- Skills: ${skills || 'N/A'}

You can view the full resume at: ${resumeLink}

Best regards`;
  });
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleSend = async () => {
    if (!shareEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(shareEmail.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSendingEmail(true);
    try {
      const result = await resumeService.share(resume.id, shareEmail.trim(), shareMessage);
      if (result.success) {
        toast.success('Resume shared successfully');
        onShared?.();
        onClose();
      } else {
        toast.error(result.message || 'Failed to send email');
      }
    } catch (error: any) {
      console.error('Failed to share resume:', error);
      toast.error(error?.message || 'Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90dvh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Share Resume</h2>
                  <p className="text-sm text-gray-500">The selected candidate&rsquo;s resume will be shared with the recipient via email.</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              {/* What goes out with the email, and the eye to read it first. */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attachment</label>
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate" title={fileName}>
                      {fileName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {resume.name}
                      {fileType && <> &middot; {fileType}</>}
                      {sizeKb ? <> &middot; {Math.round(sizeKb)} KB</> : null}
                    </div>
                  </div>
                  <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(true)}
                    className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-brand-blue/10 transition-colors"
                    aria-label={`View ${resume.name}'s resume`}
                    title="View resume"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="Enter email address"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={shareSubject}
                  onChange={(e) => setShareSubject(e.target.value)}
                  placeholder="Email subject"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                  placeholder="Enter your message"
                  rows={8}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={handleSend}
                disabled={isSendingEmail || !shareEmail.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                {isSendingEmail ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* After the dialog in the tree, so it sits above it — both are z-50. */}
      {isPreviewOpen && (
        <ResumeTextPreviewModal
          resumeId={resume.id}
          title={resume.name}
          subtitle={resume.fileName}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}
    </>
  );
}
