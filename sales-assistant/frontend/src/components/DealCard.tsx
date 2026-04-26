interface DealCardProps {
  vin: string;
}

export default function DealCard({ vin }: DealCardProps) {
  return (
    <article style={{ border: '1px solid #334155', borderRadius: 10, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Deal Card</h3>
      <p style={{ margin: '6px 0' }}>VIN: {vin}</p>
      <p style={{ margin: '6px 0' }}>Status: Ready for lender routing</p>
    </article>
  );
}
