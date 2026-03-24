import { useMemo, useState } from 'react';
import { AlertTriangle, CheckSquare, Loader2 } from 'lucide-react';
import { confirmSaleBatchInFirestore } from '@/lib/firestore';
import { RichDatePicker } from '@/components/RichDatePicker';
import { useStore } from '@/lib/store';
import { formatCurrency, getActualPayment, getEffectiveCost } from '@/lib/utils';
import type { Product } from '@/types';

interface SaleBatchManagerProps {
  products: Product[];
  userId: string;
}

const SALE_LOCATIONS = ['買取wiki', '買取商店', '森森買取'] as const;

export function SaleBatchManager({ products, userId }: SaleBatchManagerProps) {
  const [query, setQuery] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleMethod, setSaleMethod] = useState<'来店' | '郵送'>('来店');
  const [saleLocation, setSaleLocation] = useState<(typeof SALE_LOCATIONS)[number]>(SALE_LOCATIONS[0]);
  const [receivedPoint, setReceivedPoint] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [productSalePrices, setProductSalePrices] = useState<Record<string, string>>({});
  const [productSaleQtys, setProductSaleQtys] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [errorModal, setErrorModal] = useState<{ title: string; detail: string } | null>(null);
  const updateProduct = useStore((state) => state.updateProduct);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => p.status !== 'sold' && (p.quantityAvailable ?? p.quantityTotal ?? 1) > 0)
      .filter((p) => {
        if (!q) return true;
        const text = [p.productName, p.purchaseLocation, p.janCode || ''].join(' ').toLowerCase();
        return text.includes(q);
      });
  }, [products, query]);

  const selectedProducts = useMemo(
    () => candidates.filter((p) => selectedIds.includes(p.id)),
    [candidates, selectedIds]
  );

  const getSoldQty = (p: Product) => {
    const max = Math.max(1, p.quantityAvailable ?? p.quantityTotal ?? 1);
    const raw = parseInt(productSaleQtys[p.id] ?? '', 10);
    return isNaN(raw) ? max : Math.max(1, Math.min(max, raw));
  };

  const selectedEffectiveCost = selectedProducts.reduce((sum, p) => {
    const total = Math.max(1, p.quantityTotal ?? 1);
    return sum + Math.round((getEffectiveCost(p) / total) * getSoldQty(p));
  }, 0);
  const selectedActualCost = selectedProducts.reduce((sum, p) => {
    const total = Math.max(1, p.quantityTotal ?? 1);
    return sum + Math.round((getActualPayment(p) / total) * getSoldQty(p));
  }, 0);
  const basePurchaseAmountValue = selectedProducts.reduce((sum, p) => {
    const v = Math.max(0, Math.round(parseFloat(productSalePrices[p.id] || '0') || 0));
    return sum + v;
  }, 0);
  const bonusPointValue = Math.max(0, Math.round(parseFloat(receivedPoint) || 0));
  const revenue = basePurchaseAmountValue + bonusPointValue;
  const profit = revenue - selectedEffectiveCost;
  const pointProfit = revenue - selectedActualCost;

  const allSelected = candidates.length > 0 && candidates.every((p) => selectedIds.includes(p.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
    setProductSalePrices((prev) => (prev[id] !== undefined ? prev : { ...prev, [id]: '' }));
    setProductSaleQtys((prev) => {
      if (prev[id] !== undefined) return prev;
      const p = candidates.find((c) => c.id === id);
      const qty = p?.quantityAvailable ?? p?.quantityTotal ?? 1;
      return { ...prev, [id]: String(qty) };
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    const ids = candidates.map((p) => p.id);
    setSelectedIds(ids);
    setProductSalePrices((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        if (next[id] === undefined) next[id] = '';
      });
      return next;
    });
    setProductSaleQtys((prev) => {
      const next = { ...prev };
      candidates.forEach((p) => {
        if (next[p.id] === undefined) {
          next[p.id] = String(p.quantityAvailable ?? p.quantityTotal ?? 1);
        }
      });
      return next;
    });
  };

  const submit = async () => {
    setError('');
    setMessage('');
    if (selectedIds.length === 0) {
      setErrorModal({
        title: '入力エラー',
        detail: '売却対象の商品を選択してください。',
      });
      return;
    }
    if (!saleLocation.trim()) {
      setErrorModal({
        title: '入力エラー',
        detail: '売却先を選択してください。',
      });
      return;
    }
    const missing = selectedProducts.filter((p) => {
      const raw = productSalePrices[p.id];
      if (raw === undefined || raw.trim() === '') return true;
      const n = Number(raw);
      return !Number.isFinite(n) || n < 0;
    });
    if (missing.length > 0) {
      setErrorModal({
        title: '入力エラー',
        detail: `選択した商品の買取価格を入力してください（未入力: ${missing.length}件）`,
      });
      return;
    }

    const productBasePrices = selectedProducts.reduce<Record<string, number>>((acc, p) => {
      acc[p.id] = Math.max(0, Math.round(parseFloat(productSalePrices[p.id] || '0') || 0));
      return acc;
    }, {});

    setSubmitting(true);
    try {
      const productSaleQtysNum = selectedProducts.reduce<Record<string, number>>((acc, p) => {
        acc[p.id] = getSoldQty(p);
        return acc;
      }, {});

      const result = await confirmSaleBatchInFirestore({
        userId,
        productIds: selectedIds,
        saleDate,
        saleLocation: saleLocation.trim(),
        saleMethod,
        receivedCash: basePurchaseAmountValue,
        receivedPoint: bonusPointValue,
        pointRate: 1,
        productBasePrices,
        productSaleQtys: productSaleQtysNum,
        memo: memo.trim(),
      });

      result.updatedProducts.forEach((p) => {
        updateProduct(p.id, p);
      });
      setSelectedIds([]);
      setProductSalePrices({});
      setProductSaleQtys({});
      setReceivedPoint('');
      setMemo('');
      setMessage(`一括売却を保存しました（${result.updatedProducts.length}件）`);
    } catch (e) {
      setErrorModal({
        title: '保存エラー',
        detail: e instanceof Error ? e.message : '一括売却の保存に失敗しました',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel p-4 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">一括売却登録</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <RichDatePicker label="売却日" value={saleDate} onChange={setSaleDate} />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">方法</label>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 gap-1">
              {(['来店', '郵送'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSaleMethod(m)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${saleMethod === m ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">売却先</label>
            <select value={saleLocation} onChange={(e) => setSaleLocation(e.target.value as (typeof SALE_LOCATIONS)[number])} className="input-field">
              {SALE_LOCATIONS.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">買取総額</label>
            <input type="number" min={0} value={basePurchaseAmountValue} readOnly className="input-field bg-slate-50 text-slate-700" />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">上乗せP（円）</label>
            <input type="number" min={0} value={receivedPoint} onChange={(e) => setReceivedPoint(e.target.value)} className="input-field" placeholder="0" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs text-slate-600 mb-1">メモ</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} className="input-field" placeholder="任意" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-sm">
          <p className="text-slate-700">選択件数: <span className="font-semibold">{selectedProducts.length}件</span></p>
          <p className="text-slate-700">最終受取: <span className="font-semibold">{formatCurrency(revenue)}</span></p>
          <p className="text-slate-700">利益: <span className={`font-semibold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatCurrency(profit)}</span></p>
          <p className="text-slate-700">P利益: <span className={`font-semibold ${pointProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatCurrency(pointProfit)}</span></p>
          <p className="text-xs text-slate-500 mt-1">最終受取 = 買取総額 + 上乗せP（円）</p>
        </div>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
          一括売却を確定
        </button>
      </div>

      <div className="glass-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-field flex-1 min-w-[220px]"
            placeholder="商品名 / JAN / 購入場所で検索"
          />
          <button type="button" onClick={toggleAll} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition">
            {allSelected ? '全解除' : '全選択'}
          </button>
        </div>

        <div className="space-y-2 max-h-[52vh] overflow-auto pr-1">
          {candidates.length === 0 ? (
            <p className="text-sm text-slate-500">売却対象の商品がありません</p>
          ) : (
            candidates.map((p) => {
              const checked = selectedIds.includes(p.id);
              const qty = p.quantityAvailable ?? p.quantityTotal ?? 1;
              return (
                <label key={p.id} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${checked ? 'border-sky-300 bg-sky-50/60' : 'border-slate-200 bg-white/70'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleOne(p.id)} className="mt-1 h-4 w-4 accent-sky-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 truncate">{p.productName}</p>
                    <p className="text-xs text-slate-500">{p.purchaseLocation} / 数量 {qty}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      実質原価 {formatCurrency(getEffectiveCost(p))} ・ 購入合計 {formatCurrency(getActualPayment(p))}
                    </p>
                    {checked && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {(p.quantityAvailable ?? p.quantityTotal ?? 1) > 1 && (
                          <div>
                            <label className="block text-[11px] text-slate-600 mb-1">売却数</label>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setProductSaleQtys((prev) => ({ ...prev, [p.id]: String(Math.max(1, getSoldQty(p) - 1)) }))}
                                className="w-8 h-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-base flex items-center justify-center"
                              >−</button>
                              <span className="w-8 text-center text-sm font-semibold text-slate-900">{getSoldQty(p)}</span>
                              <button
                                type="button"
                                onClick={() => setProductSaleQtys((prev) => ({ ...prev, [p.id]: String(Math.min(p.quantityAvailable ?? p.quantityTotal ?? 1, getSoldQty(p) + 1)) }))}
                                className="w-8 h-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-base flex items-center justify-center"
                              >+</button>
                              <span className="text-[10px] text-slate-400">/ {p.quantityAvailable ?? p.quantityTotal ?? 1}</span>
                            </div>
                          </div>
                        )}
                        <div className="flex-1 min-w-[140px] max-w-[180px]">
                          <label className="block text-[11px] text-slate-600 mb-1">買取価格</label>
                          <input
                            type="number"
                            min={0}
                            value={productSalePrices[p.id] ?? ''}
                            onChange={(e) => setProductSalePrices((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            className="input-field h-9 text-sm"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>

      {errorModal && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-rose-200 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-base font-bold text-slate-900">{errorModal.title}</h4>
                <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{errorModal.detail}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setErrorModal(null)}
                className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
