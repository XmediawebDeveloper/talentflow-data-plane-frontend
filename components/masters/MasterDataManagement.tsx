'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Check, AlertCircle, Clock, GraduationCap, Factory, Sparkles, ArrowUpRight, Loader2 } from 'lucide-react';
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

type MasterDataType = 'experience' | 'education' | 'industry';

interface MasterDataManagementProps {
  type: MasterDataType;
}

interface BaseItem {
  id: number;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

export default function MasterDataManagement({ type }: MasterDataManagementProps) {
  const [items, setItems] = useState<(ExperienceLevel | EducationLevel | IndustryType)[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BaseItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
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

  // Fetch data
  useEffect(() => {
    fetchData();
    setCurrentPage(1);
  }, [type]);

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

      toast.success({ title: 'Item deleted successfully' });
      setShowDeleteConfirm(null);
      fetchData();
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error({ title: 'Failed to delete', description: 'Please try again.' });
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

  return (
    <main className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
      <PageBreadcrumb
        className="mb-4"
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Job Descriptions', href: '/recruitment/job-openings' },
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
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{config.title}</h1>
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

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-brand-blue" />
            <p className="font-medium text-gray-600 dark:text-slate-400">Loading...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Icon className="h-7 w-7 text-brand-blue" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-50">No items found</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">Add your first {config.title.slice(0, -1).toLowerCase()} to get started.</p>
            <button
              onClick={openCreateModal}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <Plus className="h-4 w-4" />
              Add your first item
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/80">
                <tr className="text-left">
                  {config.columns.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500"
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
                      <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">{item.label}</span>
                    </td>
                    <td className="px-4 py-4">
                      <code className="rounded-md bg-brand-blue/[0.06] px-2 py-0.5 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/10">{item.code}</code>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600 dark:text-slate-400">
                      {renderExtraColumn(item)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700 dark:text-slate-300">{item.sort_order}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          item.is_active
                            ? 'bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200'
                        }`}
                      >
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditModal(item)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 transition-[border-color,box-shadow,color,background-color] hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue"
                          aria-label="Edit" title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {showDeleteConfirm === item.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm shadow-red-600/25 transition-all hover:-translate-y-0.5 hover:bg-red-700"
                              aria-label="Confirm delete" title="Confirm delete"
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
                          <button
                            onClick={() => setShowDeleteConfirm(item.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-brand-orange/15 bg-brand-orange/[0.05] text-brand-orange-deep transition-all hover:-translate-y-0.5 hover:bg-brand-orange/[0.1]"
                            aria-label="Delete" title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
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
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md rounded-3xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5 flex flex-col">
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
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">Lower numbers appear first</p>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/50 px-5 py-4 sm:gap-3 shrink-0 rounded-b-3xl">
              <button
                onClick={closeModal}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-all hover:border-gray-300 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
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
      </div>
      </div>
    </main>
  );
}
