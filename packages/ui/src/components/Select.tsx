import { type SelectHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={clsx(
        'min-h-10 w-full rounded-control border border-line bg-ink px-3 py-2 text-sm text-white outline-none transition focus:border-mint',
        className,
      )}
      {...props}
    />
  ),
);

Select.displayName = 'Select';
