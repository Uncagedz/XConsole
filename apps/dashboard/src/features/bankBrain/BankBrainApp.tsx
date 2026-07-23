import { useSalesContext } from '@/commandCenter/context';

export default function BankBrainApp() {
  const { selectedVin } = useSalesContext();
  return (
    <main style={{ padding: 24, fontFamily: 'Segoe UI, sans-serif' }}>
      <h1>Banks Brain</h1>
      <p>VIN: {selectedVin || 'N/A'}</p>
      <p>Bank scoring workspace restored. Add bank adapters as needed.</p>
    </main>
  );
}
