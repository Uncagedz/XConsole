import type { ReactNode } from 'react';

export type ColumnDef<T> = {
  key: keyof T | string;
  label: string;
  width?: number;
  visible?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => ReactNode;
};
