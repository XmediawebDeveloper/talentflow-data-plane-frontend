import { cn } from './utils';

/**
 * The app's one letter-avatar: a light brand-blue circle with the first letter
 * of a person's name — the style the AI assessment / interview candidate
 * results introduced. Use this instead of hand-rolling initials circles, so
 * every name badge looks the same on every page.
 *
 *   <NameAvatar name={user.name} fallback={user.email} size="md" />
 *
 * `className` is merged last (tailwind-merge) — e.g. `ring-2 ring-white` to
 * separate avatars in an overlapping stack.
 */
export type NameAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<NameAvatarSize, string> = {
  xs: 'h-6 w-6 text-2xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-11 w-11 text-base',
  xl: 'h-14 w-14 text-lg',
};

export function nameInitial(name?: string | null, fallback?: string | null): string {
  const source = (name || '').trim() || (fallback || '').trim();
  return source ? source.charAt(0).toUpperCase() : '?';
}

export default function NameAvatar({
  name,
  fallback,
  size = 'md',
  className,
  title,
}: {
  name?: string | null;
  /** Used when `name` is empty — typically the email. */
  fallback?: string | null;
  size?: NameAvatarSize;
  className?: string;
  /** Tooltip; defaults to the name. Pass '' to suppress. */
  title?: string;
}) {
  return (
    <span
      title={title ?? (name || fallback || undefined)}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-brand-blue/10 font-semibold text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-200 dark:ring-brand-blue/30',
        SIZES[size],
        className,
      )}
    >
      {nameInitial(name, fallback)}
    </span>
  );
}
