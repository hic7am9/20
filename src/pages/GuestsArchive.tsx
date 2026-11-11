import { useState, useMemo } from 'react';
import { Search, Download, Wallet, MessageCircle, Star, Filter, Trash2 } from 'lucide-react';
import type { GuestArchive } from '@/types';
import { formatDate, whatsappLink, dateMatches } from '@/lib/utils';
import { sanitizePhone } from '@/lib/phone';
import { useApp } from '@/context/AppContext';
import { useI18n } from '@/context/I18nContext';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/Modal';


interface ArchiveProps {
  archive: GuestArchive[];
}

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => setHover(star)}
          className={`${onChange ? 'cursor-pointer' : 'cursor-default'} transition-transform ${onChange ? 'hover:scale-110' : ''}`}
          disabled={!onChange}
        >
          <Star
            size={16}
            className={star <= display ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
          />
        </button>
      ))}
    </div>
  );
}

export function GuestsArchive({ archive }: ArchiveProps) {
  const { triggerRefresh } = useApp();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GuestArchive | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const locations = useMemo(() => {
    const set = new Set<string>();
    archive.forEach((g) => { if (g.location_name) set.add(g.location_name); });
    return Array.from(set);
  }, [archive]);

  const visitStats = useMemo(() => {
    const map = new Map<string, { count: number; apartments: string[] }>();
    archive.forEach((g) => {
      if (!g.guest_phone) return;
      const key = sanitizePhone(g.guest_phone);
      if (!key) return;
      const entry = map.get(key) ?? { count: 0, apartments: [] };
      entry.count += 1;
      const label = [g.apartment_name, g.apartment_number].filter(Boolean).join(' - ');
      if (label && !entry.apartments.includes(label)) entry.apartments.push(label);
      map.set(key, entry);
    });
    return map;
  }, [archive]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return archive.filter((g) => {
      if (q) {
        const match =
          g.guest_name.toLowerCase().includes(q) ||
          (g.guest_phone ?? '').includes(q) ||
          (g.apartment_name ?? '').toLowerCase().includes(q) ||
          (g.apartment_number ?? '').toLowerCase().includes(q) ||
          dateMatches(g.check_in, q) ||
          dateMatches(g.check_out, q);
        if (!match) return false;
      }
      if (filterLocation && g.location_name !== filterLocation) return false;
      if (filterSource && g.source !== filterSource) return false;
      if (dateFrom && g.check_out && g.check_out < dateFrom) return false;
      if (dateTo && g.check_out && g.check_out > dateTo) return false;
      return true;
    });
  }, [archive, search, filterLocation, filterSource, dateFrom, dateTo]);

  const handleRating = async (id: string, rating: number) => {
    await supabase.from('guests_archive').update({ rating }).eq('id', id);
    triggerRefresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const { error } = await supabase.from('guests_archive').delete().eq('id', deleteTarget.id);
    setDeleteLoading(false);
    if (error) {
      setDeleteError('تعذر حذف السجل، حاول مرة أخرى.');
      return;
    }
    setDeleteTarget(null);
    triggerRefresh();
  };

  const exportCSV = () => {
    const headers = ['اسم الضيف', 'رقم الهاتف', 'عدد الزيارات', 'الشقة', 'الموقع', 'المصدر', 'الدخول', 'الخروج', 'السعر', 'الرصيد', 'مدفوع', 'طريقة الدفع', 'التقييم', 'تاريخ الأرشفة'];
    const rows = filtered.map((g) => {
      const key = g.guest_phone ? sanitizePhone(g.guest_phone) : '';
      const visits = key ? visitStats.get(key) : undefined;
      return [
      g.guest_name, g.guest_phone ?? '', visits?.count.toString() ?? '0', g.apartment_name ?? '', g.location_name ?? '',
      g.source ?? '', g.check_in ?? '', g.check_out ?? '', g.total_price?.toString() ?? '',
      g.balance?.toString() ?? '', g.paid ? 'نعم' : 'لا', g.payment_method ?? '',
      g.rating?.toString() ?? '', formatDate(g.archived_at),
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guests_archive_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Wallet size={24} className="text-slate-400" />
            {t('archive')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{archive.length} سجل مؤرشف</p>
        </div>
        <button onClick={exportCSV} disabled={filtered.length === 0} className="btn-secondary">
          <Download size={18} />
          <span className="hidden sm:inline">{t('export_csv')}</span>
        </button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pr-10"
              placeholder="بحث بالاسم، الهاتف، رقم الشقة، أو التاريخ"
            />
          </div>
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="input w-auto"
            aria-label="تصفية حسب المنطقة"
          >
            <option value="">كل المناطق</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
        >
          <Filter size={16} />
          فلاتر متقدمة
        </button>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-slide-down">
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="input">
              <option value="">كل المصادر</option>
              <option value="airbnb">Airbnb</option>
              <option value="gathern">جَذرِن</option>
              <option value="whatsapp">واتساب</option>
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input" dir="ltr" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input" dir="ltr" />
          </div>
        )}

        {(filterLocation || filterSource || dateFrom || dateTo) && (
          <button
            onClick={() => { setFilterLocation(''); setFilterSource(''); setDateFrom(''); setDateTo(''); }}
            className="text-xs text-red-500 hover:underline"
          >
            مسح الفلاتر
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <th className="text-right font-medium px-4 py-3">{t('guest_name')}</th>
                <th className="text-right font-medium px-3 py-3">الزيارات</th>
                <th className="text-right font-medium px-3 py-3 hidden sm:table-cell">{t('guest_phone')}</th>
                <th className="text-right font-medium px-3 py-3 hidden md:table-cell">الشقة</th>
                <th className="text-right font-medium px-3 py-3 hidden lg:table-cell">الموقع</th>
                <th className="text-right font-medium px-3 py-3 hidden sm:table-cell">{t('source')}</th>
                <th className="text-right font-medium px-3 py-3 hidden md:table-cell">{t('check_out')}</th>
                <th className="text-right font-medium px-3 py-3 hidden lg:table-cell">{t('balance')}</th>
                <th className="text-right font-medium px-3 py-3">{t('rating')}</th>
                <th className="text-right font-medium px-3 py-3">واتساب</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id} className="table-row">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{g.guest_name}</td>
                  <td className="px-3 py-3">
                    {(() => {
                      const key = g.guest_phone ? sanitizePhone(g.guest_phone) : '';
                      const visits = key ? visitStats.get(key) : undefined;
                      if (!visits) return <span className="text-slate-300">—</span>;
                      const aptList = visits.apartments.join(' ، ') || '—';
                      return (
                        <span
                          title={`عدد الزيارات: ${visits.count}\nالشقق التي سكنها: ${aptList}`}
                          className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-bold ${
                            visits.count >= 3 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' :
                            visits.count === 2 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' :
                            'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {visits.count}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3 text-slate-500 dark:text-slate-400 hidden sm:table-cell" dir="ltr">{g.guest_phone ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-400 hidden md:table-cell">{g.apartment_name ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-500 dark:text-slate-400 hidden lg:table-cell">{g.location_name ?? '—'}</td>
                  <td className="px-3 py-3 hidden sm:table-cell">
                    {g.source && (
                      <span className={`badge text-[10px] ${
                        g.source === 'airbnb' ? 'bg-airbnb/10 text-airbnb' :
                        g.source === 'gathern' ? 'bg-purple-100 text-purple-700' :
                        'bg-whatsapp/10 text-whatsapp-dark'
                      }`}>
                        {g.source === 'airbnb' ? 'Airbnb' : g.source === 'gathern' ? 'جَذرِن' : 'واتساب'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-500 dark:text-slate-400 hidden md:table-cell text-xs">{g.check_out ? formatDate(g.check_out) : '—'}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-400 hidden lg:table-cell text-xs">
                    {g.balance != null && g.balance > 0 ? (
                      <span className="text-red-600 font-semibold">{g.balance} ر.س</span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <StarRating value={g.rating ?? 0} onChange={(v) => handleRating(g.id, v)} />
                  </td>
                  <td className="px-3 py-3">
                    {g.guest_phone ? (
                      <a
                        href={whatsappLink(g.guest_phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg text-whatsapp-dark hover:bg-whatsapp/10 transition-colors inline-flex"
                      >
                        <MessageCircle size={16} />
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => { setDeleteError(null); setDeleteTarget(g); }}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="حذف السجل"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-12 text-center">
            <Wallet size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-400">لا توجد سجلات مطابقة</p>
          </div>
        )}
      </div>

      {deleteTarget && (
        <Modal isOpen onClose={() => setDeleteTarget(null)} title="تأكيد حذف السجل" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-slate-700 text-center font-semibold">
              هل أنت متأكد من حذف سجل الضيف {deleteTarget.guest_name}؟ سيتم حذفه نهائياً ولا يمكن التراجع عنه.
            </p>
            {deleteError && <p className="text-xs text-red-500 text-center">{deleteError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">إلغاء</button>
              <button onClick={handleDelete} disabled={deleteLoading} className="btn-danger flex-1">
                {deleteLoading ? '...' : 'حذف'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <p className="text-xs text-slate-400 text-center">
        {filtered.length} / {archive.length}
      </p>
    </div>
  );
}
