import type { InventorySearchResponse, InventoryVehicle } from '@drivecentric-ai/shared';
import type { ReadInventoryResponse } from '../shared/messages';

const inventorySourceUrls = [
  'https://www.tavernachryslerdodgejeepramfiat.com/new-inventory/index.htm',
  'https://www.tavernachryslerdodgejeepramfiat.com/used-inventory/index.htm',
] as const;

function uniqueVehicles(vehicles: InventoryVehicle[]) {
  const unique = new Map<string, InventoryVehicle>();
  for (const vehicle of vehicles) {
    unique.set(`${vehicle.source}:${vehicle.title.toLowerCase()}`, vehicle);
  }
  return Array.from(unique.values());
}

function rankVehicles(vehicles: InventoryVehicle[], query: string) {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);

  if (!tokens.length) return vehicles;

  return vehicles
    .map((vehicle) => {
      const haystack = [vehicle.title, vehicle.make, vehicle.model, vehicle.trim, vehicle.stockNumber].filter(Boolean).join(' ').toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      return { vehicle, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.vehicle);
}

function looksLikeManualInventoryQuery(query: string) {
  return query.trim().length >= 2;
}

async function waitForTabComplete(tabId: number, timeoutMs = 20000) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Inventory page load timed out'));
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function scrapeInventoryUrl(url: string) {
  const existing = await chrome.tabs.query({ url });
  const tab = existing[0] ?? (await chrome.tabs.create({ url, active: false }));
  const created = existing.length === 0;

  try {
    if (tab.status !== 'complete') {
      await waitForTabComplete(tab.id!);
    }

    const response = (await chrome.tabs.sendMessage(tab.id!, { type: 'CONTENT_READ_INVENTORY' })) as ReadInventoryResponse;
    return response.vehicles;
  } finally {
    if (created && tab.id) {
      await chrome.tabs.remove(tab.id).catch(() => undefined);
    }
  }
}

export async function searchInventoryFromBrowser(query: string, limit = 9): Promise<InventorySearchResponse> {
  const settled = await Promise.allSettled(inventorySourceUrls.map((url) => scrapeInventoryUrl(url)));
  const warnings = settled
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => (result.reason instanceof Error ? result.reason.message : 'Inventory scrape failed'));

  const vehicles = uniqueVehicles(
    settled
      .filter((result): result is PromiseFulfilledResult<InventoryVehicle[]> => result.status === 'fulfilled')
      .flatMap((result) => result.value),
  );

  const normalizedQuery = query.trim();
  const ranked = rankVehicles(vehicles, normalizedQuery);
  const selected = (looksLikeManualInventoryQuery(normalizedQuery) ? ranked : ranked.length ? ranked : vehicles).slice(0, limit);

  return {
    ...(normalizedQuery ? { query: normalizedQuery } : {}),
    vehicles: selected,
    sourceUrls: [...inventorySourceUrls],
    fetchedAt: new Date().toISOString(),
    live: vehicles.length > 0,
    ...(warnings.length ? { warning: warnings.join('; ') } : {}),
  };
}
