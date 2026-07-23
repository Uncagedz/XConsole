import type { Vehicle } from '@drivecentric-ai/shared/xconsole';

export type InventoryCondition = 'all' | 'new' | 'used';
export type InventoryPhotoFilter = 'all' | 'with-photos' | 'needs-photos';
export type InventorySort = 'recent' | 'price-low' | 'price-high' | 'mileage-low' | 'title';

export interface InventoryFilters {
  query: string;
  condition: InventoryCondition;
  photos: InventoryPhotoFilter;
  sort: InventorySort;
}

export function vehicleTitle(vehicle: Vehicle) {
  return vehicle.title
    || [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
    || vehicle.vin;
}

function condition(vehicle: Vehicle) {
  const raw = `${vehicle.condition ?? ''} ${vehicle.websiteUrl ?? ''}`.toLowerCase();
  if (/\bnew\b|\/new[/-]/.test(raw)) return 'new';
  if (/\bused\b|\bpre-owned\b|\bcertified\b|\/used[/-]/.test(raw)) return 'used';
  return 'unknown';
}

export function filterAndSortInventory(items: Vehicle[], filters: InventoryFilters) {
  const query = filters.query.trim().toLowerCase();
  return items
    .filter((vehicle) => {
      if (filters.condition !== 'all' && condition(vehicle) !== filters.condition) return false;
      if (filters.photos === 'with-photos' && vehicle.photos.length === 0) return false;
      if (filters.photos === 'needs-photos' && vehicle.photos.length > 0) return false;
      if (!query) return true;
      const searchable = [
        vehicleTitle(vehicle),
        vehicle.vin,
        vehicle.stockNumber,
        vehicle.exteriorColor,
        vehicle.interiorColor,
        vehicle.status,
      ].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(query);
    })
    .sort((left, right) => {
      if (filters.sort === 'price-low') return (left.retailPrice ?? Number.POSITIVE_INFINITY) - (right.retailPrice ?? Number.POSITIVE_INFINITY);
      if (filters.sort === 'price-high') return (right.retailPrice ?? -1) - (left.retailPrice ?? -1);
      if (filters.sort === 'mileage-low') return (left.mileage ?? Number.POSITIVE_INFINITY) - (right.mileage ?? Number.POSITIVE_INFINITY);
      if (filters.sort === 'title') return vehicleTitle(left).localeCompare(vehicleTitle(right));
      return Date.parse(right.lastSynchronizedAt ?? '1970-01-01') - Date.parse(left.lastSynchronizedAt ?? '1970-01-01');
    });
}

export function inventoryBreakdown(items: Vehicle[]) {
  return items.reduce(
    (summary, vehicle) => {
      const category = condition(vehicle);
      if (category === 'new') summary.new += 1;
      if (category === 'used') summary.used += 1;
      if (vehicle.photos.length > 0) summary.withPhotos += 1;
      return summary;
    },
    { new: 0, used: 0, withPhotos: 0 },
  );
}
