import type { Product, ProfitSummary } from '@/types';

export function getActualPayment(product: Product): number {
  return (
    product.purchasePrice -
    (product.purchasePointUsed || 0) -
    (product.couponDiscount || 0) -
    (product.instantPointUse || 0)
  );
}

export function getEffectiveCost(product: Product): number {
  return getActualPayment(product) - product.point;
}

export function calculateProfit(product: Product): number {
  if (!product.salePrice) return 0;
  return product.salePrice - getEffectiveCost(product);
}

export function calculatePointProfit(product: Product): number {
  if (!product.salePrice) return 0;
  return product.salePrice - getActualPayment(product);
}

export function calculateProfitSummary(products: Product[]): ProfitSummary {
  const sold = products.filter((p) => p.status === 'sold');
  const inventory = products.filter((p) => p.status === 'inventory');
  const waiting = products.filter((p) => p.status === 'pending');

  const totalCost = products.reduce((sum, p) => sum + getEffectiveCost(p), 0);
  const totalRevenue = sold.reduce((sum, p) => sum + (p.salePrice || 0), 0);
  const totalProfit = sold.reduce((sum, p) => sum + calculateProfit(p), 0);
  const totalPointProfit = sold.reduce((sum, p) => sum + calculatePointProfit(p), 0);
  const inventoryValue = inventory.reduce((sum, p) => sum + getActualPayment(p), 0);

  return {
    totalProducts: products.length,
    totalRevenue,
    totalCost,
    totalProfit,
    totalPointProfit,
    soldCount: sold.length,
    inventoryValue,
    waitingCount: waiting.length,
  };
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(amount);
}
