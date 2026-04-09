import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getUserExpenses, getUserKeikojiContracts, getUserPointSiteRedemptions } from '@/lib/firestore';
import { calculateProfit, calculatePointProfit, formatCurrency, getRemainingActualPayment } from '@/lib/utils';
import type { Expense, KeikojiContract, KeikojiHoldDays, PointSiteRedemption, Product } from '@/types';
import { KEIKOJI_HOLD_MONTHS } from '@/types';

interface SidefolioAnnualSummaryProps {
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

export function SidefolioAnnualSummary({ userId, products }: SidefolioAnnualSummaryProps) {
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
  const profitCash = soldThisYear.reduce((s, p) => s + calculatePointProfit(p), 0);
  const profitWithPoint = soldThisYear.reduce((s, p) => s + calculateProfit(p), 0);
  const endInventory = products.filter((p) => p.status === 'inventory').reduce((s, p) => s + getRemainingActualPayment(p), 0);
  const totalRedemptions = redemptions.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const sedoriTaxable = profitCash - totalExpenses;
  const sedoriProfitWithRedemptions = profitCash + totalRedemptions;

  // 回線案件管理
  const keikojiProfit = keikojiContracts.reduce((s, c) => s + calcKeikojiProfit(c), 0);
  const keikojiCB = keikojiContracts.reduce((s, c) => s + (c.cashback ?? 0), 0);
  const keikojiExpense = keikojiContracts.reduce((s, c) => s + calcKeikojiExpense(c), 0);

  // 合計
  const totalTaxable = sedoriTaxable + keikojiProfit;

  return (
    <div className="space-y-4">
      {/* 年選択 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">年間サマリー（全副業）</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-700">対象年：</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-field w-auto">
            {years.map((y) => <option key={y} value={y}>{y}年</option>)}
          </select>
        </div>
      </div>

      {/* 副業合計 */}
      <div className="glass-panel p-5 bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200">
        <p className="text-xs font-semibold text-violet-600 mb-1">副業合計 概算課税所得（{year}年）</p>
        <p className={`text-4xl font-black tracking-tight ${totalTaxable >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {formatCurrency(totalTaxable)}
        </p>
        <div className="mt-3 pt-3 border-t border-violet-100 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-400 mb-0.5">せどり 概算課税所得</p>
            <p className={`font-bold text-sm ${sedoriTaxable >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(sedoriTaxable)}</p>
            <p className="text-slate-400 mt-0.5">粗利{formatCurrency(profitCash)} - 経費{formatCurrency(totalExpenses)}（還元は申告計算に含めない）</p>
            <p className="text-slate-400 mt-0.5">参考: 還元込み利益 {formatCurrency(sedoriProfitWithRedemptions)}</p>
          </div>
          <div>
            <p className="text-slate-400 mb-0.5">回線案件管理 純利益</p>
            <p className={`font-bold text-sm ${keikojiProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(keikojiProfit)}</p>
            <p className="text-slate-400 mt-0.5">{keikojiContracts.length}回線 CB{formatCurrency(keikojiCB)} - 経費{formatCurrency(keikojiExpense)}</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] text-violet-400">20万円超の場合は確定申告が必要です（給与所得者の場合）</p>
      </div>

      {loading && (
        <div className="py-4 text-center text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline-block mr-1" />読み込み中...</div>
      )}

      {/* せどり内訳 */}
      {!loading && (
        <div className="glass-panel p-4">
          <h3 className="text-sm font-bold text-slate-700 mb-3">せどり内訳</h3>
          <div className="space-y-2">
            {[
              { label: '粗利（現金）', value: formatCurrency(profitCash), highlight: profitCash >= 0 ? 'green' : 'red' },
              { label: 'ポイントサイト還元（参考）', value: formatCurrency(totalRedemptions), highlight: totalRedemptions > 0 ? 'green' : undefined },
              { label: '参考：還元込み粗利', value: formatCurrency(sedoriProfitWithRedemptions), highlight: sedoriProfitWithRedemptions >= 0 ? 'green' : 'red' },
              { label: 'せどり経費', value: formatCurrency(totalExpenses) },
              { label: '期末在庫', value: formatCurrency(endInventory), note: '翌年繰越' },
              { label: '参考：付与P含む粗利', value: formatCurrency(profitWithPoint), highlight: profitWithPoint >= 0 ? 'green' : 'red' },
            ].map(({ label, value, note, highlight }: { label: string; value: string; note?: string; highlight?: string }) => (
              <div key={label} className="flex items-center justify-between gap-4 px-3 py-2 rounded-xl bg-white/60 border border-slate-100">
                <div>
                  <p className="text-sm text-slate-700">{label}</p>
                  {note && <p className="text-xs text-slate-400">{note}</p>}
                </div>
                <p className={`text-sm font-bold shrink-0 ${highlight === 'green' ? 'text-emerald-600' : highlight === 'red' ? 'text-rose-600' : 'text-slate-800'}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 回線案件管理内訳 */}
      {!loading && (
        <div className="glass-panel p-4">
          <h3 className="text-sm font-bold text-slate-700 mb-3">回線案件管理内訳</h3>
          {keikojiContracts.length === 0 ? (
            <p className="text-sm text-slate-500">{year}年の契約データがありません</p>
          ) : (
            <div className="space-y-2">
              {[
                { label: '回線数', value: `${keikojiContracts.length}回線` },
                { label: 'CB合計', value: formatCurrency(keikojiCB), highlight: keikojiCB > 0 ? 'green' : undefined },
                { label: '経費合計', value: formatCurrency(keikojiExpense) },
                { label: '純利益', value: formatCurrency(keikojiProfit), highlight: keikojiProfit >= 0 ? 'green' : 'red' },
              ].map(({ label, value, highlight }: { label: string; value: string; highlight?: string }) => (
                <div key={label} className="flex items-center justify-between gap-4 px-3 py-2 rounded-xl bg-white/60 border border-slate-100">
                  <p className="text-sm text-slate-700">{label}</p>
                  <p className={`text-sm font-bold shrink-0 ${highlight === 'green' ? 'text-emerald-600' : highlight === 'red' ? 'text-rose-600' : 'text-slate-800'}`}>{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 所得区分ヒント */}
      <div className="glass-panel p-4">
        <button
          type="button"
          onClick={() => setShowIncomeHint((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="text-sm font-semibold text-amber-700">所得区分の目安</span>
          {showIncomeHint ? <ChevronUp className="w-4 h-4 text-amber-500" /> : <ChevronDown className="w-4 h-4 text-amber-500" />}
        </button>
        {showIncomeHint && (
          <div className="mt-3 space-y-3 text-xs">
            <div><p className="font-bold text-slate-800">雑所得</p><p className="text-slate-600 mt-0.5">継続的だが小規模・帳簿義務なし。せどり・回線案件管理とも多くの場合ここに該当。</p></div>
            <div><p className="font-bold text-slate-800">事業所得</p><p className="text-slate-600 mt-0.5">継続的・相当規模（年300万円超が目安）・青色申告で65万円控除あり・帳簿義務あり。</p></div>
            <div><p className="font-bold text-slate-800">一時所得（回線案件管理CBに注意）</p><p className="text-slate-600 mt-0.5">回線案件管理のCBは一時所得と判断される可能性あり。年間50万円控除あり。継続的に行う場合は雑所得になることも。</p></div>
            <p className="text-slate-400 pt-2 border-t border-slate-100">※ 判断に迷う場合は税理士に相談することを推奨します。</p>
          </div>
        )}
      </div>
    </div>
  );
}
