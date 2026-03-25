import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

interface RichDatePickerProps {
  label?: string;
  value: string;
  onChange: (next: string) => void;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const parseIsoDate = (value: string) => {
  const [y, m, d] = value.split('-').map((v) => Number(v));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
};

const toIso = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth() + n, 1);

export function RichDatePicker({ label = '日付', value, onChange }: RichDatePickerProps) {
  const selectedDate = useMemo(() => parseIsoDate(value), [value]);
  const [open, setOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));

  const days = useMemo(() => {
    const first = startOfMonth(currentMonth);
    const startOffset = first.getDay();
    const cursor = new Date(first);
    cursor.setDate(first.getDate() - startOffset);

    const rows: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      rows.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
  }, [currentMonth]);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input-field w-full text-left inline-flex items-center justify-between whitespace-nowrap"
      >
        <span>
          {(() => {
            const d = parseIsoDate(value);
            return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
          })()}
        </span>
        <CalendarDays className="w-4 h-4 text-slate-500" />
      </button>

      {open && (
        <>
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
        <div className="absolute z-40 mt-2 w-[320px] max-w-[92vw] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="px-3 py-2 bg-gradient-to-r from-sky-50 via-cyan-50 to-emerald-50 border-b border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentMonth((m) => addMonths(m, -1))}
              className="w-8 h-8 rounded-lg hover:bg-white/70 text-slate-700 inline-flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-semibold text-slate-900">
              {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
            </p>
            <button
              type="button"
              onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
              className="w-8 h-8 rounded-lg hover:bg-white/70 text-slate-700 inline-flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="h-7 text-[11px] text-slate-500 flex items-center justify-center">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const iso = toIso(d);
                const isCurrentMonth = d.getMonth() === currentMonth.getMonth();
                const isSelected = iso === value;
                const isToday = iso === toIso(new Date());
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    className={`h-9 rounded-lg text-sm transition ${
                      isSelected
                        ? 'bg-slate-900 text-white font-semibold'
                        : isCurrentMonth
                          ? 'text-slate-800 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-50'
                    } ${isToday && !isSelected ? 'ring-1 ring-sky-300' : ''}`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  const iso = toIso(today);
                  setCurrentMonth(startOfMonth(today));
                  onChange(iso);
                  setOpen(false);
                }}
                className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs"
              >
                今日
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-xs"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

