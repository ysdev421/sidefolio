import { ChevronRight, FileText, Package, Smartphone } from 'lucide-react';
import type { KeikojiContract, KeikojiHoldDays, Product, PointSiteRedemption } from '@/types';
import { KEIKOJI_HOLD_MONTHS } from '@/types';

interface HomeScreenProps {
  products: Product[];
  redemptions: PointSiteRedemption[];
  keikojiContracts: KeikojiContract[];
  onSelectSection: (section: 'sedori' | 'keikoji' | 'annualSummary') => void;
}

function calcKeikojiProfit(c: KeikojiContract): number {
  const holdMonths = KEIKOJI_HOLD_MONTHS[c.holdDays as KeikojiHoldDays] ?? 0;
  const expense = c.adminFee + c.monthlyFee * holdMonths + c.deviceCost;
  return (c.salePrice ?? 0) + (c.cashback ?? 0) - expense;
}

export function HomeScreen({ products, redemptions, keikojiContracts, onSelectSection }: HomeScreenProps) {
  const thisYear = new Date().getFullYear();

  // せどり利益
  const soldThisYear = products.filter((p) => {
    if (p.status !== 'sold' || !p.saleDate) return false;
    return new Date(p.saleDate).getFullYear() === thisYear;
  });

  const sedoriCashProfit = soldThisYear.reduce((sum, p) => {
    const salePrice = p.salePrice ?? 0;
    let cost = p.purchasePrice;
    if (p.purchaseBreakdown) {
      cost =
        p.purchaseBreakdown.cash +
        p.purchaseBreakdown.giftCardUsages.reduce((s, u) => s + u.realCost, 0) +
        p.purchaseBreakdown.pointUse;
    }
    return sum + (salePrice - cost);
  }, 0);

  const redemptionTotal = redemptions
    .filter((r) => r.redeemedAt.startsWith(`${thisYear}-`))
    .reduce((sum, r) => sum + r.amount, 0);

  const sedoriTotalProfit = sedoriCashProfit + redemptionTotal;
  const inventoryCount = products.filter((p) => p.status === 'inventory' || p.status === 'pending').length;

  // ケーコジ利益（契約日が今年のもの）
  const keikojiThisYear = keikojiContracts.filter((c) =>
    c.contractedAt.startsWith(`${thisYear}-`)
  );
  const keikojiProfit = keikojiThisYear.reduce((sum, c) => sum + calcKeikojiProfit(c), 0);
  const keikojiActive = keikojiContracts.filter((c) => c.status === 'active').length;

  // 合計
  const totalProfit = sedoriTotalProfit + keikojiProfit;

  return (
    <div className="space-y-6">
      {/* 年間サマリー合計 */}
      <div className="glass-panel p-5">
        <p className="text-xs text-slate-500 font-semibold mb-1">{thisYear}年 副業合計純利益</p>
        <p className={`text-4xl font-black tracking-tight ${totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          ¥{totalProfit.toLocaleString()}
        </p>
        {/* 副業別内訳 */}
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-slate-400 mb-0.5">せどり</p>
            <p className={`text-sm font-bold ${sedoriTotalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              ¥{sedoriTotalProfit.toLocaleString()}
            </p>
            {redemptionTotal > 0 && (
              <p className="text-[10px] text-slate-400">還元+¥{redemptionTotal.toLocaleString()}含む</p>
            )}
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-0.5">ケーコジ</p>
            <p className={`text-sm font-bold ${keikojiProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              ¥{keikojiProfit.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-400">{thisYear}年契約 {keikojiThisYear.length}回線</p>
          </div>
        </div>
      </div>

      {/* 副業カード */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2 px-1">副業一覧</p>
        <div className="space-y-3">
          {/* せどり */}
          <button
            onClick={() => onSelectSection('sedori')}
            className="w-full glass-panel p-5 flex items-center gap-4 hover:bg-white/90 active:scale-[0.98] transition text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-100 to-cyan-100 flex items-center justify-center flex-shrink-0">
              <Package className="w-6 h-6 text-sky-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900">せどり</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {thisYear}年利益{' '}
                <span className={`font-semibold ${sedoriTotalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  ¥{sedoriTotalProfit.toLocaleString()}
                </span>
                　在庫 {inventoryCount}件
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
          </button>

          {/* ケーコジ */}
          <button
            onClick={() => onSelectSection('keikoji')}
            className="w-full glass-panel p-5 flex items-center gap-4 hover:bg-white/90 active:scale-[0.98] transition text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-6 h-6 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900">ケーコジ</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {thisYear}年利益{' '}
                <span className={`font-semibold ${keikojiProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  ¥{keikojiProfit.toLocaleString()}
                </span>
                　運用中 {keikojiActive}回線
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
          </button>

          {/* 年間サマリー */}
          <button
            onClick={() => onSelectSection('annualSummary')}
            className="w-full glass-panel p-5 flex items-center gap-4 hover:bg-white/90 active:scale-[0.98] transition text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900">年間サマリー</p>
              <p className="text-xs text-slate-500 mt-0.5">全副業合算・確定申告用</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
}
