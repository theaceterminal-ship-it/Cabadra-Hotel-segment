import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * The app's own calendar, in the app's colours, instead of the browser's date box
 * (which often wouldn't open from its icon and looks different on every phone).
 *
 *   <DatePicker value="2026-10-27" onChange={iso => …} min max />          one day
 *   <DateRangePicker start end onChange={(start, end) => …} />              two clicks: from, then to
 *
 * Dates are "YYYY-MM-DD" strings in the viewer's own time zone, the same shape
 * <input type="date"> used, so callers swap in without conversions.
 */

const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const todayLocalIso = () => toIso(new Date());
const addDaysIso = (iso: string, n: number) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return toIso(d); };
const nightsBetween = (a: string, b: string) => Math.round((+fromIso(b) - +fromIso(a)) / 86400000);

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const fmtLong = (iso: string) => fromIso(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = (iso: string) => fromIso(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// ---------------------------------------------------------------------------
// The month grid
// ---------------------------------------------------------------------------
interface CalendarProps {
  /** The day (single) or first day (range) that is chosen. */
  start?: string;
  /** The last day of a range, when one is chosen. */
  end?: string;
  /** While picking the end of a range: the day under the pointer, to preview the span. */
  hover?: string | null;
  min?: string;
  max?: string;
  onPick: (iso: string) => void;
  onHover?: (iso: string | null) => void;
}

function Calendar({ start, end, hover, min, max, onPick, onHover }: CalendarProps) {
  const focusIso = start || todayLocalIso();
  const [view, setView] = useState(() => { const d = fromIso(focusIso); return { y: d.getFullYear(), m: d.getMonth() }; });
  const today = todayLocalIso();

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const lead = first.getDay();
    const daysIn = new Date(view.y, view.m + 1, 0).getDate();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= daysIn; d++) out.push(toIso(new Date(view.y, view.m, d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [view]);

  const go = (delta: number) => setView(v => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const title = new Date(view.y, view.m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const rangeEnd = end || (hover && start && hover > start ? hover : undefined);

  return (
    <div className="w-[17.5rem] select-none">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => go(-1)} aria-label="Previous month" className="size-8 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container"><ChevronLeft className="size-4" /></button>
        <span className="text-sm font-semibold text-on-surface">{title}</span>
        <button type="button" onClick={() => go(1)} aria-label="Next month" className="size-8 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container"><ChevronRight className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-on-surface-variant mb-1">
        {WEEKDAYS.map(w => <span key={w} className="h-6 flex items-center justify-center">{w}</span>)}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => onHover?.(null)}>
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e${i}`} className="h-9" />;
          const disabled = (!!min && iso < min) || (!!max && iso > max);
          const isStart = iso === start;
          const isEnd = iso === rangeEnd;
          const inRange = !!start && !!rangeEnd && iso > start && iso < rangeEnd;
          const edge = isStart || isEnd;
          return (
            <span key={iso} className={`h-9 flex items-center justify-center ${inRange ? 'bg-highlight' : ''} ${isStart && rangeEnd ? 'bg-gradient-to-r from-transparent from-50% to-highlight to-50%' : ''} ${isEnd && start && rangeEnd !== start ? 'bg-gradient-to-l from-transparent from-50% to-highlight to-50%' : ''}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(iso)}
                onMouseEnter={() => onHover?.(iso)}
                aria-label={fmtLong(iso)}
                aria-pressed={edge}
                className={`size-9 rounded-full text-sm transition-colors ${
                  edge ? 'bg-primary text-on-primary font-semibold'
                  : disabled ? 'text-on-surface-variant/40 cursor-not-allowed'
                  : `text-on-surface hover:bg-surface-container ${iso === today ? 'ring-1 ring-primary' : ''}`
                }`}
              >
                {Number(iso.slice(8))}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The pop-up: placed beside whatever opened it, kept on screen, closes on an
// outside tap or Escape. Rendered at the page's top level so a scrolling or
// clipped box around the field can't cut it off.
// ---------------------------------------------------------------------------
function Popover({ anchor, onClose, children, footer }: { anchor: React.RefObject<HTMLElement | null>; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const p = ref.current;
    if (!a || !p) return;
    const w = p.offsetWidth, h = p.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = Math.min(Math.max(8, a.left), vw - w - 8);
    let top = a.bottom + 6;
    if (top + h > vh - 8) top = a.top - h - 6 >= 8 ? a.top - h - 6 : Math.max(8, vh - h - 8);
    setPos({ top, left });
  }, [anchor]);

  useLayoutEffect(() => { place(); }, [place]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, onClose, place]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Choose a date"
      // Keep a tap in here from reaching a parent's "click outside to close" (the bell, a modal).
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, zIndex: 300 }}
      className="rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-2xl p-3"
    >
      {children}
      {footer && <div className="mt-2 pt-2 border-t border-outline-variant">{footer}</div>}
    </div>,
    document.body
  );
}

const baseTrigger = 'h-10 px-3 text-sm border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface focus:border-primary focus:outline-none flex items-center justify-between gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed';

// ---------------------------------------------------------------------------
// One day
// ---------------------------------------------------------------------------
interface DatePickerProps {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  /** Shown when nothing is chosen. */
  placeholder?: string;
  /** A day can be cleared (value becomes ''). */
  clearable?: boolean;
  disabled?: boolean;
  /** Classes for the box you tap; default is the app's standard field. */
  className?: string;
  /** Shorter text ("27 Oct") for tight spots. */
  compact?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function DatePicker({ value, onChange, min, max, placeholder = 'Pick a date', clearable, disabled, className, compact, id, ...rest }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const today = todayLocalIso();
  const canToday = (!min || today >= min) && (!max || today <= max);
  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={rest['aria-label']}
        onClick={() => setOpen(o => !o)}
        className={className ?? `${baseTrigger} w-full`}
      >
        <span className={`truncate ${value ? '' : 'text-on-surface-variant'}`}>{value ? (compact ? fmtShort(value) : fmtLong(value)) : placeholder}</span>
        <CalendarIcon className="size-4 shrink-0 text-on-surface-variant" />
      </button>
      {open && (
        <Popover
          anchor={btn}
          onClose={close}
          footer={
            <div className="flex items-center justify-between">
              <button type="button" disabled={!canToday} onClick={() => { onChange(today); close(); }} className="text-xs font-semibold text-primary disabled:opacity-40 px-2 py-1 rounded-md hover:bg-highlight">Today</button>
              {clearable && value && <button type="button" onClick={() => { onChange(''); close(); }} className="text-xs font-semibold text-on-surface-variant px-2 py-1 rounded-md hover:bg-surface-container">Clear</button>}
            </div>
          }
        >
          <Calendar start={value || undefined} min={min} max={max} onPick={iso => { onChange(iso); close(); }} />
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// From – to
// ---------------------------------------------------------------------------
interface DateRangePickerProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  /** Earliest day that can be the first day. */
  min?: string;
  /** Latest day that can be chosen. */
  max?: string;
  /** The first day is fixed (a guest already in the room): only the last day is chosen. */
  startLocked?: boolean;
  /** Both ends may be the same day (reports, filters). Stays need the end after the start, so default false. */
  allowSameDay?: boolean;
  /** Shows "3 nights" under the field. */
  showNights?: boolean;
  startLabel?: string;
  endLabel?: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}

export function DateRangePicker({ start, end, onChange, min, max, startLocked, allowSameDay, showNights, startLabel = 'From', endLabel = 'To', className, compact, disabled }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  // 'start' = next tap chooses the first day; 'end' = next tap chooses the last.
  const [picking, setPicking] = useState<'start' | 'end'>(startLocked ? 'end' : 'start');
  const [anchorDay, setAnchorDay] = useState(start);
  const [hover, setHover] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const minEnd = (s: string) => (allowSameDay ? s : addDaysIso(s, 1));

  const openIt = () => {
    setAnchorDay(start);
    setPicking(startLocked ? 'end' : 'start');
    setHover(null);
    setOpen(o => !o);
  };

  const pick = (iso: string) => {
    if (picking === 'start' && !startLocked) {
      setAnchorDay(iso);
      setPicking('end');
      // Keep a later "to" if it is still after the new "from"; otherwise move it along.
      if (!end || end < minEnd(iso)) onChange(iso, minEnd(iso));
      else onChange(iso, end);
      return;
    }
    const from = startLocked ? start : anchorDay;
    if (iso < minEnd(from)) {
      // Tapped on or before the first day: treat it as choosing a new first day.
      if (startLocked) return;
      setAnchorDay(iso);
      onChange(iso, minEnd(iso));
      return;
    }
    onChange(from, iso);
    close();
  };

  const nights = start && end ? nightsBetween(start, end) : 0;
  const fmt = compact ? fmtShort : fmtLong;
  return (
    <div>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openIt}
        className={className ?? `${baseTrigger} w-full`}
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          <span className="truncate">{start ? fmt(start) : startLabel}</span>
          <span className="text-on-surface-variant">→</span>
          <span className="truncate">{end ? fmt(end) : endLabel}</span>
        </span>
        <CalendarIcon className="size-4 shrink-0 text-on-surface-variant" />
      </button>
      {showNights && nights > 0 && <p className="mt-1 text-[11px] text-on-surface-variant">{nights} night{nights === 1 ? '' : 's'}</p>}
      {open && (
        <Popover
          anchor={btn}
          onClose={close}
          footer={
            <p className="text-[11px] text-on-surface-variant px-1">
              {picking === 'start' && !startLocked ? `Pick the ${startLabel.toLowerCase()} day` : `Now pick the ${endLabel.toLowerCase()} day`}
              {startLocked ? ` (${fmtShort(start)} is fixed)` : ''}
            </p>
          }
        >
          <Calendar
            start={startLocked ? start : picking === 'end' ? anchorDay : start}
            end={picking === 'end' ? undefined : end}
            hover={picking === 'end' ? hover : null}
            min={picking === 'end' ? (startLocked ? start : min) : min}
            max={max}
            onPick={pick}
            onHover={setHover}
          />
        </Popover>
      )}
    </div>
  );
}
