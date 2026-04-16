import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Loader, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { NumericInput } from '@/components/NumericInput';
import { RichDatePicker } from '@/components/RichDatePicker';
import { useProducts } from '@/hooks/useProducts';
import { useStore } from '@/lib/store';
import { copyToClipboard } from '@/lib/utils';
import { fetchKaitoriPrice } from '@/lib/kaitoriPrice';
import { addKaitoriPriceHistory, getPurchaseLocationUsageCounts, getUserPurchaseLocations } from '@/lib/firestore';
import type { Product } from '@/types';

interface EditProductFormProps {
  product: Product;
  userId: string;
  onDelete: (id: string) => void;
  onClose?: () => void;
}

export function EditProductForm({ product, userId, onDelete, onClose }: EditProductFormProps) {
  const { updateProductData } = useProducts(userId);
  const loading = useStore((state) => state.loading);
  const [purchaseLocations, setPurchaseLocations] = useState<string[]>([product.purchaseLocation].filter(Boolean));
  const [janCopied, setJanCopied] = useState(false);
  const [kaitoriPrice, setKaitoriPrice] = useState<number | null>(product.kaitoriPrice ?? null);
  const [kaitoriSearchUrl, setKaitoriSearchUrl] = useState(
    product.janCode ? `https://kaitori.wiki/search?type=&keyword=${product.janCode}` : ''
  );
  const [kaitoriPriceAt, setKaitoriPriceAt] = useState<string | null>(product.kaitoriPriceAt ?? null);
  const [kaitoriLoading, setKaitoriLoading] = useState(false);
  const [kaitoriError, setKaitoriError] = useState('');

  const extraPointsInitial = product.extraPoints ?? [];
  const basePointInitial = product.point - extraPointsInitial.reduce((s, v) => s + v, 0);

  const [formData, setFormData] = useState({
    productName: product.productName,
    status: product.status,
    quantityTotal: String(product.quantityTotal || 1),
    quantityAvailable: String(product.quantityAvailable || product.quantityTotal || 1),
    purchasePrice: String(product.purchasePrice),
    point: String(basePointInitial),
    purchaseDate: product.purchaseDate,
    purchaseLocation: product.purchaseLocation,
    salePrice: product.salePrice ? String(product.salePrice) : '',
    saleLocation: product.saleLocation || '',
    saleDate: product.saleDate || '',
    memo: product.memo || '',
  });
  const [extraPoints, setExtraPoints] = useState<string[]>(extraPointsInitial.map(String));
  const [couponDiscount, setCouponDiscount] = useState(String(product.couponDiscount ?? ''));
  const [reservePointUse, setReservePointUse] = useState(String(product.reservePointUse ?? ''));
  const [immediatePointUse, setImmediatePointUse] = useState(String(product.immediatePointUse ?? ''));
  const [showDiscount, setShowDiscount] = useState(
    !!(product.couponDiscount || product.reservePointUse || product.immediatePointUse)
  );
  const [error, setError] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const [rows, usageCounts] = await Promise.all([
          getUserPurchaseLocations(userId),
          getPurchaseLocationUsageCounts(userId),
        ]);
        const base = rows.length > 0 ? rows : ['メルカリ'];
        const sorted = [...base].sort((a, b) => {
          const byCount = (usageCounts[b] || 0) - (usageCounts[a] || 0);
          if (byCount !== 0) return byCount;
          return a.localeCompare(b, 'ja');
        });
        setPurchaseLocations(sorted);
        setFormData((prev) => ({
          ...prev,
          purchaseLocation:
            prev.purchaseLocation && sorted.includes(prev.purchaseLocation)
              ? prev.purchaseLocation
              : sorted[0] || 'メルカリ',
        }));
      } catch {
        setPurchaseLocations(['メルカリ']);
      }
    };
    loadLocations();
  }, [userId]);


  const isDirty = JSON.stringify({
    status: formData.status,
    quantityAvailable: formData.quantityAvailable,
    purchasePrice: formData.purchasePrice,
    point: formData.point,
    extraPoints,
    purchaseDate: formData.purchaseDate,
    purchaseLocation: formData.purchaseLocation,
    salePrice: formData.salePrice,
    saleLocation: formData.saleLocation,
    saleDate: formData.saleDate,
    memo: formData.memo,
  }) !== JSON.stringify({
    status: product.status,
    quantityAvailable: String(product.quantityAvailable || product.quantityTotal || 1),
    purchasePrice: String(product.purchasePrice),
    point: String(basePointInitial),
    extraPoints: extraPointsInitial.map(String),
    purchaseDate: product.purchaseDate,
    purchaseLocation: product.purchaseLocation,
    salePrice: product.salePrice ? String(product.salePrice) : '',
    saleLocation: product.saleLocation || '',
    saleDate: product.saleDate || '',
    memo: product.memo || '',
  });

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const extraPointsNums = extraPoints.map((p) => parseFloat(p) || 0).filter((v) => v !== 0);
      const totalPoint = (parseFloat(formData.point) || 0) + extraPointsNums.reduce((s, v) => s + v, 0);
      const nextQuantityAvailable = Math.max(0, parseInt(formData.quantityAvailable, 10) || 0);
      const nextQuantityTotal =
        formData.status === 'sold'
          ? Math.max(1, parseInt(formData.quantityTotal, 10) || 1, nextQuantityAvailable)
          : Math.max(1, nextQuantityAvailable);
      const couponDiscountNum = parseFloat(couponDiscount) || 0;
      const reservePointUseNum = parseFloat(reservePointUse) || 0;
      const immediatePointUseNum = parseFloat(immediatePointUse) || 0;

      const updates: Partial<Product> = {
        status: formData.status,
        quantityTotal: nextQuantityTotal,
        quantityAvailable: nextQuantityAvailable,
        purchasePrice: parseFloat(formData.purchasePrice) || 0,
        point: totalPoint,
        extraPoints: extraPointsNums.length > 0 ? extraPointsNums : undefined,
        purchaseDate: formData.purchaseDate,
        purchaseLocation: formData.purchaseLocation,
        memo: formData.memo.trim() || undefined,
        couponDiscount: couponDiscountNum > 0 ? couponDiscountNum : undefined,
        reservePointUse: reservePointUseNum > 0 ? reservePointUseNum : undefined,
        immediatePointUse: immediatePointUseNum > 0 ? immediatePointUseNum : undefined,
      };

      if (formData.status === 'sold') {
        updates.salePrice = parseFloat(formData.salePrice) || 0;
        updates.saleLocation = formData.saleLocation || '未設定';
        updates.saleDate = formData.saleDate || new Date().toISOString().split('T')[0];
      } else {
        updates.salePrice = undefined;
        updates.saleLocation = undefined;
        updates.saleDate = undefined;
      }

      await updateProductData(product.id, updates);
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(product.id);
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 flex items-end z-50" onClick={() => isDirty ? setShowLeaveConfirm(true) : onClose?.()}>
      <div className="w-full bg-white rounded-t-2xl p-6 overflow-y-auto animate-slide-in" style={{ maxHeight: '90dvh', paddingBottom: 'max(1.5rem, env(keyboard-inset-height, 0px))' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-slate-900">商品を編集</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => (isDirty ? setShowLeaveConfirm(true) : onClose?.())} className="p-2 rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">商品名</label>
            <p className="text-sm font-semibold text-slate-800 whitespace-pre-wrap break-words">{formData.productName}</p>
          </div>

          {product.janCode && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">JANコード</label>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-mono text-slate-600">{product.janCode}</p>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyToClipboard(product.janCode || '');
                    if (ok) {
                      setJanCopied(true);
                      window.setTimeout(() => setJanCopied(false), 1200);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] border border-slate-200 text-slate-600 hover:bg-slate-50"
                  title="JANをコピー"
                >
                  <Copy className="w-3 h-3" />
                  {janCopied ? 'コピーしました' : 'コピー'}
                </button>
                <button
                  type="button"
                  disabled={kaitoriLoading}
                  onClick={async () => {
                    setKaitoriLoading(true);
                    setKaitoriError('');
                    setKaitoriPrice(null);
                    try {
                      const result = await fetchKaitoriPrice(product.janCode || '');
                      if (result) {
                        const now = new Date().toISOString();
                        setKaitoriPrice(result.highestPrice);
                        setKaitoriSearchUrl(result.searchUrl);
                        setKaitoriPriceAt(now);
                        await updateProductData(product.id, {
                          kaitoriPrice: result.highestPrice,
                          kaitoriPriceAt: now,
                        });
                        if (product.janCode) {
                          await addKaitoriPriceHistory(userId, product.janCode, product.id, result.highestPrice);
                        }
                      } else {
                        setKaitoriError('価格情報が見つかりませんでした');
                      }
                    } catch {
                      setKaitoriError('取得に失敗しました');
                    } finally {
                      setKaitoriLoading(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] border border-sky-200 text-sky-600 hover:bg-sky-50"
                >
                  {kaitoriLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  買取相場を確認
                </button>
                {kaitoriPrice !== null && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    買取wiki {kaitoriPrice.toLocaleString()}円
                    {kaitoriPriceAt && (
                      <span className="font-normal text-slate-400">
                        {(() => {
                          const mins = Math.floor((Date.now() - new Date(kaitoriPriceAt).getTime()) / 60000);
                          return mins < 60 ? `取得${mins}分前` : `取得${Math.floor(mins / 60)}時間前`;
                        })()}
                      </span>
                    )}
                    <a
                      href={kaitoriSearchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-600 hover:text-sky-700"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </span>
                )}
                {kaitoriError && <span className="text-[11px] text-rose-600">{kaitoriError}</span>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">ステータス</label>
              {product.status === 'sold' ? (
                <p className="inline-flex rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  売却済み（変更不可）
                </p>
              ) : (
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, status: 'pending' })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                      formData.status === 'pending' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    未着
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, status: 'inventory' })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                      formData.status === 'inventory' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    在庫
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                残数
                <span className="ml-1 text-xs text-slate-400 font-normal">/ 総{formData.quantityTotal}</span>
              </label>
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={product.status === 'sold'}
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      quantityAvailable: String(Math.max(0, (parseInt(prev.quantityAvailable, 10) || 0) - 1)),
                    }))
                  }
                  className="w-9 h-10 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  title="残数を減らす"
                >
                  -
                </button>
                <NumericInput
                  integer
                  min={0}
                  readOnly={product.status === 'sold'}
                  value={formData.quantityAvailable}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      quantityAvailable: String(Math.max(0, parseInt(e.target.value || '0', 10) || 0)),
                    })
                  }
                  className="input-field text-center w-14 sm:w-16 px-2 h-10 py-0"
                />
                <button
                  type="button"
                  disabled={product.status === 'sold'}
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      quantityAvailable: String(Math.max(0, (parseInt(prev.quantityAvailable, 10) || 0) + 1)),
                    }))
                  }
                  className="w-9 h-10 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  title="残数を増やす"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <RichDatePicker
                label="購入日"
                value={formData.purchaseDate}
                onChange={(v) => setFormData({ ...formData, purchaseDate: v })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">購入場所</label>
              <select
                value={formData.purchaseLocation}
                onChange={(e) => setFormData({ ...formData, purchaseLocation: e.target.value })}
                className="input-field"
              >
                {purchaseLocations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="glass-panel p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  購入金額合計
                  <span className="block text-[11px] font-normal text-slate-500 mt-0.5">ポイント利用分も含む</span>
                </label>
                <NumericInput
                  integer
                  required
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  付与ポイント
                  <span className="block text-[11px] font-normal text-slate-500 mt-0.5 invisible">_</span>
                </label>
                <NumericInput
                  integer
                  value={formData.point}
                  onChange={(e) => setFormData({ ...formData, point: e.target.value })}
                  className="input-field"
                />
                {extraPoints.map((v, i) => (
                  <div key={i} className="flex items-center gap-1 mt-1">
                    <span className="text-slate-400 text-xs font-bold">+</span>
                    <NumericInput
                      integer
                      value={v}
                      onChange={(e) => {
                        const next = [...extraPoints];
                        next[i] = e.target.value;
                        setExtraPoints(next);
                      }}
                      className="input-field py-1.5 text-sm"
                      placeholder="追加P"
                    />
                    <button
                      type="button"
                      onClick={() => setExtraPoints((prev) => prev.filter((_, j) => j !== i))}
                      className="text-slate-400 hover:text-rose-500 transition text-xs px-1"
                    >✕</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setExtraPoints((prev) => [...prev, ''])}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-semibold"
                >
                  <Plus className="w-3 h-3" />
                  追加P入力
                </button>
                {extraPoints.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    合計: <span className="font-semibold text-slate-700">
                      {(parseFloat(formData.point) || 0) + extraPoints.reduce((s, p) => s + (parseFloat(p) || 0), 0)} P
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-xl bg-white/60 border border-white/80 px-3 py-2 flex items-center justify-between">
              <span className="text-sm text-slate-600">実質原価</span>
              <div className="text-right">
                {(() => {
                  const purchase = parseFloat(formData.purchasePrice) || 0;
                  const earned = (parseFloat(formData.point) || 0) + extraPoints.reduce((s, p) => s + (parseFloat(p) || 0), 0);
                  const total = Math.max(1, parseInt(formData.quantityTotal, 10) || 1);
                  const effectiveCost = purchase - earned;
                  return (
                    <>
                      <span className="text-base font-bold text-slate-900">
                        {effectiveCost.toLocaleString('ja-JP')} 円
                      </span>
                      {total > 1 && (
                        <span className="block text-xs text-slate-500 font-semibold">
                          1個あたり {Math.round(effectiveCost / total).toLocaleString('ja-JP')} 円
                        </span>
                      )}
                      <span className="block text-[11px] text-slate-400">購入金額 - 付与P</span>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* 割引・ポイント使用内訳 */}
          <div>
            <button
              type="button"
              onClick={() => setShowDiscount((v) => !v)}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 transition"
            >
              {showDiscount ? '▲ 割引・ポイント使用内訳を閉じる' : '▼ クーポン・ポイント使用内訳を入力'}
            </button>
            {showDiscount && (
              <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-3">
                <p className="text-xs text-orange-700 font-semibold">購入金額（クーポン後）から差し引く項目を入力してください</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">保有ポイント使用</label>
                    <NumericInput
                      integer
                      value={reservePointUse}
                      onChange={(e) => setReservePointUse(e.target.value)}
                      className="input-field py-1.5 text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      今すぐポイント使用
                      <span className="ml-1 text-[10px] text-orange-500 font-semibold">Yahoo限定</span>
                    </label>
                    <NumericInput
                      integer
                      value={immediatePointUse}
                      onChange={(e) => setImmediatePointUse(e.target.value)}
                      className="input-field py-1.5 text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    クーポン値引き
                    <span className="ml-1 text-[10px] text-slate-400">（記録のみ・購入金額に既に反映済み）</span>
                  </label>
                  <NumericInput
                    integer
                    value={couponDiscount}
                    onChange={(e) => setCouponDiscount(e.target.value)}
                    className="input-field py-1.5 text-sm"
                    placeholder="0"
                  />
                </div>
                {(() => {
                  const purchase = parseFloat(formData.purchasePrice) || 0;
                  const reserve = parseFloat(reservePointUse) || 0;
                  const immediate = parseFloat(immediatePointUse) || 0;
                  const coupon = parseFloat(couponDiscount) || 0;
                  const actualCost = purchase - reserve - immediate;
                  const listPrice = purchase + coupon;
                  return (
                    <div className="rounded-lg bg-white/70 px-3 py-2 space-y-1 text-xs">
                      {coupon > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>元値（参考）</span>
                          <span>¥{listPrice.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-500">
                        <span>購入金額（クーポン後）</span>
                        <span>¥{purchase.toLocaleString()}</span>
                      </div>
                      {reserve > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>保有P使用</span>
                          <span>- ¥{reserve.toLocaleString()}</span>
                        </div>
                      )}
                      {immediate > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>今すぐP使用</span>
                          <span>- ¥{immediate.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-slate-800 border-t border-slate-200 pt-1">
                        <span>仕入れ原価</span>
                        <span>¥{actualCost.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {product.purchaseBreakdown && (
            <div className="glass-panel p-3 space-y-2">
              <p className="text-sm font-semibold text-slate-700">支払い内訳（登録時）</p>
              {product.purchaseBreakdown.cash > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">現金</span>
                  <span className="font-medium text-slate-800">{product.purchaseBreakdown.cash.toLocaleString('ja-JP')} 円</span>
                </div>
              )}
              {product.purchaseBreakdown.giftCardUsages.map((u, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-600">{u.brand} ギフトカード</span>
                  <div className="text-right">
                    <span className="font-medium text-slate-800">{u.amount.toLocaleString('ja-JP')} 円</span>
                    <span className="block text-[11px] text-slate-400">実コスト {u.realCost.toLocaleString('ja-JP')} 円</span>
                  </div>
                </div>
              ))}
              {product.purchaseBreakdown.pointUse > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">ポイント支払い</span>
                  <span className="font-medium text-slate-800">{product.purchaseBreakdown.pointUse.toLocaleString('ja-JP')} P</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">メモ</label>
            <textarea
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              className="input-field resize-none"
              rows={2}
              placeholder="任意（仕入れ条件・状態など）"
            />
          </div>

          {formData.status === 'sold' && (
            <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 space-y-4">
              <p className="text-base font-bold text-emerald-800">売却情報</p>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">売却価格</label>
                <NumericInput
                  integer
                  value={formData.salePrice}
                  onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                  className="input-field text-lg font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <RichDatePicker
                    label="売却日"
                    value={formData.saleDate}
                    onChange={(v) => setFormData({ ...formData, saleDate: v })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">売却先</label>
                  <input
                    type="text"
                    value={formData.saleLocation}
                    onChange={(e) => setFormData({ ...formData, saleLocation: e.target.value })}
                    className="input-field"
                    placeholder="例: メルカリ"
                    list="sale-location-list"
                  />
                  <datalist id="sale-location-list">
                    {purchaseLocations.map((loc) => <option key={loc} value={loc} />)}
                  </datalist>
                </div>
              </div>
              {formData.salePrice && (
                <div className="rounded-xl bg-white/70 px-3 py-2 flex items-center justify-between">
                  <span className="text-sm text-slate-600">利益</span>
                  <span className={`text-lg font-black ${(parseFloat(formData.salePrice) - (product.purchasePrice)) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    ¥{(parseFloat(formData.salePrice) - (product.purchasePrice - (product.point ?? 0))).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>}

          <div className="sticky bottom-0 bg-white/95 backdrop-blur pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 transition disabled:opacity-60"
            >
              <Trash2 className="w-4 h-4" />
              削除
            </button>
            <button type="submit" disabled={loading} className="btn-primary w-full inline-flex items-center justify-center gap-2">
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </form>
      </div>
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm space-y-3">
            <p className="text-sm font-semibold text-slate-900">未保存の変更があります。閉じますか？</p>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700" onClick={() => setShowLeaveConfirm(false)}>戻る</button>
              <button className="px-3 py-2 rounded-lg bg-rose-600 text-white" onClick={() => onClose?.()}>破棄して閉じる</button>
            </div>
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm space-y-3">
            <p className="text-sm font-semibold text-slate-900">「{product.productName}」を削除します。元に戻せません。</p>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700" onClick={() => setShowDeleteConfirm(false)}>キャンセル</button>
              <button className="px-3 py-2 rounded-lg bg-rose-600 text-white" onClick={handleDelete}>削除する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
