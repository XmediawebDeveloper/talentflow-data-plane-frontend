import { Bell, Search, Settings, ChevronDown, HelpCircle, LogOut, User, Shield, Zap, CreditCard, Book, MessageCircle, FileText, Video, Mail, Phone, ExternalLink, CheckCircle, Clock, AlertCircle, Info, Users, TrendingUp, Activity, Command } from 'lucide-react';
import { useState, useEffect } from 'react';
import { User as UserType } from '@/lib/types/tenant';
import NotificationCenter from './NotificationCenter';
import QuickActions from './QuickActions';
// FIX-010: Import Tooltip for icon buttons
import { Tooltip } from '@/components/ui/tooltip';
import { useQuota } from '@/contexts/QuotaContext';

interface HeaderProps {
  onLogout: () => void;
  user: UserType | null;
  tenant?: any;
  onOpenTour?: () => void;
  onOpenShortcuts?: () => void;
  onOpenSettings?: () => void;
}

export default function Header({ onLogout, user, tenant, onOpenTour, onOpenShortcuts, onOpenSettings }: HeaderProps) {
  if (!user) return null;
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const [tenantStatus, setTenantStatus] = useState<string | null>(null);

  // Use shared quota context instead of separate API call
  const { quotaData, loading: loadingQuota, error: quotaError, refetch: fetchQuotaStatus } = useQuota();

  // Listen for plan changes and unit consumption to refresh quota data
  useEffect(() => {
    const handlePlanChange = () => {
      console.log('[Header] Plan changed, refreshing quota...');
      fetchQuotaStatus();
    };

    const handleUnitsConsumed = () => {
      console.log('[Header] Units consumed, refreshing quota...');
      fetchQuotaStatus();
    };

    window.addEventListener('planChanged', handlePlanChange);
    window.addEventListener('unitsConsumed', handleUnitsConsumed);
    return () => {
      window.removeEventListener('planChanged', handlePlanChange);
      window.removeEventListener('unitsConsumed', handleUnitsConsumed);
    };
  }, [user]);
  
  // Calculate total units across all quota types (RU + RS + AS + AIU + max_seats)
  const calculateTotalUnits = () => {
    if (!quotaData?.quotas) return { remaining: 0, limit: 0, used: 0 };

    const quotas = quotaData.quotas;
    // Include all unit types: Resume Upload, Resume Scoring, Assessment, AI Interview, Max Users
    const allUnitTypes = ['RU', 'RS', 'AS', 'AIU', 'max_seats'];

    let totalRemaining = 0;
    let totalLimit = 0;
    let totalUsed = 0;

    allUnitTypes.forEach(quotaType => {
      if (quotas[quotaType]) {
        const quota = quotas[quotaType];
        // Skip unlimited quotas in the calculation
        if (quota.is_unlimited) return;

        totalRemaining += quota.total_remaining || 0;
        totalLimit += (quota.subscription?.limit || 0) + (quota.addon?.total_purchased || 0);
        totalUsed += quota.subscription?.used || 0;
      }
    });

    return { remaining: totalRemaining, limit: totalLimit, used: totalUsed };
  };

  const totalUnits = calculateTotalUnits();

  // Determine plan name based on status
  const getPlanDisplayName = () => {
    if (loadingQuota) return 'Loading...';
    if (tenantStatus === 'PENDING') return 'Account Pending';
    if (tenantStatus === 'SUSPENDED') return 'Account Suspended';
    if (tenantStatus === 'LOCKED') return 'Account Locked';
    if (quotaError) return 'Unable to load';
    return quotaData?.plan_name || 'No plan data';
  };

  const planName = getPlanDisplayName();
  const usagePercentage = totalUnits.limit > 0 ? ((totalUnits.used / totalUnits.limit) * 100) : 0;
  const isPendingStatus = tenantStatus === 'PENDING' || tenantStatus === 'SUSPENDED' || tenantStatus === 'LOCKED';

  const roleLabels = {
    tenant_admin: 'Owner',
    recruiter: 'Recruiter',
    viewer: 'Viewer',
  };

  const roleBadgeColors = {
    tenant_admin: 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white border-purple-600',
    recruiter: 'bg-gray-100 text-gray-600 border-gray-200',
    viewer: 'bg-gray-50 text-gray-500 border-gray-200',
  };
  
  return (
    <header className="h-[72px] bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm">
      <div className="flex items-center flex-1 max-w-2xl">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search candidates, jobs, assessments..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-gray-50 hover:bg-white transition-colors text-gray-900"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 ml-8">
        {/* FIX-010: Keyboard Shortcuts Button with Tooltip */}
        {onOpenShortcuts && (
          <Tooltip content="Keyboard Shortcuts (Cmd/Ctrl + /)" position="bottom">
            <button
              onClick={onOpenShortcuts}
              className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-300 hover:border-gray-400"
              aria-label="Keyboard Shortcuts"
            >
              <Command className="w-5 h-5" />
            </button>
          </Tooltip>
        )}

        {/* Quick Tour Button */}
        {onOpenTour && (
          <button
            onClick={onOpenTour}
            className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 hover:shadow-lg transition-all duration-200 flex items-center gap-2 group"
            title="Take a quick tour"
          >
            <Zap className="w-4 h-4 group-hover:animate-pulse" />
            <span className="text-sm font-medium">Quick Tour</span>
          </button>
        )}

        {/* FIX-010: Help & Support with Tooltip */}
        <div className="relative">
          <Tooltip content="Help & Support" position="bottom">
            <button
              onClick={() => {
                setShowHelpMenu(!showHelpMenu);
                setShowNotifications(false);
                setShowPlanMenu(false);
                setShowUserMenu(false);
              }}
              className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Help & Support"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </Tooltip>

          {showHelpMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowHelpMenu(false)}
              ></div>
              <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-20">
                <div className="px-4 py-3 bg-gray-800 text-white">
                  <h3 className="font-medium flex items-center gap-2">
                    <HelpCircle className="w-5 h-5" />
                    Help & Support
                  </h3>
                  <p className="text-sm text-gray-300 mt-1">Get the help you need</p>
                </div>

                <div className="p-4">
                  {/* Quick Actions */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button className="p-3 border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all group text-left">
                      <Book className="w-5 h-5 text-gray-700 mb-2" />
                      <div className="text-sm text-gray-900">Knowledge Base</div>
                      <div className="text-xs text-gray-500">Browse articles</div>
                    </button>
                    <button className="p-3 border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all group text-left">
                      <Video className="w-5 h-5 text-gray-600 mb-2" />
                      <div className="text-sm text-gray-900">Video Tutorials</div>
                      <div className="text-xs text-gray-500">Watch & learn</div>
                    </button>
                    <button className="p-3 border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all group text-left">
                      <FileText className="w-5 h-5 text-gray-600 mb-2" />
                      <div className="text-sm text-gray-900">Documentation</div>
                      <div className="text-xs text-gray-500">Full guides</div>
                    </button>
                    <button className="p-3 border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all group text-left">
                      <MessageCircle className="w-5 h-5 text-gray-500 mb-2" />
                      <div className="text-sm text-gray-900">Live Chat</div>
                      <div className="text-xs text-gray-500">Chat with us</div>
                    </button>
                  </div>

                  {/* Popular Articles */}
                  <div className="mb-4">
                    <h4 className="text-sm text-gray-900 mb-2">Popular Articles</h4>
                    <div className="space-y-2">
                      <button className="w-full text-left p-2 hover:bg-gray-50 rounded-lg transition-colors group">
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-900 group-hover:text-gray-700">Getting Started with TalentFlow</div>
                            <div className="text-xs text-gray-500">5 min read</div>
                          </div>
                        </div>
                      </button>
                      <button className="w-full text-left p-2 hover:bg-gray-50 rounded-lg transition-colors group">
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-900 group-hover:text-gray-700">How to Parse Resumes with AI</div>
                            <div className="text-xs text-gray-500">8 min read</div>
                          </div>
                        </div>
                      </button>
                      <button className="w-full text-left p-2 hover:bg-gray-50 rounded-lg transition-colors group">
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-900 group-hover:text-gray-700">Creating & Managing Assessments</div>
                            <div className="text-xs text-gray-500">10 min read</div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Contact Options */}
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm text-gray-900 mb-3">Contact Support</h4>
                    <div className="space-y-2">
                      <button className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors text-left">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                          <Mail className="w-4 h-4 text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">Email Support</div>
                          <div className="text-xs text-gray-500">support@talentflow.com</div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400" />
                      </button>
                      <button className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors text-left">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                          <Phone className="w-4 h-4 text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">Phone Support</div>
                          <div className="text-xs text-gray-500">+1 (800) 123-4567</div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-4">
                    <button className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium">
                      Open Support Ticket
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* FIX-010: Notifications with Tooltip */}
        <div className="relative">
          <Tooltip content="Notifications" position="bottom">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowHelpMenu(false);
                setShowPlanMenu(false);
                setShowUserMenu(false);
              }}
              className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
              <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">5</span>
            </button>
          </Tooltip>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowNotifications(false)}
              ></div>
              <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-20">
                <div className="px-4 py-3 bg-gray-800 text-white">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium flex items-center gap-2">
                      <Bell className="w-5 h-5" />
                      Notifications
                    </h3>
                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">5 new</span>
                  </div>
                  <p className="text-sm text-gray-300 mt-1">Stay updated with latest activities</p>
                </div>

                {/* Filter Tabs */}
                <div className="flex border-b border-gray-200 bg-gray-50">
                  <button className="flex-1 px-4 py-2 text-sm font-medium text-gray-900 border-b-2 border-gray-800 bg-white">
                    All (5)
                  </button>
                  <button className="flex-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                    Unread (3)
                  </button>
                  <button className="flex-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                    Mentions
                  </button>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {/* Notification Items */}
                  <div className="p-2 space-y-1">
                    {/* Success Notification */}
                    <button className="w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors border-l-4 border-green-500 bg-green-50/30">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm text-gray-900">Resume parsing completed</p>
                            <span className="text-xs text-gray-500 whitespace-nowrap">2m ago</span>
                          </div>
                          <p className="text-xs text-gray-600">Successfully parsed 24 resumes from "Software Engineer" batch</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-green-600 font-medium">View Results</span>
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Info Notification */}
                    <button className="w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors border-l-4 border-gray-500 bg-gray-50/30">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Info className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm text-gray-900">New candidate applied</p>
                            <span className="text-xs text-gray-500 whitespace-nowrap">15m ago</span>
                          </div>
                          <p className="text-xs text-gray-600">John Smith applied for "Senior React Developer" position</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-gray-700 font-medium">Review Application</span>
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Warning Notification */}
                    <button className="w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors border-l-4 border-orange-500 bg-orange-50/30">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <AlertCircle className="w-5 h-5 text-orange-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm text-gray-900">Assessment deadline approaching</p>
                            <span className="text-xs text-gray-500 whitespace-nowrap">1h ago</span>
                          </div>
                          <p className="text-xs text-gray-600">Python Developer assessment closes in 24 hours</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-orange-600 font-medium">Extend Deadline</span>
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Clock Notification */}
                    <button className="w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Clock className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm text-gray-900">Scheduled AI Interview starting soon</p>
                            <span className="text-xs text-gray-500 whitespace-nowrap">2h ago</span>
                          </div>
                          <p className="text-xs text-gray-600">Interview with Sarah Johnson begins at 3:00 PM</p>
                        </div>
                      </div>
                    </button>

                    {/* Info Notification */}
                    <button className="w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm text-gray-900">Team member added</p>
                            <span className="text-xs text-gray-500 whitespace-nowrap">3h ago</span>
                          </div>
                          <p className="text-xs text-gray-600">Mike Johnson joined your recruitment team</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="border-t border-gray-200 p-3 bg-gray-50 flex gap-2">
                  <button className="flex-1 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium">
                    Mark All Read
                  </button>
                  <button className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium">
                    View All
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Plan & Unit Balance Display */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl">
          <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm border border-gray-200">
            <CreditCard className="w-5 h-5 text-gray-600" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-semibold text-gray-900 truncate max-w-[140px]" title={loadingQuota ? 'Loading...' : planName}>
              {loadingQuota ? 'Loading...' : planName}
            </span>
            {!loadingQuota && !quotaError && !isPendingStatus && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-gray-700">{totalUnits.remaining.toLocaleString()}</span>
                <span className="text-xs text-gray-500">units left</span>
              </div>
            )}
            {isPendingStatus && (
              <span className="text-xs text-orange-600 font-medium">
                {tenantStatus}
              </span>
            )}
          </div>
          {!loadingQuota && !quotaError && !isPendingStatus && totalUnits.limit > 0 && (
            <div className="w-16 h-2 bg-white/60 rounded-full overflow-hidden border border-gray-200">
              <div
                className={`h-full rounded-full transition-all ${
                  usagePercentage > 90 ? 'bg-red-500' :
                  usagePercentage > 70 ? 'bg-yellow-500' : 'bg-gray-600'
                }`}
                style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* FIX-010: Settings with Tooltip */}
        <Tooltip content="Settings" position="bottom">
          <button
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </Tooltip>

        <div className="h-8 w-px bg-gray-200 mx-2" />

        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowPlanMenu(false);
            }}
            className="flex items-center gap-3 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-gray-700 text-white flex items-center justify-center shadow-sm">
              <span className="text-sm">{(user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}</span>
            </div>
            <div className="text-left">
              <div className="text-sm text-gray-900">{user.name || user.email || 'User'}</div>
              <div className="text-xs text-gray-500">{roleLabels[user.role]}</div>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              ></div>
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-20">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-900">{user.name}</p>
                    <span className={`px-2 py-0.5 rounded text-xs border ${roleBadgeColors[user.role]}`}>
                      {roleLabels[user.role]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                
                {/* Permissions Summary */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Your Permissions
                  </p>
                  <div className="space-y-1 text-xs">
                    {user.permissions.can_manage_users && (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <span className="w-1 h-1 bg-green-600 rounded-full"></span>
                        Manage Users & Tenants
                      </div>
                    )}
                    {user.permissions.can_view_analytics && (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <span className="w-1 h-1 bg-green-600 rounded-full"></span>
                        View Analytics
                      </div>
                    )}
                    {user.permissions.can_manage_settings && (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <span className="w-1 h-1 bg-green-600 rounded-full"></span>
                        Manage Settings
                      </div>
                    )}
                    {!user.permissions.can_manage_users && (
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                        Admin Features (restricted)
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="py-2">
                  <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3">
                    <User className="w-4 h-4" />
                    Profile Settings
                  </button>
                  <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3">
                    <Settings className="w-4 h-4" />
                    Account Settings
                  </button>
                </div>
                <div className="border-t border-gray-100 pt-2">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}