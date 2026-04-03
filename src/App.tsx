import { Suspense, lazy, useEffect, useState } from 'react';
import { Activity, BarChart3, BookOpen, ChevronLeft, CreditCard, Database, FileText, History, List, MapPin, Plus, Receipt, RefreshCw, Settings, Truck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProducts } from '@/hooks/useProducts';
import { useStore } from '@/lib/store';
import { LoginForm } from '@/components/LoginForm';
import { Header } from '@/components/Header';
import { HomeScreen } from '@/components/HomeScreen';
import { addStatusBatchLogToFirestore, getUserKeikojiContracts, getUserPointSiteRedemptions } from '@/lib/firestore';
import type { KeikojiContract, PointSiteRedemption } from '@/types';

const Dashboard = lazy(() => import('@/components/Dashboard').then((m) => ({ default: m.Dashboard })));
const ProductList = lazy(() => import('@/components/ProductList').then((m) => ({ default: m.ProductList })));
const SaleBatchManager = lazy(() => import('@/components/SaleBatchManager').then((m) => ({ default: m.SaleBatchManager })));
let addProductFormPromise: Promise<typeof import('@/components/AddProductForm')> | null = null;
const loadAddProductForm = () => {
  if (!addProductFormPromise) {
    addProductFormPromise = import('@/components/AddProductForm');
  }
  return addProductFormPromise;
};
const AddProductForm = lazy(() => loadAddProductForm().then((m) => ({ default: m.AddProductForm })));
const PurchaseLocationMaster = lazy(() =>
  import('@/components/PurchaseLocationMaster').then((m) => ({ default: m.PurchaseLocationMaster }))
);
const SaleLocationMaster = lazy(() =>
  import('@/components/SaleLocationMaster').then((m) => ({ default: m.SaleLocationMaster }))
);
const StatusBatchManager = lazy(() =>
  import('@/components/StatusBatchManager').then((m) => ({ default: m.StatusBatchManager }))
);
const ProductMasterManager = lazy(() =>
  import('@/components/ProductMasterManager').then((m) => ({ default: m.ProductMasterManager }))
);
const AdminJanManager = lazy(() =>
  import('@/components/AdminJanManager').then((m) => ({ default: m.AdminJanManager }))
);
const SaleHistoryScreen = lazy(() =>
  import('@/components/SaleHistoryScreen').then((m) => ({ default: m.SaleHistoryScreen }))
);
const ExpenseManager = lazy(() =>
  import('@/components/ExpenseManager').then((m) => ({ default: m.ExpenseManager }))
);
const AnnualSummaryScreen = lazy(() =>
  import('@/components/AnnualSummaryScreen').then((m) => ({ default: m.AnnualSummaryScreen }))
);
const GiftCardManager = lazy(() =>
  import('@/components/GiftCardManager').then((m) => ({ default: m.GiftCardManager }))
);
const PointSiteRedemptionManager = lazy(() =>
  import('@/components/PointSiteRedemptionManager').then((m) => ({ default: m.PointSiteRedemptionManager }))
);
const GithubActionsMonitor = lazy(() =>
  import('@/components/GithubActionsMonitor').then((m) => ({ default: m.GithubActionsMonitor }))
);
const KeikojiApp = lazy(() =>
  import('@/components/KeikojiApp').then((m) => ({ default: m.KeikojiApp }))
);
const SidefolioAnnualSummary = lazy(() =>
  import('@/components/SidefolioAnnualSummary').then((m) => ({ default: m.SidefolioAnnualSummary }))
);

type AppSection = 'home' | 'sedori' | 'keikoji' | 'annualSummary';
type Screen = 'summary' | 'list' | 'sale' | 'saleHistory' | 'admin';
type AppView = 'system' | 'purchaseLocationMaster' | 'saleLocationMaster' | 'statusBatchManager' | 'productMasterManager' | 'adminJanManager' | 'expenseManager' | 'annualSummary' | 'giftCardManager' | 'pointSiteRedemptionManager' | 'githubActionsMonitor';

function App() {
  const { authLoading } = useAuth();
  const user = useStore((state) => state.user);
  const { products, deleteProductData, updateProductData } = useProducts(user?.id || null);

  const [appSection, setAppSection] = useState<AppSection>('home');
  const [showAddForm, setShowAddForm] = useState(false);
  const [masterInitial, setMasterInitial] = useState<{ janCode: string; productName: string } | null>(null);
  const [addFormInitial, setAddFormInitial] = useState<{ janCode: string; productName: string } | null>(null);
  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void loadAddProductForm();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [user]);

  const [appView, setAppView] = useState<AppView>('system');
  const [screen, setScreen] = useState<Screen>('list');
  const [periodFilter, setPeriodFilter] = useState<'thisMonth' | 'lastMonth' | 'thisYear' | 'all'>('thisMonth');
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [redemptions, setRedemptions] = useState<PointSiteRedemption[]>([]);
  const [keikojiContracts, setKeikojiContracts] = useState<KeikojiContract[]>([]);

  useEffect(() => {
    if (!user) return;
    getUserPointSiteRedemptions(user.id).then(setRedemptions).catch(() => setRedemptions([]));
    getUserKeikojiContracts(user.id).then(setKeikojiContracts).catch(() => setKeikojiContracts([]));
  }, [user]);

  const adminEmails = String(import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminEmails.length > 0 && adminEmails.includes((user?.email || '').toLowerCase());

  const filteredProducts = products;

  const summaryProducts = filteredProducts.filter((p) => {
    if (periodFilter === 'all') return true;

    const targetDate = p.status === 'sold' && p.saleDate ? p.saleDate : p.purchaseDate;
    const d = new Date(targetDate);
    if (Number.isNaN(d.getTime())) return false;

    const now = new Date();
    if (periodFilter === 'thisYear') {
      return d.getFullYear() === now.getFullYear();
    }

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    if (periodFilter === 'thisMonth') {
      return d >= currentMonthStart && d < nextMonthStart;
    }

    return d >= lastMonthStart && d < currentMonthStart;
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="glass-panel p-8 text-center w-full max-w-sm">
          <div className="w-12 h-12 border-4 border-sky-200 border-t-sky-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-soft">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  const bulkUpdateStatus = async (ids: string[], status: 'pending' | 'inventory') => {
    await Promise.all(ids.map((id) => updateProductData(id, { status })));
    await addStatusBatchLogToFirestore(user.id, {
      targetStatus: status,
      productIds: ids,
      affectedCount: ids.length,
    });
  };

  const reallocateGroupPoints = async (updates: Array<{ id: string; point: number }>) => {
    await Promise.all(
      updates.map((row) =>
        updateProductData(row.id, { point: Math.max(0, Math.round(row.point || 0)) })
      )
    );
  };

  const changePeriodFilter = (value: 'thisMonth' | 'lastMonth' | 'thisYear' | 'all') => {
    setDashboardLoading(true);
    setPeriodFilter(value);
    window.setTimeout(() => setDashboardLoading(false), 250);
  };

  const fmtYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  };

  const summaryPeriodText = (() => {
    const now = new Date();
    if (periodFilter === 'thisMonth') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return `${fmtYmd(from)} - ${fmtYmd(to)}`;
    }
    if (periodFilter === 'lastMonth') {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return `${fmtYmd(from)} - ${fmtYmd(to)}`;
    }
    if (periodFilter === 'thisYear') {
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date(now.getFullYear(), 11, 31);
      return `${fmtYmd(from)} - ${fmtYmd(to)}`;
    }
    if (summaryProducts.length === 0) return 'データなし';
    const targets = summaryProducts
      .map((p) => new Date(p.status === 'sold' && p.saleDate ? p.saleDate : p.purchaseDate))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (targets.length === 0) return 'データなし';
    return `${fmtYmd(targets[0])} - ${fmtYmd(targets[targets.length - 1])}`;
  })();

  const handleSelectSection = (section: 'sedori' | 'keikoji' | 'annualSummary') => {
    setAppSection(section);
    if (section === 'sedori') {
      setScreen('list');
      setAppView('system');
    }
  };

  const handleBackToHome = () => {
    setAppSection('home');
    setAppView('system');
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        userName={user.displayName || user.email}
        appSection={appSection}
        onBack={appSection !== 'home' ? handleBackToHome : undefined}
      />

      <main className={`flex-1 overflow-y-auto max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 ${appSection === 'sedori' ? 'pb-24' : 'pb-6'}`}>
        <Suspense fallback={<div className="glass-panel p-6 text-sm text-slate-600">読み込み中...</div>}>
          {appSection === 'home' ? (
            <HomeScreen
              products={filteredProducts}
              redemptions={redemptions}
              keikojiContracts={keikojiContracts}
              onSelectSection={handleSelectSection}
            />
          ) : appSection === 'annualSummary' ? (
            <SidefolioAnnualSummary userId={user.id} products={filteredProducts} />
          ) : appSection === 'keikoji' ? (
            <KeikojiApp userId={user.id} />
          ) : (
            <>
            {screen === 'admin' && appView !== 'system' ? (
            <>
              <button
                onClick={() => setAppView('system')}
                className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                管理メニューに戻る
              </button>
              {appView === 'saleLocationMaster' ? (
                <SaleLocationMaster userId={user.id} />
              ) : appView === 'purchaseLocationMaster' ? (
                <PurchaseLocationMaster userId={user.id} />
              ) : appView === 'statusBatchManager' ? (
                <StatusBatchManager products={filteredProducts} onBulkUpdate={bulkUpdateStatus} />
              ) : appView === 'productMasterManager' ? (
                <ProductMasterManager
                  key={masterInitial ? `${masterInitial.janCode}-${masterInitial.productName}` : 'default'}
                  userId={user.id}
                  initialJanCode={masterInitial?.janCode}
                  initialProductName={masterInitial?.productName}
                  onSaved={masterInitial ? (saved) => {
                    setMasterInitial(null);
                    setAddFormInitial(saved);
                    setScreen('list');
                    setAppView('system');
                    setShowAddForm(true);
                  } : undefined}
                />
              ) : appView === 'expenseManager' ? (
                <ExpenseManager userId={user.id} />
              ) : appView === 'annualSummary' ? (
                <AnnualSummaryScreen userId={user.id} products={filteredProducts} />
              ) : appView === 'giftCardManager' ? (
                <GiftCardManager userId={user.id} products={products} />
              ) : appView === 'pointSiteRedemptionManager' ? (
                <PointSiteRedemptionManager userId={user.id} />
              ) : appView === 'githubActionsMonitor' ? (
                <GithubActionsMonitor userId={user.id} />
              ) : appView === 'adminJanManager' && isAdmin ? (
                <AdminJanManager />
              ) : null}
            </>
          ) : screen === 'admin' ? (
            <section>
              <h2 className="text-base font-bold text-slate-800 mb-4">管理メニュー</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {([
                  { view: 'purchaseLocationMaster' as const, label: '購入場所\nマスタ管理', icon: MapPin, color: 'from-sky-100 to-cyan-100 text-sky-600' },
                  { view: 'saleLocationMaster' as const, label: '売却先\nマスタ管理', icon: MapPin, color: 'from-emerald-100 to-teal-100 text-emerald-600' },
                  { view: 'statusBatchManager' as const, label: 'ステータス\n一括管理', icon: RefreshCw, color: 'from-violet-100 to-purple-100 text-violet-600' },
                  { view: 'productMasterManager' as const, label: '商品マスタ\n管理', icon: BookOpen, color: 'from-emerald-100 to-green-100 text-emerald-600' },
                  { view: 'giftCardManager' as const, label: 'ギフトカード\n管理', icon: CreditCard, color: 'from-sky-100 to-indigo-100 text-sky-600' },
                  { view: 'pointSiteRedemptionManager' as const, label: 'ポイントサイト\n還元管理', icon: History, color: 'from-violet-100 to-purple-100 text-violet-600' },
                  { view: 'githubActionsMonitor' as const, label: 'GitHub Actions\n監視', icon: Activity, color: 'from-indigo-100 to-blue-100 text-indigo-700' },
                  { view: 'expenseManager' as const, label: '経費管理', icon: Receipt, color: 'from-rose-100 to-pink-100 text-rose-600' },
                  { view: 'annualSummary' as const, label: '年間サマリー\n（確定申告用）', icon: FileText, color: 'from-amber-100 to-orange-100 text-amber-600' },
                  ...(isAdmin ? [{ view: 'adminJanManager' as const, label: 'JAN抽出/投入\n（管理者）', icon: Database, color: 'from-slate-100 to-slate-200 text-slate-600' }] : []),
                ]).map(({ view, label, icon: Icon, color }) => (
                  <button
                    key={view}
                    onClick={() => setAppView(view)}
                    className="glass-panel p-4 flex flex-col items-center gap-3 hover:bg-white/90 active:scale-95 transition text-center"
                  >
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 whitespace-pre-line leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : screen === 'summary' ? (
            <section>
              <div className="mb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="glass-panel p-2 inline-flex gap-1">
                  <button
                    onClick={() => changePeriodFilter('thisMonth')}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition ${
                      periodFilter === 'thisMonth' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/70'
                    }`}
                  >
                    今月
                  </button>
                  <button
                    onClick={() => changePeriodFilter('lastMonth')}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition ${
                      periodFilter === 'lastMonth' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/70'
                    }`}
                  >
                    先月
                  </button>
                  <button
                    onClick={() => changePeriodFilter('thisYear')}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition ${
                      periodFilter === 'thisYear' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/70'
                    }`}
                  >
                    今年
                  </button>
                  <button
                    onClick={() => changePeriodFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition ${
                      periodFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/70'
                    }`}
                  >
                    全期間
                  </button>
                </div>
                  <p className="text-xs sm:text-sm text-slate-600 whitespace-nowrap">
                    集計期間: <span className="font-semibold text-slate-800">{summaryPeriodText}</span>
                  </p>
                </div>
              </div>
              {dashboardLoading ? (
                <div className="glass-panel p-5 space-y-3">
                  <div className="h-5 w-32 rounded bg-slate-200 animate-pulse" />
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
                    ))}
                  </div>
                  <div className="h-48 rounded-xl bg-slate-100 animate-pulse" />
                </div>
              ) : (
                <Dashboard products={summaryProducts} allProducts={filteredProducts} periodFilter={periodFilter} showMoM={periodFilter !== 'all'} redemptions={redemptions} />
              )}
            </section>
          ) : screen === 'list' ? (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-800">在庫一覧</h2>
                <button
                  onClick={() => setShowAddForm(true)}
                  onMouseEnter={() => { void loadAddProductForm(); }}
                  className="inline-flex items-center gap-1.5 bg-gradient-to-r from-sky-500 via-cyan-500 to-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-md hover:opacity-90 active:scale-95 transition"
                >
                  <Plus className="w-4 h-4" />
                  商品登録
                </button>
              </div>
              <ProductList
                products={filteredProducts}
                userId={user.id}
                onDelete={deleteProductData}
                onReallocateGroupPoints={reallocateGroupPoints}
                initialListTab="inventory"
              />
            </section>
          ) : screen === 'sale' ? (
            <section>
              <SaleBatchManager products={filteredProducts} userId={user.id} />
            </section>
          ) : (
            <section>
              <SaleHistoryScreen userId={user.id} />
            </section>
          )}
          {filteredProducts.length === 0 && screen === 'list' && (
            <div className="glass-panel text-center py-10 mt-8">
              <p className="text-lg font-semibold text-slate-800">まだ商品データがありません</p>
              <p className="text-soft text-sm mt-2">上の「商品登録」ボタンから最初の商品を登録してください</p>
            </div>
          )}
            </>
          )}
        </Suspense>
      </main>

      {appSection === 'sedori' && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-xl border-t border-slate-200/60" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-stretch">
            {([
              { id: 'summary' as const, label: 'サマリー', icon: BarChart3 },
              { id: 'list' as const, label: '在庫', icon: List },
              { id: 'sale' as const, label: '売却', icon: Truck },
              { id: 'saleHistory' as const, label: '売却履歴', icon: History },
              { id: 'admin' as const, label: '管理', icon: Settings },
            ] as const).map(({ id, label, icon: Icon }) => {
              const active = screen === id;
              return (
                <button
                  key={id}
                  onClick={() => { setAppView('system'); setScreen(id); }}
                  className="relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors active:opacity-60"
                >
                  <Icon className={`w-5 h-5 transition-colors ${active ? 'text-sky-500' : 'text-slate-400'}`} strokeWidth={active ? 2.5 : 1.8} />
                  <span className={`text-[10px] font-medium transition-colors ${active ? 'text-sky-500' : 'text-slate-400'}`}>{label}</span>
                  {active && <span className="absolute bottom-0 h-0.5 w-8 bg-sky-500 rounded-full" />}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {showAddForm && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/30" />}>
          <AddProductForm
            userId={user.id}
            initialJanCode={addFormInitial?.janCode}
            initialProductName={addFormInitial?.productName}
            onClose={() => {
              setShowAddForm(false);
              setAddFormInitial(null);
            }}
            onGoToMaster={(janCode, productName) => {
              setShowAddForm(false);
              setAddFormInitial(null);
              setMasterInitial({ janCode, productName });
              setScreen('admin');
              setAppView('productMasterManager');
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
