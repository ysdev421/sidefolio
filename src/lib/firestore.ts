import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Product, ProductTemplate, SaleRecord } from '@/types';

export async function addProductToFirestore(
  userId: string,
  productData: Omit<Product, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const docRef = await addDoc(collection(db, 'products'), {
    ...productData,
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
    channel?: Product['channel'];
    purchasePrice?: number;
    purchasePointUsed?: number;
    couponDiscount?: number;
    instantPointUse?: number;
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
      channel: data.channel || null,
      lastPurchasePrice: data.purchasePrice ?? null,
      lastPurchasePointUsed: data.purchasePointUsed ?? null,
      lastCouponDiscount: data.couponDiscount ?? null,
      lastInstantPointUse: data.instantPointUse ?? null,
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
      channel: data.channel || undefined,
      lastPurchasePrice: typeof data.lastPurchasePrice === 'number' ? data.lastPurchasePrice : undefined,
      lastPurchasePointUsed:
        typeof data.lastPurchasePointUsed === 'number' ? data.lastPurchasePointUsed : undefined,
      lastCouponDiscount: typeof data.lastCouponDiscount === 'number' ? data.lastCouponDiscount : undefined,
      lastInstantPointUse: typeof data.lastInstantPointUse === 'number' ? data.lastInstantPointUse : undefined,
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

export async function getJanMasterByCode(
  janCode: string
): Promise<{ janCode: string; productName: string } | null> {
  const normalized = normalizeJanCode(janCode);
  if (!normalized) return null;

  const ref = doc(db, 'jan_master', normalized);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  if (!data?.productName) return null;

  return {
    janCode: normalized,
    productName: String(data.productName),
  };
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
