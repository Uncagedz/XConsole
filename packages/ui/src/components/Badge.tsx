import { type HTMLAttributes } from 'react';
import clsx from 'clsx';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

const tones: Record<BadgeTone, string> = {
  neutral: 'border-line text-steel',
  success: 'border-mint/40 text-mint',
  warning: 'border-amber/40 text-amber',
  danger: 'border-coral/40 text-coral',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-control border px-2 py-1 text-xs font-semibold',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
