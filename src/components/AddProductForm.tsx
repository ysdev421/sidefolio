import { useEffect, useState } from 'react';
import { Camera, ExternalLink, Loader, Plus, X } from 'lucide-react';
import { NumericInput } from '@/components/NumericInput';
import { RichDatePicker } from '@/components/RichDatePicker';
import { useProducts } from '@/hooks/useProducts';
import {
  getPurchaseLocationUsageCounts,
  getUserProductMasters,
  getUserPurchaseLocations,
  getUserProductTemplates,
  upsertJanMaster,
  upsertProductTemplate,
  upsertUserJanUsage,
} from '@/lib/firestore';
import { useStore } from '@/lib/store';
import type { ProductMaster, ProductTemplate } from '@/types';
import { JanScannerModal } from '@/components/JanScannerModal';

interface AddProductFormProps {
  userId: string;
  initialJanCode?: string;
  initialProductName?: string;
  onClose?: () => void;
  onGoToMaster?: (janCode: string, productName: string) => void;
}

const normalizeJanCode = (value: string) => value.replace(/\D/g, '').trim();

export function AddProductForm({ userId, initialJanCode, initialProductName, onClose, onGoToMaster }: AddProductFormProps) {
  const isKaitori = true;
  const [formData, setFormData] = useState({
    janCode: '',
    productName: '',
    initialStatus: 'pending' as 'pending' | 'inventory',
    quantity: '1',
    purchasePrice: '0',
    point: '0',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchaseLocation: '',
    memo: '',
  });

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [janHint, setJanHint] = useState('');
  const [janNotFound, setJanNotFound] = useState(false);
  const [extraPoints, setExtraPoints] = useState<string[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [mobileCameraEnabled, setMobileCameraEnabled] = useState(false);
  const [kaitoriLookup, setKaitoriLookup] = useState('');
  const [kaitoriCandidates, setKaitoriCandidates] = useState<ProductMaster[]>([]);
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [masters, setMasters] = useState<ProductMaster[]>([]);
  const [purchaseLocations, setPurchaseLocations] = useState<string[]>(['メルカリ']);
  const { createProduct } = useProducts(userId);
  const loading = useStore((state) => state.loading);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const [templateRows, masterRows] = await Promise.all([
          getUserProductTemplates(userId),
          getUserProductMasters(userId),
        ]);
        setTemplates(templateRows);
        setMasters(masterRows);
      } catch {
        setTemplates([]);
        setMasters([]);
      }
    };
    loadTemplates();
  }, [userId]);

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

  useEffect(() => {
    const normalizedJan = normalizeJanCode(initialJanCode || '');
    const normalizedName = (initialProductName || '').trim();
    if (!normalizedJan && !normalizedName) return;

    const matchedMaster = normalizedJan
      ? masters.find((m) => normalizeJanCode(m.janCode) === normalizedJan)
      : null;
    const matchedTemplate = normalizedJan
      ? templates.find((t) => normalizeJanCode(t.janCode || '') === normalizedJan)
      : null;
    const resolvedName = normalizedName || matchedMaster?.productName || '';

    setFormData((prev) => {
      const nextJan = normalizedJan || prev.janCode;
      const nextName = resolvedName || prev.productName;
      const nextLocation = matchedTemplate?.purchaseLocation || prev.purchaseLocation;
      if (
        prev.janCode === nextJan &&
        prev.productName === nextName &&
        prev.purchaseLocation === nextLocation
      ) {
        return prev;
      }
      return {
        ...prev,
        janCode: nextJan,
        productName: nextName,
        purchaseLocation: nextLocation,
      };
    });
    setKaitoriLookup(normalizedJan || resolvedName);
    setJanNotFound(false);
    setJanHint(resolvedName ? '商品マスタ登録内容を反映しました' : '');
  }, [initialJanCode, initialProductName, masters, templates]);

  const fillProductNameByJan = async (janInput: string) => {
    const janCode = normalizeJanCode(janInput);
    setFormData((prev) => ({ ...prev, janCode }));
    setJanHint('');
    setJanNotFound(false);

    if (!janCode) return;

    const master = masters.find((m) => normalizeJanCode(m.janCode) === janCode);
    if (master) {
      const template = templates.find((t) => normalizeJanCode(t.janCode || '') === janCode);
      setFormData((prev) => ({
        ...prev,
        janCode,
        productName: master.productName,
        purchaseLocation: template?.purchaseLocation || prev.purchaseLocation,
      }));
      setJanHint('商品マスタから商品名を補完しました');
      return;
    }

    setFormData((prev) => ({ ...prev, productName: '' }));
    setJanHint('商品マスタに未登録です');
    setJanNotFound(true);
  };

  const applyMaster = (master: ProductMaster) => {
    const template = templates.find((t) => normalizeJanCode(t.janCode || '') === normalizeJanCode(master.janCode));
    setFormData((prev) => ({
      ...prev,
      janCode: normalizeJanCode(master.janCode),
      productName: master.productName || prev.productName,
      purchaseLocation: template?.purchaseLocation || prev.purchaseLocation,
    }));
  };

  const resolveKaitoriLookup = async (keywordInput: string) => {
    const keyword = keywordInput.trim();
    setKaitoriCandidates([]);
    if (!keyword) return;

    const normalized = normalizeJanCode(keyword);
    if (normalized.length >= 8) {
      await fillProductNameByJan(normalized);
      return;
    }

    const hits = masters
      .filter((t) => t.productName.toLowerCase().includes(keyword.toLowerCase()))
      .slice(0, 5);
    setKaitoriCandidates(hits);

    if (hits.length === 1) {
      applyMaster(hits[0]);
      setJanHint('候補を1件適用しました');
      return;
    }

    if (hits.length === 0) {
      setJanHint('候補が見つかりません');
      setJanNotFound(true);
    } else {
      setJanHint('候補から商品を選択してください');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    try {
      const normalizedJan = normalizeJanCode(formData.janCode);
      const matchedMaster = masters.find(
        (m) =>
          normalizeJanCode(m.janCode) === normalizedJan &&
          m.productName.trim() === formData.productName.trim()
      );
      const nextFieldErrors: Record<string, string> = {};
      if (!formData.purchasePrice.trim()) nextFieldErrors.purchasePrice = '購入金額は必須です';
      if (!formData.productName.trim()) nextFieldErrors.productName = '商品名は必須です';
      if (!matchedMaster) nextFieldErrors.productName = '商品マスタ管理でJAN/商品名を登録してください';
      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
        setError('未入力または未確定の項目があります');
        return;
      }

      const qty = Math.max(1, parseInt(formData.quantity, 10) || 1);
      const purchasePrice = parseFloat(formData.purchasePrice);
      const extraPointsNums = extraPoints.map((p) => parseFloat(p) || 0).filter((v) => v !== 0);
      const point = (parseFloat(formData.point) || 0) + extraPointsNums.reduce((s, v) => s + v, 0);

      await createProduct({
        ...(normalizedJan ? { janCode: normalizedJan } : {}),
        productName: formData.productName,
        quantityTotal: qty,
        quantityAvailable: qty,
        purchasePrice,
        point,
        ...(extraPointsNums.length > 0 ? { extraPoints: extraPointsNums } : {}),
        purchaseDate: formData.purchaseDate,
        purchaseLocation: formData.purchaseLocation,
        status: formData.initialStatus,
        ...(formData.memo.trim() ? { memo: formData.memo.trim() } : {}),
      });

      await upsertProductTemplate(userId, {
        ...(normalizedJan ? { janCode: normalizedJan } : {}),
        productName: formData.productName,
        purchaseLocation: formData.purchaseLocation,
        purchasePrice,
        point,
      });

      await upsertJanMaster({
        ...(normalizedJan ? { janCode: normalizedJan } : {}),
        productName: formData.productName,
      });
      await upsertUserJanUsage(userId, {
        ...(normalizedJan ? { janCode: normalizedJan } : {}),
        productName: formData.productName,
      });

      setFormData({
        janCode: '',
        productName: '',
        initialStatus: 'pending',
        quantity: '1',
        purchasePrice: '0',
        point: '0',
        purchaseDate: new Date().toISOString().split('T')[0],
        purchaseLocation: purchaseLocations[0] || 'メルカリ',
        memo: '',
      });
      setJanHint('');
      setExtraPoints([]);
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました');
    }
  };

  const isDirty = !!kaitoriLookup || formData.purchasePrice !== '0' || !!formData.memo;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto" onClick={() => isDirty ? setShowLeaveConfirm(true) : onClose?.()}>
      <div className="min-h-full w-full flex items-end pt-12">
        <div className="w-full bg-white rounded-t-2xl p-6 animate-slide-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">商品を追加</h2>
          <button onClick={() => isDirty ? setShowLeaveConfirm(true) : onClose?.()} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isKaitori && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                商品名 or JAN検索
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={kaitoriLookup}
                  onChange={(e) => {
                    const value = e.target.value;
                    setKaitoriLookup(value);
                  }}
                  onBlur={() => resolveKaitoriLookup(kaitoriLookup)}
                  className="input-field"
                  placeholder="例: 4901234567890 / 商品名"
                />
                <button
                  type="button"
                  onClick={() => resolveKaitoriLookup(kaitoriLookup)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  検索
                </button>
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
              {janHint && (
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-slate-600">{janHint}</p>
                  {janNotFound && onGoToMaster && (
                    <button
                      type="button"
                      onClick={() => {
                        const isJan = /^\d{8,13}$/.test(kaitoriLookup.trim());
                        onGoToMaster(formData.janCode, isJan ? '' : kaitoriLookup.trim());
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700 underline underline-offset-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                      商品マスタに登録する
                    </button>
                  )}
                </div>
              )}
              {fieldErrors.janCode && <p className="mt-1 text-xs text-rose-600">{fieldErrors.janCode}</p>}
{kaitoriCandidates.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {kaitoriCandidates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        applyMaster(t);
                        setKaitoriCandidates([]);
                        setJanHint('候補を適用しました');
                      }}
                      className="px-2 py-1 rounded-lg text-xs border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition"
                    >
                      {t.productName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">商品名 <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white tracking-wide align-middle">必須</span></label>
            <input
              type="text"
              value={formData.productName}
              readOnly
              required
              className="input-field bg-slate-50 text-slate-700"
              placeholder="例: チェキフィルム"
            />
            {fieldErrors.productName && <p className="mt-1 text-xs text-rose-600">{fieldErrors.productName}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ステータス</label>
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, initialStatus: 'pending' })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                    formData.initialStatus === 'pending' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  未着
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, initialStatus: 'inventory' })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                    formData.initialStatus === 'inventory' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  在庫
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">数量 <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white tracking-wide align-middle">必須</span></label>
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      quantity: String(Math.max(1, (parseInt(prev.quantity, 10) || 1) - 1)),
                    }))
                  }
                  className="w-9 h-10 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                  title="数量を減らす"
                >
                  -
                </button>
                <NumericInput
                  integer
                  min={1}
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      quantity: String(Math.max(1, parseInt(e.target.value || '1', 10) || 1)),
                    })
                  }
                  required
                  className="input-field text-center w-14 sm:w-16 px-2 h-10 py-0"
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
                  className="w-9 h-10 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                  title="数量を増やす"
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
          </div>

          <div className="glass-panel p-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">購入金額合計 <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white tracking-wide align-middle">必須</span> <span className="font-normal text-[11px] text-slate-500">ポイント利用分も含む</span></label>
                <NumericInput
                  integer
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                  required
                  className="input-field"
                  placeholder="0"
                />
                {fieldErrors.purchasePrice && <p className="mt-1 text-xs text-rose-600">{fieldErrors.purchasePrice}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">付与ポイント</label>
                <NumericInput
                  integer
                  value={formData.point}
                  onChange={(e) => setFormData({ ...formData, point: e.target.value })}
                  className="input-field"
                  placeholder="0"
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
                  className="mt-1.5 text-xs text-sky-600 hover:text-sky-700 font-semibold"
                >
                  ＋ 追加P入力
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
                      return `${(purchase - earned).toLocaleString('ja-JP')} 円`;
                    })()}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">購入金額 - 付与ポイント</span>
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">メモ</label>
            <textarea
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              className="input-field resize-none"
              rows={2}
              placeholder="任意（仕入れ条件・状態など）"
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-6 py-3">
            {loading && <Loader className="w-5 h-5 animate-spin" />}
            <Plus className="w-5 h-5" />
            商品を追加
          </button>
        </form>
        </div>
      </div>

      {showLeaveConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm space-y-3">
            <p className="text-sm font-semibold text-slate-900">入力内容が破棄されます。閉じますか？</p>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700" onClick={() => setShowLeaveConfirm(false)}>戻る</button>
              <button className="px-3 py-2 rounded-lg bg-rose-600 text-white" onClick={() => onClose?.()}>破棄して閉じる</button>
            </div>
          </div>
        </div>
      )}
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
