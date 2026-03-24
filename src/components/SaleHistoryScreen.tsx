import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, Loader2, X } from 'lucide-react';
import {
  cancelSaleBatchInFirestore,
  getSaleBatchDetail,
  getUserRecentSaleBatches,
  updateSaleBatchItemPrices,
  type SaleBatchDetail,
  type SaleBatchSummary,
} from '@/lib/firestore';
import { useStore } from '@/lib/store';
import { formatCurrency } from '@/lib/utils';

interface SaleHistoryScreenProps {
  userId: string;
}

export function SaleHistoryScreen({ userId }: SaleHistoryScreenProps) {
  const [recentBatches, setRecentBatches] = useState<SaleBatchSummary[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [cancelingBatchId, setCancelingBatchId] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<SaleBatchSummary | null>(null);
  const [detailTarget, setDetailTarget] = useState<SaleBatchDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [message, setMessage] = useState('');
  const [errorModal, setErrorModal] = useState<{ title: string; detail: string } | null>(null);
  const updateProduct = useStore((state) => state.updateProduct);

  const loadRecentBatches = async () => {
    setLoadingBatches(true);
    try {
      const rows = await getUserRecentSaleBatches(userId, 50);
      setRecentBatches(rows);
    } catch {
      setRecentBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  };

  useEffect(() => {
    void loadRecentBatches();
  }, [userId]);

  const openDetail = async (batch: SaleBatchSummary) => {
    setLoadingDetail(true);
    try {
      const detail = await getSaleBatchDetail(userId, batch.id);
      setDetailTarget(detail);
    } catch {
      setErrorModal({ title: 'エラー', detail: '詳細の取得に失敗しました' });
    } finally {
      setLoadingDetail(false);
    }
  };

  const cancelBatch = async (batch: SaleBatchSummary) => {
    setMessage('');
    setCancelingBatchId(batch.id);
    try {
      const result = await cancelSaleBatchInFirestore(userId, batch.id, 'ユーザー操作で取り消し');
      result.revertedProducts.forEach((p) => {
        updateProduct(p.id, p);
      });
      setMessage(`一括売却を取り消しました（${result.revertedProducts.length}件）`);
      await loadRecentBatches();
    } catch (e) {
      setErrorModal({
        title: '取り消しエラー',
        detail: e instanceof Error ? e.message : '一括売却の取り消しに失敗しました',
      });
    } finally {
      setCancelingBatchId('');
    }
  };

  const startEdit = () => {
    if (!detailTarget) return;
    const prices: Record<string, string> = {};
    detailTarget.items.forEach((item) => {
      prices[item.productId] = String(item.allocatedSalePrice);
    });
    setEditPrices(prices);
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!detailTarget) return;
    setSavingEdit(true);
    try {
      const newPrices: Record<string, number> = {};
      detailTarget.items.forEach((item) => {
        newPrices[item.productId] = Math.max(0, Math.round(parseFloat(editPrices[item.productId] ?? '0') || 0));
      });
      await updateSaleBatchItemPrices(userId, detailTarget.id, newPrices);
      const updated = await getSaleBatchDetail(userId, detailTarget.id);
      setDetailTarget(updated);
      setEditMode(false);
      await loadRecentBatches();
    } catch (e) {
      setErrorModal({ title: '保存エラー', detail: e instanceof Error ? e.message : '保存に失敗しました' });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel p-4 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">売却履歴</h2>

        {message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {loadingBatches ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            読み込み中...
          </div>
        ) : recentBatches.length === 0 ? (
          <p className="text-sm text-slate-500">一括売却履歴はありません</p>
        ) : (
          <div className="space-y-2">
            {recentBatches.map((batch) => (
              <div key={batch.id} className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openDetail(batch)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {batch.saleDate} / {batch.saleLocation} / {batch.itemCount}件
                  </p>
                  <p className="text-xs text-slate-600">最終受取: {formatCurrency(batch.totalRevenue)}</p>
                </button>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                {batch.canceledAt ? (
                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 shrink-0">
                    取り消し済み
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmTarget(batch)}
                    disabled={!!cancelingBatchId}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-rose-200 text-rose-700 hover:bg-rose-50 transition shrink-0"
                  >
                    {cancelingBatchId === batch.id ? '取り消し中...' : '取り消す'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 詳細モーダル */}
      {(loadingDetail || detailTarget) && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setDetailTarget(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-slate-900">売却詳細</h4>
              <div className="flex items-center gap-2">
                {!editMode && !detailTarget?.canceledAt && (
                  <button type="button" onClick={startEdit} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50">
                    減額修正
                  </button>
                )}
                <button type="button" onClick={() => { setDetailTarget(null); setEditMode(false); }} className="p-1 rounded-lg hover:bg-slate-100">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            {loadingDetail ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                読み込み中...
              </div>
            ) : detailTarget && (
              <>
                {/* サマリー */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">売却日</span>
                    <span className="font-semibold">{detailTarget.saleDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">売却先</span>
                    <span className="font-semibold">{detailTarget.saleLocation}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">買取総額</span>
                    <span className="font-semibold">{formatCurrency(detailTarget.receivedCash)}</span>
                  </div>
                  {detailTarget.receivedPoint > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">上乗せポイント</span>
                      <span className="font-semibold">{detailTarget.receivedPoint}P × {detailTarget.pointRate} = {formatCurrency(detailTarget.receivedPointValue)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                    <span className="text-slate-600">最終受取</span>
                    <span className="font-bold text-slate-900">{formatCurrency(detailTarget.totalRevenue)}</span>
                  </div>
                  {detailTarget.memo && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">メモ</span>
                      <span className="font-semibold text-right max-w-[60%]">{detailTarget.memo}</span>
                    </div>
                  )}
                  {detailTarget.canceledAt && (
                    <div className="flex justify-between text-rose-600">
                      <span>取り消し済み</span>
                      <span className="font-semibold">{detailTarget.canceledAt.slice(0, 10)}</span>
                    </div>
                  )}
                </div>

                {/* 商品明細 */}
                {detailTarget.items.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">商品明細（{detailTarget.items.length}件）</p>
                    <div className="space-y-1.5">
                      {detailTarget.items.map((item, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <p className="text-sm font-semibold text-slate-900 truncate">{item.productName}</p>
                          {item.janCode && <p className="text-xs text-slate-400 font-mono">{item.janCode}</p>}
                          {editMode ? (
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-xs text-slate-500">仕入: {formatCurrency(item.purchasePrice)}</span>
                              <span className="text-xs text-slate-400">元: {formatCurrency(item.allocatedSalePrice)}</span>
                              <input
                                type="number"
                                min={0}
                                value={editPrices[item.productId] ?? ''}
                                onChange={(e) => setEditPrices((prev) => ({ ...prev, [item.productId]: e.target.value }))}
                                className="input-field h-8 text-sm w-28"
                              />
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-600">
                              <span>仕入: {formatCurrency(item.purchasePrice)}</span>
                              {item.point > 0 && <span>付与P: {formatCurrency(item.point)}</span>}
                              <span>売却額: {formatCurrency(item.allocatedSalePrice)}</span>
                              {item.allocatedPointValue > 0 && <span>上乗せP: {formatCurrency(item.allocatedPointValue)}</span>}
                              {(() => {
                                const profitWithPoint = item.allocatedSalePrice + item.allocatedPointValue - (item.purchasePrice - item.point);
                                const profitCashOnly = item.allocatedSalePrice - item.purchasePrice;
                                return (
                                  <>
                                    <span className={`font-semibold ${profitCashOnly >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      利益: {profitCashOnly >= 0 ? '+' : ''}{formatCurrency(profitCashOnly)}
                                    </span>
                                    <span className={`font-semibold ${profitWithPoint >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      利益(P含む): {profitWithPoint >= 0 ? '+' : ''}{formatCurrency(profitWithPoint)}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {editMode && (
                      <div className="flex justify-end gap-2 mt-3">
                        <button type="button" onClick={() => setEditMode(false)} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm">
                          キャンセル
                        </button>
                        <button type="button" onClick={saveEdit} disabled={savingEdit} className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm inline-flex items-center gap-1">
                          {savingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
                          保存
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 取り消し確認モーダル */}
      {confirmTarget && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-base font-bold text-slate-900">一括売却を取り消しますか？</h4>
                <p className="text-sm text-slate-600 mt-1">
                  {confirmTarget.saleDate} / {confirmTarget.saleLocation} / {confirmTarget.itemCount}件
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              売却情報を外して、対象商品を売却前のステータスに戻します。
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmTarget(null)} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
                キャンセル
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmTarget;
                  setConfirmTarget(null);
                  if (target) await cancelBatch(target);
                }}
                className="px-3 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
              >
                取り消す
              </button>
            </div>
          </div>
        </div>
      )}

      {/* エラーモーダル */}
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
              <button type="button" onClick={() => setErrorModal(null)} className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
