'use client';

import { useEffect, useState } from 'react';

/**
 * Per-ticket reply drafts. Shares the support-ticket draft prefix, so logout
 * (lib/services/api.ts) already clears them along with the create-form draft.
 */
export const REPLY_DRAFT_PREFIX = 'tf-support-ticket-draft:reply:';

const readDraft = (key: string | null): string => {
  if (!key) return '';
  try {
    return localStorage.getItem(REPLY_DRAFT_PREFIX + key) ?? '';
  } catch {
    return '';
  }
};

/**
 * Keeps the reply box's text per ticket: opening a ticket brings back what
 * was typed there before (also after a reload); typing saves it; an emptied
 * box (sent, or cleared) removes it. `key` = `${userId}:${scope}:${ticketId}`,
 * or null when no ticket is open (the box is then emptied).
 */
export function useReplyDraft(key: string | null, value: string, setValue: (v: string) => void) {
  // Load the draft when the open ticket changes — during render, so the box
  // never shows the previous ticket's text for a frame.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (loadedFor !== key) {
    setLoadedFor(key);
    setValue(readDraft(key));
  }

  useEffect(() => {
    if (!key || loadedFor !== key) return;
    try {
      if (value.trim()) localStorage.setItem(REPLY_DRAFT_PREFIX + key, value);
      else localStorage.removeItem(REPLY_DRAFT_PREFIX + key);
    } catch {
      /* storage unavailable — drafts are best effort */
    }
  }, [key, value, loadedFor]);
}
