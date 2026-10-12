'use client';

import { useRef, useState } from 'react';
import ShareAIInterviewModal from '@/components/ai-interview/ShareAIInterviewModal';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';

/**
 * The Invite to AI Interview popup's hand-over: the existing "Send AI
 * Interview via Email" step, pre-filled with the ticked candidates, once per
 * picked interview in turn — the same queue InviteToAIInterviewFlow runs. That
 * step owns everything about the invitation (email or Copy Link, message,
 * link expiry, quota) and does the sending.
 */
export default function AIInterviewShareQueue({
  configs,
  candidates,
  interviewVersions,
  onClose,
  onInvited,
}: {
  configs: AIInterviewResponse[];
  candidates: { name: string; email: string; resumeId?: string }[];
  /** Interview version per config id, when the host already knows it. */
  interviewVersions?: Record<string, number>;
  onClose: () => void;
  /** At least one invitation went out — reported once. */
  onInvited?: () => void;
}) {
  const [index, setIndex] = useState(0);
  /* The share step calls onInviteSent THEN onClose: `advancingRef` tells that
     onClose to move on to the next interview rather than end the queue, and
     `sentRef` / `reportedRef` report a send once, even if the recruiter
     cancels part-way through. */
  const advancingRef = useRef(false);
  const sentRef = useRef(false);
  const reportedRef = useRef(false);
  const finish = () => {
    if (sentRef.current && !reportedRef.current) {
      reportedRef.current = true;
      onInvited?.();
    }
    onClose();
  };

  const config = configs[index];
  if (!config) return null;
  return (
    <ShareAIInterviewModal
      /* Keyed per interview: the modal reads its candidates once on mount, so
         each queued interview opens a fresh, pre-filled form. */
      key={config.id}
      isOpen
      config={config}
      interviewVersion={interviewVersions?.[config.id]}
      initialCandidates={candidates.length > 0 ? candidates : undefined}
      onClose={() => {
        if (advancingRef.current) {
          advancingRef.current = false;
          return;
        }
        finish();
      }}
      onInviteSent={() => {
        sentRef.current = true;
        if (index + 1 < configs.length) {
          advancingRef.current = true;
          setIndex(index + 1);
          return;
        }
        finish();
      }}
    />
  );
}
