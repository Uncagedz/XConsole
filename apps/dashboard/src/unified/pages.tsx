import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ConnectorSummary, Vehicle } from '@drivecentric-ai/shared';
import { gateway } from './api';

function Page({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <section className="ux-page">
      <header><div>{eyebrow && <p className="ux-eyebrow">{eyebrow}</p>}<h1>{title}</h1></div></header>
      {children}
    </section>
  );
}

function StateMessage({ children }: { children: React.ReactNode }) {
  return <div className="ux-state">{children}</div>;
}

export function DashboardPage() {
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  useEffect(() => {
    void Promise.all([gateway.connectors(), gateway.vehicles()]).then(([connectorItems, vehicleItems]) => {
      setConnectors(connectorItems);
      setVehicles(vehicleItems);
    });
  }, []);
  const attention = connectors.filter((connector) => connector.currentError || connector.reauthenticationRequired);
  return (
    <Page title="Command overview" eyebrow="Phase 1 unified foundation">
      <div className="ux-metrics">
        <article><span>Active inventory</span><strong>{vehicles.length}</strong><small>VIN-normalized vehicles</small></article>
        <article><span>Healthy connectors</span><strong>{connectors.filter((item) => item.enabled && !item.currentError).length}</strong><small>of {connectors.length} registered</small></article>
        <article><span>Needs attention</span><strong>{attention.length}</strong><small>errors or reauthentication</small></article>
      </div>
      <div className="ux-panel"><h2>Operating boundaries</h2><p>Reads may run automatically. Marketplace posting remains approval-gated. Local browser automation runs only on the registered Windows agent.</p></div>
    </Page>
  );
}

export function InventoryPage() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void gateway.vehicles().then(setVehicles).catch((value) => setError(String(value))); }, []);
  return (
    <Page title="Inventory" eyebrow="Unified by VIN">
      {error && <StateMessage>{error}</StateMessage>}
      {!vehicles && !error && <StateMessage>Loading inventory…</StateMessage>}
      {vehicles && <div className="ux-table-wrap"><table><thead><tr><th>Vehicle</th><th>VIN / Stock</th><th>Miles</th><th>Price</th><th>Sources</th></tr></thead><tbody>
        {vehicles.map((vehicle) => <tr key={vehicle.vin}><td><Link to={`/inventory/${vehicle.vin}`}>{[vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')}</Link></td><td><code>{vehicle.vin}</code><small>{vehicle.stockNumber ?? 'No stock number'}</small></td><td>{vehicle.mileage?.toLocaleString() ?? '—'}</td><td>{vehicle.retailPrice ? `$${vehicle.retailPrice.toLocaleString()}` : '—'}</td><td>{vehicle.sourceStatuses.length}</td></tr>)}
      </tbody></table></div>}
    </Page>
  );
}

export function VehiclePage() {
  const { vin = '' } = useParams();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void gateway.vehicle(vin).then(setVehicle).catch((value) => setError(String(value))); }, [vin]);
  return (
    <Page title={vehicle ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ') : 'Vehicle'} eyebrow={vin}>
      {error && <StateMessage>{error}</StateMessage>}
      {!vehicle && !error && <StateMessage>Loading vehicle sources…</StateMessage>}
      {vehicle && <>
        <div className="ux-metrics">
          <article><span>Retail price</span><strong>{vehicle.retailPrice ? `$${vehicle.retailPrice.toLocaleString()}` : '—'}</strong><small>{vehicle.daysInStock ?? '—'} days in stock</small></article>
          <article><span>Mileage</span><strong>{vehicle.mileage?.toLocaleString() ?? '—'}</strong><small>Stock {vehicle.stockNumber ?? '—'}</small></article>
          <article><span>Sources</span><strong>{vehicle.sourceStatuses.length}</strong><small>last {vehicle.lastSynchronizedAt ? new Date(vehicle.lastSynchronizedAt).toLocaleString() : 'never'}</small></article>
        </div>
        <div className="ux-panel"><h2>Source status</h2><div className="ux-source-grid">
          {vehicle.sourceStatuses.map((source) => <article key={source.connectorId} className={source.error ? 'error' : ''}><div><strong>{source.displayName}</strong><span className="ux-pill">{source.status}</span></div><p>{source.error ?? 'No current error'}</p><small>{source.synchronizedAt ? new Date(source.synchronizedAt).toLocaleString() : 'Never synchronized'}</small></article>)}
        </div></div>
        <div className="ux-panel"><h2>Recommended talking points</h2><ul>{vehicle.salesTalkingPoints.map((point) => <li key={point}>{point}</li>)}</ul></div>
      </>}
    </Page>
  );
}

export function ConnectorsPage() {
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void gateway.connectors().then(setConnectors).catch((value) => setError(String(value))); }, []);
  return (
    <Page title="Connector health" eyebrow="Cloud and Local Agent">
      {error && <StateMessage>{error}</StateMessage>}
      {!connectors && !error && <StateMessage>Loading connector health…</StateMessage>}
      {connectors && <div className="ux-connector-grid">{connectors.map((connector) => (
        <article key={connector.id} className={`ux-connector ${connector.currentError ? 'error' : ''}`}>
          <div><span className={`ux-dot ${connector.enabled ? 'on' : ''}`} /><div><Link to={`/connectors/${connector.id}`}><strong>{connector.displayName}</strong></Link><small>{connector.executionLocation} · {connector.mode}</small></div><span className="ux-pill">{connector.authenticationStatus}</span></div>
          <dl><dt>Last success</dt><dd>{connector.lastSuccessfulSync ? new Date(connector.lastSuccessfulSync).toLocaleString() : 'Never'}</dd><dt>Duration</dt><dd>{connector.lastDurationMs ? `${connector.lastDurationMs} ms` : '—'}</dd><dt>Updated</dt><dd>{connector.recordsUpdated}</dd></dl>
          <p>{connector.currentError ?? (connector.enabled ? 'Healthy' : 'Disabled / not configured')}</p>
        </article>
      ))}</div>}
    </Page>
  );
}

export function ConnectorDetailPage() {
  const { connectorId = '' } = useParams();
  const [connector, setConnector] = useState<ConnectorSummary | null>(null);
  useEffect(() => { void gateway.connector(connectorId).then(setConnector); }, [connectorId]);
  return <Page title={connector?.displayName ?? 'Connector'} eyebrow={connectorId}>{connector ? <div className="ux-panel"><h2>Health details</h2><dl className="ux-detail-list"><dt>Enabled</dt><dd>{String(connector.enabled)}</dd><dt>Execution</dt><dd>{connector.executionLocation}</dd><dt>Authentication</dt><dd>{connector.authenticationStatus}</dd><dt>Last attempt</dt><dd>{connector.lastAttemptedSync ?? 'Never'}</dd><dt>Last success</dt><dd>{connector.lastSuccessfulSync ?? 'Never'}</dd><dt>Current error</dt><dd>{connector.currentError ?? 'None'}</dd><dt>Reauthentication</dt><dd>{String(connector.reauthenticationRequired)}</dd></dl><div className="ux-actions"><button type="button">Retry</button><a href={connector.logsUrl}>View logs</a>{connector.failureScreenshotUrl && <a href={connector.failureScreenshotUrl}>View failure screenshot</a>}</div></div> : <StateMessage>Loading connector…</StateMessage>}</Page>;
}

export function PartialPage({ title, description }: { title: string; description: string }) {
  return <Page title={title} eyebrow="Typed Phase 1 route"><div className="ux-panel"><h2>Foundation ready</h2><p>{description}</p><p className="ux-muted">Live portal data will appear after its connector is configured and validated with an authorized recording.</p></div></Page>;
}
