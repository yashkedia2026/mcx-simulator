import { useState } from 'react';
import { TrendingUp, Mail, Lock, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
}

type Mode = 'signin' | 'signup' | 'forgot';

export function LoginPage({ isDark, onToggleTheme }: Props) {
  const { signInWithEmail, signUpWithEmail, sendPasswordReset } = useAuth();

  const [mode, setMode]         = useState<Mode>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');
  const [busy, setBusy]         = useState(false);

  const inputCls = 'w-full rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors';

  function switchMode(m: Mode) {
    setMode(m);
    setError('');
    setInfo('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);

    if (mode === 'forgot') {
      const err = await sendPasswordReset(email);
      setBusy(false);
      if (err) setError(err.message);
      else setInfo('Check your email for a password reset link.');
      return;
    }

    const err = mode === 'signin'
      ? await signInWithEmail(email, password)
      : await signUpWithEmail(email, password);

    setBusy(false);
    if (err) {
      setError(err.message);
    } else if (mode === 'signup') {
      setInfo('Check your email to confirm your account, then sign in.');
      setMode('signin');
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300"
      style={{ background: 'var(--th-bg)' }}
    >
      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-6 transition-colors duration-300"
        style={{ background: 'var(--th-card)', border: '1px solid var(--th-border)' }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-brand/15 border border-brand/25">
            <TrendingUp className="w-6 h-6 text-brand-text" />
          </div>
          <div className="text-center">
            <h1 className="font-bold text-xl" style={{ color: 'var(--th-text)' }}>MCX Options Simulator</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--th-muted)' }}>Black-76 Model · Powered by Supabase</p>
          </div>
        </div>

        {/* Mode tabs (hidden while resetting password) */}
        {mode !== 'forgot' && (
          <div className="flex rounded-lg overflow-hidden" style={{ background: 'var(--th-input)', border: '1px solid var(--th-border)' }}>
            {(['signin', 'signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className="flex-1 py-2 text-xs font-semibold transition-colors"
                style={{
                  background: mode === m ? 'var(--th-accent)' : 'transparent',
                  color: mode === m ? 'var(--th-on-accent)' : 'var(--th-muted)',
                }}
              >
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>
        )}

        {mode === 'forgot' && (
          <p className="text-xs text-center" style={{ color: 'var(--th-muted)' }}>
            Enter your email and we'll send you a link to reset your password.
          </p>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Email */}
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--th-muted)' }} />
            <input
              type="email"
              placeholder="Email address"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputCls}
              style={{ background: 'var(--th-input)', border: '1px solid var(--th-border2)', color: 'var(--th-text)', paddingLeft: 38 }}
            />
          </div>

          {/* Password (not needed for the forgot-password request) */}
          {mode !== 'forgot' && (
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--th-muted)' }} />
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="Password"
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
          )}

          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="self-end text-xs font-medium underline transition-opacity hover:opacity-80"
              style={{ color: 'var(--th-link)' }}
            >
              Forgot password?
            </button>
          )}

          {/* Error / Info */}
          {error && <p className="text-xs text-negative text-center">{error}</p>}
          {info  && <p className="text-xs text-positive text-center">{info}</p>}

          {/* Submit */}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ background: 'var(--th-accent)', color: 'var(--th-on-accent)' }}
          >
            {busy
              ? 'Please wait…'
              : mode === 'signin' ? 'Sign In'
              : mode === 'signup' ? 'Create Account'
              : 'Send Reset Link'}
          </button>
        </form>

        {mode === 'forgot' && (
          <button
            onClick={() => switchMode('signin')}
            className="text-xs text-center font-medium underline transition-opacity hover:opacity-80"
            style={{ color: 'var(--th-link)' }}
          >
            ← Back to sign in
          </button>
        )}
      </div>

      <p className="mt-6 text-xs text-center" style={{ color: 'var(--th-muted)' }}>
        Your strategies are saved to the cloud and accessible from any device.
      </p>
    </div>
  );
}
