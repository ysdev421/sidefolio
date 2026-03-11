import { useEffect, useState } from 'react';
import { Loader, Save, Trash2, X } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useStore } from '@/lib/store';
import { getUserPurchaseLocations } from '@/lib/firestore';
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
  const [showChannelField, setShowChannelField] = useState(false);
  const [showCostDetails, setShowCostDetails] = useState(false);
  const [purchaseLocations, setPurchaseLocations] = useState<string[]>(['メルカリ']);

  const [formData, setFormData] = useState({
    productName: product.productName,
    quantityTotal: String(product.quantityTotal || 1),
    quantityAvailable: String(product.quantityAvailable || product.quantityTotal || 1),
    channel: (product.channel === 'kaitori' ? 'kaitori' : 'ebay') as 'ebay' | 'kaitori',
    purchasePrice: String(product.purchasePrice),
    purchasePointUsed: String(product.purchasePointUsed || 0),
    point: String(product.point),
    purchaseDate: product.purchaseDate,
    purchaseLocation: product.purchaseLocation,
    salePrice: product.salePrice ? String(product.salePrice) : '',
    saleLocation: product.saleLocation || '',
    saleDate: product.saleDate || '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const rows = await getUserPurchaseLocations(userId);
        setPurchaseLocations(rows.length > 0 ? rows : ['メルカリ']);
        setFormData((prev) => ({
          ...prev,
          purchaseLocation:
            prev.purchaseLocation && rows.includes(prev.purchaseLocation)
              ? prev.purchaseLocation
              : rows[0] || 'メルカリ',
        }));
      } catch {
        setPurchaseLocations(['メルカリ']);
      }
    };
    loadLocations();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const updates: Partial<Product> = {
        productName: formData.productName,
        quantityTotal: Math.max(1, parseInt(formData.quantityTotal, 10) || 1),
        quantityAvailable: Math.max(0, parseInt(formData.quantityAvailable, 10) || 0),
        channel: formData.channel,
        purchasePrice: parseFloat(formData.purchasePrice) || 0,
        purchasePointUsed: parseFloat(formData.purchasePointUsed) || 0,
        point: parseFloat(formData.point) || 0,
        purchaseDate: formData.purchaseDate,
        purchaseLocation: formData.purchaseLocation,
      };

      if (product.status === 'sold') {
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
    const ok = window.confirm(`「${product.productName}」を削除します。元に戻せません。`);
    if (!ok) return;
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
            <button
              type="button"
              onClick={() => setShowChannelField((v) => !v)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 transition"
            >
              {showChannelField ? '販路変更を閉じる' : '販路を変更する'}
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!showChannelField && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">商品名</label>
                <input
                  type="text"
                  required
                  value={formData.productName}
                  onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">総数量</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          quantityTotal: String(Math.max(1, (parseInt(prev.quantityTotal, 10) || 1) - 1)),
                        }))
                      }
                      className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                      title="総数量を減らす"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={formData.quantityTotal}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          quantityTotal: String(Math.max(1, parseInt(e.target.value || '1', 10) || 1)),
                        })
                      }
                      className="input-field text-center"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          quantityTotal: String(Math.max(1, (parseInt(prev.quantityTotal, 10) || 1) + 1)),
                        }))
                      }
                      className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                      title="総数量を増やす"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">残数</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          quantityAvailable: String(Math.max(0, (parseInt(prev.quantityAvailable, 10) || 0) - 1)),
                        }))
                      }
                      className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                      title="残数を減らす"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={formData.quantityAvailable}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          quantityAvailable: String(Math.max(0, parseInt(e.target.value || '0', 10) || 0)),
                        })
                      }
                      className="input-field text-center"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          quantityAvailable: String(Math.max(0, (parseInt(prev.quantityAvailable, 10) || 0) + 1)),
                        }))
                      }
                      className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                      title="残数を増やす"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">購入金額合計</label>
                  <input
                    type="number"
                    required
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">付与ポイント</label>
                  <input
                    type="number"
                    value={formData.point}
                    onChange={(e) => setFormData({ ...formData, point: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowCostDetails((v) => !v)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition text-sm"
                >
                  {showCostDetails ? '内訳入力を閉じる' : '内訳入力を開く（任意）'}
                </button>

                {showCostDetails && (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">支払いP利用</label>
                      <input
                        type="number"
                        value={formData.purchasePointUsed}
                        onChange={(e) => setFormData({ ...formData, purchasePointUsed: e.target.value })}
                        className="input-field"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="glass-panel p-3 text-sm">
                <p className="text-slate-700">
                  実支払額:
                  <span className="ml-2 font-bold text-slate-900">
                    {(() => {
                      const purchase = parseFloat(formData.purchasePrice) || 0;
                      const used = parseFloat(formData.purchasePointUsed) || 0;
                      return `${purchase + used} 円`;
                    })()}
                  </span>
                </p>
                <p className="text-slate-700">
                  実質原価:
                  <span className="ml-2 font-bold text-slate-900">
                    {(() => {
                      const purchase = parseFloat(formData.purchasePrice) || 0;
                      const used = parseFloat(formData.purchasePointUsed) || 0;
                      const earned = parseFloat(formData.point) || 0;
                      return `${purchase + used - earned} 円`;
                    })()}
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  購入金額合計 + 支払いP利用 - 付与ポイント
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">購入日</label>
                  <input
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div />
              </div>
            </>
          )}

          {showChannelField && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">販路</label>
              <select
                value={formData.channel}
                onChange={(e) => setFormData({ ...formData, channel: e.target.value as 'ebay' | 'kaitori' })}
                className="input-field"
              >
                <option value="ebay">eBay</option>
                <option value="kaitori">買取流し</option>
              </select>
            </div>
          )}

          {!showChannelField && (
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
          )}

          {!showChannelField && product.status === 'sold' && (
            <div className="glass-panel p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-800">売却情報</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">売却価格</label>
                  <input
                    type="number"
                    value={formData.salePrice}
                    onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">売却日</label>
                  <input
                    type="date"
                    value={formData.saleDate}
                    onChange={(e) => setFormData({ ...formData, saleDate: e.target.value })}
                    className="input-field"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            <button
              type="button"
              onClick={handleDelete}
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
    </div>
  );
}

