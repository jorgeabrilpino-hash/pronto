import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { IconSpinner } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

const base =
  'inline-flex items-center justify-center gap-2 font-semibold select-none transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'h-[52px] w-full rounded-full bg-gold text-ink active:brightness-95 text-base',
  secondary:
    'min-h-11 rounded-full border-[1.5px] border-line bg-ivory px-5 text-ink active:bg-pressed text-[15px]',
  text: 'min-h-11 rounded-full px-3 text-muted active:text-ink text-[15px] font-medium',
  danger: 'min-h-11 rounded-full px-3 text-muted active:text-danger text-[15px] font-medium',
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
