import { X, Save, AlertCircle, Clock, FileText, Award, Plus, Trash2, Edit2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { assessmentService } from '@/lib/services';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import UnsavedChangesModal from '@/components/UnsavedChangesModal';
import { Button } from '@/components/ui/button';
import FilterSelect from '@/components/ui/filter-select';

interface AssessmentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: any;
  onSave: (updatedAssessment: any) => void;
}

export default function AssessmentEditModal({ isOpen, onClose, assessment, onSave }: AssessmentEditModalProps) {
  const dialog = useGlobalDialog();
  const [editedAssessment, setEditedAssessment] = useState({
    ...assessment,
    sections: assessment.sections || []
  });
  // Snapshot of what was loaded, taken once on mount, so Cancel/X can tell
  // an untouched draft (just close) from an edited one (ask Save/Discard).
  const initialAssessmentRef = useRef(editedAssessment);

  const [errors, setErrors] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  if (!isOpen) return null;

  const isDirty = JSON.stringify(editedAssessment) !== JSON.stringify(initialAssessmentRef.current);

  const handleCloseAttempt = () => {
    if (isDirty) {
      setShowUnsavedModal(true);
    } else {
      onClose();
    }
  };

  const handleSave = async (saveAsDraft: boolean = false) => {
    const newErrors: any = {};

    if (!editedAssessment.title?.trim()) {
      newErrors.title = 'Title is required';
    }

    // Duration can be string like "30 min" or number like 30
    const durationValue = editedAssessment.duration;
    if (!durationValue && durationValue !== 0) {
      newErrors.duration = 'Duration is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSaving(true);
    try {
      // Map status to API format
      const statusMap: { [key: string]: string } = {
        'Draft': 'draft',
        'Active': 'published',
        'Completed': 'closed',
        'Archived': 'archived'
      };

      // Determine the status to save
      const statusToSave = saveAsDraft ? 'Draft' : editedAssessment.status;

      // Parse duration - extract number from string like "30 min"
      let durationMinutes = 30;
      if (typeof durationValue === 'number') {
        durationMinutes = durationValue;
      } else if (typeof durationValue === 'string') {
        const match = durationValue.match(/(\d+)/);
        if (match) {
          durationMinutes = parseInt(match[1], 10);
        }
      }

      // Build update data - only include fields that have values
      const updateData: any = {
        title: editedAssessment.title,
        duration_minutes: durationMinutes,
      };

      // Only include optional fields if they have values
      if (editedAssessment.description !== undefined) {
        updateData.description = editedAssessment.description;
      }
      if (editedAssessment.hr_enabled !== undefined) {
        updateData.hr_enabled = editedAssessment.hr_enabled;
      }
      if (editedAssessment.hr_percentage !== undefined) {
        updateData.hr_percentage = editedAssessment.hr_percentage;
      }
      if (editedAssessment.technical_enabled !== undefined) {
        updateData.technical_enabled = editedAssessment.technical_enabled;
      }
      if (editedAssessment.technical_percentage !== undefined) {
        updateData.technical_percentage = editedAssessment.technical_percentage;
      }
      if (editedAssessment.coding_enabled !== undefined) {
        updateData.coding_enabled = editedAssessment.coding_enabled;
      }
      if (editedAssessment.coding_percentage !== undefined) {
        updateData.coding_percentage = editedAssessment.coding_percentage;
      }
      if (editedAssessment.proctoring_enabled !== undefined) {
        updateData.proctoring_enabled = editedAssessment.proctoring_enabled;
      }

      // Include status
      if (statusToSave) {
        updateData.status = statusMap[statusToSave] || statusToSave.toLowerCase();
      }

      console.log('[AssessmentEditModal] Saving assessment:', assessment.id, updateData);
      const result = await assessmentService.update(assessment.id, updateData);
      console.log('[AssessmentEditModal] Save successful:', result);

      onSave({ ...editedAssessment, status: statusToSave });
      onClose();
    } catch (error) {
      console.error('Failed to update assessment:', error);
      toast.error(`Couldn't update assessment. ${friendlyErrorMessage(error, 'Please try again.')}`);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSection = (index: number, field: string, value: any) => {
    const updatedSections = [...editedAssessment.sections];
    updatedSections[index] = {
      ...updatedSections[index],
      [field]: value
    };
    setEditedAssessment({
      ...editedAssessment,
      sections: updatedSections
    });
  };

  const deleteSection = async (index: number) => {
    if (await dialog.confirm({ title: 'Delete Section', message: 'Are you sure you want to delete this section?', variant: 'warning', confirmText: 'Delete' })) {
      const updatedSections = editedAssessment.sections.filter((_: any, i: number) => i !== index);
      setEditedAssessment({
        ...editedAssessment,
        sections: updatedSections
      });
    }
  };

  const addSection = () => {
    setEditedAssessment({
      ...editedAssessment,
      sections: [
        ...editedAssessment.sections,
        {
          name: 'New Section',
          percentage: 0,
          questionCount: 5,
          description: ''
        }
      ]
    });
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-4xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
              <Edit2 className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight truncate">Edit Assessment</h2>
              <p className="text-gray-600 dark:text-slate-400 text-sm">
                Modify assessment details and configuration
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCloseAttempt}
            className="px-2 flex-shrink-0"
            aria-label="Close">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6">
          {/* Basic Information */}
          <div className="mb-6">
            <h3 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 tracking-tight mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-blue flex-shrink-0" />
              Basic Information
            </h3>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm text-gray-700 dark:text-slate-300 mb-2">
                  Assessment Title <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={editedAssessment.title}
                  onChange={(e) => {
                    setEditedAssessment({ ...editedAssessment, title: e.target.value });
                    setErrors({ ...errors, title: null });
                  }}
                  className={`w-full min-w-0 h-[38px] px-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue ${
                    errors.title ? 'border-destructive' : 'border-gray-200 dark:border-slate-700'
                  }`}
                  placeholder="e.g., Senior Software Engineer Technical Assessment"
                />
                {errors.title && (
                  <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {errors.title}
                  </p>
                )}
              </div>

              {/* Duration and Questions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 dark:text-slate-300 mb-2">
                    Duration <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={editedAssessment.duration}
                      onChange={(e) => {
                        setEditedAssessment({ ...editedAssessment, duration: e.target.value });
                        setErrors({ ...errors, duration: null });
                      }}
                      className={`w-full min-w-0 h-[38px] pl-9 pr-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue ${
                        errors.duration ? 'border-destructive' : 'border-gray-200 dark:border-slate-700'
                      }`}
                      placeholder="e.g., 60 min"
                    />
                  </div>
                  {errors.duration && (
                    <p className="text-sm text-destructive mt-1">{errors.duration}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-700 dark:text-slate-300 mb-2">
                    Total Questions
                  </label>
                  <input
                    type="number"
                    value={editedAssessment.questions}
                    onChange={(e) => setEditedAssessment({ ...editedAssessment, questions: parseInt(e.target.value) || 0 })}
                    className="w-full min-w-0 h-[38px] px-3 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                    placeholder="e.g., 25"
                  />
                </div>
              </div>

              {/* Type and Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 dark:text-slate-300 mb-2">Type</label>
                  <FilterSelect
                    value={editedAssessment.type}
                    onChange={(v) => setEditedAssessment({ ...editedAssessment, type: v })}
                    ariaLabel="Type"
                    options={[
                      { value: 'Technical', label: 'Technical' },
                      { value: 'Behavioral', label: 'Behavioral' },
                      { value: 'Coding', label: 'Coding' },
                      { value: 'Aptitude', label: 'Aptitude' },
                      { value: 'Mixed', label: 'Mixed' },
                    ]}
                    className="w-full sm:w-full min-w-0 data-[size=default]:h-[38px] sm:data-[size=default]:h-[38px] py-0 sm:py-0 pl-3 sm:pl-3 pr-3 sm:pr-3 rounded-lg sm:rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 dark:text-slate-300 mb-2">Status</label>
                  <FilterSelect
                    value={editedAssessment.status}
                    onChange={(v) => setEditedAssessment({ ...editedAssessment, status: v })}
                    ariaLabel="Status"
                    options={[
                      { value: 'Draft', label: 'Draft' },
                      { value: 'Active', label: 'Active' },
                      { value: 'Completed', label: 'Completed' },
                      { value: 'Archived', label: 'Archived' },
                    ]}
                    className="w-full sm:w-full min-w-0 data-[size=default]:h-[38px] sm:data-[size=default]:h-[38px] py-0 sm:py-0 pl-3 sm:pl-3 pr-3 sm:pr-3 rounded-lg sm:rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 tracking-tight flex items-center gap-2 min-w-0">
                <Award className="w-5 h-5 text-brand-blue flex-shrink-0" />
                Assessment Sections
              </h3>
              <Button
                variant="primary"
                onClick={addSection}
                icon={<Plus className="w-4 h-4" />}
              >
                Add Section
              </Button>
            </div>

            {editedAssessment.sections.length > 0 ? (
              <div className="space-y-4">
                {editedAssessment.sections.map((section: any, index: number) => (
                  <div key={index} className="border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-lg p-3 sm:p-4 hover:border-brand-blue/30 transition-colors">
                    <div className="flex items-start gap-2 sm:gap-4">
                      <div className="w-8 h-8 bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg flex items-center justify-center text-white font-medium flex-shrink-0">
                        {index + 1}
                      </div>
                      
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input
                            type="text"
                            value={section.name}
                            onChange={(e) => updateSection(index, 'name', e.target.value)}
                            className="w-full min-w-0 h-[38px] px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                            placeholder="Section name"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div className="relative">
                              <input
                                type="number"
                                value={section.percentage}
                                onChange={(e) => updateSection(index, 'percentage', parseInt(e.target.value) || 0)}
                                className="w-full min-w-0 h-[38px] px-3 pr-8 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                                placeholder="Weight"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-slate-500">%</span>
                            </div>
                            <input
                              type="number"
                              value={section.questionCount}
                              onChange={(e) => updateSection(index, 'questionCount', parseInt(e.target.value) || 0)}
                              className="w-full min-w-0 h-[38px] px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                              placeholder="Questions"
                            />
                          </div>
                        </div>
                        
                        <textarea
                          value={section.description || ''}
                          onChange={(e) => updateSection(index, 'description', e.target.value)}
                          className="w-full min-w-0 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                          rows={2}
                          placeholder="Section description (optional)"
                        />
                      </div>

                      <button
                        onClick={() => deleteSection(index)}
                        className="h-8 w-8 inline-flex items-center justify-center flex-shrink-0 text-destructive hover:bg-destructive-subtle rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-lg p-5 sm:p-8 text-center bg-slate-50 dark:bg-slate-950">
                <Award className="w-12 h-12 text-gray-400 dark:text-slate-500 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-slate-400 mb-3">No sections added yet</p>
                <Button
                  variant="primary"
                  onClick={addSection}
                  icon={<Plus className="w-4 h-4" />}
                >
                  Add First Section
                </Button>
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="bg-brand-orange/10 border border-brand-orange/20 ring-1 ring-brand-orange/20 rounded-lg p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-brand-orange-deep flex-shrink-0 mt-0.5" />
              <div className="text-sm text-brand-orange-deep">
                <strong>Important:</strong> If this assessment has already been sent to candidates,
                editing may affect ongoing or completed submissions. Consider creating a new version
                instead if significant changes are needed.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-950 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 flex-shrink-0">
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <Button
              variant="secondary"
              onClick={() => handleSave(true)}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save as Draft'}
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSave(false)}
              disabled={isSaving}
              icon={<Save className="w-4 h-4" />}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>

      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        description="Save your configuration as a draft before leaving?"
        discardLabel="Discard"
        onClose={() => setShowUnsavedModal(false)}
        onDiscard={() => {
          setShowUnsavedModal(false);
          onClose();
        }}
        onSave={async () => {
          await handleSave(false);
          setShowUnsavedModal(false);
        }}
        isSaving={isSaving}
      />
    </div>
  );
}
