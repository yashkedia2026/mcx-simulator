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
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-text">
            <Clock3 className="h-5 w-5" />
          </span>
          <div>
            <h2 id="draft-recovery-title" className="text-base font-semibold" style={{ color: 'var(--th-text)' }}>
              Resume your unsaved draft?
            </h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>
              We found a draft with {draft.legs.length} {draft.legs.length === 1 ? 'leg' : 'legs'} saved on {savedAt}.
            </p>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>
              This is a recovery copy, separate from your named saved strategies. Discarding it will not delete a saved strategy.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDiscard}
            className="ui-btn ui-btn-ghost"
          >
            <Trash2 className="h-4 w-4" />
            Discard draft
          </button>
          <button
            type="button"
            autoFocus
            onClick={onRestore}
            className="ui-btn ui-btn-primary"
          >
            <RotateCcw className="h-4 w-4" />
            Restore draft
          </button>
        </div>
      </div>
    </div>
  );
}
