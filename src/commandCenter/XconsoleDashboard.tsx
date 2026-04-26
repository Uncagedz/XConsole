
import { useEffect, useMemo, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useSalesContext } from './context';
import './XconsoleDashboard.css';

type InventorySourceStatus = {
  configured_url?: string;
  active_source?: string;
  live_cache_count?: number;
  snapshot_count?: number;
  last_synced_at?: string | null;
};

type Vehicle = {
  vin: string;
  title?: string;
  price?: string | number;
  mileage?: string | number;
  drivetrain?: string;
  engine?: string;
  transmission?: string;
  location?: string;
  exterior?: string;
  interior?: string;
  detail_url?: string;
  photos?: unknown[];
  status_label?: string;
  posted?: boolean;
  posted_status?: string;
  posted_at?: string | null;
};

type VehiclesResponse = {
  items?: Vehicle[];
  source_status?: InventorySourceStatus;
};

type FacebookAccount = {
  id?: string;
  name?: string;
  email?: string;
  has_password?: boolean;
};

type PostItem = {
  vin?: string;
  timestamp?: number;
  file?: string;
};

type VehicleAssets = {
  vin: string;
  photos?: unknown[];
  sticker_url?: string | null;
  carfax_url?: string | null;
};

type BankProfile = {
  code: string;
  name: string;
};

type BankRank = {
  bank_code: string;
  bank_name: string;
  confidence: number;
  reasons: string[];
};

type BankRecommendation = {
  ranked_banks: BankRank[];
  best_bank?: BankRank;
  backup_bank?: BankRank;
  high_risk_flags?: string[];
  suggested_changes?: string[];
};

type CreditMetrics = {
  score?: number | null;
  tradelines?: number | null;
  derogatories?: number | null;
  utilization?: number | null;
  dti?: number | null;
};

type BankBrainAnalyzeResult = {
  metrics?: CreditMetrics;
  recommendation?: BankRecommendation;
};

type CreditStructureResult = {
  structure?: {
    financed_amount?: number;
    estimated_payment?: number;
    ltv?: number | null;
    pti?: number | null;
    dti?: number | null;
  };
  recommendation?: BankRecommendation;
};

type BankHistoryItem = {
  bank_code?: string;
  outcome?: 'approved' | 'declined' | 'countered';
  created_at?: string;
};

type OneClickPostResult = {
  selected_photo_indexes?: number[];
  images_for_post?: string[];
  post_result?: {
    mode?: 'live' | 'draft';
    live_success?: boolean;
  };
};

type VehicleEditorState = {
  vin: string;
  title: string;
  price: string;
  mileage: string;
  drivetrain: string;
  engine: string;
  transmission: string;
  location: string;
  detail_url: string;
  exterior: string;
  interior: string;
  photos_csv: string;
};

type StructureFormState = {
  vin: string;
  vehicle_price: string;
  trade: string;
  taxes: string;
  fees: string;
  backend_products: string;
  down_payment: string;
  term_months: string;
  apr: string;
  monthly_income: string;
  current_dti: string;
  credit_score: string;
  tradelines: string;
  derogatories: string;
  utilization: string;
};

const DEFAULT_SKIP_INDEXES = [0, 2];

const EMPTY_EDITOR: VehicleEditorState = {
  vin: '',
  title: '',
  price: '',
  mileage: '',
  drivetrain: '',
  engine: '',
  transmission: '',
  location: '',
  detail_url: '',
  exterior: '',
  interior: '',
  photos_csv: '',
};

const DEFAULT_STRUCTURE_FORM: StructureFormState = {
  vin: '',
  vehicle_price: '',
  trade: '0',
  taxes: '0',
  fees: '0',
  backend_products: '0',
  down_payment: '0',
  term_months: '72',
  apr: '9.99',
  monthly_income: '',
  current_dti: '',
  credit_score: '',
  tradelines: '',
  derogatories: '',
  utilization: '',
};

function normalizeVin(value: string | undefined | null): string {
  return String(value || '').trim().toUpperCase();
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function extractPhotoUrl(item: unknown): string | null {
  if (isHttpUrl(item)) {
    return item;
  }
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    for (const key of ['url', 'src', 'image', 'photo']) {
      if (isHttpUrl(record[key])) {
        return record[key];
      }
    }
  }
  return null;
}

function normalizePhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of value) {
    const url = extractPhotoUrl(item);
    if (!url) {
      continue;
    }
    const key = url.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    urls.push(url);
  }
  return urls;
}

function parseNumber(value: string | number | undefined | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPrice(value: string | number | undefined): string {
  const parsed = parseNumber(value);
  return parsed === null ? String(value || '$0') : `$${parsed.toLocaleString()}`;
}

function toMileage(value: string | number | undefined): string {
  const parsed = parseNumber(value);
  return parsed === null ? 'n/a' : `${parsed.toLocaleString()} mi`;
}

function localTime(value: string | undefined | null): string {
  if (!value) {
    return 'n/a';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function defaultCaption(vehicle: Vehicle | undefined): string {
  if (!vehicle) {
    return '';
  }
  const lines = [vehicle.title || vehicle.vin, `Price: ${toPrice(vehicle.price)}`];
  if (vehicle.mileage !== undefined && vehicle.mileage !== null) {
    lines.push(`Mileage: ${toMileage(vehicle.mileage)}`);
  }
  if (vehicle.location) {
    lines.push(`Location: ${vehicle.location}`);
  }
  if (vehicle.detail_url) {
    lines.push(vehicle.detail_url);
  }
  return lines.join('\n');
}

function extractErrorMessage(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (record.detail) {
      return extractErrorMessage(record.detail);
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return 'Request failed';
    }
  }
  return 'Request failed';
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload));
  }
  return payload as T;
}

function vehicleToEditor(vehicle: Vehicle): VehicleEditorState {
  return {
    vin: normalizeVin(vehicle.vin),
    title: vehicle.title || '',
    price: vehicle.price !== undefined && vehicle.price !== null ? String(vehicle.price) : '',
    mileage: vehicle.mileage !== undefined && vehicle.mileage !== null ? String(vehicle.mileage) : '',
    drivetrain: vehicle.drivetrain || '',
    engine: vehicle.engine || '',
    transmission: vehicle.transmission || '',
    location: vehicle.location || '',
    detail_url: vehicle.detail_url || '',
    exterior: vehicle.exterior || '',
    interior: vehicle.interior || '',
    photos_csv: normalizePhotoUrls(vehicle.photos).join(', '),
  };
}

function buildStructuredData(fields: {
  score: string;
  tradelines: string;
  derogatories: string;
  utilization: string;
  dti: string;
}): Record<string, number> {
  const payload: Record<string, number> = {};
  const score = parseOptionalNumber(fields.score);
  const tradelines = parseOptionalNumber(fields.tradelines);
  const derogatories = parseOptionalNumber(fields.derogatories);
  const utilization = parseOptionalNumber(fields.utilization);
  const dti = parseOptionalNumber(fields.dti);

  if (score !== null) payload.score = Math.round(score);
  if (tradelines !== null) payload.tradelines = Math.round(tradelines);
  if (derogatories !== null) payload.derogatories = Math.round(derogatories);
  if (utilization !== null) payload.utilization = utilization;
  if (dti !== null) payload.dti = dti;
  return payload;
}

export function XconsoleDashboard() {
  const { selectedVin, setSelectedVin } = useSalesContext();
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);

  const [inventory, setInventory] = useState<Vehicle[]>([]);
  const [sourceStatus, setSourceStatus] = useState<InventorySourceStatus | null>(null);
  const [accounts, setAccounts] = useState<FacebookAccount[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [bankProfiles, setBankProfiles] = useState<BankProfile[]>([]);
  const [bankHistory, setBankHistory] = useState<BankHistoryItem[]>([]);
  const [assetCache, setAssetCache] = useState<Record<string, VehicleAssets>>({});

  const [statusText, setStatusText] = useState('Loading Xconsole...');
  const [searchText, setSearchText] = useState('');
  const [dealershipUrl, setDealershipUrl] = useState('');
  const [accountId, setAccountId] = useState('');
  const [captionText, setCaptionText] = useState('');
  const [selectedPhotoIndexes, setSelectedPhotoIndexes] = useState<number[]>([]);
  const [analysisText, setAnalysisText] = useState('');
  const [analysisFields, setAnalysisFields] = useState({
    score: '',
    tradelines: '',
    derogatories: '',
    utilization: '',
    dti: '',
  });
  const [analysisUploadFile, setAnalysisUploadFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<BankBrainAnalyzeResult | null>(null);
  const [structureForm, setStructureForm] = useState<StructureFormState>(DEFAULT_STRUCTURE_FORM);
  const [structureResult, setStructureResult] = useState<CreditStructureResult | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [postResult, setPostResult] = useState<OneClickPostResult | null>(null);

  const [refreshBusy, setRefreshBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [assetBusy, setAssetBusy] = useState(false);
  const [postBusy, setPostBusy] = useState(false);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [structureBusy, setStructureBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'add' | 'edit'>('add');
  const [editorState, setEditorState] = useState<VehicleEditorState>(EMPTY_EDITOR);
  const [workspaceTab, setWorkspaceTab] = useState<'overview' | 'marketing' | 'finance'>('overview');
  const [workspaceMode, setWorkspaceMode] = useState<'vehicle' | 'pipeline'>('vehicle');
  const [commandInput, setCommandInput] = useState('');
  const [dealCostInput, setDealCostInput] = useState('');
  const [dealNotes, setDealNotes] = useState('');
  const [inCreditAppByVin, setInCreditAppByVin] = useState<Record<string, boolean>>({});
  const [bankSubmittedByVin, setBankSubmittedByVin] = useState<Record<string, boolean>>({});
  const [marketingFlags, setMarketingFlags] = useState({
    includePrice: true,
    includeDownPaymentPromo: false,
    includeFinanceLanguage: true,
  });
  const [promoDownPaymentInput, setPromoDownPaymentInput] = useState('999');
  const [photoOrder, setPhotoOrder] = useState<number[]>([]);
  const [draggingPhotoIndex, setDraggingPhotoIndex] = useState<number | null>(null);
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [showCarfaxModal, setShowCarfaxModal] = useState(false);
  const [advancedFinanceOpen, setAdvancedFinanceOpen] = useState(false);
  const [creditDeepDiveOpen, setCreditDeepDiveOpen] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const normalizedSelectedVin = normalizeVin(selectedVin);
  const selectedVehicle = useMemo(
    () => inventory.find((vehicle) => normalizeVin(vehicle.vin) === normalizedSelectedVin),
    [inventory, normalizedSelectedVin],
  );
  const selectedAssets = normalizedSelectedVin ? assetCache[normalizedSelectedVin] : undefined;

  const selectedPhotoUrls = useMemo(() => {
    const assetPhotos = normalizePhotoUrls(selectedAssets?.photos);
    if (assetPhotos.length) {
      return assetPhotos;
    }
    return normalizePhotoUrls(selectedVehicle?.photos);
  }, [selectedAssets?.photos, selectedVehicle?.photos]);

  const filteredInventory = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) {
      return inventory;
    }
    return inventory.filter((vehicle) => {
      const haystack = [
        vehicle.vin,
        vehicle.title || '',
        vehicle.status_label || '',
        vehicle.posted_status || '',
        vehicle.location || '',
        String(vehicle.price || ''),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [inventory, searchText]);

  async function refreshAll() {
    setRefreshBusy(true);
    try {
      const [vehiclesPayload, accountPayload, postsPayload, lendersPayload, historyPayload] = await Promise.all([
        requestJson<VehiclesResponse>('/api/vehicles'),
        requestJson<{ items?: FacebookAccount[] }>('/api/facebook/accounts'),
        requestJson<{ items?: PostItem[] }>('/api/facebook/posts'),
        requestJson<{ items?: BankProfile[] }>('/api/bank-brain/lenders').catch(() => ({ items: [] })),
        requestJson<{ items?: BankHistoryItem[] }>('/api/bank-brain/history?limit=30').catch(() => ({
          items: [],
        })),
      ]);

      const vehicles = Array.isArray(vehiclesPayload.items) ? vehiclesPayload.items : [];
      setInventory(vehicles);
      setSourceStatus(vehiclesPayload.source_status || null);
      if (!dealershipUrl && vehiclesPayload.source_status?.configured_url) {
        setDealershipUrl(String(vehiclesPayload.source_status.configured_url));
      }

      const accountItems = Array.isArray(accountPayload.items) ? accountPayload.items : [];
      setAccounts(accountItems);
      if (!accountId) {
        const preferred = accountItems.find((entry) => entry.id && entry.has_password)?.id;
        const fallback = accountItems.find((entry) => entry.id)?.id;
        if (preferred || fallback) {
          setAccountId(String(preferred || fallback));
        }
      }

      setPosts(Array.isArray(postsPayload.items) ? postsPayload.items : []);
      setBankProfiles(Array.isArray(lendersPayload.items) ? lendersPayload.items : []);
      setBankHistory(Array.isArray(historyPayload.items) ? historyPayload.items : []);

      const selectedExists = vehicles.some((vehicle) => normalizeVin(vehicle.vin) === normalizedSelectedVin);
      if (!selectedExists && vehicles.length) {
        setSelectedVin(normalizeVin(vehicles[0].vin));
      }
      setStatusText(
        `Inventory ${vehicles.length} | Accounts ${accountItems.length} | Lenders ${Array.isArray(lendersPayload.items) ? lendersPayload.items.length : 0}`,
      );
    } catch (error: unknown) {
      setStatusText(`Failed to refresh Xconsole: ${String(error)}`);
    } finally {
      setRefreshBusy(false);
    }
  }

  async function syncInventory() {
    setSyncBusy(true);
    try {
      await requestJson('/api/inventory/sync-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_url: dealershipUrl || undefined,
          timeout_seconds: 30,
          persist: true,
        }),
      });
      setStatusText('Live inventory sync complete.');
      await refreshAll();
    } catch (error: unknown) {
      setStatusText(`Inventory sync failed: ${String(error)}`);
    } finally {
      setSyncBusy(false);
    }
  }

  async function loadVehicleAssets(vin: string, refresh = false) {
    const cleanVin = normalizeVin(vin);
    if (!cleanVin) {
      return;
    }
    setAssetBusy(true);
    try {
      const payload = await requestJson<VehicleAssets>(
        `/api/vehicles/${encodeURIComponent(cleanVin)}/assets${refresh ? '?refresh=true' : ''}`,
      );
      setAssetCache((previous) => ({ ...previous, [cleanVin]: payload }));
      setStatusText(`Assets loaded for ${cleanVin}.`);
    } catch (error: unknown) {
      setStatusText(`Vehicle asset load failed: ${String(error)}`);
    } finally {
      setAssetBusy(false);
    }
  }

  async function postToFacebook(vinOverride?: string, mode: 'live' | 'draft' = 'live') {
    const targetVin = normalizeVin(vinOverride || normalizedSelectedVin);
    if (!targetVin) {
      setStatusText('Select a vehicle before posting.');
      return;
    }
    const rowVehicle = inventory.find((vehicle) => normalizeVin(vehicle.vin) === targetVin);
    const orderedSelectedIndexes = photoOrder.length
      ? photoOrder.filter((index) => selectedPhotoIndexes.includes(index))
      : selectedPhotoIndexes;
    const indexesToSend = targetVin === normalizedSelectedVin ? orderedSelectedIndexes : [];
    const caption = targetVin === normalizedSelectedVin ? marketingCaptionPreview : defaultCaption(rowVehicle);

    setPostBusy(true);
    try {
      const payload = await requestJson<OneClickPostResult>('/api/facebook/post/from-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vin: targetVin,
          account_id: accountId || undefined,
          caption_override: caption || undefined,
          selected_photo_indexes: indexesToSend,
          skip_photo_indexes: DEFAULT_SKIP_INDEXES,
          mode,
          auto_import_photos: true,
          photo_limit: 24,
        }),
      });
      setPostResult(payload);
      const postedMode = payload.post_result?.mode || mode;
      const postedState =
        postedMode === 'live'
          ? payload.post_result?.live_success
            ? 'Live posted'
            : 'Live post attempted'
          : 'Draft created';
      setStatusText(`${postedState} for ${targetVin}.`);
      await refreshAll();
    } catch (error: unknown) {
      setStatusText(`Facebook post failed: ${String(error)}`);
    } finally {
      setPostBusy(false);
    }
  }
  async function analyzeCredit() {
    setAnalyzeBusy(true);
    setAnalysisProgress(20);
    try {
      const payload = await requestJson<BankBrainAnalyzeResult>('/api/bank-brain/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_text: analysisText,
          structured_data: buildStructuredData(analysisFields),
        }),
      });
      setAnalysisResult(payload);
      if (normalizedSelectedVin) {
        setInCreditAppByVin((previous) => ({ ...previous, [normalizedSelectedVin]: true }));
      }
      setAnalysisProgress(100);
      setStatusText('Bank Brain analysis complete.');
    } catch (error: unknown) {
      setStatusText(`Bank Brain analyze failed: ${String(error)}`);
    } finally {
      setAnalyzeBusy(false);
      setTimeout(() => setAnalysisProgress(0), 500);
    }
  }

  async function analyzeUpload() {
    if (!analysisUploadFile) {
      setStatusText('Select a credit report file first.');
      return;
    }
    setUploadBusy(true);
    setAnalysisProgress(15);
    try {
      const formData = new FormData();
      formData.append('file', analysisUploadFile);
      const payload = await requestJson<BankBrainAnalyzeResult>('/api/bank-brain/analyze-upload', {
        method: 'POST',
        body: formData,
      });
      setAnalysisResult(payload);
      if (normalizedSelectedVin) {
        setInCreditAppByVin((previous) => ({ ...previous, [normalizedSelectedVin]: true }));
      }
      setAnalysisProgress(100);
      setStatusText(`Uploaded report analyzed: ${analysisUploadFile.name}`);
    } catch (error: unknown) {
      setStatusText(`Credit upload analysis failed: ${String(error)}`);
    } finally {
      setUploadBusy(false);
      setTimeout(() => setAnalysisProgress(0), 500);
    }
  }

  async function simulateStructure() {
    const vehiclePrice = parseOptionalNumber(structureForm.vehicle_price);
    if (!vehiclePrice || vehiclePrice <= 0) {
      setStatusText('Vehicle price must be greater than 0.');
      return;
    }

    setStructureBusy(true);
    try {
      const effectiveDownPayment =
        (parseOptionalNumber(structureForm.down_payment) ?? 0) +
        (parseOptionalNumber(structureForm.trade) ?? 0);
      const payload: Record<string, unknown> = {
        vin: structureForm.vin || undefined,
        vehicle_price: vehiclePrice,
        taxes: parseOptionalNumber(structureForm.taxes) ?? 0,
        fees: parseOptionalNumber(structureForm.fees) ?? 0,
        backend_products: parseOptionalNumber(structureForm.backend_products) ?? 0,
        down_payment: effectiveDownPayment,
        term_months: parseOptionalNumber(structureForm.term_months) ?? 72,
        apr: parseOptionalNumber(structureForm.apr) ?? 9.99,
        monthly_income: parseOptionalNumber(structureForm.monthly_income),
        current_dti: parseOptionalNumber(structureForm.current_dti),
        credit_score: parseOptionalNumber(structureForm.credit_score),
        tradelines: parseOptionalNumber(structureForm.tradelines),
        derogatories: parseOptionalNumber(structureForm.derogatories),
        utilization: parseOptionalNumber(structureForm.utilization),
      };
      const response = await requestJson<CreditStructureResult>('/api/bank-brain/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setStructureResult(response);
      if (normalizedSelectedVin) {
        setInCreditAppByVin((previous) => ({ ...previous, [normalizedSelectedVin]: true }));
      }
      setStatusText('Credit structuring simulation complete.');
    } catch (error: unknown) {
      setStatusText(`Structuring simulation failed: ${String(error)}`);
    } finally {
      setStructureBusy(false);
    }
  }

  async function logBankDecision(outcome: 'approved' | 'declined' | 'countered') {
    const bankCode =
      analysisResult?.recommendation?.best_bank?.bank_code ||
      structureResult?.recommendation?.best_bank?.bank_code;
    if (!bankCode) {
      setStatusText('No bank recommendation available to log decision.');
      return;
    }

    setDecisionBusy(true);
    try {
      await requestJson('/api/bank-brain/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vin: normalizedSelectedVin || undefined,
          bank_code: bankCode,
          outcome,
          notes: decisionNotes || undefined,
          metrics: analysisResult?.metrics || {},
        }),
      });
      const historyPayload = await requestJson<{ items?: BankHistoryItem[] }>(
        '/api/bank-brain/history?limit=30',
      );
      setBankHistory(Array.isArray(historyPayload.items) ? historyPayload.items : []);
      if (normalizedSelectedVin) {
        setBankSubmittedByVin((previous) => ({ ...previous, [normalizedSelectedVin]: true }));
      }
      setStatusText(`Decision logged: ${bankCode} ${outcome}.`);
      setDecisionNotes('');
    } catch (error: unknown) {
      setStatusText(`Failed to log decision: ${String(error)}`);
    } finally {
      setDecisionBusy(false);
    }
  }

  function openEditor(mode: 'add' | 'edit', vehicle?: Vehicle) {
    setEditorMode(mode);
    setEditorState(mode === 'edit' && vehicle ? vehicleToEditor(vehicle) : EMPTY_EDITOR);
    setEditorOpen(true);
  }

  async function saveEditorVehicle() {
    const cleanVin = normalizeVin(editorState.vin);
    if (!cleanVin || !editorState.title.trim()) {
      setStatusText('VIN and title are required.');
      return;
    }

    setEditorBusy(true);
    try {
      const photos = editorState.photos_csv
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const parsedPrice = parseOptionalNumber(editorState.price);
      const parsedMileage = parseOptionalNumber(editorState.mileage);
      const payload = {
        vin: cleanVin,
        title: editorState.title.trim(),
        price: parsedPrice ?? (editorState.price.trim() || null),
        mileage: parsedMileage ?? (editorState.mileage.trim() || null),
        drivetrain: editorState.drivetrain || null,
        engine: editorState.engine || null,
        transmission: editorState.transmission || null,
        location: editorState.location || null,
        detail_url: editorState.detail_url || null,
        exterior: editorState.exterior || null,
        interior: editorState.interior || null,
        photos,
      };
      await requestJson('/api/vehicles/manual-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setEditorOpen(false);
      setSelectedVin(cleanVin);
      setStatusText(`${editorMode === 'add' ? 'Added' : 'Saved'} vehicle ${cleanVin}.`);
      await refreshAll();
    } catch (error: unknown) {
      setStatusText(`Vehicle save failed: ${String(error)}`);
    } finally {
      setEditorBusy(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (!normalizedSelectedVin || assetCache[normalizedSelectedVin]) {
      return;
    }
    void loadVehicleAssets(normalizedSelectedVin);
  }, [assetCache, normalizedSelectedVin]);

  useEffect(() => {
    setCaptionText(defaultCaption(selectedVehicle));
  }, [selectedVehicle]);

  useEffect(() => {
    const defaults = selectedPhotoUrls
      .map((_, index) => index)
      .filter((index) => !DEFAULT_SKIP_INDEXES.includes(index));
    setSelectedPhotoIndexes(defaults);
  }, [normalizedSelectedVin, selectedPhotoUrls.length]);

  useEffect(() => {
    setPhotoOrder(selectedPhotoUrls.map((_, index) => index));
  }, [normalizedSelectedVin, selectedPhotoUrls.length]);

  useEffect(() => {
    if (!selectedVehicle) {
      return;
    }
    const numericPrice = parseNumber(selectedVehicle.price);
    setStructureForm((previous) => ({
      ...previous,
      vin: normalizeVin(selectedVehicle.vin),
      vehicle_price: numericPrice !== null ? String(numericPrice) : previous.vehicle_price,
    }));
  }, [selectedVehicle]);

  useEffect(() => {
    if (!selectedVehicle) {
      return;
    }
    const parsedPrice = parseNumber(selectedVehicle.price);
    if (parsedPrice !== null) {
      setDealCostInput((previous) => previous || String(Math.max(0, Math.round(parsedPrice * 0.86))));
    }
  }, [selectedVehicle]);

  function togglePhotoSelection(index: number) {
    setSelectedPhotoIndexes((previous) => {
      if (previous.includes(index)) {
        return previous.filter((item) => item !== index);
      }
      return [...previous, index].sort((a, b) => a - b);
    });
  }

  function movePhotoOrder(sourceIndex: number, targetIndex: number) {
    setPhotoOrder((previous) => {
      const sourcePosition = previous.indexOf(sourceIndex);
      const targetPosition = previous.indexOf(targetIndex);
      if (sourcePosition < 0 || targetPosition < 0 || sourcePosition === targetPosition) {
        return previous;
      }
      const next = [...previous];
      next.splice(sourcePosition, 1);
      next.splice(targetPosition, 0, sourceIndex);
      return next;
    });
  }

  async function runCommand() {
    const raw = commandInput.trim().toLowerCase();
    if (!raw) {
      return;
    }
    const cleaned = raw.startsWith('/') ? raw.slice(1) : raw;

    if (cleaned === 'post this') {
      setWorkspaceTab('marketing');
      await postToFacebook(normalizedSelectedVin, 'live');
      setCommandInput('');
      return;
    }
    if (cleaned === 'best bank?' || cleaned === 'best bank') {
      setWorkspaceTab('finance');
      if (!analysisResult && !structureResult) {
        await simulateStructure();
      }
      setCommandInput('');
      return;
    }
    if (cleaned === 'simulate 0 down') {
      setWorkspaceTab('finance');
      setStructureForm((previous) => ({ ...previous, down_payment: '0', trade: '0' }));
      await simulateStructure();
      setCommandInput('');
      return;
    }
    if (cleaned === 'lower price 1k') {
      if (!selectedVehicle) {
        setStatusText('Select a vehicle to adjust price.');
      } else {
        const parsedPrice = parseNumber(selectedVehicle.price);
        if (parsedPrice === null) {
          setStatusText('Unable to lower price: current price is invalid.');
        } else {
          openEditor('edit', { ...selectedVehicle, price: Math.max(0, parsedPrice - 1000) });
          setStatusText('Price adjustment prepared in editor (-$1,000).');
        }
      }
      setCommandInput('');
      return;
    }
    if (cleaned === 'why decline?' || cleaned === 'why decline') {
      setWorkspaceTab('finance');
      setCreditDeepDiveOpen(true);
      setStatusText('Opened finance deep-dive with current risk reasons.');
      setCommandInput('');
      return;
    }

    setStatusText('Unknown command. Try: /post this, /best bank?, /simulate 0 down, /lower price 1k, /why decline?');
    setCommandInput('');
  }

  const bestBank = analysisResult?.recommendation?.best_bank || structureResult?.recommendation?.best_bank;
  const backupBank =
    analysisResult?.recommendation?.backup_bank || structureResult?.recommendation?.backup_bank;
  const combinedRiskFlags = [
    ...(analysisResult?.recommendation?.high_risk_flags || []),
    ...(structureResult?.recommendation?.high_risk_flags || []),
  ];
  const combinedSuggestions = [
    ...(analysisResult?.recommendation?.suggested_changes || []),
    ...(structureResult?.recommendation?.suggested_changes || []),
  ];
  const marketingCaptionPreview = useMemo(() => {
    let content = captionText || defaultCaption(selectedVehicle);
    if (!marketingFlags.includePrice) {
      content = content.replace(/^Price:.*$/gim, '').replace(/\n{2,}/g, '\n').trim();
    }
    if (marketingFlags.includeDownPaymentPromo) {
      content = `${content}\nDown payment promo: from ${toPrice(promoDownPaymentInput)} down.`;
    }
    if (marketingFlags.includeFinanceLanguage) {
      content = `${content}\nFinancing options available.`;
    }
    return content.trim();
  }, [
    captionText,
    marketingFlags.includeDownPaymentPromo,
    marketingFlags.includeFinanceLanguage,
    marketingFlags.includePrice,
    promoDownPaymentInput,
    selectedVehicle,
  ]);
  const orderedPhotoIndexes = photoOrder.length
    ? photoOrder.filter((index) => index >= 0 && index < selectedPhotoUrls.length)
    : selectedPhotoUrls.map((_, index) => index);
  const estimatedFrontGross =
    (parseNumber(selectedVehicle?.price) ?? 0) - (parseOptionalNumber(dealCostInput) ?? 0);
  const estimatedBackGross = parseOptionalNumber(structureForm.backend_products) ?? 0;
  const pipelineStats = {
    posted: inventory.filter((vehicle) => vehicle.posted).length,
    awaitingCredit: inventory.filter((vehicle) => !inCreditAppByVin[normalizeVin(vehicle.vin)]).length,
    inCredit: Object.values(inCreditAppByVin).filter(Boolean).length,
    bankSubmitted: Object.values(bankSubmittedByVin).filter(Boolean).length,
    funded: bankHistory.filter((item) => item.outcome === 'approved').length,
  };
  const vehicleStatusBadges = [
    { label: 'Facebook Posted', state: Boolean(selectedVehicle?.posted) },
    { label: 'Marketplace Listed', state: Boolean(posts.find((entry) => normalizeVin(entry.vin) === normalizedSelectedVin)) },
    { label: 'In Credit App', state: Boolean(inCreditAppByVin[normalizedSelectedVin]) },
    { label: 'Bank Submitted', state: Boolean(bankSubmittedByVin[normalizedSelectedVin]) },
  ];

  return (
    <main className="xc-root">
      <header className="xc-topbar">
        <div className="xc-brand">
          <span className="xc-brand-mark">Taverna</span>
          <span className="xc-brand-sub">Xconsole</span>
        </div>
        <input
          className="xc-search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search inventory (VIN, model, price, status)"
        />
        <button className="xc-btn" type="button" onClick={() => openEditor('add')}>
          Quick-Add Vehicle
        </button>
        <button className="xc-btn" type="button" onClick={() => void refreshAll()} disabled={refreshBusy}>
          {refreshBusy ? 'Refreshing...' : 'Refresh'}
        </button>
        <button className="xc-btn" type="button" onClick={toggleTheme}>
          Theme: {theme}
        </button>
        <div className="xc-chip">Notifications {posts.length}</div>
        <div className="xc-chip">Profile Admin</div>
      </header>

      <p className="xc-status-line">{statusText}</p>

      <section className="xc-grid">
        <article className="xc-panel xc-panel-inventory">
          <div className="xc-panel-head">
            <h2>Inventory</h2>
            <div className="xc-inline">
              <span className="xc-muted">{filteredInventory.length} vehicles</span>
              <button className="xc-btn xc-btn-primary" type="button" onClick={syncInventory} disabled={syncBusy}>
                {syncBusy ? 'Syncing...' : 'Sync Live Inventory'}
              </button>
            </div>
          </div>

          <div className="xc-row-form">
            <input
              className="xc-input"
              value={dealershipUrl}
              onChange={(event) => setDealershipUrl(event.target.value)}
              placeholder="Dealership inventory URL"
            />
            <div className="xc-source-meta">
              <span>Source: {sourceStatus?.active_source || 'runtime_posts'}</span>
              <span>Live: {sourceStatus?.live_cache_count ?? 0}</span>
              <span>Snapshot: {sourceStatus?.snapshot_count ?? 0}</span>
              <span>Last sync: {localTime(sourceStatus?.last_synced_at)}</span>
            </div>
          </div>

          <div className="xc-inventory-list">
            {filteredInventory.map((vehicle) => {
              const vin = normalizeVin(vehicle.vin);
              const isActive = vin === normalizedSelectedVin;
              const image = normalizePhotoUrls(vehicle.photos)[0] || null;
              const postedLabel = vehicle.posted ? 'Posted' : 'Not Posted';

              return (
                <div
                  key={vin}
                  className={`xc-vehicle-row${isActive ? ' is-active' : ''}`}
                  onClick={() => setSelectedVin(vin)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedVin(vin);
                    }
                  }}
                >
                  {image ? (
                    <img className="xc-vehicle-image" src={image} alt={vehicle.title || vin} />
                  ) : (
                    <div className="xc-vehicle-image xc-empty-image">No Photo</div>
                  )}
                  <div className="xc-vehicle-main">
                    <h3>{vehicle.title || vin}</h3>
                    <div className="xc-vehicle-meta">
                      <span>{vin}</span>
                      <span>{toPrice(vehicle.price)}</span>
                      <span>{toMileage(vehicle.mileage)}</span>
                      <span>{vehicle.status_label || 'In Stock'}</span>
                    </div>
                    <div className="xc-vehicle-meta">
                      <span className={vehicle.posted ? 'xc-tag-good' : 'xc-tag-muted'}>{postedLabel}</span>
                      <span>{vehicle.location || 'Location n/a'}</span>
                      <span>{vehicle.posted_at ? `Posted ${localTime(vehicle.posted_at)}` : 'No post timestamp'}</span>
                    </div>
                  </div>
                  <div className="xc-vehicle-actions">
                    <button
                      className="xc-btn"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditor('edit', vehicle);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="xc-btn xc-btn-primary"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void postToFacebook(vin, 'live');
                      }}
                      disabled={postBusy}
                    >
                      Post to Facebook
                    </button>
                    <button
                      className="xc-btn"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedVin(vin);
                        setStructureDrawerOpen(true);
                      }}
                    >
                      Open Finance
                    </button>
                  </div>
                </div>
              );
            })}
            {!filteredInventory.length ? (
              <div className="xc-empty-state">
                <p>No inventory loaded. Run live sync to pull vehicles from the dealership website.</p>
                <button className="xc-btn xc-btn-primary" type="button" onClick={syncInventory} disabled={syncBusy}>
                  {syncBusy ? 'Syncing...' : 'Sync Inventory Now'}
                </button>
              </div>
            ) : null}
          </div>
        </article>

        <article className="xc-panel xc-panel-facebook">
          <div className="xc-panel-head">
            <h2>Facebook Post Manager</h2>
            <span className="xc-muted">{normalizedSelectedVin || 'No VIN selected'}</span>
          </div>
          <p className="xc-muted">
            One click posting with auto-skip for thumbnail indexes 0 and 2. All other photos are selected by default.
          </p>

          <label className="xc-field">
            <span>Facebook Account</span>
            <select
              className="xc-input"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Use default account</option>
              {accounts
                .filter((account) => account.id)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name || account.email || account.id}
                  </option>
                ))}
            </select>
          </label>

          <label className="xc-field">
            <span>Caption</span>
            <textarea
              className="xc-input xc-textarea"
              rows={4}
              value={captionText}
              onChange={(event) => setCaptionText(event.target.value)}
              placeholder="Auto-generated caption will appear here."
            />
          </label>
          <div className="xc-inline">
            <button
              className="xc-btn"
              type="button"
              onClick={() => {
                if (normalizedSelectedVin) {
                  void loadVehicleAssets(normalizedSelectedVin, true);
                }
              }}
              disabled={assetBusy || !normalizedSelectedVin}
            >
              {assetBusy ? 'Loading Assets...' : 'Refresh Assets'}
            </button>
            {selectedAssets?.sticker_url ? (
              <a className="xc-link-btn" href={selectedAssets.sticker_url} target="_blank" rel="noreferrer">
                Sticker
              </a>
            ) : (
              <span className="xc-chip">Sticker n/a</span>
            )}
            {selectedAssets?.carfax_url ? (
              <a className="xc-link-btn" href={selectedAssets.carfax_url} target="_blank" rel="noreferrer">
                Carfax
              </a>
            ) : (
              <span className="xc-chip">Carfax n/a</span>
            )}
          </div>

          <div className="xc-photo-grid">
            {selectedPhotoUrls.map((url, index) => {
              const checked = selectedPhotoIndexes.includes(index);
              const autoSkipped = DEFAULT_SKIP_INDEXES.includes(index);
              return (
                <label key={`${url}-${index}`} className={`xc-photo-card${checked ? ' is-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      setSelectedPhotoIndexes((previous) => {
                        if (event.target.checked) {
                          return [...previous, index].sort((a, b) => a - b);
                        }
                        return previous.filter((item) => item !== index);
                      });
                    }}
                  />
                  <img src={url} alt={`Vehicle ${index + 1}`} />
                  <span>
                    #{index + 1} {autoSkipped ? '(auto-skip default)' : ''}
                  </span>
                </label>
              );
            })}
            {!selectedPhotoUrls.length ? <p className="xc-muted">No photos available for this VIN yet.</p> : null}
          </div>

          <div className="xc-inline">
            <button
              className="xc-btn xc-btn-primary"
              type="button"
              disabled={postBusy || !normalizedSelectedVin}
              onClick={() => void postToFacebook(normalizedSelectedVin, 'live')}
            >
              {postBusy ? 'Posting...' : 'Post to Facebook'}
            </button>
            <button
              className="xc-btn"
              type="button"
              disabled={postBusy || !normalizedSelectedVin}
              onClick={() => void postToFacebook(normalizedSelectedVin, 'draft')}
            >
              Save Draft
            </button>
          </div>

          {postResult ? (
            <div className="xc-result">
              <p>Selected photos: {postResult.selected_photo_indexes?.length ?? 0}</p>
              <p>Prepared images: {postResult.images_for_post?.length ?? 0}</p>
              <p>Result mode: {postResult.post_result?.mode || 'n/a'}</p>
              <p>Live success: {postResult.post_result?.live_success ? 'yes' : 'no'}</p>
            </div>
          ) : null}

          <div className="xc-subsection">
            <h3>Recent Post Logs</h3>
            <ul className="xc-compact-list">
              {posts.slice(0, 8).map((entry, index) => (
                <li key={`${entry.vin || 'vin'}-${entry.timestamp || index}`}>
                  <span>{entry.vin || 'VIN n/a'}</span>
                  <span>{entry.file || 'listing file n/a'}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="xc-panel xc-panel-bank">
          <div className="xc-panel-head">
            <h2>Bank Brain</h2>
            <button className="xc-btn" type="button" onClick={() => void refreshAll()} disabled={refreshBusy}>
              Reload Intelligence
            </button>
          </div>

          <label className="xc-field">
            <span>Credit Report Text</span>
            <textarea
              className="xc-input xc-textarea"
              rows={4}
              value={analysisText}
              onChange={(event) => setAnalysisText(event.target.value)}
              placeholder="Paste credit report text or key findings."
            />
          </label>

          <div className="xc-inline-fields">
            <input
              className="xc-input"
              value={analysisFields.score}
              onChange={(event) => setAnalysisFields((prev) => ({ ...prev, score: event.target.value }))}
              placeholder="Score"
            />
            <input
              className="xc-input"
              value={analysisFields.tradelines}
              onChange={(event) => setAnalysisFields((prev) => ({ ...prev, tradelines: event.target.value }))}
              placeholder="Tradelines"
            />
            <input
              className="xc-input"
              value={analysisFields.derogatories}
              onChange={(event) => setAnalysisFields((prev) => ({ ...prev, derogatories: event.target.value }))}
              placeholder="Derogatories"
            />
            <input
              className="xc-input"
              value={analysisFields.utilization}
              onChange={(event) => setAnalysisFields((prev) => ({ ...prev, utilization: event.target.value }))}
              placeholder="Utilization %"
            />
            <input
              className="xc-input"
              value={analysisFields.dti}
              onChange={(event) => setAnalysisFields((prev) => ({ ...prev, dti: event.target.value }))}
              placeholder="DTI %"
            />
          </div>
          <div className="xc-inline">
            <button className="xc-btn xc-btn-primary" type="button" onClick={analyzeCredit} disabled={analyzeBusy}>
              {analyzeBusy ? 'Analyzing...' : 'Analyze Credit'}
            </button>
            <input
              className="xc-file"
              type="file"
              accept=".txt,.json,.pdf,.csv"
              onChange={(event) => setAnalysisUploadFile(event.target.files?.[0] || null)}
            />
            <button className="xc-btn" type="button" onClick={analyzeUpload} disabled={uploadBusy}>
              {uploadBusy ? 'Uploading...' : 'Analyze Upload'}
            </button>
          </div>

          <div className="xc-bank-summary">
            <div>
              <h3>Best Bank</h3>
              <p>{bestBank ? `${bestBank.bank_name} (${bestBank.confidence.toFixed(1)}%)` : 'n/a'}</p>
            </div>
            <div>
              <h3>Backup Bank</h3>
              <p>{backupBank ? `${backupBank.bank_name} (${backupBank.confidence.toFixed(1)}%)` : 'n/a'}</p>
            </div>
          </div>

          <div className="xc-inline">
            <input
              className="xc-input"
              value={decisionNotes}
              onChange={(event) => setDecisionNotes(event.target.value)}
              placeholder="Decision notes / stipulations"
            />
            <button className="xc-btn" type="button" onClick={() => void logBankDecision('approved')} disabled={decisionBusy}>
              Approve
            </button>
            <button className="xc-btn" type="button" onClick={() => void logBankDecision('countered')} disabled={decisionBusy}>
              Counter
            </button>
            <button className="xc-btn" type="button" onClick={() => void logBankDecision('declined')} disabled={decisionBusy}>
              Decline
            </button>
          </div>

          <div className="xc-result">
            <p>
              Score: {analysisResult?.metrics?.score ?? 'n/a'} | Tradelines: {analysisResult?.metrics?.tradelines ?? 'n/a'} |
              Derogatories: {analysisResult?.metrics?.derogatories ?? 'n/a'} | Utilization:{' '}
              {analysisResult?.metrics?.utilization ?? 'n/a'}
            </p>
            <p>Risk Flags: {combinedRiskFlags.length ? combinedRiskFlags.join(' | ') : 'none'}</p>
            <p>Structuring Suggestions: {combinedSuggestions.length ? combinedSuggestions.join(' | ') : 'none'}</p>
          </div>

          <div className="xc-subsection">
            <h3>Bank Profiles</h3>
            <div className="xc-pill-wrap">
              {bankProfiles.map((profile) => (
                <span key={profile.code} className="xc-pill">
                  {profile.name} ({profile.code})
                </span>
              ))}
            </div>
          </div>

          <div className="xc-subsection">
            <h3>Recent Outcomes</h3>
            <ul className="xc-compact-list">
              {bankHistory
                .slice()
                .reverse()
                .slice(0, 8)
                .map((entry, index) => (
                  <li key={`${entry.bank_code || 'bank'}-${entry.created_at || index}`}>
                    <span>
                      {(entry.bank_code || 'BANK').toUpperCase()} {entry.outcome || 'pending'}
                    </span>
                    <span>{localTime(entry.created_at)}</span>
                  </li>
                ))}
            </ul>
          </div>
        </article>
      </section>

      <section className={`xc-structure-drawer${structureDrawerOpen ? ' is-open' : ''}`}>
        <button className="xc-drawer-handle" type="button" onClick={() => setStructureDrawerOpen((open) => !open)}>
          {structureDrawerOpen ? 'Hide Credit Structuring Assistant' : 'Open Credit Structuring Assistant'}
        </button>
        <div className="xc-drawer-body">
          <div className="xc-panel-head">
            <h2>Credit Structuring Assistant</h2>
            <button className="xc-btn xc-btn-primary" type="button" onClick={simulateStructure} disabled={structureBusy}>
              {structureBusy ? 'Simulating...' : 'Simulate Approval'}
            </button>
          </div>

          <div className="xc-structure-grid">
            <input className="xc-input" value={structureForm.vin} onChange={(event) => setStructureForm((prev) => ({ ...prev, vin: event.target.value }))} placeholder="VIN" />
            <input className="xc-input" value={structureForm.vehicle_price} onChange={(event) => setStructureForm((prev) => ({ ...prev, vehicle_price: event.target.value }))} placeholder="Vehicle Price" />
            <input className="xc-input" value={structureForm.taxes} onChange={(event) => setStructureForm((prev) => ({ ...prev, taxes: event.target.value }))} placeholder="Taxes" />
            <input className="xc-input" value={structureForm.fees} onChange={(event) => setStructureForm((prev) => ({ ...prev, fees: event.target.value }))} placeholder="Fees" />
            <input className="xc-input" value={structureForm.backend_products} onChange={(event) => setStructureForm((prev) => ({ ...prev, backend_products: event.target.value }))} placeholder="Backend Products" />
            <input className="xc-input" value={structureForm.down_payment} onChange={(event) => setStructureForm((prev) => ({ ...prev, down_payment: event.target.value }))} placeholder="Down Payment" />
            <input className="xc-input" value={structureForm.term_months} onChange={(event) => setStructureForm((prev) => ({ ...prev, term_months: event.target.value }))} placeholder="Term Months" />
            <input className="xc-input" value={structureForm.apr} onChange={(event) => setStructureForm((prev) => ({ ...prev, apr: event.target.value }))} placeholder="APR" />
            <input className="xc-input" value={structureForm.monthly_income} onChange={(event) => setStructureForm((prev) => ({ ...prev, monthly_income: event.target.value }))} placeholder="Monthly Income" />
            <input className="xc-input" value={structureForm.current_dti} onChange={(event) => setStructureForm((prev) => ({ ...prev, current_dti: event.target.value }))} placeholder="Current DTI %" />
            <input className="xc-input" value={structureForm.credit_score} onChange={(event) => setStructureForm((prev) => ({ ...prev, credit_score: event.target.value }))} placeholder="Credit Score" />
            <input className="xc-input" value={structureForm.tradelines} onChange={(event) => setStructureForm((prev) => ({ ...prev, tradelines: event.target.value }))} placeholder="Tradelines" />
            <input className="xc-input" value={structureForm.derogatories} onChange={(event) => setStructureForm((prev) => ({ ...prev, derogatories: event.target.value }))} placeholder="Derogatories" />
            <input className="xc-input" value={structureForm.utilization} onChange={(event) => setStructureForm((prev) => ({ ...prev, utilization: event.target.value }))} placeholder="Utilization %" />
          </div>
          {structureResult?.structure ? (
            <div className="xc-result">
              <p>
                Financed: {toPrice(structureResult.structure.financed_amount)} | Payment:{' '}
                {toPrice(structureResult.structure.estimated_payment)} | LTV: {structureResult.structure.ltv ?? 'n/a'}%
                | PTI: {structureResult.structure.pti ?? 'n/a'}% | DTI: {structureResult.structure.dti ?? 'n/a'}%
              </p>
              <p>
                Best Bank: {structureResult.recommendation?.best_bank?.bank_name || 'n/a'} | Backup:{' '}
                {structureResult.recommendation?.backup_bank?.bank_name || 'n/a'}
              </p>
              <p>
                High Risk: {structureResult.recommendation?.high_risk_flags?.length
                  ? structureResult.recommendation.high_risk_flags.join(' | ')
                  : 'none'}
              </p>
            </div>
          ) : null}

          {structureResult?.recommendation?.ranked_banks?.length ? (
            <table className="xc-table">
              <thead>
                <tr>
                  <th>Bank</th>
                  <th>Confidence</th>
                  <th>Reasons</th>
                </tr>
              </thead>
              <tbody>
                {structureResult.recommendation.ranked_banks.map((bank) => (
                  <tr key={bank.bank_code}>
                    <td>{bank.bank_name}</td>
                    <td>{bank.confidence.toFixed(1)}%</td>
                    <td>{bank.reasons.length ? bank.reasons.join(' | ') : 'No major negatives'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </section>

      {editorOpen ? (
        <section className="xc-modal-overlay" role="dialog" aria-modal="true" aria-label="Vehicle editor">
          <div className="xc-modal">
            <h2>{editorMode === 'add' ? 'Quick-Add Vehicle' : 'Edit Vehicle'}</h2>
            <div className="xc-structure-grid">
              <input className="xc-input" value={editorState.vin} onChange={(event) => setEditorState((prev) => ({ ...prev, vin: event.target.value }))} placeholder="VIN" />
              <input className="xc-input" value={editorState.title} onChange={(event) => setEditorState((prev) => ({ ...prev, title: event.target.value }))} placeholder="Title" />
              <input className="xc-input" value={editorState.price} onChange={(event) => setEditorState((prev) => ({ ...prev, price: event.target.value }))} placeholder="Price" />
              <input className="xc-input" value={editorState.mileage} onChange={(event) => setEditorState((prev) => ({ ...prev, mileage: event.target.value }))} placeholder="Mileage" />
              <input className="xc-input" value={editorState.drivetrain} onChange={(event) => setEditorState((prev) => ({ ...prev, drivetrain: event.target.value }))} placeholder="Drivetrain" />
              <input className="xc-input" value={editorState.transmission} onChange={(event) => setEditorState((prev) => ({ ...prev, transmission: event.target.value }))} placeholder="Transmission" />
              <input className="xc-input" value={editorState.engine} onChange={(event) => setEditorState((prev) => ({ ...prev, engine: event.target.value }))} placeholder="Engine" />
              <input className="xc-input" value={editorState.location} onChange={(event) => setEditorState((prev) => ({ ...prev, location: event.target.value }))} placeholder="Location" />
              <input className="xc-input" value={editorState.exterior} onChange={(event) => setEditorState((prev) => ({ ...prev, exterior: event.target.value }))} placeholder="Exterior" />
              <input className="xc-input" value={editorState.interior} onChange={(event) => setEditorState((prev) => ({ ...prev, interior: event.target.value }))} placeholder="Interior" />
              <input className="xc-input" value={editorState.detail_url} onChange={(event) => setEditorState((prev) => ({ ...prev, detail_url: event.target.value }))} placeholder="Detail URL" />
              <input className="xc-input" value={editorState.photos_csv} onChange={(event) => setEditorState((prev) => ({ ...prev, photos_csv: event.target.value }))} placeholder="Photos CSV (url1,url2,url3)" />
            </div>
            <div className="xc-inline">
              <button className="xc-btn xc-btn-primary" type="button" onClick={saveEditorVehicle} disabled={editorBusy}>
                {editorBusy ? 'Saving...' : 'Save Vehicle'}
              </button>
              <button className="xc-btn" type="button" onClick={() => setEditorOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
