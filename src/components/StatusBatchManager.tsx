import { useMemo, useState } from 'react';
import { CheckSquare, Loader2 } from 'lucide-react';
import type { Product } from '@/types';

interface StatusBatchManagerProps {
  products: Product[];
  onBulkUpdate: (ids: string[], status: 'pending' | 'inventory') => Promise<void>;
}

type StatusFilter = 'all' | 'pending' | 'inventory';

export function StatusBatchManager({ products, onBulkUpdate }: StatusBatchManagerProps) {
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [targetStatus, setTargetStatus] = useState<'pending' | 'inventory'>('inventory');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const candidates = useMemo(() => {
    const base = products.filter((p) => p.status !== 'sold');
    const filteredByStatus =
      statusFilter === 'all' ? base : base.filter((p) => p.status === statusFilter);

    const q = query.trim().toLowerCase();
    if (!q) return filteredByStatus;
    return filteredByStatus.filter((p) =>
      [p.productName, p.purchaseLocation, p.janCode || ''].join(' ').toLowerCase().includes(q)
    );
  }, [products, query, statusFilter]);

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  const toggle = (id: string, checked: boolean) => {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  };

  const toggleAllVisible = (checked: boolean) => {
    const next: Record<string, boolean> = { ...selectedIds };
    for (const p of candidates) {
      next[p.id] = checked;
    }
    setSelectedIds(next);
  };

  const applyBulk = async () => {
    const ids = Object.entries(selectedIds)
      .filter(([, checked]) => checked)
      .map(([id]) => id);

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
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '一括更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="glass-panel p-5 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">ステータス一括管理</h2>
        <p className="text-sm text-slate-600">未着 / 在庫 をチェック選択して一括変更できます。</p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input-field"
          placeholder="商品名・購入場所・JANで検索"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              statusFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            すべて
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              statusFilter === 'pending'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            未着
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('inventory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              statusFilter === 'inventory'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            在庫
          </button>
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
              <input
                type="checkbox"
                checked={!!selectedIds[p.id]}
                onChange={(e) => toggle(p.id, e.target.checked)}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{p.productName}</p>
                <p className="text-xs text-slate-500">
                  {p.status === 'pending' ? '未着' : '在庫'} / {p.purchaseLocation}
                </p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value as 'pending' | 'inventory')}
            className="input-field max-w-[160px]"
          >
            <option value="inventory">在庫に変更</option>
            <option value="pending">未着に変更</option>
          </select>
          <button onClick={applyBulk} disabled={loading} className="btn-primary px-4 py-2 rounded-xl inline-flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
            一括変更
          </button>
        </div>
        {message && <p className="text-sm text-slate-700">{message}</p>}
      </div>
    </section>
  );
}
