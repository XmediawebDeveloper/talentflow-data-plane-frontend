'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Check, AlertCircle, Clock, GraduationCap, Factory } from 'lucide-react';
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
  }, [type]);

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
        <span className="text-gray-600 truncate max-w-[200px] block" title={indItem.description}>
          {indItem.description}
        </span>
      ) : '-';
    }
    return '-';
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <Icon className="w-5 h-5 text-gray-800" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{config.title}</h1>
            <p className="text-sm text-gray-500">{config.description}</p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add New
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-gray-800 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-gray-500">Loading...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <Icon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No items found</p>
            <button
              onClick={openCreateModal}
              className="text-gray-800 hover:text-gray-900 font-medium"
            >
              Add your first item
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {config.columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{item.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{item.code}</code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {renderExtraColumn(item)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.sort_order}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        item.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {showDeleteConfirm === item.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1.5 text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                            title="Confirm delete"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(null)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowDeleteConfirm(item.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {editingItem ? 'Edit' : 'Add New'} {config.title.slice(0, -1)}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Label <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="e.g., 5-7 years"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code <span className="text-gray-400">(optional, auto-generated)</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Auto-generated from label"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                />
              </div>

              {type === 'experience' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min Years
                    </label>
                    <input
                      type="number"
                      value={formData.min_years}
                      onChange={(e) => setFormData({ ...formData, min_years: e.target.value })}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Years
                    </label>
                    <input
                      type="number"
                      value={formData.max_years}
                      onChange={(e) => setFormData({ ...formData, max_years: e.target.value })}
                      placeholder="5"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                    />
                  </div>
                </div>
              )}

              {type === 'education' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Level <span className="text-gray-400">(numeric ranking)</span>
                  </label>
                  <input
                    type="number"
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    placeholder="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                  />
                </div>
              )}

              {type === 'industry' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the industry"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm resize-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sort Order
                </label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Lower numbers appear first</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !formData.label.trim()}
                className="px-4 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin">
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </span>
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {editingItem ? 'Update' : 'Create'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
