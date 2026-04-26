export const colors = {
  base: '#0B1220',
  surface: '#0E1628',
  line: 'rgba(255,255,255,.08)',
  text: '#E6EDF7',
  accent: '#00E5FF',
  accent2: '#FFC857',
  warn: '#F59E0B',
  good: '#10B981',
} as const;

export const radius = 10;

export const shadow = '0 8px 24px rgba(0,0,0,.35)';

export type ThemeName = 'Stark' | 'Classic';

export const themes: Record<ThemeName, { name: ThemeName; accents: string[] }> =
  {
    Stark: {
      name: 'Stark',
      accents: [colors.accent, colors.accent2],
    },
    Classic: {
      name: 'Classic',
      accents: ['#38BDF8', '#F87171'],
    },
  };

