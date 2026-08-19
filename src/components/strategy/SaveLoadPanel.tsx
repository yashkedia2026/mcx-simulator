import { useState } from 'react';
import { Save, Trash2, FolderOpen, ChevronDown, ChevronRight, Pencil, Loader2 } from 'lucide-react';
import type { SavedStrategy } from '@/hooks/useSavedStrategies';

interface Props {
  strategies: SavedStrategy[];
  suggestedName: string;
  isDark: boolean;
  saving: boolean;
  loadedStrategyId: string | null;
  loadedName: string;
  onSave: (name: string) => void;
  onUpdate: (id: string, name: string) => void;
  onLoad: (strategy: SavedStrategy) => void;
  onDelete: (id: string, name: string) => void;
  onRename: (id: string, name: string) => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SaveLoadPanel({
  strategies, suggestedName, isDark: _isDark, saving,
  loadedStrategyId, loadedName,
  onSave, onUpdate, onLoad, onDelete, onRename,
}: Props) {
  const [name, setName] = useState(suggestedName);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Keep name in sync when suggestedName changes externally (template loaded)
  if (name !== suggestedName && suggestedName !== '' && name === '') {
    setName(suggestedName);
  }

  // Loading (or clearing) a saved strategy is a deliberate context switch — always
  // sync the name field so "Update" saves under the right name and "New Strategy"
  // doesn't leave a stale name sitting in the box.
  const [prevLoadedId, setPrevLoadedId] = useState(loadedStrategyId);
  if (loadedStrategyId !== prevLoadedId) {
    setPrevLoadedId(loadedStrategyId);
    setName(loadedStrategyId ? loadedName : '');
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--th-input)',
    border: '1px solid var(--th-border2)',
    color: 'var(--th-text)',
  };

  const badgeColor = (symbol: string) => {
    const colors: Record<string, string> = {
      GOLD: '#fbbf24', GOLDM: '#fbbf24', SILVER: '#9ca3af', SILVERM: '#9ca3af',
      CRUDEOIL: '#6366f1', CRUDEOILM: '#6366f1', NATURALGAS: '#34d399', NATGASMINI: '#34d399',
      COPPER: '#f97316', ZINC: '#22d3ee', ALUMINIUM: '#a78bfa',
    };
    return colors[symbol] ?? '#9ca3af';
  };

  function runPrimaryAction() {
    if (loadedStrategyId) {
      onUpdate(loadedStrategyId, name);
    } else {
      onSave(name);
      setName('');
    }
  }

  function startRename(s: SavedStrategy) {
    setRenamingId(s.id);
    setRenameValue(s.name);
  }

  function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (trimmed) onRename(id, trimmed);
    setRenamingId(null);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Save / Update row */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Name this strategy…"
          className="flex-1 rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-colors"
          style={inputStyle}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') runPrimaryAction(); }}
        />
        <button
          disabled={saving}
          onClick={runPrimaryAction}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-colors disabled:opacity-60"
          style={{ background: '#2979ff', color: '#fff' }}
        >
          {saving
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Save className="w-3.5 h-3.5" />
          }
          {saving ? (loadedStrategyId ? 'Updating…' : 'Saving…') : (loadedStrategyId ? 'Update' : 'Save')}
        </button>
      </div>

      {loadedStrategyId && (
        <p className="self-start text-[10px]" style={{ color: 'var(--th-muted)' }}>
          editing “{loadedName}” —{' '}
          <button
            disabled={saving}
            onClick={() => { onSave(name); setName(''); }}
            className="font-semibold underline transition-colors hover:opacity-80 disabled:opacity-40"
            style={{ color: '#2979ff' }}
          >
            save as a new strategy instead
          </button>
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
            SAVED ({strategies.length})
          </button>

          {open && (
            <div className="flex flex-col gap-1.5 mt-1">
              {strategies.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
                  style={{
                    background: 'var(--th-card)',
                    border: `1px solid ${s.id === loadedStrategyId ? '#2979ff' : 'var(--th-border)'}`,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: badgeColor(s.instrument) }}
                  />

                  {renamingId === s.id ? (
                    <input
                      autoFocus
                      className="flex-1 min-w-0 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      style={inputStyle}
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(s.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={() => commitRename(s.id)}
                    />
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--th-text)' }}>{s.name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--th-muted)' }}>
                        {s.instrument} · {timeAgo(s.savedAt)}
                      </p>
                    </div>
                  )}

                  {renamingId !== s.id && (
                    <button
                      onClick={() => startRename(s)}
                      title="Rename"
                      className="shrink-0 p-1 rounded transition-colors hover:opacity-80"
                      style={{ color: 'var(--th-muted)' }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}

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
                        onClick={() => { onDelete(s.id, s.name); setConfirmDelete(null); }}
                        className="text-[10px] font-bold px-2 py-0.5 rounded transition-colors hover:opacity-80"
                        style={{ background: 'rgba(255,23,68,0.15)', color: '#ff1744' }}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded transition-colors hover:opacity-80"
                        style={{ background: 'var(--th-input)', color: 'var(--th-muted)', border: '1px solid var(--th-border2)' }}
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
