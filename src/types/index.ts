export interface GiftCardUsage {
  giftCardId: string;
  brand: string;
  amount: number;         // 闖ｴ・ｿ騾包ｽｨ鬯倥・
  realCost: number;       // 陞ｳ貅倥＆郢ｧ・ｹ郢晁肩・ｼ莠包ｽｽ・ｿ騾包ｽｨ鬯倥・/ 鬯伜涵謫・・・・髮会ｽｼ陷茨ｽ･關難ｽ｡隴ｬ・ｼ繝ｻ繝ｻ
  earnedPointAlloc: number; // 闔牙・ｽｸ蛯倩ｬ也甥繝ｻ繝ｻ莠包ｽｽ・ｿ騾包ｽｨ鬯倥・/ 鬯伜涵謫・・・・闔牙・ｽｸ蛯倥・繝ｻ
}

export interface PurchaseBreakdown {
  cash: number;
  giftCardUsages: GiftCardUsage[];
  pointUse: number; // 郢晄亢縺・ｹ晢ｽｳ郢晏沺鬮ｪ隰・ｼ費ｼ櫁崕繝ｻ
}

export interface GiftCard {
  id: string;
  userId: string;
  brand: 'Apple' | 'Amazon' | 'Google Play' | 'その他';
  purchaseSource: string;   // 髮会ｽｼ陷茨ｽ･陷医・・ｼ蝓滂ｽ･・ｽ陞滂ｽｩ邵ｺ・ｪ邵ｺ・ｩ繝ｻ繝ｻ
  purchasedAt: string;
  faceValue: number;        // 鬯伜涵謫・
  purchasedPrice: number;   // 陞ｳ貊・怙邵ｺ・ｫ隰・ｼ披夢邵ｺ貊・横鬯倥・
  earnedPoint: number;      // 髮会ｽｼ陷茨ｽ･隴弱ｆ・ｻ蛟・ｽｸ蠑ｱ繝ｻ郢ｧ・､郢晢ｽｳ郢昴・
  balance: number;          // 霑ｴ・ｾ陜ｨ・ｨ隹ｿ遏ｩ・ｫ繝ｻ
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PointSiteRedemption {
  id: string;
  userId: string;
  siteName: string;
  redeemTo?: string;   // 郢晢ｽ｢郢昴・繝ｴ郢晢ｽｼ郢晢ｽｻ郢昜ｸ翫Χ郢ｧ・ｿ郢ｧ・ｹ驕ｲ繝ｻ
  amount: number;     // 鬩阪・繝ｻ鬯俶誓・ｼ莠･繝ｻ繝ｻ繝ｻ
  redeemedAt: string; // 鬩阪・繝ｻ隴鯉ｽ･ YYYY-MM-DD
  memo?: string;
  createdAt: string;
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
  purchaseGroupId?: string;
  kaitoriPrice?: number;
  kaitoriPriceAt?: string;
  purchaseBreakdown?: PurchaseBreakdown;
  couponDiscount?: number;     // クーポン値引き額（記録のみ・元値の参考表示用）
  reservePointUse?: number;    // 保有ポイント使用額（仕入れ原価から差し引く）
  immediatePointUse?: number;  // 今すぐポイント使用額・ヤフショのみ（仕入れ原価から差し引く）
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

export const KEIKOJI_HOLD_DAYS = [31, 91, 151, 181, 211, 365] as const;
export type KeikojiHoldDays = typeof KEIKOJI_HOLD_DAYS[number];

export const KEIKOJI_HOLD_MONTHS: Record<KeikojiHoldDays, number> = {
  31: 1, 91: 3, 151: 5, 181: 6, 211: 7, 365: 12,
};

export interface KeikojiContract {
  id: string;
  userId: string;
  phoneNumber: string;
  carrier: string;
  contractedAt: string;         // YYYY-MM-DD
  holdDays: KeikojiHoldDays;
  adminFee: number;
  monthlyFee: number;
  deviceName: string;
  deviceCost: number;
  salePrice?: number;
  cashback?: number;
  contractStore?: string;
  voicePlan?: string;
  dataPlan?: string;
  status: 'active' | 'terminated';
  memo?: string;
  createdAt: string;
  updatedAt: string;
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
