'use client';

/**
 * UI Component Reference — one page that renders every shared UI component the
 * app actually imports (see ./inventory.ts), using the components themselves
 * rather than copies. The table, toolbar, filters, sort, pagination, empty
 * states and grid view all run on the component inventory, so each demo is
 * wired the way the real list pages wire it.
 *
 * Lives in the (dashboard) group so it renders inside the app header; open it
 * at /ui-reference (no menu entry). Separate from /style-guide (the older
 * design-token guide), which is left as is.
 * Layout rules for every block: flex-wrap / auto-fit grids, `min-w-0` on every
 * flex child that holds text, and no fixed widths — the page has to hold from a
 * 320px phone to a wide desktop at 100–150% display scaling.
 */

import * as React from 'react';
import {
  Archive,
  Bell,
  Boxes,
  Briefcase,
  CheckCircle2,
  Columns3,
  Download,
  FileSearch,
  FileText,
  Inbox,
  Layers,
  LayoutGrid,
  MoreVertical,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { GroupCheckbox, groupCheckState } from '@/components/ui/group-checkbox';
import { DateField } from '@/components/ui/date-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/searchable-select';
import ToolbarFilterSelect from '@/components/ui/toolbar-filter-select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SelectAllMenu, SortByControl } from '@/components/ui/select-all-menu';
import ToolbarSelectAll from '@/components/ui/toolbar-select-all';
import AppModal from '@/components/ui/app-modal';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { ConfirmationDialog as UiConfirmationDialog } from '@/components/ui/confirmation-dialog';
import LegacyConfirmationDialog from '@/components/ConfirmationDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, InfoTooltip } from '@/components/ui/tooltip';
import ColumnCustomizationModal from '@/components/ColumnCustomizationModal';
import { SortableHeader, ClearSortChip, useTableSort, sortRows, ariaSort } from '@/components/ui/sortable-header';
import ListViewToggle, { type ListDisplayMode } from '@/components/ui/list-view-toggle';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import ListPagination from '@/components/ListPagination';
import LegacyPagination from '@/components/Pagination';
import { MiniPagination } from '@/components/ui/mini-pagination';
import RecordPager from '@/components/RecordPager';
import ListCountBadge from '@/components/ui/list-count-badge';
import QuotaBadge from '@/components/ui/quota-badge';
import NameAvatar from '@/components/ui/name-avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { tabPill, SEGMENT_TOGGLE, segmentBtn } from '@/components/ui/filter-pills';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { PageHeader } from '@/components/ui/page-header';
import ListToolbar from '@/components/ui/list-toolbar';
import ListFilterPanel from '@/components/ui/list-filter-panel';
import FilterChips from '@/components/ui/filter-chips';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import { PageContainer, SurfaceCard, SectionHeading } from '@/components/ui/section-container';
import { toast as enhancedToast } from '@/components/ui/enhanced-toast';
import {
  Skeleton,
  StatsGridSkeleton,
  ToolbarSkeleton,
  TableSkeleton,
  CardGridSkeleton,
  FormSkeleton,
} from '@/components/ui/skeleton';
import { LoadingSpinner, DotsLoader, InlineLoader, ProgressLoader } from '@/components/ui/loading-spinner';
import { EmptyState, SimpleEmptyState } from '@/components/ui/empty-state';
import ListEmptyState from '@/components/ui/list-empty-state';
import TabEmptyState from '@/components/ui/tab-empty-state';
import { cn } from '@/components/ui/utils';

import { INVENTORY, INVENTORY_CATEGORIES, type InventoryRow, type InventoryStatus } from './inventory';

/* ── Page scaffolding ─────────────────────────────────────────────────── */

const NAV = [
  ['buttons', 'Buttons'],
  ['forms', 'Inputs & forms'],
  ['dropdowns', 'Dropdowns'],
  ['popups', 'Popups'],
  ['tables', 'Tables'],
  ['pagination', 'Pagination'],
  ['badges', 'Badges'],
  ['tabs', 'Tabs'],
  ['navigation', 'Breadcrumbs'],
  ['cards', 'Cards'],
  ['toasts', 'Toasts'],
  ['loading', 'Loading'],
  ['empty', 'Empty states'],
] as const;

/** One design category: heading + the surface every demo sits on. */
function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 min-w-0">
      <SectionHeading title={title} description={description} />
      <SurfaceCard className="min-w-0">
        <div className="flex flex-col gap-6 min-w-0">{children}</div>
      </SurfaceCard>
    </section>
  );
}

/** One component inside a section: its name, its file, then the live demo. */
function Demo({ name, path, children }: { name: string; path: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50">{name}</h3>
        <code className="min-w-0 text-xs text-gray-500 dark:text-slate-400 [overflow-wrap:anywhere]">{path}</code>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A wrapping row of controls — never a fixed-width line. */
const Row = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('flex flex-wrap items-center gap-3 min-w-0', className)}>{children}</div>
);

const componentCount = (n: number) => `${n} component${n === 1 ? '' : 's'}`;

const STATUS_BADGE: Record<InventoryStatus, 'success' | 'warning' | 'muted'> = {
  Shared: 'success',
  Duplicated: 'warning',
  'Barely used': 'muted',
};

type SortKey = 'name' | 'category' | 'files' | 'status';
const SORT_LABELS: Record<SortKey, string> = { name: 'Component', category: 'Category', files: 'Files', status: 'Status' };
const COLUMN_OPTIONS = [
  { id: 'path', label: 'Path' },
  { id: 'category', label: 'Category' },
  { id: 'files', label: 'Files' },
  { id: 'status', label: 'Status' },
];

export default function UiReferencePage() {
  const dialog = useGlobalDialog();

  /* ── Inventory list state (table, toolbar, filters, pagination) ── */
  const [search, setSearch] = React.useState('');
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [categoryDraft, setCategoryDraft] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [view, setView] = React.useState<ListDisplayMode>('list');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [columns, setColumns] = React.useState<Record<string, boolean>>({ path: true, category: true, files: true, status: true });
  const [columnsOpen, setColumnsOpen] = React.useState(false);
  const sort = useTableSort<SortKey>({ initialKey: 'name', descFirst: ['files'] });

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return INVENTORY.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)) &&
        (!category || r.category === category) &&
        (!statusFilter || r.status === statusFilter),
    );
  }, [search, category, statusFilter]);
  const sorted = React.useMemo(
    () =>
      sortRows<InventoryRow, SortKey>(filtered, sort.sortKey, sort.sortDir, {
        name: (r) => r.name.toLowerCase(),
        category: (r) => r.category,
        files: (r) => r.files,
        status: (r) => r.status,
      }),
    [filtered, sort.sortKey, sort.sortDir],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  React.useEffect(() => setPage(1), [search, category, statusFilter, pageSize]);

  const isNarrowed = !!search || !!category || !!statusFilter;
  const pageIds = pageRows.map((r) => r.id);
  const pageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const allSelected = selected.size === sorted.length && sorted.length > 0;
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectPage = () => setSelected((prev) => new Set([...prev, ...pageIds]));
  const deselectPage = () => setSelected((prev) => new Set([...prev].filter((id) => !pageIds.includes(id))));
  const selectAll = () => setSelected(new Set(sorted.map((r) => r.id)));
  const clearSelection = () => setSelected(new Set());
  const clearFilters = () => {
    setCategory('');
    setCategoryDraft('');
    setStatusFilter('');
  };

  const categoryOptions = INVENTORY_CATEGORIES.map((c) => ({
    value: c,
    label: c,
    description: componentCount(INVENTORY.filter((r) => r.category === c).length),
  }));
  const statusCounts = (s: InventoryStatus) => INVENTORY.filter((r) => r.status === s).length;

  /* ── Demo-only UI state ── */
  const [loadingBtn, setLoadingBtn] = React.useState(false);
  const [checked, setChecked] = React.useState(true);
  const [switched, setSwitched] = React.useState(true);
  const [date, setDate] = React.useState('');
  const [selectValue, setSelectValue] = React.useState('Buttons');
  const [sortBy, setSortBy] = React.useState<SortKey>('name');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');
  const [modal, setModal] = React.useState<null | 'sm' | 'md' | 'lg' | 'warning' | 'sheet'>(null);
  const [uiConfirmOpen, setUiConfirmOpen] = React.useState(false);
  const [legacyConfirmOpen, setLegacyConfirmOpen] = React.useState(false);
  const [segment, setSegment] = React.useState<'all' | 'shared' | 'duplicated'>('all');
  const [pill, setPill] = React.useState<string>(INVENTORY_CATEGORIES[0]);
  const [miniPage, setMiniPage] = React.useState(1);
  const [legacyPage, setLegacyPage] = React.useState(1);
  const [legacySize, setLegacySize] = React.useState(10);
  const [recordIndex, setRecordIndex] = React.useState(0);
  const [statCard, setStatCard] = React.useState<InventoryStatus | null>(null);

  const record = INVENTORY[recordIndex];
  const categoryGroups = INVENTORY_CATEGORIES.map((c) => ({ c, rows: INVENTORY.filter((r) => r.category === c) }));

  return (
    <div className="min-w-0">
      {/* Sticky section nav — scrolls sideways on its own, never the page. */}
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <div className="flex shrink-0 items-center gap-2 font-semibold text-gray-900 dark:text-slate-50">
            <Boxes className="h-5 w-5 text-brand-blue" />
            <span className="hidden sm:inline">UI Components</span>
          </div>
          <nav aria-label="Sections" className="scrollbar-hide flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <PageContainer className="min-w-0">
        <PageBreadcrumb sticky={false} items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'UI Component Reference' }]} />
        <PageHeader
          title="UI Component Reference"
          description="Every shared UI component the app imports, rendered live. Lists below run on the component inventory itself."
          icon={<Layers className="h-5 w-5" />}
        />

        <div className="flex min-w-0 flex-col gap-8">
          {/* ── Buttons ───────────────────────────────────────── */}
          <Section id="buttons" title="Buttons" description="Three variants, three sizes. Popups size their footers with AppModal's footer classes.">
            <Demo name="Button — variants" path="components/ui/button.tsx">
              <Row>
                <Button variant="primary" icon={<Plus className="h-4 w-4" />}>Create</Button>
                <Button variant="secondary" icon={<Download className="h-4 w-4" />}>Export</Button>
                <Button variant="destructive" icon={<Trash2 className="h-4 w-4" />}>Delete</Button>
                <Button variant="primary" disabled>Disabled</Button>
                <Button
                  variant="primary"
                  loading={loadingBtn}
                  onClick={() => {
                    setLoadingBtn(true);
                    window.setTimeout(() => setLoadingBtn(false), 1500);
                  }}
                >
                  Click to load
                </Button>
              </Row>
            </Demo>
            <Demo name="Button — sizes" path="components/ui/button.tsx">
              <Row>
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} aria-label="Edit">
                  <span className="sr-only">Edit</span>
                </Button>
              </Row>
            </Demo>
            <Demo name="Button — on colour" path="components/ui/button.tsx (tone=&quot;onColor&quot;)">
              <div className="rounded-xl bg-brand-blue p-4">
                <Row>
                  <Button tone="onColor" variant="primary">Primary</Button>
                  <Button tone="onColor" variant="secondary">Secondary</Button>
                </Row>
              </div>
            </Demo>
          </Section>

          {/* ── Inputs & forms ────────────────────────────────── */}
          <Section id="forms" title="Inputs & forms" description="Each field takes its container's width; the grid drops to one column on phones.">
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <Demo name="Input + Label" path="components/ui/input.tsx · label.tsx">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ref-input">Component name</Label>
                  <Input id="ref-input" placeholder="e.g. ListToolbar" />
                </div>
              </Demo>
              <Demo name="DateField" path="components/ui/date-field.tsx">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ref-date">Audit date</Label>
                  <DateField id="ref-date" value={date} onChange={setDate} aria-label="Audit date" />
                </div>
              </Demo>
              <Demo name="Textarea" path="components/ui/textarea.tsx">
                <Textarea placeholder="Notes about this component…" />
              </Demo>
              <Demo name="Checkbox · Switch · GroupCheckbox" path="components/ui/checkbox.tsx · switch.tsx · group-checkbox.tsx">
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                    <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} />
                    Show unused components
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                    <Switch checked={switched} onCheckedChange={setSwitched} />
                    Compact rows
                  </label>
                  <GroupCheckbox
                    state={groupCheckState(allSelected, selected.size)}
                    label="Select all components"
                    onClick={() => (allSelected ? clearSelection() : selectAll())}
                  />
                </div>
              </Demo>
            </div>
          </Section>

          {/* ── Dropdowns ─────────────────────────────────────── */}
          <Section id="dropdowns" title="Dropdowns & selects" description="Filter selects, the Radix select, row menus and selection menus.">
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <Demo name="SearchableSelect" path="components/ui/searchable-select.tsx">
                <SearchableSelect
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions}
                  allLabel="All categories"
                  placeholder="Category"
                  searchPlaceholder="Search categories"
                  ariaLabel="Category"
                />
              </Demo>
              <Demo name="ToolbarFilterSelect" path="components/ui/toolbar-filter-select.tsx">
                <ToolbarFilterSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Status">
                  <option value="">All statuses</option>
                  {(['Shared', 'Duplicated', 'Barely used'] as const).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </ToolbarFilterSelect>
              </Demo>
              <Demo name="Select (Radix)" path="components/ui/select.tsx">
                <Select value={selectValue} onValueChange={setSelectValue}>
                  <SelectTrigger className="w-full" aria-label="Category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Demo>
              <Demo name="DropdownMenu (row ⋯ menu)" path="components/ui/dropdown-menu.tsx">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm" icon={<MoreVertical className="h-4 w-4" />}>
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Row actions</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => toast.info('Edit selected')}>
                      <Pencil className="h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => toast.info('Archive selected')}>
                      <Archive className="h-4 w-4" /> Archive
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => toast.info('Delete selected')}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Demo>
              <Demo name="SelectAllMenu · SortByControl" path="components/ui/select-all-menu.tsx">
                <Row>
                  <SelectAllMenu
                    selectedCount={selected.size}
                    pageCount={pageRows.length}
                    totalCount={sorted.length}
                    noun="components"
                    allSelected={allSelected}
                    pageSelected={pageSelected}
                    onSelectPage={selectPage}
                    onDeselectPage={deselectPage}
                    onSelectAll={selectAll}
                    onClear={clearSelection}
                  />
                  <SortByControl<SortKey>
                    value={sortBy}
                    order={sortOrder}
                    options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({ value: k, label: SORT_LABELS[k] }))}
                    onChange={setSortBy}
                    onToggleOrder={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                  />
                </Row>
              </Demo>
              <Demo name="ToolbarSelectAll" path="components/ui/toolbar-select-all.tsx">
                <ToolbarSelectAll
                  selectedCount={selected.size}
                  allSelected={allSelected}
                  pageCount={pageRows.length}
                  pageSelected={pageSelected}
                  onSelectPage={selectPage}
                  onDeselectPage={deselectPage}
                  totalCount={sorted.length}
                  onSelectAll={selectAll}
                  onClear={clearSelection}
                  itemLabel="components"
                />
              </Demo>
            </div>
          </Section>

          {/* ── Popups ────────────────────────────────────────── */}
          <Section id="popups" title="Popups & overlays" description="AppModal is the standard frame. The others are still in use and listed so they can be compared.">
            <Demo name="AppModal — sizes, warning tone, mobile sheet" path="components/ui/app-modal.tsx">
              <Row>
                <Button variant="secondary" onClick={() => setModal('sm')}>Small (confirm)</Button>
                <Button variant="secondary" onClick={() => setModal('md')}>Medium (form)</Button>
                <Button variant="secondary" onClick={() => setModal('lg')}>Large (wide view)</Button>
                <Button variant="secondary" onClick={() => setModal('warning')}>Warning tone</Button>
                <Button variant="secondary" onClick={() => setModal('sheet')}>Mobile sheet</Button>
              </Row>
            </Demo>
            <Demo name="GlobalDialogProvider (useGlobalDialog)" path="components/providers/GlobalDialogProvider.tsx">
              <Row>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const ok = await dialog.confirm({
                      title: 'Delete component?',
                      message: 'This is the shared confirm used across the app.',
                      variant: 'delete',
                      confirmText: 'Delete',
                    });
                    toast(ok ? 'Confirmed' : 'Cancelled');
                  }}
                >
                  confirm()
                </Button>
                <Button variant="secondary" onClick={() => dialog.showSuccess('Saved', 'The shared success dialog.')}>showSuccess()</Button>
                <Button variant="secondary" onClick={() => dialog.showError('Something went wrong', 'The shared error dialog.')}>showError()</Button>
              </Row>
            </Demo>
            <Demo name="ConfirmationDialog — both copies" path="components/ui/confirmation-dialog.tsx · components/ConfirmationDialog.tsx">
              <Row>
                <Button variant="secondary" onClick={() => setUiConfirmOpen(true)}>ui/confirmation-dialog</Button>
                <Button variant="secondary" onClick={() => setLegacyConfirmOpen(true)}>ConfirmationDialog</Button>
              </Row>
            </Demo>
            <Demo name="Dialog · AlertDialog · Sheet (Radix)" path="components/ui/dialog.tsx · alert-dialog.tsx · sheet.tsx">
              <Row>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="secondary">Dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Dialog</DialogTitle>
                      <DialogDescription>components/ui/dialog.tsx — used by JD Creation and the AI Interview preview.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="secondary">Close</Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="secondary">AlertDialog</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>AlertDialog</AlertDialogTitle>
                      <AlertDialogDescription>components/ui/alert-dialog.tsx — used by the Job Openings delete warning.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="secondary">Sheet</Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Sheet</SheetTitle>
                      <SheetDescription>components/ui/sheet.tsx — the JD list side panel.</SheetDescription>
                    </SheetHeader>
                  </SheetContent>
                </Sheet>
              </Row>
            </Demo>
            <Demo name="Popover · Tooltip · InfoTooltip" path="components/ui/popover.tsx · tooltip.tsx">
              <Row>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="secondary">Popover</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 max-w-[calc(100vw-2rem)] text-sm">
                    Popovers hold small, non-blocking content next to their trigger.
                  </PopoverContent>
                </Popover>
                <Tooltip content="Tooltips explain an icon or a truncated label.">
                  <Button variant="secondary">Hover for tooltip</Button>
                </Tooltip>
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-slate-300">
                  Info tooltip <InfoTooltip content="Inline help beside a label." />
                </span>
              </Row>
            </Demo>
            <Demo name="ColumnCustomizationModal" path="components/ColumnCustomizationModal.tsx">
              <Button variant="secondary" icon={<Columns3 className="h-4 w-4" />} onClick={() => setColumnsOpen(true)}>
                Choose table columns
              </Button>
            </Demo>
          </Section>

          {/* ── Tables (toolbar + filters + table + grid + pagination) ── */}
          <Section id="tables" title="Tables & list toolbar" description="The full list pattern: ListToolbar, filter panel and chips, count badge, view toggle, .tf-table-shell, sortable headers and ListPagination.">
            <Demo name="ListToolbar · ListFilterPanel · FilterChips · ListCountBadge · ListViewToggle" path="components/ui/list-toolbar.tsx · list-filter-panel.tsx · filter-chips.tsx">
              <ListToolbar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search components or paths"
                onToggleFilters={() => setFiltersOpen((o) => !o)}
                filtersOpen={filtersOpen}
                activeFilterCount={(category ? 1 : 0) + (statusFilter ? 1 : 0)}
                filtersApplied={!!category || !!statusFilter}
                onClearFilters={() => {
                  setSearch('');
                  clearFilters();
                }}
                countBadge={<ListCountBadge filtered={sorted.length} total={INVENTORY.length} noun="component" selected={selected.size} />}
                trailing={<ListViewToggle value={view} onChange={setView} />}
                filterPanel={
                  filtersOpen ? (
                    <ListFilterPanel
                      footer={
                        <Row className="justify-end">
                          <Button variant="secondary" size="sm" onClick={clearFilters}>Reset</Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setCategory(categoryDraft);
                              setFiltersOpen(false);
                            }}
                          >
                            Apply
                          </Button>
                        </Row>
                      }
                    >
                      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label>Category</Label>
                          <SearchableSelect value={categoryDraft} onChange={setCategoryDraft} options={categoryOptions} allLabel="All categories" ariaLabel="Category filter" />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label>Status</Label>
                          <ToolbarFilterSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Status filter">
                            <option value="">All statuses</option>
                            {(['Shared', 'Duplicated', 'Barely used'] as const).map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </ToolbarFilterSelect>
                        </div>
                      </div>
                    </ListFilterPanel>
                  ) : null
                }
              />
              <FilterChips
                className="mt-3"
                chips={[
                  ...(category ? [{ key: 'category', label: 'Category', value: category, onRemove: () => { setCategory(''); setCategoryDraft(''); } }] : []),
                  ...(statusFilter ? [{ key: 'status', label: 'Status', value: statusFilter, onRemove: () => setStatusFilter('') }] : []),
                ]}
                onClearAll={clearFilters}
              />
            </Demo>

            <Demo name=".tf-table-shell · SortableHeader · ClearSortChip · ListPagination" path="app/globals.css · components/ui/sortable-header.tsx · components/ListPagination.tsx">
              {sorted.length === 0 ? (
                <ListEmptyState
                  icon={FileSearch}
                  isNarrowed={isNarrowed}
                  query={search}
                  entityLabel="components"
                  emptyTitle="No components yet"
                  onReset={() => {
                    setSearch('');
                    clearFilters();
                  }}
                />
              ) : view === 'list' ? (
                <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
                  <ClearSortChip
                    sort={sort}
                    labels={SORT_LABELS}
                    onClear={() => sort.clearSort?.()}
                    isDefault={sort.sortKey === 'name' && sort.sortDir === 'asc'}
                    className="m-3"
                  />
                  <div className="tf-table-shell">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-600 dark:border-slate-700 dark:text-slate-300">
                          <th className="w-10 px-3 py-3 text-xs font-semibold text-gray-600 dark:text-slate-300">
                            <Checkbox
                              aria-label="Select this page"
                              checked={pageSelected}
                              onCheckedChange={() => (pageSelected ? deselectPage() : selectPage())}
                            />
                          </th>
                          <th className="px-3 py-3 text-xs font-semibold text-gray-600 dark:text-slate-300" aria-sort={ariaSort(sort, 'name')}>
                            <SortableHeader label="Component" column="name" sort={sort} />
                          </th>
                          {columns.path && <th className="px-3 py-3 text-xs font-semibold text-gray-600 dark:text-slate-300">Path</th>}
                          {columns.category && (
                            <th className="px-3 py-3 text-xs font-semibold text-gray-600 dark:text-slate-300" aria-sort={ariaSort(sort, 'category')}>
                              <SortableHeader label="Category" column="category" sort={sort} />
                            </th>
                          )}
                          {columns.files && (
                            <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 dark:text-slate-300" aria-sort={ariaSort(sort, 'files')}>
                              <SortableHeader label="Files" column="files" sort={sort} align="right" />
                            </th>
                          )}
                          {columns.status && (
                            <th className="px-3 py-3 text-xs font-semibold text-gray-600 dark:text-slate-300" aria-sort={ariaSort(sort, 'status')}>
                              <SortableHeader label="Status" column="status" sort={sort} />
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((r) => (
                          <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-brand-blue/[0.03] dark:border-slate-800">
                            <td className="px-3 py-2.5">
                              <Checkbox aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onCheckedChange={() => toggleRow(r.id)} />
                            </td>
                            <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-slate-100">{r.name}</td>
                            {columns.path && <td className="px-3 py-2.5 font-mono text-xs text-gray-500 dark:text-slate-400">{r.path}</td>}
                            {columns.category && <td className="px-3 py-2.5 text-gray-700 dark:text-slate-300">{r.category}</td>}
                            {columns.files && <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-slate-300">{r.files}</td>}
                            {columns.status && (
                              <td className="px-3 py-2.5">
                                <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ListPagination
                    attached
                    minimalOnMobile
                    currentPage={safePage}
                    itemsPerPage={pageSize}
                    totalItems={sorted.length}
                    onPageChange={setPage}
                    onItemsPerPageChange={setPageSize}
                    itemLabel="components"
                    pageSizeOptions={[5, 10, 20, 50]}
                  />
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
                    {pageRows.map((r) => (
                      <div
                        key={r.id}
                        className={cn(
                          'group relative min-w-0 rounded-xl border bg-white p-4 dark:bg-slate-900',
                          gridCardSelectedClass(selected.has(r.id)),
                        )}
                      >
                        <GridCardSelect selected={selected.has(r.id)} onToggle={() => toggleRow(r.id)} label={`Select ${r.name}`} selectionActive={selected.size > 0} />
                        <div className="truncate pr-8 font-medium text-gray-900 dark:text-slate-100">{r.name}</div>
                        <div className="mt-1 truncate font-mono text-xs text-gray-500 dark:text-slate-400" title={r.path}>{r.path}</div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                          <span className="text-xs text-gray-500 dark:text-slate-400">{r.files} files</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <ListPagination
                    currentPage={safePage}
                    itemsPerPage={pageSize}
                    totalItems={sorted.length}
                    onPageChange={setPage}
                    onItemsPerPageChange={setPageSize}
                    itemLabel="components"
                    pageSizeOptions={[5, 10, 20, 50]}
                  />
                </div>
              )}
            </Demo>
          </Section>

          {/* ── Pagination ────────────────────────────────────── */}
          <Section id="pagination" title="Pagination" description="ListPagination is the standard (shown above in the table). The others are still in use.">
            <Demo name="Pagination (legacy, 10/25/50/100)" path="components/Pagination.tsx">
              <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
                <LegacyPagination
                  currentPage={legacyPage}
                  totalPages={Math.max(1, Math.ceil(INVENTORY.length / legacySize))}
                  totalItems={INVENTORY.length}
                  itemsPerPage={legacySize}
                  onPageChange={setLegacyPage}
                  onItemsPerPageChange={(n) => {
                    setLegacySize(n);
                    setLegacyPage(1);
                  }}
                />
              </div>
            </Demo>
            <Demo name="MiniPagination" path="components/ui/mini-pagination.tsx">
              <Row>
                <MiniPagination page={miniPage} totalPages={INVENTORY_CATEGORIES.length} onPageChange={setMiniPage} />
                <MiniPagination page={miniPage} totalPages={INVENTORY_CATEGORIES.length} onPageChange={setMiniPage} showEnds />
                <span className="text-sm text-gray-600 dark:text-slate-400">{INVENTORY_CATEGORIES[miniPage - 1]}</span>
              </Row>
            </Demo>
            <Demo name="RecordPager (Previous / Next record)" path="components/RecordPager.tsx">
              <Row className="justify-between">
                <span className="min-w-0 text-sm text-gray-700 dark:text-slate-300 [overflow-wrap:anywhere]">
                  <span className="font-medium">{record.name}</span> — {record.path}
                </span>
                <RecordPager
                  currentIndex={recordIndex}
                  totalCount={INVENTORY.length}
                  onPrev={() => setRecordIndex((i) => Math.max(0, i - 1))}
                  onNext={() => setRecordIndex((i) => Math.min(INVENTORY.length - 1, i + 1))}
                />
              </Row>
            </Demo>
          </Section>

          {/* ── Badges ────────────────────────────────────────── */}
          <Section id="badges" title="Badges & avatars">
            <Demo name="Badge — variants" path="components/ui/badge.tsx">
              <Row>
                {(['default', 'secondary', 'success', 'warning', 'info', 'destructive', 'outline', 'muted'] as const).map((v) => (
                  <Badge key={v} variant={v}>
                    {v}
                  </Badge>
                ))}
              </Row>
            </Demo>
            <Demo name="ListCountBadge · QuotaBadge" path="components/ui/list-count-badge.tsx · quota-badge.tsx">
              <Row>
                <ListCountBadge filtered={sorted.length} total={INVENTORY.length} noun="component" selected={selected.size} />
                <QuotaBadge label="Shared" availableUnits={statusCounts('Shared')} totalUnits={INVENTORY.length} icon={CheckCircle2} unitLabel="components" />
              </Row>
            </Demo>
            <Demo name="NameAvatar — sizes" path="components/ui/name-avatar.tsx">
              <Row>
                {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((s) => (
                  <NameAvatar key={s} name="TalentFlow" size={s} />
                ))}
              </Row>
            </Demo>
          </Section>

          {/* ── Tabs ──────────────────────────────────────────── */}
          <Section id="tabs" title="Tabs" description="The Radix tabs, the tab-pill row and the segmented toggle.">
            <Demo name="Tabs (Radix)" path="components/ui/tabs.tsx">
              <Tabs defaultValue="Shared" className="min-w-0">
                <TabsList className="max-w-full flex-wrap h-auto">
                  {(['Shared', 'Duplicated', 'Barely used'] as const).map((s) => (
                    <TabsTrigger key={s} value={s}>
                      {s} ({statusCounts(s)})
                    </TabsTrigger>
                  ))}
                </TabsList>
                {(['Shared', 'Duplicated', 'Barely used'] as const).map((s) => (
                  <TabsContent key={s} value={s} className="text-sm text-gray-600 dark:text-slate-400 [overflow-wrap:anywhere]">
                    {INVENTORY.filter((r) => r.status === s).map((r) => r.name).join(' · ')}
                  </TabsContent>
                ))}
              </Tabs>
            </Demo>
            <Demo name="tabPill" path="components/ui/filter-pills.ts">
              <Row className="gap-2">
                {INVENTORY_CATEGORIES.map((c) => (
                  <button key={c} type="button" className={tabPill(pill === c)} onClick={() => setPill(c)} aria-pressed={pill === c}>
                    {c}
                  </button>
                ))}
              </Row>
            </Demo>
            <Demo name="SEGMENT_TOGGLE / segmentBtn" path="components/ui/filter-pills.ts">
              <div className={cn(SEGMENT_TOGGLE, 'w-fit max-w-full flex-wrap')}>
                {(['all', 'shared', 'duplicated'] as const).map((s) => (
                  <button key={s} type="button" className={segmentBtn(segment === s)} onClick={() => setSegment(s)} aria-pressed={segment === s}>
                    {s === 'all' ? 'All' : s === 'shared' ? 'Shared' : 'Duplicated'}
                  </button>
                ))}
              </div>
            </Demo>
          </Section>

          {/* ── Breadcrumbs & page header ─────────────────────── */}
          <Section id="navigation" title="Breadcrumbs & page header" description="PageBreadcrumb is the bar at the top of this page; here with the record pager in its actions slot.">
            <Demo name="PageBreadcrumb (with actions)" path="components/PageBreadcrumb.tsx">
              <PageBreadcrumb
                sticky={false}
                className=""
                items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'UI Component Reference', href: '#navigation' }, { label: record.name }]}
                actions={
                  <RecordPager
                    iconOnly
                    currentIndex={recordIndex}
                    totalCount={INVENTORY.length}
                    onPrev={() => setRecordIndex((i) => Math.max(0, i - 1))}
                    onNext={() => setRecordIndex((i) => Math.min(INVENTORY.length - 1, i + 1))}
                  />
                }
              />
            </Demo>
            <Demo name="PageHeader (with actions)" path="components/ui/page-header.tsx">
              <PageHeader
                title="Job Openings"
                description="Page title, one-line description and the page's primary actions."
                icon={<Briefcase className="h-5 w-5" />}
                actions={
                  <>
                    <Button variant="secondary" icon={<Download className="h-4 w-4" />}>Export</Button>
                    <Button icon={<Plus className="h-4 w-4" />}>Create JD</Button>
                  </>
                }
              />
            </Demo>
          </Section>

          {/* ── Cards ─────────────────────────────────────────── */}
          <Section id="cards" title="Cards" description="StatsCard KPI row (counts from the inventory), the shadcn Card and SurfaceCard.">
            <Demo name="StatsCard · StatsCardGrid" path="components/ui/stats-card.tsx">
              <StatsCardGrid columns={4}>
                <StatsCard label="Components" value={INVENTORY.length} icon={Boxes} tone="blue" onClick={() => setStatCard(null)} active={statCard === null} />
                <StatsCard label="Shared" value={statusCounts('Shared')} icon={CheckCircle2} tone="emerald" onClick={() => setStatCard('Shared')} active={statCard === 'Shared'} />
                <StatsCard label="Duplicated" value={statusCounts('Duplicated')} icon={Layers} tone="orange" onClick={() => setStatCard('Duplicated')} active={statCard === 'Duplicated'} />
                <StatsCard label="Barely used" value={statusCounts('Barely used')} icon={Inbox} tone="neutral" onClick={() => setStatCard('Barely used')} active={statCard === 'Barely used'} />
              </StatsCardGrid>
              <StatsCardGrid columns={4} className="mt-3">
                <StatsCard label="Loading state" value={0} icon={Users} loading />
              </StatsCardGrid>
            </Demo>
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <Demo name="Card" path="components/ui/card.tsx">
                <Card>
                  <CardHeader>
                    <CardTitle>Buttons</CardTitle>
                    <CardDescription>{componentCount(categoryGroups.find((g) => g.c === 'Buttons')?.rows.length ?? 0)}</CardDescription>
                    <CardAction>
                      <Badge variant="success">Shared</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-600 dark:text-slate-400">Card header, action, content and footer slots.</CardContent>
                  <CardFooter>
                    <Button size="sm" variant="secondary">Open</Button>
                  </CardFooter>
                </Card>
              </Demo>
              <Demo name="SurfaceCard" path="components/ui/section-container.tsx">
                <SurfaceCard>
                  <div className="text-sm text-gray-600 dark:text-slate-400">The plain panel every section on this page sits on.</div>
                </SurfaceCard>
              </Demo>
            </div>
          </Section>

          {/* ── Toasts ────────────────────────────────────────── */}
          <Section id="toasts" title="Toasts" description="sonner's toast (mounted once in app/layout.tsx) and the enhanced-toast wrapper.">
            <Demo name="toast (sonner)" path="sonner · app/layout.tsx">
              <Row>
                <Button variant="secondary" onClick={() => toast.success('Saved')}>Success</Button>
                <Button variant="secondary" onClick={() => toast.error('Could not save')}>Error</Button>
                <Button variant="secondary" onClick={() => toast.warning('Check the highlighted fields')}>Warning</Button>
                <Button variant="secondary" onClick={() => toast.info('Export started')}>Info</Button>
              </Row>
            </Demo>
            <Demo name="enhanced-toast" path="components/ui/enhanced-toast.tsx">
              <Row>
                <Button variant="secondary" icon={<Bell className="h-4 w-4" />} onClick={() => enhancedToast.success({ title: 'Saved', description: 'With a title and a description.' })}>
                  Success
                </Button>
                <Button variant="secondary" onClick={() => enhancedToast.error({ title: 'Could not save', description: 'Try again in a moment.' })}>Error</Button>
                <Button variant="secondary" onClick={() => enhancedToast.info({ title: 'Heads up', description: 'An informational toast.' })}>Info</Button>
              </Row>
            </Demo>
          </Section>

          {/* ── Loading ───────────────────────────────────────── */}
          <Section id="loading" title="Loading states" description="Skeletons for first paint, spinners for in-place waits.">
            <Demo name="Skeleton presets" path="components/ui/skeleton.tsx">
              <div className="flex min-w-0 flex-col gap-4">
                <StatsGridSkeleton />
                <ToolbarSkeleton />
                <TableSkeleton />
              </div>
            </Demo>
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <Demo name="CardGridSkeleton" path="components/ui/skeleton.tsx">
                <CardGridSkeleton />
              </Demo>
              <Demo name="FormSkeleton · Skeleton" path="components/ui/skeleton.tsx">
                <FormSkeleton />
                <Skeleton className="mt-4 h-4 w-2/3" />
              </Demo>
            </div>
            <Demo name="LoadingSpinner family" path="components/ui/loading-spinner.tsx">
              <Row className="gap-6">
                <LoadingSpinner size="sm" />
                <LoadingSpinner size="md" />
                <LoadingSpinner size="lg" />
                <DotsLoader />
                <InlineLoader />
                <div className="w-full sm:w-64">
                  <ProgressLoader progress={60} label="Uploading" />
                </div>
              </Row>
            </Demo>
          </Section>

          {/* ── Empty states ──────────────────────────────────── */}
          <Section id="empty" title="Empty states" description="Three shared variants — full page, list and tab.">
            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
              <Demo name="EmptyState" path="components/ui/empty-state.tsx">
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                  <EmptyState icon={FileText} title="No job descriptions yet" description="Create your first job description to start." action={{ label: 'Create JD', onClick: () => toast.info('Create JD') }} />
                </div>
              </Demo>
              <Demo name="SimpleEmptyState" path="components/ui/empty-state.tsx">
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                  <SimpleEmptyState />
                </div>
              </Demo>
              <Demo name="ListEmptyState (search narrowed)" path="components/ui/list-empty-state.tsx">
                <ListEmptyState icon={FileSearch} isNarrowed query="zzz" entityLabel="components" emptyTitle="No components yet" onReset={() => toast.info('Reset')} />
              </Demo>
              <Demo name="TabEmptyState" path="components/ui/tab-empty-state.tsx">
                <TabEmptyState icon={Sparkles} title="No results yet" description="Results appear here once candidates finish." bordered />
              </Demo>
            </div>
          </Section>
        </div>
      </PageContainer>

      {/* ── Overlays rendered at the root ── */}
      <AppModal
        open={modal === 'sm' || modal === 'md' || modal === 'lg' || modal === 'warning' || modal === 'sheet'}
        onCancel={() => setModal(null)}
        size={modal === 'md' || modal === 'sheet' ? 'md' : modal === 'lg' ? 'lg' : 'sm'}
        tone={modal === 'warning' ? 'warning' : 'brand'}
        mobileSheet={modal === 'sheet'}
        icon={<LayoutGrid className="h-5 w-5" />}
        title={modal === 'warning' ? 'Leave without saving?' : `AppModal — ${modal === 'sheet' ? 'mobile sheet' : modal}`}
        subtitle="components/ui/app-modal.tsx"
        actions={[{ label: modal === 'warning' ? 'Leave' : 'Save', onClick: () => setModal(null) }]}
      >
        {modal === 'md' || modal === 'sheet' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="modal-name">Name</Label>
              <Input id="modal-name" placeholder="Component name" />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>Category</Label>
              <SearchableSelect value={categoryDraft} onChange={setCategoryDraft} options={categoryOptions} allLabel="All categories" ariaLabel="Category" />
            </div>
          </div>
        ) : modal === 'lg' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-3">
            {categoryGroups.map(({ c, rows }) => (
              <div key={c} className="min-w-0 rounded-lg border border-gray-200 p-3 dark:border-slate-700">
                <div className="text-sm font-medium text-gray-900 dark:text-slate-100">{c}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">{componentCount(rows.length)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {modal === 'warning' ? 'Your changes will be lost.' : 'Confirm, delete and other short prompts use the small size.'}
          </p>
        )}
      </AppModal>

      <UiConfirmationDialog
        isOpen={uiConfirmOpen}
        onClose={() => setUiConfirmOpen(false)}
        onConfirm={() => toast('Confirmed')}
        title="Delete component?"
        description="components/ui/confirmation-dialog.tsx"
        confirmText="Delete"
        variant="danger"
      />
      <LegacyConfirmationDialog
        isOpen={legacyConfirmOpen}
        title="Delete component?"
        message="components/ConfirmationDialog.tsx"
        type="danger"
        confirmText="Delete"
        onConfirm={() => {
          setLegacyConfirmOpen(false);
          toast('Confirmed');
        }}
        onCancel={() => setLegacyConfirmOpen(false)}
      />
      {columnsOpen && (
        <ColumnCustomizationModal
          columns={COLUMN_OPTIONS.map((c) => ({ ...c, enabled: columns[c.id] }))}
          onClose={() => setColumnsOpen(false)}
          onApply={(ids) => {
            setColumns(Object.fromEntries(COLUMN_OPTIONS.map((c) => [c.id, ids.includes(c.id)])));
            setColumnsOpen(false);
          }}
        />
      )}
    </div>
  );
}
