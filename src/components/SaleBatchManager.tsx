import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckSquare, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { NumericInput } from '@/components/NumericInput';
import { confirmSaleBatchInFirestore, getUserSaleLocations } from '@/lib/firestore';
import { RichDatePicker } from '@/components/RichDatePicker';
import { useStore } from '@/lib/store';
import { formatCurrency, getActualPayment, getEffectiveCost } from '@/lib/utils';
import type { Product } from '@/types';

interface SaleBatchManagerProps {
  products: Product[];
  userId: string;
}


const normalizeJanCode = (value: string) => value.replace(/\D/g, '').trim();
const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));

type GroupLot = {
  product: Product;
  availableQty: number;
  unitEffectiveCost: number;
  unitActualCost: number;
};

type JanGroup = {
  key: string;
  janCode: string;
  productName: string;
  totalAvailable: number;
  lots: GroupLot[];
  searchText: string;
};

export function SaleBatchManager({ products, userId }: SaleBatchManagerProps) {
  const [query, setQuery] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleMethod, setSaleMethod] = useState<'来店' | '郵送'>('来店');
  const [shippingType, setShippingType] = useState<'送料込みキャンペーン' | '実費'>('送料込みキャンペーン');
  const [shippingCost, setShippingCost] = useState('');
  const [saleLocations, setSaleLocations] = useState<string[]>([]);
  const [saleLocation, setSaleLocation] = useState('');
  const [receivedPoint, setReceivedPoint] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [lotSaleQtys, setLotSaleQtys] = useState<Record<string, string>>({});
  const [lotUnitPrices, setLotUnitPrices] = useState<Record<string, string>>({});
  const [lotReductionMemos, setLotReductionMemos] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [errorModal, setErrorModal] = useState<{ title: string; detail: string } | null>(null);
  const updateProduct = useStore((state) => state.updateProduct);

  useEffect(() => {
    getUserSaleLocations(userId).then((rows) => {
      setSaleLocations(rows);
      setSaleLocation(rows[0] ?? '');
    });
  }, [userId]);

  const candidates = useMemo(() => {
    return products.filter((p) => p.status === 'inventory' && (p.quantityAvailable ?? p.quantityTotal ?? 1) > 0);
  }, [products]);

  const groups = useMemo(() => {
    const map = new Map<string, JanGroup>();

    candidates.forEach((p) => {
      const availableQty = Math.max(0, p.quantityAvailable ?? p.quantityTotal ?? 1);
      if (availableQty <= 0) return;

      const normalizedJan = normalizeJanCode(p.janCode || '');
      const productName = p.productName || '商品名未設定';
      const key = normalizedJan ? `JAN:${normalizedJan}` : `NAME:${productName}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          janCode: normalizedJan,
          productName,
          totalAvailable: 0,
          lots: [],
          searchText: '',
        });
      }

      const row = map.get(key)!;
      const total = Math.max(1, p.quantityTotal ?? 1);
      row.totalAvailable += availableQty;
      row.lots.push({
        product: p,
        availableQty,
        unitEffectiveCost: getEffectiveCost(p) / total,
        unitActualCost: getActualPayment(p) / total,
      });
    });

    const sorted = Array.from(map.values())
      .map((g) => {
        const lots = [...g.lots].sort((a, b) => {
          const da = new Date(a.product.purchaseDate).getTime();
          const db = new Date(b.product.purchaseDate).getTime();
          if (da !== db) return da - db;
          return new Date(a.product.createdAt).getTime() - new Date(b.product.createdAt).getTime();
        });

        const locations = Array.from(new Set(lots.map((l) => l.product.purchaseLocation).filter(Boolean))).join(' ');
        return {
          ...g,
          lots,
          searchText: [g.productName, g.janCode, locations].join(' ').toLowerCase(),
        };
      })
      .sort((a, b) => {
        if (a.janCode && b.janCode) return a.janCode.localeCompare(b.janCode);
        if (a.janCode) return -1;
        if (b.janCode) return 1;
        return a.productName.localeCompare(b.productName, 'ja');
      });

    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((g) => g.searchText.includes(q));
  }, [candidates, query]);

  const groupMap = useMemo(() => {
    const map = new Map<string, JanGroup>();
    groups.forEach((g) => map.set(g.key, g));
    return map;
  }, [groups]);

  const selectedGroups = useMemo(() => {
    return selectedGroupKeys.map((key) => groupMap.get(key)).filter(Boolean) as JanGroup[];
  }, [selectedGroupKeys, groupMap]);

  const getLotSoldQty = (lot: GroupLot) => {
    const raw = parseInt(lotSaleQtys[lot.product.id] ?? '0', 10);
    if (Number.isNaN(raw)) return 0;
    return clampInt(raw, 0, lot.availableQty);
  };

  const getLotUnitPrice = (lot: GroupLot) => {
    return Math.max(0, Math.round(parseFloat(lotUnitPrices[lot.product.id] || '0') || 0));
  };

  const allocation = useMemo(() => {
    const byProductQty: Record<string, number> = {};
    const byProductCash: Record<string, number> = {};
    const byGroupPreview: Record<string, Array<{ lot: GroupLot; soldQty: number; soldCash: number; soldEffective: number; soldActual: number }>> = {};

    selectedGroups.forEach((group) => {
      const rows: Array<{ lot: GroupLot; soldQty: number; soldCash: number; soldEffective: number; soldActual: number }> = [];

      group.lots.forEach((lot) => {
        const soldQty = getLotSoldQty(lot);
        if (soldQty <= 0) return;

        const unitPrice = getLotUnitPrice(lot);
        const soldCash = soldQty * unitPrice;
        const soldEffective = Math.round(lot.unitEffectiveCost * soldQty);
        const soldActual = Math.round(lot.unitActualCost * soldQty);

        byProductQty[lot.product.id] = soldQty;
        byProductCash[lot.product.id] = soldCash;

        rows.push({
          lot,
          soldQty,
          soldCash,
          soldEffective,
          soldActual,
        });
      });

      byGroupPreview[group.key] = rows;
    });

    return { byProductQty, byProductCash, byGroupPreview };
  }, [selectedGroups, lotSaleQtys, lotUnitPrices]);

  const selectedProductIds = useMemo(
    () => Object.keys(allocation.byProductQty).filter((id) => allocation.byProductQty[id] > 0),
    [allocation.byProductQty]
  );

  const productSaleQtys = useMemo(() => {
    return selectedProductIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = allocation.byProductQty[id];
      return acc;
    }, {});
  }, [selectedProductIds, allocation.byProductQty]);

  const productBasePrices = useMemo(() => {
    return selectedProductIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = allocation.byProductCash[id] || 0;
      return acc;
    }, {});
  }, [selectedProductIds, allocation.byProductCash]);

  const selectedEffectiveCost = useMemo(
    () => selectedGroups.reduce((sum, group) => sum + (allocation.byGroupPreview[group.key] || []).reduce((s, row) => s + row.soldEffective, 0), 0),
    [selectedGroups, allocation.byGroupPreview]
  );

  const selectedActualCost = useMemo(
    () => selectedGroups.reduce((sum, group) => sum + (allocation.byGroupPreview[group.key] || []).reduce((s, row) => s + row.soldActual, 0), 0),
    [selectedGroups, allocation.byGroupPreview]
  );

  const basePurchaseAmountValue = useMemo(
    () => Object.values(productBasePrices).reduce((sum, v) => sum + Math.max(0, v || 0), 0),
    [productBasePrices]
  );

  const selectedLotCount = useMemo(
    () => selectedGroups.reduce((sum, group) => sum + (allocation.byGroupPreview[group.key] || []).length, 0),
    [selectedGroups, allocation.byGroupPreview]
  );

  const bonusPointValue = Math.max(0, Math.round(parseFloat(receivedPoint) || 0));
  const shippingCostValue = saleMethod === '郵送' && shippingType === '実費' ? Math.max(0, Math.round(parseFloat(shippingCost) || 0)) : 0;
  const revenue = basePurchaseAmountValue + bonusPointValue - shippingCostValue;
  const profit = revenue - selectedEffectiveCost;
  const pointProfit = revenue - selectedActualCost;

  const allSelected = groups.length > 0 && groups.every((g) => selectedGroupKeys.includes(g.key));

  const toggleOne = (group: JanGroup) => {
    const key = group.key;
    if (selectedGroupKeys.includes(key)) {
      setSelectedGroupKeys((prev) => prev.filter((v) => v !== key));
      return;
    }
    setSelectedGroupKeys((prev) => [...prev, key]);
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedGroupKeys([]);
      return;
    }
    setSelectedGroupKeys(groups.map((g) => g.key));
  };

  const submit = async () => {
    setError('');
    setMessage('');

    if (selectedGroups.length === 0) {
      setErrorModal({ title: '入力エラー', detail: '売却対象のJANを選択してください。' });
      return;
    }

    if (!saleLocation.trim()) {
      setErrorModal({ title: '入力エラー', detail: '売却先を選択してください。' });
      return;
    }

    if (selectedProductIds.length === 0) {
      setErrorModal({ title: '入力エラー', detail: '売却数量が0件です。内訳で数量を入力してください。' });
      return;
    }

    const missingPriceCount = selectedGroups.reduce((count, group) => {
      return count + group.lots.filter((lot) => {
        const qty = getLotSoldQty(lot);
        if (qty <= 0) return false;
        const raw = lotUnitPrices[lot.product.id];
        if (raw === undefined || raw.trim() === '') return true;
        const n = Number(raw);
        return !Number.isFinite(n) || n < 0;
      }).length;
    }, 0);

    if (missingPriceCount > 0) {
      setErrorModal({ title: '入力エラー', detail: `売却数量を入れたロットの単価を入力してください（未入力 ${missingPriceCount}件）。` });
      return;
    }

    setSubmitting(true);
    try {
      const productSaleMemos = selectedProductIds.reduce<Record<string, string>>((acc, id) => {
        const memoText = (lotReductionMemos[id] || '').trim();
        if (memoText) acc[id] = memoText;
        return acc;
      }, {});

      const result = await confirmSaleBatchInFirestore({
        userId,
        productIds: selectedProductIds,
        saleDate,
        saleLocation: saleLocation.trim(),
        saleMethod,
        receivedCash: basePurchaseAmountValue,
        receivedPoint: bonusPointValue,
        pointRate: 1,
        productBasePrices,
        productSaleQtys,
        productSaleMemos,
        memo: memo.trim(),
      });

      result.updatedProducts.forEach((p) => {
        updateProduct(p.id, p);
      });

      setSelectedGroupKeys([]);
      setExpandedGroups({});
      setLotSaleQtys({});
      setLotUnitPrices({});
      setLotReductionMemos({});
      setReceivedPoint('');
      setMemo('');
      setMessage(`売却登録を保存しました（${result.updatedProducts.length}件）`);
    } catch (e) {
      setErrorModal({
        title: '保存エラー',
        detail: e instanceof Error ? e.message : '売却登録の保存に失敗しました',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel p-4 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">売却登録</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="sm:col-span-2 lg:col-span-1">
            <RichDatePicker label="売却日" value={saleDate} onChange={setSaleDate} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-2">
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
              <select value={saleLocation} onChange={(e) => setSaleLocation(e.target.value)} className="input-field">
                {saleLocations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-2 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-600 mb-1">買取総額</label>
              <div className="input-field bg-slate-50 text-slate-700 inline-flex items-center w-full">
                <span className="font-semibold">{formatCurrency(basePurchaseAmountValue)}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">上乗せP（円）</label>
              <NumericInput integer min={0} value={receivedPoint} onChange={(e) => setReceivedPoint(e.target.value)} className="input-field" placeholder="0" />
            </div>
          </div>
          {saleMethod === '郵送' && (
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-xs text-slate-600 mb-1">送料</label>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 gap-1">
                  {(['送料込みキャンペーン', '実費'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setShippingType(t)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${shippingType === t ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {shippingType === '実費' && (
                  <NumericInput
                    integer
                    min={0}
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                    className="input-field w-32"
                    placeholder="0"
                  />
                )}
                {shippingType === '送料込みキャンペーン' && (
                  <span className="text-xs text-slate-500">送料は0円として計算します</span>
                )}
              </div>
            </div>
          )}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs text-slate-600 mb-1">メモ</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} className="input-field" placeholder="任意" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-sm">
          <p className="text-slate-700">選択JAN数: <span className="font-semibold">{selectedGroups.length}件</span></p>
          <p className="text-slate-700">入力ロット数: <span className="font-semibold">{selectedLotCount}件</span></p>
          <p className="text-slate-700">総受取額: <span className="font-semibold">{formatCurrency(revenue)}</span></p>
          <p className="text-slate-700">総利益: <span className={`font-semibold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatCurrency(profit)}</span></p>
          <p className="text-slate-700">P利益: <span className={`font-semibold ${pointProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatCurrency(pointProfit)}</span></p>
          <p className="text-xs text-slate-500 mt-1">総受取額 = 買取総額 + 上乗せP - 送料</p>
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
          売却登録を確定
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

        <div className="space-y-2 max-h-[55vh] overflow-auto pr-1">
          {groups.length === 0 ? (
            <p className="text-sm text-slate-500">売却対象の在庫がありません</p>
          ) : (
            groups.map((group) => {
              const checked = selectedGroupKeys.includes(group.key);
              const expanded = !!expandedGroups[group.key];

              return (
                <div key={group.key} className={`rounded-xl border p-3 ${checked ? 'border-sky-300 bg-sky-50/60' : 'border-slate-200 bg-white/70'}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={checked} onChange={() => toggleOne(group)} className="mt-1 h-4 w-4 accent-sky-600" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 truncate">{group.productName}</p>
                        {group.janCode && <span className="text-xs text-slate-500">JAN {group.janCode}</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">在庫 {group.totalAvailable} / ロット {group.lots.length}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.key]: !expanded }))}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      内訳
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white/80 p-2">
                      <p className="text-xs font-semibold text-slate-700 mb-1">ロット内訳（数量・単価・減額メモ）</p>
                      <div className="space-y-1">
                        {group.lots.map((lot) => {
                          const soldFromLot = getLotSoldQty(lot);
                          const soldCash = soldFromLot * getLotUnitPrice(lot);
                          return (
                            <div key={lot.product.id} className="rounded border border-slate-100 bg-slate-50/70 px-2 py-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-slate-700 whitespace-nowrap">{lot.product.purchaseDate} / {lot.product.purchaseLocation}</p>
                                <p className="text-xs text-slate-500">残 {Math.max(0, lot.availableQty - soldFromLot)} / 在庫 {lot.availableQty}</p>
                              </div>
                              {lot.product.memo && <p className="text-xs text-slate-500 mt-0.5 truncate">メモ: {lot.product.memo}</p>}
                              <div className="mt-1 grid grid-cols-[auto_1fr] sm:grid-cols-[auto_auto_auto_1fr] gap-2 items-end">
                                <div>
                                  <label className="block text-[11px] text-slate-600 mb-1">数量</label>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={!checked}
                                      onClick={() => setLotSaleQtys((prev) => ({ ...prev, [lot.product.id]: String(Math.max(0, soldFromLot - 1)) }))}
                                      className="w-6 h-6 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold disabled:opacity-40"
                                    >-</button>
                                    <span className="w-7 text-center text-xs font-semibold text-slate-900">{soldFromLot}</span>
                                    <button
                                      type="button"
                                      disabled={!checked}
                                      onClick={() => setLotSaleQtys((prev) => ({ ...prev, [lot.product.id]: String(Math.min(lot.availableQty, soldFromLot + 1)) }))}
                                      className="w-6 h-6 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold disabled:opacity-40"
                                    >+</button>
                                  </div>
                                </div>
                                <div className="min-w-[120px]">
                                  <label className="block text-[11px] text-slate-600 mb-1">単価</label>
                                  <NumericInput
                                    integer
                                    min={0}
                                    disabled={!checked}
                                    value={lotUnitPrices[lot.product.id] ?? ''}
                                    onChange={(e) => setLotUnitPrices((prev) => ({ ...prev, [lot.product.id]: e.target.value }))}
                                    className="input-field h-8 text-xs"
                                    placeholder="0"
                                  />
                                </div>
                                <p className="text-[11px] text-slate-600">売却額 {formatCurrency(soldCash)}</p>
                              </div>
                              {checked && soldFromLot > 0 && (
                                <div className="mt-1">
                                  <label className="block text-[11px] text-slate-600 mb-1">減額メモ</label>
                                  <input
                                    value={lotReductionMemos[lot.product.id] ?? ''}
                                    onChange={(e) =>
                                      setLotReductionMemos((prev) => ({ ...prev, [lot.product.id]: e.target.value }))
                                    }
                                    className="input-field h-8 text-xs"
                                    placeholder="減額理由（任意）"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
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