import { useEffect, useMemo, useState } from 'react';
import { Copy, Search, SlidersHorizontal } from 'lucide-react';
import { RichDatePicker } from '@/components/RichDatePicker';
import { EditProductForm } from './EditProductForm';
import { calculatePointProfit, copyToClipboard, formatCurrency, formatDate, getEffectiveCost } from '@/lib/utils';
import type { Product } from '@/types';

interface ProductListProps {
  products: Product[];
  userId: string;
  onDelete: (id: string) => void;
  initialListTab?: ListTab;
  hideTabSelector?: boolean;
}

type ListTab = 'all' | 'pending' | 'inventory' | 'sold' | 'janInventory';
type SortKey = 'purchaseDateDesc' | 'profitDesc' | 'salePriceDesc';
type PeriodPreset = 'last30' | 'last60' | 'last90' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'all' | 'custom';

const toTime = (dateString?: string) => {
  if (!dateString) return 0;
  const t = new Date(dateString).getTime();
  return Number.isNaN(t) ? 0 : t;
};

export function ProductList({ products, userId, onDelete, initialListTab, hideTabSelector = false }: ProductListProps) {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [copiedProductId, setCopiedProductId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const [listTab, setListTab] = useState<ListTab>(initialListTab || 'all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [sortKey, setSortKey] = useState<SortKey>('purchaseDateDesc');
  const [showFilters, setShowFilters] = useState(false);
  const [showDateRange, setShowDateRange] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('productListFilters');
      if (!raw) return;
      const saved = JSON.parse(raw) as any;
      if (typeof saved.query === 'string') setQuery(saved.query);
      if (!initialListTab && typeof saved.listTab === 'string') {
        setListTab(saved.listTab as ListTab);
      } else if (!initialListTab && typeof saved.statusFilter === 'string') {
        setListTab(saved.statusFilter as ListTab);
      }
      if (typeof saved.fromDate === 'string') setFromDate(saved.fromDate);
      if (typeof saved.toDate === 'string') setToDate(saved.toDate);
      if (typeof saved.periodPreset === 'string') setPeriodPreset(saved.periodPreset as PeriodPreset);
      if (typeof saved.sortKey === 'string') setSortKey(saved.sortKey as SortKey);
    } catch {
      // noop
    }
  }, [initialListTab]);

  useEffect(() => {
    if (initialListTab) {
      setListTab(initialListTab);
    }
  }, [initialListTab]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        'productListFilters',
        JSON.stringify({ query, listTab, fromDate, toDate, periodPreset, sortKey })
      );
    } catch {
      // noop
    }
  }, [query, listTab, fromDate, toDate, periodPreset, sortKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const list = products.filter((p) => {
      if (listTab === 'janInventory' && p.status !== 'inventory') {
        return false;
      }
      if (listTab !== 'all' && listTab !== 'janInventory' && p.status !== listTab) {
        return false;
      }

      if (fromDate && p.purchaseDate < fromDate) return false;
      if (toDate && p.purchaseDate > toDate) return false;

      if (!q) return true;
      const haystack = [p.productName, p.purchaseLocation, p.saleLocation || '', p.janCode || ''].join(' ').toLowerCase();
      return haystack.includes(q);
    });

    return list.sort((a, b) => {
      if (sortKey === 'profitDesc') {
        return calculatePointProfit(b) - calculatePointProfit(a);
      }
      if (sortKey === 'salePriceDesc') {
        return (b.salePrice || 0) - (a.salePrice || 0);
      }
      const byPurchaseDate = toTime(b.purchaseDate) - toTime(a.purchaseDate);
      if (byPurchaseDate !== 0) return byPurchaseDate;
      return toTime(b.createdAt) - toTime(a.createdAt);
    });
  }, [products, query, listTab, fromDate, toDate, sortKey]);

  const applyPeriodPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (preset === 'all') {
      setFromDate('');
      setToDate('');
      return;
    }
    if (preset === 'thisYear') {
      setFromDate(`${y}-01-01`);
      setToDate(`${y}-12-31`);
      return;
    }
    if (preset === 'last30' || preset === 'last60' || preset === 'last90') {
      const days = preset === 'last30' ? 30 : preset === 'last60' ? 60 : 90;
      const start = new Date(now);
      start.setDate(now.getDate() - (days - 1));
      setFromDate(fmt(start));
      setToDate(fmt(now));
      return;
    }
    if (preset === 'thisMonth') {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      setFromDate(fmt(start));
      setToDate(fmt(end));
      return;
    }
    if (preset === 'lastMonth') {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      setFromDate(fmt(start));
      setToDate(fmt(end));
    }
  };

  const pending = filtered.filter((p) => p.status === 'pending');
  const sold = filtered.filter((p) => p.status === 'sold');
  const inventory = filtered.filter((p) => p.status === 'inventory');
  const janInventoryGroups = useMemo(() => {
    if (listTab !== 'janInventory') return [];
    const map = new Map<
      string,
      {
        janCode: string;
        productName: string;
        quantity: number;
        itemCount: number;
        effectiveCost: number;
        latestPurchaseDate: string;
      }
    >();

    filtered.forEach((p) => {
      const jan = (p.janCode || '').trim();
      const key = jan || `__NO_JAN__${p.productName}`;
      const total = Math.max(1, p.quantityTotal ?? 1);
      const available = Math.max(0, Math.min(total, p.quantityAvailable ?? total));
      const remainingEffectiveCost = getEffectiveCost(p) * (available / total);
      const cur = map.get(key) || {
        janCode: jan,
        productName: p.productName,
        quantity: 0,
        itemCount: 0,
        effectiveCost: 0,
        latestPurchaseDate: p.purchaseDate,
      };
      cur.quantity += available;
      cur.itemCount += 1;
      cur.effectiveCost += remainingEffectiveCost;
      if (p.purchaseDate > cur.latestPurchaseDate) cur.latestPurchaseDate = p.purchaseDate;
      map.set(key, cur);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.latestPurchaseDate.localeCompare(a.latestPurchaseDate);
    });
  }, [filtered, listTab]);

  const statusBadge = (status: Product['status']) => {
    if (status === 'sold') return 'bg-emerald-100 text-emerald-700';
    if (status === 'inventory') return 'bg-sky-100 text-sky-700';
    return 'bg-slate-100 text-slate-700';
  };

  const statusLabel = (status: Product['status']) => {
    if (status === 'sold') return '売却済み';
    if (status === 'inventory') return '在庫';
    return '未着';
  };


  const section = (title: string, color: string, items: Product[]) => {
    if (items.length === 0) return null;

    return (
      <section>
        <h2 className="mb-3 text-sm font-bold tracking-wide">
          <span className={`inline-flex items-center rounded-full px-3 py-1 ${color}`}>{title} {items.length}</span>
        </h2>
        <div className="space-y-3">{items.map(renderProductCard)}</div>
      </section>
    );
  };

  const renderProductCard = (product: Product) => (
    <div key={product.id} className="space-y-1.5">
      <p className="px-1 text-[11px] text-slate-500">
        {formatDate(product.purchaseDate)}
      </p>
      <div className="card p-2.5 animate-fade-in space-y-2">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEditingProduct(product)}
                className="font-semibold text-slate-900 truncate min-w-0 text-left hover:text-sky-700 transition-colors"
                title={product.janCode ? `${product.productName} (JAN:${product.janCode})` : product.productName}
              >
                {product.productName}
                {product.janCode ? ` (JAN:${product.janCode})` : ''}
              </button>
              {product.janCode && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyToClipboard(product.janCode || '');
                    if (ok) {
                      setCopiedProductId(product.id);
                      window.setTimeout(() => {
                        setCopiedProductId((prev) => (prev === product.id ? null : prev));
                      }, 1200);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
                  title="JANをコピー"
                >
                  <Copy className="w-3 h-3" />
                  <span className="hidden sm:inline">JANコピー</span>
                </button>
              )}
              {copiedProductId === product.id && (
                <span className="text-[11px] text-emerald-700 font-semibold shrink-0">コピーしました</span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 whitespace-nowrap shrink-0">
              {product.purchaseLocation}
            </p>
          </div>
        </div>

      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-x-3 min-w-0 overflow-hidden">
          <p className="text-slate-800 whitespace-nowrap">
            <span className="text-xs text-soft mr-1">実質</span>
            <span className="font-semibold">{formatCurrency(getEffectiveCost(product))}</span>
          </p>
          {!product.kaitoriPrice && product.janCode && product.status !== 'sold' && (
            <>
              <span className="text-slate-300 px-1" aria-hidden>|</span>
              <p className="whitespace-nowrap">
                <span className="text-xs text-soft mr-1">買取wiki</span>
                <span className="text-xs text-slate-400">未取得</span>
              </p>
            </>
          )}
          {product.kaitoriPrice && product.status !== 'sold' && (() => {
            const diff = product.kaitoriPrice - getEffectiveCost(product);
            return (
              <>
                <span className="text-slate-300 px-1" aria-hidden>|</span>
                <p className="text-slate-800 whitespace-nowrap">
                  <span className="text-xs text-soft mr-1">買取wiki</span>
                  <span className="font-semibold">{formatCurrency(product.kaitoriPrice)}</span>
                  {product.kaitoriPriceAt && (() => {
                    const mins = Math.floor((Date.now() - new Date(product.kaitoriPriceAt!).getTime()) / 60000);
                    return <span className="ml-1 text-[10px] text-slate-400">{mins < 60 ? `${mins}分前` : `${Math.floor(mins / 60)}時間前`}</span>;
                  })()}
                </p>
                <p className="whitespace-nowrap">
                  <span className="text-xs text-soft mr-1">差額</span>
                  <span className={`font-semibold ${diff >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                  </span>
                </p>
              </>
            );
          })()}
          {product.status === 'sold' && product.salePrice && (
            <>
              <span className="text-slate-300 px-1" aria-hidden>|</span>
              <p className="text-slate-800 whitespace-nowrap">
                <span className="text-xs text-soft mr-1">売却</span>
                <span className="font-semibold">{formatCurrency(product.salePrice)}</span>
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(product.quantityTotal ?? 1) > 1 && (
            <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700">
              {product.quantityAvailable ?? product.quantityTotal}/{product.quantityTotal}
            </span>
          )}
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge(product.status)}`}>
            {statusLabel(product.status)}
          </span>
        </div>
      </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="glass-panel p-3 space-y-3">
        {!hideTabSelector && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setListTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${listTab === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
          >
            全件
          </button>
          <button
            onClick={() => setListTab('inventory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${listTab === 'inventory' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
          >
            在庫一覧
          </button>
          <button
            onClick={() => setListTab('sold')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${listTab === 'sold' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
          >
            売却済み一覧
          </button>
          <button
            onClick={() => setListTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${listTab === 'pending' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
          >
            未着一覧
          </button>
          <button
            onClick={() => setListTab('janInventory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${listTab === 'janInventory' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
          >
            JAN在庫
          </button>
        </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="商品名・購入場所・売却先で検索"
              className="input-field pl-9"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-white/80 transition inline-flex items-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4" />
            条件
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="lg:col-span-4 flex flex-wrap gap-1">
              <button onClick={() => applyPeriodPreset('last30')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${periodPreset === 'last30' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>直近30日</button>
              <button onClick={() => applyPeriodPreset('last60')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${periodPreset === 'last60' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>直近60日</button>
              <button onClick={() => applyPeriodPreset('last90')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${periodPreset === 'last90' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>直近90日</button>
              <button onClick={() => applyPeriodPreset('thisMonth')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${periodPreset === 'thisMonth' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>今月</button>
              <button onClick={() => applyPeriodPreset('lastMonth')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${periodPreset === 'lastMonth' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>先月</button>
              <button onClick={() => applyPeriodPreset('thisYear')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${periodPreset === 'thisYear' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>今年</button>
              <button onClick={() => applyPeriodPreset('all')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${periodPreset === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>全期間</button>
              <button
                onClick={() => setShowDateRange((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${showDateRange ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
              >
                日付指定
              </button>
            </div>
            {showDateRange && (
              <RichDatePicker label="開始日" value={fromDate || new Date().toISOString().split('T')[0]} onChange={(v) => { setFromDate(v); setPeriodPreset('custom'); }} />
            )}
            {showDateRange && (
              <RichDatePicker label="終了日" value={toDate || new Date().toISOString().split('T')[0]} onChange={(v) => { setToDate(v); setPeriodPreset('custom'); }} />
            )}

            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="input-field">
              <option value="purchaseDateDesc">並び順: 購入日が新しい順</option>
              <option value="profitDesc">並び順: 利益が高い順</option>
              <option value="salePriceDesc">並び順: 売却価格が高い順</option>
            </select>
          </div>
        )}
      </div>

      <div className="text-sm text-soft px-1">検索結果 {filtered.length} 件</div>

      <div className="space-y-6">
        {listTab === 'janInventory' ? (
          <section>
            {janInventoryGroups.length === 0 ? (
              <p className="text-sm text-slate-500 px-1">JAN在庫はありません</p>
            ) : (
              <div className="space-y-2">
                {janInventoryGroups.map((g) => (
                  <div key={`${g.janCode}_${g.productName}`} className="card p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{g.productName}</p>
                        <p className="text-xs text-slate-600">
                          {g.janCode ? `JAN:${g.janCode}` : 'JAN未設定'}
                        </p>
                      </div>
                      {g.janCode && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(g.janCode)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
                          title="JANをコピー"
                        >
                          <Copy className="w-3 h-3" />
                          JANコピー
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <p className="text-slate-800 whitespace-nowrap">
                        <span className="text-xs text-soft mr-1">在庫数</span>
                        <span className="font-semibold">{g.quantity}</span>
                      </p>
                      <p className="text-slate-800 whitespace-nowrap">
                        <span className="text-xs text-soft mr-1">在庫金額(実質)</span>
                        <span className="font-semibold">{formatCurrency(Math.round(g.effectiveCost))}</span>
                      </p>
                      <p className="text-slate-800 whitespace-nowrap">
                        <span className="text-xs text-soft mr-1">件数</span>
                        <span className="font-semibold">{g.itemCount}</span>
                      </p>
                      <p className="text-slate-800 whitespace-nowrap">
                        <span className="text-xs text-soft mr-1">最終仕入</span>
                        <span className="font-semibold">{formatDate(g.latestPurchaseDate)}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : sortKey === 'purchaseDateDesc' ? (
          <section>
            <div className="space-y-3">{filtered.map(renderProductCard)}</div>
          </section>
        ) : (
          <>
            {section('未着', 'bg-slate-100 text-slate-700', pending)}
            {section('在庫', 'bg-sky-100 text-sky-700', inventory)}
            {section('売却済み', 'bg-emerald-100 text-emerald-700', sold)}
          </>
        )}
      </div>

      {editingProduct && (
        <EditProductForm
          product={editingProduct}
          userId={userId}
          onDelete={onDelete}
          onClose={() => setEditingProduct(null)}
        />
      )}
    </div>
  );
}

