'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Check, Power, PowerOff, Clock, GraduationCap, Factory, Sparkles, ArrowUpRight, Loader2, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROW_ACTION_BUTTON_CLASS } from '@/components/ResultRowDetails';
import { toast } from '@/components/ui/enhanced-toast';
import {
  masterDataService,
  ExperienceLevel,
  EducationLevel,
  IndustryType,
  ExperienceLevelCreate,
  EducationLevelCreate,
  IndustryTypeCreate,
} from '@/lib/services';
import ListPagination from '@/components/ListPagination';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { Skeleton } from '@/components/ui/skeleton';

type MasterDataType = 'experience' | 'education' | 'industry';

interface MasterDataManagementProps {
  type: MasterDataType;
  /**
   * Render as the PANEL under a tab rather than as a whole page.
   *
   * The standalone routes (/masters/experience-levels and friends) each show one
   * of these and own the page, so this component brings its own <main>,
   * breadcrumb and gradient hero. The Job Descriptions config page puts all
   * three behind tabs, where that chrome would repeat on every tab.
   *
   * Everything below the heading — the table, pagination, the create/edit modal
   * and the delete confirm — is identical either way, which is the point: the
   * config page manages the same data through the same code as the standalone
   * pages, so the two cannot drift.
   */
  embedded?: boolean;
}

interface BaseItem {
  id: number;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  // Optional to match the master-data service types (ExperienceLevel / EducationLevel
  // declare these optional), whose values are passed to the helpers typed against this.
  created_at?: string;
  updated_at?: string;
}

const typeConfig = {
  experience: {
    title: 'Experience Levels',
    description: 'Manage experience level options for job descriptions',
    icon: Clock,
    columns: ['Label', 'Code', 'Years Range', 'Sort Order', 'Status', 'Actions'],
  },
  education: {
    title: 'Education Levels',
    description: 'Manage education level options for job descriptions',
    icon: GraduationCap,
    columns: ['Label', 'Code', 'Level', 'Sort Order', 'Status', 'Actions'],
  },
  industry: {
    title: 'Industry Types',
    description: 'Manage industry type options for job descriptions',
    icon: Factory,
    columns: ['Label', 'Code', 'Description', 'Sort Order', 'Status', 'Actions'],
  },
};

export default function MasterDataManagement({ type, embedded = false }: MasterDataManagementProps) {
  const [items, setItems] = useState<(ExperienceLevel | EducationLevel | IndustryType)[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BaseItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    label: '',
    min_years: '',
    max_years: '',
    level: '',
    description: '',
    sort_order: '0',
  });

  const config = typeConfig[type];
  const Icon = config.icon;

  // Persist scroll + view state so returning to this master-data page restores
  // the pagination the user left off on. Keyed per master-data type.
  const persistenceKey =
    type === 'education' ? 'masters-education-levels'
    : type === 'experience' ? 'masters-experience-levels'
    : 'masters-industry-types';
  /* Off when embedded. `rootRef` is only attached to the standalone <main>, and
     `getScrollParent(null)` falls back to the document — so an embedded panel
     would restore and track the WHOLE config page's scroll under this key,
     jumping it to whatever offset the standalone route was last left at. The
     page-state persistence below stays on: that is per-list, so both views
     agree on which page of it you are looking at. */
  const rootRef = useScrollRestoration<HTMLElement>(persistenceKey, !loading && !embedded);

  // Fetch data
  useEffect(() => {
    fetchData();
    setCurrentPage(1);
  }, [type]);

  // Declared AFTER the type effect above so, on mount, restore's page value
  // wins over that effect's setCurrentPage(1) reset.
  useListStatePersistence(
    persistenceKey,
    { currentPage, itemsPerPage },
    (s) => {
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
    },
  );

  const paginatedItems = items.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const itemLabel = type === 'industry' ? 'types' : 'levels';

  const fetchData = async () => {
    setLoading(true);
    try {
      if (type === 'experience') {
        const response = await masterDataService.listExperienceLevels(true);
        setItems(response.items);
      } else if (type === 'education') {
        const response = await masterDataService.listEducationLevels(true);
        setItems(response.items);
      } else if (type === 'industry') {
        const response = await masterDataService.listIndustryTypes(true);
        setItems(response.items);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error({ title: 'Failed to load data', description: 'Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      code: '',
      label: '',
      min_years: '',
      max_years: '',
      level: '',
      description: '',
      sort_order: String(items.length + 1),
    });
    setShowModal(true);
  };

  const openEditModal = (item: BaseItem) => {
    setEditingItem(item);
    const experienceItem = item as ExperienceLevel;
    const educationItem = item as EducationLevel;
    const industryItem = item as IndustryType;

    setFormData({
      code: item.code,
      label: item.label,
      min_years: experienceItem.min_years?.toString() || '',
      max_years: experienceItem.max_years?.toString() || '',
      level: educationItem.level?.toString() || '',
      description: industryItem.description || '',
      sort_order: item.sort_order.toString(),
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormData({
      code: '',
      label: '',
      min_years: '',
      max_years: '',
      level: '',
      description: '',
      sort_order: '0',
    });
  };

  const handleSubmit = async () => {
    if (!formData.label.trim()) {
      toast.error({ title: 'Label is required' });
      return;
    }

    const code = formData.code.trim() || formData.label.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    setIsSubmitting(true);
    try {
      if (type === 'experience') {
        const data: ExperienceLevelCreate = {
          code,
          label: formData.label.trim(),
          min_years: formData.min_years ? parseInt(formData.min_years) : undefined,
          max_years: formData.max_years ? parseInt(formData.max_years) : undefined,
          sort_order: parseInt(formData.sort_order) || 0,
        };

        if (editingItem) {
          await masterDataService.updateExperienceLevel(editingItem.id, data);
          toast.success({ title: 'Experience level updated' });
        } else {
          await masterDataService.createExperienceLevel(data);
          toast.success({ title: 'Experience level created' });
        }
      } else if (type === 'education') {
        const data: EducationLevelCreate = {
          code,
          label: formData.label.trim(),
          level: formData.level ? parseInt(formData.level) : undefined,
          sort_order: parseInt(formData.sort_order) || 0,
        };

        if (editingItem) {
          await masterDataService.updateEducationLevel(editingItem.id, data);
          toast.success({ title: 'Education level updated' });
        } else {
          await masterDataService.createEducationLevel(data);
          toast.success({ title: 'Education level created' });
        }
      } else if (type === 'industry') {
        const data: IndustryTypeCreate = {
          code,
          label: formData.label.trim(),
          description: formData.description.trim() || undefined,
          sort_order: parseInt(formData.sort_order) || 0,
        };

        if (editingItem) {
          await masterDataService.updateIndustryType(editingItem.id, data);
          toast.success({ title: 'Industry type updated' });
        } else {
          await masterDataService.createIndustryType(data);
          toast.success({ title: 'Industry type created' });
        }
      }

      closeModal();
      fetchData();
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error({ title: 'Failed to save', description: 'Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      if (type === 'experience') {
        await masterDataService.deleteExperienceLevel(id);
      } else if (type === 'education') {
        await masterDataService.deleteEducationLevel(id);
      } else if (type === 'industry') {
        await masterDataService.deleteIndustryType(id);
      }

      toast.success({ title: 'Item permanently deleted' });
      setShowDeleteConfirm(null);
      // Re-fetch rather than filter the deleted row out locally, so sort order
      // and the pagination total always reflect what the server actually has.
      fetchData();
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error({ title: 'Failed to delete', description: 'Please try again.' });
    }
  };

  // Active <-> Inactive is a status change, not a delete — a separate action so
  // Delete can be a real, permanent removal without losing the ability to
  // park a level without discarding it.
  const handleToggleActive = async (item: BaseItem) => {
    const nextActive = !item.is_active;
    setTogglingId(item.id);
    try {
      if (type === 'experience') {
        await masterDataService.updateExperienceLevel(item.id, { is_active: nextActive });
      } else if (type === 'education') {
        await masterDataService.updateEducationLevel(item.id, { is_active: nextActive });
      } else if (type === 'industry') {
        await masterDataService.updateIndustryType(item.id, { is_active: nextActive });
      }

      toast.success({ title: nextActive ? 'Marked active' : 'Marked inactive' });
      fetchData();
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error({ title: 'Failed to update status', description: 'Please try again.' });
    } finally {
      setTogglingId(null);
    }
  };

  const renderExtraColumn = (item: BaseItem) => {
    if (type === 'experience') {
      const expItem = item as ExperienceLevel;
      if (expItem.min_years !== null || expItem.max_years !== null) {
        return `${expItem.min_years ?? 0} - ${expItem.max_years ?? '+'} years`;
      }
      return '-';
    } else if (type === 'education') {
      const eduItem = item as EducationLevel;
      return eduItem.level?.toString() || '-';
    } else if (type === 'industry') {
      const indItem = item as IndustryType;
      return indItem.description ? (
        <span className="text-gray-600 dark:text-slate-400 truncate max-w-[200px] block" title={indItem.description}>
          {indItem.description}
        </span>
      ) : '-';
    }
    return '-';
  };

  /* The chrome above the table: the full page treatment when this IS the page,
     or a plain panel heading when it is one tab of the config page — where the
     tab already names the section and a hero per tab would be three heroes. */
  const header = embedded ? (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:ring-brand-blue/30">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-slate-50">
            {config.title}
          </h2>
          <p className="mt-0.5 tf-card-desc">{config.description}</p>
        </div>
      </div>
      <button
        onClick={openCreateModal}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors hover:bg-brand-blue-2"
      >
        <Plus className="h-4 w-4" />
        Add New
      </button>
    </div>
  ) : (
    <>
      <PageBreadcrumb
        className="mb-4 md:mb-6"
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Job Descriptions', href: '/recruitment/job-openings' },
          /* These three now hang off the Configuration page rather than off a
             dropdown, so the trail says so — Back from here lands on the hub
             that lists all three, not on the job list. */
          { label: 'Configuration', href: '/recruitment/job-openings/config' },
          { label: type === 'experience' ? 'Experience Levels' : type === 'education' ? 'Education Levels' : 'Industry Types' },
        ]}
      />
      {/* SaaS Hero Header */}
      <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-brand-orange" />
              Master data
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{config.title}</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">{config.description}</p>
              </div>
            </div>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-brand-blue shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <Plus className="h-4 w-4" />
            Add New
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </section>

    </>
  );

  /* Held as an element, NOT wrapped in a locally-defined <Shell> component: a
     component declared inside render is a new type on every render, so React
     would unmount and remount this whole subtree each time — losing the open
     modal, the half-typed form and the scroll position on every keystroke. */
  const body = (
    <>
      {header}
      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
        {loading ? (
          <div className="overflow-x-auto tf-table-shell">
            <table className="w-full">
              <thead className="bg-white">
                <tr className="text-left">
                  {config.columns.map((col) => (
                    <th key={col} className="px-4 py-4 tf-th">
                      <Skeleton className="h-3 w-20" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {Array.from({ length: 7 }).map((_, r) => (
                  <tr key={r}>
                    {config.columns.map((col, c) => (
                      <td key={col} className="px-4 py-4">
                        <Skeleton className={`h-4 ${c === 0 ? 'w-32' : c === config.columns.length - 1 ? 'w-16' : 'w-20'}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Icon className="h-7 w-7 text-brand-blue" />
            </div>
            <h3 className="tf-section-title">No items found</h3>
            <p className="mt-1 tf-body-muted">Add your first {config.title.slice(0, -1).toLowerCase()} to get started.</p>
            <button
              onClick={openCreateModal}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <Plus className="h-4 w-4" />
              Add your first item
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto tf-table-shell">
            <table className="w-full">
              <thead className="bg-white">
                <tr className="text-left">
                  {config.columns.map((col, c) => (
                    <th
                      key={col}
                      /* Actions pinned right: the table is ~1000px wide, so on
                         a phone or tablet Edit / Delete sat off-screen behind a
                         sideways scroll. */
                      className={`px-4 py-4 text-xs font-semibold text-gray-600 dark:text-slate-300 ${c === config.columns.length - 1 ? 'tf-sticky-col w-px text-center lg:text-left !px-2 lg:!px-4' : ''}`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {paginatedItems.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-brand-blue/[0.02]">
                    <td className="px-4 py-4">
                      <span className="tf-cell-name">{item.label}</span>
                    </td>
                    <td className="px-4 py-4">
                      <code className="rounded-md bg-brand-blue/[0.06] px-2 py-0.5 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/10">{item.code}</code>
                    </td>
                    <td className="px-4 py-4 tf-card-desc">
                      {renderExtraColumn(item)}
                    </td>
                    <td className="px-4 py-4 tf-td">{item.sort_order}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium ${
                          item.is_active
                            ? 'bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200'
                        }`}
                      >
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="w-px px-2 lg:px-4 py-4 tf-sticky-col">
                      {/* Desktop (lg+): the Edit / Activate-Deactivate / Delete
                          icon buttons. Phones and tablets: one ⋮ menu with the
                          same three, so the pinned column stays narrow. Delete
                          asks first either way — it swaps in the ✓ / ✕ pair. */}
                      {showDeleteConfirm === item.id ? (
                        <div className="flex items-center justify-center lg:justify-start gap-1">
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-destructive text-white shadow-sm shadow-red-600/25 transition-all hover:-translate-y-0.5 hover:bg-destructive"
                            aria-label="Confirm permanent delete" title="Confirm permanent delete"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(null)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-500 transition-all hover:bg-gray-50 dark:hover:bg-slate-800"
                            aria-label="Cancel" title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                        <div className="hidden lg:flex items-center gap-1.5">
                          <button
                            onClick={() => openEditModal(item)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 transition-[border-color,box-shadow,color,background-color] hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue"
                            aria-label="Edit" title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(item)}
                            disabled={togglingId === item.id}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-[border-color,box-shadow,color,background-color] disabled:cursor-not-allowed disabled:opacity-60 ${
                              item.is_active
                                ? 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 hover:border-gray-300 hover:bg-gray-50'
                                : 'border-brand-teal/20 bg-brand-teal/[0.05] text-brand-teal hover:bg-brand-teal/[0.1]'
                            }`}
                            aria-label={item.is_active ? 'Deactivate' : 'Activate'}
                            title={item.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {togglingId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : item.is_active ? (
                              <PowerOff className="h-4 w-4" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(item.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-brand-orange/15 bg-brand-orange/[0.05] text-brand-orange-deep transition-all hover:-translate-y-0.5 hover:bg-brand-orange/[0.1]"
                            aria-label="Delete permanently" title="Delete permanently"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="lg:hidden flex justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild disabled={togglingId === item.id}>
                            <button type="button" aria-label="Actions" title="Actions" className={`${ROW_ACTION_BUTTON_CLASS} !p-1.5 sm:!p-2.5`}>
                              {togglingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
                            <DropdownMenuItem className="flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer" onSelect={() => openEditModal(item)}>
                              <Edit2 className="h-4 w-4 text-menu-icon-edit" />
                              <span>Edit</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer" onSelect={() => handleToggleActive(item)}>
                              {item.is_active ? (
                                <PowerOff className="h-4 w-4 text-menu-icon-archive" />
                              ) : (
                                <Power className="h-4 w-4 text-menu-icon-activate" />
                              )}
                              <span>{item.is_active ? 'Deactivate' : 'Activate'}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer text-red-600" onSelect={() => setShowDeleteConfirm(item.id)}>
                              <Trash2 className="h-4 w-4 text-red-600" />
                              <span>Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ListPagination
        currentPage={currentPage}
        itemsPerPage={itemsPerPage}
        totalItems={items.length}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={setItemsPerPage}
        itemLabel={itemLabel}
      />

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-[95vw] sm:max-w-md rounded-3xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5 flex flex-col">
            <div className="relative overflow-hidden bg-brand-blue px-5 py-4 text-white shrink-0 rounded-t-3xl">
              <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                    <Icon className="h-5 w-5 text-white" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {editingItem ? 'Edit' : 'Add New'} {config.title.slice(0, -1)}
                    </h3>
                    <p className="mt-0.5 text-sm text-white/75">
                      {editingItem ? 'Update the existing entry.' : 'Create a new master data entry.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto p-5 flex-1">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Label <span className="text-brand-orange">*</span>
                </span>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="e.g., 5-7 years"
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                  autoFocus
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Code <span className="text-gray-400 dark:text-slate-500">(optional, auto-generated)</span>
                </span>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Auto-generated from label"
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                />
              </label>

              {type === 'experience' && (
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Min Years</span>
                    <input
                      type="number"
                      value={formData.min_years}
                      onChange={(e) => setFormData({ ...formData, min_years: e.target.value })}
                      placeholder="0"
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Max Years</span>
                    <input
                      type="number"
                      value={formData.max_years}
                      onChange={(e) => setFormData({ ...formData, max_years: e.target.value })}
                      placeholder="5"
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                    />
                  </label>
                </div>
              )}

              {type === 'education' && (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                    Level <span className="text-gray-400 dark:text-slate-500">(numeric ranking)</span>
                  </span>
                  <input
                    type="number"
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    placeholder="1"
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                  />
                </label>
              )}

              {type === 'industry' && (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Description</span>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the industry"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Sort Order</span>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })}
                  placeholder="0"
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                />
                <p className="mt-1 tf-meta">Lower numbers appear first</p>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/50 px-5 py-4 sm:gap-3 shrink-0 rounded-b-3xl">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !formData.label.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {editingItem ? 'Update' : 'Create'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  /* Embedded, the config page owns the <main> and the card, so this contributes
     only its panel — nesting a second <main> inside one is invalid, and it would
     create a scroll container this component would then pin to. */
  if (embedded) return <div>{body}</div>;

  return (
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">{body}</div>
      </div>
    </main>
  );
}
