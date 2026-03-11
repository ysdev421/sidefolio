import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import {
  getPurchaseLocationUsageCounts,
  getUserPurchaseLocations,
  upsertUserPurchaseLocations,
} from '@/lib/firestore';

interface PurchaseLocationMasterProps {
  userId: string;
}

export function PurchaseLocationMaster({ userId }: PurchaseLocationMasterProps) {
  const [locations, setLocations] = useState<string[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [newLocation, setNewLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [rows, counts] = await Promise.all([
          getUserPurchaseLocations(userId),
          getPurchaseLocationUsageCounts(userId),
        ]);
        setLocations(rows);
        setUsageCounts(counts);
      } catch {
        setLocations(['メルカリ']);
        setUsageCounts({});
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const sortedUsageNote = useMemo(
    () => locations.filter((name) => (usageCounts[name] || 0) > 0).length,
    [locations, usageCounts]
  );

  const addLocation = () => {
    const value = newLocation.trim();
    if (!value) return;
    if (locations.includes(value)) {
      setMessage('同じ購入場所は追加できません');
      return;
    }
    setLocations((prev) => [...prev, value]);
    setNewLocation('');
    setMessage('');
  };

  const moveLocation = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= locations.length) return;
    setLocations((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(index, 1);
      arr.splice(nextIndex, 0, item);
      return arr;
    });
  };

  const removeLocation = (target: string) => {
    if ((usageCounts[target] || 0) > 0) {
      setMessage('利用中の購入場所は削除できません。商品側の購入場所を変更してから削除してください');
      return;
    }
    setLocations((prev) => prev.filter((v) => v !== target));
    setMessage('');
  };

  const saveLocations = async () => {
    setSaving(true);
    setMessage('');
    try {
      await upsertUserPurchaseLocations(userId, locations);
      const [rows, counts] = await Promise.all([
        getUserPurchaseLocations(userId),
        getPurchaseLocationUsageCounts(userId),
      ]);
      setLocations(rows);
      setUsageCounts(counts);
      setMessage('購入場所マスタを保存しました');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="glass-panel p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-sky-600" />
        <p className="text-sm text-slate-600 mt-2">購入場所マスタを読み込み中...</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="glass-panel p-5">
        <h2 className="text-lg font-bold text-slate-900">購入場所マスタ管理</h2>
        <p className="text-sm text-slate-600 mt-1">
          商品追加・編集で使う購入場所候補を管理します。並び順がプルダウン表示順になります。
        </p>
        <p className="text-xs text-slate-500 mt-2">
          削除ルール: 利用中の商品が1件でもある購入場所は削除不可です。
          {sortedUsageNote > 0 ? `（現在 ${sortedUsageNote} 件が利用中）` : ''}
        </p>

        <div className="mt-4 flex gap-2">
          <input
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addLocation();
              }
            }}
            className="input-field"
            placeholder="例: ハードオフ"
          />
          <button
            onClick={addLocation}
            type="button"
            className="px-4 py-2 rounded-xl bg-slate-900 text-white inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            追加
          </button>
        </div>
      </div>

      <div className="glass-panel p-5 space-y-2">
        {locations.length === 0 ? (
          <p className="text-sm text-slate-500">候補がありません。上で追加してください。</p>
        ) : (
          locations.map((location, index) => {
            const usedCount = usageCounts[location] || 0;
            return (
              <div
                key={location}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 bg-white/60"
              >
                <div className="min-w-0">
                  <span className="text-sm text-slate-800">{location}</span>
                  {usedCount > 0 && <p className="text-xs text-slate-500">利用中: {usedCount}件</p>}
                </div>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveLocation(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition disabled:opacity-40"
                    title="上へ"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveLocation(index, 1)}
                    disabled={index === locations.length - 1}
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition disabled:opacity-40"
                    title="下へ"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLocation(location)}
                    disabled={usedCount > 0}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition disabled:opacity-40"
                    title={usedCount > 0 ? '利用中のため削除不可' : '削除'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {message && <p className="text-sm text-slate-700">{message}</p>}

      <button
        type="button"
        onClick={saveLocations}
        disabled={saving}
        className="btn-primary px-4 py-2 rounded-xl inline-flex items-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        <Save className="w-4 h-4" />
        保存
      </button>
    </section>
  );
}
