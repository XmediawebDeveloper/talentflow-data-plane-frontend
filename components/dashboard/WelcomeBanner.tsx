'use client';

import { useState, useEffect } from 'react';
import { User, Tenant, UserRole } from '@/lib/types/tenant';
import { Clock, Building2, CreditCard, CalendarDays } from 'lucide-react';
import { useQuota } from '@/contexts/QuotaContext';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import NameAvatar from '@/components/ui/name-avatar';

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
  tenant_admin: 'bg-white text-brand-blue ring-1 ring-white/40',
  recruiter: 'bg-brand-cyan text-white ring-1 ring-white/30',
  viewer: 'bg-white/85 text-gray-700 ring-1 ring-white/30',
  billing_manager: 'bg-brand-orange text-white ring-1 ring-white/30',
  standard_user: 'bg-white/85 text-gray-800 ring-1 ring-white/30',
};

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDateTime(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) + ' \u00B7 ' + date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getISTHour(date: Date): number {
  return parseInt(
    new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(date),
    10
  );
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

  return formatIST(lastLogin);
}

export default function WelcomeBanner({ user, tenant }: WelcomeBannerProps) {
  const [now, setNow] = useState(() => new Date());
  const { quotaData } = useQuota();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const greeting = getGreeting(getISTHour(now));

  // Typewriter effect: type firstName letter-by-letter, hold, erase, repeat
  const [typedName, setTypedName] = useState('');
  useEffect(() => {
    if (!firstName) return;
    let index = 0;
    let phase: 'typing' | 'holding' | 'erasing' | 'waiting' = 'typing';
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (phase === 'typing') {
        index += 1;
        setTypedName(firstName.slice(0, index));
        if (index >= firstName.length) {
          phase = 'holding';
          timeoutId = setTimeout(tick, 1500);
        } else {
          timeoutId = setTimeout(tick, 120);
        }
      } else if (phase === 'holding') {
        phase = 'erasing';
        timeoutId = setTimeout(tick, 60);
      } else if (phase === 'erasing') {
        index -= 1;
        setTypedName(firstName.slice(0, index));
        if (index <= 0) {
          phase = 'waiting';
          timeoutId = setTimeout(tick, 600);
        } else {
          timeoutId = setTimeout(tick, 60);
        }
      } else {
        phase = 'typing';
        timeoutId = setTimeout(tick, 120);
      }
    };

    setTypedName('');
    timeoutId = setTimeout(tick, 400);
    return () => clearTimeout(timeoutId);
  }, [firstName]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 sm:p-6 lg:p-7 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10">
      {/* Premium ambient glows â€” brand palette */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
      {/* Subtle dot grid texture */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Avatar + Greeting */}
        <div className="block sm:flex sm:items-center sm:gap-4">
          <div className="relative inline-flex">
            {/* Gradient ring â€” brand palette */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-cyan via-brand-teal to-brand-orange opacity-80 blur-[2px]" />
            <NameAvatar name={user?.name} fallback={user?.email} size="xl" className="relative bg-white dark:bg-white dark:text-brand-blue" />
          </div>
          <div className="mt-3 sm:mt-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight capitalize">
              {greeting},{' '}
              <span className="inline-flex items-baseline" aria-label={firstName}>
                <span className="text-white">{typedName}</span>
                <span aria-hidden className="ml-0.5 inline-block w-[2px] self-stretch bg-white animate-caret-blink" />
              </span>
            </h1>
            <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm text-white/80">
              {user?.role && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs sm:text-xs font-medium shadow-sm ${roleBadgeColors[user.role]}`}>
                  {roleLabels[user.role]}
                </span>
              )}
              {tenant?.name && (
                <span className="inline-flex items-center gap-1.5 text-white/90">
                  <Building2 className="h-3.5 w-3.5 text-white/60" />
                  {tenant.name}
                </span>
              )}
              {(quotaData?.plan_name || tenant?.subscription?.planName) && (
                <span className="inline-flex items-center gap-1.5 text-brand-orange">
                  <CreditCard className="h-3.5 w-3.5 text-brand-orange" />
                  {quotaData?.plan_name || tenant?.subscription?.planName || '-'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Date/Time + Last Login */}
        <div className="flex flex-col items-start gap-1.5 text-sm text-white/80 sm:items-end">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm px-2.5 py-1 ring-1 ring-white/15 text-xs sm:text-sm">
            <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-brand-orange" />
            {formatDateTime(now)}
          </span>
          {user?.lastLogin ? (
            <span className="inline-flex items-center gap-1.5 text-2xs sm:text-xs text-white/60">
              <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Last login: {formatLastLogin(user.lastLogin)}
            </span>
          ) : user?.createdAt ? (
            <span className="inline-flex items-center gap-1.5 text-2xs sm:text-xs text-white/60">
              <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Member since {formatISTDate(user.createdAt)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
