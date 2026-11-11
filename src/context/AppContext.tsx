import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { supabase, fetchAll, fetchAllSync } from '@/lib/supabase';
import type { Apartment, Location, Booking, GuestArchive } from '@/types';

export type ViewName = 'dashboard' | 'schedule' | 'checkout' | 'archive';

interface DataCache {
  locations: Location[];
  apartments: Apartment[];
  bookings: Booking[];
  archive: GuestArchive[];
}

interface AppContextValue {
  view: ViewName;
  setView: (v: ViewName) => void;
  refreshKey: number;
  triggerRefresh: () => void;
  data: DataCache;
  loading: boolean;
  error: string | null;
  isOnline: boolean;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const EMPTY_CACHE: DataCache = { locations: [], apartments: [], bookings: [], archive: [] };

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewName>('schedule');
  const [refreshKey, setRefreshKey] = useState(0);

  // Load cached data synchronously for instant display if available.
  const initialCache = fetchAllSync();
  const hasCache = initialCache.apartments.length > 0 || initialCache.locations.length > 0;

  const [data, setData] = useState<DataCache>(() => ({
    locations: initialCache.locations,
    apartments: initialCache.apartments,
    bookings: initialCache.bookings,
    archive: initialCache.guests_archive,
  }));
  // Show loading spinner immediately if no cache; if cache exists, don't block UI.
  const [loading, setLoading] = useState(!hasCache);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeReady = useRef(false);

  const triggerRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      // Only show loading spinner if we have no data to display
      setLoading((prev) => {
        // Don't set to true if we already have data — silent background refresh
        return false;
      });
      setError(null);
      try {
        const fresh = await fetchAll();
        setData({
          locations: fresh.locations,
          apartments: fresh.apartments,
          bookings: fresh.bookings,
          archive: fresh.guests_archive,
        });
        setIsOnline(true);
        realtimeReady.current = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'فشل تحميل البيانات';
        console.error('Refresh failed:', msg);
        const cached = fetchAllSync();
        if (cached.apartments.length > 0 || cached.locations.length > 0) {
          setData({
            locations: cached.locations,
            apartments: cached.apartments,
            bookings: cached.bookings,
            archive: cached.guests_archive,
          });
          setIsOnline(false);
        } else {
          setError(msg);
          setIsOnline(false);
        }
      } finally {
        setLoading(false);
        setRefreshKey((k) => k + 1);
      }
    }, 100);
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    // If no cache, show loading immediately while we fetch
    if (!hasCache) setLoading(true);
    triggerRefresh();
  }, [triggerRefresh]);

  // Subscribe to Realtime only after initial data load succeeds
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const interval = setInterval(() => {
      if (!realtimeReady.current) return;
      clearInterval(interval);
      channel = supabase
        .channel('pms-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => triggerRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'apartments' }, () => triggerRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => triggerRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'guests_archive' }, () => triggerRefresh())
        .subscribe();
    }, 3000);
    return () => {
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [triggerRefresh]);

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); triggerRefresh(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [triggerRefresh]);

  return (
    <AppContext.Provider value={{ view, setView, refreshKey, triggerRefresh, data, loading, error, isOnline }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
