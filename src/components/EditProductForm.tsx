import { useEffect, useState } from 'react';
import { Copy, Loader, Plus, Save, Trash2, X } from 'lucide-react';
import { NumericInput } from '@/components/NumericInput';
import { RichDatePicker } from '@/components/RichDatePicker';
import { useProducts } from '@/hooks/useProducts';
import { useStore } from '@/lib/store';
import { getPurchaseLocationUsageCounts, getUserPurchaseLocations } from '@/lib/firestore';
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
  const [purchaseLocations, setPurchaseLocations] = useState<string[]>(['メルカリ']);
  const [janCopied, setJanCopied] = useState(false);

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
      const updates: Partial<Product> = {
        status: formData.status,
        quantityAvailable: Math.max(0, parseInt(formData.quantityAvailable, 10) || 0),
        purchasePrice: parseFloat(formData.purchasePrice) || 0,
        point: totalPoint,
        extraPoints: extraPointsNums.length > 0 ? extraPointsNums : undefined,
        purchaseDate: formData.purchaseDate,
        purchaseLocation: formData.purchaseLocation,
        memo: formData.memo.trim() || undefined,
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
    <div className="fixed inset-0 bg-black/45 flex items-end z-50">
      <div className="w-full bg-white rounded-t-2xl p-6 max-h-[90vh] overflow-y-auto animate-slide-in">
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
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono text-slate-600">{product.janCode}</p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(product.janCode || '');
                      setJanCopied(true);
                      window.setTimeout(() => setJanCopied(false), 1200);
                    } catch { /* noop */ }
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] border border-slate-200 text-slate-600 hover:bg-slate-50"
                  title="JANをコピー"
                >
                  <Copy className="w-3 h-3" />
                  {janCopied ? 'コピーしました' : 'コピー'}
                </button>
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
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      quantityAvailable: String(Math.max(0, (parseInt(prev.quantityAvailable, 10) || 0) - 1)),
                    }))
                  }
                  className="w-9 h-10 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                  title="残数を減らす"
                >
                  -
                </button>
                <NumericInput
                  integer
                  min={0}
                  value={formData.quantityAvailable}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      quantityAvailable: String(Math.max(0, parseInt(e.target.value || '0', 10) || 0)),
                    })
                  }
                  className="input-field text-center w-14 sm:w-16 px-2"
                />
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      quantityAvailable: String(Math.max(0, (parseInt(prev.quantityAvailable, 10) || 0) + 1)),
                    }))
                  }
                  className="w-9 h-10 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
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

          <div className="glass-panel p-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">購入金額合計</label>
                <p className="text-[11px] text-slate-500 mb-1">ポイント利用分も含めた合計額</p>
                <NumericInput
                  integer
                  required
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">付与ポイント（通常）</label>
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
                      placeholder="追加P（スクラッチ等）"
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
                  追加P入力（スクラッチ等）
                </button>
                {extraPoints.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    合計: <span className="font-semibold text-slate-700">
                      {(parseFloat(formData.point) || 0) + extraPoints.reduce((s, p) => s + (parseFloat(p) || 0), 0)} P
                    </span>
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-white/70 border border-white/70 p-3 text-sm">
                <p className="text-slate-700">
                  実質原価:
                  <span className="ml-2 font-bold text-slate-900">
                    {(() => {
                      const purchase = parseFloat(formData.purchasePrice) || 0;
                      const earned = (parseFloat(formData.point) || 0) + extraPoints.reduce((s, p) => s + (parseFloat(p) || 0), 0);
                      return `${purchase - earned} 円`;
                    })()}
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-1">購入金額 - 付与ポイント</p>
              </div>
            </div>
          </div>

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
            <div className="glass-panel p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-800">売却情報</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">売却価格</label>
                  <NumericInput
                    integer
                    value={formData.salePrice}
                    onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <RichDatePicker
                    label="売却日"
                    value={formData.saleDate}
                    onChange={(v) => setFormData({ ...formData, saleDate: v })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">売却先</label>
                <input
                  type="text"
                  value={formData.saleLocation}
                  onChange={(e) => setFormData({ ...formData, saleLocation: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>
          )}

          {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>}

          <div className="sticky bottom-0 bg-white/95 backdrop-blur py-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
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
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
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
