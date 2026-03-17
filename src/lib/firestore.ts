import {
  addDoc,
  collection,
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
import type { Product, ProductMaster, ProductTemplate, SaleRecord } from '@/types';

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

  return querySnapshot.docs.map((snapshot: any) => ({
    id: snapshot.id,
    ...(snapshot.data() as Omit<Product, 'id'>),
  }));
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
): Promise<{ janCode: string; productName: string } | null> {
  const normalized = normalizeJanCode(janCode);
  if (!normalized) return null;

  const ref = doc(db, 'jan_master', normalized);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as any;
    if (data?.productName) {
      return {
        janCode: normalized,
        productName: String(data.productName),
      };
    }
  }

  const q = query(collection(db, 'jan_master'), where('janCode', '==', normalized), limit(1));
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

  // Backward compatibility: legacy rows may store janCode as number.
  const numericJan = Number(normalized);
  if (Number.isFinite(numericJan)) {
    const qNum = query(collection(db, 'jan_master'), where('janCode', '==', numericJan), limit(1));
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
  const rows = snap.docs.map((d: any) => {
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
  receivedCash: number;
  receivedPoint: number;
  pointRate: number;
  memo?: string;
}

export interface ConfirmSaleBatchResult {
  batchId: string;
  updatedProducts: Array<{
    id: string;
    salePrice: number;
    saleDate: string;
    saleLocation: string;
    status: 'sold';
    quantityAvailable: number;
  }>;
}

export async function confirmSaleBatchInFirestore(input: ConfirmSaleBatchInput): Promise<ConfirmSaleBatchResult> {
  const ids = Array.from(new Set(input.productIds.filter(Boolean)));
  if (ids.length === 0) {
    throw new Error('売却対象の商品を選択してください');
  }

  const receivedCash = Math.max(0, Math.round(toNumberSafe(input.receivedCash)));
  const receivedPoint = Math.max(0, Math.round(toNumberSafe(input.receivedPoint)));
  const pointRate = Math.max(0, toNumberSafe(input.pointRate, 1));
  const receivedPointValue = Math.max(0, Math.round(receivedPoint * pointRate));
  const totalRevenue = receivedCash + receivedPointValue;

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
      productName: String(row.productName || ''),
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

  const weights = targets.map((p) => Math.max(0, p.purchasePrice - p.point));
  const allocatedRevenue = distributeByWeights(totalRevenue, weights);
  const allocatedCash = distributeByWeights(receivedCash, weights);
  const allocatedPointValue = distributeByWeights(receivedPointValue, weights);

  const batchDoc = await addDoc(collection(db, 'sale_batches'), {
    userId: input.userId,
    saleDate: input.saleDate,
    saleLocation: input.saleLocation,
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
  targets.forEach((p, idx) => {
    const salePrice = allocatedRevenue[idx] || 0;
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
  });

  wb.update(doc(db, 'sale_batches', batchDoc.id), {
    items: targets.map((p, idx) => ({
      productId: p.id,
      productName: p.productName,
      purchasePrice: p.purchasePrice,
      point: p.point,
      quantityTotal: p.quantityTotal,
      quantityAvailable: p.quantityAvailable,
      allocatedSalePrice: allocatedRevenue[idx] || 0,
      allocatedCash: allocatedCash[idx] || 0,
      allocatedPointValue: allocatedPointValue[idx] || 0,
    })),
    updatedAt: Timestamp.now(),
  });

  await wb.commit();
  return { batchId: batchDoc.id, updatedProducts };
}
