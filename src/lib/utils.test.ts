import { describe, expect, it } from 'vitest';
import { getActualPayment, getEffectiveCost } from '@/lib/utils';
import type { Product } from '@/types';

const baseProduct: Product = {
  id: 'p1',
  userId: 'u1',
  productName: 'test',
  purchasePrice: 71219,
  purchasePointUsed: 9386,
  point: 9314,
  purchaseDate: '2026-03-11',
  purchaseLocation: 'メルカリ',
  status: 'pending',
  createdAt: '2026-03-11T00:00:00.000Z',
  updatedAt: '2026-03-11T00:00:00.000Z',
};

describe('cost formula', () => {
  it('actual payment uses purchase + used point', () => {
    expect(getActualPayment(baseProduct)).toBe(80605);
  });

  it('effective cost uses purchase + used point - earned point', () => {
    expect(getEffectiveCost(baseProduct)).toBe(71291);
  });

  it('ignores legacy coupon/instant fields even if they exist', () => {
    const withLegacy = {
      ...baseProduct,
      couponDiscount: 1000,
      instantPointUse: 9195,
    };
    expect(getActualPayment(withLegacy)).toBe(80605);
    expect(getEffectiveCost(withLegacy)).toBe(71291);
  });
});
