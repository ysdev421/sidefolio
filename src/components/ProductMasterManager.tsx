import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteUserProductMaster, getUserProductMasters, upsertUserProductMaster } from '@/lib/firestore';
import type { ProductMaster } from '@/types';

interface ProductMasterManagerProps {
  userId: string;
  initialJanCode?: string;
  initialProductName?: string;
  onSaved?: () => void;
}

const normalizeJanCode = (value: string) => value.replace(/\D/g, '').trim();

export function ProductMasterManager({ userId, initialJanCode, initialProductName, onSaved }: ProductMasterManagerProps) {
  const [masters, setMasters] = useState<ProductMaster[]>([]);
  const [query, setQuery] = useState('');
  const [janCode, setJanCode] = useState(initialJanCode ?? '');
  const [productName, setProductName] = useState(initialProductName ?? '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null);
  const [editingJanCode, setEditingJanCode] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await getUserProductMasters(userId);
      setMasters(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : '商品マスタの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [userId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return masters;
    return masters.filter((m) => [m.janCode, m.productName].join(' ').toLowerCase().includes(q));
  }, [masters, query]);

  const onSave = async () => {
    const normalizedJan = normalizeJanCode(janCode);
    const name = productName.trim();
    if (!normalizedJan || !name) {
      setError('JANコードと商品名を入力してください');
      return;
    }
    const existing = masters.find((m) => normalizeJanCode(m.janCode) === normalizedJan);
    if (!editingMasterId && existing) {
      setError('このJANはすでに登録済みです。更新したい場合は一覧の編集ボタンから変更してください');
      return;
    }
    if (editingMasterId && normalizeJanCode(editingJanCode) !== normalizedJan) {
      setError('編集中はJANコードを変更できません。キャンセルして新規登録してください');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      await upsertUserProductMaster(userId, { janCode: normalizedJan, productName: name });
      setJanCode('');
      setProductName('');
      setEditingMasterId(null);
      setEditingJanCode('');
      const wasNew = !editingMasterId;
      setMessage(wasNew ? '商品マスタを保存しました' : '商品マスタを更新しました');
      await load();
      if (wasNew && onSaved) onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await deleteUserProductMaster(id);
      setMessage('商品マスタを削除しました');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const onStartEdit = (master: ProductMaster) => {
    const normalizedJan = normalizeJanCode(master.janCode);
    setEditingMasterId(master.id);
    setEditingJanCode(normalizedJan);
    setJanCode(normalizedJan);
    setProductName(master.productName);
    setError('');
    setMessage('');
  };

  const onCancelEdit = () => {
    setEditingMasterId(null);
    setEditingJanCode('');
    setJanCode('');
    setProductName('');
    setError('');
    setMessage('');
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel p-4 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">商品マスタ管理</h2>
        <p className="text-sm text-slate-600">ここで登録したJANと商品名のみ、商品追加で選択できます。</p>
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-2">
          <input
            value={janCode}
            onChange={(e) => setJanCode(normalizeJanCode(e.target.value))}
            placeholder="JANコード(8桁/13桁)"
            className="input-field"
            disabled={!!editingMasterId}
          />
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="商品名"
            className="input-field"
          />
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {editingMasterId ? '更新' : '保存'}
          </button>
          {editingMasterId && (
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
            >
              キャンセル
            </button>
          )}
        </div>
        {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>}
        {message && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{message}</div>}
      </div>

      <div className="glass-panel p-4 space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input-field"
          placeholder="JANコード / 商品名で検索"
        />
        {loading ? (
          <div className="py-6 text-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
            読み込み中...
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500">商品マスタはまだありません</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2 flex items-center gap-3">
                <p className="text-xs text-slate-600 w-36 shrink-0">{m.janCode}</p>
                <p className="text-sm text-slate-900 min-w-0 flex-1 truncate">{m.productName}</p>
                <button
                  type="button"
                  onClick={() => onStartEdit(m)}
                  disabled={saving}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 transition"
                  title="編集"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(m.id)}
                  disabled={saving}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-600 hover:bg-rose-50 transition"
                  title="削除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
