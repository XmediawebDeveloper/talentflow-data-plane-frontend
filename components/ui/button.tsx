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
  // Base / size / default-tone variants are the global `tf-btn*` classes in
  // app/globals.css (TALENTFLOW UI STANDARD), so a hand-written <button> can wear
  // exactly the same look. They sit in @layer components: a utility passed in
  // `className` always wins over them. `tf-btn` includes `[&>svg]:shrink-0`,
  // which keeps an icon at its intended size when a caller pins a narrow width
  // (e.g. icon-only `h-9 w-9`).
  const baseClasses = 'tf-btn';

  const variantClasses: Record<ButtonTone, Record<CanonicalVariant, string>> = {
    default: {
      // Primary CTA = brand blue (the app's long-standing CTA color), sourced
      // from globals.css tokens. NOT --primary, which is the grey theme accent.
      primary: 'tf-btn-primary',
      secondary: 'tf-btn-secondary',
      destructive: 'tf-btn-destructive',
    },
    onColor: {
      primary: 'bg-white text-[var(--brand-blue)] hover:bg-white/90 shadow-sm hover:shadow-md active:shadow-sm focus-visible:ring-white',
      secondary: 'bg-white/10 text-white hover:bg-white/20 border border-white/25 backdrop-blur-sm focus-visible:ring-white',
      destructive: 'bg-[var(--destructive)] text-white hover:opacity-90 shadow-sm hover:shadow-md ring-1 ring-white/20 focus-visible:ring-white',
    },
  };

  const sizeClasses = {
    sm: 'tf-btn-sm', // 32px
    md: 'tf-btn-md', // 40px
    lg: 'tf-btn-lg', // 44px
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
