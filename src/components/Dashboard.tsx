import { useState } from 'react';
import { DollarSign, Package, TrendingUp } from 'lucide-react';
import { calculateProfit, calculateProfitSummary, formatCurrency, getActualPayment } from '@/lib/utils';
import type { Product } from '@/types';

interface DashboardProps {
  products: Product[];
  showMoM?: boolean;
}

function getMonthKey(dateString?: string): string | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function calcMoM(products: Product[]) {
  const sold = products.filter((p) => p.status === 'sold' && p.saleDate);
  const monthKeys = Array.from(new Set(sold.map((p) => getMonthKey(p.saleDate)).filter(Boolean))).sort();
  const current = monthKeys[monthKeys.length - 1];
  const prev = monthKeys[monthKeys.length - 2];

  if (!current || !prev) {
    return { revenue: null as number | null, profit: null as number | null, pointProfit: null as number | null };
  }

  const sumByMonth = (monthKey: string) => {
    const target = sold.filter((p) => getMonthKey(p.saleDate) === monthKey);
    return {
      revenue: target.reduce((sum, p) => sum + (p.salePrice || 0), 0),
      profit: target.reduce((sum, p) => sum + calculateProfit(p), 0),
      pointProfit: target.reduce((sum, p) => sum + ((p.salePrice || 0) - getActualPayment(p)), 0),
    };
  };

  const cur = sumByMonth(current);
  const prv = sumByMonth(prev);

  const calc = (currentVal: number, prevVal: number) => {
    if (prevVal === 0) return null;
    return ((currentVal - prevVal) / Math.abs(prevVal)) * 100;
  };

  return {
    revenue: calc(cur.revenue, prv.revenue),
    profit: calc(cur.profit, prv.profit),
    pointProfit: calc(cur.pointProfit, prv.pointProfit),
  };
}

function calcInventoryMoM(products: Product[]) {
  const inventory = products.filter((p) => p.status === 'inventory' && p.purchaseDate);
  const monthKeys = Array.from(new Set(inventory.map((p) => getMonthKey(p.purchaseDate)).filter(Boolean))).sort();
  const current = monthKeys[monthKeys.length - 1];
  const prev = monthKeys[monthKeys.length - 2];

  if (!current || !prev) return null;

  const sumByMonth = (monthKey: string) =>
    inventory
      .filter((p) => getMonthKey(p.purchaseDate) === monthKey)
      .reduce((sum, p) => sum + getActualPayment(p), 0);

  const cur = sumByMonth(current);
  const prv = sumByMonth(prev);
  if (prv === 0) return null;

  return ((cur - prv) / Math.abs(prv)) * 100;
}

function buildMonthlySeries(products: Product[]) {
  const sold = products.filter((p) => p.status === 'sold' && p.saleDate);
  const monthMap = new Map<string, { revenue: number; profit: number; pointProfit: number }>();

  for (const p of sold) {
    const key = getMonthKey(p.saleDate);
    if (!key) continue;
    const cur = monthMap.get(key) || { revenue: 0, profit: 0, pointProfit: 0 };
    cur.revenue += p.salePrice || 0;
    cur.profit += calculateProfit(p);
    cur.pointProfit += (p.salePrice || 0) - getActualPayment(p);
    monthMap.set(key, cur);
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, values]) => ({ month, ...values }));
}

function momText(value: number | null) {
  if (value === null) return '前月比 -';
  const sign = value >= 0 ? '+' : '';
  return `前月比 ${sign}${value.toFixed(1)}%`;
}

export function Dashboard({ products, showMoM = true }: DashboardProps) {
  const [chartMetric, setChartMetric] = useState<'revenue' | 'profit' | 'pointProfit'>('revenue');

  const summary = calculateProfitSummary(products);
  const mom = calcMoM(products);
  const inventoryMom = calcInventoryMoM(products);
  const monthly = buildMonthlySeries(products);
  const maxRevenue = Math.max(1, ...monthly.map((m) => m.revenue));
  const maxProfitAbs = Math.max(1, ...monthly.map((m) => Math.max(Math.abs(m.profit), Math.abs(m.pointProfit))));

  const stats = [
    {
      label: '総売上',
      value: formatCurrency(summary.totalRevenue),
      sub: showMoM ? momText(mom.revenue) : null,
      subTone: mom.revenue === null ? 'text-slate-500' : mom.revenue >= 0 ? 'text-emerald-600' : 'text-rose-600',
      icon: DollarSign,
      tone: 'from-sky-100 to-cyan-100 text-sky-700',
    },
    {
      label: '総利益',
      value: formatCurrency(summary.totalProfit),
      sub: showMoM ? momText(mom.profit) : null,
      subTone: mom.profit === null ? 'text-slate-500' : mom.profit >= 0 ? 'text-emerald-600' : 'text-rose-600',
      icon: TrendingUp,
      tone: 'from-emerald-100 to-green-100 text-emerald-700',
      negative: summary.totalProfit < 0,
    },
    {
      label: 'P利益',
      value: formatCurrency(summary.totalPointProfit),
      sub: showMoM ? momText(mom.pointProfit) : null,
      subTone: mom.pointProfit === null ? 'text-slate-500' : mom.pointProfit >= 0 ? 'text-emerald-600' : 'text-rose-600',
      icon: TrendingUp,
      tone: 'from-teal-100 to-emerald-100 text-teal-700',
    },
    {
      label: '在庫評価',
      value: formatCurrency(summary.inventoryValue),
      sub: showMoM ? momText(inventoryMom) : null,
      subTone: inventoryMom === null ? 'text-slate-500' : inventoryMom >= 0 ? 'text-emerald-600' : 'text-rose-600',
      icon: Package,
      tone: 'from-amber-100 to-orange-100 text-amber-700',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="card p-4">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${stat.tone} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-xs text-soft font-semibold tracking-wide">{stat.label}</p>
              <p className={`text-2xl font-black mt-1 ${stat.negative ? 'text-rose-600' : 'text-slate-900'}`}>{stat.value}</p>
              {stat.sub && <p className={`text-xs mt-1 font-semibold ${stat.subTone}`}>{stat.sub}</p>}
            </div>
          );
        })}
      </div>

      <div className="glass-panel p-5 bg-gradient-to-br from-white/80 to-cyan-50/70">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800">月次グラフ</h3>
          <p className="text-xs text-soft">直近6か月</p>
        </div>

        <div className="glass-panel p-1 mb-3 inline-flex gap-1">
          <button onClick={() => setChartMetric('revenue')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'revenue' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>売上</button>
          <button onClick={() => setChartMetric('profit')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'profit' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>利益</button>
          <button onClick={() => setChartMetric('pointProfit')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'pointProfit' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>P利益</button>
        </div>

        {monthly.length === 0 ? (
          <p className="text-sm text-soft">売却データがありません</p>
        ) : (
          <div className="grid grid-cols-6 gap-2 items-end h-48">
            {monthly.map((m) => {
              const value = chartMetric === 'revenue' ? m.revenue : chartMetric === 'profit' ? m.profit : m.pointProfit;
              const max = chartMetric === 'revenue' ? maxRevenue : maxProfitAbs;
              const positive = value >= 0;
              const barClass =
                chartMetric === 'revenue'
                  ? 'bg-gradient-to-t from-sky-500 to-cyan-400'
                  : positive
                  ? chartMetric === 'profit'
                    ? 'bg-gradient-to-t from-emerald-500 to-emerald-400'
                    : 'bg-gradient-to-t from-indigo-500 to-indigo-400'
                  : 'bg-gradient-to-t from-rose-500 to-rose-400';

              return (
                <div key={m.month} className="flex flex-col items-center justify-end h-full">
                  <div className="w-full h-full flex items-end">
                    <div
                      className={`w-full rounded-t-md ${barClass}`}
                      style={{ height: `${Math.max(8, (Math.abs(value) / max) * 100)}%` }}
                      title={`${m.month} ${chartMetric === 'revenue' ? '売上' : chartMetric === 'profit' ? '利益' : 'P利益'}: ${formatCurrency(value)}`}
                    />
                  </div>
                  <div className="text-[10px] text-soft mt-1">{m.month.slice(5)}月</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="glass-panel p-5 bg-gradient-to-br from-white/80 to-cyan-50/70">
        <h3 className="font-bold text-slate-800 mb-3">サマリー</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-soft">商品数</p>
            <p className="font-bold text-lg text-slate-900">{summary.totalProducts}</p>
          </div>
          <div>
            <p className="text-soft">売却済み</p>
            <p className="font-bold text-lg text-emerald-700">{summary.soldCount}</p>
          </div>
          <div>
            <p className="text-soft">待機/未着</p>
            <p className="font-bold text-lg text-slate-900">{summary.waitingCount}</p>
          </div>
          <div>
            <p className="text-soft">利益率</p>
            <p className="font-bold text-lg text-slate-900">
              {summary.totalRevenue > 0 ? `${((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1)}%` : '0%'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
