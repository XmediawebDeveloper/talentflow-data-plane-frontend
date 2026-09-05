'use client';

import { useState } from 'react';
import { ArrowLeft, X, HelpCircle, Send, Ticket, Clock, CheckCircle, MessageSquare, AlertCircle, FileText, Upload, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface SupportTicket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: 'resume-upload' | 'job-posting' | 'candidate-management' | 'assessment' | 'billing' | 'technical' | 'feature-request' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  createdAt: string;
  updatedAt: string;
  assignedAgent?: string;
  attachments?: { name: string; size: string; url: string }[];
  responses?: { 
    id: string;
    from: 'user' | 'support';
    message: string;
    timestamp: string;
    agentName?: string;
  }[];
}

interface SupportTicketPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportTicketPanel({ isOpen, onClose }: SupportTicketPanelProps) {
  const [view, setView] = useState<'main' | 'submit' | 'tickets' | 'detail'>('main');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SupportTicket['category']>('technical');
  const [priority, setPriority] = useState<SupportTicket['priority']>('medium');
  const [attachments, setAttachments] = useState<File[]>([]);

  // Mock tickets data
  const [tickets] = useState<SupportTicket[]>([
    {
      id: '1',
      ticketNumber: 'TF-2024-001',
      title: 'Unable to upload bulk resumes',
      description: 'Getting an error when trying to upload multiple resumes at once. The upload fails after 5 files.',
      category: 'resume-upload',
      priority: 'high',
      status: 'in-progress',
      createdAt: '2024-12-02T10:30:00Z',
      updatedAt: '2024-12-03T14:20:00Z',
      assignedAgent: 'Sarah Chen',
      responses: [
        {
          id: 'r1',
          from: 'user',
          message: 'Unable to upload bulk resumes. Getting an error after 5 files.',
          timestamp: '2024-12-02T10:30:00Z'
        },
        {
          id: 'r2',
          from: 'support',
          message: 'Hi! We\'re looking into this issue. Can you confirm the file size of the resumes you\'re trying to upload?',
          timestamp: '2024-12-02T15:45:00Z',
          agentName: 'Sarah Chen'
        },
        {
          id: 'r3',
          from: 'user',
          message: 'Each file is around 2-3MB. Total would be around 15MB for 5 files.',
          timestamp: '2024-12-03T09:15:00Z'
        },
        {
          id: 'r4',
          from: 'support',
          message: 'Thanks for confirming. We\'ve identified the issue and are deploying a fix. You should be able to upload bulk resumes by end of day.',
          timestamp: '2024-12-03T14:20:00Z',
          agentName: 'Sarah Chen'
        }
      ]
    },
    {
      id: '2',
      ticketNumber: 'TF-2024-002',
      title: 'Feature request: Export candidates to CSV',
      description: 'Would be great to have an option to export all candidates for a job to CSV format.',
      category: 'feature-request',
      priority: 'low',
      status: 'open',
      createdAt: '2024-12-01T09:15:00Z',
      updatedAt: '2024-12-01T09:15:00Z',
      responses: [
        {
          id: 'r1',
          from: 'user',
          message: 'Would be great to have an option to export all candidates for a job to CSV format for sharing with hiring managers.',
          timestamp: '2024-12-01T09:15:00Z'
        }
      ]
    },
    {
      id: '3',
      ticketNumber: 'TF-2024-003',
      title: 'AI scoring not working for Senior Developer role',
      description: 'The AI match scoring feature seems to be stuck for the Senior Developer position.',
      category: 'assessment',
      priority: 'urgent',
      status: 'resolved',
      createdAt: '2024-11-28T16:00:00Z',
      updatedAt: '2024-11-29T10:30:00Z',
      assignedAgent: 'Michael Johnson',
      responses: [
        {
          id: 'r1',
          from: 'user',
          message: 'The AI match scoring feature seems to be stuck for the Senior Developer position. It\'s been processing for over 30 minutes.',
          timestamp: '2024-11-28T16:00:00Z'
        },
        {
          id: 'r2',
          from: 'support',
          message: 'We\'ve restarted the scoring process. Please try again and let us know if the issue persists.',
          timestamp: '2024-11-28T18:30:00Z',
          agentName: 'Michael Johnson'
        },
        {
          id: 'r3',
          from: 'user',
          message: 'Working now, thanks!',
          timestamp: '2024-11-29T09:00:00Z'
        },
        {
          id: 'r4',
          from: 'support',
          message: 'Great! I\'m marking this as resolved. Feel free to reopen if needed.',
          timestamp: '2024-11-29T10:30:00Z',
          agentName: 'Michael Johnson'
        }
      ]
    }
  ]);

  const categories = [
    { value: 'resume-upload', label: 'Resume Upload Issues' },
    { value: 'job-posting', label: 'Job Posting' },
    { value: 'candidate-management', label: 'Candidate Management' },
    { value: 'assessment', label: 'Assessment & Scoring' },
    { value: 'billing', label: 'Billing & Subscription' },
    { value: 'technical', label: 'Technical Issue' },
    { value: 'feature-request', label: 'Feature Request' },
    { value: 'other', label: 'Other' }
  ];

  const priorities = [
    { value: 'low', label: 'Low', color: 'text-gray-600 bg-gray-100' },
    { value: 'medium', label: 'Medium', color: 'text-gray-800 bg-gray-100' },
    { value: 'high', label: 'High', color: 'text-orange-600 bg-orange-100' },
    { value: 'urgent', label: 'Urgent', color: 'text-red-600 bg-red-100' }
  ];

  const handleSubmitTicket = () => {
    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    // sonner's API is toast.success(message, options) - passing a single object made the
    // object itself the message, so the confirmation never rendered as intended.
    toast.success('Support Ticket Submitted!', {
      description: `Ticket #TF-2024-${String(tickets.length + 1).padStart(3, '0')} created. We'll respond within 24 hours.`,
    });

    // Reset form
    setTitle('');
    setDescription('');
    setCategory('technical');
    setPriority('medium');
    setAttachments([]);
    setView('main');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments(prev => [...prev, ...newFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const getStatusBadge = (status: SupportTicket['status']) => {
    const styles = {
      'open': 'bg-gray-100 text-gray-900 border-gray-300',
      'in-progress': 'bg-yellow-100 text-yellow-700 border-yellow-300',
      'resolved': 'bg-green-100 text-green-700 border-green-300',
      'closed': 'bg-gray-100 text-gray-700 border-gray-300'
    };

    const icons = {
      'open': <Ticket className="w-3 h-3" />,
      'in-progress': <Clock className="w-3 h-3" />,
      'resolved': <CheckCircle className="w-3 h-3" />,
      'closed': <CheckCircle className="w-3 h-3" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${styles[status]}`}>
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
      </span>
    );
  };

  const getPriorityBadge = (priority: SupportTicket['priority']) => {
    const priorityData = priorities.find(p => p.value === priority);
    return (
      <span className={`px-2 py-1 rounded text-xs ${priorityData?.color}`}>
        {priorityData?.label}
      </span>
    );
  };

  const getCategoryLabel = (category: string) => {
    return categories.find(c => c.value === category)?.label || category;
  };

  const filteredTickets = tickets.filter(ticket =>
    ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ticket.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[500px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <HelpCircle className="w-5 h-5 text-gray-800" />
            </div>
            <div>
              <h2 className="text-gray-900">Support Center</h2>
              <p className="text-sm text-gray-600">We're here to help</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
           aria-label="Close">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Main Menu */}
          {view === 'main' && (
            <div className="p-6 space-y-4">
              <div className="bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm text-gray-800 mb-1">Need Help?</h3>
                <p className="text-xs text-gray-900">
                  Submit a ticket or browse your existing support requests.
                </p>
              </div>

              <button
                onClick={() => setView('submit')}
                className="w-full flex items-center gap-3 p-4 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
              >
                <Send className="w-5 h-5" />
                <div className="text-left">
                  <div className="text-sm">Submit New Ticket</div>
                  <div className="text-xs opacity-90">Report an issue or request help</div>
                </div>
              </button>

              <button
                onClick={() => setView('tickets')}
                className="w-full flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Ticket className="w-5 h-5 text-gray-600" />
                <div className="text-left">
                  <div className="text-sm text-gray-900">My Tickets</div>
                  <div className="text-xs text-gray-600">View and track your support tickets</div>
                </div>
              </button>

              {/* Recent Tickets Preview */}
              <div className="mt-6">
                <h3 className="text-sm text-gray-900 mb-3">Recent Tickets</h3>
                <div className="space-y-2">
                  {tickets.slice(0, 3).map(ticket => (
                    <button
                      key={ticket.id}
                      onClick={() => {
                        setSelectedTicket(ticket);
                        setView('detail');
                      }}
                      className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs text-gray-600">{ticket.ticketNumber}</span>
                        {getStatusBadge(ticket.status)}
                      </div>
                      <div className="text-sm text-gray-900 mb-1 truncate">{ticket.title}</div>
                      <div className="text-xs text-gray-600">{formatISTDate(ticket.updatedAt)}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Help */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm text-gray-900 mb-3">Quick Help</h3>
                <div className="space-y-2">
                  <a href="#" className="block text-sm text-gray-800 hover:text-gray-900">
                    📚 Knowledge Base
                  </a>
                  <a href="#" className="block text-sm text-gray-800 hover:text-gray-900">
                    🎥 Video Tutorials
                  </a>
                  <a href="#" className="block text-sm text-gray-800 hover:text-gray-900">
                    ❓ FAQs
                  </a>
                  <a href="#" className="block text-sm text-gray-800 hover:text-gray-900">
                    📧 Email Support: support@talentflow.com
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Submit Ticket Form */}
          {view === 'submit' && (
            <div className="p-6">
              <button
                onClick={() => setView('main')}
                className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <h3 className="text-gray-900 mb-4">Submit Support Ticket</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief description of your issue"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1.5">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SupportTicket['category'])}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    {categories.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1.5">
                    Priority <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as SupportTicket['priority'])}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    {priorities.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1.5">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please provide detailed information about your issue..."
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1.5">
                    Attachments (Optional)
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                    <input
                      type="file"
                      id="file-upload"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer flex flex-col items-center"
                    >
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-600">
                        Click to upload files
                      </span>
                      <span className="text-xs text-gray-500 mt-1">
                        Screenshots, logs, or documents
                      </span>
                    </label>
                  </div>

                  {attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {attachments.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-600" />
                            <span className="text-sm text-gray-900">{file.name}</span>
                            <span className="text-xs text-gray-500">
                              ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <button
                            onClick={() => removeAttachment(index)}
                            className="p-1 hover:bg-gray-200 rounded"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setView('main')}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitTicket}
                    className="flex-1 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Submit Ticket
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* All Tickets List */}
          {view === 'tickets' && (
            <div className="p-6">
              <button
                onClick={() => setView('main')}
                className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-900">My Support Tickets</h3>
                <span className="text-sm text-gray-600">{tickets.length} tickets</span>
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tickets..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>

              {/* Tickets List */}
              <div className="space-y-3">
                {filteredTickets.map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() => {
                      setSelectedTicket(ticket);
                      setView('detail');
                    }}
                    className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-xs text-gray-600 block mb-1">{ticket.ticketNumber}</span>
                        <h4 className="text-sm text-gray-900">{ticket.title}</h4>
                      </div>
                      {getStatusBadge(ticket.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span>{getCategoryLabel(ticket.category)}</span>
                      <span>•</span>
                      {getPriorityBadge(ticket.priority)}
                      <span>•</span>
                      <span>{formatISTDate(ticket.updatedAt)}</span>
                    </div>
                  </button>
                ))}

                {filteredTickets.length === 0 && (
                  <div className="text-center py-10">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted/50 border border-border flex items-center justify-center">
                      <Ticket className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">No tickets found</p>
                    <p className="text-xs text-muted-foreground">Try adjusting your search or filters</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ticket Detail View */}
          {view === 'detail' && selectedTicket && (
            <div className="p-6">
              <button
                onClick={() => setView('tickets')}
                className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Tickets
              </button>

              {/* Ticket Header */}
              <div className="mb-4 pb-4 border-b border-gray-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-xs text-gray-600 block mb-1">{selectedTicket.ticketNumber}</span>
                    <h3 className="text-gray-900">{selectedTicket.title}</h3>
                  </div>
                  {getStatusBadge(selectedTicket.status)}
                </div>
                
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-xs text-gray-600">{getCategoryLabel(selectedTicket.category)}</span>
                  <span className="text-xs text-gray-400">•</span>
                  {getPriorityBadge(selectedTicket.priority)}
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-600">Created {formatISTDate(selectedTicket.createdAt)}</span>
                </div>

                {selectedTicket.assignedAgent && (
                  <div className="mt-2 text-xs text-gray-600">
                    Assigned to: <span className="text-gray-900">{selectedTicket.assignedAgent}</span>
                  </div>
                )}
              </div>

              {/* Conversation */}
              <div className="space-y-4">
                {selectedTicket.responses?.map((response) => (
                  <div
                    key={response.id}
                    className={`${
                      response.from === 'user'
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-gray-50 border-gray-200'
                    } border rounded-lg p-4`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {response.from === 'user' ? (
                        <div className="w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center text-white text-xs">
                          U
                        </div>
                      ) : (
                        <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-white text-xs">
                          S
                        </div>
                      )}
                      <div>
                        <div className="text-xs text-gray-900">
                          {response.from === 'user' ? 'You' : response.agentName || 'Support Team'}
                        </div>
                        <div className="text-xs text-gray-500">{formatISTDate(response.timestamp)}</div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700">{response.message}</p>
                  </div>
                ))}
              </div>

              {/* Reply Box (if not closed/resolved) */}
              {selectedTicket.status !== 'closed' && selectedTicket.status !== 'resolved' && (
                <div className="mt-4">
                  <textarea
                    placeholder="Add a reply..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none"
                  />
                  <button className="mt-2 w-full px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center justify-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Send Reply
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
