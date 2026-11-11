import { useMemo, useState } from 'react';
import { Copy, Share2, UserCheck } from 'lucide-react';
import { Modal } from './Modal';
import type { Apartment, Location } from '@/types';
import { formatDate, STATUS_LABELS, SOURCE_LABELS, PAYMENT_LABELS } from '@/lib/utils';
import { copyToClipboard, sendWhatsAppText } from '@/lib/whatsapp';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  apartments: Apartment[];
  locations: Location[];
}

function buildApartmentBlock(apt: Apartment, number: number): string {
  const b = apt.current_booking;
  const lines = [
    `${number}. شقة ${apt.apt_number ?? apt.name} - ${apt.name}`,
    `   الحالة: ${STATUS_LABELS[apt.status]}`,
  ];
  if (b) {
    lines.push(`   الضيف: ${b.guest_name}`);
    if (b.guest_phone) lines.push(`   الجوال: ${b.guest_phone}`);
    lines.push(`   الدخول: ${formatDate(b.check_in)}`);
    lines.push(`   الخروج: ${formatDate(b.check_out)}`);
    lines.push(`   المصدر: ${SOURCE_LABELS[b.source]}`);
    if (b.total_price != null) lines.push(`   الإجمالي: ${b.total_price} ر.س`);
    if (b.balance > 0) lines.push(`   المتبقي: ${b.balance} ر.س`);
    if (b.payment_method) lines.push(`   طريقة الدفع: ${PAYMENT_LABELS[b.payment_method]}`);
    if (b.notes) lines.push(`   ملاحظات: ${b.notes}`);
  }
  if (apt.maintenance_note) lines.push(`   ملاحظة الصيانة: ${apt.maintenance_note}`);
  return lines.join('\n');
}

function buildReport(regions: Location[], apartments: Apartment[]): string {
  const sections = regions.map((loc) => {
    const apts = apartments.filter((a) => a.location_id === loc.id);
    const header = `*${loc.name}* (${apts.length} شقة)`;
    if (apts.length === 0) return `${header}\nلا توجد شقق`;
    const blocks = apts.map((apt, i) => buildApartmentBlock(apt, i + 1));
    return [header, ...blocks].join('\n\n');
  });
  return [`*تقرير حالة الشقق - ${formatDate(new Date())}*`, ...sections].join('\n\n');
}

export function ReportModal({ isOpen, onClose, apartments, locations }: ReportModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const allSelected = locations.length > 0 && selectedIds.length === locations.length;

  const report = useMemo(() => {
    const regions = locations.filter((l) => selectedIds.includes(l.id));
    return regions.length > 0 ? buildReport(regions, apartments) : '';
  }, [locations, selectedIds, apartments]);

  const toggleRegion = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : locations.map((l) => l.id));
  };

  const handleCopy = () => {
    copyToClipboard(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="التقارير" size="lg">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">اختر المناطق</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-emerald-600" />
              كل المناطق
            </label>
            {locations.map((loc) => (
              <label
                key={loc.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(loc.id)}
                  onChange={() => toggleRegion(loc.id)}
                  className="h-4 w-4 accent-emerald-600"
                />
                {loc.name}
              </label>
            ))}
          </div>
        </div>

        {report ? (
          <>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 max-h-[50vh] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200 font-sans leading-relaxed">
                {report}
              </pre>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCopy} className="btn-secondary flex-1">
                {copied ? <UserCheck size={18} /> : <Copy size={18} />}
                {copied ? 'تم النسخ' : 'نسخ'}
              </button>
              <button onClick={() => sendWhatsAppText(report)} className="btn-success flex-1">
                <Share2 size={18} />
                مشاركة
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400 text-center py-6">اختر منطقة أو أكثر لعرض التقرير</p>
        )}
      </div>
    </Modal>
  );
}
