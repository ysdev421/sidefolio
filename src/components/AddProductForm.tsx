import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Loader, Plus, X } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import {
  getJanMasterByCode,
  getUserPurchaseLocations,
  getUserProductTemplates,
  upsertJanMaster,
  upsertProductTemplate,
} from '@/lib/firestore';
import { useStore } from '@/lib/store';
import type { ProductTemplate } from '@/types';
import { JanScannerModal } from '@/components/JanScannerModal';

interface AddProductFormProps {
  userId: string;
  onClose?: () => void;
  defaultChannel?: 'ebay' | 'kaitori';
  lockChannel?: boolean;
}

const normalizeJanCode = (value: string) => value.replace(/\D/g, '').trim();

export function AddProductForm({ userId, onClose, defaultChannel = 'ebay', lockChannel = false }: AddProductFormProps) {
  const lookupSeqRef = useRef(0);
  const [formData, setFormData] = useState({
    janCode: '',
    productName: '',
    quantity: '1',
    purchasePrice: '',
    purchasePointUsed: '',
    point: '',
    channel: defaultChannel as 'ebay' | 'kaitori',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchaseLocation: 'メルカリ',
  });

  const [error, setError] = useState('');
  const [janHint, setJanHint] = useState('');
  const [janLookupLoading, setJanLookupLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [mobileCameraEnabled, setMobileCameraEnabled] = useState(false);
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [purchaseLocations, setPurchaseLocations] = useState<string[]>(['メルカリ']);
  const { createProduct } = useProducts(userId);
  const loading = useStore((state) => state.loading);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const rows = await getUserProductTemplates(userId);
        setTemplates(rows);
      } catch {
        setTemplates([]);
      }
    };
    loadTemplates();
  }, [userId]);

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

  useEffect(() => {
    setFormData((prev) => ({ ...prev, channel: defaultChannel }));
  }, [defaultChannel]);

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
    const hasCameraApi =
      typeof navigator !== 'undefined' &&
      typeof window !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function';

    setMobileCameraEnabled(isMobile && hasCameraApi);
  }, []);

  const fillProductNameByJan = async (janInput: string) => {
    const janCode = normalizeJanCode(janInput);
    setFormData((prev) => ({ ...prev, janCode }));
    setJanHint('');

    if (!janCode) return;

    const template = templates.find((t) => normalizeJanCode(t.janCode || '') === janCode);
    if (template?.productName) {
      setFormData((prev) => ({
        ...prev,
        janCode,
        productName: template.productName,
        purchaseLocation: template.purchaseLocation || prev.purchaseLocation,
        channel: lockChannel ? defaultChannel : template.channel === 'kaitori' ? 'kaitori' : 'ebay',
        purchasePrice:
          typeof template.lastPurchasePrice === 'number' ? String(template.lastPurchasePrice) : prev.purchasePrice,
        purchasePointUsed:
          typeof template.lastPurchasePointUsed === 'number'
            ? String(template.lastPurchasePointUsed)
            : prev.purchasePointUsed,
        point: typeof template.lastPoint === 'number' ? String(template.lastPoint) : prev.point,
      }));
      setJanHint('過去データから商品名を補完しました');
      return;
    }

    if (janCode.length < 8) return;

    const seq = ++lookupSeqRef.current;
    setJanLookupLoading(true);
    try {
      const row = await getJanMasterByCode(janCode);
      if (seq !== lookupSeqRef.current) return;
      if (row?.productName) {
        setFormData((prev) => ({ ...prev, janCode, productName: row.productName }));
        setJanHint('JANマスターから商品名を補完しました');
      } else {
        setJanHint('JANマスターに未登録です。商品名を入力してください');
      }
    } catch {
      if (seq === lookupSeqRef.current) {
        setJanHint('JAN照会に失敗しました。商品名を入力してください');
      }
    } finally {
      if (seq === lookupSeqRef.current) setJanLookupLoading(false);
    }
  };

  const applyTemplate = (template: ProductTemplate) => {
    setFormData((prev) => ({
      ...prev,
      janCode: template.janCode || prev.janCode,
      productName: template.productName || prev.productName,
      purchaseLocation: template.purchaseLocation || prev.purchaseLocation,
      channel: lockChannel ? defaultChannel : template.channel === 'kaitori' ? 'kaitori' : 'ebay',
      purchasePrice:
        typeof template.lastPurchasePrice === 'number' ? String(template.lastPurchasePrice) : prev.purchasePrice,
      purchasePointUsed:
        typeof template.lastPurchasePointUsed === 'number'
          ? String(template.lastPurchasePointUsed)
          : prev.purchasePointUsed,
      point: typeof template.lastPoint === 'number' ? String(template.lastPoint) : prev.point,
    }));
  };

  const candidateTemplates = useMemo(() => {
    const janQuery = formData.janCode.trim();
    const nameQuery = formData.productName.trim().toLowerCase();
    if (!janQuery && !nameQuery) return templates.slice(0, 5);

    return templates
      .filter((t) => {
        const hitJan = janQuery && t.janCode?.includes(janQuery);
        const hitName = nameQuery && t.productName.toLowerCase().includes(nameQuery);
        return Boolean(hitJan || hitName);
      })
      .slice(0, 5);
  }, [templates, formData.janCode, formData.productName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const qty = Math.max(1, parseInt(formData.quantity, 10) || 1);
      const purchasePrice = parseFloat(formData.purchasePrice);
      const purchasePointUsed = parseFloat(formData.purchasePointUsed) || 0;
      const point = parseFloat(formData.point) || 0;

      await createProduct({
        janCode: formData.janCode.trim() || undefined,
        productName: formData.productName,
        quantityTotal: qty,
        quantityAvailable: qty,
        channel: formData.channel,
        purchasePrice,
        purchasePointUsed,
        point,
        purchaseDate: formData.purchaseDate,
        purchaseLocation: formData.purchaseLocation,
        status: 'pending',
      });

      await upsertProductTemplate(userId, {
        janCode: formData.janCode.trim() || undefined,
        productName: formData.productName,
        purchaseLocation: formData.purchaseLocation,
        channel: formData.channel,
        purchasePrice,
        purchasePointUsed,
        point,
      });

      await upsertJanMaster({
        janCode: formData.janCode.trim() || undefined,
        productName: formData.productName,
      });

      setFormData({
        janCode: '',
        productName: '',
        quantity: '1',
        purchasePrice: '',
        purchasePointUsed: '',
        point: '',
        channel: defaultChannel,
        purchaseDate: new Date().toISOString().split('T')[0],
        purchaseLocation: purchaseLocations[0] || 'メルカリ',
      });
      setJanHint('');
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="w-full bg-white rounded-t-2xl p-6 max-h-[90vh] overflow-y-auto animate-slide-in">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">商品を追加</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">JAN</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={formData.janCode}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData((prev) => ({ ...prev, janCode: value }));
                }}
                onBlur={() => fillProductNameByJan(formData.janCode)}
                className="input-field"
                placeholder="例: 4901234567890"
                inputMode="numeric"
              />
              {mobileCameraEnabled && (
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  title="カメラで読み取り"
                >
                  <Camera className="w-4 h-4" />
                  読取
                </button>
              )}
            </div>
            {(janHint || janLookupLoading) && (
              <p className={`mt-1 text-xs ${janLookupLoading ? 'text-slate-500' : 'text-slate-600'}`}>
                {janLookupLoading ? 'JANを照会中...' : janHint}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">商品名 *</label>
            <input
              type="text"
              value={formData.productName}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({ ...formData, productName: value });
                const matched = templates.find((t) => t.productName === value.trim());
                if (matched) applyTemplate(matched);
              }}
              required
              className="input-field"
              placeholder="例: チェキフィルム"
            />
            {candidateTemplates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {candidateTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="px-2 py-1 rounded-lg text-xs border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition"
                    title={t.janCode ? `JAN: ${t.janCode}` : t.productName}
                  >
                    {t.productName}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">数量 *</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      quantity: String(Math.max(1, (parseInt(prev.quantity, 10) || 1) - 1)),
                    }))
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                  title="数量を減らす"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      quantity: String(Math.max(1, parseInt(e.target.value || '1', 10) || 1)),
                    })
                  }
                  required
                  className="input-field text-center"
                  placeholder="1"
                />
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      quantity: String(Math.max(1, (parseInt(prev.quantity, 10) || 1) + 1)),
                    }))
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                  title="数量を増やす"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">購入価格 *</label>
              <input
                type="number"
                value={formData.purchasePrice}
                onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                required
                className="input-field"
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">支払いポイント利用</label>
              <input
                type="number"
                value={formData.purchasePointUsed}
                onChange={(e) => setFormData({ ...formData, purchasePointUsed: e.target.value })}
                className="input-field"
                placeholder="0"
              />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">付与ポイント</label>
            <input
              type="number"
              value={formData.point}
              onChange={(e) => setFormData({ ...formData, point: e.target.value })}
              className="input-field"
              placeholder="0"
            />
            </div>
          </div>

          <div className="glass-panel p-3 text-sm">
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
            <p className="text-xs text-slate-500 mt-1">購入価格 + 支払いポイント利用 - 付与ポイント</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">購入日</label>
            <input
              type="date"
              value={formData.purchaseDate}
              onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">購入場所</label>
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

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-6 py-3">
            {loading && <Loader className="w-5 h-5 animate-spin" />}
            <Plus className="w-5 h-5" />
            商品を追加
          </button>
        </form>
      </div>

      {showScanner && (
        <JanScannerModal
          onClose={() => setShowScanner(false)}
          onDetected={(code) => {
            setShowScanner(false);
            fillProductNameByJan(code);
          }}
        />
      )}
    </div>
  );
}
