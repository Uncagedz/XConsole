import DealCanvas from './components/DealCanvas';

export default function App() {
  return (
    <main style={{ padding: 20 }}>
      <h1 style={{ marginTop: 0 }}>Sales Assistant</h1>
      <DealCanvas vin="2C4RC1L78NR164218" />
    </main>
  );
}
