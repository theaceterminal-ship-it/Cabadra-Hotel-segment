import { supabase } from './supabaseClient';

/**
 * Every owner account should work with email + password, including ones
 * created with Google (which have no password until one is set here).
 * See 0069_auth_has_password.sql.
 */

export async function fetchHasPassword(): Promise<boolean> {
  const { data, error } = await supabase.rpc('my_auth_has_password');
  if (error) throw error;
  return data === true;
}

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
  // Supabase's "secure password change" setting asks for a recent sign-in.
  if (/reauthenticat/i.test(error.message)) {
    throw new Error('For security, sign out and sign in again with Google, then set your password.');
  }
  throw error;
}
