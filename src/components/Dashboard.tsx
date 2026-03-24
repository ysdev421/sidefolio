import { useMemo, useState } from 'react';
import { DollarSign, Package, TrendingUp } from 'lucide-react';
import { calculateProfit, calculateProfitSummary, formatCurrency, getActualPayment, getRemainingActualPayment } from '@/lib/utils';
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
      .reduce((sum, p) => sum + getRemainingActualPayment(p), 0);

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

function buildDailySeries(products: Product[], days = 30) {
  const sold = products.filter((p) => p.status === 'sold' && p.saleDate);
  const now = new Date();
  const entries: { date: string; revenue: number; profit: number; pointProfit: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayProducts = sold.filter((p) => {
      const s = new Date(p.saleDate!);
      return (
        s.getFullYear() === d.getFullYear() &&
        s.getMonth() === d.getMonth() &&
        s.getDate() === d.getDate()
      );
    });
    entries.push({
      date: key,
      revenue: dayProducts.reduce((s, p) => s + (p.salePrice || 0), 0),
      profit: dayProducts.reduce((s, p) => s + calculateProfit(p), 0),
      pointProfit: dayProducts.reduce((s, p) => s + ((p.salePrice || 0) - getActualPayment(p)), 0),
    });
  }
  return entries;
}

function DailyLineChart({
  data,
  metric,
}: {
  data: { date: string; revenue: number; profit: number; pointProfit: number }[];
  metric: 'revenue' | 'profit' | 'pointProfit';
}) {
  const W = 560;
  const H = 140;
  const padL = 10;
  const padR = 10;
  const padT = 12;
  const padB = 20;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const values = data.map((d) => d[metric]);
  const maxVal = Math.max(1, ...values);
  const minVal = Math.min(0, ...values);
  const range = maxVal - minVal || 1;

  const color =
    metric === 'revenue' ? '#0ea5e9' : metric === 'profit' ? '#10b981' : '#6366f1';

  const toX = (i: number) => padL + (i / (data.length - 1)) * innerW;
  const toY = (v: number) => padT + (1 - (v - minVal) / range) * innerH;

  const points = data.map((d, i) => ({ x: toX(i), y: toY(d[metric]) }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // fill area under line
  const areaPath =
    linePath +
    ` L${points[points.length - 1].x.toFixed(1)},${(padT + innerH).toFixed(1)}` +
    ` L${points[0].x.toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  // baseline (y=0)
  const baselineY = toY(0);

  // x-axis labels: show every 5th day
  const labelIndices = data
    .map((_, i) => i)
    .filter((i) => i === 0 || (i + 1) % 5 === 0 || i === data.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
      <defs>
        <linearGradient id={`lg-${metric}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* baseline */}
      <line x1={padL} y1={baselineY} x2={W - padR} y2={baselineY} stroke="#e2e8f0" strokeWidth="1" />

      {/* area fill */}
      <path d={areaPath} fill={`url(#lg-${metric})`} />

      {/* line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* dots on non-zero values */}
      {points.map((p, i) =>
        values[i] !== 0 ? (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
        ) : null
      )}

      {/* x labels */}
      {labelIndices.map((i) => {
        const day = data[i].date.slice(8);
        return (
          <text key={i} x={points[i].x} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {Number(day)}日
          </text>
        );
      })}
    </svg>
  );
}

function momText(value: number | null) {
  if (value === null) return '前月比 -';
  const sign = value >= 0 ? '+' : '';
  return `前月比 ${sign}${value.toFixed(1)}%`;
}

export function Dashboard({ products, showMoM = true }: DashboardProps) {
  const [chartMetric, setChartMetric] = useState<'revenue' | 'profit' | 'pointProfit'>('revenue');
  const [chartView, setChartView] = useState<'monthly' | 'daily'>('monthly');

  const summary = calculateProfitSummary(products);
  const mom = calcMoM(products);
  const inventoryMom = calcInventoryMoM(products);
  const monthly = buildMonthlySeries(products);
  const maxRevenue = Math.max(1, ...monthly.map((m) => m.revenue));
  const maxProfitAbs = Math.max(1, ...monthly.map((m) => Math.max(Math.abs(m.profit), Math.abs(m.pointProfit))));
  const daily = useMemo(() => buildDailySeries(products, 30), [products]);

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
      label: '粗利（現金）',
      value: formatCurrency(summary.totalPointProfit),
      sub: showMoM ? momText(mom.pointProfit) : null,
      subTone: mom.pointProfit === null ? 'text-slate-500' : mom.pointProfit >= 0 ? 'text-emerald-600' : 'text-rose-600',
      icon: TrendingUp,
      tone: 'from-emerald-100 to-green-100 text-emerald-700',
      negative: summary.totalPointProfit < 0,
    },
    {
      label: '粗利（P含む）',
      value: formatCurrency(summary.totalProfit),
      sub: showMoM ? momText(mom.profit) : null,
      subTone: mom.profit === null ? 'text-slate-500' : mom.profit >= 0 ? 'text-emerald-600' : 'text-rose-600',
      icon: TrendingUp,
      tone: 'from-teal-100 to-emerald-100 text-teal-700',
      negative: summary.totalProfit < 0,
    },
    {
      label: '在庫金額',
      value: formatCurrency(summary.inventoryValue),
      sub: showMoM ? momText(inventoryMom) : null,
      subTone: inventoryMom === null ? 'text-slate-500' : inventoryMom >= 0 ? 'text-emerald-600' : 'text-rose-600',
      icon: Package,
      tone: 'from-amber-100 to-orange-100 text-amber-700',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="card p-3 sm:p-4">
              <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br ${stat.tone} flex items-center justify-center mb-2 sm:mb-3`}>
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <p className="text-xs text-soft font-semibold tracking-wide">{stat.label}</p>
              <p className={`text-lg sm:text-2xl font-black mt-1 truncate ${stat.negative ? 'text-rose-600' : 'text-slate-900'}`}>{stat.value}</p>
              {stat.sub && <p className={`text-xs mt-1 font-semibold ${stat.subTone}`}>{stat.sub}</p>}
            </div>
          );
        })}
      </div>

      <div className="glass-panel p-5 bg-gradient-to-br from-white/80 to-cyan-50/70">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800">グラフ</h3>
            <div className="glass-panel p-0.5 inline-flex gap-0.5">
              <button
                onClick={() => setChartView('monthly')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${chartView === 'monthly' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
              >
                月次
              </button>
              <button
                onClick={() => setChartView('daily')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${chartView === 'daily' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
              >
                日次
              </button>
            </div>
          </div>
          <p className="text-xs text-soft">{chartView === 'monthly' ? '直近6か月' : '直近30日'}</p>
        </div>

        <div className="glass-panel p-1 mb-3 inline-flex gap-1">
          <button onClick={() => setChartMetric('revenue')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'revenue' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>売上</button>
          <button onClick={() => setChartMetric('profit')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'profit' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>利益</button>
          <button onClick={() => setChartMetric('pointProfit')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'pointProfit' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>P利益</button>
        </div>

        {chartView === 'monthly' ? (
          monthly.length === 0 ? (
            <p className="text-sm text-soft">売却データがありません</p>
          ) : (
            <div className="grid grid-cols-6 gap-2 items-end h-40">
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
          )
        ) : (
          daily.every((d) => d[chartMetric] === 0) ? (
            <p className="text-sm text-soft">直近30日の売却データがありません</p>
          ) : (
            <DailyLineChart data={daily} metric={chartMetric} />
          )
        )}
      </div>

      <div className="glass-panel p-5 bg-gradient-to-br from-white/80 to-cyan-50/70">
        <h3 className="font-bold text-slate-800 mb-3">サマリー</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
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
            <p className="text-soft">利益率（P含む）</p>
            <p className="font-bold text-lg text-slate-900">
              {summary.totalRevenue > 0 ? `${((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1)}%` : '0%'}
            </p>
          </div>
          <div>
            <p className="text-soft">利益率（現金）</p>
            <p className="font-bold text-lg text-slate-900">
              {summary.totalRevenue > 0 ? `${((summary.totalPointProfit / summary.totalRevenue) * 100).toFixed(1)}%` : '0%'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
