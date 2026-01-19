import { X, Clock, FileText, Users, Sparkles, ChevronDown, ChevronUp, Award, Info } from 'lucide-react';
import { useState } from 'react';

interface AssessmentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: any;
}

export default function AssessmentPreviewModal({ isOpen, onClose, assessment }: AssessmentPreviewModalProps) {
  const [expandedSection, setExpandedSection] = useState<number | null>(0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-6 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-xl text-white">Assessment Preview</h2>
              <span className="px-2 py-0.5 bg-white/20 text-white rounded text-xs flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Candidate View
              </span>
            </div>
            <p className="text-gray-100 text-sm">
              This is how candidates will see the assessment
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
          {/* Assessment Header */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-50 border-2 border-gray-200 rounded-lg p-6 mb-6">
            <h1 className="text-2xl text-gray-900 mb-3">{assessment.title}</h1>
            {assessment.job && (
              <div className="text-sm text-gray-700 mb-4">
                Position: <span className="font-medium">{assessment.job.title}</span> • {assessment.job.department}
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-800" />
                <div>
                  <div className="text-xs text-gray-600">Duration</div>
                  <div className="text-sm text-gray-900">{assessment.duration}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-800" />
                <div>
                  <div className="text-xs text-gray-600">Questions</div>
                  <div className="text-sm text-gray-900">{assessment.questions} total</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-green-600" />
                <div>
                  <div className="text-xs text-gray-600">Pass Score</div>
                  <div className="text-sm text-gray-900">70% required</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-gray-900 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-800">
                  <strong>Instructions:</strong> Please complete all sections within the time limit. 
                  You cannot pause or return to previous sections once submitted. Ensure you have a 
                  stable internet connection before starting.
                </div>
              </div>
            </div>
          </div>

          {/* Sections */}
          {assessment.sections && assessment.sections.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-lg text-gray-900 mb-4">Assessment Sections</h3>
              {assessment.sections.map((section: any, index: number) => (
                <div
                  key={index}
                  className="border-2 border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
                >
                  {/* Section Header */}
                  <button
                    onClick={() => setExpandedSection(expandedSection === index ? null : index)}
                    className="w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center text-white font-medium">
                        {index + 1}
                      </div>
                      <div className="text-left">
                        <div className="text-gray-900 font-medium">{section.name}</div>
                        <div className="text-sm text-gray-600">
                          {section.questionCount || 10} questions • {section.percentage}% of total score
                        </div>
                      </div>
                    </div>
                    {expandedSection === index ? (
                      <ChevronUp className="w-5 h-5 text-gray-600" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-600" />
                    )}
                  </button>

                  {/* Section Content */}
                  {expandedSection === index && (
                    <div className="p-6 bg-white border-t border-gray-200">
                      <div className="mb-4">
                        <div className="text-sm text-gray-700 mb-3">
                          <strong>Section Overview:</strong> {section.description || 'This section tests your knowledge and skills in ' + section.name.toLowerCase() + '.'}
                        </div>
                      </div>

                      {/* Sample Questions */}
                      <div className="space-y-4">
                        <div className="text-sm font-medium text-gray-900 mb-2">Sample Questions:</div>
                        
                        {/* Question 1 */}
                        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                          <div className="flex items-start gap-3 mb-3">
                            <span className="px-2 py-1 bg-gray-800 text-white rounded text-xs font-medium">Q1</span>
                            <div className="flex-1">
                              <div className="text-sm text-gray-900 mb-3">
                                {section.name.includes('Technical') && 
                                  'Explain the concept of dependency injection and its benefits in software architecture.'}
                                {section.name.includes('HR') && 
                                  'Tell us about a time when you had to work with a difficult team member. How did you handle it?'}
                                {section.name.includes('Coding') && 
                                  'Write a function to reverse a linked list. Consider edge cases and optimize for time complexity.'}
                                {!section.name.includes('Technical') && !section.name.includes('HR') && !section.name.includes('Coding') &&
                                  'Sample question for ' + section.name}
                              </div>
                              {section.name.includes('Coding') ? (
                                <div className="bg-gray-900 rounded-lg p-3 font-mono text-sm text-green-400">
                                  <div>// Write your code here...</div>
                                  <div className="text-gray-500 mt-2">function reverseLinkedList(head) {'{'}</div>
                                  <div className="text-gray-500 ml-4">// Your implementation</div>
                                  <div className="text-gray-500">{'}'}</div>
                                </div>
                              ) : (
                                <textarea
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                  rows={3}
                                  placeholder="Type your answer here..."
                                  disabled
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Question 2 */}
                        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                          <div className="flex items-start gap-3 mb-3">
                            <span className="px-2 py-1 bg-gray-800 text-white rounded text-xs font-medium">Q2</span>
                            <div className="flex-1">
                              <div className="text-sm text-gray-900 mb-3">
                                {section.name.includes('Technical') && 
                                  'What are the key differences between SQL and NoSQL databases?'}
                                {section.name.includes('HR') && 
                                  'What motivates you in your professional career?'}
                                {section.name.includes('Coding') && 
                                  'Implement a function to detect a cycle in a linked list.'}
                                {!section.name.includes('Technical') && !section.name.includes('HR') && !section.name.includes('Coding') &&
                                  'Another sample question for ' + section.name}
                              </div>
                              <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                  <input type="radio" name={`q2-${index}`} disabled className="w-4 h-4" />
                                  <span>Option A: Sample answer choice</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                  <input type="radio" name={`q2-${index}`} disabled className="w-4 h-4" />
                                  <span>Option B: Another answer choice</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                  <input type="radio" name={`q2-${index}`} disabled className="w-4 h-4" />
                                  <span>Option C: Third answer option</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="text-xs text-gray-500 italic mt-2">
                          ... and {(section.questionCount || 10) - 2} more questions
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No sections configured for this assessment</p>
            </div>
          )}

          {/* Footer Info */}
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-900">
                <strong>Note:</strong> This is a preview of the candidate experience. 
                The actual assessment may include additional features like time tracking, 
                AI proctoring, and automatic scoring.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Close Preview
          </button>
          <button
            onClick={() => {
              alert('Opening test mode - Full candidate simulation');
              onClose();
            }}
            className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Take Test (Simulation)
          </button>
        </div>
      </div>
    </div>
  );
}
