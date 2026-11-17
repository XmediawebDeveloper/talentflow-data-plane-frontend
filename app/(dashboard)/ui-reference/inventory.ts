/**
 * The shared-component inventory (audit of 2026-10-26): every shared UI
 * component the app imports, where it lives, and how many files import it.
 * The reference page's table, filters, sort and pagination run on THIS list,
 * so the demos exercise real project data rather than invented records.
 *
 * `files` is the importer count from that audit — re-run the audit and update
 * it here when a component gains or loses callers.
 */

export type InventoryCategory =
  | 'Buttons'
  | 'Forms'
  | 'Dropdowns'
  | 'Popups'
  | 'Tables'
  | 'Pagination'
  | 'Badges'
  | 'Tabs'
  | 'Navigation'
  | 'Toolbars'
  | 'Cards'
  | 'Toasts'
  | 'Loading'
  | 'Empty states';

export type InventoryStatus = 'Shared' | 'Duplicated' | 'Barely used';

export interface InventoryRow {
  id: string;
  name: string;
  path: string;
  category: InventoryCategory;
  files: number;
  status: InventoryStatus;
}

export const INVENTORY: InventoryRow[] = [
  { id: 'button', name: 'Button', path: 'components/ui/button.tsx', category: 'Buttons', files: 154, status: 'Shared' },
  { id: 'input', name: 'Input', path: 'components/ui/input.tsx', category: 'Forms', files: 14, status: 'Barely used' },
  { id: 'textarea', name: 'Textarea', path: 'components/ui/textarea.tsx', category: 'Forms', files: 5, status: 'Barely used' },
  { id: 'label', name: 'Label', path: 'components/ui/label.tsx', category: 'Forms', files: 9, status: 'Barely used' },
  { id: 'checkbox', name: 'Checkbox', path: 'components/ui/checkbox.tsx', category: 'Forms', files: 4, status: 'Barely used' },
  { id: 'group-checkbox', name: 'GroupCheckbox', path: 'components/ui/group-checkbox.tsx', category: 'Forms', files: 2, status: 'Barely used' },
  { id: 'date-field', name: 'DateField', path: 'components/ui/date-field.tsx', category: 'Forms', files: 32, status: 'Shared' },
  { id: 'searchable-select', name: 'SearchableSelect', path: 'components/ui/searchable-select.tsx', category: 'Dropdowns', files: 12, status: 'Shared' },
  { id: 'toolbar-filter-select', name: 'ToolbarFilterSelect', path: 'components/ui/toolbar-filter-select.tsx', category: 'Dropdowns', files: 5, status: 'Shared' },
  { id: 'select', name: 'Select', path: 'components/ui/select.tsx', category: 'Dropdowns', files: 2, status: 'Barely used' },
  { id: 'dropdown-menu', name: 'DropdownMenu', path: 'components/ui/dropdown-menu.tsx', category: 'Dropdowns', files: 23, status: 'Shared' },
  { id: 'select-all-menu', name: 'SelectAllMenu', path: 'components/ui/select-all-menu.tsx', category: 'Dropdowns', files: 6, status: 'Shared' },
  { id: 'toolbar-select-all', name: 'ToolbarSelectAll', path: 'components/ui/toolbar-select-all.tsx', category: 'Dropdowns', files: 6, status: 'Shared' },
  { id: 'app-modal', name: 'AppModal', path: 'components/ui/app-modal.tsx', category: 'Popups', files: 23, status: 'Shared' },
  { id: 'global-dialog', name: 'GlobalDialogProvider', path: 'components/providers/GlobalDialogProvider.tsx', category: 'Popups', files: 20, status: 'Shared' },
  { id: 'confirmation-dialog-ui', name: 'ConfirmationDialog (ui)', path: 'components/ui/confirmation-dialog.tsx', category: 'Popups', files: 8, status: 'Duplicated' },
  { id: 'confirmation-dialog', name: 'ConfirmationDialog', path: 'components/ConfirmationDialog.tsx', category: 'Popups', files: 2, status: 'Duplicated' },
  { id: 'dialog', name: 'Dialog', path: 'components/ui/dialog.tsx', category: 'Popups', files: 9, status: 'Shared' },
  { id: 'alert-dialog', name: 'AlertDialog', path: 'components/ui/alert-dialog.tsx', category: 'Popups', files: 6, status: 'Shared' },
  { id: 'sheet', name: 'Sheet', path: 'components/ui/sheet.tsx', category: 'Popups', files: 3, status: 'Barely used' },
  { id: 'popover', name: 'Popover', path: 'components/ui/popover.tsx', category: 'Popups', files: 7, status: 'Shared' },
  { id: 'tooltip', name: 'Tooltip', path: 'components/ui/tooltip.tsx', category: 'Popups', files: 18, status: 'Shared' },
  { id: 'column-modal', name: 'ColumnCustomizationModal', path: 'components/ColumnCustomizationModal.tsx', category: 'Popups', files: 3, status: 'Shared' },
  { id: 'table-shell', name: '.tf-table-shell', path: 'app/globals.css', category: 'Tables', files: 73, status: 'Shared' },
  { id: 'sortable-header', name: 'SortableHeader', path: 'components/ui/sortable-header.tsx', category: 'Tables', files: 7, status: 'Shared' },
  { id: 'list-view-toggle', name: 'ListViewToggle', path: 'components/ui/list-view-toggle.tsx', category: 'Tables', files: 16, status: 'Shared' },
  { id: 'grid-card-select', name: 'GridCardSelect', path: 'components/ui/grid-card-select.tsx', category: 'Tables', files: 12, status: 'Shared' },
  { id: 'list-pagination', name: 'ListPagination', path: 'components/ListPagination.tsx', category: 'Pagination', files: 32, status: 'Shared' },
  { id: 'pagination', name: 'Pagination', path: 'components/Pagination.tsx', category: 'Pagination', files: 5, status: 'Duplicated' },
  { id: 'mini-pagination', name: 'MiniPagination', path: 'components/ui/mini-pagination.tsx', category: 'Pagination', files: 1, status: 'Barely used' },
  { id: 'record-pager', name: 'RecordPager', path: 'components/RecordPager.tsx', category: 'Pagination', files: 12, status: 'Shared' },
  { id: 'badge', name: 'Badge', path: 'components/ui/badge.tsx', category: 'Badges', files: 54, status: 'Shared' },
  { id: 'list-count-badge', name: 'ListCountBadge', path: 'components/ui/list-count-badge.tsx', category: 'Badges', files: 8, status: 'Shared' },
  { id: 'quota-badge', name: 'QuotaBadge', path: 'components/ui/quota-badge.tsx', category: 'Badges', files: 3, status: 'Shared' },
  { id: 'name-avatar', name: 'NameAvatar', path: 'components/ui/name-avatar.tsx', category: 'Badges', files: 34, status: 'Shared' },
  { id: 'tabs', name: 'Tabs', path: 'components/ui/tabs.tsx', category: 'Tabs', files: 2, status: 'Barely used' },
  { id: 'filter-pills', name: 'tabPill / segmentBtn', path: 'components/ui/filter-pills.ts', category: 'Tabs', files: 11, status: 'Shared' },
  { id: 'page-breadcrumb', name: 'PageBreadcrumb', path: 'components/PageBreadcrumb.tsx', category: 'Navigation', files: 60, status: 'Shared' },
  { id: 'page-header', name: 'PageHeader', path: 'components/ui/page-header.tsx', category: 'Navigation', files: 15, status: 'Shared' },
  { id: 'list-toolbar', name: 'ListToolbar', path: 'components/ui/list-toolbar.tsx', category: 'Toolbars', files: 16, status: 'Shared' },
  { id: 'list-filter-panel', name: 'ListFilterPanel', path: 'components/ui/list-filter-panel.tsx', category: 'Toolbars', files: 4, status: 'Shared' },
  { id: 'filter-chips', name: 'FilterChips', path: 'components/ui/filter-chips.tsx', category: 'Toolbars', files: 2, status: 'Shared' },
  { id: 'stats-card', name: 'StatsCard', path: 'components/ui/stats-card.tsx', category: 'Cards', files: 11, status: 'Shared' },
  { id: 'card', name: 'Card', path: 'components/ui/card.tsx', category: 'Cards', files: 8, status: 'Barely used' },
  { id: 'section-container', name: 'SurfaceCard / SectionHeading', path: 'components/ui/section-container.tsx', category: 'Cards', files: 2, status: 'Barely used' },
  { id: 'sonner', name: 'toast (sonner)', path: 'app/layout.tsx', category: 'Toasts', files: 149, status: 'Shared' },
  { id: 'enhanced-toast', name: 'enhanced-toast', path: 'components/ui/enhanced-toast.tsx', category: 'Toasts', files: 11, status: 'Duplicated' },
  { id: 'skeleton', name: 'Skeleton', path: 'components/ui/skeleton.tsx', category: 'Loading', files: 119, status: 'Shared' },
  { id: 'loading-spinner', name: 'LoadingSpinner', path: 'components/ui/loading-spinner.tsx', category: 'Loading', files: 1, status: 'Barely used' },
  { id: 'empty-state', name: 'EmptyState', path: 'components/ui/empty-state.tsx', category: 'Empty states', files: 10, status: 'Duplicated' },
  { id: 'list-empty-state', name: 'ListEmptyState', path: 'components/ui/list-empty-state.tsx', category: 'Empty states', files: 9, status: 'Duplicated' },
  { id: 'tab-empty-state', name: 'TabEmptyState', path: 'components/ui/tab-empty-state.tsx', category: 'Empty states', files: 6, status: 'Duplicated' },
];

export const INVENTORY_CATEGORIES: InventoryCategory[] = Array.from(new Set(INVENTORY.map((r) => r.category)));
