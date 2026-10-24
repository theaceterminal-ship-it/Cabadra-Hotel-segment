import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, checkNewPassword, setAccountPassword } from '../lib/accountPassword';

/**
 * Shown on the owner dashboard to accounts that only have Google sign-in
 * (onboarding asks new Google sign-ups for a password; this catches
 * accounts created before that). Disappears once a password is set.
 */
export function SetPasswordBanner({ email, onDone }: { email?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = checkNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setAccountPassword(password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t set the password.');
      setSaving(false);
    }
  };

  const inputClass =
    'w-full h-11 px-5 rounded-full border border-outline-variant bg-surface-container-lowest text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-on-surface focus:outline-none';

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-5">
      <div className="rounded-[28px] bg-surface-container-lowest border border-outline-variant p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="size-11 shrink-0 rounded-full bg-surface-container flex items-center justify-center text-on-surface">
            <KeyRound className="size-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-on-surface">Add a password to your account</p>
            <p className="text-sm text-on-surface-variant mt-0.5">
              You sign in with Google. Add a password so you can also sign in with {email ?? 'your email'} and a password.
            </p>
          </div>
          {!open && (
            <button
              onClick={() => setOpen(true)}
              className="h-11 px-5 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors shrink-0"
            >
              Add password
            </button>
          )}
        </div>

        {open && (
          <form onSubmit={handleSubmit} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              placeholder={`New password (${MIN_PASSWORD_LENGTH}+ characters)`}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder="Repeat password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={saving}
              className="h-11 px-6 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save password'}
            </button>
            {error && <p className="sm:col-span-3 text-[13px] text-error pl-1">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
