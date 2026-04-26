const banks = [
  { name: 'Prime Auto Bank', rate: '6.9%', approval: 0.88 },
  { name: 'Metro Credit Union', rate: '7.1%', approval: 0.83 },
  { name: 'Main Street Lending', rate: '7.4%', approval: 0.79 },
];

export default function BankRanker() {
  return (
    <aside style={{ border: '1px solid #334155', borderRadius: 10, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Bank Ranker</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {banks.map((bank) => (
          <li key={bank.name} style={{ marginBottom: 8 }}>
            <strong>{bank.name}</strong> {bank.rate} ({Math.round(bank.approval * 100)}% fit)
          </li>
        ))}
      </ul>
    </aside>
  );
}
