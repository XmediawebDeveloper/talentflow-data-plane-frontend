import { X, Clock, Users, Brain, Code, BarChart, Sparkles, Shield, Video } from 'lucide-react';

interface AssessmentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: any;
}

export default function AssessmentPreviewModal({ isOpen, onClose, assessment }: AssessmentPreviewModalProps) {
  if (!isOpen || !assessment) return null;

  // Extract section data from assessment
  const getSections = () => {
    const sections = [];

    if (assessment.hr_enabled) {
      sections.push({
        name: 'HR',
        percentage: assessment.hr_percentage || 0,
        topics: assessment.hr_topics || [],
        scoringType: 'informational',
      });
    }

    if (assessment.technical_enabled) {
      sections.push({
        name: 'Technical',
        percentage: assessment.technical_percentage || 0,
        topics: assessment.technical_topics || [],
        scoringType: 'scored',
      });
    }

    if (assessment.coding_enabled) {
      sections.push({
        name: 'Coding',
        percentage: assessment.coding_percentage || 0,
        topics: assessment.coding_topics || [],
        languages: assessment.coding_languages || [],
        scoringType: 'scored',
      });
    }

    return sections;
  };

  const sections = getSections();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl text-white">Assessment Preview</h2>
              <span className="px-2 py-0.5 bg-white/20 text-white rounded text-xs flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Configuration View
              </span>
            </div>
            <p className="text-gray-300 text-sm">
              Preview of assessment configuration and scoring
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
          {/* Assessment Summary */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{assessment.title}</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Total Duration</div>
                <div className="text-2xl font-semibold text-gray-900">{assessment.duration_minutes || assessment.duration || 30} min</div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-sm text-green-600 mb-1">Sections</div>
                <div className="text-2xl font-semibold text-gray-900">{sections.length}</div>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <div className="text-sm text-yellow-600 mb-1">Status</div>
                <div className="text-2xl font-semibold text-gray-900">
                  {assessment.status === 'published' ? 'Published' : 'Draft'}
                </div>
              </div>
            </div>
          </div>

          {/* Proctoring Status */}
          {assessment.proctoring_enabled && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-blue-900">Proctoring Enabled</span>
                    <Video className="w-4 h-4 text-blue-600" />
                  </div>
                  <p className="text-sm text-blue-700">
                    Webcam monitoring, screen recording, and AI cheating prevention active
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Scoring Rules Summary */}
          <div className="bg-gradient-to-r from-gray-50 to-pink-50 border-2 border-gray-300 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <BarChart className="w-6 h-6 text-gray-800 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">🎯 Evaluation & Scoring Logic</h3>
                <p className="text-sm text-gray-700">
                  How candidates will be evaluated when taking this assessment
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* HR Section Info */}
              {assessment.hr_enabled && (
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-gray-800" />
                    <h4 className="text-sm font-medium text-gray-900">HR Section</h4>
                    <span className="ml-auto px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                      Not Scored
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Responses recorded and displayed in reports for review, but <strong>NOT included in PASS/FAIL decision</strong>
                  </p>
                </div>
              )}

              {/* Technical + Coding Info */}
              {(assessment.technical_enabled || assessment.coding_enabled) && (
                <div className="bg-white rounded-lg p-4 border border-green-300">
                  <div className="flex items-center gap-2 mb-2">
                    {assessment.technical_enabled && <Brain className="w-4 h-4 text-gray-800" />}
                    {assessment.coding_enabled && <Code className="w-4 h-4 text-green-600" />}
                    <h4 className="text-sm font-medium text-gray-900">
                      {assessment.technical_enabled && assessment.coding_enabled
                        ? 'Technical + Coding'
                        : assessment.technical_enabled
                          ? 'Technical'
                          : 'Coding'}
                    </h4>
                    <span className="ml-auto px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                      Scored
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 mb-2">Each question scored 0-10. <strong>Pass requires:</strong></p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    <li>• ≥70% of questions scoring ≥7 <strong>OR</strong></li>
                    <li>• Section average ≥7.0</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Final Result Logic */}
            <div className="mt-4 bg-green-100 border border-green-300 rounded-lg p-3 text-center">
              <span className="text-sm text-green-800">
                <strong>Final Result:</strong> PASS/FAIL determined by{' '}
                {assessment.technical_enabled && assessment.coding_enabled
                  ? 'Technical + Coding sections only'
                  : assessment.technical_enabled
                    ? 'Technical section only'
                    : assessment.coding_enabled
                      ? 'Coding section only'
                      : 'scored sections'}
              </span>
            </div>
          </div>

          {/* Section Details */}
          <div className="space-y-4">
            {sections.map((section, idx) => (
              <div key={idx} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {section.name === 'HR' && <Users className="w-5 h-5 text-gray-800" />}
                    {section.name === 'Technical' && <Brain className="w-5 h-5 text-gray-800" />}
                    {section.name === 'Coding' && <Code className="w-5 h-5 text-green-600" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">{section.name} Section</h3>
                        {section.scoringType === 'informational' ? (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                            Informational Only
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                            Scored (0-10 scale)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-2xl font-semibold text-gray-800">{section.percentage}%</div>
                    {section.scoringType === 'scored' && (
                      <span className="text-xs text-green-600">✅ Counts to PASS/FAIL</span>
                    )}
                  </div>
                </div>

                {/* Topics */}
                {section.topics && section.topics.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm text-gray-700 mb-2">Topics Covered:</div>
                    <div className="flex flex-wrap gap-2">
                      {section.topics.map((topic: string, tidx: number) => (
                        <span key={tidx} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Coding Languages */}
                {section.name === 'Coding' && section.languages && section.languages.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm text-gray-700 mb-2">Programming Languages:</div>
                    <div className="flex flex-wrap gap-2">
                      {section.languages.map((lang: string, lidx: number) => (
                        <span key={lidx} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm">
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dynamic Generation Note */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="text-sm text-gray-800">
                    ℹ️ <strong>Questions will be generated dynamically</strong> when candidates are assigned to this assessment based on the configured topics and difficulty level.
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
