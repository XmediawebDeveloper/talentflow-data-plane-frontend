import { formatIST } from '@/lib/utils/dateUtils';

export type ResendExpiryPreview = { durationLabel: string; dateLabel: string };

/* The original invitation's validity (expiry minus the last send), counted
   from now. Anchored on the last send, mirroring the backend — on a second
   resend `created_at` would make the window "expiry minus creation" and
   promise longer than the server grants. */
function expiryFrom(sentAnchor?: string | null, expiresAt?: string | null): ResendExpiryPreview {
  const createdMs = sentAnchor ? new Date(sentAnchor).getTime() : NaN;
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
  let durationMs = 24 * 60 * 60 * 1000; // default 1 day
  if (Number.isFinite(createdMs) && Number.isFinite(expiresMs) && expiresMs > createdMs) {
    durationMs = expiresMs - createdMs;
  }
  const newExpiry = new Date(Date.now() + durationMs);
  const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
  let durationLabel: string;
  if (totalMinutes >= 60 * 24) {
    const days = Math.round(totalMinutes / (60 * 24));
    durationLabel = days === 1 ? '1 day' : `${days} days`;
  } else if (totalMinutes >= 60) {
    const hours = Math.round(totalMinutes / 60);
    durationLabel = hours === 1 ? '1 hour' : `${hours} hours`;
  } else {
    durationLabel = `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  }
  return { durationLabel, dateLabel: formatIST(newExpiry.toISOString()) };
}

/** When an AI Interview resend's new link will expire. */
export function interviewResendExpiry(inv: {
  invitation_sent_at?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
}): ResendExpiryPreview {
  return expiryFrom(inv.invitation_sent_at || inv.created_at, inv.expires_at);
}

/** When an assessment resend's new link will expire. */
export function assessmentResendExpiry(inv: {
  sent_at?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
}): ResendExpiryPreview {
  return expiryFrom(inv.sent_at || inv.created_at, inv.expires_at);
}
