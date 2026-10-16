import React, { useCallback, useEffect, useState } from 'react';
import {
  Shift,
  ShiftCoverage,
  fetchShifts,
  createShift,
  deleteShift,
  fetchShiftCoverage,
} from '../lib/staffApi';
import { AppView } from '../types';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  Plus,
  Trash2,
  User,
} from 'lucide-react';

const DEPT_LABELS: Record<Shift['department'], string> = {
  housekeeping: 'Housekeeping', maintenance: 'Maintenance', amenities: 'Amenities', concierge: 'Concierge',
};

const STATUS_STYLE: Record<ShiftCoverage['status'], { label: string; icon: React.ElementType; className: string }> = {
  covered: { label: 'Covered', icon: CheckCircle2, className: 'bg-success/10 text-success border-success/30' },
  late: { label: 'Late start', icon: Clock, className: 'bg-warning/10 text-warning border-warning/30' },
  pending: { label: 'Not started yet', icon: Clock, className: 'bg-surface-container-low text-on-surface-variant border-outline-variant' },
  uncovered: { label: 'Uncovered', icon: AlertTriangle, className: 'bg-error-container text-on-error-container border-error-container' },
  overrun: { label: 'Overrun — no relief', icon: Flame, className: 'bg-error-container text-on-error-container border-error-container' },
};

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface ShiftCoverageViewProps {
  propertyId: string;
  onNavigate: (view: AppView) => void;
}

/**
 * "Did someone actually show up" — a report reception/owner checks, not a
 * live push alert (staff_shift_coverage, 0047; this app has no scheduled
 * job anywhere, so a real-time alert the instant a shift goes uncovered is
 * a deliberate later step, not something half-built here).
 */
export const ShiftCoverageView: React.FC<ShiftCoverageViewProps> = ({ propertyId, onNavigate }) => {
  const [department, setDepartment] = useState<Shift['department']>('housekeeping');
  const [date, setDate] = useState(todayLocal());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [coverage, setCoverage] = useState<ShiftCoverage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewShift, setShowNewShift] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('08:00');
  const [newEnd, setNewEnd] = useState('20:00');

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchShifts(propertyId, department),
      fetchShiftCoverage(propertyId, department, date),
    ])
      .then(([s, c]) => { setShifts(s); setCoverage(c); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [propertyId, department, date]);

  useEffect(() => { reload(); }, [reload]);

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createShift(propertyId, { department, name: newName.trim(), startTime: newStart, endTime: newEnd });
      setNewName('');
      setShowNewShift(false);
      reload();
    } catch {
      // Form keeps its values — nothing destructive happened, worth letting them retry.
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
    await deleteShift(shiftId).catch(() => {});
    reload();
  };

  const coverageByShift = new Map<string, ShiftCoverage>(coverage.map(c => [c.shiftId, c]));

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b border-outline-variant">
        <button onClick={() => onNavigate('live_ops')} className="p-2 rounded-full hover:bg-surface-container-low text-primary">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="p-2 bg-primary text-on-primary rounded-lg">
          <CalendarClock className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-on-surface">Shift Coverage</h1>
          <p className="text-xs text-on-surface-variant">Who scanned in, who didn't, and when</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 text-xs bg-surface-container-low p-1 rounded-lg border border-outline-variant w-fit">
          {(Object.keys(DEPT_LABELS) as Shift['department'][]).map(d => (
            <button
              key={d}
              onClick={() => setDepartment(d)}
              className={`px-3 py-1.5 rounded font-semibold transition-colors ${
                department === d ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
              }`}
            >
              {DEPT_LABELS[d]}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="h-9 px-3 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest focus:border-primary focus:outline-none"
        />
      </div>

      {loading ? (
        <p className="text-xs text-outline text-center py-8">Loading…</p>
      ) : shifts.length === 0 ? (
        <div className="p-8 text-center bg-surface-container-lowest rounded-xl border border-outline-variant text-sm text-on-surface-variant">
          No shifts defined for {DEPT_LABELS[department]} yet — add one below.
        </div>
      ) : (
        <div className="space-y-3">
          {shifts.map(shift => {
            const c = coverageByShift.get(shift.id);
            const status = c?.status ?? 'pending';
            const style = STATUS_STYLE[status];
            const Icon = style.icon;
            return (
              <article key={shift.id} className="bg-surface-container-lowest rounded-xl border border-outline-variant p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="font-bold text-on-surface">{shift.name}</p>
                    <p className="text-xs text-outline">{shift.startTime} – {shift.endTime}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border ${style.className}`}>
                    <Icon className="w-3.5 h-3.5" /> {style.label}
                  </span>
                </div>
                {c && (
                  <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant mt-2">
                    <span>Window: {formatTime(c.windowStart)} – {formatTime(c.windowEnd)}</span>
                    {c.claimedBy && (
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3" /> {c.claimedBy}{c.firstClaimAt && ` — in at ${formatTime(c.firstClaimAt)}`}
                      </span>
                    )}
                  </div>
                )}
                <button onClick={() => handleDeleteShift(shift.id)} className="text-[11px] text-error hover:text-red-700 mt-3 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Remove this shift
                </button>
              </article>
            );
          })}
        </div>
      )}

      {showNewShift ? (
        <form onSubmit={handleAddShift} className="bg-surface-container-lowest rounded-xl border border-outline-variant p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[11px] font-bold text-on-surface-variant block mb-1">Name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Morning" className="w-full h-9 px-2.5 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-on-surface-variant block mb-1">Start</label>
            <input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} className="w-full h-9 px-2.5 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-on-surface-variant block mb-1">End</label>
            <input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)} className="w-full h-9 px-2.5 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest" />
          </div>
          <button type="submit" disabled={!newName.trim()} className="h-9 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Shift
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowNewShift(true)}
          className="h-10 px-4 rounded-lg border border-outline-variant text-on-surface-variant text-xs font-bold hover:bg-surface-container-low flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> New Shift for {DEPT_LABELS[department]}
        </button>
      )}
    </div>
  );
};
