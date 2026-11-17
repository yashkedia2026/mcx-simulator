import type { ReactNode } from 'react';
import { LoginPage } from './LoginPage';
import { ResetPasswordForm } from './ResetPasswordForm';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '@/lib/supabase';

interface Props {
  session: Session | null;
  loading: boolean;
  passwordRecovery: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  children: ReactNode;
}

export function AuthGuard({ session, loading, passwordRecovery, isDark, onToggleTheme, children }: Props) {
  if (!isSupabaseConfigured) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'var(--th-bg)', color: 'var(--th-text)' }}
      >
        <div
          className="w-full max-w-lg rounded-2xl p-8"
          style={{ background: 'var(--th-card)', border: '1px solid var(--th-border)' }}
        >
          <h1 className="text-xl font-semibold">Connect your account</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--th-muted)' }}>
            Authentication and cloud strategy saving are enabled in this version. Add your Supabase project values to <code>.env.local</code>, then restart the dev server.
          </p>
          <pre
            className="mt-4 overflow-x-auto rounded-lg p-3 text-xs"
            style={{ background: 'var(--th-input)', color: 'var(--th-muted)' }}
          >{`VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key`}</pre>
          <p className="mt-4 text-xs" style={{ color: 'var(--th-muted)' }}>
            Run <code>supabase/schema.sql</code> in the Supabase SQL editor to create the saved-strategies table and its row-level security rules.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--th-bg)' }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-xs" style={{ color: 'var(--th-muted)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  // Password-recovery links leave the user with a temporary session that's only
  // good for setting a new password — don't drop them into the main app yet.
  if (passwordRecovery) {
    return <ResetPasswordForm isDark={isDark} onToggleTheme={onToggleTheme} />;
  }

  if (!session) {
    return <LoginPage isDark={isDark} onToggleTheme={onToggleTheme} />;
  }

  return <>{children}</>;
}
