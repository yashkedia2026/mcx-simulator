import { CheckCircle2, XCircle, X } from 'lucide-react';
import type { ToastMessage } from '@/hooks/useToast';

interface Props {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

export function ToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className="flex items-center gap-2 pl-3 pr-2 py-2.5 rounded-lg text-xs shadow-lg transition-colors"
          style={{
            background: 'var(--th-card)',
            border: `1px solid ${t.type === 'success' ? 'rgba(0,200,83,0.4)' : 'rgba(255,23,68,0.4)'}`,
            color: 'var(--th-text)',
            minWidth: 220,
            maxWidth: 320,
          }}
        >
          {t.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#00c853' }} />
            : <XCircle className="w-4 h-4 shrink-0" style={{ color: '#ff1744' }} />
          }
          <span className="flex-1">{t.text}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="shrink-0 p-0.5 rounded transition-colors hover:opacity-70"
            style={{ color: 'var(--th-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
