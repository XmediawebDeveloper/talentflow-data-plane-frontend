import { X, Save, AlertCircle, Clock, FileText, Award, Plus, Trash2, Edit2 } from 'lucide-react';
import { useState } from 'react';

interface AssessmentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: any;
  onSave: (updatedAssessment: any) => void;
}

export default function AssessmentEditModal({ isOpen, onClose, assessment, onSave }: AssessmentEditModalProps) {
  const [editedAssessment, setEditedAssessment] = useState({
    ...assessment,
    sections: assessment.sections || []
  });

  const [errors, setErrors] = useState<any>({});

  if (!isOpen) return null;

  const handleSave = () => {
    const newErrors: any = {};

    if (!editedAssessment.title?.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!editedAssessment.duration?.trim()) {
      newErrors.duration = 'Duration is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave(editedAssessment);
    onClose();
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

  const deleteSection = (index: number) => {
    if (confirm('Are you sure you want to delete this section?')) {
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl text-white mb-1">Edit Assessment</h2>
            <p className="text-gray-100 text-sm">
              Modify assessment details and configuration
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Basic Information */}
          <div className="mb-6">
            <h3 className="text-lg text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-800" />
              Basic Information
            </h3>
            
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Assessment Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editedAssessment.title}
                  onChange={(e) => {
                    setEditedAssessment({ ...editedAssessment, title: e.target.value });
                    setErrors({ ...errors, title: null });
                  }}
                  className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 ${
                    errors.title ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="e.g., Senior Software Engineer Technical Assessment"
                />
                {errors.title && (
                  <p className="text-sm text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.title}
                  </p>
                )}
              </div>

              {/* Duration and Questions */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Duration <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={editedAssessment.duration}
                      onChange={(e) => {
                        setEditedAssessment({ ...editedAssessment, duration: e.target.value });
                        setErrors({ ...errors, duration: null });
                      }}
                      className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 ${
                        errors.duration ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="e.g., 60 min"
                    />
                  </div>
                  {errors.duration && (
                    <p className="text-sm text-red-500 mt-1">{errors.duration}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Total Questions
                  </label>
                  <input
                    type="number"
                    value={editedAssessment.questions}
                    onChange={(e) => setEditedAssessment({ ...editedAssessment, questions: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                    placeholder="e.g., 25"
                  />
                </div>
              </div>

              {/* Type and Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Type</label>
                  <select
                    value={editedAssessment.type}
                    onChange={(e) => setEditedAssessment({ ...editedAssessment, type: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                  >
                    <option value="Technical">Technical</option>
                    <option value="Behavioral">Behavioral</option>
                    <option value="Coding">Coding</option>
                    <option value="Aptitude">Aptitude</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">Status</label>
                  <select
                    value={editedAssessment.status}
                    onChange={(e) => setEditedAssessment({ ...editedAssessment, status: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Active">Active</option>
                    <option value="Completed">Completed</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg text-gray-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-gray-800" />
                Assessment Sections
              </h3>
              <button
                onClick={addSection}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Section
              </button>
            </div>

            {editedAssessment.sections.length > 0 ? (
              <div className="space-y-4">
                {editedAssessment.sections.map((section: any, index: number) => (
                  <div key={index} className="border-2 border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center text-white font-medium flex-shrink-0">
                        {index + 1}
                      </div>
                      
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="text"
                            value={section.name}
                            onChange={(e) => updateSection(index, 'name', e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
                            placeholder="Section name"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div className="relative">
                              <input
                                type="number"
                                value={section.percentage}
                                onChange={(e) => updateSection(index, 'percentage', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
                                placeholder="Weight"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span>
                            </div>
                            <input
                              type="number"
                              value={section.questionCount}
                              onChange={(e) => updateSection(index, 'questionCount', parseInt(e.target.value) || 0)}
                              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
                              placeholder="Questions"
                            />
                          </div>
                        </div>
                        
                        <textarea
                          value={section.description || ''}
                          onChange={(e) => updateSection(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
                          rows={2}
                          placeholder="Section description (optional)"
                        />
                      </div>

                      <button
                        onClick={() => deleteSection(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Award className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-3">No sections added yet</p>
                <button
                  onClick={addSection}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add First Section
                </button>
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-900">
                <strong>Important:</strong> If this assessment has already been sent to candidates, 
                editing may affect ongoing or completed submissions. Consider creating a new version 
                instead if significant changes are needed.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setEditedAssessment({ ...editedAssessment, status: 'Draft' });
                handleSave();
              }}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Save as Draft
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
