import { type HTMLAttributes } from 'react';
import clsx from 'clsx';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={clsx('rounded-card border border-line bg-panel p-5 shadow-lift', className)}
      {...props}
    />
  );
}
