import { describe, expect, it } from 'vitest';
import { parseDealerInventoryPage } from './parser';

describe('parseDealerInventoryPage', () => {
  it('extracts vehicle cards from dealership inventory markup', () => {
    document.body.innerHTML = `
      <main>
        <article class="inventory-card">
          <a href="https://www.tavernachryslerdodgejeepramfiat.com/new/2026-Ram-1500-abc.htm">2026 Ram 1500 Big Horn</a>
          <div>$54,991</div>
          <div>12 mi</div>
          <div>Stock #R12345</div>
        </article>
        <article class="inventory-card">
          <a href="https://www.tavernachryslerdodgejeepramfiat.com/used/2023-Jeep-Grand-Cherokee-def.htm">2023 Jeep Grand Cherokee Limited</a>
          <div>$37,995</div>
          <div>18,442 mi</div>
          <div>Stock #J99881</div>
        </article>
      </main>
    `;

    const parsed = parseDealerInventoryPage(document, 'https://www.tavernachryslerdodgejeepramfiat.com/new-inventory/index.htm');

    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.title).toContain('2026 Ram 1500');
    expect(parsed[0]?.price).toBe('$54,991');
    expect(parsed[0]?.stockNumber).toBe('R12345');
    expect(parsed[0]?.sourceMode).toBe('browser_live');
  });
});
