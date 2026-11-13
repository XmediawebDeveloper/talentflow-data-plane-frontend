/**
 * Support ticket attachments — limits and allowed types.
 * Mirrors the backend (app/services/ticket_attachments.py), which validates again.
 */
import { toast } from 'sonner';

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // all files sent together
export const ATTACHMENT_MAX_FILES = 5; // per upload (create form, or one reply)
export const ATTACHMENT_MAX_PER_TICKET = 25;

/** What to attach, by type of issue. The allowlist is the union. */
export const ATTACHMENT_GROUPS: { label: string; exts: string[]; examples: string }[] = [
  { label: 'Bug Report / Technical Issue', exts: ['.png', '.jpg', '.jpeg', '.webp'], examples: 'Error screenshots' },
  { label: 'Error Logs / Debugging', exts: ['.txt', '.log', '.json'], examples: 'Console logs, API responses' },
  { label: 'Configuration / API Issue', exts: ['.json', '.xml', '.yaml', '.yml'], examples: 'Configuration files' },
  { label: 'Document / General Support', exts: ['.pdf', '.doc', '.docx', '.txt'], examples: 'User guides, reports' },
  { label: 'Billing / Payment Issue', exts: ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.csv'], examples: 'Invoices, payment proof' },
  { label: 'Data Import / Export Issue', exts: ['.csv', '.xlsx', '.xls', '.json'], examples: 'Failed import samples' },
];

export const ATTACHMENT_EXTENSIONS = Array.from(new Set(ATTACHMENT_GROUPS.flatMap(g => g.exts)));
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.join(',');

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v', '.mpg', '.mpeg', '.3gp', '.3g2', '.ogv', '.ts', '.mts', '.m2ts', '.vob'];

export const fileExtension = (name: string) =>
  name.includes('.') ? `.${name.split('.').pop()!.toLowerCase()}` : '';

export const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Validate a pick against what is already chosen; shows a toast for each
 * rejected file and returns the files that may be added.
 * `onTicket` = files already on the ticket (25 max in total).
 */
export function acceptAttachmentFiles(incoming: File[], alreadyChosen: File[], onTicket = 0): File[] {
  const accepted: File[] = [];
  let totalBytes = alreadyChosen.reduce((sum, f) => sum + f.size, 0);
  for (const f of incoming) {
    const ext = fileExtension(f.name);
    const chosen = alreadyChosen.length + accepted.length;
    if (VIDEO_EXTENSIONS.includes(ext) || f.type.startsWith('video/')) {
      toast.error(`${f.name}: video files can't be attached`);
    } else if (!ATTACHMENT_EXTENSIONS.includes(ext)) {
      toast.error(`${f.name}: ${ext || 'this'} files can't be attached. Allowed: ${ATTACHMENT_EXTENSIONS.join(', ')}`);
    } else if (onTicket + chosen >= ATTACHMENT_MAX_PER_TICKET) {
      toast.error(`A ticket can have at most ${ATTACHMENT_MAX_PER_TICKET} attachments`);
      break;
    } else if (chosen >= ATTACHMENT_MAX_FILES) {
      toast.error(`You can attach up to ${ATTACHMENT_MAX_FILES} files at a time`);
      break;
    } else if (f.size === 0) {
      toast.error(`${f.name}: the file is empty`);
    } else if (f.size > ATTACHMENT_MAX_BYTES) {
      toast.error(`${f.name} is ${formatBytes(f.size)}. Attachments must be 10 MB or smaller — please choose a smaller file.`);
    } else if (totalBytes + f.size > ATTACHMENT_MAX_BYTES) {
      toast.error(`${f.name} wasn't added. Files in one upload must total 10 MB or less — remove a file or choose a smaller one.`);
    } else {
      accepted.push(f);
      totalBytes += f.size;
    }
  }
  return accepted;
}

/** Save a downloaded blob under its original name. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
