import { describe, expect, it } from 'vitest';
import { requiredRoutes } from '../routes';

describe('Phase 1 dashboard routes', () => {
  it('contains every required route', () => {
    expect(requiredRoutes).toEqual([
      '/dashboard',
      '/inventory',
      '/inventory/:vin',
      '/leads',
      '/customers/:id',
      '/tasks',
      '/marketplace',
      '/messenger',
      '/bank-brain',
      '/connectors',
      '/connectors/:connectorId',
      '/settings',
    ]);
  });
});
