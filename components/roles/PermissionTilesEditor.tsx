'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import { GroupCheckbox, groupCheckState } from '@/components/ui/group-checkbox';
import {
  CUSTOM_PERMISSION_CATEGORIES,
  getMainPermission,
  type CustomPermissionCategory,
  type CustomPermissionSubCategory,
} from '@/lib/constants/permissionCategories';
import { isEntryPointLocked, isGroupFullyOn, labelOf } from '@/lib/permissions/permissionRules';
import { permissionActionOf, permissionBadgeClass } from './PermissionSectionsView';

/**
 * The permission grid used by Create Role and Edit Role — same look as the Edit
 * User popup: a card per section (checkbox, name, "N permissions", "x selected"),
 * letter-badge tiles, and sub-section blocks with their own checkbox. Purely
 * presentational: the host decides what a click does (shared rules in
 * lib/permissions/permissionRules.ts).
 */

const codesOfSub = (sub: CustomPermissionSubCategory): string[] => [
  ...(sub.viewCode ? [sub.viewCode] : []),
  ...sub.actions.map((a) => a.code),
];

const codesOfCategory = (category: CustomPermissionCategory): string[] => [
  ...(category.viewCode ? [category.viewCode] : []),
  ...(category.actions?.map((a) => a.code) || []),
  ...(category.subCategories?.flatMap(codesOfSub) || []),
];

const TILE_ON =
  'border-brand-blue/30 bg-gradient-to-br from-white to-brand-blue/5 dark:from-slate-900 dark:to-brand-blue/10 ring-1 ring-brand-blue/20 shadow-sm';
const TILE_OFF =
  'border-gray-100 dark:border-slate-700/60 bg-gradient-to-br from-white to-gray-50 dark:from-slate-900 dark:to-slate-800/50 opacity-50 hover:opacity-90 hover:border-brand-blue/30';
const TILE_LOCKED =
  'border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 opacity-40';

export interface PermissionTilesEditorProps {
  selected: Set<string>;
  onToggleCode: (code: string) => void;
  /** Section / sub-section checkbox: the host turns the group all on / all off. */
  onToggleGroup: (codes: string[], label: string) => void;
  /** Baseline codes every account keeps — shown "(always on)", not clickable. */
  alwaysOn?: Set<string>;
}

export default function PermissionTilesEditor({ selected, onToggleCode, onToggleGroup, alwaysOn }: PermissionTilesEditorProps) {
  const renderTile = (code: string, label: string) => {
    const isMandatory = !!alwaysOn?.has(code);
    const isOn = isMandatory || selected.has(code);
    const action = permissionActionOf(code);
    const letter = action === 'read' || action === 'view' ? 'V' : (label[0] || 'P').toUpperCase();
    const lockedMain = !isOn && isEntryPointLocked(code, selected) ? getMainPermission(code) : null;
    return (
      <div
        key={code}
        role="checkbox"
        aria-checked={isOn}
        tabIndex={isMandatory ? -1 : 0}
        onClick={isMandatory ? undefined : () => onToggleCode(code)}
        onKeyDown={isMandatory ? undefined : (e) => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggleCode(code); }
        }}
        title={
          isMandatory
            ? 'Baseline permission — always enabled for every account'
            : lockedMain
              ? `Needs "${labelOf(lockedMain)}" — click to turn both on`
              : undefined
        }
        className={`rounded-2xl border p-4 transition-all select-none flex items-center gap-3 ${isMandatory ? 'cursor-default' : 'cursor-pointer'} ${lockedMain ? TILE_LOCKED : isOn ? TILE_ON : TILE_OFF}`}
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${permissionBadgeClass(action)}`}>
          <span className="text-xs font-semibold uppercase">{letter}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm max-sm:text-[13px] font-semibold text-gray-900 dark:text-slate-50 flex items-center gap-1.5">
            {label}
            {isMandatory && <span className="text-xs font-normal text-gray-500 dark:text-slate-500 italic">(always on)</span>}
            {lockedMain && <Lock className="w-3.5 h-3.5 text-gray-400" />}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {CUSTOM_PERMISSION_CATEGORIES.map((category) => {
        const allCodes = codesOfCategory(category);
        const selectedCount = allCodes.filter((c) => selected.has(c)).length;
        const state = groupCheckState(isGroupFullyOn(allCodes, selected), selectedCount);
        return (
          <div key={category.id} className="overflow-hidden rounded-2xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-sm">
            {/* Section header — the whole row toggles the section */}
            <div
              className="flex cursor-pointer select-none items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-3 sm:px-5"
              onClick={() => onToggleGroup(allCodes, category.name)}
            >
              <div className="flex items-center gap-3">
                <GroupCheckbox state={state} label={category.name} />
                <div>
                  <h4 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">{category.name}</h4>
                  <p className="text-xs text-gray-500 dark:text-slate-500">
                    {allCodes.length} permission{allCodes.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {category.isMenuToggle && selectedCount > 0 && (
                  <span className="text-xs text-brand-orange bg-brand-orange/10 ring-1 ring-brand-orange/20 px-1.5 py-0.5 rounded-full font-medium">
                    Menu
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-gray-500 dark:text-slate-500">{selectedCount} selected</span>
            </div>

            {(category.viewCode || category.actions?.length) && (
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {category.viewCode && renderTile(category.viewCode, `View ${category.name}`)}
                {category.actions?.map((a) => renderTile(a.code, a.label))}
              </div>
            )}

            {category.subCategories?.map((sub) => {
              const subCodes = codesOfSub(sub);
              const subSelected = subCodes.filter((c) => selected.has(c)).length;
              return (
                <div
                  key={sub.name}
                  className="ml-4 mr-3 mb-3 sm:ml-8 sm:mr-4 overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700 border-l-4 border-l-brand-blue/30"
                >
                  <div
                    className="px-3 sm:px-4 py-2 flex items-center justify-between cursor-pointer select-none transition-colors bg-slate-50 dark:bg-slate-800/50"
                    onClick={() => onToggleGroup(subCodes, sub.name)}
                  >
                    <div className="flex items-center gap-2">
                      <GroupCheckbox size="sm" state={groupCheckState(isGroupFullyOn(subCodes, selected), subSelected)} label={sub.name} />
                      <span className="text-xs font-semibold text-gray-800 dark:text-slate-200">{sub.name}</span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-500">{subSelected} selected</span>
                  </div>
                  <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                    {sub.viewCode && renderTile(sub.viewCode, `View ${sub.name}`)}
                    {sub.actions.map((a) => renderTile(a.code, a.label === 'View' ? `View ${sub.name}` : a.label))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
