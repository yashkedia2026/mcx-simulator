import { TrendingUp, Sun, Moon, LogOut } from 'lucide-react';

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
  marketConnected: boolean;
  userEmail?: string;
  onSignOut?: () => void;
}

export function Header({ isDark, onToggleTheme, marketConnected, userEmail, onSignOut }: Props) {
  const statusText = marketConnected ? 'Live data connected' : 'Live data will connect automatically';

  return (
    <header
      className="h-14 flex items-center gap-3 px-4 shrink-0 border-b transition-colors duration-300"
      style={{ background: 'var(--th-panel)', borderBottomColor: 'var(--th-border)' }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 items-center justify-center w-8 h-8 rounded-lg bg-brand text-on-brand">
          <TrendingUp className="w-4 h-4" />
        </div>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-semibold text-sm tracking-tight" style={{ color: 'var(--th-text)' }}>
            MCX Options Simulator
          </span>
          <span className="hidden shrink-0 text-xs md:inline" style={{ color: 'var(--th-muted)' }}>Black-76 Model</span>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* Connection status: a dot everywhere, with the wording from tablet width up. */}
        <span
          role="status"
          title={statusText}
          className="mr-2 flex items-center gap-2 text-xs"
          style={{ color: 'var(--th-muted)' }}
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: marketConnected ? 'var(--th-positive)' : 'var(--th-border2)' }}
          />
          <span className="sr-only sm:not-sr-only">{statusText}</span>
        </span>

        {userEmail && (
          <span
            className="mr-1 hidden max-w-[200px] truncate text-xs lg:inline"
            style={{ color: 'var(--th-muted)' }}
            title={userEmail}
          >
            {userEmail}
          </span>
        )}

        <button
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="ui-icon-btn"
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {onSignOut && (
          <button
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="ui-icon-btn ui-icon-btn-danger"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
