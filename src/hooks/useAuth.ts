import { useState, useEffect } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

function configurationError() {
  return new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.');
}

export function useAuth() {
  const [session, setSession]         = useState<Session | null>(null);
  const [user, setUser]               = useState<User | null>(null);
  const [loading, setLoading]         = useState(isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    // Restore existing session immediately
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Listen to sign-in / sign-out / password-recovery events.
    // Clicking a reset-password email link lands here with event === 'PASSWORD_RECOVERY'
    // and a temporary session that's only good for calling updateUser({ password }).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithEmail(email: string, password: string) {
    if (!supabase) return configurationError();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  }

  async function signUpWithEmail(email: string, password: string) {
    if (!supabase) return configurationError();
    const { error } = await supabase.auth.signUp({ email, password });
    return error;
  }

  async function sendPasswordReset(email: string) {
    if (!supabase) return configurationError();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return error;
  }

  async function updatePassword(newPassword: string) {
    if (!supabase) return configurationError();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) setPasswordRecovery(false);
    return error;
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  return {
    session, user, loading, passwordRecovery, configured: isSupabaseConfigured,
    signInWithEmail, signUpWithEmail, sendPasswordReset, updatePassword, signOut,
  };
}
