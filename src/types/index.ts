export interface Product {
  id: string;
  userId: string;
  janCode?: string;
  channel?: 'ebay' | 'kaitori' | 'other';
  quantityTotal?: number;
  quantityAvailable?: number;
  productName: string;
  purchasePrice: number;
  purchasePointUsed?: number;
  couponDiscount?: number;
  instantPointUse?: number;
  point: number;
  purchaseDate: string;
  purchaseLocation: string;
  status: 'pending' | 'sold' | 'inventory';
  salePrice?: number;
  saleLocation?: string;
  saleDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductTemplate {
  id: string;
  userId: string;
  janCode?: string;
  productName: string;
  purchaseLocation?: string;
  channel?: 'ebay' | 'kaitori' | 'other';
  lastPurchasePrice?: number;
  lastPurchasePointUsed?: number;
  lastCouponDiscount?: number;
  lastInstantPointUse?: number;
  lastPoint?: number;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
}

export interface SaleRecord {
  id: string;
  productId: string;
  userId: string;
  salePrice: number;
  saleLocation: string;
  saleDate: string;
  profitAmount: number;
  pointProfit: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface ProfitSummary {
  totalProducts: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalPointProfit: number;
  soldCount: number;
  inventoryValue: number;
  waitingCount: number;
}
