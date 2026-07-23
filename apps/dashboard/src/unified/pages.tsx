import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ConnectorSummary, InventoryResponse, Vehicle } from '@drivecentric-ai/shared/xconsole';
import { gateway } from './api';
import {
  filterAndSortInventory,
  inventoryBreakdown,
  vehicleTitle,
  type InventoryCondition,
  type InventoryPhotoFilter,
  type InventorySort,
} from './inventory-utils';
import './inventory.css';

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

function money(value: number | null | undefined) {
  return value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'Never';
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
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [condition, setCondition] = useState<InventoryCondition>('all');
  const [photoFilter, setPhotoFilter] = useState<InventoryPhotoFilter>('all');
  const [sort, setSort] = useState<InventorySort>('recent');
  const [visibleLimit, setVisibleLimit] = useState(60);

  async function load(sync = false) {
    setBusy(true);
    setError('');
    try {
      setInventory(await (sync ? gateway.syncInventory() : gateway.inventory()));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);
  const breakdown = useMemo(() => inventoryBreakdown(inventory?.items ?? []), [inventory]);
  const vehicles = useMemo(
    () => filterAndSortInventory(inventory?.items ?? [], {
      query,
      condition,
      photos: photoFilter,
      sort,
    }),
    [condition, inventory, photoFilter, query, sort],
  );
  useEffect(() => { setVisibleLimit(60); }, [condition, photoFilter, query, sort]);
  const visibleVehicles = vehicles.slice(0, visibleLimit);
  const source = inventory?.source;

  return (
    <Page title="Live inventory" eyebrow="Dealership website · Unified by VIN">
      {error && <StateMessage>{error}</StateMessage>}
      {!inventory && !error && <StateMessage>Loading inventory…</StateMessage>}
      {inventory && <>
        <div className={`ux-source-banner ${source?.live ? 'is-live' : 'is-fallback'} ${source?.stale ? 'is-stale' : ''}`}>
          <div>
            <span className="ux-live-dot" />
            <div>
              <strong>{source?.label}</strong>
              <small>
                {source?.live ? 'Connected to the preserved live inventory pipeline' : 'Fallback data'}
                {' · '}Last synchronized {dateTime(source?.synchronizedAt)}
              </small>
            </div>
          </div>
          <div className="ux-source-actions">
            <button type="button" onClick={() => void load()} disabled={busy}>{busy ? 'Loading…' : 'Refresh view'}</button>
            <button className="primary" type="button" onClick={() => void load(true)} disabled={busy || !source?.configured}>
              {busy ? 'Syncing…' : 'Sync live inventory'}
            </button>
          </div>
        </div>
        {source?.warning && <div className="ux-warning"><strong>Inventory notice</strong><span>{source.warning}</span></div>}
        <div className="ux-metrics ux-inventory-metrics">
          <article><span>Active inventory</span><strong>{inventory.activeCount.toLocaleString()}</strong><small>{inventory.inTransitCount ? `${inventory.inTransitCount.toLocaleString()} in transit` : 'VIN-normalized listings'}</small></article>
          <article><span>New / Used</span><strong>{breakdown.new.toLocaleString()} / {breakdown.used.toLocaleString()}</strong><small>{inventory.count.toLocaleString()} website listings</small></article>
          <article><span>Photo ready</span><strong>{breakdown.withPhotos.toLocaleString()}</strong><small>{Math.max(0, inventory.count - breakdown.withPhotos).toLocaleString()} need photos</small></article>
        </div>
        <div className="ux-inventory-toolbar">
          <label className="ux-search">
            <span>Search inventory</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="VIN, stock, model, color, status…" />
          </label>
          <label><span>Condition</span><select value={condition} onChange={(event) => setCondition(event.target.value as InventoryCondition)}><option value="all">All inventory</option><option value="new">New</option><option value="used">Used / certified</option></select></label>
          <label><span>Photos</span><select value={photoFilter} onChange={(event) => setPhotoFilter(event.target.value as InventoryPhotoFilter)}><option value="all">All photo states</option><option value="with-photos">Photo ready</option><option value="needs-photos">Needs photos</option></select></label>
          <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as InventorySort)}><option value="recent">Recently synchronized</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="mileage-low">Mileage: low to high</option><option value="title">Vehicle name</option></select></label>
        </div>
        <div className="ux-results-heading"><strong>{vehicles.length.toLocaleString()} vehicles</strong><span>{query || condition !== 'all' || photoFilter !== 'all' ? `filtered from ${inventory.count.toLocaleString()}` : 'showing all available records'}</span></div>
        {vehicles.length > 0
          ? <><div className="ux-inventory-grid">{visibleVehicles.map((vehicle) => (
            <article className="ux-vehicle-card" key={vehicle.vin}>
              <Link className="ux-vehicle-photo" to={`/inventory/${vehicle.vin}`}>
                {vehicle.photos[0]
                  ? <img src={vehicle.photos[0]} alt={vehicleTitle(vehicle)} loading="lazy" />
                  : <span>No website photo</span>}
                <span className="ux-photo-count">{vehicle.photos.length} photo{vehicle.photos.length === 1 ? '' : 's'}</span>
              </Link>
              <div className="ux-vehicle-card-body">
                <div className="ux-vehicle-card-top">
                  <span className="ux-pill">{vehicle.condition ?? 'inventory'}</span>
                  <span className="ux-status-text">{vehicle.status ?? 'active'}</span>
                </div>
                <Link className="ux-vehicle-title" to={`/inventory/${vehicle.vin}`}>{vehicleTitle(vehicle)}</Link>
                <div className="ux-vehicle-price">{money(vehicle.retailPrice)}</div>
                <div className="ux-vehicle-facts">
                  <span>{vehicle.mileage === null ? 'Mileage unavailable' : `${vehicle.mileage.toLocaleString()} mi`}</span>
                  <span>Stock {vehicle.stockNumber ?? '—'}</span>
                </div>
                <code>{vehicle.vin}</code>
                <div className="ux-card-footer">
                  <span>{vehicle.sourceStatuses.length} source{vehicle.sourceStatuses.length === 1 ? '' : 's'}</span>
                  {vehicle.websiteUrl && <a href={vehicle.websiteUrl} target="_blank" rel="noreferrer">Dealer listing ↗</a>}
                </div>
              </div>
            </article>
          ))}</div>
          {visibleVehicles.length < vehicles.length && <div className="ux-load-more">
            <span>Showing {visibleVehicles.length.toLocaleString()} of {vehicles.length.toLocaleString()}</span>
            <button type="button" onClick={() => setVisibleLimit((current) => current + 60)}>Show 60 more</button>
          </div>}</>
          : <StateMessage>No vehicles match these filters. Clear the search or change the condition/photo filters.</StateMessage>}
      </>}
    </Page>
  );
}

export function VehiclePage() {
  const { vin = '' } = useParams();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void gateway.vehicle(vin).then(setVehicle).catch((value) => setError(String(value))); }, [vin]);
  return (
    <Page title={vehicle ? vehicleTitle(vehicle) : 'Vehicle'} eyebrow={vin}>
      {error && <StateMessage>{error}</StateMessage>}
      {!vehicle && !error && <StateMessage>Loading vehicle sources…</StateMessage>}
      {vehicle && <>
        <div className="ux-vehicle-hero">
          <div className="ux-vehicle-gallery">
            {vehicle.photos.length
              ? vehicle.photos.slice(0, 5).map((photo, index) => <img key={photo} src={photo} alt={`${vehicleTitle(vehicle)} photo ${index + 1}`} />)
              : <div className="ux-photo-empty">No website photos are available for this VIN.</div>}
          </div>
          <div className="ux-vehicle-summary">
            <span className="ux-pill">{vehicle.condition ?? 'inventory'}</span>
            <strong>{money(vehicle.retailPrice)}</strong>
            <dl>
              <dt>Stock</dt><dd>{vehicle.stockNumber ?? '—'}</dd>
              <dt>Mileage</dt><dd>{vehicle.mileage?.toLocaleString() ?? '—'}</dd>
              <dt>Exterior</dt><dd>{vehicle.exteriorColor ?? '—'}</dd>
              <dt>Interior</dt><dd>{vehicle.interiorColor ?? '—'}</dd>
              <dt>Drivetrain</dt><dd>{vehicle.drivetrain ?? '—'}</dd>
              <dt>Engine</dt><dd>{vehicle.engine ?? '—'}</dd>
              <dt>Transmission</dt><dd>{vehicle.transmission ?? '—'}</dd>
            </dl>
            {vehicle.websiteUrl && <a className="ux-primary-link" href={vehicle.websiteUrl} target="_blank" rel="noreferrer">Open dealership listing ↗</a>}
          </div>
        </div>
        <div className="ux-metrics">
          <article><span>Retail price</span><strong>{money(vehicle.retailPrice)}</strong><small>{vehicle.daysInStock ?? '—'} days in stock</small></article>
          <article><span>Website photos</span><strong>{vehicle.photos.length}</strong><small>{vehicle.status ?? 'availability unknown'}</small></article>
          <article><span>Sources</span><strong>{vehicle.sourceStatuses.length}</strong><small>last {dateTime(vehicle.lastSynchronizedAt)}</small></article>
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    void gateway.connector(connectorId).then(setConnector).catch((value) => setError(String(value)));
  }, [connectorId]);

  async function updateEnabled(enabled: boolean) {
    setBusy(true);
    setError('');
    try {
      setConnector(await gateway.setConnectorEnabled(connectorId, enabled));
      setMessage(enabled ? 'Connector enabled.' : 'Connector disabled.');
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await gateway.retryConnector(connectorId);
      setConnector(await gateway.connector(connectorId));
      setMessage(connectorId === 'dealership-website' ? 'Live inventory synchronized.' : 'Connector job queued.');
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  }

  return <Page title={connector?.displayName ?? 'Connector'} eyebrow={connectorId}>
    {error && <StateMessage>{error}</StateMessage>}
    {message && <div className="ux-success">{message}</div>}
    {connector
      ? <div className="ux-panel"><h2>Health details</h2><dl className="ux-detail-list"><dt>Enabled</dt><dd>{String(connector.enabled)}</dd><dt>Execution</dt><dd>{connector.executionLocation}</dd><dt>Authentication</dt><dd>{connector.authenticationStatus}</dd><dt>Last attempt</dt><dd>{connector.lastAttemptedSync ?? 'Never'}</dd><dt>Last success</dt><dd>{connector.lastSuccessfulSync ?? 'Never'}</dd><dt>Current error</dt><dd>{connector.currentError ?? 'None'}</dd><dt>Reauthentication</dt><dd>{String(connector.reauthenticationRequired)}</dd></dl><div className="ux-actions"><button type="button" onClick={() => void retry()} disabled={busy || !connector.enabled}>{busy ? 'Working…' : 'Retry synchronization'}</button><button type="button" onClick={() => void updateEnabled(!connector.enabled)} disabled={busy}>{connector.enabled ? 'Disable connector' : 'Enable connector'}</button>{connector.failureScreenshotUrl && <a href={connector.failureScreenshotUrl}>View failure screenshot</a>}</div></div>
      : !error && <StateMessage>Loading connector…</StateMessage>}
  </Page>;
}

export function PartialPage({ title, description }: { title: string; description: string }) {
  return <Page title={title} eyebrow="Typed Phase 1 route"><div className="ux-panel"><h2>Foundation ready</h2><p>{description}</p><p className="ux-muted">Live portal data will appear after its connector is configured and validated with an authorized recording.</p></div></Page>;
}
