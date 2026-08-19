import type { ReactNode } from 'react';
import { LoginPage } from './LoginPage';
import { ResetPasswordForm } from './ResetPasswordForm';
import type { Session } from '@supabase/supabase-js';

interface Props {
  session: Session | null;
  loading: boolean;
  passwordRecovery: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  children: ReactNode;
}

export function AuthGuard({ session, loading, passwordRecovery, isDark, onToggleTheme, children }: Props) {
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--th-bg)' }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
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
