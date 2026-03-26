import { useMemo, useState } from 'react';
import { DollarSign, Package, TrendingUp } from 'lucide-react';
import { calculateProfit, calculatePointProfit, calculateProfitSummary, formatCurrency, getActualPayment, getRemainingActualPayment } from '@/lib/utils';
import type { Product } from '@/types';

interface DashboardProps {
  products: Product[];
  allProducts: Product[];
  periodFilter: 'thisMonth' | 'lastMonth' | 'thisYear' | 'all';
  showMoM?: boolean;
}

function getMonthKey(dateString?: string): string | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// summaryProducts と同じ日付選択ロジック: 売却済みかつsaleDateあり → saleDate、それ以外 → purchaseDate
function getProductMonthKey(p: Product): string | null {
  const dateStr = p.status === 'sold' && p.saleDate ? p.saleDate : p.purchaseDate;
  return getMonthKey(dateStr);
}

function calcMoM(allProducts: Product[], periodFilter: string) {
  const sold = allProducts.filter((p) => p.status === 'sold');
  const now = new Date();

  let currentKey: string;
  let prevKey: string;

  if (periodFilter === 'thisMonth') {
    currentKey = toMonthKey(now);
    prevKey = toMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  } else if (periodFilter === 'lastMonth') {
    currentKey = toMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    prevKey = toMonthKey(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  } else {
    // 全期間・今年: データ内の直近2ヶ月を比較
    const monthKeys = Array.from(new Set(sold.map((p) => getProductMonthKey(p)).filter(Boolean))).sort() as string[];
    currentKey = monthKeys[monthKeys.length - 1] ?? '';
    prevKey = monthKeys[monthKeys.length - 2] ?? '';
  }

  if (!currentKey || !prevKey) {
    return { revenue: null as number | null, profit: null as number | null, pointProfit: null as number | null };
  }

  const sumByMonth = (key: string) => {
    const target = sold.filter((p) => getProductMonthKey(p) === key);
    return {
      revenue: target.reduce((s, p) => s + (p.salePrice || 0), 0),
      profit: target.reduce((s, p) => s + calculateProfit(p), 0),
      pointProfit: target.reduce((s, p) => s + calculatePointProfit(p), 0),
    };
  };

  const cur = sumByMonth(currentKey);
  const prv = sumByMonth(prevKey);

  const calc = (c: number, p: number) => (p === 0 ? null : ((c - p) / Math.abs(p)) * 100);
  return {
    revenue: calc(cur.revenue, prv.revenue),
    profit: calc(cur.profit, prv.profit),
    pointProfit: calc(cur.pointProfit, prv.pointProfit),
  };
}

function calcInventoryMoM(allProducts: Product[], periodFilter: string) {
  const inventory = allProducts.filter((p) => p.status === 'inventory' && p.purchaseDate);
  const now = new Date();

  let currentKey: string;
  let prevKey: string;

  if (periodFilter === 'thisMonth') {
    currentKey = toMonthKey(now);
    prevKey = toMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  } else if (periodFilter === 'lastMonth') {
    currentKey = toMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    prevKey = toMonthKey(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  } else {
    const monthKeys = Array.from(new Set(inventory.map((p) => getMonthKey(p.purchaseDate)).filter(Boolean))).sort() as string[];
    currentKey = monthKeys[monthKeys.length - 1] ?? '';
    prevKey = monthKeys[monthKeys.length - 2] ?? '';
  }

  if (!currentKey || !prevKey) return null;

  const sum = (key: string) => inventory.filter((p) => getMonthKey(p.purchaseDate) === key).reduce((s, p) => s + getRemainingActualPayment(p), 0);
  const cur = sum(currentKey);
  const prv = sum(prevKey);
  return prv === 0 ? null : ((cur - prv) / Math.abs(prv)) * 100;
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
  return Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, values]) => ({ month, ...values }));
}

function buildSaleLocationSeries(products: Product[]) {
  const sold = products.filter((p) => p.status === 'sold' && p.saleLocation);
  const map = new Map<string, number>();
  for (const p of sold) {
    const loc = p.saleLocation || '不明';
    map.set(loc, (map.get(loc) || 0) + (p.salePrice || 0));
  }
  return Array.from(map.entries()).sort(([, a], [, b]) => b - a).map(([label, value]) => ({ label, value }));
}

function buildPurchaseLocationSeries(products: Product[]) {
  const map = new Map<string, number>();
  for (const p of products) {
    const loc = p.purchaseLocation || '不明';
    map.set(loc, (map.get(loc) || 0) + (p.purchasePrice || 0));
  }
  return Array.from(map.entries()).sort(([, a], [, b]) => b - a).map(([label, value]) => ({ label, value }));
}

const PIE_COLORS = ['#0ea5e9', '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-sm text-soft">売却データがありません</p>;

  const R = 52;
  const r = 30;
  const cx = 60;
  const cy = 60;

  const polarToXY = (angle: number, radius: number) => ({
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  });

  let startAngle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const mid = startAngle + angle / 2;
    const slice = { ...d, startAngle, endAngle, mid, color: PIE_COLORS[i % PIE_COLORS.length] };
    startAngle = endAngle;
    return slice;
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0">
        {slices.length === 1 ? (
          <>
            <circle cx={cx} cy={cy} r={R} fill={slices[0].color} />
            <circle cx={cx} cy={cy} r={r} fill="white" />
          </>
        ) : slices.map((s, i) => {
          const start = polarToXY(s.startAngle, R);
          const end = polarToXY(s.endAngle, R);
          const startInner = polarToXY(s.startAngle, r);
          const endInner = polarToXY(s.endAngle, r);
          const large = s.endAngle - s.startAngle > Math.PI ? 1 : 0;
          const d = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} L ${endInner.x.toFixed(2)} ${endInner.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${startInner.x.toFixed(2)} ${startInner.y.toFixed(2)} Z`;
          return <path key={i} d={d} fill={s.color} />;
        })}
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0 w-full">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="truncate text-slate-700 flex-1">{s.label}</span>
            <span className="font-semibold text-slate-900 shrink-0">{formatCurrency(s.value)}</span>
            <span className="text-slate-400 shrink-0">{((s.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}




function momText(value: number | null) {
  if (value === null) return '前月比 -';
  const sign = value >= 0 ? '+' : '';
  return `前月比 ${sign}${value.toFixed(1)}%`;
}

export function Dashboard({ products, allProducts, periodFilter, showMoM = true }: DashboardProps) {
  const [chartMetric, setChartMetric] = useState<'revenue' | 'profit' | 'pointProfit'>('revenue');

  const summary = calculateProfitSummary(products);
  const mom = calcMoM(allProducts, periodFilter);
  const inventoryMom = calcInventoryMoM(allProducts, periodFilter);
  const monthly = buildMonthlySeries(allProducts);
  const maxRevenue = Math.max(1, ...monthly.map((m) => m.revenue));
  const maxProfitAbs = Math.max(1, ...monthly.map((m) => Math.max(Math.abs(m.profit), Math.abs(m.pointProfit))));
  const saleLocations = useMemo(() => buildSaleLocationSeries(products), [products]);
  const purchaseLocations = useMemo(() => buildPurchaseLocationSeries(products), [products]);

  const stats = [
    { label: '総売上', value: formatCurrency(summary.totalRevenue), sub: showMoM ? momText(mom.revenue) : null, subTone: mom.revenue === null ? 'text-slate-500' : mom.revenue >= 0 ? 'text-emerald-600' : 'text-rose-600', icon: DollarSign, tone: 'from-sky-100 to-cyan-100 text-sky-700' },
    { label: '粗利', value: formatCurrency(summary.totalPointProfit), sub: showMoM ? momText(mom.pointProfit) : null, subTone: mom.pointProfit === null ? 'text-slate-500' : mom.pointProfit >= 0 ? 'text-emerald-600' : 'text-rose-600', icon: TrendingUp, tone: 'from-emerald-100 to-green-100 text-emerald-700', negative: summary.totalPointProfit < 0, positive: summary.totalPointProfit > 0, positiveBlue: true },
    { label: '粗利（P含む）', value: formatCurrency(summary.totalProfit), sub: showMoM ? momText(mom.profit) : null, subTone: mom.profit === null ? 'text-slate-500' : mom.profit >= 0 ? 'text-emerald-600' : 'text-rose-600', icon: TrendingUp, tone: 'from-teal-100 to-emerald-100 text-teal-700', negative: summary.totalProfit < 0, positive: summary.totalProfit > 0, positiveBlue: true },
    { label: '在庫金額', value: formatCurrency(summary.inventoryValue), sub: showMoM ? momText(inventoryMom) : null, subTone: inventoryMom === null ? 'text-slate-500' : inventoryMom >= 0 ? 'text-emerald-600' : 'text-rose-600', icon: Package, tone: 'from-amber-100 to-orange-100 text-amber-700' },
  ];

  return (
    <div className="space-y-4">
      {/* 統計カード（横並びレイアウト） */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="card p-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.tone} flex items-center justify-center shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-soft font-semibold tracking-wide">{stat.label}</p>
                <p className={`text-base sm:text-lg font-black truncate ${(stat as any).negative ? 'text-rose-600' : (stat as any).positive ? ('text-emerald-600') : 'text-slate-900'}`}>{stat.value}</p>
                {stat.sub && <p className={`text-xs font-semibold ${stat.subTone}`}>{stat.sub}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* 円グラフ 2列 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-panel p-4 bg-gradient-to-br from-white/80 to-cyan-50/70">
          <p className="text-xs font-semibold text-slate-600 mb-3">売却先別売上</p>
          <DonutChart data={saleLocations} />
        </div>
        <div className="glass-panel p-4 bg-gradient-to-br from-white/80 to-cyan-50/70">
          <p className="text-xs font-semibold text-slate-600 mb-3">購入先別仕入れ</p>
          <DonutChart data={purchaseLocations} />
        </div>
      </div>

      {/* 月次グラフ */}
      <div className="glass-panel p-5 bg-gradient-to-br from-white/80 to-cyan-50/70">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-bold text-slate-800">月次</h3>
          <div className="glass-panel p-1 inline-flex gap-1">
            <button onClick={() => setChartMetric('revenue')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'revenue' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>売上</button>
            <button onClick={() => setChartMetric('profit')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'profit' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>利益</button>
            <button onClick={() => setChartMetric('pointProfit')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'pointProfit' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>P利益</button>
          </div>
        </div>
        {monthly.length === 0 ? (
          <p className="text-sm text-soft">売却データがありません</p>
        ) : (
          <div className="grid grid-cols-6 gap-2 items-end h-40">
            {monthly.map((m) => {
              const value = chartMetric === 'revenue' ? m.revenue : chartMetric === 'profit' ? m.profit : m.pointProfit;
              const max = chartMetric === 'revenue' ? maxRevenue : maxProfitAbs;
              const positive = value >= 0;
              const barClass = chartMetric === 'revenue' ? 'bg-gradient-to-t from-sky-500 to-cyan-400' : positive ? chartMetric === 'profit' ? 'bg-gradient-to-t from-emerald-500 to-emerald-400' : 'bg-gradient-to-t from-indigo-500 to-indigo-400' : 'bg-gradient-to-t from-rose-500 to-rose-400';
              return (
                <div key={m.month} className="flex flex-col items-center justify-end h-full">
                  <div className="w-full h-full flex items-end">
                    <div className={`w-full rounded-t-md ${barClass}`} style={{ height: `${Math.max(8, (Math.abs(value) / max) * 100)}%` }} title={`${m.month}: ${formatCurrency(value)}`} />
                  </div>
                  <div className="text-[10px] text-soft mt-1">{m.month.slice(5)}月</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* サマリー */}
      <div className="glass-panel p-5 bg-gradient-to-br from-white/80 to-cyan-50/70">
        <h3 className="font-bold text-slate-800 mb-3">サマリー</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div><p className="text-soft">商品数</p><p className="font-bold text-lg text-slate-900">{summary.totalProducts}</p></div>
          <div><p className="text-soft">売却済み</p><p className="font-bold text-lg text-emerald-700">{summary.soldCount}</p></div>
          <div><p className="text-soft">待機/未着</p><p className="font-bold text-lg text-slate-900">{summary.waitingCount}</p></div>
          <div>
            <p className="text-soft">利益率（P含む）</p>
            <p className="font-bold text-lg text-slate-900">{summary.totalRevenue > 0 ? `${((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1)}%` : '0%'}</p>
          </div>
          <div>
            <p className="text-soft">利益率（現金）</p>
            <p className="font-bold text-lg text-slate-900">{summary.totalRevenue > 0 ? `${((summary.totalPointProfit / summary.totalRevenue) * 100).toFixed(1)}%` : '0%'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
