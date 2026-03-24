import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { NumericInput } from '@/components/NumericInput';
import {
  addExpenseToFirestore,
  deleteExpenseFromFirestore,
  getUserExpenses,
  updateExpenseInFirestore,
} from '@/lib/firestore';
import type { Expense, ExpenseCategory } from '@/types';
import { formatCurrency } from '@/lib/utils';

const CATEGORIES: ExpenseCategory[] = ['梱包資材', '送料', '交通費', '通信費', 'ツール・サブスク', 'その他'];

interface ExpenseManagerProps {
  userId: string;
}

const emptyForm = () => ({
  date: new Date().toISOString().split('T')[0],
  amount: '',
  category: '梱包資材' as ExpenseCategory,
  memo: '',
});

export function ExpenseManager({ userId }: ExpenseManagerProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  const load = async () => {
    setLoading(true);
    try {
      const rows = await getUserExpenses(userId, filterYear);
      setExpenses(rows);
    } catch {
      setError('読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [userId, filterYear]);

  const onSave = async () => {
    const amount = parseFloat(form.amount);
    if (!form.date || isNaN(amount) || amount <= 0) {
      setError('日付と金額（正の数）は必須です');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (editingId) {
        await updateExpenseInFirestore(editingId, {
          date: form.date,
          amount,
          category: form.category,
          memo: form.memo,
        });
        setMessage('更新しました');
      } else {
        await addExpenseToFirestore(userId, {
          date: form.date,
          amount,
          category: form.category,
          memo: form.memo,
        });
        setMessage('登録しました');
      }
      setForm(emptyForm());
      setEditingId(null);
      await load();
    } catch {
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (e: Expense) => {
    setEditingId(e.id);
    setForm({ date: e.date, amount: String(e.amount), category: e.category, memo: e.memo });
    setError('');
    setMessage('');
  };

  const onDelete = async (id: string) => {
    setSaving(true);
    try {
      await deleteExpenseFromFirestore(id);
      setMessage('削除しました');
      await load();
    } catch {
      setError('削除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setMessage('');
  };

  const totalByCategory = CATEGORIES.map((cat) => ({
    category: cat,
    total: expenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter((c) => c.total > 0);

  const grandTotal = expenses.reduce((s, e) => s + e.amount, 0);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-4">
      {/* 入力フォーム */}
      <div className="glass-panel p-4 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">
          {editingId ? '経費を編集' : '経費を追加'}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">日付</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">金額（円）</label>
            <NumericInput
              integer
              min={1}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="input-field"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">カテゴリ</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
              className="input-field"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">メモ</label>
            <input
              type="text"
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              className="input-field"
              placeholder="任意"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2 px-4 py-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {editingId ? '更新' : '追加'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
            >
              <X className="w-4 h-4" />
              キャンセル
            </button>
          )}
        </div>
        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        {message && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{message}</p>}
      </div>

      {/* 年フィルタ＋合計 */}
      <div className="glass-panel p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-700">表示年：</label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))}
              className="input-field w-auto"
            >
              {years.map((y) => <option key={y} value={y}>{y}年</option>)}
            </select>
          </div>
          <p className="text-sm font-bold text-slate-800">
            合計: <span className="text-lg text-rose-600">{formatCurrency(grandTotal)}</span>
          </p>
        </div>

        {totalByCategory.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {totalByCategory.map(({ category, total }) => (
              <span key={category} className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-700">
                {category}: {formatCurrency(total)}
              </span>
            ))}
          </div>
        )}

        {/* 一覧 */}
        {loading ? (
          <div className="py-6 text-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
            読み込み中...
          </div>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-slate-500">{filterYear}年の経費データがありません</p>
        ) : (
          <div className="space-y-1.5">
            {expenses.map((e) => (
              <div key={e.id} className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2 flex items-center gap-3">
                <p className="text-xs text-slate-500 w-20 shrink-0">{e.date}</p>
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">{e.category}</span>
                <p className="text-sm font-semibold text-rose-600 w-20 shrink-0 text-right">{formatCurrency(e.amount)}</p>
                <p className="text-xs text-slate-500 flex-1 truncate">{e.memo}</p>
                <button
                  onClick={() => onEdit(e)}
                  disabled={saving}
                  className="w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 transition flex items-center justify-center"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(e.id)}
                  disabled={saving}
                  className="w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-50 transition flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
