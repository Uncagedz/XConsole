import BankRanker from './BankRanker';
import DealCard from './DealCard';
import ReasonChips from './ReasonChips';
import PostingPanel from './PostingPanel';

interface DealCanvasProps {
  vin: string;
}

export default function DealCanvas({ vin }: DealCanvasProps) {
  return (
    <section className="grid grid-cols-[240px_1fr_260px] gap-4">
      <BankRanker />
      <DealCard vin={vin} />
      <div className="space-y-4">
        <ReasonChips />
        <PostingPanel />
      </div>
    </section>
  );
}
