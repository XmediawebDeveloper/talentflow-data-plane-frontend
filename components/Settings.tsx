import { User, Bell, Shield, Palette, Mail, Save, Check, Lock, Phone, MapPin, Briefcase, Target, Filter, Tag, Calendar, Clock } from 'lucide-react';
import { useState } from 'react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Profile Settings
  const [profileData, setProfileData] = useState({
    fullName: 'John Recruiter',
    email: 'john.recruiter@talentflow.com',
    phone: '+1 (555) 123-4567',
    jobTitle: 'Senior Recruiter',
    department: 'Talent Acquisition',
    location: 'San Francisco, CA',
    bio: 'Experienced recruiter specializing in technical hiring with 8+ years in the industry.',
    specialization: 'Technology & Engineering',
  });

  // Notification Settings
  const [notifications, setNotifications] = useState({
    emailNewApplicant: true,
    emailAssessmentComplete: true,
    emailInterviewScheduled: true,
    emailCandidateMessage: false,
    emailJobExpiring: true,
    pushNewApplicant: true,
    pushAssessmentComplete: false,
    pushInterviewReminder: true,
    pushCandidateViewed: false,
    weeklyDigest: true,
    monthlyReport: true,
  });

  // Privacy Settings
  const [privacy, setPrivacy] = useState({
    profileVisibility: 'team',
    showEmail: false,
    showPhone: false,
    showActivityStatus: true,
  });

  // Appearance Settings
  const [appearance, setAppearance] = useState({
    theme: 'light',
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    defaultView: 'dashboard',
  });

  // Job Preferences
  const [jobPreferences, setJobPreferences] = useState({
    autoSaveJD: true,
    defaultJobType: 'Full-time',
    defaultLocation: 'Remote',
    requireAssessment: false,
    autoPublish: false,
    defaultExpiryDays: 30,
  });

  // Workflow Preferences
  const [workflowPreferences, setWorkflowPreferences] = useState({
    autoScreenResumes: true,
    aiAssistance: true,
    bulkActionConfirmation: true,
    showAdvancedFilters: true,
    defaultSortOrder: 'latest',
  });

  const handleSave = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const tabs = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'job-preferences', label: 'Job Preferences', icon: Briefcase },
    { id: 'workflow', label: 'Workflow', icon: Filter },
    { id: 'privacy', label: 'Privacy & Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
            <User className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-gray-900">Recruiter Settings</h1>
            <p className="text-sm text-gray-600">Manage your personal preferences and workflow settings</p>
          </div>
        </div>
      </div>

      {/* Tabs + Content Layout */}
      <div className="flex gap-6">
        {/* Left Sidebar - Tabs */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 sticky top-8">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all ${
                      activeTab === tab.id
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Role Info */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-xs text-blue-600 uppercase tracking-wider mb-1">Role</div>
              <div className="text-sm text-blue-900 font-medium">Recruiter</div>
              <div className="text-xs text-blue-700 mt-1">Access Level: Standard</div>
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            {/* Profile Settings */}
            {activeTab === 'profile' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">My Profile</h2>
                    <p className="text-sm text-gray-600">Update your personal information and recruiter profile</p>
                  </div>
                </div>

                {/* Profile Picture */}
                <div className="mb-8 pb-8 border-b border-gray-200">
                  <label className="block text-sm font-medium text-gray-900 mb-3">Profile Picture</label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white flex items-center justify-center shadow-lg text-2xl">
                      JR
                    </div>
                    <div>
                      <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm mr-2">
                        Upload New
                      </button>
                      <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                        Remove
                      </button>
                      <p className="text-xs text-gray-500 mt-2">JPG, PNG or GIF. Max size 5MB.</p>
                    </div>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">Full Name</label>
                      <input
                        type="text"
                        value={profileData.fullName}
                        onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">Email Address</label>
                      <input
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">Phone Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="tel"
                          value={profileData.phone}
                          onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">Job Title</label>
                      <div className="relative">
                        <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          value={profileData.jobTitle}
                          onChange={(e) => setProfileData({ ...profileData, jobTitle: e.target.value })}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">Department</label>
                      <input
                        type="text"
                        value={profileData.department}
                        onChange={(e) => setProfileData({ ...profileData, department: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">Location</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          value={profileData.location}
                          onChange={(e) => setProfileData({ ...profileData, location: e.target.value })}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Specialization</label>
                    <select
                      value={profileData.specialization}
                      onChange={(e) => setProfileData({ ...profileData, specialization: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white"
                    >
                      <option>Technology & Engineering</option>
                      <option>Sales & Marketing</option>
                      <option>Finance & Accounting</option>
                      <option>Healthcare</option>
                      <option>Executive Search</option>
                      <option>General Recruitment</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Bio</label>
                    <textarea
                      value={profileData.bio}
                      onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                      rows={4}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none"
                      placeholder="Tell candidates and team members about your recruitment expertise..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notification Settings */}
            {activeTab === 'notifications' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">Notification Settings</h2>
                    <p className="text-sm text-gray-600">Choose how you want to be notified about recruitment activities</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Email Notifications */}
                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Mail className="w-5 h-5 text-blue-600" />
                      Email Notifications
                    </h3>
                    <div className="space-y-3">
                      {[
                        { key: 'emailNewApplicant', label: 'New applicant submitted', desc: 'Get notified when a candidate applies to your job' },
                        { key: 'emailAssessmentComplete', label: 'Assessment completed', desc: 'Receive alerts when candidates complete assessments' },
                        { key: 'emailInterviewScheduled', label: 'Interview scheduled', desc: 'Notifications for upcoming interviews' },
                        { key: 'emailCandidateMessage', label: 'Candidate messages', desc: 'Get emails when candidates send you messages' },
                        { key: 'emailJobExpiring', label: 'Job expiring soon', desc: 'Reminders when your job postings are about to expire' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex-1">
                            <div className="text-sm text-gray-900 mb-1">{item.label}</div>
                            <div className="text-xs text-gray-600">{item.desc}</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={notifications[item.key as keyof typeof notifications] as boolean}
                              onChange={(e) => setNotifications({ ...notifications, [item.key]: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Push Notifications */}
                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Bell className="w-5 h-5 text-purple-600" />
                      Push Notifications
                    </h3>
                    <div className="space-y-3">
                      {[
                        { key: 'pushNewApplicant', label: 'New applicant alerts', desc: 'Browser notifications for new applications' },
                        { key: 'pushAssessmentComplete', label: 'Assessment completion', desc: 'Instant alerts for completed assessments' },
                        { key: 'pushInterviewReminder', label: 'Interview reminders', desc: 'Get reminded 15 minutes before interviews' },
                        { key: 'pushCandidateViewed', label: 'Candidate profile views', desc: 'When candidates view your job postings' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex-1">
                            <div className="text-sm text-gray-900 mb-1">{item.label}</div>
                            <div className="text-xs text-gray-600">{item.desc}</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={notifications[item.key as keyof typeof notifications] as boolean}
                              onChange={(e) => setNotifications({ ...notifications, [item.key]: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Digest Notifications */}
                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-green-600" />
                      Digest & Reports
                    </h3>
                    <div className="space-y-3">
                      {[
                        { key: 'weeklyDigest', label: 'Weekly activity digest', desc: 'Summary of weekly recruitment activity' },
                        { key: 'monthlyReport', label: 'Monthly performance report', desc: 'Detailed monthly analytics and insights' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex-1">
                            <div className="text-sm text-gray-900 mb-1">{item.label}</div>
                            <div className="text-xs text-gray-600">{item.desc}</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={notifications[item.key as keyof typeof notifications] as boolean}
                              onChange={(e) => setNotifications({ ...notifications, [item.key]: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Job Preferences */}
            {activeTab === 'job-preferences' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">Job Posting Preferences</h2>
                    <p className="text-sm text-gray-600">Set default values for new job postings</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Target className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium text-blue-900 mb-1">Quick Tip</div>
                        <div className="text-sm text-blue-700">These settings will be pre-filled when you create a new job posting, saving you time.</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Default Job Type</label>
                    <select
                      value={jobPreferences.defaultJobType}
                      onChange={(e) => setJobPreferences({ ...jobPreferences, defaultJobType: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                    >
                      <option>Full-time</option>
                      <option>Part-time</option>
                      <option>Contract</option>
                      <option>Internship</option>
                      <option>Temporary</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Default Location</label>
                    <select
                      value={jobPreferences.defaultLocation}
                      onChange={(e) => setJobPreferences({ ...jobPreferences, defaultLocation: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                    >
                      <option>Remote</option>
                      <option>Hybrid</option>
                      <option>On-site</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Default Job Expiry (Days)</label>
                    <input
                      type="number"
                      value={jobPreferences.defaultExpiryDays}
                      onChange={(e) => setJobPreferences({ ...jobPreferences, defaultExpiryDays: parseInt(e.target.value) })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      min="1"
                      max="90"
                    />
                    <p className="text-xs text-gray-500 mt-1">Job postings will automatically expire after this many days</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1">
                        <div className="text-sm text-gray-900 mb-1">Auto-save job drafts</div>
                        <div className="text-xs text-gray-600">Automatically save your progress when creating jobs</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input
                          type="checkbox"
                          checked={jobPreferences.autoSaveJD}
                          onChange={(e) => setJobPreferences({ ...jobPreferences, autoSaveJD: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1">
                        <div className="text-sm text-gray-900 mb-1">Require assessment by default</div>
                        <div className="text-xs text-gray-600">Automatically require candidates to complete an assessment</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input
                          type="checkbox"
                          checked={jobPreferences.requireAssessment}
                          onChange={(e) => setJobPreferences({ ...jobPreferences, requireAssessment: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1">
                        <div className="text-sm text-gray-900 mb-1">Auto-publish jobs</div>
                        <div className="text-xs text-gray-600">Automatically publish jobs after creation (skip draft)</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input
                          type="checkbox"
                          checked={jobPreferences.autoPublish}
                          onChange={(e) => setJobPreferences({ ...jobPreferences, autoPublish: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Workflow Preferences */}
            {activeTab === 'workflow' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">Workflow Preferences</h2>
                    <p className="text-sm text-gray-600">Customize how you interact with the platform</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4">Resume Management</h3>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <div className="text-sm text-gray-900 mb-1">AI-powered auto-screening</div>
                          <div className="text-xs text-gray-600">Automatically screen and rank resumes using AI</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                          <input
                            type="checkbox"
                            checked={workflowPreferences.autoScreenResumes}
                            onChange={(e) => setWorkflowPreferences({ ...workflowPreferences, autoScreenResumes: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <div className="text-sm text-gray-900 mb-1">AI assistance suggestions</div>
                          <div className="text-xs text-gray-600">Get AI-powered suggestions while reviewing candidates</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                          <input
                            type="checkbox"
                            checked={workflowPreferences.aiAssistance}
                            onChange={(e) => setWorkflowPreferences({ ...workflowPreferences, aiAssistance: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <div className="text-sm text-gray-900 mb-1">Confirm bulk actions</div>
                          <div className="text-xs text-gray-600">Show confirmation dialog for bulk operations</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                          <input
                            type="checkbox"
                            checked={workflowPreferences.bulkActionConfirmation}
                            onChange={(e) => setWorkflowPreferences({ ...workflowPreferences, bulkActionConfirmation: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <div className="text-sm text-gray-900 mb-1">Show advanced filters by default</div>
                          <div className="text-xs text-gray-600">Display advanced filter options when searching resumes</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                          <input
                            type="checkbox"
                            checked={workflowPreferences.showAdvancedFilters}
                            onChange={(e) => setWorkflowPreferences({ ...workflowPreferences, showAdvancedFilters: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4">Default Sort Order</h3>
                    <select
                      value={workflowPreferences.defaultSortOrder}
                      onChange={(e) => setWorkflowPreferences({ ...workflowPreferences, defaultSortOrder: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                    >
                      <option value="latest">Latest First</option>
                      <option value="name-asc">Name (A-Z)</option>
                      <option value="name-desc">Name (Z-A)</option>
                      <option value="experience-high">Experience (High to Low)</option>
                      <option value="experience-low">Experience (Low to High)</option>
                      <option value="lastUpdated">Last Updated</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Privacy & Security Settings */}
            {activeTab === 'privacy' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">Privacy & Security</h2>
                    <p className="text-sm text-gray-600">Manage your privacy settings and account security</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Privacy Settings */}
                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-blue-600" />
                      Privacy Settings
                    </h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <label className="block text-sm text-gray-900 mb-2">Profile Visibility</label>
                        <select
                          value={privacy.profileVisibility}
                          onChange={(e) => setPrivacy({ ...privacy, profileVisibility: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                        >
                          <option value="team">Team Only - Visible to team members</option>
                          <option value="private">Private - Only visible to me</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-2">Controls who can see your recruiter profile</p>
                      </div>

                      {[
                        { key: 'showEmail', label: 'Show email in profile', desc: 'Display your email address on your profile' },
                        { key: 'showPhone', label: 'Show phone number', desc: 'Display your phone number on your profile' },
                        { key: 'showActivityStatus', label: 'Show activity status', desc: 'Let team members see when you\'re online' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex-1">
                            <div className="text-sm text-gray-900 mb-1">{item.label}</div>
                            <div className="text-xs text-gray-600">{item.desc}</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={privacy[item.key as keyof typeof privacy] as boolean}
                              onChange={(e) => setPrivacy({ ...privacy, [item.key]: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Security Settings */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-red-600" />
                      Security Settings
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div>
                          <div className="text-sm text-gray-900 mb-1">Password</div>
                          <div className="text-xs text-gray-600">Last changed 3 months ago</div>
                        </div>
                        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                          Change Password
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div>
                          <div className="text-sm text-gray-900 mb-1">Two-Factor Authentication</div>
                          <div className="text-xs text-gray-600">Add an extra layer of security</div>
                        </div>
                        <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm">
                          Enable 2FA
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div>
                          <div className="text-sm text-gray-900 mb-1">Active Sessions</div>
                          <div className="text-xs text-gray-600">2 active sessions across devices</div>
                        </div>
                        <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm">
                          Manage Sessions
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Data Management */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="text-base font-medium text-gray-900 mb-4">Data Management</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div>
                          <div className="text-sm text-gray-900 mb-1">Export Your Data</div>
                          <div className="text-xs text-gray-600">Download your recruitment activity and data</div>
                        </div>
                        <button className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm">
                          Export Data
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Appearance Settings */}
            {activeTab === 'appearance' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">Appearance Settings</h2>
                    <p className="text-sm text-gray-600">Customize how TalentFlow looks and feels</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Theme */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-3">Theme</label>
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { value: 'light', label: 'Light', desc: 'Classic bright theme' },
                        { value: 'dark', label: 'Dark', desc: 'Easy on the eyes' },
                        { value: 'auto', label: 'Auto', desc: 'Match system' },
                      ].map((theme) => (
                        <button
                          key={theme.value}
                          onClick={() => setAppearance({ ...appearance, theme: theme.value })}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            appearance.theme === theme.value
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-full h-20 rounded-md mb-3 ${
                            theme.value === 'light' ? 'bg-white border-2 border-gray-200' :
                            theme.value === 'dark' ? 'bg-gray-900' :
                            'bg-gradient-to-br from-white to-gray-900'
                          }`}></div>
                          <div className="text-sm font-medium text-gray-900">{theme.label}</div>
                          <div className="text-xs text-gray-600">{theme.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Language</label>
                    <select
                      value={appearance.language}
                      onChange={(e) => setAppearance({ ...appearance, language: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                    >
                      <option value="en">English (US)</option>
                      <option value="es">Español</option>
                      <option value="fr">Français</option>
                      <option value="de">Deutsch</option>
                      <option value="ja">日本語</option>
                    </select>
                  </div>

                  {/* Date Format */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Date Format</label>
                    <select
                      value={appearance.dateFormat}
                      onChange={(e) => setAppearance({ ...appearance, dateFormat: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</option>
                    </select>
                  </div>

                  {/* Time Format */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Time Format</label>
                    <select
                      value={appearance.timeFormat}
                      onChange={(e) => setAppearance({ ...appearance, timeFormat: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                    >
                      <option value="12h">12-hour (3:30 PM)</option>
                      <option value="24h">24-hour (15:30)</option>
                    </select>
                  </div>

                  {/* Default Landing Page */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Default Landing Page</label>
                    <select
                      value={appearance.defaultView}
                      onChange={(e) => setAppearance({ ...appearance, defaultView: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                    >
                      <option value="dashboard">Dashboard</option>
                      <option value="jobs">Jobs Listing</option>
                      <option value="my-resumes">My Resumes</option>
                      <option value="internal-db">Internal Database</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">The page you'll see first when you log in</p>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {saveSuccess && (
                  <div className="flex items-center gap-2 text-green-600">
                    <Check className="w-4 h-4" />
                    Settings saved successfully!
                  </div>
                )}
              </div>
              <button
                onClick={handleSave}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl flex items-center gap-2 font-medium"
              >
                <Save className="w-5 h-5" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
