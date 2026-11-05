'use client';

import { useRef } from 'react';
import { toast } from 'sonner';
import { askTurnOnWithDependents, askUnlockEntryPoint, usePermissionChangeDialog } from '@/components/roles/PermissionChangeDialog';
import {
  forgetTurnOff,
  isGroupFullyOn,
  labelOf,
  planTurnOff,
  planTurnOn,
  rememberTurnOff,
  type TurnOffMemory,
} from '@/lib/permissions/permissionRules';
import { CUSTOM_PERMISSION_CATEGORIES } from '@/lib/constants/permissionCategories';

/** The section / sub-section View a code sits under, and the actions next to it. */
const viewAndSiblings = (code: string): { view: string; actions: string[] } | null => {
  for (const cat of CUSTOM_PERMISSION_CATEGORIES) {
    if (cat.actions?.some((a) => a.code === code)) {
      return cat.viewCode ? { view: cat.viewCode, actions: cat.actions.map((a) => a.code) } : null;
    }
    for (const sub of cat.subCategories || []) {
      if (sub.actions.some((a) => a.code === code)) {
        const view = sub.viewCode || cat.viewCode;
        return view ? { view, actions: sub.actions.map((a) => a.code) } : null;
      }
    }
  }
  return null;
};

/**
 * Advanced (every permission) clicks for the role editor — the same rules and
 * popups as before (lib/permissions/permissionRules.ts + PermissionChangeDialog):
 * needs are turned on with a permission, a main offers its entry points,
 * turning off cascades after a confirm, locked entry points offer to unlock.
 */
export function useAdvancedToggles(selected: Set<string>, setSelected: (next: Set<string>) => void) {
  const { ask, dialog } = usePermissionChangeDialog();
  const memory = useRef<TurnOffMemory>(new Map());

  const applyTurnOn = async (codes: string[], label: string) => {
    const plan = planTurnOn(codes, selected);
    if (codes.length === 1 && plan.skippedLocked.includes(codes[0])) {
      const next = await askUnlockEntryPoint(ask, codes[0], selected);
      if (next) setSelected(next);
      return;
    }
    const withDeps = await askTurnOnWithDependents(ask, codes, label, selected, memory.current);
    if (withDeps !== undefined) {
      if (withDeps) {
        forgetTurnOff(memory.current, withDeps);
        setSelected(withDeps);
      }
      return;
    }
    const entryCount = plan.offeredEntryPoints.reduce((n, g) => n + g.entries.length, 0);
    const needAsk = entryCount > 0 || (codes.length > 1 && plan.skippedLocked.length > 0);
    if (!needAsk) {
      setSelected(plan.only);
      if (plan.autoRequired.length > 0) {
        toast.info(`Also turned on: ${plan.autoRequired.map(labelOf).join(', ')} — needed by "${label}"`);
      }
      return;
    }
    const summary =
      entryCount === 0
        ? 'Some permissions here can only be turned on after their main permission in another section.'
        : plan.offeredEntryPoints.length === 1
          ? `"${labelOf(plan.offeredEntryPoints[0].main)}" can also be started from ${entryCount} other section${entryCount === 1 ? '' : 's'}. Turn those on too?`
          : `${plan.offeredEntryPoints.length} of these permissions can also be started from other sections (${entryCount} places). Turn those on too?`;
    const choice = await ask({
      title: `Turn on "${label}"?`,
      tone: 'on',
      summary,
      details: [
        { heading: 'Can also be started from', codes: plan.offeredEntryPoints.flatMap((g) => g.entries) },
        { heading: 'Also turned on (needed)', codes: plan.autoRequired },
        { heading: 'Not turned on (their main permission is off)', codes: plan.skippedLocked },
      ],
      actions:
        entryCount === 0
          ? [{ id: 'only', label: 'Turn on' }]
          : [
              { id: 'only', label: 'Only this', variant: 'secondary' },
              { id: 'all', label: 'Turn on all' },
            ],
    });
    if (!choice) return;
    const turnedOn = choice === 'all' ? plan.all : plan.only;
    forgetTurnOff(memory.current, turnedOn);
    setSelected(turnedOn);
  };

  const applyTurnOff = async (codes: string[], label: string) => {
    const plan = planTurnOff(codes, selected);
    let next = plan.next;
    // A section's View goes with its last action — only when nothing else needs it.
    codes.forEach((code) => {
      const found = viewAndSiblings(code);
      if (!found || !next.has(found.view) || found.actions.some((c) => next.has(c))) return;
      const trial = planTurnOff([found.view], next);
      if (trial.entryPointsOff.length === 0 && trial.dependentsOff.length === 0) next = trial.next;
    });
    const extra = plan.entryPointsOff.length + plan.dependentsOff.length;
    if (extra === 0) {
      rememberTurnOff(memory.current, codes, selected, next);
      setSelected(next);
      return;
    }
    const parts: string[] = [];
    if (plan.entryPointsOff.length) {
      parts.push(`${plan.entryPointsOff.length === 1 ? 'a button' : `${plan.entryPointsOff.length} buttons`} on other pages`);
    }
    if (plan.dependentsOff.length) {
      parts.push(`${plan.dependentsOff.length === 1 ? 'one thing' : `${plan.dependentsOff.length} things`} that need${plan.dependentsOff.length === 1 ? 's' : ''} it`);
    }
    const choice = await ask({
      title: `Turn off "${label}"?`,
      tone: 'off',
      summary: `This will also turn off ${parts.join(' and ')}.`,
      details: [
        { heading: 'On other pages', codes: plan.entryPointsOff },
        { heading: 'Also turned off (they need it)', codes: plan.dependentsOff },
      ],
      actions: [{ id: 'off', label: 'Turn off', variant: 'destructive' }],
    });
    if (choice !== 'off') return;
    rememberTurnOff(memory.current, codes, selected, next);
    setSelected(next);
  };

  const onToggleCode = (code: string) => {
    if (selected.has(code)) void applyTurnOff([code], labelOf(code));
    else void applyTurnOn([code], labelOf(code));
  };

  const onToggleGroup = (codes: string[], label: string) => {
    if (isGroupFullyOn(codes, selected)) void applyTurnOff(codes, label);
    else void applyTurnOn(codes.filter((c) => !selected.has(c)), label);
  };

  return { onToggleCode, onToggleGroup, dialog };
}
