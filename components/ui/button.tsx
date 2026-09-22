import { ReactNode, forwardRef, cloneElement, isValidElement } from 'react';
import { ButtonLoader } from './loading-spinner';

/**
 * Canonical button variants — per UI–UX Guidelines §4, the project uses only
 * THREE action types:
 *   - primary     → main CTA, brand color (Create JD, Upload, Export)
 *   - secondary   → neutral / icon-button / dropdown trigger (Edit, Download)
 *   - destructive → red, must require confirmation (Delete)
 *
 * Legacy aliases (`danger`, `ghost`, `outline`) are still accepted so existing
 * callers keep compiling, but they normalize onto the three canonical styles.
 * Do NOT introduce new variants — extend these three instead.
 */
type CanonicalVariant = 'primary' | 'secondary' | 'destructive';
type LegacyVariant = 'danger' | 'ghost' | 'outline';
type ButtonVariant = CanonicalVariant | LegacyVariant;

const VARIANT_ALIAS: Record<ButtonVariant, CanonicalVariant> = {
  primary: 'primary',
  secondary: 'secondary',
  destructive: 'destructive',
  danger: 'destructive',
  ghost: 'secondary',
  outline: 'secondary',
};

/**
 * `tone` is a MODIFIER on the three variants, not a fourth variant — §4 still
 * holds (only primary / secondary / destructive exist). Use `onColor` for
 * buttons that sit on a dark, gradient, on-video, or colored-header surface,
 * where the default light styles clash:
 *   - primary   → inverse white CTA (brand-blue text on white)
 *   - secondary → translucent white (bg-white/10, white text, white hairline)
 *   - destructive → solid red still reads on dark; keeps a white ring
 */
type ButtonTone = 'default' | 'onColor';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  asChild?: boolean;
}

/**
 * Shared button — the single sanctioned button in the app.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  tone = 'default',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  className = '',
  asChild = false,
  ...props
}, ref) => {
  const baseClasses = 'inline-flex items-center justify-center gap-2 rounded-lg transition-all duration-150 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--ring)] disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap';

  const variantClasses: Record<ButtonTone, Record<CanonicalVariant, string>> = {
    default: {
      // Primary CTA = brand blue (the app's long-standing CTA color), sourced
      // from globals.css tokens. NOT --primary, which is the grey theme accent.
      primary: 'bg-[var(--brand-blue)] text-white hover:bg-[var(--brand-blue-2)] shadow-sm hover:shadow-md active:shadow-sm',
      secondary: 'bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border)]',
      destructive: 'bg-[var(--destructive)] text-white hover:opacity-90 shadow-sm hover:shadow-md',
    },
    onColor: {
      primary: 'bg-white text-[var(--brand-blue)] hover:bg-white/90 shadow-sm hover:shadow-md active:shadow-sm focus-visible:ring-white',
      secondary: 'bg-white/10 text-white hover:bg-white/20 border border-white/25 backdrop-blur-sm focus-visible:ring-white',
      destructive: 'bg-[var(--destructive)] text-white hover:opacity-90 shadow-sm hover:shadow-md ring-1 ring-white/20 focus-visible:ring-white',
    },
  };

  const sizeClasses = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-6 text-base',
  };

  const resolvedVariant = VARIANT_ALIAS[variant] ?? 'primary';
  const combinedClassName = `${baseClasses} ${variantClasses[tone][resolvedVariant]} ${sizeClasses[size]} ${className}`;

  // If asChild is true, clone the child element and pass the button styles to it
  if (asChild && isValidElement(children)) {
    return cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: `${combinedClassName} ${(children as React.ReactElement<{ className?: string }>).props.className || ''}`.trim(),
      ...props,
    });
  }

  return (
    <button
      ref={ref}
      className={combinedClassName}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <ButtonLoader />
          <span>Loading...</span>
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
});

Button.displayName = 'Button';
