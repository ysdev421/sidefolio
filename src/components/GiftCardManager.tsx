import { useEffect, useState } from 'react';
import { CreditCard, Plus, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { NumericInput } from '@/components/NumericInput';
import { RichDatePicker } from '@/components/RichDatePicker';
import { addGiftCard, deleteGiftCard, getUserGiftCards, updateGiftCard } from '@/lib/firestore';
import type { GiftCard } from '@/types';

interface GiftCardManagerProps {
  userId: string;
}

const BRANDS: GiftCard['brand'][] = ['Apple', 'Amazon', 'Google Play', 'その他'];

const BRAND_COLORS: Record<GiftCard['brand'], string> = {
  Apple: 'from-slate-700 to-slate-900 text-white',
  Amazon: 'from-amber-400 to-orange-500 text-white',
  'Google Play': 'from-sky-500 to-blue-600 text-white',
  その他: 'from-slate-300 to-slate-400 text-slate-800',
};

function emptyForm() {
  return {
    brand: 'Apple' as GiftCard['brand'],
    purchaseSource: '楽天',
    purchasedAt: new Date().toISOString().split('T')[0],
    faceValue: '10000',
    purchasedPrice: '10000',
    earnedPoint: '0',
    balance: '10000',
    memo: '',
  };
}

export function GiftCardManager({ userId }: GiftCardManagerProps) {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setCards(await getUserGiftCards(userId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [userId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const faceValue = parseFloat(form.faceValue) || 0;
    const purchasedPrice = parseFloat(form.purchasedPrice) || 0;
    const earnedPoint = parseFloat(form.earnedPoint) || 0;
    const balance = parseFloat(form.balance) || faceValue;
    if (faceValue <= 0) { setError('額面を入力してください'); return; }
    if (purchasedPrice <= 0) { setError('購入価格を入力してください'); return; }
    if (balance > faceValue) { setError('残高が額面を超えています'); return; }
    setSaving(true);
    try {
      await addGiftCard(userId, {
        brand: form.brand,
        purchaseSource: form.purchaseSource.trim(),
        purchasedAt: form.purchasedAt,
        faceValue,
        purchasedPrice,
        earnedPoint,
        balance,
        memo: form.memo.trim() || undefined,
      });
      setForm(emptyForm());
      setShowForm(false);
      await load();
    } catch {
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteGiftCard(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleBalanceEdit = async (card: GiftCard, newBalance: number) => {
    await updateGiftCard(card.id, { balance: Math.max(0, newBalance) });
    setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, balance: Math.max(0, newBalance) } : c));
  };

  const withBalance = cards.filter((c) => c.balance > 0);
  const spent = cards.filter((c) => c.balance <= 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">ギフトカード管理</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 bg-gradient-to-r from-sky-500 via-cyan-500 to-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-md hover:opacity-90 active:scale-95 transition"
        >
          <Plus className="w-4 h-4" />
          追加
        </button>
      </div>

      {showForm && (
        <div className="glass-panel p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">ギフトカードを追加</h3>
            <button onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-100 rounded-lg">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ブランド</label>
                <select
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value as GiftCard['brand'] })}
                  className="input-field"
                >
                  {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">購入元</label>
                <input
                  type="text"
                  value={form.purchaseSource}
                  onChange={(e) => setForm({ ...form, purchaseSource: e.target.value })}
                  className="input-field"
                  placeholder="楽天・Amazon等"
                />
              </div>
            </div>

            <div>
              <RichDatePicker
                label="購入日"
                value={form.purchasedAt}
                onChange={(v) => setForm({ ...form, purchasedAt: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  額面 <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white">必須</span>
                </label>
                <NumericInput
                  integer
                  value={form.faceValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      faceValue: v,
                      balance: v,
                      purchasedPrice: v,
                    }));
                  }}
                  className="input-field"
                  placeholder="10000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  購入価格 <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white">必須</span>
                </label>
                <NumericInput
                  integer
                  value={form.purchasedPrice}
                  onChange={(e) => setForm({ ...form, purchasedPrice: e.target.value })}
                  className="input-field"
                  placeholder="10000"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">割引購入の場合は実際の金額</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">購入時付与P</label>
                <NumericInput
                  integer
                  value={form.earnedPoint}
                  onChange={(e) => setForm({ ...form, earnedPoint: e.target.value })}
                  className="input-field"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">現在残高</label>
                <NumericInput
                  integer
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                  className="input-field"
                  placeholder={form.faceValue}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">メモ</label>
              <input
                type="text"
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                className="input-field"
                placeholder="任意"
              />
            </div>

            {error && <p className="text-xs text-rose-600">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full py-2.5 text-sm"
            >
              {saving ? '保存中...' : '追加する'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="glass-panel text-center py-8">
          <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">ギフトカードがありません</p>
          <p className="text-xs text-slate-400 mt-1">追加ボタンから登録してください</p>
        </div>
      ) : (
        <div className="space-y-3">
          {withBalance.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">残高あり ({withBalance.length}件)</p>
              <div className="space-y-2">
                {withBalance.map((card) => (
                  <GiftCardRow
                    key={card.id}
                    card={card}
                    expanded={expandedId === card.id}
                    onToggle={() => setExpandedId((v) => v === card.id ? null : card.id)}
                    onDelete={handleDelete}
                    onBalanceEdit={handleBalanceEdit}
                    deleting={deletingId === card.id}
                  />
                ))}
              </div>
            </div>
          )}
          {spent.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2">使用済み ({spent.length}件)</p>
              <div className="space-y-2 opacity-60">
                {spent.map((card) => (
                  <GiftCardRow
                    key={card.id}
                    card={card}
                    expanded={expandedId === card.id}
                    onToggle={() => setExpandedId((v) => v === card.id ? null : card.id)}
                    onDelete={handleDelete}
                    onBalanceEdit={handleBalanceEdit}
                    deleting={deletingId === card.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface GiftCardRowProps {
  card: GiftCard;
  expanded: boolean;
  onToggle: () => void;
  onDelete: (id: string) => Promise<void>;
  onBalanceEdit: (card: GiftCard, newBalance: number) => Promise<void>;
  deleting: boolean;
}

function GiftCardRow({ card, expanded, onToggle, onDelete, onBalanceEdit, deleting }: GiftCardRowProps) {
  const [editBalance, setEditBalance] = useState(String(card.balance));
  const [savingBalance, setSavingBalance] = useState(false);
  const discountRate = card.faceValue > 0 ? Math.round((1 - card.purchasedPrice / card.faceValue) * 100) : 0;

  const handleSaveBalance = async () => {
    setSavingBalance(true);
    await onBalanceEdit(card, parseFloat(editBalance) || 0);
    setSavingBalance(false);
  };

  return (
    <div className="glass-panel overflow-hidden">
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={onToggle}>
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${BRAND_COLORS[card.brand]} flex items-center justify-center shrink-0`}>
          <CreditCard className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800">{card.brand}</span>
            {card.purchaseSource && (
              <span className="text-[11px] text-slate-500">{card.purchaseSource}</span>
            )}
            {discountRate > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {discountRate}%OFF
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-500">{card.purchasedAt}</span>
            <span className="text-xs text-slate-400">額面 {card.faceValue.toLocaleString()}円</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold ${card.balance > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
            残 {card.balance.toLocaleString()}円
          </p>
          {card.earnedPoint > 0 && (
            <p className="text-[11px] text-sky-600">+{card.earnedPoint.toLocaleString()}P</p>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <div><span className="text-slate-400">購入価格</span><br /><span className="font-semibold">{card.purchasedPrice.toLocaleString()}円</span></div>
            <div><span className="text-slate-400">購入時付与P</span><br /><span className="font-semibold">{card.earnedPoint.toLocaleString()}P</span></div>
            <div>
              <span className="text-slate-400">実コスト</span><br />
              <span className="font-semibold">
                {(card.purchasedPrice - card.earnedPoint).toLocaleString()}円
              </span>
            </div>
            <div><span className="text-slate-400">残高</span><br /><span className="font-semibold text-emerald-600">{card.balance.toLocaleString()}円</span></div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600 shrink-0">残高を修正:</label>
            <NumericInput
              integer
              value={editBalance}
              onChange={(e) => setEditBalance(e.target.value)}
              className="input-field py-1 text-sm flex-1"
              placeholder="0"
            />
            <button
              onClick={handleSaveBalance}
              disabled={savingBalance}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
            >
              {savingBalance ? '...' : '更新'}
            </button>
          </div>

          {card.memo && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2 py-1">{card.memo}</p>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => onDelete(card.id)}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 text-xs text-rose-500 hover:text-rose-700 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              削除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
