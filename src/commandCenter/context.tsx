import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type SalesContextValue = {
  selectedVin: string;
  setSelectedVin: (vin: string) => void;
};

const SalesContext = createContext<SalesContextValue | null>(null);

export function SalesContextProvider({ children }: { children: ReactNode }) {
  const [selectedVin, setSelectedVin] = useState('2C4RC1L78NR164218');

  const value = useMemo(
    () => ({
      selectedVin,
      setSelectedVin,
    }),
    [selectedVin],
  );

  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
}

export function useSalesContext() {
  const value = useContext(SalesContext);
  if (!value) {
    throw new Error('useSalesContext must be used within SalesContextProvider');
  }
  return value;
}
