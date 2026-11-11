import { LayoutDashboard, ClipboardList, DoorOpen, Wallet, Settings, X } from 'lucide-react';
import { useApp, type ViewName } from '@/context/AppContext';
import { useI18n } from '@/context/I18nContext';
import { useState } from 'react';
import { SupportAbout } from '@/components/SupportAbout';

const NAV_ITEMS: { id: ViewName; labelKey: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { id: 'schedule', labelKey: 'work_schedule', icon: ClipboardList },
  { id: 'checkout', labelKey: 'checkout', icon: DoorOpen },
  { id: 'archive', labelKey: 'archive', icon: Wallet },
];

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useI18n();
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-5 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('settings')}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <SupportAbout />
      </div>
    </div>
  );
}

export function TopNav() {
  const { view, setView } = useApp();
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t sm:sticky sm:top-0 sm:h-16 sm:border-t-0 sm:border-b border-slate-200 dark:border-slate-800 px-2 py-2 pb-[env(safe-area-inset-bottom)] sm:pt-[env(safe-area-inset-top)] sm:flex sm:items-center">
        <div className="flex items-center gap-1 w-full sm:grid sm:grid-cols-[1fr_auto_1fr]">
          {/* Brand — hidden on mobile, pinned to the right edge on desktop (RTL start) */}
          <div className="hidden sm:flex items-center gap-2 px-2 sm:justify-self-start">
            <img src="/icon.svg" alt="HICHAM STAY" className="w-7 h-7 rounded-lg" />
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-wide">HICHAM STAY</span>
          </div>
          <div className="flex flex-1 items-center justify-around sm:flex-none sm:justify-self-center sm:gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                    active ? 'text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  <Icon size={22} />
                  <span className="text-[10px] font-semibold leading-tight text-center">{t(item.labelKey)}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all sm:justify-self-end ${
              settingsOpen ? 'text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <Settings size={22} />
            <span className="text-[10px] font-semibold leading-tight text-center">{t('settings')}</span>
          </button>
        </div>
      </nav>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
