import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { SupabaseSetupNeeded } from '../components/SupabaseSetupNeeded';
import LoginPage from './LoginPage';
import { SignedInRedirect } from './LandingPage';

/**
 * `/login` and `/signup` — the website's two top-right buttons. Same form,
 * opened on a different tab. Once a session exists (including when Google
 * sends the user back here after OAuth), it hands off to the same redirect
 * `/` uses.
 */
export default function AuthPage({ mode }: { mode: 'sign_in' | 'sign_up' }) {
  const { loading, session, assignments } = useAuth();

  if (!isSupabaseConfigured) return <SupabaseSetupNeeded />;
  if (loading) return <div className="min-h-screen bg-[#eef0ec]" />;
  if (session) return <SignedInRedirect assignments={assignments} />;

  return <LoginPage key={mode} initialMode={mode} />;
}
