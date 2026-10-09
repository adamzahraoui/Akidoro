import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/classNames';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent-600 text-white hover:bg-accent-700 disabled:bg-accent-600/50 dark:bg-accent-500 dark:hover:bg-accent-400',
  secondary:
    'border border-stone-300 bg-surface-light text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:bg-surface-dark dark:text-stone-200 dark:hover:bg-stone-700/50',
  ghost:
    'text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-700/50',
  danger:
    'border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
