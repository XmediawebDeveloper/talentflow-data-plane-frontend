'use client';

import { useState, useEffect } from 'react';
import { User, Tenant, UserRole } from '@/lib/types/tenant';
import { Clock, Building2, CreditCard, CalendarDays } from 'lucide-react';
import { useQuota } from '@/contexts/QuotaContext';

interface WelcomeBannerProps {
  user?: User;
  tenant?: Tenant;
}

const roleLabels: Record<UserRole, string> = {
  tenant_admin: 'Owner',
  recruiter: 'Recruiter',
  viewer: 'Viewer',
  billing_manager: 'Billing',
  standard_user: 'User',
};

const roleBadgeColors: Record<UserRole, string> = {
  tenant_admin: 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white',
  recruiter: 'bg-blue-100 text-blue-800',
  viewer: 'bg-gray-100 text-gray-600',
  billing_manager: 'bg-green-100 text-green-800',
  standard_user: 'bg-gray-100 text-gray-700',
};

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDateTime(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) + ' \u00B7 ' + date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatLastLogin(lastLogin: string): string {
  const loginDate = new Date(lastLogin);
  const now = new Date();
  const diffMs = now.getTime() - loginDate.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return loginDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function WelcomeBanner({ user, tenant }: WelcomeBannerProps) {
  const [now, setNow] = useState(() => new Date());
  const { quotaData } = useQuota();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const greeting = getGreeting(now.getHours());

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-gray-800 via-gray-900 to-indigo-950 p-6 text-white shadow-lg">
      {/* Subtle decorative circles */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute -bottom-8 -right-20 h-56 w-56 rounded-full bg-indigo-500/10" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Avatar + Greeting */}
        <div className="block sm:flex sm:items-center sm:gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg font-semibold ring-2 ring-white/20">
            {user?.name ? getInitials(user.name) : 'U'}
          </div>
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">
              {greeting}, {firstName}!
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-300">
              {user?.role && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadgeColors[user.role]}`}>
                  {roleLabels[user.role]}
                </span>
              )}
              {tenant?.name && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {tenant.name}
                </span>
              )}
              {(quotaData?.plan_name || tenant?.subscription?.planName) && (
                <span className="inline-flex items-center gap-1 text-indigo-300">
                  <CreditCard className="h-3.5 w-3.5" />
                  {quotaData?.plan_name || tenant?.subscription?.planName || '-'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Date/Time + Last Login */}
        <div className="flex flex-col items-start gap-1 text-sm text-gray-300 sm:items-end">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            {formatDateTime(now)}
          </span>
          {user?.lastLogin ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              Last login: {formatLastLogin(user.lastLogin)}
            </span>
          ) : user?.createdAt ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
