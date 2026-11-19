'use client';

import { useState } from 'react';
import { Forward } from 'lucide-react';
import { toast } from 'sonner';
import AppModal from '@/components/ui/app-modal';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, handleApiError } from '@/lib/services/api';
import {
  internalTicketService,
  FORWARD_TEAMS,
  forwardTeamLabel,
  type ForwardTeam,
  type ForwardInternalTicketRequest,
  type InternalTicket,
} from '@/lib/services/internalTicketService';

const NOTE_MAX = 2000;

// Team ticket category -> the team that usually handles it (pre-selected).
const SUGGESTED_TEAM: Record<string, ForwardTeam> = {
  'account-access': 'account',
  'permission-request': 'account',
  'feature-question': 'product',
  'bug-report': 'technical',
  'general-inquiry': 'general',
  other: 'general',
};

const PRIORITIES: { value: NonNullable<ForwardInternalTicketRequest['priority']>; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

function errorText(error: unknown, fallback: string): string {
  try {
    handleApiError(error);
  } catch (e) {
    if (e instanceof ApiError && e.message) return e.message;
  }
  return fallback;
}

interface ForwardTicketDialogProps {
  ticket: InternalTicket | null;
  open: boolean;
  onClose: () => void;
  /** Called with the updated Team ticket (now carrying `forwarding`). */
  onForwarded: (ticket: InternalTicket) => void;
}

/**
 * Forward a Team Support Ticket the admin could not resolve to platform support.
 * The backend creates the linked ticket in My Support Tickets and the Control
 * Plane; the Team ticket stays where it is, marked as forwarded.
 */
export default function ForwardTicketDialog({ ticket, open, onClose, onForwarded }: ForwardTicketDialogProps) {
  if (!ticket || !open) return null;
  // Keyed by ticket: each open starts a fresh form pre-filled from that ticket.
  return <ForwardTicketForm key={ticket.id} ticket={ticket} onClose={onClose} onForwarded={onForwarded} />;
}

function ForwardTicketForm({
  ticket,
  onClose,
  onForwarded,
}: Omit<ForwardTicketDialogProps, 'open' | 'ticket'> & { ticket: InternalTicket }) {
  const [team, setTeam] = useState<ForwardTeam>(SUGGESTED_TEAM[ticket.category] || 'technical');
  const [priority, setPriority] = useState<NonNullable<ForwardInternalTicketRequest['priority']>>(ticket.priority);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const updated = await internalTicketService.forwardTicket(ticket.id, {
        team,
        priority,
        note: note.trim() || undefined,
      });
      toast.success(
        `Forwarded to ${forwardTeamLabel(team)} as ${updated.forwarding?.support_ticket_number ?? 'a support ticket'}`,
        { description: 'It now also appears in My Support Tickets.' },
      );
      onForwarded(updated);
      onClose();
    } catch (error) {
      toast.error(errorText(error, 'Could not forward this ticket'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal
      open
      onCancel={onClose}
      cancelDisabled={submitting}
      size="md"
      icon={<Forward />}
      title="Forward ticket"
      subtitle={`${ticket.ticket_number} · ${ticket.title}`}
      actions={[
        {
          label: 'Forward ticket',
          onClick: submit,
          loading: submitting,
          disabled: submitting,
          icon: <Forward className="w-4 h-4" />,
        },
      ]}
    >
      <div className="space-y-5">
        <p className="text-sm text-[var(--text-secondary)]">
          Can&apos;t resolve this yourself? Forward it to platform support. It stays in Team Support Tickets,
          is added to My Support Tickets, and {ticket.created_by.name} will see status updates.
        </p>

        <fieldset>
          <legend className="text-sm font-medium text-[var(--text-primary)] mb-2">Forward to</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Forward to">
            {FORWARD_TEAMS.map(t => {
              const selected = team === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTeam(t.value)}
                  className={`text-left rounded-lg border px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
                    selected
                      ? 'border-brand-blue bg-brand-blue/5'
                      : 'border-[var(--border)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <span className="block text-sm font-medium text-[var(--text-primary)]">{t.label}</span>
                  <span className="block text-xs text-[var(--text-secondary)]">{t.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-[var(--text-primary)] mb-2">Priority</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map(p => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={priority === p.value}
                onClick={() => setPriority(p.value)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
                  priority === p.value
                    ? 'border-brand-blue bg-brand-blue text-white'
                    : 'border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <Label htmlFor="forward-note" className="mb-2 block">
            Note for the support team <span className="text-[var(--text-secondary)] font-normal">(optional)</span>
          </Label>
          <Textarea
            id="forward-note"
            value={note}
            maxLength={NOTE_MAX}
            rows={4}
            onChange={e => setNote(e.target.value)}
            placeholder="What you already checked or tried, and why you need their help"
          />
          <p className="mt-1 text-xs text-[var(--text-secondary)] text-right">{note.length}/{NOTE_MAX}</p>
        </div>
      </div>
    </AppModal>
  );
}
