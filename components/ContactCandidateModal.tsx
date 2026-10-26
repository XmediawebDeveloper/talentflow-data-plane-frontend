import { X, Mail, Phone, Calendar, Clock, Send, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DateField } from '@/components/ui/date-field';

interface ContactCandidateModalProps {
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  jobTitle: string;
  onClose: () => void;
}

export default function ContactCandidateModal({
  candidateName,
  candidateEmail,
  candidatePhone,
  jobTitle,
  onClose
}: ContactCandidateModalProps) {
  const [contactMethod, setContactMethod] = useState<'email' | 'phone' | 'schedule'>('email');
  const [emailSubject, setEmailSubject] = useState(`Interview Opportunity: ${jobTitle}`);
  const [emailBody, setEmailBody] = useState(
    `Dear ${candidateName},\n\nWe were impressed with your profile and would like to discuss the ${jobTitle} position with you.\n\nYour skills and experience align well with what we're looking for, and we believe you could be a great fit for our team.\n\nWould you be available for a preliminary discussion this week?\n\nBest regards,\nTalentFlow Recruitment Team`
  );
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [phoneNotes, setPhoneNotes] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState('custom');

  const emailTemplates = {
    interview: {
      subject: `Interview Invitation: ${jobTitle} Position`,
      body: `Dear ${candidateName},\n\nThank you for your interest in the ${jobTitle} position at our company.\n\nWe have reviewed your application and would like to invite you for an interview to discuss this opportunity further.\n\nPlease let us know your availability for the coming week.\n\nWe look forward to speaking with you.\n\nBest regards,\nTalentFlow Recruitment Team`
    },
    screening: {
      subject: `Screening Call: ${jobTitle} Position`,
      body: `Dear ${candidateName},\n\nThank you for applying to the ${jobTitle} position.\n\nWe would like to schedule a brief 15-20 minute screening call to learn more about your background and discuss the role in detail.\n\nCould you please share your availability for this week?\n\nLooking forward to connecting.\n\nBest regards,\nTalentFlow Recruitment Team`
    },
    rejection: {
      subject: `Update on Your Application: ${jobTitle}`,
      body: `Dear ${candidateName},\n\nThank you for your interest in the ${jobTitle} position and for taking the time to apply.\n\nAfter careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.\n\nWe appreciate your interest in our company and encourage you to apply for future opportunities that match your skills and experience.\n\nBest regards,\nTalentFlow Recruitment Team`
    },
    custom: {
      subject: `Interview Opportunity: ${jobTitle}`,
      body: emailBody
    }
  };

  const handleTemplateChange = (template: string) => {
    setEmailTemplate(template);
    if (template !== 'custom') {
      setEmailSubject(emailTemplates[template as keyof typeof emailTemplates].subject);
      setEmailBody(emailTemplates[template as keyof typeof emailTemplates].body);
    }
  };

  const handleSendEmail = () => {
    setIsSending(true);
    // Simulate sending email
    setTimeout(() => {
      setIsSending(false);
      toast.success(`Email sent successfully to ${candidateEmail}`);
      onClose();
    }, 1500);
  };

  const handleScheduleCall = () => {
    if (!scheduleDate || !scheduleTime) {
      toast.warning('Please select both date and time');
      return;
    }
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      toast.success(`Interview scheduled for ${scheduleDate} at ${scheduleTime}`);
      onClose();
    }, 1500);
  };

  const handlePhoneContact = () => {
    toast.info(`Calling ${candidateName} at ${candidatePhone}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 truncate">Contact Candidate</h2>
              <p className="text-sm text-gray-500 dark:text-slate-500 truncate">{candidateName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors flex-shrink-0"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contact Method Tabs */}
        <div className="border-b border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 flex-shrink-0">
          <div className="flex px-4 sm:px-6 overflow-x-auto">
            <button
              onClick={() => setContactMethod('email')}
              className={`px-4 sm:px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                contactMethod === 'email'
                  ? 'text-brand-blue border-b-2 border-brand-blue'
                  : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
              }`}
            >
              <Mail className="w-4 h-4" />
              Send Email
            </button>
            <button
              onClick={() => setContactMethod('phone')}
              className={`px-4 sm:px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                contactMethod === 'phone'
                  ? 'text-brand-blue border-b-2 border-brand-blue'
                  : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
              }`}
            >
              <Phone className="w-4 h-4" />
              Phone Call
            </button>
            <button
              onClick={() => setContactMethod('schedule')}
              className={`px-4 sm:px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                contactMethod === 'schedule'
                  ? 'text-brand-blue border-b-2 border-brand-blue'
                  : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Schedule Interview
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Email Form */}
          {contactMethod === 'email' && (
            <div className="space-y-4">
              {/* Email Template Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Email Template
                </label>
                <select
                  value={emailTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                >
                  <option value="custom">Custom Email</option>
                  <option value="interview">Interview Invitation</option>
                  <option value="screening">Screening Call Request</option>
                  <option value="rejection">Rejection Email</option>
                </select>
              </div>

              {/* Recipient */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  To
                </label>
                <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300">
                  {candidateEmail}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  placeholder="Email subject"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Message
                </label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={12}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue resize-none"
                  placeholder="Type your message here..."
                />
              </div>
            </div>
          )}

          {/* Phone Call Form */}
          {contactMethod === 'phone' && (
            <div className="space-y-4">
              {/* Phone Number */}
              <div className="bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Phone className="w-5 h-5 text-brand-blue" />
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Phone Number</span>
                </div>
                <div className="text-xl font-semibold text-gray-900 dark:text-slate-50">{candidatePhone}</div>
              </div>

              {/* Call Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Call Notes (Optional)
                </label>
                <textarea
                  value={phoneNotes}
                  onChange={(e) => setPhoneNotes(e.target.value)}
                  rows={8}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue resize-none"
                  placeholder="Add any notes or talking points for the call..."
                />
              </div>

              {/* Tips */}
              <div className="bg-brand-orange/5 ring-1 ring-brand-orange/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Call Tips</h4>
                <ul className="space-y-1 text-sm text-gray-700 dark:text-slate-300">
                  <li>• Introduce yourself and your company</li>
                  <li>• Confirm their interest in the {jobTitle} position</li>
                  <li>• Discuss their availability for next steps</li>
                  <li>• Keep notes during the conversation</li>
                </ul>
              </div>
            </div>
          )}

          {/* Schedule Interview Form */}
          {contactMethod === 'schedule' && (
            <div className="space-y-4">
              {/* Interview Details */}
              <div className="bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-brand-blue" />
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Interview Details</span>
                </div>
                <div className="text-sm text-gray-700 dark:text-slate-300">
                  <strong>Position:</strong> {jobTitle}
                </div>
                <div className="text-sm text-gray-700 dark:text-slate-300">
                  <strong>Candidate:</strong> {candidateName}
                </div>
              </div>

              {/* Date Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Interview Date
                </label>
                <DateField
                  aria-label="Interview Date"
                  value={scheduleDate}
                  onChange={setScheduleDate}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              {/* Time Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Interview Time
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
              </div>

              {/* Interview Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Interview Type
                </label>
                <select className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500">
                  <option>Video Call (Zoom/Teams)</option>
                  <option>Phone Interview</option>
                  <option>In-Person Interview</option>
                  <option>Panel Interview</option>
                </select>
              </div>

              {/* Additional Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Additional Notes
                </label>
                <textarea
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue resize-none"
                  placeholder="Any additional information for the candidate..."
                />
              </div>

              {/* Auto-send email confirmation */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sendConfirmation"
                  className="w-4 h-4 accent-brand-blue rounded focus:ring-brand-blue"
                  defaultChecked
                />
                <label htmlFor="sendConfirmation" className="text-sm text-gray-700 dark:text-slate-300">
                  Send email confirmation to candidate
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 px-4 sm:px-6 py-3 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 flex-shrink-0">
          {contactMethod === 'email' && (
            <button
              onClick={handleSendEmail}
              disabled={isSending}
              className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Email
                </>
              )}
            </button>
          )}
          {contactMethod === 'phone' && (
            <button
              onClick={handlePhoneContact}
              className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Initiate Call
            </button>
          )}
          {contactMethod === 'schedule' && (
            <button
              onClick={handleScheduleCall}
              disabled={isSending}
              className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  Schedule Interview
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
