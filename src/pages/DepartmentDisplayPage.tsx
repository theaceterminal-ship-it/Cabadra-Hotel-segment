import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, User } from 'lucide-react';
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
import { DisplayTaskQueue } from '../components/DisplayTaskQueue';
import { DEPARTMENT_LABELS } from '../lib/departments';

const DEPT_LABELS = DEPARTMENT_LABELS;

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
  const [showManualEntry, setShowManualEntry] = useState(false);
  const badgeInputRef = useRef<HTMLInputElement>(null);
  // Belt-and-suspenders against a double-submit of the identical badge —
  // the backend now also debounces this (0054), but a client-side guard
  // costs nothing and catches it before a network round trip either way.
  const lastSubmitRef = useRef<{ value: string; at: number } | null>(null);

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

    const now = Date.now();
    const last = lastSubmitRef.current;
    if (last && last.value === value && now - last.at < 5000) {
      // Same badge, same few seconds — almost certainly a duplicate (a
      // second camera frame, a double-tap) rather than someone genuinely
      // scanning twice on purpose. Skip the round trip entirely.
      return;
    }
    lastSubmitRef.current = { value, at: now };

    try {
      const result = await scanBadge(token, value);
      const verb = result.action === 'released' ? 'clocked out' : 'clocked in';
      setScanFeedback(`${result.staffName} ${verb}${result.shiftName ? ` — ${result.shiftName}` : ''}`);
      // Reflect the change immediately instead of waiting for the next
      // 8s poll — the header used to look like nothing happened for a
      // few seconds right after a scan.
      setDisplay(d => d && {
        ...d,
        activeStaffName: result.action === 'released' ? undefined : result.staffName,
        activeSince: result.action === 'released' ? undefined : (result.claimedAt ?? d.activeSince),
      });
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

  const handleReject = async (task: DisplayTask, note: string) => {
    setActingOn(task.id);
    try {
      await rejectDisplayTask(token, task.id, note);
      setDisplay(d => d && { ...d, tasks: d.tasks.filter(t => t.id !== task.id) });
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
    <div className="min-h-screen w-full bg-surface flex flex-col items-center p-4 sm:p-6 pb-24">
      <div className="w-full max-w-2xl space-y-4">
        <header className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 sm:p-5 text-center">
          <p className="text-[11px] font-bold text-primary uppercase tracking-wider">{display.propertyName}</p>
          <h1 className="text-xl font-bold text-on-surface mt-0.5">{DEPT_LABELS[display.department]} — {display.label}</h1>
          {/* Who actually has this display claimed right now (0053) — the
              screen used to say nothing about this at all, badge scan or
              not. */}
          {display.activeStaffName ? (
            <p className="text-xs font-semibold text-success mt-1.5">
              On shift: {display.activeStaffName}
              {display.activeSince ? ` · since ${new Date(display.activeSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
          ) : (
            <p className="text-xs text-on-surface-variant mt-1.5">No one clocked in yet</p>
          )}
        </header>

        {scanFeedback && (
          <p className="text-center text-xs font-semibold text-primary">{scanFeedback}</p>
        )}

        <DisplayTaskQueue
          tasks={display.tasks}
          actingOn={actingOn}
          onStart={handleStart}
          onComplete={handleComplete}
          onReject={handleReject}
        />
      </div>

      {/* Clock in/out — deliberately small and out of the way at the
          bottom: the task queue above is what this screen is actually
          for, not the login mechanic. */}
      <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-auto z-40 flex flex-col items-center gap-2">
        {showManualEntry && (
          <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-full shadow-lg p-1.5 pl-3 w-full sm:w-80">
            <User className="w-4 h-4 text-on-surface-variant shrink-0" />
            <input
              ref={badgeInputRef}
              autoFocus
              value={badgeValue}
              onChange={e => setBadgeValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitBadge(); } }}
              placeholder="Badge code"
              className="flex-1 h-8 px-1 text-xs bg-transparent focus:outline-none"
            />
            <button
              onClick={() => submitBadge()}
              disabled={!badgeValue.trim()}
              className="h-8 px-3 rounded-full bg-primary text-on-primary text-xs font-bold disabled:opacity-40 shrink-0"
            >
              Go
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCameraScanner(true)}
            className="h-10 px-4 rounded-full bg-primary text-on-primary text-xs font-bold shadow-lg flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" /> Scan Badge
          </button>
          <button
            onClick={() => setShowManualEntry(v => !v)}
            className="h-10 px-3 rounded-full bg-surface-container-lowest border border-outline-variant text-on-surface-variant text-xs font-semibold shadow-lg"
          >
            Type code
          </button>
        </div>
      </div>

      {showCameraScanner && (
        <QrScannerModal
          title="Scan Your Badge"
          instructions="Point your camera at your own badge QR — the one from your Staff tab's Shift Claims badge. First scan clocks you in, the same scan again later clocks you out."
          onScan={handleCameraScan}
          onClose={() => setShowCameraScanner(false)}
        />
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
