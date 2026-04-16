import { describe, expect, it } from 'vitest';
import { getActualPayment, getEffectiveCost } from '@/lib/utils';
import type { Product } from '@/types';

const baseProduct: Product = {
  id: 'p1',
  userId: 'u1',
  productName: 'test',
  purchasePrice: 71219,
  point: 9314,
  purchaseDate: '2026-03-11',
  purchaseLocation: 'メルカリ',
  status: 'pending',
  createdAt: '2026-03-11T00:00:00.000Z',
  updatedAt: '2026-03-11T00:00:00.000Z',
};

describe('cost formula', () => {
  it('actual payment equals purchase price when no point deductions', () => {
    expect(getActualPayment(baseProduct)).toBe(71219);
  });

  it('actual payment deducts reservePointUse and immediatePointUse', () => {
    const p: Product = { ...baseProduct, reservePointUse: 1000, immediatePointUse: 200 };
    expect(getActualPayment(p)).toBe(71219 - 1000 - 200);
  });

  it('effective cost = actual payment - earned point', () => {
    expect(getEffectiveCost(baseProduct)).toBe(71219 - 9314);
  });

  it('effective cost deducts all three when combined', () => {
    const p: Product = { ...baseProduct, reservePointUse: 1000, immediatePointUse: 200 };
    expect(getEffectiveCost(p)).toBe(71219 - 1000 - 200 - 9314);
  });
});
