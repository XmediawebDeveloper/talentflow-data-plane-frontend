'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ChevronDown, ChevronRight, Edit2, Folder, FolderOpen, FolderRoot, LayoutGrid, Loader2, MoreVertical, Plus, Upload } from 'lucide-react';
import type { Folder as ApiFolder } from '@/lib/services/resumeService';
import { FOLDER_NAME_MAX_LENGTH, MAX_FOLDER_DEPTH } from '@/components/FolderTree';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';

/* The Resume Database tree's geometry (components/FolderTree): rows indented
   16px a level, a 20px chevron column, and connector lines drawn per row from
   the same numbers — so the branches land on the folder icons the same way.
   The tick boxes stay in one column at the left; the indent starts after it,
   so no branch line runs through a tick box. */
const INDENT = 16;
const BASE = 8;
const COLUMN_CENTER = 10;
const CHECK = 28; // the tick box (16px) and the two 6px gaps around the indent
const guideX = (depth: number) => BASE + CHECK + depth * INDENT + COLUMN_CENTER;

/* The folder-actions menu, as the Resume Database page draws it. */
const MENU_WIDTH = 192;
const MENU_GAP = 6;
const MENU_EDGE = 8;
const menuItem = 'group w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-slate-300 transition-colors flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-800';
const menuItemOff = `${menuItem} !text-gray-400 dark:!text-slate-600 cursor-not-allowed opacity-60 hover:bg-transparent`;

export const isRootFolder = (f: Pick<ApiFolder, 'name' | 'parent_id'>) => !f.parent_id && f.name.toLowerCase() === 'root';
export const isArchivedFolder = (f: Pick<ApiFolder, 'name' | 'parent_id'>) => !f.parent_id && f.name === 'Archived Resumes';

/** Every folder of the tree, flat. */
export const flattenTree = (list: ApiFolder[]): ApiFolder[] => list.flatMap((f) => [f, ...flattenTree(f.children ?? [])]);

/** What the folder actions may do (the Resume Database page's permissions). */
export interface FolderActions {
  canCreate: boolean;
  canRename: boolean;
  canUpload: boolean;
  /** Resolves true once created (the input then closes). */
  onCreate: (name: string, parentId?: string) => Promise<boolean>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onUploadTo: (id: string) => void;
}

/**
 * My Resumes' folders in the invite popup, drawn as the Resume Database page
 * draws them: System Folders pinned (All Resumes, root, Archived Resumes)
 * over My Folders, main folder → sub folder → child folder with chevrons and
 * branch lines, the same icons and colours, "+ New" and each folder's ⋮ menu
 * (Upload to Folder, Create Subfolder, Rename Folder — deleting stays on the
 * Resume Database page). Click a folder to list it; tick it to select
 * everyone in it. Archived Resumes lists but never ticks.
 */
export default function InviteFolderTree({
  folders,
  allCount,
  openId,
  onOpen,
  isTicked,
  isPartly,
  tickDisabledReason,
  onTick,
  actions,
  onOverlayChange,
}: {
  /** The folders API's tree; null while it loads. */
  folders: ApiFolder[] | null;
  allCount: number;
  /** The folder listed ('' = All Resumes). */
  openId: string;
  onOpen: (id: string) => void;
  isTicked: (id: string) => boolean;
  isPartly: (id: string) => boolean;
  /** Why the folder cannot be ticked now, or null when it can. */
  tickDisabledReason: (id: string, count: number) => string | null;
  onTick: (id: string, on: boolean) => void;
  actions: FolderActions;
  /** The open menu's closer, so Esc closes it before the popup. */
  onOverlayChange?: (close: (() => void) | null) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const expand = (id: string) => setExpanded((s) => (s.has(id) ? s : new Set([...s, id])));

  /* New folder / subfolder / rename: one inline input at a time. */
  const [editing, setEditing] = useState<{ mode: 'new' | 'sub' | 'rename'; id?: string; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const submitEdit = async () => {
    if (!editing || saving) return;
    const name = editing.value.trim();
    if (!name) { setEditing(null); return; }
    setSaving(true);
    try {
      const ok = editing.mode === 'rename'
        ? await actions.onRename(editing.id!, name)
        : await actions.onCreate(name, editing.mode === 'sub' ? editing.id : undefined);
      if (ok) setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  /* The ⋮ menu: portalled and placed against the viewport (it would be cut
     off inside the scrolling list), flipped above when there is no room. */
  const [menu, setMenu] = useState<{ folder: ApiFolder; level: number; anchor: DOMRect } | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeMenu = () => { setMenu(null); setMenuPos(null); onOverlayChange?.(null); };
  const openMenu = (folder: ApiFolder, level: number, anchor: DOMRect) => {
    setMenuPos(null);
    setMenu({ folder, level, anchor });
    onOverlayChange?.(closeMenu);
  };
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const h = menuRef.current.offsetHeight;
    const below = menu.anchor.bottom + MENU_GAP;
    const top = below + h > window.innerHeight - MENU_EDGE ? Math.max(MENU_EDGE, menu.anchor.top - MENU_GAP - h) : below;
    const left = Math.min(window.innerWidth - MENU_WIDTH - MENU_EDGE, Math.max(MENU_EDGE, menu.anchor.right - MENU_WIDTH));
    // Measured once mounted: the menu's own height decides above or below.
    setMenuPos({ top, left });
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) closeMenu(); };
    const onResize = () => closeMenu();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', onResize); };
    // closeMenu only clears state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  const root = folders?.find(isRootFolder);
  const archived = folders?.find(isArchivedFolder);
  const regular = (folders ?? []).filter((f) => !isRootFolder(f) && !isArchivedFolder(f));

  const icon = (f: ApiFolder | null, open: boolean) => {
    if (!f) return <LayoutGrid className="w-4 h-4 shrink-0 text-blue-600" aria-hidden="true" />;
    if (isArchivedFolder(f)) return <Archive className="w-4 h-4 shrink-0 text-amber-600" aria-hidden="true" />;
    if (isRootFolder(f)) return <FolderRoot className="w-4 h-4 shrink-0 text-brand-cyan" aria-hidden="true" />;
    return open
      ? <FolderOpen className="w-4 h-4 shrink-0 text-brand-orange" aria-hidden="true" />
      : <Folder className="w-4 h-4 shrink-0 text-brand-orange" aria-hidden="true" />;
  };

  const nameInput = (placeholder: string, indent: number) => editing && (
    <div className="py-1 pr-2" style={{ paddingLeft: `${indent}px` }}>
      <input
        type="text"
        autoFocus
        value={editing.value}
        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void submitEdit(); }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(null); }
        }}
        onBlur={() => { if (!editing.value.trim()) setEditing(null); }}
        disabled={saving}
        placeholder={placeholder}
        maxLength={FOLDER_NAME_MAX_LENGTH}
        className="w-full px-2 py-1 text-xs border border-blue-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:opacity-60"
      />
    </div>
  );

  /* One row: tick, chevron (or its blank column), icon, name, count, ⋮. */
  const row = (id: string, name: string, count: number, f: ApiFolder | null, level: number, hasChildren: boolean, isOpen: boolean) => {
    const here = openId === id;
    const archivedRow = !!f && isArchivedFolder(f);
    const ticked = isTicked(id);
    const partly = isPartly(id);
    const reason = archivedRow ? 'Archived resumes cannot be invited — unarchive them first' : tickDisabledReason(id, count);
    // Fixtures (All Resumes, root, Archived Resumes) have no menu, as on the page.
    const hasMenu = !!f && !isRootFolder(f) && !archivedRow;
    const menuOpen = !!menu && menu.folder.id === id;
    return (
      <div
        className={`group relative flex items-center gap-1.5 pr-1 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${here ? 'bg-blue-50 text-blue-600 dark:bg-slate-800 dark:text-blue-400' : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800/60'}`}
        style={{ paddingLeft: `${BASE}px` }}
        onClick={() => onOpen(id)}
      >
        <input
          type="checkbox"
          checked={ticked && !partly}
          ref={(el) => { if (el) el.indeterminate = partly; }}
          disabled={!!reason && !ticked}
          title={reason ?? `Select everyone in ${name}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onTick(id, e.target.checked)}
          aria-label={`Select everyone in ${name}`}
          className="relative z-[1] m-0 shrink-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
        />
        <span aria-hidden="true" className="shrink-0" style={{ width: `${level * INDENT}px` }} />
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(id); }}
            aria-label={isOpen ? `Collapse ${name}` : `Expand ${name}`}
            aria-expanded={isOpen}
            className="relative z-[1] p-0.5 shrink-0 rounded"
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : <span className="w-5 shrink-0" />}
        <span className="relative z-[1] shrink-0">{icon(f, isOpen && hasChildren)}</span>
        <span className="flex-1 min-w-0 truncate text-left text-xs" title={name}>{name}</span>
        <span className="shrink-0 text-2xs tabular-nums text-gray-500 dark:text-slate-400">({count.toLocaleString()})</span>
        {hasMenu ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (menuOpen) closeMenu(); else openMenu(f, level, e.currentTarget.getBoundingClientRect());
            }}
            aria-label={`Folder actions for ${name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Folder actions"
            className={`shrink-0 p-0.5 rounded text-blue-600 hover:bg-blue-100 dark:hover:bg-slate-700 transition-opacity focus:opacity-100 ${menuOpen ? 'opacity-100 bg-blue-100 dark:bg-slate-700' : 'opacity-0 group-hover:opacity-100 max-md:opacity-100'}`}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        ) : <span className="w-[18px] shrink-0" />}
      </div>
    );
  };

  /* A user folder and, when expanded, its children — with the tree guides. */
  const branch = (f: ApiFolder, level: number, isLast: boolean, trunks: boolean[]) => {
    const kids = f.children ?? [];
    const isOpen = expanded.has(f.id);
    const renaming = editing?.mode === 'rename' && editing.id === f.id;
    return (
      <div key={f.id}>
        <div className="relative">
          {level > 0 && (
            <>
              {trunks.map((on, d) => on && (
                <span key={d} aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-gray-300 dark:bg-slate-600" style={{ left: `${guideX(d)}px` }} />
              ))}
              <span aria-hidden="true" className="pointer-events-none absolute top-0 h-1/2 w-px bg-gray-400 dark:bg-slate-500" style={{ left: `${guideX(level - 1)}px` }} />
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 h-px bg-gray-400 dark:bg-slate-500" style={{ left: `${guideX(level - 1)}px`, width: `${INDENT - COLUMN_CENTER + (kids.length ? 2 : INDENT)}px` }} />
              {!isLast && <span aria-hidden="true" className="pointer-events-none absolute top-1/2 bottom-0 w-px bg-gray-400 dark:bg-slate-500" style={{ left: `${guideX(level - 1)}px` }} />}
            </>
          )}
          {renaming
            ? nameInput('Folder name...', BASE + CHECK + level * INDENT)
            : row(f.id, f.name, f.resume_count ?? 0, f, level, kids.length > 0, isOpen)}
        </div>
        {editing?.mode === 'sub' && editing.id === f.id && nameInput('Sub-folder name...', BASE + CHECK + (level + 1) * INDENT)}
        {/* A child's trunks: one per ancestor column below the top level —
            whether that ancestor still has siblings further down. */}
        {isOpen && kids.map((c, i) => branch(c, level + 1, i === kids.length - 1, level === 0 ? [] : [...trunks, !isLast]))}
      </div>
    );
  };

  /* Create Subfolder: up to MAX_FOLDER_DEPTH levels, as on the page. */
  const subfolderBlocked = (level: number) => (!actions.canCreate ? 'You do not have permission to create folders'
    : level >= MAX_FOLDER_DEPTH - 1 ? `Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)` : null);

  const heading = 'px-2 pt-1 pb-1 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400';
  return (
    <nav aria-label="Folders" className="flex flex-col max-h-80 max-sm:max-h-72 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5">
      <div className="shrink-0 px-1">
        <p className={heading}>System Folders</p>
        {row('', 'All Resumes', allCount, null, 0, false, false)}
        {root && row(root.id, root.name, root.resume_count ?? 0, root, 0, false, false)}
        {archived && row(archived.id, archived.name, archived.resume_count ?? 0, archived, 0, false, false)}
      </div>
      <div className="shrink-0 mt-1 mx-1 flex items-center justify-between border-t border-gray-100 dark:border-slate-700/60 pt-2 pr-1">
        <p className={heading}>My Folders</p>
        <button
          type="button"
          onClick={() => { if (actions.canCreate) setEditing({ mode: 'new', value: '' }); }}
          aria-disabled={!actions.canCreate}
          title={actions.canCreate ? 'Create a folder' : 'You do not have permission to create folders'}
          className={`text-xs inline-flex items-center gap-0.5 ${actions.canCreate ? 'text-blue-600 hover:text-blue-700' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
        >
          <Plus className="w-3.5 h-3.5" />New
        </button>
      </div>
      {/* My Folders scroll; System Folders stay put. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1">
        {editing?.mode === 'new' && nameInput('Folder name...', BASE)}
        {folders === null ? (
          <p className="px-2 py-1.5 text-xs text-gray-400 inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />Loading folders…</p>
        ) : regular.length === 0 && editing?.mode !== 'new' ? (
          <p className="px-2 py-1.5 text-xs text-gray-400">No folders yet.</p>
        ) : regular.map((f, i) => branch(f, 0, i === regular.length - 1, []))}
      </div>
      <p className="shrink-0 mx-1 px-2 pt-1.5 border-t border-gray-100 dark:border-slate-700/60 text-2xs text-gray-500 dark:text-slate-400">Tick a folder to select everyone in it.</p>

      {menu && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed w-48 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 z-[70]"
          style={{ top: menuPos?.top ?? menu.anchor.bottom + MENU_GAP, left: menuPos?.left ?? menu.anchor.right - MENU_WIDTH, visibility: menuPos ? 'visible' : 'hidden' }}
        >
          <button
            type="button"
            role="menuitem"
            aria-disabled={!actions.canUpload}
            title={actions.canUpload ? undefined : 'You do not have permission to upload resumes'}
            onClick={() => { if (!actions.canUpload) return; const id = menu.folder.id; closeMenu(); actions.onUploadTo(id); }}
            className={actions.canUpload ? menuItem : menuItemOff}
          >
            <Upload className={`w-4 h-4 ${actions.canUpload ? 'text-menu-icon-download' : ''}`} />
            <span className={MENU_ITEM_SCALE_CLASS}>Upload to Folder</span>
          </button>
          {(() => {
            const blocked = subfolderBlocked(menu.level);
            return (
              <button
                type="button"
                role="menuitem"
                aria-disabled={!!blocked}
                title={blocked ?? undefined}
                onClick={() => {
                  if (blocked) return;
                  const id = menu.folder.id;
                  closeMenu();
                  expand(id);
                  setEditing({ mode: 'sub', id, value: '' });
                }}
                className={blocked ? menuItemOff : menuItem}
              >
                <Plus className={`w-4 h-4 ${blocked ? '' : 'text-menu-icon-secondary'}`} />
                <span className={MENU_ITEM_SCALE_CLASS}>Create Subfolder</span>
                {blocked && <span className="text-xs text-gray-400 dark:text-slate-600 ml-auto">{actions.canCreate ? '(max depth)' : '(no permission)'}</span>}
              </button>
            );
          })()}
          <button
            type="button"
            role="menuitem"
            aria-disabled={!actions.canRename}
            title={actions.canRename ? undefined : 'You do not have permission to rename folders'}
            onClick={() => {
              if (!actions.canRename) return;
              const { id, name } = menu.folder;
              closeMenu();
              setEditing({ mode: 'rename', id, value: name });
            }}
            className={actions.canRename ? menuItem : menuItemOff}
          >
            <Edit2 className={`w-4 h-4 ${actions.canRename ? 'text-menu-icon-edit' : ''}`} />
            <span className={MENU_ITEM_SCALE_CLASS}>Rename Folder</span>
          </button>
        </div>,
        document.body,
      )}
    </nav>
  );
}
