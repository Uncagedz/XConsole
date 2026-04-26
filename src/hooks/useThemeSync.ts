import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';

export function useThemeSync() {
  const theme = useUIStore((state) => state.theme);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.body.dataset.theme = theme;
  }, [theme]);
}

