import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Box, CheckCircle2, PlusCircle, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Product } from '@/types';

interface SaleBatchManagerProps {
  products: Product[];
  userId: string;
}

interface SaleBatch {
  id: string;
  method: 'shipping' | 'in_store';
  buyer: string;
  campaign?: string;
  shippingCost: number;
  status: 'in_progress' | 'confirmed';
  createdAt: string;
}

interface SaleBatchItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  purchasePrice: number;
  purchasePointUsed?: number;
  point: number;
}

const getAvailableQty = (product: Product) =>
  Math.max(1, Number(product.quantityAvailable ?? product.quantityTotal ?? 1));

export function SaleBatchManager({ products, userId }: SaleBatchManagerProps) {
  const [method, setMethod] = useState<'shipping' | 'in_store'>('shipping');
  const [buyer, setBuyer] = useState('');
  const [campaign, setCampaign] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState<SaleBatch[]>([]);
  const [message, setMessage] = useState('');

  const [confirmTarget, setConfirmTarget] = useState<SaleBatch | null>(null);
  const [confirmItems, setConfirmItems] = useState<SaleBatchItem[]>([]);
  const [finalPrices, setFinalPrices] = useState<Record<string, string>>({});

  const candidates = useMemo(
    () => products.filter((p) => p.status === 'pending' || p.status === 'inventory'),
    [products]
  );

  const selectedEntries = Object.entries(selected).filter(([, qty]) => qty > 0);

  const loadBatches = async () => {
    const q = query(collection(db, 'sale_batches'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d: any) => {
      const data: any = d.data();
      return {
        id: d.id,
        method: data.method,
        buyer: data.buyer,
        campaign: data.campaign,
        shippingCost: Number(data.shippingCost || 0),
        status: data.status,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
      } as SaleBatch;
    });
    setBatches(rows);
  };

  useEffect(() => {
    loadBatches().catch(() => undefined);
  }, [userId]);

  const handleSelect = (productId: string, checked: boolean) => {
    if (!checked) {
      const next = { ...selected };
      delete next[productId];
      setSelected(next);
      return;
    }
    setSelected((prev) => ({ ...prev, [productId]: 1 }));
  };

  const handleCreateBatch = async () => {
    setMessage('');
    if (!buyer.trim()) {
      setMessage('買取先を入力してください');
      return;
    }
    if (selectedEntries.length === 0) {
      setMessage('一括売却に入れる商品を選択してください');
      return;
    }

    setLoading(true);
    try {
      const batchRef = await addDoc(collection(db, 'sale_batches'), {
        userId,
        method,
        buyer: buyer.trim(),
        campaign: campaign.trim(),
        shippingCost: Number(shippingCost || 0),
        status: 'in_progress',
        itemCount: selectedEntries.length,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const now = Timestamp.now();
      for (const [productId, qty] of selectedEntries) {
        const product = candidates.find((p) => p.id === productId);
        if (!product) continue;

        await addDoc(collection(db, 'sale_batch_items'), {
          batchId: batchRef.id,
          userId,
          productId,
          productName: product.productName,
          quantity: qty,
          purchasePrice: product.purchasePrice,
          purchasePointUsed: product.purchasePointUsed || 0,
          point: product.point,
          status: 'in_progress',
          createdAt: now,
          updatedAt: now,
        });
      }

      setBuyer('');
      setCampaign('');
      setShippingCost('0');
      setSelected({});
      setMessage('一括売却を作成しました');
      await loadBatches();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '一括売却の作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const openConfirm = async (batch: SaleBatch) => {
    const q = query(collection(db, 'sale_batch_items'), where('batchId', '==', batch.id));
    const snap = await getDocs(q);
    const items = snap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() as any) } as SaleBatchItem & { status?: string }))
      .filter((i: any) => i.status !== 'confirmed')
      .map((i: any) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        quantity: Number(i.quantity || 1),
        purchasePrice: Number(i.purchasePrice || 0),
        purchasePointUsed: Number(i.purchasePointUsed || 0),
        point: Number(i.point || 0),
      }));

    const init: Record<string, string> = {};
    for (const i of items) {
      const unitCost = Math.max(0, i.purchasePrice + (i.purchasePointUsed || 0) - i.point);
      init[i.id] = String(unitCost * i.quantity);
    }

    setConfirmTarget(batch);
    setConfirmItems(items);
    setFinalPrices(init);
  };

  const confirmBatch = async () => {
    if (!confirmTarget) return;
    setLoading(true);
    setMessage('');

    try {
      const b = writeBatch(db);
      const today = new Date().toISOString().split('T')[0];
      const now = Timestamp.now();

      for (const item of confirmItems) {
        const finalPrice = Number(finalPrices[item.id] || 0);

        b.update(doc(db, 'sale_batch_items', item.id), {
          finalPrice,
          status: 'confirmed',
          confirmedAt: now,
          updatedAt: now,
        });

        const pRef = doc(db, 'products', item.productId);
        const pSnap = await getDoc(pRef);
        if (!pSnap.exists()) continue;
        const pData: any = pSnap.data();

        const available = Number(pData.quantityAvailable ?? pData.quantityTotal ?? 1);
        const nextAvailable = Math.max(0, available - item.quantity);

        const updates: any = {
          quantityAvailable: nextAvailable,
          quantityTotal: Number(pData.quantityTotal ?? available),
          updatedAt: now,
        };

        if (nextAvailable === 0) {
          updates.status = 'sold';
          updates.salePrice = finalPrice;
          updates.saleLocation = confirmTarget.buyer;
          updates.saleDate = today;
        } else if (pData.status === 'pending') {
          updates.status = 'inventory';
        }

        b.update(pRef, updates);
      }

      b.update(doc(db, 'sale_batches', confirmTarget.id), {
        status: 'confirmed',
        confirmedAt: now,
        updatedAt: now,
      });

      await b.commit();
      setMessage('一括売却を確定しました');
      setConfirmTarget(null);
      setConfirmItems([]);
      setFinalPrices({});
      await loadBatches();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '確定処理に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel p-4 space-y-3">
        <h3 className="font-bold text-slate-900 inline-flex items-center gap-2">
          <PlusCircle className="w-5 h-5 text-sky-600" />
          一括売却を作成
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select value={method} onChange={(e) => setMethod(e.target.value as any)} className="input-field">
            <option value="shipping">郵送</option>
            <option value="in_store">来店</option>
          </select>
          <input value={buyer} onChange={(e) => setBuyer(e.target.value)} className="input-field" placeholder="買取先（例: 買取Wiki）" />
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} className="input-field" placeholder="キャンペーン（任意）" />
          <input type="number" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} className="input-field" placeholder="送料" />
        </div>

        <div className="max-h-64 overflow-auto border border-slate-200 rounded-xl p-2 space-y-2 bg-white/60">
          {candidates.map((p) => {
            const checked = selected[p.id] !== undefined;
            const maxQty = getAvailableQty(p);
            return (
              <label key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/70">
                <input type="checkbox" checked={checked} onChange={(e) => handleSelect(p.id, e.target.checked)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.productName}</p>
                  <p className="text-xs text-slate-500">残数: {maxQty}</p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={maxQty}
                  disabled={!checked}
                  value={selected[p.id] || 1}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [p.id]: Math.max(1, Math.min(maxQty, Number(e.target.value || 1))) }))
                  }
                  className="w-20 px-2 py-1 border rounded-lg"
                />
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">選択: {selectedEntries.length}件</p>
          <button onClick={handleCreateBatch} disabled={loading} className="btn-primary px-4 py-2 rounded-xl text-sm">
            {loading ? '作成中...' : '一括売却を作成'}
          </button>
        </div>

        {message && <p className="text-sm text-slate-700">{message}</p>}
      </div>

      <div className="glass-panel p-4">
        <h3 className="font-bold text-slate-900 inline-flex items-center gap-2 mb-3">
          <Box className="w-5 h-5 text-indigo-600" />
          最近の一括売却
        </h3>

        <div className="space-y-2">
          {batches.length === 0 && <p className="text-sm text-slate-500">まだ一括売却はありません</p>}
          {batches.map((b) => (
            <div key={b.id} className="border border-slate-200 rounded-xl p-3 bg-white/60 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{b.buyer}</p>
                <p className="text-xs text-slate-500">
                  {b.method === 'shipping' ? '郵送' : '来店'} / 送料 {b.shippingCost} 円 / {new Date(b.createdAt).toLocaleDateString('ja-JP')}
                </p>
                {b.campaign && <p className="text-xs text-indigo-600 mt-1">{b.campaign}</p>}
              </div>
              {b.status === 'in_progress' ? (
                <button onClick={() => openConfirm(b)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">
                  確定入力
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> 確定済み
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {confirmTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-2xl p-5 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-slate-900">一括売却を確定</h4>
              <button onClick={() => setConfirmTarget(null)} className="p-2 rounded-lg hover:bg-white/70">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {confirmItems.map((item) => (
                <div key={item.id} className="border border-slate-200 rounded-lg p-3 bg-white/60 grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2 items-center">
                  <div>
                    <p className="text-sm font-semibold truncate">{item.productName}</p>
                    <p className="text-xs text-slate-500">数量 {item.quantity}</p>
                  </div>
                  <input
                    type="number"
                    value={finalPrices[item.id] || '0'}
                    onChange={(e) => setFinalPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="input-field"
                    placeholder="最終売却額"
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmTarget(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700">閉じる</button>
              <button onClick={confirmBatch} disabled={loading} className="btn-primary px-4 py-2 rounded-lg">{loading ? '確定中...' : '確定する'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
