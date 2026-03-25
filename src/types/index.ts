export interface GiftCardUsage {
  giftCardId: string;
  brand: string;
  amount: number;         // 使用額
  realCost: number;       // 実コスト（使用額 / 額面 × 購入価格）
  earnedPointAlloc: number; // 付与P按分（使用額 / 額面 × 付与P）
}

export interface PurchaseBreakdown {
  cash: number;
  giftCardUsages: GiftCardUsage[];
  pointUse: number; // ポイント支払い分
}

export interface GiftCard {
  id: string;
  userId: string;
  brand: 'Apple' | 'Amazon' | 'Google Play' | 'その他';
  purchaseSource: string;   // 購入元（楽天など）
  purchasedAt: string;
  faceValue: number;        // 額面
  purchasedPrice: number;   // 実際に払った金額
  earnedPoint: number;      // 購入時付与ポイント
  balance: number;          // 現在残高
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

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
  purchaseBreakdown?: PurchaseBreakdown;
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
