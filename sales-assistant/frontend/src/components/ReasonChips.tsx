const reasons = ['Low DTI', 'Stable income', 'Low mileage'];

export default function ReasonChips() {
  return (
    <section style={{ border: '1px solid #334155', borderRadius: 10, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Reason Chips</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {reasons.map((reason) => (
          <span
            key={reason}
            style={{
              border: '1px solid #475569',
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: 12,
            }}
          >
            {reason}
          </span>
        ))}
      </div>
    </section>
  );
}
