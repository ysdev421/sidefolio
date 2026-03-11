import { describe, expect, it } from 'vitest';
import { buildProductUpdateForBatchConfirm } from '@/lib/saleBatch';

describe('sale batch confirm flow', () => {
  it('marks sold when all stock is consumed', () => {
    const updates = buildProductUpdateForBatchConfirm({
      product: { quantityAvailable: 2, quantityTotal: 2, status: 'inventory' },
      soldQuantity: 2,
      finalPrice: 3000,
      buyer: '買取店A',
      today: '2026-03-11',
      now: 'now',
    });

    expect(updates).toMatchObject({
      quantityAvailable: 0,
      quantityTotal: 2,
      status: 'sold',
      salePrice: 3000,
      saleLocation: '買取店A',
      saleDate: '2026-03-11',
    });
  });

  it('keeps unsold stock and moves pending to inventory on partial sale', () => {
    const updates = buildProductUpdateForBatchConfirm({
      product: { quantityAvailable: 5, quantityTotal: 5, status: 'pending' },
      soldQuantity: 2,
      finalPrice: 3000,
      buyer: '買取店A',
      today: '2026-03-11',
      now: 'now',
    });

    expect(updates).toMatchObject({
      quantityAvailable: 3,
      quantityTotal: 5,
      status: 'inventory',
    });
    expect(updates).not.toHaveProperty('salePrice');
  });
});
