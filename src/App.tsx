import { SalesContextProvider } from '@/commandCenter/context';
import { TavernaCommandCenter } from '@/commandCenter/TavernaCommandCenter';

export function AppShell() {
  return (
    <SalesContextProvider>
      <TavernaCommandCenter />
    </SalesContextProvider>
  );
}

export default AppShell;
