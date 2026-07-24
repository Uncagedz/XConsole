import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AutomationJob,
  AutomationJobStatus,
  ConnectorSummary,
  InventoryResponse,
  Vehicle,
} from '@drivecentric-ai/shared/xconsole';
import { gateway, type DeviceSummary, type InventoryStatus, type VehicleAssets } from './api';
import { filterAndSortInventory, inventoryBreakdown, vehicleTitle } from './inventory-utils';
import './inventory.css';
import './command-center.css';

const terminalJobStates = ['succeeded', 'failed', 'cancelled'];

function money(value: number | null | undefined) {
  return value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
}

function jobStatus(job: AutomationJob): AutomationJobStatus {
  return {
    id: job.id,
    connectorId: job.connectorId,
    operation: job.operation,
    status: job.approvalStatus === 'required' ? 'approval-required' : 'pending',
    payload: job.payload,
    result: null,
    error: null,
    attemptCount: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  };
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function carfaxHighlights(assets: VehicleAssets | null) {
  const summary = assets?.carfax_summary;
  if (!summary) return [];
  const highlights = stringList(summary.highlights);
  if (highlights.length) return highlights;
  return Object.entries(summary.facts && typeof summary.facts === 'object' ? summary.facts : {})
    .filter(([, value]) => value !== null && value !== '' && value !== undefined)
    .slice(0, 6)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value)}`);
}

export function CommandCenterPage() {
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState<InventoryStatus | null>(null);
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [selectedVin, setSelectedVin] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [assets, setAssets] = useState<VehicleAssets | null>(null);
  const [jobs, setJobs] = useState<AutomationJobStatus[]>([]);
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [assetsBusy, setAssetsBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const [valuationFile, setValuationFile] = useState<File | null>(null);
  const [valuationCount, setValuationCount] = useState<number | null>(null);
  const queuedVins = useRef(new Set<string>());

  async function loadInventory(sync = false) {
    if (sync) setSyncing(true);
    try {
      const next = await (sync ? gateway.syncInventory() : gateway.inventory());
      setInventory(next);
      setError('');
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      if (sync) setSyncing(false);
    }
  }

  useEffect(() => {
    void Promise.all([
      gateway.inventory(),
      gateway.inventoryStatus(),
      gateway.connectors(),
      gateway.devices(),
      gateway.valuationStatus().catch(() => null),
    ]).then(([nextInventory, nextStatus, nextConnectors, nextDevices, valuation]) => {
      setInventory(nextInventory);
      setInventoryStatus(nextStatus);
      setConnectors(nextConnectors);
      setDevices(nextDevices);
      setValuationCount(valuation?.count ?? null);
      if (nextInventory.items[0]) setSelectedVin(nextInventory.items[0].vin);
    }).catch((value) => setError(value instanceof Error ? value.message : String(value)));
    const inventoryTimer = window.setInterval(() => void loadInventory(), 10_000);
    const clockTimer = window.setInterval(() => {
      setNow(new Date());
      void gateway.inventoryStatus().then(setInventoryStatus).catch(() => undefined);
    }, 1_000);
    return () => {
      window.clearInterval(inventoryTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  useEffect(() => {
    if (!selectedVin) return;
    setVehicle(null);
    setAssets(null);
    setJobs([]);
    setAssetsBusy(true);
    let active = true;
    void Promise.all([
      gateway.vehicle(selectedVin),
      gateway.vehicleAssets(selectedVin, true),
    ]).then(([nextVehicle, nextAssets]) => {
      if (!active) return;
      setVehicle(nextVehicle);
      setAssets(nextAssets);
    }).catch((value) => {
      if (active) setError(value instanceof Error ? value.message : String(value));
    }).finally(() => {
      if (active) setAssetsBusy(false);
    });
    return () => {
      active = false;
    };
  }, [selectedVin]);

  useEffect(() => {
    if (!selectedVin || queuedVins.current.has(selectedVin) || connectors.length === 0) return;
    const connectorIds = connectors
      .filter((connector) => connector.enabled && ['reconvision', 'onemicro'].includes(connector.id))
      .map((connector) => connector.id as 'reconvision' | 'onemicro');
    if (!connectorIds.length) return;
    queuedVins.current.add(selectedVin);
    void gateway.lookupVehicleSources(selectedVin, connectorIds)
      .then((created) => setJobs(created.map(jobStatus)))
      .catch((value) => setError(value instanceof Error ? value.message : String(value)));
  }, [connectors, selectedVin]);

  useEffect(() => {
    if (!jobs.some((job) => !terminalJobStates.includes(job.status))) return;
    const timer = window.setInterval(() => {
      void Promise.all(jobs.map((job) => gateway.automationJob(job.id))).then(async (nextJobs) => {
        setJobs(nextJobs);
        if (nextJobs.every((job) => terminalJobStates.includes(job.status))) {
          window.clearInterval(timer);
          setVehicle(await gateway.vehicle(selectedVin));
        }
      }).catch((value) => setError(value instanceof Error ? value.message : String(value)));
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [jobs, selectedVin]);

  const filtered = useMemo(() => filterAndSortInventory(inventory?.items ?? [], {
    query,
    condition: 'all',
    photos: 'all',
    sort: 'recent',
  }), [inventory, query]);
  const breakdown = useMemo(() => inventoryBreakdown(inventory?.items ?? []), [inventory]);
  const attention = connectors.filter((connector) => connector.currentError || connector.reauthenticationRequired);
  const carfax = carfaxHighlights(assets);
  const reconJob = jobs.find((job) => job.connectorId === 'reconvision');
  const oneMicroJob = jobs.find((job) => job.connectorId === 'onemicro');

  async function uploadValuation() {
    if (!valuationFile) return;
    const result = await gateway.uploadValuations(valuationFile);
    setValuationCount(result.count);
    setValuationFile(null);
    await loadInventory();
  }

  function openMessenger() {
    window.open(
      'https://www.messenger.com/',
      'xconsole-messenger',
      'popup=yes,width=1180,height=860,resizable=yes,scrollbars=yes',
    )?.focus();
  }

  return (
    <div className="ux-page ux-command-center">
      <section id="overview" className="ux-command-hero">
        <div>
          <p className="ux-eyebrow">Taverna dealership operating system</p>
          <h1>Live command center</h1>
          <p>Inventory, VIN intelligence, LTV, connectors, and customer messaging in one continuous workspace.</p>
        </div>
        <div className="ux-live-clock">
          <span className="ux-live-dot" />
          <strong>{now.toLocaleTimeString()}</strong>
          <small>status clock · updates every second</small>
        </div>
      </section>

      {error && <div className="ux-warning"><strong>Workspace notice</strong><span>{error}</span></div>}

      <section className="ux-metrics ux-command-metrics">
        <article><span>Active inventory</span><strong>{(inventoryStatus?.activeCount ?? inventory?.activeCount)?.toLocaleString() ?? '—'}</strong><small>{inventoryStatus?.inTransitCount ?? inventory?.inTransitCount ?? 0} in transit</small></article>
        <article><span>New / used</span><strong>{breakdown.new} / {breakdown.used}</strong><small>full view refreshes every 10 seconds</small></article>
        <article><span>Healthy connectors</span><strong>{connectors.filter((item) => item.enabled && !item.currentError).length}</strong><small>{attention.length} need attention</small></article>
        <article><span>JD Power values</span><strong>{valuationCount?.toLocaleString() ?? '—'}</strong><small>VIN-matched for Cox/LTV workflow</small></article>
      </section>

      <section id="inventory" className="ux-section-block">
        <div className="ux-section-heading">
          <div><p className="ux-eyebrow">Website inventory</p><h2>Live inventory</h2></div>
          <div className="ux-actions">
            <button type="button" onClick={() => void loadInventory()} disabled={syncing}>Refresh view</button>
            <button className="primary" type="button" onClick={() => void loadInventory(true)} disabled={syncing || !inventory?.source.configured}>{syncing ? 'Synchronizing…' : 'Sync source now'}</button>
          </div>
        </div>
        <div className={`ux-source-banner ${inventory?.source.live ? 'is-live' : 'is-fallback'} ${inventory?.source.stale ? 'is-stale' : ''}`}>
          <div><span className="ux-live-dot" /><div><strong>{inventoryStatus?.source.label ?? inventory?.source.label ?? 'Loading source'}</strong><small>Source cache refreshes every 60 seconds · last source sync {(inventoryStatus?.source.synchronizedAt ?? inventory?.source.synchronizedAt) ? new Date((inventoryStatus?.source.synchronizedAt ?? inventory?.source.synchronizedAt)!).toLocaleString() : 'pending'}</small></div></div>
        </div>
        <label className="ux-command-search"><span>Search and select a vehicle</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="VIN, stock, make, model, color…" /></label>
        <div className="ux-command-inventory">
          {filtered.slice(0, 80).map((item) => (
            <button className={selectedVin === item.vin ? 'selected' : ''} type="button" key={item.vin} onClick={() => {
              setSelectedVin(item.vin);
              window.location.hash = 'vehicle';
            }}>
              {item.photos[0] ? <img src={item.photos[0]} alt="" loading="lazy" /> : <span className="ux-mini-photo">No photo</span>}
              <span><strong>{vehicleTitle(item)}</strong><small>{item.stockNumber ?? 'No stock'} · {item.vin}</small></span>
              <b>{money(item.retailPrice)}</b>
            </button>
          ))}
        </div>
      </section>

      <section id="vehicle" className="ux-section-block">
        <div className="ux-section-heading"><div><p className="ux-eyebrow">Selected VIN</p><h2>{vehicle ? vehicleTitle(vehicle) : selectedVin || 'Select a vehicle'}</h2></div>{vehicle?.websiteUrl && <a className="ux-primary-link" href={vehicle.websiteUrl} target="_blank" rel="noreferrer">Dealer listing ↗</a>}</div>
        {vehicle && <div className="ux-command-vehicle">
          <div>{vehicle.photos[0] ? <img src={vehicle.photos[0]} alt={vehicleTitle(vehicle)} /> : <div className="ux-photo-empty">No website photo</div>}</div>
          <dl>
            <dt>VIN</dt><dd>{vehicle.vin}</dd>
            <dt>Stock</dt><dd>{vehicle.stockNumber ?? '—'}</dd>
            <dt>Retail</dt><dd>{money(vehicle.retailPrice)}</dd>
            <dt>Mileage</dt><dd>{vehicle.mileage?.toLocaleString() ?? '—'}</dd>
            <dt>JD Power trade</dt><dd>{money(vehicle.jdPowerTradeIn)}</dd>
            <dt>LTV basis</dt><dd>{money(vehicle.ltvBasis)}</dd>
            <dt>Loan to value</dt><dd>{vehicle.loanToValue == null ? '—' : `${vehicle.loanToValue.toFixed(2)}%`}</dd>
            <dt>Recon stage</dt><dd>{vehicle.reconStage ?? 'Loading automatically'}</dd>
            <dt>1Micro key</dt><dd>{vehicle.keyLocation ?? 'Loading automatically'}</dd>
          </dl>
        </div>}
      </section>

      <section id="intelligence" className="ux-section-block">
        <div className="ux-section-heading"><div><p className="ux-eyebrow">Automatic reads</p><h2>VIN intelligence</h2></div><span className="ux-pill">{assetsBusy ? 'Loading all sources…' : 'Automatic'}</span></div>
        <div className="ux-intelligence-grid">
          <article>
            <header><strong>CARFAX</strong><span className="ux-pill">{assets?.carfax_url ? 'available' : assetsBusy ? 'loading' : 'not linked'}</span></header>
            {carfax.length ? <ul>{carfax.slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ul> : <p>{assetsBusy ? 'Reading the linked report…' : 'No dealership-linked report was found.'}</p>}
            {assets?.carfax_url && <a href={assets.carfax_url} target="_blank" rel="noreferrer">Open CARFAX report ↗</a>}
          </article>
          <article>
            <header><strong>Window sticker</strong><span className="ux-pill">{assets?.sticker_url ? 'available' : assetsBusy ? 'loading' : 'not linked'}</span></header>
            {assets?.sticker_highlights.length ? <ul>{assets.sticker_highlights.slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ul> : <p>{assetsBusy ? 'Reading the window sticker…' : 'No sticker was found for this VIN.'}</p>}
            {assets?.sticker_url && <a href={assets.sticker_url} target="_blank" rel="noreferrer">Open window sticker ↗</a>}
          </article>
          <article>
            <header><strong>ReconVision</strong><span className="ux-pill">{reconJob?.status ?? (vehicle?.reconStage ? 'ready' : 'waiting')}</span></header>
            <p>{vehicle?.reconStage ? `Stage: ${vehicle.reconStage}` : typeof reconJob?.result?.summary === 'string' ? reconJob.result.summary : 'Automatically queued through the Windows Local Agent.'}</p>
          </article>
          <article>
            <header><strong>1Micro</strong><span className="ux-pill">{oneMicroJob?.status ?? (vehicle?.keyLocation ? 'ready' : 'waiting')}</span></header>
            <p>{vehicle?.keyLocation ? `Key location: ${vehicle.keyLocation}` : typeof oneMicroJob?.result?.summary === 'string' ? oneMicroJob.result.summary : 'Automatically queued through the Windows Local Agent.'}</p>
          </article>
        </div>
      </section>

      <section id="bank-brain" className="ux-section-block">
        <div className="ux-section-heading"><div><p className="ux-eyebrow">Cox Automotive workflow</p><h2>JD Power LTV</h2></div></div>
        <p>VINs from the JD Power workbook are matched automatically. LTV uses the stored trade-in value and the configured deal basis.</p>
        <div className="ux-actions">
          <input type="file" accept=".xls,.xlsx,.xlsm" onChange={(event) => setValuationFile(event.target.files?.[0] ?? null)} />
          <button className="primary" type="button" disabled={!valuationFile} onClick={() => void uploadValuation()}>Load JD Power values</button>
        </div>
      </section>

      <section id="connectors" className="ux-section-block">
        <div className="ux-section-heading"><div><p className="ux-eyebrow">Cloud + Windows agent</p><h2>Connector health</h2></div></div>
        <div className="ux-connector-grid">{connectors.map((connector) => <article className={`ux-connector ${connector.currentError ? 'error' : ''}`} key={connector.id}><div><span className={`ux-dot ${connector.enabled ? 'on' : ''}`} /><div><strong>{connector.displayName}</strong><small>{connector.executionLocation} · {connector.mode}</small></div><span className="ux-pill">{connector.enabled ? connector.authenticationStatus : 'disabled'}</span></div><p>{connector.currentError ?? (connector.enabled ? 'Healthy' : 'Available when configured')}</p></article>)}</div>
        <p className="ux-muted">{devices.length ? `${devices.length} Windows Local Agent device${devices.length === 1 ? '' : 's'} registered.` : 'No Windows Local Agent heartbeat has been received yet.'}</p>
      </section>

      <section id="messenger" className="ux-section-block ux-messenger-strip">
        <div><p className="ux-eyebrow">Customer conversations</p><h2>Messenger workspace</h2><p>Use the same signed-in browser session in a reusable side window. XConsole never receives the Facebook password.</p></div>
        <button className="primary" type="button" onClick={openMessenger}>Open Messenger</button>
      </section>
    </div>
  );
}
