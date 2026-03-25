import { useMemo, useState } from 'react';
import { DollarSign, Package, TrendingUp } from 'lucide-react';
import { calculateProfit, calculateProfitSummary, formatCurrency, getActualPayment, getRemainingActualPayment } from '@/lib/utils';
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

function calcMoM(allProducts: Product[], periodFilter: string) {
  const sold = allProducts.filter((p) => p.status === 'sold' && p.saleDate);
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
    const monthKeys = Array.from(new Set(sold.map((p) => getMonthKey(p.saleDate)).filter(Boolean))).sort() as string[];
    currentKey = monthKeys[monthKeys.length - 1] ?? '';
    prevKey = monthKeys[monthKeys.length - 2] ?? '';
  }

  if (!currentKey || !prevKey) {
    return { revenue: null as number | null, profit: null as number | null, pointProfit: null as number | null };
  }

  const sumByMonth = (key: string) => {
    const target = sold.filter((p) => getMonthKey(p.saleDate) === key);
    return {
      revenue: target.reduce((s, p) => s + (p.salePrice || 0), 0),
      profit: target.reduce((s, p) => s + calculateProfit(p), 0),
      pointProfit: target.reduce((s, p) => s + ((p.salePrice || 0) - getActualPayment(p)), 0),
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

function buildDailySeries(products: Product[], days = 30) {
  const sold = products.filter((p) => p.status === 'sold' && p.saleDate);
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayProducts = sold.filter((p) => {
      const s = new Date(p.saleDate!);
      return s.getFullYear() === d.getFullYear() && s.getMonth() === d.getMonth() && s.getDate() === d.getDate();
    });
    return {
      date: key,
      revenue: dayProducts.reduce((s, p) => s + (p.salePrice || 0), 0),
      profit: dayProducts.reduce((s, p) => s + calculateProfit(p), 0),
      pointProfit: dayProducts.reduce((s, p) => s + ((p.salePrice || 0) - getActualPayment(p)), 0),
    };
  });
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
        {slices.map((s, i) => {
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

function DailyLineChart({ data, metric }: { data: { date: string; revenue: number; profit: number; pointProfit: number }[]; metric: 'revenue' | 'profit' | 'pointProfit' }) {
  const W = 560; const H = 140; const padL = 10; const padR = 10; const padT = 12; const padB = 20;
  const innerW = W - padL - padR; const innerH = H - padT - padB;
  const values = data.map((d) => d[metric]);
  const maxVal = Math.max(1, ...values); const minVal = Math.min(0, ...values); const range = maxVal - minVal || 1;
  const color = metric === 'revenue' ? '#0ea5e9' : metric === 'profit' ? '#10b981' : '#6366f1';
  const toX = (i: number) => padL + (i / (data.length - 1)) * innerW;
  const toY = (v: number) => padT + (1 - (v - minVal) / range) * innerH;
  const points = data.map((d, i) => ({ x: toX(i), y: toY(d[metric]) }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L${points[points.length - 1].x.toFixed(1)},${(padT + innerH).toFixed(1)} L${points[0].x.toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const baselineY = toY(0);
  const labelIndices = data.map((_, i) => i).filter((i) => i === 0 || (i + 1) % 5 === 0 || i === data.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
      <defs>
        <linearGradient id={`lg-${metric}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={padL} y1={baselineY} x2={W - padR} y2={baselineY} stroke="#e2e8f0" strokeWidth="1" />
      <path d={areaPath} fill={`url(#lg-${metric})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => values[i] !== 0 ? <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} /> : null)}
      {labelIndices.map((i) => (
        <text key={i} x={points[i].x} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">{Number(data[i].date.slice(8))}日</text>
      ))}
    </svg>
  );
}

// ─── 評価コメント ────────────────────────────────────────

type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | '-';

interface Evaluation {
  grade: Grade;
  comment: string;
  gradeBg: string;
  gradeText: string;
  bannerBg: string;
}

function getEvaluation(
  soldCount: number,
  profitRate: number,   // 売上に対する利益率（P含む）
  momProfit: number | null
): Evaluation {
  if (soldCount < 3) {
    return {
      grade: '-',
      comment: 'まだデータが少ないです。3件以上売却すると評価が表示されます。',
      gradeBg: 'bg-slate-100',
      gradeText: 'text-slate-500',
      bannerBg: 'from-slate-50 to-slate-100',
    };
  }

  const trend =
    momProfit === null ? 'neutral'
    : momProfit >= 10 ? 'up'
    : momProfit <= -10 ? 'down'
    : 'neutral';

  if (profitRate >= 25) {
    const comments: Record<typeof trend, string> = {
      up: '絶好調です！利益率・伸びともに優秀。この調子で仕入れを加速しましょう。',
      neutral: '高い利益率をキープしています。仕入れ量を増やすチャンスかもしれません。',
      down: '利益率は高水準ですが伸びが鈍化しています。仕入れ単価を見直してみては？',
    };
    return { grade: 'S', comment: comments[trend], gradeBg: 'bg-gradient-to-br from-amber-400 to-yellow-300', gradeText: 'text-white', bannerBg: 'from-amber-50 to-yellow-50' };
  }

  if (profitRate >= 15) {
    const comments: Record<typeof trend, string> = {
      up: '好調です。利益率・伸びともに良好。このペースを維持しましょう。',
      neutral: '安定した利益が出ています。さらに利益率を伸ばす商材を探してみましょう。',
      down: '利益率は良好ですが前期より落ちています。仕入れ先の見直しを検討してみては？',
    };
    return { grade: 'A', comment: comments[trend], gradeBg: 'bg-gradient-to-br from-emerald-500 to-green-400', gradeText: 'text-white', bannerBg: 'from-emerald-50 to-green-50' };
  }

  if (profitRate >= 5) {
    const comments: Record<typeof trend, string> = {
      up: '改善中です！利益率をさらに上げることを意識しましょう。',
      neutral: '利益は出ていますが利益率はまだ改善の余地があります。高利益商材の開拓を。',
      down: '利益率が低下しています。仕入れコストを見直しましょう。',
    };
    return { grade: 'B', comment: comments[trend], gradeBg: 'bg-gradient-to-br from-sky-500 to-blue-400', gradeText: 'text-white', bannerBg: 'from-sky-50 to-blue-50' };
  }

  if (profitRate >= 0) {
    const comments: Record<typeof trend, string> = {
      up: '損益分岐点付近ですが改善の兆しがあります。高利益商品を増やしましょう。',
      neutral: '利益が薄い状態です。仕入れ価格か販売価格の見直しが必要です。',
      down: '損益分岐点付近で悪化傾向です。早めに戦略を見直してください。',
    };
    return { grade: 'C', comment: comments[trend], gradeBg: 'bg-gradient-to-br from-amber-500 to-orange-400', gradeText: 'text-white', bannerBg: 'from-amber-50 to-orange-50' };
  }

  return {
    grade: 'D',
    comment: '損失が出ています。仕入れ方針を早急に見直してください。利益率の高い商材へのシフトを検討しましょう。',
    gradeBg: 'bg-gradient-to-br from-rose-500 to-red-500',
    gradeText: 'text-white',
    bannerBg: 'from-rose-50 to-red-50',
  };
}

function EvaluationBanner({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${evaluation.bannerBg} border border-white/60 p-4 flex items-start gap-3`}>
      <div className={`${evaluation.gradeBg} ${evaluation.gradeText} w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm`}>
        <span className="text-lg font-black">{evaluation.grade}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 mb-0.5">AI評価</p>
        <p className="text-sm text-slate-800 leading-relaxed">{evaluation.comment}</p>
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
  const isShortPeriod = periodFilter === 'thisMonth' || periodFilter === 'lastMonth';
  const [chartMetric, setChartMetric] = useState<'revenue' | 'profit' | 'pointProfit'>('revenue');
  const [chartView, setChartView] = useState<'pie' | 'monthly' | 'daily'>(isShortPeriod ? 'pie' : 'monthly');

  const summary = calculateProfitSummary(products);
  const mom = calcMoM(allProducts, periodFilter);
  const profitRate = summary.totalRevenue > 0 ? (summary.totalProfit / summary.totalRevenue) * 100 : 0;
  const evaluation = getEvaluation(summary.soldCount, profitRate, mom.profit);
  const inventoryMom = calcInventoryMoM(allProducts, periodFilter);
  const monthly = buildMonthlySeries(allProducts);
  const maxRevenue = Math.max(1, ...monthly.map((m) => m.revenue));
  const maxProfitAbs = Math.max(1, ...monthly.map((m) => Math.max(Math.abs(m.profit), Math.abs(m.pointProfit))));
  const daily = useMemo(() => buildDailySeries(products, 30), [products]);
  const saleLocations = useMemo(() => buildSaleLocationSeries(products), [products]);

  const stats = [
    { label: '総売上', value: formatCurrency(summary.totalRevenue), sub: showMoM ? momText(mom.revenue) : null, subTone: mom.revenue === null ? 'text-slate-500' : mom.revenue >= 0 ? 'text-emerald-600' : 'text-rose-600', icon: DollarSign, tone: 'from-sky-100 to-cyan-100 text-sky-700' },
    { label: '粗利（現金）', value: formatCurrency(summary.totalPointProfit), sub: showMoM ? momText(mom.pointProfit) : null, subTone: mom.pointProfit === null ? 'text-slate-500' : mom.pointProfit >= 0 ? 'text-emerald-600' : 'text-rose-600', icon: TrendingUp, tone: 'from-emerald-100 to-green-100 text-emerald-700', negative: summary.totalPointProfit < 0 },
    { label: '粗利（P含む）', value: formatCurrency(summary.totalProfit), sub: showMoM ? momText(mom.profit) : null, subTone: mom.profit === null ? 'text-slate-500' : mom.profit >= 0 ? 'text-emerald-600' : 'text-rose-600', icon: TrendingUp, tone: 'from-teal-100 to-emerald-100 text-teal-700', negative: summary.totalProfit < 0 },
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
                <p className={`text-base sm:text-lg font-black truncate ${(stat as any).negative ? 'text-rose-600' : 'text-slate-900'}`}>{stat.value}</p>
                {stat.sub && <p className={`text-xs font-semibold ${stat.subTone}`}>{stat.sub}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* グラフ */}
      <div className="glass-panel p-5 bg-gradient-to-br from-white/80 to-cyan-50/70">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800">グラフ</h3>
            <div className="glass-panel p-0.5 inline-flex gap-0.5">
              {isShortPeriod && (
                <button onClick={() => setChartView('pie')} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${chartView === 'pie' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                  円グラフ
                </button>
              )}
              {!isShortPeriod && (
                <button onClick={() => setChartView('monthly')} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${chartView === 'monthly' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                  月次
                </button>
              )}
              <button onClick={() => setChartView('daily')} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${chartView === 'daily' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                日次
              </button>
            </div>
          </div>
          <p className="text-xs text-soft">
            {chartView === 'pie' ? '売却先別売上' : chartView === 'monthly' ? '直近6か月' : '直近30日'}
          </p>
        </div>

        {chartView !== 'pie' && (
          <div className="glass-panel p-1 mb-3 inline-flex gap-1">
            <button onClick={() => setChartMetric('revenue')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'revenue' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>売上</button>
            <button onClick={() => setChartMetric('profit')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'profit' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>利益</button>
            <button onClick={() => setChartMetric('pointProfit')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${chartMetric === 'pointProfit' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>P利益</button>
          </div>
        )}

        {chartView === 'pie' ? (
          <DonutChart data={saleLocations} />
        ) : chartView === 'monthly' ? (
          monthly.length === 0 ? (
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
          )
        ) : (
          daily.every((d) => d[chartMetric] === 0) ? (
            <p className="text-sm text-soft">直近30日の売却データがありません</p>
          ) : (
            <DailyLineChart data={daily} metric={chartMetric} />
          )
        )}
      </div>

      {/* サマリー */}
      <div className="glass-panel p-5 bg-gradient-to-br from-white/80 to-cyan-50/70 space-y-4">
        <EvaluationBanner evaluation={evaluation} />
        <h3 className="font-bold text-slate-800">サマリー</h3>
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
