import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getUserExpenses, getUserKeikojiContracts, getUserPointSiteRedemptions } from '@/lib/firestore';
import { calculateProfit, calculatePointProfit, formatCurrency, getRemainingActualPayment } from '@/lib/utils';
import type { Expense, ExpenseCategory, KeikojiContract, KeikojiHoldDays, PointSiteRedemption, Product } from '@/types';
import { KEIKOJI_HOLD_MONTHS } from '@/types';

const CATEGORIES: ExpenseCategory[] = ['梱包資材', '送料', '交通費', '通信費', 'ツール・サブスク', 'その他'];

interface AnnualSummaryScreenProps {
  userId: string;
  products: Product[];
}

function calcKeikojiProfit(c: KeikojiContract): number {
  const holdMonths = KEIKOJI_HOLD_MONTHS[c.holdDays as KeikojiHoldDays] ?? 0;
  const expense = c.adminFee + c.monthlyFee * holdMonths + c.deviceCost;
  return (c.salePrice ?? 0) + (c.cashback ?? 0) - expense;
}

function calcKeikojiExpense(c: KeikojiContract): number {
  const holdMonths = KEIKOJI_HOLD_MONTHS[c.holdDays as KeikojiHoldDays] ?? 0;
  return c.adminFee + c.monthlyFee * holdMonths + c.deviceCost;
}

export function AnnualSummaryScreen({ userId, products }: AnnualSummaryScreenProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [redemptions, setRedemptions] = useState<PointSiteRedemption[]>([]);
  const [keikojiContracts, setKeikojiContracts] = useState<KeikojiContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [showIncomeHint, setShowIncomeHint] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getUserExpenses(userId, year),
      getUserPointSiteRedemptions(userId),
      getUserKeikojiContracts(userId),
    ])
      .then(([exp, red, contracts]) => {
        setExpenses(exp);
        setRedemptions(red.filter((r) => r.redeemedAt.startsWith(`${year}-`)));
        setKeikojiContracts(contracts.filter((c) => c.contractedAt.startsWith(`${year}-`)));
      })
      .catch(() => { setExpenses([]); setRedemptions([]); setKeikojiContracts([]); })
      .finally(() => setLoading(false));
  }, [userId, year]);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  // せどり
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
  const sedoriTaxableIncome = profitCash + totalRedemptions - totalExpenses;

  // ケーコジ
  const keikojiTotalProfit = keikojiContracts.reduce((s, c) => s + calcKeikojiProfit(c), 0);
  const keikojiTotalCB = keikojiContracts.reduce((s, c) => s + (c.cashback ?? 0), 0);
  const keikojiTotalSale = keikojiContracts.reduce((s, c) => s + (c.salePrice ?? 0), 0);
  const keikojiTotalExpense = keikojiContracts.reduce((s, c) => s + calcKeikojiExpense(c), 0);

  // 副業合計課税所得
  const totalTaxableIncome = sedoriTaxableIncome + keikojiTotalProfit;

  const sedoriRows: { label: string; value: string | number; note?: string; highlight?: 'red' | 'green' | 'blue' }[] = [
    { label: '売上合計', value: formatCurrency(revenue), note: '売却価格の合計', highlight: 'blue' },
    { label: '仕入合計（原価）', value: formatCurrency(cogs), note: '売れた商品の購入金額合計' },
    { label: '粗利（現金）', value: formatCurrency(profitCash), note: '売上 - 仕入（確定申告の計算基準）', highlight: profitCash >= 0 ? 'green' : 'red' },
    { label: '付与ポイント合計（参考）', value: formatCurrency(pointBenefit), note: '獲得ポイントの円換算。使用時に仕入コスト減として反映' },
    { label: '粗利（P含む・参考）', value: formatCurrency(profitWithPoint), note: '粗利（現金）＋付与ポイント。参考値のため申告には使わない', highlight: profitWithPoint >= 0 ? 'green' : 'red' },
    { label: 'ポイントサイト還元合計', value: formatCurrency(totalRedemptions), note: 'モッピー・ハピタス等の換金額（雑所得として課税対象）', highlight: totalRedemptions > 0 ? 'green' : undefined },
    { label: '経費合計', value: formatCurrency(totalExpenses), note: '梱包・送料・交通費など' },
    { label: '概算課税所得（せどり）', value: formatCurrency(sedoriTaxableIncome), note: '粗利（現金）+ ポイントサイト還元 - 経費', highlight: sedoriTaxableIncome >= 0 ? 'green' : 'red' },
    { label: '期末在庫金額', value: formatCurrency(endInventory), note: '在庫商品の仕入合計（翌年繰越・棚卸資産）' },
    { label: '売却件数', value: `${soldThisYear.length} 件`, note: '対象年に売却確定した商品数' },
  ];

  const keikojiRows: { label: string; value: string | number; note?: string; highlight?: 'red' | 'green' | 'blue' }[] = [
    { label: '回線数', value: `${keikojiContracts.length} 回線`, note: `${year}年に契約した回線数` },
    { label: '売却額合計', value: formatCurrency(keikojiTotalSale), note: '端末売却額の合計', highlight: 'blue' },
    { label: 'CB合計', value: formatCurrency(keikojiTotalCB), note: 'キャッシュバック合計', highlight: keikojiTotalCB > 0 ? 'green' : undefined },
    { label: '経費合計', value: formatCurrency(keikojiTotalExpense), note: '事務手数料 + 月額料金×維持月数 + 端末代金の合計' },
    { label: '純利益（ケーコジ）', value: formatCurrency(keikojiTotalProfit), note: '売却額 + CB - 経費', highlight: keikojiTotalProfit >= 0 ? 'green' : 'red' },
  ];

  return (
    <div className="space-y-4">
      {/* 年選択 */}
      <div className="glass-panel p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-slate-900">年間サマリー（確定申告用）</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-700">対象年：</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input-field w-auto"
            >
              {years.map((y) => <option key={y} value={y}>{y}年</option>)}
            </select>
          </div>
        </div>

        {/* 副業合計 */}
        <div className="rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 p-4 mb-4">
          <p className="text-xs font-semibold text-violet-600 mb-1">副業合計 概算課税所得（{year}年）</p>
          <p className={`text-3xl font-black ${totalTaxableIncome >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatCurrency(totalTaxableIncome)}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
            <span>せどり: <span className={`font-semibold ${sedoriTaxableIncome >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(sedoriTaxableIncome)}</span></span>
            <span>ケーコジ: <span className={`font-semibold ${keikojiTotalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(keikojiTotalProfit)}</span></span>
          </div>
          <p className="mt-2 text-[10px] text-violet-400">20万円超の場合は確定申告が必要です（給与所得者の場合）</p>
        </div>

        {/* 所得区分ヒント */}
        <button
          type="button"
          onClick={() => setShowIncomeHint((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-left"
        >
          <span className="text-xs font-semibold text-amber-700">所得区分の目安を確認する</span>
          {showIncomeHint ? <ChevronUp className="w-4 h-4 text-amber-500" /> : <ChevronDown className="w-4 h-4 text-amber-500" />}
        </button>
        {showIncomeHint && (
          <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/60 p-4 space-y-3 text-xs">
            <div className="space-y-1">
              <p className="font-bold text-slate-800">雑所得（最も一般的）</p>
              <p className="text-slate-600">継続的だが小規模・帳簿義務なし。せどり・ケーコジとも多くの場合ここに該当。</p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-800">事業所得</p>
              <p className="text-slate-600">継続的・相当規模（目安: 年300万円超が多い）・青色申告で65万円控除が受けられる。帳簿義務あり。</p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-800">一時所得（ケーコジCBに注意）</p>
              <p className="text-slate-600">偶発的・一時的な収入。<strong>ケーコジのCBは一時所得と判断される可能性あり。</strong>年間50万円控除あり（複数の一時所得を合算）。継続的に行っている場合は雑所得になることも。</p>
            </div>
            <p className="text-slate-400 pt-1 border-t border-amber-100">※ 判断に迷う場合は税理士に相談することを推奨します。上記は目安であり、個別状況により異なります。</p>
          </div>
        )}
      </div>

      {/* せどり */}
      <div className="glass-panel p-4">
        <h3 className="text-base font-bold text-slate-800 mb-3">せどり</h3>
        {loading ? (
          <div className="py-4 text-center text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline-block mr-1" />読み込み中...</div>
        ) : (
          <div className="space-y-2">
            {sedoriRows.map(({ label, value, note, highlight }) => (
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

      {/* ケーコジ */}
      <div className="glass-panel p-4">
        <h3 className="text-base font-bold text-slate-800 mb-3">ケーコジ</h3>
        {loading ? (
          <div className="py-4 text-center text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline-block mr-1" />読み込み中...</div>
        ) : keikojiContracts.length === 0 ? (
          <p className="text-sm text-slate-500">{year}年の契約データがありません</p>
        ) : (
          <div className="space-y-2">
            {keikojiRows.map(({ label, value, note, highlight }) => (
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
        <h3 className="text-base font-bold text-slate-800 mb-3">せどり経費内訳</h3>
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
          <li>購入時に得たポイントは「通常の購入に付随する値引き」として課税対象外のため申告不要（国税庁 No.1907）</li>
          <li>ケーコジのCBは一時所得の可能性あり → 他の一時所得と合算し50万円超なら申告が必要</li>
          <li>20万円超の判定は <strong>副業合計 {formatCurrency(totalTaxableIncome)}</strong> を目安にしてください</li>
        </ul>
      </div>
    </div>
  );
}
