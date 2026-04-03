import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getUserExpenses, getUserPointSiteRedemptions } from '@/lib/firestore';
import { calculateProfit, calculatePointProfit, formatCurrency, getRemainingActualPayment } from '@/lib/utils';
import type { Expense, ExpenseCategory, PointSiteRedemption, Product } from '@/types';

const CATEGORIES: ExpenseCategory[] = ['梱包資材', '送料', '交通費', '通信費', 'ツール・サブスク', 'その他'];

interface AnnualSummaryScreenProps {
  userId: string;
  products: Product[];
}

export function AnnualSummaryScreen({ userId, products }: AnnualSummaryScreenProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [redemptions, setRedemptions] = useState<PointSiteRedemption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getUserExpenses(userId, year),
      getUserPointSiteRedemptions(userId),
    ])
      .then(([exp, red]) => {
        setExpenses(exp);
        setRedemptions(red.filter((r) => r.redeemedAt.startsWith(`${year}-`)));
      })
      .catch(() => { setExpenses([]); setRedemptions([]); })
      .finally(() => setLoading(false));
  }, [userId, year]);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  const soldThisYear = products.filter((p) => {
    if (p.status !== 'sold' || !p.saleDate) return false;
    return p.saleDate.startsWith(`${year}-`);
  });

  const revenue = soldThisYear.reduce((s, p) => s + (p.salePrice || 0), 0);
  const cogs = soldThisYear.reduce((s, p) => s + p.purchasePrice, 0);
  const profitCash = soldThisYear.reduce((s, p) => s + calculatePointProfit(p), 0);
  const profitWithPoint = soldThisYear.reduce((s, p) => s + calculateProfit(p), 0);
  const endInventory = products
    .filter((p) => p.status === 'inventory')
    .reduce((s, p) => s + getRemainingActualPayment(p), 0);
  const totalRedemptions = redemptions.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const expenseByCategory = CATEGORIES.map((cat) => ({
    category: cat,
    total: expenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
  }));
  const pointBenefit = profitWithPoint - profitCash;
  const taxableIncome = profitCash + totalRedemptions - totalExpenses;

  const rows: { label: string; value: string | number; note?: string; highlight?: 'red' | 'green' | 'blue' }[] = [
    { label: '売上合計', value: formatCurrency(revenue), note: '売却価格の合計', highlight: 'blue' },
    { label: '仕入合計（原価）', value: formatCurrency(cogs), note: '売れた商品の購入金額合計' },
    { label: '粗利（現金）', value: formatCurrency(profitCash), note: '売上 - 仕入（確定申告の計算基準）', highlight: profitCash >= 0 ? 'green' : 'red' },
    { label: '付与ポイント合計（参考）', value: formatCurrency(pointBenefit), note: '獲得ポイントの円換算。使用時に仕入コスト減として反映' },
    { label: '粗利（P含む・参考）', value: formatCurrency(profitWithPoint), note: '粗利（現金）＋付与ポイント。参考値のため申告には使わない', highlight: profitWithPoint >= 0 ? 'green' : 'red' },
    { label: 'ポイントサイト還元合計', value: formatCurrency(totalRedemptions), note: 'モッピー・ハピタス等の換金額（雑所得として課税対象）', highlight: totalRedemptions > 0 ? 'green' : undefined },
    { label: '経費合計', value: formatCurrency(totalExpenses), note: '梱包・送料・交通費など' },
    { label: '概算課税所得', value: formatCurrency(taxableIncome), note: '粗利（現金）+ ポイントサイト還元 - 経費', highlight: taxableIncome >= 0 ? 'green' : 'red' },
    { label: '期末在庫金額', value: formatCurrency(endInventory), note: '在庫商品の仕入合計（翌年繰越・棚卸資産）' },
    { label: '売却件数', value: `${soldThisYear.length} 件`, note: '対象年に売却確定した商品数' },
  ];

  return (
    <div className="space-y-4">
      <div className="glass-panel p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-slate-900">年間サマリー（せどり）</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-700">対象年：</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-field w-auto">
              {years.map((y) => <option key={y} value={y}>{y}年</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-4 text-center text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline-block mr-1" />読み込み中...</div>
        ) : (
          <div className="space-y-2">
            {rows.map(({ label, value, note, highlight }) => (
              <div key={label} className="flex items-center justify-between gap-4 px-3 py-2.5 rounded-xl bg-white/60 border border-slate-100">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  {note && <p className="text-xs text-slate-400 mt-0.5">{note}</p>}
                </div>
                <p className={`text-base font-bold shrink-0 ${
                  highlight === 'green' ? 'text-emerald-600'
                  : highlight === 'red' ? 'text-rose-600'
                  : highlight === 'blue' ? 'text-sky-600'
                  : 'text-slate-800'
                }`}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 経費内訳 */}
      <div className="glass-panel p-4">
        <h3 className="text-base font-bold text-slate-800 mb-3">経費内訳</h3>
        {loading ? (
          <div className="py-4 text-center text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline-block mr-1" />読み込み中...</div>
        ) : totalExpenses === 0 ? (
          <p className="text-sm text-slate-500">{year}年の経費データがありません</p>
        ) : (
          <div className="space-y-1.5">
            {expenseByCategory.filter((c) => c.total > 0).map(({ category, total }) => (
              <div key={category} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/60 border border-slate-100">
                <p className="text-sm text-slate-700">{category}</p>
                <p className="text-sm font-semibold text-slate-800">{formatCurrency(total)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 mt-2">
              <p className="text-sm font-bold text-slate-800">合計</p>
              <p className="text-sm font-bold text-rose-600">{formatCurrency(totalExpenses)}</p>
            </div>
          </div>
        )}
      </div>

      {/* freee入力ガイド */}
      <div className="glass-panel p-4 bg-sky-50/60">
        <h3 className="text-sm font-bold text-sky-800 mb-2">freee 入力時のポイント</h3>
        <ul className="text-xs text-sky-700 space-y-1.5 list-disc list-inside">
          <li>「売上」に <strong>{formatCurrency(revenue)}</strong> を入力</li>
          <li>「仕入（売上原価）」に <strong>{formatCurrency(cogs)}</strong> を入力</li>
          <li>経費は各カテゴリ別に入力（梱包材・送料 → 荷造運賃、交通費 → 旅費交通費、ツール・サブスク → 通信費または諸会費）</li>
          <li>「棚卸資産（期末在庫）」に <strong>{formatCurrency(endInventory)}</strong> を計上</li>
          <li>購入時に得たポイントは課税対象外のため申告不要（国税庁 No.1907）</li>
          <li>20万円超の判定は <strong>概算課税所得 {formatCurrency(taxableIncome)}</strong> を目安にしてください</li>
        </ul>
      </div>
    </div>
  );
}
