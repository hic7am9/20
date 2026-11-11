import { lazy, Suspense } from 'react';
import { I18nProvider } from '@/context/I18nContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AppProvider, useApp } from '@/context/AppContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LockScreen } from '@/components/LockScreen';
import { TopNav } from '@/components/Navigation';
import { InstallPrompt } from '@/components/InstallPrompt';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { Loader2, AlertCircle } from 'lucide-react';

const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const WorkSchedule = lazy(() => import('@/pages/WorkSchedule').then(m => ({ default: m.WorkSchedule })));
const CheckOut = lazy(() => import('@/pages/CheckOut').then(m => ({ default: m.CheckOut })));
const GuestsArchive = lazy(() => import('@/pages/GuestsArchive').then(m => ({ default: m.GuestsArchive })));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-32">
      <Loader2 size={28} className="animate-spin text-slate-400" />
    </div>
  );
}

function AppContent() {
  const { view, data, loading, error, triggerRefresh } = useApp();

  // Show spinner only during initial load with no data at all
  if (loading && data.apartments.length === 0 && data.locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 size={32} className="animate-spin text-slate-400" />
        <p className="text-sm text-slate-400 font-semibold">جاري تحميل البيانات...</p>
      </div>
    );
  }

  // Show error only if fetch failed AND no cached data
  if (error && data.apartments.length === 0 && data.locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-sm text-red-500 font-semibold">{error}</p>
        <button onClick={() => triggerRefresh()} className="btn-primary">إعادة المحاولة</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 min-w-0 pb-24 sm:pb-0">
        <div className="w-full p-3 sm:p-4">
          <Suspense fallback={<PageFallback />}>
            {view === 'dashboard' && <Dashboard apartments={data.apartments} locations={data.locations} bookings={data.bookings} />}
            {view === 'schedule' && <WorkSchedule apartments={data.apartments} locations={data.locations} bookings={data.bookings} />}
            {view === 'checkout' && <CheckOut apartments={data.apartments} locations={data.locations} bookings={data.bookings} />}
            {view === 'archive' && <GuestsArchive archive={data.archive} />}
          </Suspense>
        </div>
      </main>
      <InstallPrompt />
      <OfflineIndicator />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LockScreen>
        <I18nProvider>
          <ThemeProvider>
            <AppProvider>
              <AppContent />
            </AppProvider>
          </ThemeProvider>
        </I18nProvider>
      </LockScreen>
    </ErrorBoundary>
  );
}

export default App;
