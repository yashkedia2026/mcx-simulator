import { Clock3, RotateCcw, Trash2 } from 'lucide-react';
import type { StrategyDraft } from '@/lib/strategyDraft';

interface Props {
  draft: StrategyDraft;
  onRestore: () => void;
  onDiscard: () => void;
}

export function DraftRecoveryDialog({ draft, onRestore, onDiscard }: Props) {
  const savedAt = new Date(draft.savedAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ background: 'var(--th-overlay)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="draft-recovery-title"
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{
          background: 'var(--th-card)',
          border: '1px solid var(--th-border)',
          color: 'var(--th-text)',
        }}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
            <Clock3 className="h-5 w-5" />
          </span>
          <div>
            <h2 id="draft-recovery-title" className="text-base font-semibold" style={{ color: 'var(--th-text)' }}>
              Resume your unsaved draft?
            </h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>
              We found a draft with {draft.legs.length} {draft.legs.length === 1 ? 'leg' : 'legs'} saved on {savedAt}.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDiscard}
            className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-red-500/10 hover:text-red-400"
            style={{ color: 'var(--th-muted)' }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Discard draft
          </button>
          <button
            type="button"
            autoFocus
            onClick={onRestore}
            className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ background: '#2979ff', color: '#fff' }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore draft
          </button>
        </div>
      </div>
    </div>
  );
}
