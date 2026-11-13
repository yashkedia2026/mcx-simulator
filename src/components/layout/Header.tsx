import { TrendingUp, Sun, Moon, Radio, LogOut } from 'lucide-react';

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
  marketConnected: boolean;
  userEmail?: string;
  onSignOut?: () => void;
}

export function Header({ isDark, onToggleTheme, marketConnected, userEmail, onSignOut }: Props) {
  return (
    <header
      className="h-14 flex items-center px-5 shrink-0 border-b transition-colors duration-300"
      style={{
        background: isDark
          ? 'linear-gradient(90deg, #0d0d1e 0%, #111128 60%, #0d0d1e 100%)'
          : 'linear-gradient(90deg, #ffffff 0%, #f8f8fa 60%, #ffffff 100%)',
        borderBottomColor: isDark ? 'rgba(255,255,255,0.07)' : '#e5e5e5',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-orange-500/20 border border-orange-500/20">
          <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
        </div>
        <span
          className="font-semibold text-sm tracking-tight transition-colors duration-300"
          style={{ color: 'var(--th-text)' }}
        >
          MCX Options Simulator
        </span>
        <span className="text-xs hidden sm:inline" style={{ color: 'var(--th-muted)' }}>· Black-76 Model</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {userEmail && (
          <span
            className="hidden max-w-[160px] truncate rounded-md px-2 py-1 text-xs sm:inline"
            style={{ color: 'var(--th-muted)', background: 'var(--th-input)' }}
            title={userEmail}
          >
            {userEmail.length > 22 ? `${userEmail.slice(0, 20)}…` : userEmail}
          </span>
        )}

        {onSignOut && (
          <button
            onClick={onSignOut}
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-red-500/10 hover:text-red-400"
            style={{ color: 'var(--th-muted)' }}
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}

        <span
          className="hidden sm:flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px]"
          style={{ borderColor: 'var(--th-border2)', color: marketConnected ? 'var(--th-positive)' : 'var(--th-muted)' }}
        >
          <Radio className="w-3.5 h-3.5" />
          {marketConnected ? 'Live data connected' : 'Live data will connect automatically'}
        </span>

        {/* Dark / Light toggle */}
        <button
          onClick={onToggleTheme}
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-200 hover:bg-black/10 dark:hover:bg-white/10"
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDark
            ? <Sun  className="w-4 h-4 text-yellow-400" />
            : <Moon className="w-4 h-4 text-indigo-500" />
          }
        </button>

        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/25 tracking-wider">
          MCX
        </span>
      </div>
    </header>
  );
}
