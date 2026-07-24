import type { Vehicle } from '@drivecentric-ai/shared/xconsole';
import type { VehicleAssets } from './api';
import { vehicleTitle } from './inventory-utils';

export type RepairOrder = {
  repairOrder: string | null;
  department: string | null;
  status: string | null;
  openedAt: string | null;
  completedAt: string | null;
  technician: string | null;
  advisor: string | null;
  workPerformed: string[];
  sourceUrl: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function sourceFields(assets: VehicleAssets | null, connectorId: string) {
  const snapshot = record(assets?.source_intelligence?.[connectorId]);
  return {
    snapshot,
    fields: record(snapshot.fields),
    observedAt: text(snapshot.observedAt),
  };
}

export function carfaxDossier(assets: VehicleAssets | null) {
  const publicSummary = record(assets?.carfax_summary);
  const publicFacts = record(publicSummary.facts);
  const dealer = sourceFields(assets, 'carfax');
  const fields = dealer.fields;
  return {
    owners: number(fields.owners) ?? number(publicFacts.owners),
    lastOwnedState: text(fields.lastOwnedState),
    usage: text(fields.usage),
    accidents: number(fields.accidents) ?? number(publicFacts.accidents),
    accidentHistory: Array.isArray(fields.accidentHistory)
      ? fields.accidentHistory.map(record).map((item) => ({
          date: text(item.date),
          detail: text(item.detail),
        }))
      : [],
    serviceRecords: number(fields.serviceRecords),
    service: text(fields.service) ?? text(publicFacts.service),
    serviceHistory: strings(fields.serviceHistory),
    warranty: text(fields.warranty),
    titleStatus: text(fields.titleStatus),
    carfaxValue: number(fields.carfaxValue),
    reportMileage: number(fields.mileage),
    totalLossReported: typeof fields.totalLossReported === 'boolean' ? fields.totalLossReported : null,
    structuralDamageReported: typeof fields.structuralDamageReported === 'boolean' ? fields.structuralDamageReported : null,
    airbagDeploymentReported: typeof fields.airbagDeploymentReported === 'boolean' ? fields.airbagDeploymentReported : null,
    odometerRollbackIndicated: typeof fields.odometerRollbackIndicated === 'boolean' ? fields.odometerRollbackIndicated : null,
    openRecallsReported: typeof fields.openRecallsReported === 'boolean' ? fields.openRecallsReported : null,
    highlights: strings(fields.highlights).length
      ? strings(fields.highlights)
      : strings(publicSummary.highlights),
    reportUrl: text(fields.reportUrl) ?? assets?.carfax_url ?? null,
    observedAt: dealer.observedAt ?? text(publicSummary.observedAt),
    dealerVerified: Boolean(Object.keys(fields).length),
  };
}

export function reconDossier(assets: VehicleAssets | null, vehicle: Vehicle | null) {
  const source = sourceFields(assets, 'reconvision');
  const rawOrders = Array.isArray(source.fields.repairOrders)
    ? source.fields.repairOrders
    : Array.isArray(source.fields.timeline)
      ? source.fields.timeline
      : [];
  const orders: RepairOrder[] = rawOrders
    .map(record)
    .map((item): RepairOrder => ({
        repairOrder: text(item.repairOrder),
        department: text(item.department),
        status: text(item.status),
        openedAt: text(item.openedAt),
        completedAt: text(item.completedAt),
        technician: text(item.technician),
        advisor: text(item.advisor),
        workPerformed: strings(item.workPerformed),
        sourceUrl: text(item.sourceUrl),
      }));
  return {
    stage: text(source.fields.stage) ?? vehicle?.reconStage ?? null,
    frontlineReady: typeof source.fields.frontlineReady === 'boolean'
      ? source.fields.frontlineReady
      : vehicle?.frontlineReady ?? null,
    workSummary: text(source.fields.workSummary),
    openWork: strings(source.fields.openWork).length
      ? strings(source.fields.openWork)
      : vehicle?.reconOpenWork ?? [],
    orders,
    observedAt: source.observedAt,
  };
}

export function keyDossier(assets: VehicleAssets | null, vehicle: Vehicle | null) {
  const source = sourceFields(assets, 'onemicro');
  return {
    location: text(source.fields.location) ?? vehicle?.keyLocation ?? null,
    lotLocation: text(source.fields.lotLocation),
    lastCheckedOutBy: text(source.fields.lastCheckedOutBy)
      ?? text(source.fields.holder)
      ?? vehicle?.keyHolder
      ?? null,
    lastCheckedOutAt: text(source.fields.lastCheckedOutAt),
    keyImageUrl: text(source.fields.keyImageUrl),
    activity: strings(source.fields.activity),
    observedAt: source.observedAt,
  };
}

const highValueFeature = /(?:package|premium|luxury|advanced|driver|assist|adaptive|camera|surround|head-up|navigation|wireless|carplay|android auto|harman|alpine|bose|burmester|sunroof|moonroof|panoramic|leather|heated|ventilated|massage|third row|towing|trailer|off-road|four-wheel|all-wheel|locking|limited slip|performance|sport|night vision|air suspension|hands-free|remote start|blind spot|collision|lane|unique|special|edition)/i;
const genericSpec = /^(?:engine|transmission|drivetrain|drive|fuel|body|exterior|interior|mpg|epa|third row|seats|curb weight|max towing|horsepower|torque|payload|gvwr|max cargo|cargo)\s*[:\-]/i;

export function uniqueFactoryFeatures(assets: VehicleAssets | null) {
  const candidates = (assets?.sticker_highlights ?? [])
    .map((value) => value.replace(/\s+/g, ' ').trim().replace(/[.;,\s]+$/, ''))
    .filter(Boolean);
  const prioritized = [
    ...candidates.filter((value) => highValueFeature.test(value) && !genericSpec.test(value)),
    ...candidates.filter((value) => !highValueFeature.test(value) && !genericSpec.test(value)),
  ];
  return [...new Set(prioritized)].slice(0, 12);
}

export type CapabilityFact = {
  key: string;
  label: string;
  value: string;
};

export function vehicleCapabilities(assets: VehicleAssets | null): CapabilityFact[] {
  const specs = record(assets?.quick_specs);
  const definitions: Array<[string, string]> = [
    ['third_row_seats', 'Third row'],
    ['seating_capacity', 'Seats'],
    ['max_towing_capacity', 'Max towing'],
    ['curb_weight', 'Curb weight'],
    ['horsepower', 'Horsepower'],
    ['torque', 'Torque'],
    ['payload_capacity', 'Payload'],
    ['gvwr', 'GVWR'],
    ['max_cargo_volume', 'Max cargo'],
    ['cargo_volume', 'Cargo behind seats'],
    ['ground_clearance', 'Ground clearance'],
    ['wheelbase', 'Wheelbase'],
  ];
  return definitions
    .map(([key, label]) => ({ key, label, value: text(specs[key]) }))
    .filter((item): item is CapabilityFact => Boolean(item.value))
    .slice(0, 10);
}

function sentenceList(values: string[]) {
  if (values.length === 0) return '';
  if (values.length === 1) return values[0]!;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

export function sellingDescriptions(
  vehicle: Vehicle | null,
  assets: VehicleAssets | null,
) {
  if (!vehicle) return { summary: '', detailed: '' };
  const title = vehicleTitle(vehicle);
  const carfax = carfaxDossier(assets);
  const recon = reconDossier(assets, vehicle);
  const features = uniqueFactoryFeatures(assets);
  const capabilities = vehicleCapabilities(assets);
  const capabilityPhrases = capabilities.map((item) => `${item.label.toLowerCase()} ${item.value}`);
  const facts = [
    vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} miles` : null,
    vehicle.drivetrain,
    vehicle.engine,
    vehicle.transmission,
  ].filter((value): value is string => Boolean(value));
  const confidence = [
    carfax.owners != null ? `${carfax.owners}-owner CARFAX history` : null,
    carfax.serviceRecords != null ? `${carfax.serviceRecords} documented service records` : carfax.service,
    carfax.titleStatus,
    recon.workSummary,
    recon.stage ? `ReconVision status: ${recon.stage}` : null,
  ].filter((value): value is string => Boolean(value));
  const summary = [
    `${title}${facts.length ? ` with ${sentenceList(facts.slice(0, 3))}` : ''}.`,
    capabilityPhrases.length ? `Capability: ${sentenceList(capabilityPhrases.slice(0, 3))}.` : '',
    features.length ? `Standout equipment includes ${sentenceList(features.slice(0, 3))}.` : '',
    confidence.length ? `${sentenceList(confidence.slice(0, 2))}.` : '',
  ].filter(Boolean).join(' ');
  const detailed = [
    `Meet this ${title}${vehicle.exteriorColor ? ` finished in ${vehicle.exteriorColor}` : ''}.`,
    facts.length ? `Verified vehicle details include ${sentenceList(facts)}.` : '',
    capabilityPhrases.length ? `Verified capability and utility: ${sentenceList(capabilityPhrases.slice(0, 6))}.` : '',
    features.length ? `What sets it apart: ${sentenceList(features.slice(0, 8))}.` : '',
    confidence.length ? `Ownership and preparation highlights: ${sentenceList(confidence.slice(0, 6))}.` : '',
    carfax.accidents != null
      ? `CARFAX reports ${carfax.accidents} accident event${carfax.accidents === 1 ? '' : 's'}; review the full dealer report for event-level details.`
      : '',
    'All statements above are generated only from the currently verified inventory, window-sticker, CARFAX, and recon data shown in XConsole.',
  ].filter(Boolean).join(' ');
  return { summary, detailed };
}
