import type { Product, ProfitSummary } from '@/types';

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export function getActualPayment(product: Product): number {
  return product.purchasePrice;
}

export function getRemainingActualPayment(product: Product): number {
  const total = Math.max(1, product.quantityTotal ?? 1);
  const availableRaw = product.quantityAvailable ?? total;
  const available = Math.min(total, Math.max(0, availableRaw));
  return getActualPayment(product) * (available / total);
}

export function getEffectiveCost(product: Product): number {
  if (product.purchaseBreakdown) {
    const { cash, giftCardUsages, pointUse } = product.purchaseBreakdown;
    const giftCardRealCost = giftCardUsages.reduce((s, u) => s + u.realCost, 0);
    const giftCardEarnedP = giftCardUsages.reduce((s, u) => s + u.earnedPointAlloc, 0);
    return cash + giftCardRealCost + pointUse - giftCardEarnedP - product.point;
  }
  return product.purchasePrice - product.point;
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
  const inventoryValue = inventory.reduce((sum, p) => sum + getRemainingActualPayment(p), 0);

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
