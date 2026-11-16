import { useRef, useState } from 'react';
import { Save, Trash2, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';
import type { SavedStrategy } from '@/hooks/useSavedStrategies';

interface Props {
  strategies: SavedStrategy[];
  atLimit: boolean;
  canSave: boolean;
  loading: boolean;
  suggestedName: string;
  isDark: boolean;
  onSave: (name: string) => boolean | void | Promise<boolean | void>;
  saveError?: string | null;
  onLoad: (strategy: SavedStrategy) => void;
  onDelete: (id: string) => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SaveLoadPanel({ strategies, atLimit, canSave, loading, suggestedName, onSave, saveError, onLoad, onDelete }: Props) {
  const [name, setName] = useState(suggestedName);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [saveLocked, setSaveLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Keep name in sync when suggestedName changes externally (template loaded)
  if (name !== suggestedName && suggestedName !== '' && name === '') {
    setName(suggestedName);
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--th-input)',
    border: '1px solid var(--th-border2)',
    color: 'var(--th-text)',
  };

  const badgeColor = (symbol: string) => {
    const colors: Record<string, string> = {
      GOLD: '#fbbf24', GOLDM: '#fbbf24', SILVER: '#9ca3af', SILVERM: '#9ca3af',
      CRUDEOIL: '#6366f1', CRUDEOILM: '#6366f1', NATURALGAS: '#34d399',
      COPPER: '#f97316', ZINC: '#22d3ee', ALUMINIUM: '#a78bfa',
    };
    return colors[symbol] ?? '#9ca3af';
  };

  async function save() {
    if (!canSave || atLimit || saveLocked || savingRef.current || saving) return;
    const nextName = (name || suggestedName).trim();
    savingRef.current = true;
    setSaving(true);
    try {
      const accepted = await onSave(nextName);
      if (accepted === false) return;
      setSaveLocked(true);
      setSavedMessage(`Strategy “${nextName || 'Unnamed strategy'}” saved.`);
      setOpen(true);
      setName('');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Save row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder={atLimit ? 'Limit reached (20)' : canSave ? 'Name this strategy…' : 'Add a position before saving'}
          disabled={atLimit || !canSave}
          className="flex-1 rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-colors"
          style={inputStyle}
          value={name}
          onChange={e => { setName(e.target.value); setSaveLocked(false); setSavedMessage(''); savingRef.current = false; }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
        />
        <button
          disabled={!canSave || atLimit || saveLocked || saving}
          onClick={() => { void save(); }}
          className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-colors disabled:opacity-40"
          style={{ background: '#2979ff', color: '#fff' }}
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : saveLocked ? 'Saved' : 'Save strategy'}
        </button>
      </div>
      {loading && <p role="status" className="text-[11px]" style={{ color: 'var(--th-muted)' }}>Loading your saved strategies…</p>}
      {savedMessage && <p role="status" className="text-[11px] text-emerald-400">✓ {savedMessage} Opened below.</p>}
      {saveError && <p role="alert" className="text-[11px] text-red-400">{saveError}</p>}
      {!loading && !saveError && strategies.length === 0 && (
        <p className="text-[11px]" style={{ color: 'var(--th-muted)' }}>
          No saved strategies yet. Add a position, name it, and choose Save strategy.
        </p>
      )}

      {/* Saved list toggle */}
      {strategies.length > 0 && (
        <div>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1.5 w-full text-left py-1.5 transition-colors hover:opacity-80"
            style={{ color: 'var(--th-muted)', fontSize: 10, fontWeight: 600 }}
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <FolderOpen className="w-3 h-3" />
            SAVED ({strategies.length}/20)
          </button>

          {open && (
            <div className="flex flex-col gap-1.5 mt-1">
              {strategies.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
                  style={{ background: 'var(--th-card)', border: '1px solid var(--th-border)' }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: badgeColor(s.instrument) }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--th-text)' }}>{s.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--th-muted)' }}>
                      {s.instrument} · {timeAgo(s.savedAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => onLoad(s)}
                    className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded transition-colors hover:opacity-80"
                    style={{ background: 'rgba(41,121,255,0.15)', color: '#2979ff' }}
                  >
                    Load
                  </button>
                  {confirmDelete === s.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => { onDelete(s.id); setConfirmDelete(null); }}
                        className="text-[10px] font-bold text-red-400 hover:text-red-300 px-1"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-[10px]"
                        style={{ color: 'var(--th-muted)' }}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(s.id)}
                      className="shrink-0 p-1 rounded transition-colors hover:text-red-400 hover:bg-red-500/10"
                      style={{ color: 'var(--th-muted)' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
