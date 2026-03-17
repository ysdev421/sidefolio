import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { BarChart3, ChevronDown, List, Plus, Settings, Truck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProducts } from '@/hooks/useProducts';
import { useStore } from '@/lib/store';
import { LoginForm } from '@/components/LoginForm';
import { Header } from '@/components/Header';
import { addStatusBatchLogToFirestore } from '@/lib/firestore';

const Dashboard = lazy(() => import('@/components/Dashboard').then((m) => ({ default: m.Dashboard })));
const ProductList = lazy(() => import('@/components/ProductList').then((m) => ({ default: m.ProductList })));
const AddProductForm = lazy(() => import('@/components/AddProductForm').then((m) => ({ default: m.AddProductForm })));
const SaleBatchManager = lazy(() => import('@/components/SaleBatchManager').then((m) => ({ default: m.SaleBatchManager })));
const PurchaseLocationMaster = lazy(() =>
  import('@/components/PurchaseLocationMaster').then((m) => ({ default: m.PurchaseLocationMaster }))
);
const StatusBatchManager = lazy(() =>
  import('@/components/StatusBatchManager').then((m) => ({ default: m.StatusBatchManager }))
);
const AdminJanManager = lazy(() =>
  import('@/components/AdminJanManager').then((m) => ({ default: m.AdminJanManager }))
);

type Screen = 'summary' | 'list' | 'sale';
type AppView = 'system' | 'purchaseLocationMaster' | 'statusBatchManager' | 'adminJanManager';

function App() {
  const { authLoading } = useAuth();
  const user = useStore((state) => state.user);
  const { products, deleteProductData, updateProductData } = useProducts(user?.id || null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showManagementMenu, setShowManagementMenu] = useState(false);
  const managementMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showManagementMenu) return;
    const handler = (e: MouseEvent) => {
      if (managementMenuRef.current && !managementMenuRef.current.contains(e.target as Node)) {
        setShowManagementMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showManagementMenu]);
  const [appView, setAppView] = useState<AppView>('system');
  const [screen, setScreen] = useState<Screen>('list');
  const [periodFilter, setPeriodFilter] = useState<'thisMonth' | 'lastMonth' | 'thisYear' | 'all'>('thisMonth');
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const adminEmails = String(import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminEmails.length > 0 && adminEmails.includes((user?.email || '').toLowerCase());

  const filteredProducts = products.filter((p) => p.channel === 'kaitori');

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

  const changePeriodFilter = (value: 'thisMonth' | 'lastMonth' | 'thisYear' | 'all') => {
    setDashboardLoading(true);
    setPeriodFilter(value);
    window.setTimeout(() => setDashboardLoading(false), 250);
  };

  return (
    <div className="min-h-screen">
      <Header userName={user.displayName || user.email} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28">
        <section className="mb-5 relative" ref={managementMenuRef}>
          <button
            onClick={() => setShowManagementMenu((v) => !v)}
            className="glass-panel px-4 py-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-800 hover:bg-white/80 transition"
          >
            <Settings className="w-4 h-4" />
            管理メニュー
            <ChevronDown className={`w-4 h-4 transition ${showManagementMenu ? 'rotate-180' : ''}`} />
          </button>

          {showManagementMenu && (
            <div className="absolute mt-2 w-64 glass-panel p-2 z-20">
              <button
                onClick={() => {
                  setAppView('purchaseLocationMaster');
                  setShowManagementMenu(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  appView === 'purchaseLocationMaster' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/70'
                }`}
              >
                購入場所マスタ管理
              </button>
              <button
                onClick={() => {
                  setAppView('statusBatchManager');
                  setShowManagementMenu(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  appView === 'statusBatchManager' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/70'
                }`}
              >
                ステータス一括管理
              </button>
              {isAdmin && (
                <button
                  onClick={() => {
                    setAppView('adminJanManager');
                    setShowManagementMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition ${
                    appView === 'adminJanManager' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/70'
                  }`}
                >
                  管理者: JAN抽出/投入
                </button>
              )}
            </div>
          )}
        </section>

        <Suspense fallback={<div className="glass-panel p-6 text-sm text-slate-600">読み込み中...</div>}>
          {appView === 'purchaseLocationMaster' ? (
            <PurchaseLocationMaster userId={user.id} />
          ) : appView === 'statusBatchManager' ? (
            <StatusBatchManager
              products={filteredProducts}
              onBulkUpdate={bulkUpdateStatus}
            />
          ) : appView === 'adminJanManager' && isAdmin ? (
            <AdminJanManager />
          ) : screen === 'summary' ? (
            <section>
              <div className="mb-4">
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
                <Dashboard products={summaryProducts} showMoM={periodFilter !== 'all'} />
              )}
            </section>
          ) : screen === 'list' ? (
            <section>
              <ProductList products={filteredProducts} userId={user.id} onDelete={deleteProductData} />
            </section>
          ) : (
            <section>
              <SaleBatchManager products={filteredProducts} userId={user.id} />
            </section>
          )}
        </Suspense>

        {screen !== 'sale' && filteredProducts.length === 0 && (
          <div className="glass-panel text-center py-10 mt-8">
            <p className="text-lg font-semibold text-slate-800">まだ商品データがありません</p>
            <p className="text-soft text-sm mt-2">右下のボタンから最初の商品を登録してください</p>
          </div>
        )}
      </main>

      <button
        onClick={() => setShowAddForm(true)}
        className="fixed right-4 bottom-[calc(7rem+env(safe-area-inset-bottom))] sm:bottom-8 sm:right-8 z-30 bg-gradient-to-r from-sky-500 via-cyan-500 to-blue-600 text-white rounded-2xl p-4 shadow-2xl transition hover:scale-105 active:scale-95 flex items-center justify-center"
        title="商品を追加"
        style={{ display: appView === 'system' ? undefined : 'none' }}
      >
        <Plus className="w-7 h-7" />
      </button>

      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[94vw] max-w-md">
        <div className="glass-panel p-1.5 flex items-center gap-1 flex-nowrap">
          <button
            onClick={() => { setAppView('system'); setScreen('summary'); }}
            className={`px-2 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1 sm:gap-2 transition ${
              appView === 'system' && screen === 'summary' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/70'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            サマリー
          </button>
          <button
            onClick={() => { setAppView('system'); setScreen('list'); }}
            className={`px-2 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1 sm:gap-2 transition ${
              appView === 'system' && screen === 'list' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/70'
            }`}
          >
            <List className="w-4 h-4" />
            一覧
          </button>
          <button
            onClick={() => { setAppView('system'); setScreen('sale'); }}
            className={`px-2 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1 sm:gap-2 transition ${
              appView === 'system' && screen === 'sale' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/70'
            }`}
          >
            <Truck className="w-4 h-4" />
            一括売却
          </button>
        </div>
      </nav>

      {showAddForm && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/30" />}>
          <AddProductForm userId={user.id} defaultChannel="kaitori" lockChannel onClose={() => setShowAddForm(false)} />
        </Suspense>
      )}
    </div>
  );
}

export default App;
