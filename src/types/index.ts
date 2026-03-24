export interface Product {
  id: string;
  userId: string;
  janCode?: string;
  quantityTotal?: number;
  quantityAvailable?: number;
  productName: string;
  purchasePrice: number;
  point: number;
  purchaseDate: string;
  purchaseLocation: string;
  status: 'pending' | 'sold' | 'inventory';
  salePrice?: number;
  saleLocation?: string;
  saleDate?: string;
  memo?: string;
  extraPoints?: number[];
  kaitoriPrice?: number;
  kaitoriPriceAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductTemplate {
  id: string;
  userId: string;
  janCode?: string;
  productName: string;
  purchaseLocation?: string;
  lastPurchasePrice?: number;
  lastPoint?: number;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
}

export interface ProductMaster {
  id: string;
  userId: string;
  janCode: string;
  productName: string;
  createdAt: string;
  updatedAt: string;
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

export type ExpenseCategory = '梱包資材' | '送料' | '交通費' | '通信費' | 'ツール・サブスク' | 'その他';

export interface Expense {
  id: string;
  userId: string;
  date: string;
  amount: number;
  category: ExpenseCategory;
  memo: string;
  createdAt: string;
}

export interface KaitoriPriceHistory {
  id: string;
  userId: string;
  janCode: string;
  productId: string;
  price: number;
  source: string;
  recordedAt: string;
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
