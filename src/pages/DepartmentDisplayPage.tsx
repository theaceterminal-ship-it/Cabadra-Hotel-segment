import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, Check, Clock, MapPin, Play, User, X } from 'lucide-react';
import {
  resolveDisplay,
  scanBadge,
  startDisplayTask,
  completeDisplayTask,
  rejectDisplayTask,
  DepartmentDisplay,
  DisplayTask,
} from '../lib/displayApi';
import { QrScannerModal } from '../components/QrScannerModal';

const DEPT_LABELS: Record<DepartmentDisplay['department'], string> = {
  housekeeping: 'Housekeeping', maintenance: 'Maintenance', amenities: 'Amenities', concierge: 'Concierge',
};

const REFRESH_MS = 8000;

/**
 * What a department display's own QR opens — either a shared tablet left
 * on this screen for a whole shift, or (just as often now) a staff
 * member's own phone, reached by scanning that same department QR with
 * their camera app. Two login-less layers stacked: the display token (this
 * page's own auth, same tier as a task QR) scopes it to one department's
 * queue; a badge scan on top of that claims it for a named staff member,
 * so "who accepted this" has a real answer — no password, no picking a
 * name from a list, just the scan itself (department_display_scan_badge,
 * 0047). Scanning the SAME badge again releases that claim, so "scan when
 * you arrive, scan again before you go" is the entire clock-in/out flow.
 *
 * Two ways to feed it a badge token: the in-browser camera scanner
 * (QrScannerModal) for a personal phone, or a plain text field for a
 * shared kiosk wired to a USB/Bluetooth barcode-scanner peripheral acting
 * as a keyboard (scanning "types" the token, then sends Enter) — or just
 * manual entry for testing. Both end up at the same submitBadge call.
 */
export default function DepartmentDisplayPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [display, setDisplay] = useState<DepartmentDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [badgeValue, setBadgeValue] = useState('');
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [rejectingTask, setRejectingTask] = useState<DisplayTask | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const badgeInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    if (!token) return;
    resolveDisplay(token)
      .then(d => { setDisplay(d); setError(null); })
      .catch(err => setError(err instanceof Error ? err.message : 'This display link is invalid.'));
  }, [token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  // Keeps the scanner-ready input focused — a shared kiosk has no one to
  // tap it back into focus between scans.
  useEffect(() => {
    const refocus = () => badgeInputRef.current?.focus();
    const id = setInterval(refocus, 2000);
    return () => clearInterval(id);
  }, []);

  // Not wired through <form onSubmit> — a form with a single text input and
  // no visible submit button relies on the browser's implicit-submission
  // behavior, which turned out NOT to fire reliably when tested against the
  // live deployment (real keystrokes + Enter from a barcode scanner, or an
  // automated Return keypress, never reached this handler at all). Calling
  // it directly from the input's own onKeyDown removes that dependency
  // entirely instead of trying to coax implicit submission into working.
  const submitBadge = async (rawValue?: string) => {
    const value = (rawValue ?? badgeValue).trim();
    if (!value) return;
    setBadgeValue('');
    try {
      const result = await scanBadge(token, value);
      const verb = result.action === 'released' ? 'clocked out' : 'clocked in';
      setScanFeedback(`${result.staffName} ${verb}${result.shiftName ? ` — ${result.shiftName}` : ''}`);
    } catch (err) {
      setScanFeedback(err instanceof Error ? err.message : 'Badge not recognized.');
    } finally {
      setTimeout(() => setScanFeedback(null), 4000);
      badgeInputRef.current?.focus();
    }
  };

  const handleCameraScan = (decodedText: string) => {
    setShowCameraScanner(false);
    submitBadge(decodedText);
  };

  const handleStart = async (task: DisplayTask) => {
    setActingOn(task.id);
    try {
      const status = await startDisplayTask(token, task.id);
      setDisplay(d => d && { ...d, tasks: d.tasks.map(t => (t.id === task.id ? { ...t, status } : t)) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start task.');
    } finally {
      setActingOn(null);
    }
  };

  const handleComplete = async (task: DisplayTask) => {
    setActingOn(task.id);
    try {
      await completeDisplayTask(token, task.id);
      // Completed tasks drop off a display's queue entirely (resolve only
      // ever returns pending/in_progress) — remove it locally instead of
      // waiting for the next poll.
      setDisplay(d => d && { ...d, tasks: d.tasks.filter(t => t.id !== task.id) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark task done.');
    } finally {
      setActingOn(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingTask || !rejectNote.trim()) return;
    setActingOn(rejectingTask.id);
    try {
      await rejectDisplayTask(token, rejectingTask.id, rejectNote.trim());
      setDisplay(d => d && { ...d, tasks: d.tasks.filter(t => t.id !== rejectingTask.id) });
      setRejectingTask(null);
      setRejectNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject task.');
    } finally {
      setActingOn(null);
    }
  };

  if (error && !display) {
    return (
      <CenteredCard>
        <p className="text-lg font-bold text-on-surface">Can't open this display</p>
        <p className="text-sm text-on-surface-variant mt-2">{error}</p>
      </CenteredCard>
    );
  }

  if (!display) {
    return (
      <CenteredCard>
        <p className="text-sm text-on-surface-variant">Loading display…</p>
      </CenteredCard>
    );
  }

  return (
    <div className="min-h-screen w-full bg-surface flex flex-col items-center p-4 sm:p-6">
      <div className="w-full max-w-2xl space-y-4">
        <header className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 sm:p-5 text-center">
          <p className="text-[11px] font-bold text-primary uppercase tracking-wider">{display.propertyName}</p>
          <h1 className="text-xl font-bold text-on-surface mt-0.5">{DEPT_LABELS[display.department]} — {display.label}</h1>
        </header>

        <div className="bg-highlight border border-outline-variant rounded-2xl p-4 space-y-3">
          {/* The primary path on a personal phone: tap, scan your own badge
              QR (BadgeQrModal), done — no typing. Scanning the same badge
              again later clocks you out (department_display_scan_badge
              toggles claim/release on its own). */}
          <button
            onClick={() => setShowCameraScanner(true)}
            className="w-full h-12 rounded-xl bg-primary text-on-primary text-sm font-bold flex items-center justify-center gap-2"
          >
            <Camera className="w-5 h-5" /> Scan Badge to Clock In / Out
          </button>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-outline-variant" />
            <span className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider">or type it manually</span>
            <div className="flex-1 h-px bg-outline-variant" />
          </div>

          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-on-highlight shrink-0" />
            <input
              ref={badgeInputRef}
              value={badgeValue}
              onChange={e => setBadgeValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitBadge(); } }}
              placeholder="Badge code — for a USB scanner or manual entry"
              className="flex-1 h-11 px-3 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm focus:border-primary focus:outline-none"
            />
            {/* A real scanner's Enter keystroke should already submit via onKeyDown
                above, but a tappable fallback costs nothing and covers manual entry
                (testing, or a scanner that doesn't emit Enter) without depending on
                that keystroke being recognized at all. */}
            <button
              onClick={() => submitBadge()}
              disabled={!badgeValue.trim()}
              className="h-11 px-4 rounded-lg bg-primary text-on-primary text-sm font-bold disabled:opacity-40 shrink-0"
            >
              Go
            </button>
          </div>
        </div>
        {scanFeedback && (
          <p className="text-center text-xs font-semibold text-primary">{scanFeedback}</p>
        )}

        {display.tasks.length === 0 ? (
          <div className="p-10 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant text-on-surface-variant text-sm">
            Nothing waiting right now.
          </div>
        ) : (
          <div className="space-y-3">
            {display.tasks.map(task => {
              const inProgress = task.status === 'in_progress';
              const isHigh = task.priority === 'high';
              return (
                <article
                  key={task.id}
                  className={`bg-surface-container-lowest rounded-2xl border p-4 sm:p-5 ${isHigh ? 'border-error-container' : 'border-outline-variant'}`}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {task.roomLabel && (
                      <span className="inline-flex items-center gap-1 bg-surface-container-low border border-outline-variant rounded-full px-2.5 py-1 text-xs text-on-surface-variant">
                        <MapPin className="w-3 h-3" /> {task.roomLabel}
                      </span>
                    )}
                    {task.dueLabel && (
                      <span className="inline-flex items-center gap-1 bg-surface-container-low border border-outline-variant rounded-full px-2.5 py-1 text-xs text-on-surface-variant">
                        <Clock className="w-3 h-3" /> {task.dueLabel}
                      </span>
                    )}
                    {isHigh && (
                      <span className="bg-error-container text-on-error-container rounded-full px-2.5 py-1 text-xs font-bold">
                        High Priority
                      </span>
                    )}
                  </div>

                  <p className="font-bold text-on-surface">{task.title}</p>
                  {task.description && <p className="text-sm text-on-surface-variant mt-1">{task.description}</p>}
                  {task.assignedTo && <p className="text-xs text-on-surface-variant mt-2">Assigned to {task.assignedTo}</p>}

                  <div className="flex gap-2 mt-4">
                    {!inProgress && (
                      <button
                        onClick={() => setRejectingTask(task)}
                        disabled={actingOn === task.id}
                        className="h-12 px-4 rounded-xl border border-error text-error font-bold flex items-center justify-center disabled:opacity-50"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                    {inProgress ? (
                      <button
                        onClick={() => handleComplete(task)}
                        disabled={actingOn === task.id}
                        className="flex-1 h-12 rounded-xl bg-success text-on-success font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Check className="w-5 h-5" /> {actingOn === task.id ? 'Marking done…' : 'Mark Done'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStart(task)}
                        disabled={actingOn === task.id}
                        className="flex-1 h-12 rounded-xl bg-primary text-on-primary font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Play className="w-5 h-5 fill-current" /> {actingOn === task.id ? 'Starting…' : 'Accept'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {showCameraScanner && (
        <QrScannerModal
          title="Scan Your Badge"
          instructions="Point your camera at your own badge QR — the one from your Staff tab's Shift Claims badge. First scan clocks you in, the same scan again later clocks you out."
          onScan={handleCameraScan}
          onClose={() => setShowCameraScanner(false)}
        />
      )}

      {rejectingTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant space-y-3">
            <h3 className="text-lg font-bold text-on-surface">Reject this task?</h3>
            <p className="text-xs text-on-surface-variant">{rejectingTask.title}. Say why so whoever's tracking it knows what happened.</p>
            <textarea
              autoFocus
              rows={3}
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="e.g. Short-staffed tonight, no spare linens..."
              className="w-full p-2.5 text-sm border border-outline-variant rounded-lg focus:border-error focus:outline-none resize-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setRejectingTask(null)}
                className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={!rejectNote.trim() || actingOn === rejectingTask.id}
                className="px-4 py-2 bg-error text-on-error rounded-lg text-xs font-bold disabled:opacity-50"
              >
                Reject Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-surface flex items-center justify-center p-6">
      <div className="max-w-sm text-center bg-surface-container-lowest rounded-2xl border border-outline-variant p-6">{children}</div>
    </div>
  );
}
