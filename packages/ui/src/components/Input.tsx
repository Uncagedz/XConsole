import { type InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'min-h-10 w-full rounded-control border border-line bg-ink px-3 py-2 text-sm text-white outline-none transition placeholder:text-steel focus:border-mint',
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
