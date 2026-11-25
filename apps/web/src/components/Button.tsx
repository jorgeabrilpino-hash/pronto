import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { IconSpinner } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

const base =
  'inline-flex items-center justify-center gap-2 font-semibold select-none disabled:opacity-40 disabled:pointer-events-none';

const variants: Record<ButtonVariant, string> = {
  primary:
    'hard h-[52px] w-full rounded-card border-2 border-ink bg-signal px-5 text-base font-bold text-ink',
  secondary:
    'hard min-h-11 rounded-card border-2 border-ink bg-card px-5 text-[15px] text-ink active:bg-pressed',
  text: 'min-h-11 px-3 text-[15px] font-medium text-ink underline underline-offset-4 decoration-2',
  danger:
    'min-h-11 px-3 text-[15px] font-medium text-muted underline underline-offset-4 active:text-danger',
};

interface Common {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}

type ButtonProps = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
    loading?: boolean;
    loadingLabel?: string;
  };

export function Button({
  variant = 'primary',
  loading = false,
  loadingLabel = 'Enviando…',
  className = '',
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <IconSpinner size={18} />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

type LinkButtonProps = Common & Omit<LinkProps, 'children' | 'className'>;

export function LinkButton({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </Link>
  );
}
