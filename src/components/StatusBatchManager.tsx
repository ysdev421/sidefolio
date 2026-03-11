import { useMemo, useState } from 'react';
import { CheckSquare, Loader2 } from 'lucide-react';
import type { Product } from '@/types';

interface StatusBatchManagerProps {
  products: Product[];
  onBulkUpdate: (ids: string[], status: 'pending' | 'inventory') => Promise<void>;
  onBulkChannelUpdate: (ids: string[], channel: 'ebay' | 'kaitori') => Promise<void>;
}

type StatusFilter = 'all' | 'pending' | 'inventory';

export function StatusBatchManager({ products, onBulkUpdate, onBulkChannelUpdate }: StatusBatchManagerProps) {
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [targetStatus, setTargetStatus] = useState<'pending' | 'inventory'>('inventory');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [targetChannel, setTargetChannel] = useState<'ebay' | 'kaitori'>('ebay');

  const candidates = useMemo(() => {
    const base = products.filter((p) => p.status !== 'sold');
    const filteredByStatus = statusFilter === 'all' ? base : base.filter((p) => p.status === statusFilter);
    const q = query.trim().toLowerCase();
    if (!q) return filteredByStatus;
    return filteredByStatus.filter((p) => [p.productName, p.purchaseLocation, p.janCode || ''].join(' ').toLowerCase().includes(q));
  }, [products, query, statusFilter]);

  const selectedProducts = useMemo(
    () => candidates.filter((p) => selectedIds[p.id]),
    [candidates, selectedIds]
  );
  const selectedCount = selectedProducts.length;

  const toggle = (id: string, checked: boolean) => {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  };

  const toggleAllVisible = (checked: boolean) => {
    const next: Record<string, boolean> = { ...selectedIds };
    for (const p of candidates) next[p.id] = checked;
    setSelectedIds(next);
  };

  const applyBulk = async () => {
    const ids = Object.entries(selectedIds).filter(([, checked]) => checked).map(([id]) => id);
    if (ids.length === 0) {
      setMessage('変更対象を選択してください');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      await onBulkUpdate(ids, targetStatus);
      setSelectedIds({});
      setMessage(`${ids.length}件を${targetStatus === 'inventory' ? '在庫' : '未着'}に変更しました`);
      setShowConfirm(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '一括更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const applyBulkChannel = async () => {
    const ids = Object.entries(selectedIds).filter(([, checked]) => checked).map(([id]) => id);
    if (ids.length === 0) {
      setMessage('変更対象を選択してください');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      await onBulkChannelUpdate(ids, targetChannel);
      setSelectedIds({});
      setMessage(`${ids.length}件の販路を${targetChannel === 'ebay' ? 'eBay' : '買取'}に変更しました`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '販路の一括更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="glass-panel p-5 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">ステータス一括管理</h2>
        <p className="text-sm text-slate-600">未着/在庫をチェック選択してまとめて変更できます</p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input-field"
          placeholder="商品名・購入場所・JANで検索"
        />

        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'inventory'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                statusFilter === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {s === 'all' ? 'すべて' : s === 'pending' ? '未着' : '在庫'}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-panel p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" onChange={(e) => toggleAllVisible(e.target.checked)} />
            表示中を全選択
          </label>
          <p className="text-sm text-slate-600">選択: {selectedCount}件</p>
        </div>

        <div className="max-h-80 overflow-auto border border-slate-200 rounded-xl p-2 space-y-2 bg-white/60">
          {candidates.length === 0 && <p className="text-sm text-slate-500 p-2">対象データがありません</p>}
          {candidates.map((p) => (
            <label key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/70">
              <input type="checkbox" checked={!!selectedIds[p.id]} onChange={(e) => toggle(p.id, e.target.checked)} />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{p.productName}</p>
                <p className="text-xs text-slate-500">{p.status === 'pending' ? '未着' : '在庫'} / {p.purchaseLocation}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value as 'pending' | 'inventory')} className="input-field max-w-[170px]">
            <option value="inventory">在庫に変更</option>
            <option value="pending">未着に変更</option>
          </select>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={loading || selectedCount === 0}
            className="btn-primary px-4 py-2 rounded-xl inline-flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
            一括変更
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
          <span className="text-xs font-semibold text-slate-500">仮置き: 販路一括変更</span>
          <select
            value={targetChannel}
            onChange={(e) => setTargetChannel(e.target.value as 'ebay' | 'kaitori')}
            className="input-field max-w-[170px]"
          >
            <option value="ebay">eBayに変更</option>
            <option value="kaitori">買取に変更</option>
          </select>
          <button
            onClick={applyBulkChannel}
            disabled={loading || selectedCount === 0}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 inline-flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
            販路を変更
          </button>
        </div>
        {message && <p className="text-sm text-slate-700">{message}</p>}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg space-y-3">
            <h3 className="font-bold text-slate-900">変更前確認</h3>
            <p className="text-sm text-slate-600">
              {selectedCount}件を「{targetStatus === 'inventory' ? '在庫' : '未着'}」へ変更します
            </p>
            <div className="max-h-48 overflow-auto border border-slate-200 rounded-xl p-2 text-sm space-y-1">
              {selectedProducts.map((p) => (
                <p key={p.id} className="text-slate-700 truncate">{p.productName} ({p.status === 'pending' ? '未着' : '在庫'}→{targetStatus === 'pending' ? '未着' : '在庫'})</p>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded-lg border border-slate-200" onClick={() => setShowConfirm(false)}>キャンセル</button>
              <button className="px-3 py-2 rounded-lg bg-slate-900 text-white" onClick={applyBulk}>確定</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
