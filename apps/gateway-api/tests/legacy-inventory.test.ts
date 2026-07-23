import { describe, expect, it, vi } from 'vitest';
import { readEnv } from '../src/env.js';
import { InventoryService, normalizeLegacyVehicle } from '../src/legacy-inventory.js';
import { GatewayStore } from '../src/store.js';

const configuredEnv = readEnv({
  NODE_ENV: 'test',
  XCONSOLE_API_TOKEN: 'test-dashboard-token-at-least-24-characters',
  XCONSOLE_DEVICE_REGISTRATION_CODE: 'test-registration-code',
  CORS_ORIGINS: 'http://localhost:5173',
  LEGACY_AUTOMATION_API_URL: 'http://legacy.example',
  XCONSOLE_LEGACY_API_TOKEN: 'legacy-service-token-with-at-least-32-characters',
});

describe('legacy inventory bridge', () => {
  it('normalizes the rich legacy vehicle shape without losing useful fields', () => {
    const vehicle = normalizeLegacyVehicle({
      vin: '2C4RC1BG3TR186903',
      title: '2026 Chrysler Pacifica Select',
      stock_number: 'T100',
      price: '$33,274',
      jd_power_trade_in: '$31,725',
      jd_power_ltv: '119.35',
      bank_ltv_basis: '$37,851.44',
      mileage: '6,303',
      inventory_category: 'used',
      drivetrain: 'FWD',
      engine: '3.6L V6',
      exterior: 'Diamond Black',
      detail_url: 'https://dealer.example/used/T100',
      photos: ['https://dealer.example/1.jpg', 'not-a-url'],
      status_label: 'live',
    }, { last_synced_at: '2026-07-23T12:00:00Z' });

    expect(vehicle).toMatchObject({
      vin: '2C4RC1BG3TR186903',
      year: 2026,
      make: 'Chrysler',
      model: 'Pacifica',
      trim: 'Select',
      stockNumber: 'T100',
      retailPrice: 33274,
      jdPowerTradeIn: 31725,
      loanToValue: 119.35,
      ltvBasis: 37851.44,
      mileage: 6303,
      condition: 'used',
      drivetrain: 'FWD',
      exteriorColor: 'Diamond Black',
      status: 'live',
    });
    expect(vehicle?.photos).toEqual(['https://dealer.example/1.jpg']);
    expect(vehicle?.sourceStatuses[0]?.synchronizedAt).toBe('2026-07-23T12:00:00.000Z');
  });

  it('uses live legacy inventory and preserves matching database source records', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      items: [{
        vin: '1HGCM82633A004352',
        title: '2025 Honda Accord Touring',
        price: '$31,500',
        detail_url: 'https://dealer.example/new/accord',
        photos: ['https://dealer.example/accord.jpg'],
        status_label: 'live',
      }],
      active_count: 1,
      in_transit_count: 0,
      source_status: { updated_at: '2026-07-23T12:00:00Z' },
    }), { status: 200 })) as unknown as typeof fetch;
    const inventory = await new InventoryService(configuredEnv, new GatewayStore(), fetchMock).list();

    expect(inventory.source.mode).toBe('legacy-live');
    expect(inventory.source.live).toBe(true);
    expect(inventory.items).toHaveLength(1);
    expect(inventory.items[0]?.title).toBe('2025 Honda Accord Touring');
    expect(inventory.items[0]?.sourceStatuses.map((item) => item.connectorId)).toEqual([
      'dealership-website',
      'facebook-marketplace',
    ]);
  });

  it('falls back to gateway data with a visible warning when live inventory fails', async () => {
    const fetchMock = vi.fn(async () => new Response('unavailable', { status: 503 })) as unknown as typeof fetch;
    const inventory = await new InventoryService(configuredEnv, new GatewayStore(), fetchMock).list();

    expect(inventory.source.mode).toBe('fixture');
    expect(inventory.source.live).toBe(false);
    expect(inventory.source.configured).toBe(true);
    expect(inventory.source.warning).toContain('HTTP 503');
    expect(inventory.items).toHaveLength(1);
  });

  it('persists normalized records when an explicit live synchronization completes', async () => {
    const store = new GatewayStore();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        persisted: true,
        items_count: 1,
        errors: [],
        diagnostics: [],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{
          vin: '2C4RC1BG3TR186903',
          title: '2026 Chrysler Pacifica Select',
          price: '$33,274',
          detail_url: 'https://dealer.example/used/pacifica',
          status_label: 'live',
        }],
        source_status: { last_synced_at: '2026-07-23T12:00:00Z' },
      }), { status: 200 })) as unknown as typeof fetch;

    const inventory = await new InventoryService(configuredEnv, store, fetchMock).sync();

    expect(inventory.source.details.persistence).toEqual({ created: 1, updated: 0 });
    expect(store.getVehicle('2C4RC1BG3TR186903')?.retailPrice).toBe(33274);
  });

  it('rejects a zero-record refresh instead of reporting the old cache as a successful sync', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      persisted: false,
      items_count: 0,
      errors: [],
      diagnostics: ['no_inventory_records_after_all_fallbacks'],
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(new InventoryService(configuredEnv, new GatewayStore(), fetchMock).sync())
      .rejects.toThrow('last good inventory cache was preserved');
  });

  it('forwards JD Power valuation status and file uploads to the protected legacy adapter', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => new Response(JSON.stringify({
      ok: true,
      count: 825,
      source_file: 'jd-power.xls',
      updated_at: '2026-07-23T23:30:00Z',
      method: init?.method ?? 'GET',
    }), { status: 200 })) as unknown as typeof fetch;
    const service = new InventoryService(configuredEnv, new GatewayStore(), fetchMock);

    expect((await service.valuationStatus()).count).toBe(825);
    expect((await service.uploadValuations(
      new TextEncoder().encode('xls-data'),
      'jd-power.xls',
    )).source_file).toBe('jd-power.xls');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://legacy.example/api/bank-brain/valuations/status',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://legacy.example/api/bank-brain/valuations/upload',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    );
  });
});
