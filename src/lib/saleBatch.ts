import type { Product } from '@/types';

export interface SaleBatchConfirmInput {
  product: Pick<Product, 'quantityAvailable' | 'quantityTotal' | 'status'>;
  soldQuantity: number;
  finalPrice: number;
  buyer: string;
  today: string;
  now: unknown;
}

export function buildProductUpdateForBatchConfirm({
  product,
  soldQuantity,
  finalPrice,
  buyer,
  today,
  now,
}: SaleBatchConfirmInput): Record<string, unknown> {
  const available = Number(product.quantityAvailable ?? product.quantityTotal ?? 1);
  const nextAvailable = Math.max(0, available - soldQuantity);

  const updates: Record<string, unknown> = {
    quantityAvailable: nextAvailable,
    quantityTotal: Number(product.quantityTotal ?? available),
    updatedAt: now,
  };

  if (nextAvailable === 0) {
    updates.status = 'sold';
    updates.salePrice = finalPrice;
    updates.saleLocation = buyer;
    updates.saleDate = today;
  } else if (product.status === 'pending') {
    updates.status = 'inventory';
  }

  return updates;
}
