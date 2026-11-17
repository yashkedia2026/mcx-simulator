import { useState } from 'react';
import { TrendingUp, Lock, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
}

/** Shown when the user arrives via a Supabase password-reset email link. */
export function ResetPasswordForm({ isDark, onToggleTheme }: Props) {
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  const inputCls = 'w-full rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) setError(err.message);
    // On success, passwordRecovery flips to false in useAuth and AuthGuard
    // moves on to the main app (the recovery link already left us signed in).
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300"
      style={{ background: 'var(--th-bg)' }}
    >
      <button
        onClick={onToggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      <div
        className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-6 transition-colors duration-300"
        style={{ background: 'var(--th-card)', border: '1px solid var(--th-border)' }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-brand/15 border border-brand/25">
            <TrendingUp className="w-6 h-6 text-brand-text" />
          </div>
          <div className="text-center">
            <h1 className="font-bold text-xl" style={{ color: 'var(--th-text)' }}>Set a New Password</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--th-muted)' }}>Choose a new password for your account</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--th-muted)' }} />
            <input
              type={showPwd ? 'text' : 'password'}
              placeholder="New password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputCls}
              style={{ background: 'var(--th-input)', border: '1px solid var(--th-border2)', color: 'var(--th-text)', paddingLeft: 38, paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--th-muted)' }}
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--th-muted)' }} />
            <input
              type={showPwd ? 'text' : 'password'}
              placeholder="Confirm new password"
              required
              minLength={6}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className={inputCls}
              style={{ background: 'var(--th-input)', border: '1px solid var(--th-border2)', color: 'var(--th-text)', paddingLeft: 38 }}
            />
          </div>

          {error && <p className="text-xs text-negative text-center">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ background: 'var(--th-accent)', color: 'var(--th-on-accent)' }}
          >
            {busy ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
