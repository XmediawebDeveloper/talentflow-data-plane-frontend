import { ReactNode, forwardRef, cloneElement, isValidElement } from 'react';
import { ButtonLoader } from './loading-spinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  asChild?: boolean;
}

/**
 * Enhanced button component with loading states and variants
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
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

  const variantClasses = {
    primary: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] shadow-sm hover:shadow-md active:shadow-sm',
    secondary: 'bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border)]',
    danger: 'bg-[var(--destructive)] text-white hover:opacity-90 shadow-sm hover:shadow-md',
    ghost: 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
    outline: 'border border-[var(--border-dark)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] bg-transparent',
  };

  const sizeClasses = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-6 text-base',
  };

  const combinedClassName = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

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
