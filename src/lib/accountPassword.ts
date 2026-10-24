import { supabase } from './supabaseClient';

/**
 * Owners sign up with Google only. Passwords are optional and set from an
 * emailed link (Resend): verify-setup-payment sends one once the first
 * property is paid for, and send-password-link sends one on request from
 * the sign-in page. The link opens /set-password (SetPasswordPage).
 */

export const MIN_PASSWORD_LENGTH = 8;

/** Returns an error message to show, or null when the pair is acceptable. */
export function checkNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return 'The two passwords don’t match.';
  return null;
}

export async function setAccountPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) return;
  if (/should be different/i.test(error.message)) {
    throw new Error('That’s already your password. Choose a different one, or just sign in.');
  }
  throw error;
}

/** Asks for a set-password email. Resolves with the message to show (the same whether or not the account exists). */
export async function requestPasswordLink(email: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('send-password-link', { body: { email } });
  if (error) {
    const context = (error as { context?: Response }).context;
    const body = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    throw new Error(body?.message ?? 'Couldn’t send the link. Please try again.');
  }
  return (data as { message?: string })?.message ?? 'If there’s a Cabadra account for that email, we’ve sent it a link.';
}
