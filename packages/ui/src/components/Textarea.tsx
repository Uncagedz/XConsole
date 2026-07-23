import { type TextareaHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        'min-h-28 w-full resize-y rounded-control border border-line bg-ink px-3 py-2 text-sm text-white outline-none transition placeholder:text-steel focus:border-mint',
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = 'Textarea';
