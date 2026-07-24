import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type {
  AutomationJob,
  AutomationJobStatus,
  ConnectorSummary,
  InventoryResponse,
  Vehicle,
} from '@drivecentric-ai/shared/xconsole';
import { gateway, type DeviceSummary, type InventoryStatus, type VehicleAssets } from './api';
import { filterAndSortInventory, inventoryBreakdown, vehicleTitle } from './inventory-utils';
import type { ShellContext } from './Shell';
import {
  carfaxDossier,
  keyDossier,
  reconDossier,
  sellingDescriptions,
  uniqueFactoryFeatures,
} from './vehicle-intelligence';
import './command-center.css';

const terminalJobStates = ['succeeded', 'failed', 'cancelled'];
const usefulConnectors = new Set([
  'dealership-website',
  'carfax',
  'reconvision',
  'onemicro',
  'routeone-bank-brain',
  'drivecentric',
  'facebook-marketplace',
]);

function money(value: number | null | undefined) {
  return value == null ? '—' : new Intl.NumberFormat('en-US', {
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

function ago(value: string | null | undefined, now: Date) {
  if (!value) return 'not yet verified';
  const seconds = Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / 1_000));
  if (seconds < 2) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  return new Date(value).toLocaleString();
}

function statusLabel(connector: ConnectorSummary | undefined, job: AutomationJobStatus | undefined, hasData: boolean) {
  if (job && !terminalJobStates.includes(job.status)) return 'reading';
  if (job?.status === 'failed') return 'needs attention';
  if (hasData) return 'verified';
  if (!connector?.enabled) return connector?.reauthenticationRequired ? 'login required' : 'not connected';
  return connector?.currentError ? 'needs attention' : 'waiting';
}

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

export function CommandCenterPage() {
  const { logout } = useOutletContext<ShellContext>();
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState<InventoryStatus | null>(null);
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [selectedVin, setSelectedVin] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [assets, setAssets] = useState<VehicleAssets | null>(null);
  const [jobs, setJobs] = useState<AutomationJobStatus[]>([]);
  const [query, setQuery] = useState('');
  const [condition, setCondition] = useState<'all' | 'new' | 'used'>('all');
  const [syncing, setSyncing] = useState(false);
  const [assetsBusy, setAssetsBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const [valuationFile, setValuationFile] = useState<File | null>(null);
  const [valuationCount, setValuationCount] = useState<number | null>(null);
  const [copied, setCopied] = useState<'summary' | 'detailed' | null>(null);
  const queuedVins = useRef(new Set<string>());
  const sourceSync = useRef<string | null>(null);

  async function loadInventory(sync = false) {
    if (sync) setSyncing(true);
    try {
      const next = await (sync ? gateway.syncInventory() : gateway.inventory());
      sourceSync.current = next.source.synchronizedAt;
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
      sourceSync.current = nextInventory.source.synchronizedAt;
      setInventory(nextInventory);
      setInventoryStatus(nextStatus);
      setConnectors(nextConnectors);
      setDevices(nextDevices);
      setValuationCount(valuation?.count ?? null);
      const firstComplete = nextInventory.items.find((item) => item.retailPrice != null && item.photos.length > 0);
      const initialVehicle = firstComplete ?? nextInventory.items[0];
      if (initialVehicle) setSelectedVin(initialVehicle.vin);
    }).catch((value) => setError(value instanceof Error ? value.message : String(value)));

    const statusTimer = window.setInterval(() => {
      setNow(new Date());
      void gateway.inventoryStatus().then((nextStatus) => {
        setInventoryStatus(nextStatus);
        if (nextStatus.source.synchronizedAt !== sourceSync.current) void loadInventory();
      }).catch(() => undefined);
    }, 1_000);
    const safetyRefresh = window.setInterval(() => void loadInventory(), 10_000);
    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(safetyRefresh);
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
      setError('');
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
      .filter((connector) => connector.enabled && !connector.reauthenticationRequired)
      .filter((connector) => ['reconvision', 'onemicro', 'carfax'].includes(connector.id))
      .map((connector) => connector.id as 'reconvision' | 'onemicro' | 'carfax');
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
          const [nextVehicle, nextConnectors, nextAssets] = await Promise.all([
            gateway.vehicle(selectedVin),
            gateway.connectors(),
            gateway.vehicleAssets(selectedVin),
          ]);
          setVehicle(nextVehicle);
          setConnectors(nextConnectors);
          setAssets(nextAssets);
        }
      }).catch((value) => setError(value instanceof Error ? value.message : String(value)));
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [jobs, selectedVin]);

  const filtered = useMemo(() => filterAndSortInventory(inventory?.items ?? [], {
    query,
    condition,
    photos: 'all',
    sort: 'recent',
  }), [condition, inventory, query]);
  const breakdown = useMemo(() => inventoryBreakdown(inventory?.items ?? []), [inventory]);
  const useful = connectors.filter((connector) => usefulConnectors.has(connector.id));
  const connector = (id: string) => connectors.find((item) => item.id === id);
  const job = (id: string) => jobs.find((item) => item.connectorId === id);
  const carfax = useMemo(() => carfaxDossier(assets), [assets]);
  const recon = useMemo(() => reconDossier(assets, vehicle), [assets, vehicle]);
  const key = useMemo(() => keyDossier(assets, vehicle), [assets, vehicle]);
  const features = useMemo(() => uniqueFactoryFeatures(assets), [assets]);
  const copy = useMemo(() => sellingDescriptions(vehicle, assets), [assets, vehicle]);
  const sourceAge = ago(inventoryStatus?.source.synchronizedAt ?? inventory?.source.synchronizedAt, now);

  async function uploadValuation() {
    if (!valuationFile) return;
    const result = await gateway.uploadValuations(valuationFile);
    setValuationCount(result.count);
    setValuationFile(null);
    await loadInventory();
  }

  async function handleCopy(kind: 'summary' | 'detailed') {
    await copyText(copy[kind]);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1_500);
  }

  function openMessenger() {
    window.open(
      'https://www.messenger.com/',
      'xconsole-messenger',
      'popup=yes,width=1180,height=860,resizable=yes,scrollbars=yes',
    )?.focus();
  }

  return (
    <div className="mc-shell">
      <header className="mc-topbar">
        <div className="mc-brand"><span>X</span><div><strong>XConsole</strong><small>Taverna mission control</small></div></div>
        <label className="mc-global-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search VIN, stock, make, model, color…" />
          <kbd>{filtered.length.toLocaleString()}</kbd>
        </label>
        <div className="mc-system">
          <span className={`mc-signal ${inventory?.source.live && !inventory.source.stale ? 'on' : 'warn'}`} />
          <div><strong>{inventory?.source.live ? 'LIVE SOURCE' : 'SAFE CACHE'}</strong><small>verified {sourceAge}</small></div>
          <time>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
          <button type="button" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>

      {error && <div className="mc-alert"><strong>Action required</strong><span>{error}</span><button type="button" onClick={() => setError('')}>Dismiss</button></div>}

      <div className="mc-workspace">
        <aside className="mc-inventory">
          <div className="mc-rail-head">
            <div><span>LIVE INVENTORY</span><strong>{(inventory?.activeCount ?? 0).toLocaleString()}</strong></div>
            <button type="button" onClick={() => void loadInventory(true)} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          </div>
          <div className="mc-segments">
            {(['all', 'new', 'used'] as const).map((value) => (
              <button key={value} className={condition === value ? 'active' : ''} onClick={() => setCondition(value)} type="button">
                {value === 'all' ? 'All' : value === 'new' ? `New ${breakdown.new}` : `Used ${breakdown.used}`}
              </button>
            ))}
          </div>
          <div className="mc-vehicle-list">
            {filtered.slice(0, 160).map((item) => (
              <button className={selectedVin === item.vin ? 'selected' : ''} type="button" key={item.vin} onClick={() => setSelectedVin(item.vin)}>
                {item.photos[0] ? <img src={item.photos[0]} alt="" loading="lazy" /> : <span className="mc-no-photo">NO PHOTO</span>}
                <span className="mc-vehicle-label">
                  <strong>{vehicleTitle(item)}</strong>
                  <small>{item.stockNumber ?? 'No stock'} · {item.mileage?.toLocaleString() ?? '—'} mi</small>
                  <em>{item.loanToValue == null ? 'LTV pending' : `${item.loanToValue.toFixed(1)}% LTV`}</em>
                </span>
                <b>{money(item.retailPrice)}</b>
              </button>
            ))}
            {filtered.length === 0 && <p className="mc-empty">No live vehicles match this search.</p>}
          </div>
        </aside>

        <main className="mc-dossier">
          {!vehicle ? <div className="mc-loading">Loading selected VIN evidence…</div> : (
            <>
              <section className="mc-vehicle-hero">
                <div className="mc-hero-photo">
                  {vehicle.photos[0] ? <img src={vehicle.photos[0]} alt={vehicleTitle(vehicle)} /> : <div>Photo pending</div>}
                  <span>{vehicle.photos.length} PHOTOS</span>
                </div>
                <div className="mc-hero-copy">
                  <p className="mc-kicker">{vehicle.condition ?? 'inventory'} · Stock {vehicle.stockNumber ?? '—'}</p>
                  <h1>{vehicleTitle(vehicle)}</h1>
                  <p className="mc-vin">{vehicle.vin}</p>
                  <div className="mc-hero-stats">
                    <div><span>Retail</span><strong>{money(vehicle.retailPrice)}</strong></div>
                    <div><span>Mileage</span><strong>{vehicle.mileage?.toLocaleString() ?? '—'}</strong></div>
                    <div><span>JD Power</span><strong>{money(vehicle.jdPowerTradeIn)}</strong></div>
                    <div className={(vehicle.loanToValue ?? 999) <= 100 ? 'good' : 'warn'}><span>Loan to value</span><strong>{vehicle.loanToValue == null ? '—' : `${vehicle.loanToValue.toFixed(2)}%`}</strong></div>
                  </div>
                  <div className="mc-hero-actions">
                    {vehicle.websiteUrl && <a href={vehicle.websiteUrl} target="_blank" rel="noreferrer">Dealer listing ↗</a>}
                    <button type="button" onClick={openMessenger}>Messenger ↗</button>
                  </div>
                </div>
              </section>

              <section className="mc-readiness">
                <article><span className="mc-signal on" /><div><small>INVENTORY</small><strong>Live listing</strong></div><em>{sourceAge}</em></article>
                <article><span className={`mc-signal ${carfax.highlights.length ? 'on' : 'warn'}`} /><div><small>CARFAX</small><strong>{carfax.dealerVerified ? 'dealer verified' : carfax.highlights.length ? 'public fallback' : statusLabel(connector('carfax'), job('carfax'), false)}</strong></div><em>{ago(carfax.observedAt, now)}</em></article>
                <article><span className={`mc-signal ${recon.stage ? 'on' : 'warn'}`} /><div><small>RECONVISION</small><strong>{statusLabel(connector('reconvision'), job('reconvision'), Boolean(recon.stage))}</strong></div><em>{ago(recon.observedAt, now)}</em></article>
                <article><span className={`mc-signal ${key.location ? 'on' : 'warn'}`} /><div><small>1MICRO</small><strong>{statusLabel(connector('onemicro'), job('onemicro'), Boolean(key.location))}</strong></div><em>{ago(key.observedAt, now)}</em></article>
                <article><span className={`mc-signal ${assets?.sticker_url || features.length ? 'on' : 'warn'}`} /><div><small>FACTORY DATA</small><strong>{features.length ? 'verified' : assetsBusy ? 'reading' : 'not found'}</strong></div><em>{assets?.loaded_at ? ago(assets.loaded_at, now) : 'automatic'}</em></article>
              </section>

              <div className="mc-grid">
                <section className="mc-panel mc-carfax">
                  <header><div><p className="mc-kicker">OWNERSHIP + RISK</p><h2>CARFAX dealer dossier</h2></div><span className={carfax.dealerVerified ? 'mc-tag verified' : 'mc-tag'}>{carfax.dealerVerified ? 'DEALER VERIFIED' : 'PUBLIC DATA'}</span></header>
                  <div className="mc-fact-grid">
                    <div><span>Owners</span><strong>{carfax.owners ?? '—'}</strong></div>
                    <div><span>Last owned</span><strong>{carfax.lastOwnedState ?? '—'}</strong></div>
                    <div><span>Use</span><strong>{carfax.usage ?? '—'}</strong></div>
                    <div><span>Service records</span><strong>{carfax.serviceRecords ?? carfax.service ?? '—'}</strong></div>
                    <div><span>Accident events</span><strong>{carfax.accidents ?? '—'}</strong></div>
                    <div><span>CARFAX value</span><strong>{money(carfax.carfaxValue)}</strong></div>
                    <div><span>Warranty</span><strong>{carfax.warranty ?? 'Not stated'}</strong></div>
                    <div><span>Title</span><strong>{carfax.titleStatus ?? 'Not stated'}</strong></div>
                  </div>
                  <ul className="mc-check-list">
                    {carfax.highlights.slice(0, 10).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                  {carfax.accidentHistory.length > 0 && <div className="mc-subsection"><h3>Reported events</h3>{carfax.accidentHistory.map((event, index) => <p key={`${event.date}-${index}`}><time>{event.date ?? 'Date not shown'}</time>{event.detail}</p>)}</div>}
                  {carfax.reportUrl && <a className="mc-text-link" href={carfax.reportUrl} target="_blank" rel="noreferrer">Open complete dealer report ↗</a>}
                </section>

                <section className="mc-panel mc-recon">
                  <header><div><p className="mc-kicker">WORK PERFORMED</p><h2>Recon timeline</h2></div><span className="mc-tag">{recon.stage ?? 'PENDING'}</span></header>
                  {recon.workSummary && <p className="mc-summary">{recon.workSummary}</p>}
                  <div className="mc-timeline">
                    {recon.orders.length ? recon.orders.map((order, index) => (
                      <article key={`${order.repairOrder}-${index}`}>
                        <span className="mc-timeline-dot" />
                        <div>
                          <small>{order.completedAt ?? order.openedAt ?? 'Time not captured'}</small>
                          <h3>{order.repairOrder ? `RO ${order.repairOrder}` : `Repair order ${index + 1}`}</h3>
                          <p>{[order.department, order.status].filter(Boolean).join(' · ') || 'Department not captured'}</p>
                          <p className="mc-people">{order.technician ? `Technician: ${order.technician}` : 'Technician not captured'}{order.advisor ? ` · Advisor: ${order.advisor}` : ''}</p>
                          {order.workPerformed.length > 0 && <ul>{order.workPerformed.map((item) => <li key={item}>{item}</li>)}</ul>}
                        </div>
                      </article>
                    )) : <p className="mc-empty">{assetsBusy ? 'Reading all repair orders automatically…' : 'No repair-order details have been captured for this VIN yet.'}</p>}
                  </div>
                </section>

                <section className="mc-panel mc-features">
                  <header><div><p className="mc-kicker">WHY THIS ONE</p><h2>Standout factory equipment</h2></div>{assets?.sticker_url && <a className="mc-tag" href={assets.sticker_url} target="_blank" rel="noreferrer">STICKER ↗</a>}</header>
                  {features.length ? <ol>{features.map((feature, index) => <li key={feature}><b>{String(index + 1).padStart(2, '0')}</b><span>{feature}</span></li>)}</ol> : <p className="mc-empty">{assetsBusy ? 'Reading equipment and packages…' : 'No factory sticker or differentiated option data was found.'}</p>}
                </section>

                <section className="mc-panel mc-key">
                  <header><div><p className="mc-kicker">KEY CUSTODY</p><h2>1Micro latest activity</h2></div><span className="mc-tag">{key.location ? 'LOCATED' : 'PENDING'}</span></header>
                  <div className="mc-key-layout">
                    {key.keyImageUrl ? <img src={key.keyImageUrl} alt="Latest 1Micro key record" /> : <div className="mc-key-placeholder">KEY PHOTO<br />NOT CAPTURED</div>}
                    <dl>
                      <dt>Last person</dt><dd>{key.lastCheckedOutBy ?? 'Not captured'}</dd>
                      <dt>Last checkout</dt><dd>{key.lastCheckedOutAt ?? 'Not captured'}</dd>
                      <dt>Tag location</dt><dd>{key.location ?? 'Not captured'}</dd>
                      <dt>Lot</dt><dd>{key.lotLocation ?? 'Not captured'}</dd>
                    </dl>
                  </div>
                </section>

                <section className="mc-panel mc-selling">
                  <header><div><p className="mc-kicker">EVIDENCE-BASED COPY</p><h2>Ready-to-use selling description</h2></div></header>
                  <div className="mc-copy-block">
                    <div><h3>Summary</h3><button type="button" onClick={() => void handleCopy('summary')}>{copied === 'summary' ? 'Copied' : 'Copy'}</button></div>
                    <p>{copy.summary || 'Waiting for verified vehicle details…'}</p>
                  </div>
                  <div className="mc-copy-block detailed">
                    <div><h3>Detailed listing</h3><button type="button" onClick={() => void handleCopy('detailed')}>{copied === 'detailed' ? 'Copied' : 'Copy'}</button></div>
                    <p>{copy.detailed || 'Waiting for verified vehicle details…'}</p>
                  </div>
                </section>

                <section className="mc-panel mc-finance">
                  <header><div><p className="mc-kicker">COX AUTOMOTIVE</p><h2>JD Power / LTV</h2></div><span className="mc-tag verified">{valuationCount?.toLocaleString() ?? '—'} VALUES</span></header>
                  <div className="mc-finance-meter">
                    <div><span>Retail price</span><strong>{money(vehicle.retailPrice)}</strong></div>
                    <div><span>JD Power trade</span><strong>{money(vehicle.jdPowerTradeIn)}</strong></div>
                    <div><span>LTV basis</span><strong>{money(vehicle.ltvBasis)}</strong></div>
                    <div><span>Calculated LTV</span><strong>{vehicle.loanToValue == null ? '—' : `${vehicle.loanToValue.toFixed(2)}%`}</strong></div>
                  </div>
                  <div className="mc-upload"><input type="file" accept=".xls,.xlsx,.xlsm" onChange={(event) => setValuationFile(event.target.files?.[0] ?? null)} /><button type="button" disabled={!valuationFile} onClick={() => void uploadValuation()}>Import values</button></div>
                </section>
              </div>

              <details className="mc-systems">
                <summary><span>System evidence</span><strong>{useful.filter((item) => item.enabled && !item.currentError).length}/{useful.length} operational</strong><em>{devices.length} Windows agent{devices.length === 1 ? '' : 's'}</em></summary>
                <div>{useful.map((item) => <article key={item.id}><span className={`mc-signal ${item.enabled && !item.currentError ? 'on' : 'warn'}`} /><div><strong>{item.displayName}</strong><small>{item.currentError ?? (item.enabled ? `${item.authenticationStatus} · ${item.executionLocation}` : 'Not configured')}</small></div></article>)}</div>
              </details>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
