import { useRef, useState } from 'react';
import { Save, Trash2, FolderOpen, ChevronDown, ChevronRight, Pencil, Check, X } from 'lucide-react';
import type { SavedStrategy } from '@/hooks/useSavedStrategies';

interface Props {
  strategies: SavedStrategy[];
  atLimit: boolean;
  canSave: boolean;
  loading: boolean;
  suggestedName: string;
  isDark: boolean;
  onSave: (name: string) => boolean | void | Promise<boolean | void>;
  onRename: (id: string, name: string) => boolean | void | Promise<boolean | void>;
  saveError?: string | null;
  activeStrategyName?: string;
  autoSaveStatus?: 'idle' | 'saving' | 'saved' | 'error';
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

export function SaveLoadPanel({ strategies, atLimit, canSave, loading, suggestedName, onSave, onRename, saveError, activeStrategyName, autoSaveStatus = 'idle', onLoad, onDelete }: Props) {
  const [name, setName] = useState(suggestedName);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [saveLocked, setSaveLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  // Keep name in sync when suggestedName changes externally (template loaded)
  if (name !== suggestedName && suggestedName !== '' && name === '') {
    setName(suggestedName);
  }

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

  function startRename(strategy: SavedStrategy) {
    setRenamingId(strategy.id);
    setRenameValue(strategy.name);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  async function commitRename() {
    if (!renamingId || !renameValue.trim() || renameSaving) return;
    setRenameSaving(true);
    try {
      const accepted = await onRename(renamingId, renameValue.trim());
      if (accepted !== false) cancelRename();
    } finally {
      setRenameSaving(false);
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
          aria-label="Strategy name"
          className="ui-input flex-1"
          value={name}
          onChange={e => { setName(e.target.value); setSaveLocked(false); setSavedMessage(''); savingRef.current = false; }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
        />
        <button
          disabled={!canSave || atLimit || saveLocked || saving}
          onClick={() => { void save(); }}
          className="ui-btn ui-btn-primary shrink-0"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : saveLocked ? 'Saved' : 'Save strategy'}
        </button>
      </div>
      {activeStrategyName && <p className="text-xs" style={{ color: 'var(--th-muted)' }}>
        Editing “{activeStrategyName}”. Changes to this loaded strategy are saved automatically; use Save strategy to create a separate copy.
      </p>}
      {loading && <p role="status" className="text-xs" style={{ color: 'var(--th-muted)' }}>Loading your saved strategies…</p>}
      {savedMessage && <p role="status" className="text-xs text-positive">✓ {savedMessage} Opened below.</p>}
      {activeStrategyName && autoSaveStatus !== 'idle' && <p role="status" className="text-xs" style={{ color: autoSaveStatus === 'error' ? 'var(--th-warning)' : autoSaveStatus === 'saved' ? 'var(--th-positive)' : 'var(--th-muted)' }}>
        {autoSaveStatus === 'saving' ? `Saving changes to “${activeStrategyName}”…` : autoSaveStatus === 'saved' ? `✓ Changes auto-saved to “${activeStrategyName}”.` : `Could not auto-save “${activeStrategyName}”. Try again after reconnecting.`}
      </p>}
      {saveError && <p role="alert" className="text-xs text-negative">{saveError}</p>}
      {!loading && !saveError && strategies.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--th-muted)' }}>
          No saved strategies yet. Add a position, name it, and choose Save strategy.
        </p>
      )}

      {/* Saved list toggle */}
      {strategies.length > 0 && (
        <div>
          <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="flex min-h-10 items-center gap-2 w-full text-left transition-colors hover:opacity-80"
            style={{ color: 'var(--th-muted)', fontSize: 12, fontWeight: 600 }}
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <FolderOpen className="w-3 h-3" />
            SAVED ({strategies.length}/20)
          </button>

          {open && (
            <div className="flex flex-col gap-2 mt-1">
              {strategies.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
                  style={{ background: 'var(--th-card)', border: '1px solid var(--th-border)' }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: 'var(--th-border2)' }}
                  />
                  <div className="flex-1 min-w-0">
                    {renamingId === s.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        aria-label={`New name for ${s.name}`}
                        className="ui-input h-8 w-full px-2 text-xs"
                        onChange={event => setRenameValue(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') { event.preventDefault(); void commitRename(); }
                          if (event.key === 'Escape') { event.preventDefault(); cancelRename(); }
                        }}
                      />
                    ) : (
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--th-text)' }}>{s.name}</p>
                    )}
                    <p className="text-xs" style={{ color: 'var(--th-muted)' }}>
                      {s.instrument} · {timeAgo(s.savedAt)}
                    </p>
                  </div>
                  {renamingId === s.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { void commitRename(); }}
                        disabled={!renameValue.trim() || renameSaving}
                        aria-label={`Save new name for ${s.name}`}
                        title="Save name"
                        className="ui-icon-btn ui-icon-btn-sm"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        disabled={renameSaving}
                        aria-label="Cancel rename"
                        title="Cancel"
                        className="ui-icon-btn ui-icon-btn-sm"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startRename(s)}
                      aria-label={`Rename ${s.name}`}
                      title="Rename strategy"
                      className="ui-icon-btn ui-icon-btn-sm"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => onLoad(s)}
                    className="ui-btn ui-btn-sm ui-btn-soft shrink-0"
                  >
                    Load
                  </button>
                  {confirmDelete === s.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => { onDelete(s.id); setConfirmDelete(null); }}
                        className="ui-btn ui-btn-sm ui-btn-ghost px-2 text-negative"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="ui-btn ui-btn-sm ui-btn-ghost px-2"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(s.id)}
                      aria-label={`Delete ${s.name}`}
                      className="ui-icon-btn ui-icon-btn-sm ui-icon-btn-danger"
                    >
                      <Trash2 className="w-4 h-4" />
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
