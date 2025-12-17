import { useState } from 'react';
import { 
  HelpCircle, Send, Ticket, Clock, CheckCircle, MessageSquare, AlertCircle, 
  FileText, Upload, Trash2, Search, X, ArrowLeft, Filter, Download, ExternalLink,
  CheckCircle2, Circle, Clock3, XCircle, ChevronDown, Mail, Phone, Globe, Book,
  Video, FileQuestion, Tag, User, Calendar, Paperclip
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';

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

export default function SupportCenter() {
  const [view, setView] = useState<'overview' | 'submit' | 'tickets' | 'detail' | 'knowledge-base'>('overview');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [replyMessage, setReplyMessage] = useState('');

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SupportTicket['category']>('technical');
  const [priority, setPriority] = useState<SupportTicket['priority']>('medium');
  const [attachments, setAttachments] = useState<File[]>([]);

  // Mock tickets data
  const [tickets, setTickets] = useState<SupportTicket[]>([
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
    },
    {
      id: '4',
      ticketNumber: 'TF-2024-004',
      title: 'Cannot access job posting page',
      description: 'Getting a 404 error when trying to access the job posting page.',
      category: 'technical',
      priority: 'high',
      status: 'open',
      createdAt: '2024-12-04T08:00:00Z',
      updatedAt: '2024-12-04T08:00:00Z',
      responses: [
        {
          id: 'r1',
          from: 'user',
          message: 'Getting a 404 error when trying to access the job posting page. This is urgent as I need to post a new position.',
          timestamp: '2024-12-04T08:00:00Z'
        }
      ]
    },
    {
      id: '5',
      ticketNumber: 'TF-2024-005',
      title: 'Billing discrepancy on latest invoice',
      description: 'The invoice shows a different amount than what was quoted.',
      category: 'billing',
      priority: 'medium',
      status: 'closed',
      createdAt: '2024-11-25T14:30:00Z',
      updatedAt: '2024-11-26T16:00:00Z',
      assignedAgent: 'Alex Martinez',
      responses: [
        {
          id: 'r1',
          from: 'user',
          message: 'The invoice shows a different amount than what was quoted in the initial sales call.',
          timestamp: '2024-11-25T14:30:00Z'
        },
        {
          id: 'r2',
          from: 'support',
          message: 'I\'ve reviewed your account and the invoice. The difference is due to additional user seats added mid-cycle. Let me send you a detailed breakdown.',
          timestamp: '2024-11-25T16:45:00Z',
          agentName: 'Alex Martinez'
        },
        {
          id: 'r3',
          from: 'user',
          message: 'That makes sense now. Thanks for the clarification!',
          timestamp: '2024-11-26T10:00:00Z'
        },
        {
          id: 'r4',
          from: 'support',
          message: 'You\'re welcome! I\'ve also sent a detailed billing guide to your email. Closing this ticket now.',
          timestamp: '2024-11-26T16:00:00Z',
          agentName: 'Alex Martinez'
        }
      ]
    }
  ]);

  const categories = [
    { value: 'resume-upload', label: 'Resume Upload Issues', icon: Upload },
    { value: 'job-posting', label: 'Job Posting', icon: Briefcase },
    { value: 'candidate-management', label: 'Candidate Management', icon: User },
    { value: 'assessment', label: 'Assessment & Scoring', icon: CheckCircle },
    { value: 'billing', label: 'Billing & Subscription', icon: FileText },
    { value: 'technical', label: 'Technical Issue', icon: AlertCircle },
    { value: 'feature-request', label: 'Feature Request', icon: Lightbulb },
    { value: 'other', label: 'Other', icon: HelpCircle }
  ];

  const priorities = [
    { value: 'low', label: 'Low', color: 'text-gray-600 bg-gray-100 border-gray-300' },
    { value: 'medium', label: 'Medium', color: 'text-blue-600 bg-blue-100 border-blue-300' },
    { value: 'high', label: 'High', color: 'text-orange-600 bg-orange-100 border-orange-300' },
    { value: 'urgent', label: 'Urgent', color: 'text-red-600 bg-red-100 border-red-300' }
  ];

  const handleSubmitTicket = () => {
    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newTicket: SupportTicket = {
      id: String(tickets.length + 1),
      ticketNumber: `TF-2024-${String(tickets.length + 1).padStart(3, '0')}`,
      title,
      description,
      category,
      priority,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responses: [
        {
          id: 'r1',
          from: 'user',
          message: description,
          timestamp: new Date().toISOString()
        }
      ]
    };

    setTickets([newTicket, ...tickets]);

    toast.success({
      title: 'Support Ticket Submitted!',
      description: `Ticket #${newTicket.ticketNumber} created. We'll respond within 24 hours.`,
    });

    // Reset form
    setTitle('');
    setDescription('');
    setCategory('technical');
    setPriority('medium');
    setAttachments([]);
    setView('tickets');
  };

  const handleSendReply = () => {
    if (!replyMessage.trim() || !selectedTicket) return;

    const newResponse = {
      id: `r${(selectedTicket.responses?.length || 0) + 1}`,
      from: 'user' as const,
      message: replyMessage,
      timestamp: new Date().toISOString()
    };

    const updatedTicket = {
      ...selectedTicket,
      responses: [...(selectedTicket.responses || []), newResponse],
      updatedAt: new Date().toISOString()
    };

    setTickets(tickets.map(t => t.id === selectedTicket.id ? updatedTicket : t));
    setSelectedTicket(updatedTicket);
    setReplyMessage('');

    toast.success('Reply sent successfully');
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
      'open': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: Circle },
      'in-progress': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', icon: Clock3 },
      'resolved': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: CheckCircle2 },
      'closed': { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: XCircle }
    };

    const style = styles[status];
    const Icon = style.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${style.bg} ${style.text} ${style.border}`}>
        <Icon className="w-3.5 h-3.5" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
      </span>
    );
  };

  const getPriorityBadge = (priority: SupportTicket['priority']) => {
    const priorityData = priorities.find(p => p.value === priority);
    return (
      <span className={`px-2.5 py-1 rounded text-xs border ${priorityData?.color}`}>
        {priorityData?.label}
      </span>
    );
  };

  const getCategoryLabel = (category: string) => {
    return categories.find(c => c.value === category)?.label || category;
  };

  const getCategoryIcon = (category: string) => {
    const cat = categories.find(c => c.value === category);
    return cat?.icon || HelpCircle;
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = 
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || ticket.priority === filterPriority;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return 'Yesterday';
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Stats
  const openTickets = tickets.filter(t => t.status === 'open').length;
  const inProgressTickets = tickets.filter(t => t.status === 'in-progress').length;
  const resolvedTickets = tickets.filter(t => t.status === 'resolved').length;

  return (
    <div className="flex-1 bg-gray-50 h-screen overflow-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg">
                <HelpCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-gray-900">Support Center</h1>
                <p className="text-sm text-gray-600">Get help and manage your support tickets</p>
              </div>
            </div>

            {view !== 'overview' && view !== 'submit' && (
              <button
                onClick={() => setView('submit')}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
                New Ticket
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {/* Overview */}
        {view === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Open Tickets</span>
                  <Circle className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-3xl text-gray-900 mb-1">{openTickets}</div>
                <div className="text-xs text-gray-500">Awaiting response</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">In Progress</span>
                  <Clock3 className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="text-3xl text-gray-900 mb-1">{inProgressTickets}</div>
                <div className="text-xs text-gray-500">Being worked on</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Resolved</span>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-3xl text-gray-900 mb-1">{resolvedTickets}</div>
                <div className="text-xs text-gray-500">Successfully solved</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Total Tickets</span>
                  <Ticket className="w-5 h-5 text-gray-600" />
                </div>
                <div className="text-3xl text-gray-900 mb-1">{tickets.length}</div>
                <div className="text-xs text-gray-500">All time</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={() => setView('submit')}
                className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl shadow-lg p-8 text-left hover:from-blue-700 hover:to-blue-800 transition-all"
              >
                <Send className="w-8 h-8 mb-4" />
                <h3 className="text-white mb-2">Submit New Ticket</h3>
                <p className="text-sm text-blue-100">
                  Report an issue or request help from our support team
                </p>
              </button>

              <button
                onClick={() => setView('tickets')}
                className="bg-white border-2 border-gray-200 rounded-xl shadow-sm p-8 text-left hover:border-blue-300 hover:shadow-md transition-all"
              >
                <Ticket className="w-8 h-8 text-blue-600 mb-4" />
                <h3 className="text-gray-900 mb-2">View My Tickets</h3>
                <p className="text-sm text-gray-600">
                  Track and manage all your support requests
                </p>
              </button>
            </div>

            {/* Recent Tickets */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-gray-900">Recent Tickets</h3>
                <button
                  onClick={() => setView('tickets')}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  View All →
                </button>
              </div>

              <div className="space-y-3">
                {tickets.slice(0, 5).map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() => {
                      setSelectedTicket(ticket);
                      setView('detail');
                    }}
                    className="w-full text-left p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <span className="text-xs text-gray-600 block mb-1">{ticket.ticketNumber}</span>
                        <h4 className="text-sm text-gray-900">{ticket.title}</h4>
                      </div>
                      {getStatusBadge(ticket.status)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span>{getCategoryLabel(ticket.category)}</span>
                      <span>•</span>
                      {getPriorityBadge(ticket.priority)}
                      <span>•</span>
                      <span>{formatDate(ticket.updatedAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Help Resources */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button
                onClick={() => setView('knowledge-base')}
                className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-left hover:border-blue-300 hover:shadow-md transition-all"
              >
                <Book className="w-6 h-6 text-blue-600 mb-3" />
                <h4 className="text-gray-900 mb-2">Knowledge Base</h4>
                <p className="text-sm text-gray-600">
                  Browse articles and guides
                </p>
              </button>

              <a
                href="#"
                className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-left hover:border-blue-300 hover:shadow-md transition-all"
              >
                <Video className="w-6 h-6 text-blue-600 mb-3" />
                <h4 className="text-gray-900 mb-2">Video Tutorials</h4>
                <p className="text-sm text-gray-600">
                  Watch step-by-step guides
                </p>
              </a>

              <a
                href="#"
                className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-left hover:border-blue-300 hover:shadow-md transition-all"
              >
                <FileQuestion className="w-6 h-6 text-blue-600 mb-3" />
                <h4 className="text-gray-900 mb-2">FAQs</h4>
                <p className="text-sm text-gray-600">
                  Find quick answers
                </p>
              </a>
            </div>

            {/* Contact Information */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
              <h3 className="text-gray-900 mb-4">Need Immediate Help?</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="text-xs text-gray-600">Email</div>
                    <div className="text-sm text-gray-900">support@talentflow.com</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="text-xs text-gray-600">Phone</div>
                    <div className="text-sm text-gray-900">1-800-TALENT-1</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="text-xs text-gray-600">Hours</div>
                    <div className="text-sm text-gray-900">Mon-Fri, 9AM-6PM EST</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Submit Ticket Form */}
        {view === 'submit' && (
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-gray-900 mb-6">Submit Support Ticket</h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief description of your issue"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as SupportTicket['category'])}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {categories.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      Priority <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as SupportTicket['priority'])}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {priorities.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please provide detailed information about your issue..."
                    rows={8}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Attachments (Optional)
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
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
                      <Upload className="w-12 h-12 text-gray-400 mb-3" />
                      <span className="text-sm text-gray-900 mb-1">
                        Click to upload files
                      </span>
                      <span className="text-xs text-gray-500">
                        Screenshots, logs, or documents (Max 10MB each)
                      </span>
                    </label>
                  </div>

                  {attachments.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {attachments.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-gray-600" />
                            <div>
                              <div className="text-sm text-gray-900">{file.name}</div>
                              <div className="text-xs text-gray-500">
                                {(file.size / 1024).toFixed(1)} KB
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => removeAttachment(index)}
                            className="p-2 hover:bg-gray-200 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => setView('overview')}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitTicket}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Submit Ticket
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* All Tickets List */}
        {view === 'tickets' && (
          <div>
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              {/* Filters */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tickets..."
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Status</option>
                    <option value="open">Open</option>
                    <option value="in-progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>

                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Tickets Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs text-gray-600">Ticket #</th>
                      <th className="px-6 py-4 text-left text-xs text-gray-600">Title</th>
                      <th className="px-6 py-4 text-left text-xs text-gray-600">Category</th>
                      <th className="px-6 py-4 text-left text-xs text-gray-600">Priority</th>
                      <th className="px-6 py-4 text-left text-xs text-gray-600">Status</th>
                      <th className="px-6 py-4 text-left text-xs text-gray-600">Updated</th>
                      <th className="px-6 py-4 text-left text-xs text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredTickets.map(ticket => {
                      const CategoryIcon = getCategoryIcon(ticket.category);
                      return (
                        <tr key={ticket.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-900">{ticket.ticketNumber}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900 max-w-md truncate">{ticket.title}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <CategoryIcon className="w-4 h-4 text-gray-600" />
                              <span className="text-sm text-gray-600">{getCategoryLabel(ticket.category)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {getPriorityBadge(ticket.priority)}
                          </td>
                          <td className="px-6 py-4">
                            {getStatusBadge(ticket.status)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600">{formatDate(ticket.updatedAt)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => {
                                setSelectedTicket(ticket);
                                setView('detail');
                              }}
                              className="text-sm text-blue-600 hover:text-blue-700"
                            >
                              View Details →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filteredTickets.length === 0 && (
                  <div className="text-center py-12">
                    <Ticket className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <p className="text-sm text-gray-600">No tickets found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Ticket Detail View */}
        {view === 'detail' && selectedTicket && (
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => setView('tickets')}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to All Tickets
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Ticket Header */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span className="text-xs text-gray-600 block mb-2">{selectedTicket.ticketNumber}</span>
                      <h2 className="text-gray-900 mb-3">{selectedTicket.title}</h2>
                      <div className="flex flex-wrap items-center gap-3">
                        {getStatusBadge(selectedTicket.status)}
                        {getPriorityBadge(selectedTicket.priority)}
                        <span className="text-xs text-gray-600">
                          {getCategoryLabel(selectedTicket.category)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conversation */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-gray-900 mb-6">Conversation</h3>
                  
                  <div className="space-y-6">
                    {selectedTicket.responses?.map((response) => (
                      <div
                        key={response.id}
                        className={`${
                          response.from === 'user'
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-gray-50 border-gray-200'
                        } border rounded-lg p-5`}
                      >
                        <div className="flex items-start gap-4 mb-3">
                          {response.from === 'user' ? (
                            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white flex-shrink-0">
                              U
                            </div>
                          ) : (
                            <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white flex-shrink-0">
                              S
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-gray-900">
                                {response.from === 'user' ? 'You' : response.agentName || 'Support Team'}
                              </span>
                              <span className="text-xs text-gray-500">{formatDate(response.timestamp)}</span>
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed">{response.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reply Box */}
                  {selectedTicket.status !== 'closed' && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <label className="block text-sm text-gray-700 mb-2">Add Reply</label>
                      <textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type your message..."
                        rows={4}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <div className="flex justify-end mt-3">
                        <button
                          onClick={handleSendReply}
                          disabled={!replyMessage.trim()}
                          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Send Reply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Ticket Info */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h4 className="text-sm text-gray-900 mb-4">Ticket Information</h4>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Created</div>
                      <div className="text-sm text-gray-900">{formatFullDate(selectedTicket.createdAt)}</div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Last Updated</div>
                      <div className="text-sm text-gray-900">{formatFullDate(selectedTicket.updatedAt)}</div>
                    </div>

                    {selectedTicket.assignedAgent && (
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Assigned Agent</div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-white text-xs">
                            {selectedTicket.assignedAgent.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="text-sm text-gray-900">{selectedTicket.assignedAgent}</div>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Responses</div>
                      <div className="text-sm text-gray-900">{selectedTicket.responses?.length || 0} messages</div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h4 className="text-sm text-gray-900 mb-4">Actions</h4>
                  
                  <div className="space-y-2">
                    <button className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm text-left flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download Transcript
                    </button>
                    
                    {selectedTicket.status === 'resolved' && (
                      <button className="w-full px-4 py-2.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm text-left flex items-center gap-2">
                        <ExternalLink className="w-4 h-4" />
                        Reopen Ticket
                      </button>
                    )}

                    {selectedTicket.status !== 'closed' && (
                      <button className="w-full px-4 py-2.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm text-left flex items-center gap-2">
                        <X className="w-4 h-4" />
                        Close Ticket
                      </button>
                    )}
                  </div>
                </div>

                {/* Related Articles */}
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
                  <h4 className="text-sm text-gray-900 mb-4">Related Help Articles</h4>
                  
                  <div className="space-y-2">
                    <a href="#" className="block text-sm text-blue-600 hover:text-blue-700">
                      → How to upload resumes
                    </a>
                    <a href="#" className="block text-sm text-blue-600 hover:text-blue-700">
                      → Resume upload troubleshooting
                    </a>
                    <a href="#" className="block text-sm text-blue-600 hover:text-blue-700">
                      → File format requirements
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Knowledge Base */}
        {view === 'knowledge-base' && (
          <div>
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-gray-900 mb-6">Knowledge Base</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categories.slice(0, 6).map(cat => {
                  const Icon = cat.icon;
                  return (
                    <a
                      key={cat.value}
                      href="#"
                      className="p-6 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all"
                    >
                      <Icon className="w-8 h-8 text-blue-600 mb-3" />
                      <h4 className="text-gray-900 mb-2">{cat.label}</h4>
                      <p className="text-sm text-gray-600">View articles and guides</p>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper icon component
function Lightbulb({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}

function Briefcase({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
