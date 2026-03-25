import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Expense, ExpenseCategory, GiftCard, KaitoriPriceHistory, Product, ProductMaster, ProductTemplate, SaleRecord } from '@/types';

export async function addProductToFirestore(
  userId: string,
  productData: Omit<Product, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const cleanData = Object.fromEntries(
    Object.entries(productData).filter(([, value]) => value !== undefined)
  );
  const docRef = await addDoc(collection(db, 'products'), {
    ...cleanData,
    userId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  return docRef.id;
}

export async function updateProductInFirestore(
  productId: string,
  updates: Partial<Product>
): Promise<void> {
  const productRef = doc(db, 'products', productId);
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  );
  await updateDoc(productRef, {
    ...cleanUpdates,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteProductFromFirestore(productId: string): Promise<void> {
  await deleteDoc(doc(db, 'products', productId));
}

export async function getUserProducts(userId: string): Promise<Product[]> {
  const q = query(collection(db, 'products'), where('userId', '==', userId));
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((snapshot: any) => {
    const data = snapshot.data() as any;
    return {
      ...data,
      id: snapshot.id,
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    };
  });
}

export async function addSaleRecord(
  userId: string,
  saleData: Omit<SaleRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const docRef = await addDoc(collection(db, 'sales'), {
    ...saleData,
    userId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  return docRef.id;
}

export async function getUserSalesRecords(userId: string): Promise<SaleRecord[]> {
  const q = query(collection(db, 'sales'), where('userId', '==', userId));
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((snapshot: any) => ({
    id: snapshot.id,
    ...(snapshot.data() as Omit<SaleRecord, 'id'>),
  }));
}

const toIso = (value: any): string => {
  if (value?.toDate) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
};

const normalizeTemplateKey = (raw: string) =>
  raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9ぁ-んァ-ヶー一-龠]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

export async function upsertProductTemplate(
  userId: string,
  data: {
    janCode?: string;
    productName: string;
    purchaseLocation?: string;
    purchasePrice?: number;
    point?: number;
  }
): Promise<void> {
  const keyBase = data.janCode?.trim() || data.productName.trim();
  if (!keyBase) return;

  const templateKey = normalizeTemplateKey(keyBase).slice(0, 120) || 'template';
  const templateId = `${userId}_${templateKey}`;
  const templateRef = doc(db, 'product_templates', templateId);
  const snap = await getDoc(templateRef);
  const now = Timestamp.now();
  const currentUsedCount = snap.exists() ? Number(snap.data().usedCount || 0) : 0;

  await setDoc(
    templateRef,
    {
      userId,
      janCode: data.janCode?.trim() || null,
      productName: data.productName.trim(),
      purchaseLocation: data.purchaseLocation?.trim() || null,
      lastPurchasePrice: data.purchasePrice ?? null,
      lastPoint: data.point ?? null,
      usedCount: currentUsedCount + 1,
      createdAt: snap.exists() ? snap.data().createdAt : now,
      updatedAt: now,
      lastUsedAt: now,
    },
    { merge: true }
  );
}

export async function getUserProductTemplates(userId: string): Promise<ProductTemplate[]> {
  const q = query(collection(db, 'product_templates'), where('userId', '==', userId));
  const querySnapshot = await getDocs(q);

  const templates = querySnapshot.docs.map((snapshot: any) => {
    const data = snapshot.data() as any;
    return {
      id: snapshot.id,
      userId: data.userId,
      janCode: data.janCode || undefined,
      productName: data.productName || '',
      purchaseLocation: data.purchaseLocation || undefined,
      lastPurchasePrice: typeof data.lastPurchasePrice === 'number' ? data.lastPurchasePrice : undefined,
      lastPoint: typeof data.lastPoint === 'number' ? data.lastPoint : undefined,
      usedCount: Number(data.usedCount || 0),
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
      lastUsedAt: toIso(data.lastUsedAt),
    } satisfies ProductTemplate;
  });

  return templates.sort((a: ProductTemplate, b: ProductTemplate) => {
    if (b.usedCount !== a.usedCount) return b.usedCount - a.usedCount;
    return b.lastUsedAt.localeCompare(a.lastUsedAt);
  });
}

const normalizeJanCode = (value: string) => value.replace(/\D/g, '').trim();
const KAITORI_JAN_FALLBACKS: Record<string, string> = {
  '4902370553024': 'Nintendo Switch 2 日本語・国内専用',
};

async function findByNormalizedJanInCollection(
  collectionName: 'jan_master' | 'products',
  normalizedJan: string,
  userId?: string
): Promise<any | null> {
  const pageSize = 500;
  let lastDoc: any = null;

  while (true) {
    const constraints: any[] = [];
    if (collectionName === 'products' && userId) {
      constraints.push(where('userId', '==', userId));
    }
    if (lastDoc) constraints.push(startAfter(lastDoc));
    constraints.push(limit(pageSize));

    const q = query(collection(db, collectionName), ...constraints);
    const snap = await getDocs(q);
    if (snap.empty) return null;

    for (const d of snap.docs as any[]) {
      const row = d.data() as any;
      const candidates =
        collectionName === 'jan_master'
          ? [d.id, row?.janCode, row?.jan_code, row?.barcode, row?.jan, row?.code, row?.ean, row?.JAN]
          : [row?.janCode, row?.jan_code, row?.barcode, row?.jan, row?.code, row?.ean, row?.JAN];
      const hit = candidates
        .map((v) => (typeof v === 'number' ? String(v) : String(v || '')))
        .map((v) => normalizeJanCode(v))
        .filter(Boolean)
        .includes(normalizedJan);
      if (!hit) continue;

      const productName = String(row?.productName || row?.itemName || row?.name || row?.title || '').trim();
      if (!productName) continue;
      return { janCode: normalizedJan, productName };
    }

    if (snap.size < pageSize) return null;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
}

export async function getUserTemplateByJanFromProducts(
  userId: string,
  janCode: string
): Promise<{ janCode: string; productName: string } | null> {
  const normalized = normalizeJanCode(janCode);
  if (!userId || !normalized) return null;

  const pageSize = 500;
  let lastDoc: any = null;
  while (true) {
    const constraints: any[] = [where('userId', '==', userId)];
    if (lastDoc) constraints.push(startAfter(lastDoc));
    constraints.push(limit(pageSize));

    const q = query(collection(db, 'product_templates'), ...constraints);
    const snap = await getDocs(q);
    if (snap.empty) return null;

    for (const d of snap.docs as any[]) {
      const row = d.data() as any;
      const candidates = [row?.janCode, row?.jan_code, row?.barcode, row?.jan, row?.code, row?.ean, row?.JAN];
      const hit = candidates
        .map((v) => (typeof v === 'number' ? String(v) : String(v || '')))
        .map((v) => normalizeJanCode(v))
        .filter(Boolean)
        .includes(normalized);
      if (!hit) continue;

      const productName = String(row?.productName || row?.itemName || row?.name || row?.title || '').trim();
      if (!productName) continue;
      return { janCode: normalized, productName };
    }

    if (snap.size < pageSize) return null;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
}

export async function getJanMasterByCode(
  janCode: string
): Promise<{ janCode: string; productName: string; kaitoriPrice?: number } | null> {
  const normalized = normalizeJanCode(janCode);
  if (!normalized) return null;

  const toResult = (data: any): { janCode: string; productName: string; kaitoriPrice?: number } => ({
    janCode: normalized,
    productName: String(data.productName),
    ...(data.kaitoriPrice ? { kaitoriPrice: Number(data.kaitoriPrice) } : {}),
  });

  const ref = doc(db, 'jan_master', normalized);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as any;
    if (data?.productName) return toResult(data);
  }

  const q = query(collection(db, 'jan_master'), where('janCode', '==', normalized), limit(1));
  const rows = await getDocs(q);
  if (!rows.empty) {
    const row = rows.docs[0].data() as any;
    if (row?.productName) return toResult(row);
  }

  // Backward compatibility: legacy rows may store janCode as number.
  const numericJan = Number(normalized);
  if (Number.isFinite(numericJan)) {
    const qNum = query(collection(db, 'jan_master'), where('janCode', '==', numericJan), limit(1));
    const rowsNum = await getDocs(qNum);
    if (!rowsNum.empty) {
      const rowNum = rowsNum.docs[0].data() as any;
      if (rowNum?.productName) return toResult(rowNum);
    }
  }

  const scanned = await findByNormalizedJanInCollection('jan_master', normalized);
  if (scanned) return scanned;

  const fallbackName = KAITORI_JAN_FALLBACKS[normalized];
  if (fallbackName) {
    return { janCode: normalized, productName: fallbackName };
  }

  return null;
}

export async function upsertJanMaster(data: { janCode?: string; productName: string }): Promise<void> {
  const normalized = normalizeJanCode(data.janCode || '');
  const productName = data.productName.trim();
  if (!normalized || !productName) return;

  await setDoc(
    doc(db, 'jan_master', normalized),
    {
      janCode: normalized,
      productName,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function getUserJanUsageByCode(
  userId: string,
  janCode: string
): Promise<{ janCode: string; productName: string } | null> {
  const normalized = normalizeJanCode(janCode);
  if (!userId || !normalized) return null;

  const ref = doc(db, 'user_jan_usage', `${userId}_${normalized}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  if (!data?.productName) return null;

  return {
    janCode: normalized,
    productName: String(data.productName),
  };
}

export async function getUserProductNameByJanFromProducts(
  userId: string,
  janCode: string
): Promise<{ janCode: string; productName: string } | null> {
  const normalized = normalizeJanCode(janCode);
  if (!userId || !normalized) return null;

  const q = query(
    collection(db, 'products'),
    where('userId', '==', userId),
    where('janCode', '==', normalized),
    limit(1)
  );
  const rows = await getDocs(q);
  if (!rows.empty) {
    const row = rows.docs[0].data() as any;
    if (row?.productName) {
      return {
        janCode: normalized,
        productName: String(row.productName),
      };
    }
  }

  const numericJan = Number(normalized);
  if (!Number.isFinite(numericJan)) return null;
  const qNum = query(
    collection(db, 'products'),
    where('userId', '==', userId),
    where('janCode', '==', numericJan),
    limit(1)
  );
  const rowsNum = await getDocs(qNum);
  if (!rowsNum.empty) {
    const rowNum = rowsNum.docs[0].data() as any;
    if (rowNum?.productName) {
      return {
        janCode: normalized,
        productName: String(rowNum.productName),
      };
    }
  }

  return findByNormalizedJanInCollection('products', normalized, userId);
}

export async function upsertUserJanUsage(
  userId: string,
  data: { janCode?: string; productName: string }
): Promise<void> {
  const normalized = normalizeJanCode(data.janCode || '');
  const productName = data.productName.trim();
  if (!userId || !normalized || !productName) return;

  const ref = doc(db, 'user_jan_usage', `${userId}_${normalized}`);
  const snap = await getDoc(ref);
  const now = Timestamp.now();
  const currentUsedCount = snap.exists() ? Number(snap.data().usedCount || 0) : 0;

  await setDoc(
    ref,
    {
      userId,
      janCode: normalized,
      productName,
      usedCount: currentUsedCount + 1,
      createdAt: snap.exists() ? snap.data().createdAt : now,
      updatedAt: now,
      lastUsedAt: now,
    },
    { merge: true }
  );
}

const DEFAULT_PURCHASE_LOCATIONS = ['メルカリ'] as const;

export async function getUserPurchaseLocations(userId: string): Promise<string[]> {
  const ref = doc(db, 'purchase_location_settings', userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return [...DEFAULT_PURCHASE_LOCATIONS];

  const data = snap.data() as any;
  const list = Array.isArray(data?.locations) ? data.locations : [];
  const cleaned = list
    .map((v: unknown) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v: string) => v.length > 0);

  if (cleaned.length === 0) return [...DEFAULT_PURCHASE_LOCATIONS];
  return Array.from(new Set(cleaned));
}

export async function upsertUserPurchaseLocations(userId: string, locations: string[]): Promise<void> {
  const cleaned = Array.from(
    new Set(
      locations
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
    )
  );

  await setDoc(
    doc(db, 'purchase_location_settings', userId),
    {
      userId,
      locations: cleaned.length > 0 ? cleaned : [...DEFAULT_PURCHASE_LOCATIONS],
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function getPurchaseLocationUsageCounts(userId: string): Promise<Record<string, number>> {
  const q = query(collection(db, 'products'), where('userId', '==', userId));
  const snap = await getDocs(q);
  const counts: Record<string, number> = {};
  snap.docs.forEach((d: any) => {
    const data = d.data() as any;
    const location = typeof data.purchaseLocation === 'string' ? data.purchaseLocation.trim() : '';
    if (!location) return;
    counts[location] = (counts[location] || 0) + 1;
  });
  return counts;
}

const DEFAULT_SALE_LOCATIONS = ['メルカリ', 'ヤフオク', 'ゲオ', 'ブックオフ'];

export async function getUserSaleLocations(userId: string): Promise<string[]> {
  const ref = doc(db, 'sale_location_settings', userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return [...DEFAULT_SALE_LOCATIONS];
  const data = snap.data() as any;
  const list = Array.isArray(data?.locations) ? data.locations : [];
  const cleaned = list.map((v: unknown) => (typeof v === 'string' ? v.trim() : '')).filter((v: string) => v.length > 0);
  if (cleaned.length === 0) return [...DEFAULT_SALE_LOCATIONS];
  return Array.from(new Set(cleaned));
}

export async function upsertUserSaleLocations(userId: string, locations: string[]): Promise<void> {
  const cleaned = Array.from(new Set(locations.map((v) => v.trim()).filter((v) => v.length > 0)));
  await setDoc(
    doc(db, 'sale_location_settings', userId),
    { userId, locations: cleaned.length > 0 ? cleaned : [...DEFAULT_SALE_LOCATIONS], updatedAt: Timestamp.now() },
    { merge: true }
  );
}

export async function getSaleLocationUsageCounts(userId: string): Promise<Record<string, number>> {
  const q = query(collection(db, 'sale_batches'), where('userId', '==', userId));
  const snap = await getDocs(q);
  const counts: Record<string, number> = {};
  snap.docs.forEach((d: any) => {
    const location = typeof d.data().saleLocation === 'string' ? d.data().saleLocation.trim() : '';
    if (!location) return;
    counts[location] = (counts[location] || 0) + 1;
  });
  return counts;
}

export async function addStatusBatchLogToFirestore(
  userId: string,
  payload: {
    targetStatus: 'pending' | 'inventory';
    productIds: string[];
    affectedCount: number;
  }
): Promise<void> {
  await addDoc(collection(db, 'status_batch_logs'), {
    userId,
    targetStatus: payload.targetStatus,
    productIds: payload.productIds,
    affectedCount: payload.affectedCount,
    createdAt: Timestamp.now(),
  });
}

export async function getUserProductMasters(userId: string): Promise<ProductMaster[]> {
  const q = query(collection(db, 'product_masters'), where('userId', '==', userId));
  const snap = await getDocs(q);
  const rows: ProductMaster[] = snap.docs.map((d: any) => {
    const data = d.data() as any;
    return {
      id: d.id,
      userId: String(data.userId || ''),
      janCode: String(data.janCode || ''),
      productName: String(data.productName || ''),
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    } satisfies ProductMaster;
  });
  return rows.sort((a: ProductMaster, b: ProductMaster) => a.productName.localeCompare(b.productName, 'ja'));
}

export async function upsertUserProductMaster(
  userId: string,
  payload: { janCode: string; productName: string }
): Promise<void> {
  const janCode = normalizeJanCode(payload.janCode);
  const productName = payload.productName.trim();
  if (!userId || !janCode || !productName) {
    throw new Error('JANコードと商品名は必須です');
  }

  const id = `${userId}_${janCode}`;
  const ref = doc(db, 'product_masters', id);
  const snap = await getDoc(ref);
  const now = Timestamp.now();

  await setDoc(
    ref,
    {
      userId,
      janCode,
      productName,
      createdAt: snap.exists() ? snap.data().createdAt : now,
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function deleteUserProductMaster(masterId: string): Promise<void> {
  await deleteDoc(doc(db, 'product_masters', masterId));
}

const toNumberSafe = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const distributeByWeights = (total: number, weights: number[]): number[] => {
  if (weights.length === 0) return [];
  const roundedTotal = Math.max(0, Math.round(total));
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (sum <= 0) {
    const base = Math.floor(roundedTotal / weights.length);
    const remain = roundedTotal - base * weights.length;
    return weights.map((_, idx) => base + (idx < remain ? 1 : 0));
  }

  const rows = weights.map((w, idx) => {
    const raw = (roundedTotal * Math.max(0, w)) / sum;
    const floor = Math.floor(raw);
    return { idx, floor, frac: raw - floor };
  });
  const used = rows.reduce((s, r) => s + r.floor, 0);
  let remain = roundedTotal - used;
  rows.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < rows.length && remain > 0; i += 1) {
    rows[i].floor += 1;
    remain -= 1;
  }
  rows.sort((a, b) => a.idx - b.idx);
  return rows.map((r) => r.floor);
};

export interface ConfirmSaleBatchInput {
  userId: string;
  productIds: string[];
  saleDate: string;
  saleLocation: string;
  saleMethod?: string;
  receivedCash: number;
  receivedPoint: number;
  pointRate: number;
  productBasePrices?: Record<string, number>;
  productSaleQtys?: Record<string, number>;
  productSaleMemos?: Record<string, string>;
  memo?: string;
}

export interface ConfirmSaleBatchResult {
  batchId: string;
  updatedProducts: Array<{
    id: string;
    salePrice?: number;
    saleDate?: string;
    saleLocation?: string;
    status: 'sold' | 'inventory' | 'pending';
    quantityAvailable: number;
  }>;
}

export async function confirmSaleBatchInFirestore(input: ConfirmSaleBatchInput): Promise<ConfirmSaleBatchResult> {
  const ids = Array.from(new Set(input.productIds.filter(Boolean)));
  if (ids.length === 0) {
    throw new Error('売却対象の商品を選択してください');
  }

  const rawProductBasePrices = input.productBasePrices || {};
  const receivedPoint = Math.max(0, Math.round(toNumberSafe(input.receivedPoint)));
  const pointRate = Math.max(0, toNumberSafe(input.pointRate, 1));
  const receivedPointValue = Math.max(0, Math.round(receivedPoint * pointRate));

  const productRows = await Promise.all(ids.map(async (id) => {
    const ref = doc(db, 'products', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const row = snap.data() as any;
    if (row.userId !== input.userId) return null;
    if (row.status === 'sold') return null;
    return {
      id: snap.id,
      ref,
      janCode: normalizeJanCode(String(row.janCode || '')),
      productName: String(row.productName || ''),
      status: row.status === 'pending' ? 'pending' : 'inventory',
      purchasePrice: toNumberSafe(row.purchasePrice),
      point: toNumberSafe(row.point),
      quantityTotal: Math.max(1, toNumberSafe(row.quantityTotal, 1)),
      quantityAvailable: Math.max(0, toNumberSafe(row.quantityAvailable, toNumberSafe(row.quantityTotal, 1))),
    };
  }));

  const targets = productRows.filter(Boolean) as Array<NonNullable<(typeof productRows)[number]>>;
  if (targets.length === 0) {
    throw new Error('売却可能な商品が見つかりません');
  }

  const allocatedCash = targets.map((p) => Math.max(0, Math.round(toNumberSafe(rawProductBasePrices[p.id], -1))));
  if (allocatedCash.some((v) => v < 0)) {
    throw new Error('各商品の買取価格を入力してください');
  }
  const receivedCash = allocatedCash.reduce((sum, v) => sum + v, 0);
  const totalRevenue = receivedCash + receivedPointValue;
  const pointWeights = allocatedCash.length > 0 ? allocatedCash : targets.map(() => 1);
  const allocatedPointValue = distributeByWeights(receivedPointValue, pointWeights);
  const allocatedRevenue = allocatedCash.map((cash, idx) => cash + (allocatedPointValue[idx] || 0));

  const batchDoc = await addDoc(collection(db, 'sale_batches'), {
    userId: input.userId,
    saleDate: input.saleDate,
    saleLocation: input.saleLocation,
    saleMethod: input.saleMethod || '来店',
    receivedCash,
    receivedPoint,
    pointRate,
    receivedPointValue,
    totalRevenue,
    productIds: targets.map((p) => p.id),
    itemCount: targets.length,
    memo: input.memo?.trim() || '',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  const wb = writeBatch(db);
  const updatedProducts: ConfirmSaleBatchResult['updatedProducts'] = [];
  // soldQty を事前計算して items 保存時にも参照できるようにする
  const soldQtys = targets.map((p) => {
    const maxQty = Math.max(1, p.quantityAvailable || p.quantityTotal || 1);
    const requestedQty = input.productSaleQtys?.[p.id];
    return requestedQty != null
      ? Math.max(1, Math.min(maxQty, Math.round(requestedQty)))
      : maxQty;
  });

  const janBreakdownMap = new Map<
    string,
    {
      janCode: string;
      productName: string;
      quantity: number;
      salePrice: number;
      cash: number;
      pointValue: number;
      itemCount: number;
    }
  >();
  targets.forEach((p, idx) => {
    const salePrice = allocatedRevenue[idx] || 0;
    const maxQty = Math.max(1, p.quantityAvailable || p.quantityTotal || 1);
    const soldQty = soldQtys[idx];
    const remainingQty = maxQty - soldQty;
    const isFullSale = remainingQty <= 0;

    const janKey = p.janCode || `__NO_JAN__${p.productName}`;
    const currentJan = janBreakdownMap.get(janKey) || {
      janCode: p.janCode || '',
      productName: p.productName,
      quantity: 0,
      salePrice: 0,
      cash: 0,
      pointValue: 0,
      itemCount: 0,
    };
    currentJan.quantity += soldQty;
    currentJan.salePrice += salePrice;
    currentJan.cash += allocatedCash[idx] || 0;
    currentJan.pointValue += allocatedPointValue[idx] || 0;
    currentJan.itemCount += 1;
    janBreakdownMap.set(janKey, currentJan);

    if (isFullSale) {
      wb.update(p.ref, {
        status: 'sold',
        salePrice,
        saleDate: input.saleDate,
        saleLocation: input.saleLocation,
        quantityAvailable: 0,
        saleBatchId: batchDoc.id,
        saleBatchCashPortion: allocatedCash[idx] || 0,
        saleBatchPointValuePortion: allocatedPointValue[idx] || 0,
        updatedAt: Timestamp.now(),
      });
      updatedProducts.push({
        id: p.id,
        salePrice,
        saleDate: input.saleDate,
        saleLocation: input.saleLocation,
        status: 'sold',
        quantityAvailable: 0,
      });
    } else {
      // 部分売却: 在庫数を減らすだけ、statusは変えない
      wb.update(p.ref, {
        quantityAvailable: remainingQty,
        updatedAt: Timestamp.now(),
      });
      updatedProducts.push({
        id: p.id,
        status: p.status as 'pending' | 'sold' | 'inventory',
        quantityAvailable: remainingQty,
      });
    }
  });

  wb.update(doc(db, 'sale_batches', batchDoc.id), {
    items: targets.map((p, idx) => {
      const total = Math.max(1, p.quantityTotal || 1);
      const sold = soldQtys[idx];
      const purchasePriceForSold = Math.round(p.purchasePrice / total * sold);
      const pointForSold = Math.round((p.point || 0) / total * sold);
      return {
        productId: p.id,
        janCode: p.janCode || '',
        productName: p.productName,
        previousStatus: p.status,
        purchasePrice: purchasePriceForSold,
        point: pointForSold,
        quantityTotal: p.quantityTotal,
        quantityAvailable: p.quantityAvailable,
        soldQty: sold,
        allocatedSalePrice: allocatedRevenue[idx] || 0,
        allocatedCash: allocatedCash[idx] || 0,
        allocatedPointValue: allocatedPointValue[idx] || 0,
        reductionMemo: input.productSaleMemos?.[p.id]?.trim() || '',
      };
    }),
    janBreakdown: Array.from(janBreakdownMap.values())
      .map((row) => ({
        janCode: row.janCode,
        productName: row.productName,
        quantity: row.quantity,
        itemCount: row.itemCount,
        totalSalePrice: Math.round(row.salePrice),
        totalCash: Math.round(row.cash),
        totalPointValue: Math.round(row.pointValue),
        unitSalePrice: row.quantity > 0 ? Math.round(row.salePrice / row.quantity) : 0,
      }))
      .sort((a, b) => {
        if (a.janCode && b.janCode) return a.janCode.localeCompare(b.janCode);
        if (a.janCode) return -1;
        if (b.janCode) return 1;
        return a.productName.localeCompare(b.productName, 'ja');
      }),
    updatedAt: Timestamp.now(),
  });

  await wb.commit();
  return { batchId: batchDoc.id, updatedProducts };
}

export interface SaleBatchSummary {
  id: string;
  saleDate: string;
  saleLocation: string;
  itemCount: number;
  totalRevenue: number;
  createdAt: string;
  canceledAt?: string;
}

export interface SaleBatchDetail extends SaleBatchSummary {
  receivedCash: number;
  receivedPoint: number;
  pointRate: number;
  receivedPointValue: number;
  memo: string;
  items: Array<{
    productId: string;
    productName: string;
    janCode: string;
    purchasePrice: number;
    point: number;
    quantityAvailable: number;
    allocatedSalePrice: number;
    allocatedCash: number;
    allocatedPointValue: number;
    reductionMemo?: string;
  }>;
}

export async function getSaleBatchDetail(userId: string, batchId: string): Promise<SaleBatchDetail | null> {
  const snap = await getDoc(doc(db, 'sale_batches', batchId));
  if (!snap.exists()) return null;
  const d = snap.data() as any;
  if (String(d.userId || '') !== userId) return null;
  return {
    id: snap.id,
    saleDate: String(d.saleDate || ''),
    saleLocation: String(d.saleLocation || ''),
    itemCount: Math.max(0, toNumberSafe(d.itemCount)),
    totalRevenue: Math.max(0, toNumberSafe(d.totalRevenue)),
    createdAt: toIso(d.createdAt),
    canceledAt: d.canceledAt ? toIso(d.canceledAt) : undefined,
    receivedCash: Math.max(0, toNumberSafe(d.receivedCash)),
    receivedPoint: Math.max(0, toNumberSafe(d.receivedPoint)),
    pointRate: toNumberSafe(d.pointRate, 1),
    receivedPointValue: Math.max(0, toNumberSafe(d.receivedPointValue)),
    memo: String(d.memo || ''),
    items: Array.isArray(d.items) ? d.items.map((item: any) => ({
      productId: String(item.productId || ''),
      productName: String(item.productName || ''),
      janCode: String(item.janCode || ''),
      purchasePrice: toNumberSafe(item.purchasePrice),
      point: toNumberSafe(item.point),
      quantityAvailable: Math.max(0, toNumberSafe(item.quantityAvailable)),
      allocatedSalePrice: toNumberSafe(item.allocatedSalePrice),
      allocatedCash: toNumberSafe(item.allocatedCash),
      allocatedPointValue: toNumberSafe(item.allocatedPointValue),
      reductionMemo: String(item.reductionMemo || ''),
    })) : [],
  };
}

export async function updateSaleBatchItemPrices(
  userId: string,
  batchId: string,
  newPrices: Record<string, number> // productId -> new allocatedSalePrice
): Promise<void> {
  const batchRef = doc(db, 'sale_batches', batchId);
  const snap = await getDoc(batchRef);
  if (!snap.exists()) throw new Error('売却バッチが見つかりません');
  const d = snap.data() as any;
  if (String(d.userId || '') !== userId) throw new Error('権限がありません');

  const items = Array.isArray(d.items) ? d.items : [];
  const updatedItems = items.map((item: any) => {
    const productId = String(item.productId || '');
    if (newPrices[productId] !== undefined) {
      return { ...item, allocatedSalePrice: newPrices[productId], allocatedCash: newPrices[productId] };
    }
    return item;
  });

  const newReceivedCash = updatedItems.reduce((sum: number, item: any) => sum + toNumberSafe(item.allocatedCash), 0);
  const receivedPointValue = Math.max(0, toNumberSafe(d.receivedPointValue));
  const newTotalRevenue = newReceivedCash + receivedPointValue;

  const wb = writeBatch(db);
  wb.update(batchRef, {
    items: updatedItems,
    receivedCash: newReceivedCash,
    totalRevenue: newTotalRevenue,
    updatedAt: Timestamp.now(),
  });

  for (const [productId, price] of Object.entries(newPrices)) {
    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);
    if (productSnap.exists() && String(productSnap.data()?.userId || '') === userId) {
      wb.update(productRef, { salePrice: price, updatedAt: Timestamp.now() });
    }
  }

  await wb.commit();
}

export async function updateSaleBatchHeader(
  userId: string,
  batchId: string,
  fields: { saleDate?: string; saleLocation?: string; memo?: string; receivedPoint?: number; pointRate?: number }
): Promise<void> {
  const batchRef = doc(db, 'sale_batches', batchId);
  const snap = await getDoc(batchRef);
  if (!snap.exists()) throw new Error('売却バッチが見つかりません');
  const d = snap.data() as any;
  if (String(d.userId || '') !== userId) throw new Error('権限がありません');

  const receivedPoint = fields.receivedPoint ?? toNumberSafe(d.receivedPoint);
  const pointRate = fields.pointRate ?? toNumberSafe(d.pointRate);
  const receivedPointValue = Math.round(receivedPoint * pointRate);
  const receivedCash = toNumberSafe(d.receivedCash);
  const totalRevenue = receivedCash + receivedPointValue;

  const wb = writeBatch(db);
  wb.update(batchRef, {
    ...fields,
    receivedPointValue,
    totalRevenue,
    updatedAt: Timestamp.now(),
  });

  // 各商品にも saleDate / saleLocation を反映
  const productIds: string[] = Array.isArray(d.productIds)
    ? d.productIds.map((v: unknown) => String(v || '')).filter(Boolean)
    : (Array.isArray(d.items) ? d.items.map((item: any) => String(item.productId || '')) : []);

  for (const productId of productIds) {
    if (!productId) continue;
    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);
    if (productSnap.exists() && String(productSnap.data()?.userId || '') === userId) {
      const update: Record<string, any> = { updatedAt: Timestamp.now() };
      if (fields.saleDate) update.saleDate = fields.saleDate;
      if (fields.saleLocation) update.saleLocation = fields.saleLocation;
      wb.update(productRef, update);
    }
  }

  await wb.commit();
}

export async function getUserRecentSaleBatches(userId: string, maxCount = 20): Promise<SaleBatchSummary[]> {
  const q = query(collection(db, 'sale_batches'), where('userId', '==', userId), limit(Math.max(1, maxCount * 3)));
  const snap = await getDocs(q);
  const rows: SaleBatchSummary[] = snap.docs.map((d: any) => {
    const data = d.data() as any;
    return {
      id: d.id,
      saleDate: String(data.saleDate || ''),
      saleLocation: String(data.saleLocation || ''),
      itemCount: Math.max(0, toNumberSafe(data.itemCount)),
      totalRevenue: Math.max(0, toNumberSafe(data.totalRevenue)),
      createdAt: toIso(data.createdAt),
      canceledAt: data.canceledAt ? toIso(data.canceledAt) : undefined,
    } satisfies SaleBatchSummary;
  });

  return rows
    .filter((r) => r.saleDate.trim() !== '' && r.saleLocation.trim() !== '' && !r.canceledAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, maxCount));
}

export interface CancelSaleBatchResult {
  batchId: string;
  revertedProducts: Array<{
    id: string;
    status: 'pending' | 'inventory';
    quantityAvailable: number;
    salePrice?: undefined;
    saleDate?: undefined;
    saleLocation?: undefined;
  }>;
}

export async function cancelSaleBatchInFirestore(
  userId: string,
  batchId: string,
  reason = ''
): Promise<CancelSaleBatchResult> {
  const batchRef = doc(db, 'sale_batches', batchId);
  const batchSnap = await getDoc(batchRef);
  if (!batchSnap.exists()) {
    throw new Error('取り消し対象の一括売却が見つかりません');
  }

  const batchData = batchSnap.data() as any;
  if (String(batchData.userId || '') !== userId) {
    throw new Error('この一括売却を取り消す権限がありません');
  }
  if (batchData.canceledAt) {
    throw new Error('この一括売却はすでに取り消し済みです');
  }

  const items = Array.isArray(batchData.items) ? batchData.items : [];
  const batchProductIds = Array.isArray(batchData.productIds)
    ? batchData.productIds.map((v: unknown) => String(v || '')).filter(Boolean)
    : [];
  const legacyProducts = items.length === 0
    ? await getDocs(query(collection(db, 'products'), where('saleBatchId', '==', batchId)))
    : null;
  const legacyTargets = (legacyProducts?.docs || [])
    .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
    .filter((row: any) => String(row.userId || '') === userId);
  const fallbackTargets = items.length === 0 && legacyTargets.length === 0 && batchProductIds.length > 0
    ? (
      await Promise.all(
        batchProductIds.map(async (productId: string) => {
          const snap = await getDoc(doc(db, 'products', productId));
          if (!snap.exists()) return null;
          const data = snap.data() as any;
          if (String(data.userId || '') !== userId) return null;
          return { id: snap.id, ...(data as any) };
        })
      )
    ).filter(Boolean) as any[]
    : [];
  if (items.length === 0 && legacyTargets.length === 0 && fallbackTargets.length === 0) {
    // 商品が見つからない孤立バッチはバッチ記録だけ取り消し済みにする
    const wb = writeBatch(db);
    wb.update(batchRef, { canceledAt: new Date(), cancelReason: reason || '商品情報なし（孤立データ）' });
    await wb.commit();
    return { batchId, revertedProducts: [] };
  }

  const wb = writeBatch(db);
  const revertedProducts: CancelSaleBatchResult['revertedProducts'] = [];

  const rollbackRows =
    items.length > 0
      ? items.map((item: any) => ({
          productId: String(item?.productId || ''),
          previousStatus: item?.previousStatus === 'pending' ? 'pending' : 'inventory',
          previousQty: Math.max(
            0,
            toNumberSafe(item?.quantityAvailable, toNumberSafe(item?.quantityTotal, 1))
          ),
        }))
      : legacyTargets.map((row: any) => ({
          productId: String(row.id || ''),
          previousStatus: 'inventory' as const,
          previousQty: Math.max(0, toNumberSafe(row.quantityTotal, 1)),
        }));
  if (items.length === 0 && legacyTargets.length === 0 && fallbackTargets.length > 0) {
    rollbackRows.push(
      ...fallbackTargets.map((row: any) => ({
        productId: String(row.id || ''),
        previousStatus: 'inventory' as const,
        previousQty: Math.max(0, toNumberSafe(row.quantityTotal, 1)),
      }))
    );
  }

  for (const row of rollbackRows) {
    const productId = row.productId;
    if (!productId) continue;
    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);
    if (!productSnap.exists()) continue;
    const productData = productSnap.data() as any;
    if (String(productData.userId || '') !== userId) continue;

    const previousStatus = row.previousStatus;
    const previousQty = row.previousQty;

    wb.update(productRef, {
      status: previousStatus,
      quantityAvailable: previousQty,
      salePrice: deleteField(),
      saleDate: deleteField(),
      saleLocation: deleteField(),
      saleBatchId: deleteField(),
      saleBatchCashPortion: deleteField(),
      saleBatchPointValuePortion: deleteField(),
      updatedAt: Timestamp.now(),
    });
    revertedProducts.push({
      id: productId,
      status: previousStatus,
      quantityAvailable: previousQty,
      salePrice: undefined,
      saleDate: undefined,
      saleLocation: undefined,
    });
  }

  wb.update(batchRef, {
    canceledAt: Timestamp.now(),
    canceledBy: userId,
    cancelReason: reason.trim(),
    updatedAt: Timestamp.now(),
  });

  await wb.commit();
  return { batchId, revertedProducts };
}

// ─── 経費管理 ───────────────────────────────────────────

export async function addExpenseToFirestore(
  userId: string,
  data: { date: string; amount: number; category: ExpenseCategory; memo: string }
): Promise<string> {
  const docRef = await addDoc(collection(db, 'expenses'), {
    ...data,
    userId,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function getUserExpenses(userId: string, year?: number): Promise<Expense[]> {
  const q = query(collection(db, 'expenses'), where('userId', '==', userId));
  const snap = await getDocs(q);
  const all: Expense[] = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Expense));
  if (!year) return all.sort((a: Expense, b: Expense) => b.date.localeCompare(a.date));
  return all
    .filter((e: Expense) => e.date.startsWith(`${year}-`))
    .sort((a: Expense, b: Expense) => b.date.localeCompare(a.date));
}

export async function deleteExpenseFromFirestore(id: string): Promise<void> {
  await deleteDoc(doc(db, 'expenses', id));
}

export async function updateExpenseInFirestore(
  id: string,
  data: Partial<{ date: string; amount: number; category: ExpenseCategory; memo: string }>
): Promise<void> {
  await updateDoc(doc(db, 'expenses', id), { ...data, updatedAt: Timestamp.now() });
}

export async function addKaitoriPriceHistory(
  userId: string,
  janCode: string,
  productId: string,
  price: number,
  source = 'kaitori.wiki',
): Promise<void> {
  await addDoc(collection(db, 'kaitoriPriceHistory'), {
    userId,
    janCode,
    productId,
    price,
    source,
    recordedAt: Timestamp.now(),
  });
}

// ─── ギフトカード管理 ────────────────────────────────────

export async function getUserGiftCards(userId: string): Promise<GiftCard[]> {
  const q = query(collection(db, 'gift_cards'), where('userId', '==', userId));
  const snap = await getDocs(q);
  const rows: GiftCard[] = snap.docs.map((d: any) => {
    const data = d.data() as any;
    return {
      id: d.id,
      userId: String(data.userId || ''),
      brand: data.brand || 'その他',
      purchaseSource: String(data.purchaseSource || ''),
      purchasedAt: String(data.purchasedAt || ''),
      faceValue: toNumberSafe(data.faceValue),
      purchasedPrice: toNumberSafe(data.purchasedPrice),
      earnedPoint: toNumberSafe(data.earnedPoint),
      balance: toNumberSafe(data.balance),
      memo: data.memo ? String(data.memo) : undefined,
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    } satisfies GiftCard;
  });
  return rows.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
}

export async function addGiftCard(
  userId: string,
  data: Omit<GiftCard, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const docRef = await addDoc(collection(db, 'gift_cards'), {
    ...data,
    userId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function updateGiftCard(
  id: string,
  updates: Partial<Omit<GiftCard, 'id' | 'userId' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, 'gift_cards', id), { ...updates, updatedAt: Timestamp.now() });
}

export async function deleteGiftCard(id: string): Promise<void> {
  await deleteDoc(doc(db, 'gift_cards', id));
}

export async function getKaitoriPriceHistory(janCode: string): Promise<KaitoriPriceHistory[]> {
  const q = query(
    collection(db, 'kaitoriPriceHistory'),
    where('janCode', '==', janCode),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d: any) => {
      const data = d.data() as any;
      return {
        id: d.id,
        userId: data.userId,
        janCode: data.janCode,
        productId: data.productId,
        price: data.price,
        source: data.source ?? 'kaitori.wiki',
        recordedAt: toIso(data.recordedAt),
      } satisfies KaitoriPriceHistory;
    })
    .sort((a: KaitoriPriceHistory, b: KaitoriPriceHistory) => a.recordedAt.localeCompare(b.recordedAt));
}

