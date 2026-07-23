import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-mint text-ink hover:bg-emerald-300',
  secondary: 'bg-panel text-white border border-line hover:border-steel',
  danger: 'bg-coral text-white hover:bg-red-400',
  ghost: 'bg-transparent text-steel hover:text-white',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'inline-flex min-h-10 items-center justify-center rounded-control px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = 'Button';
