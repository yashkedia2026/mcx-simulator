import { useCallback, useRef, useState } from 'react';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  text: string;
}

let toastCounter = 0;

/** Lightweight, dependency-free toast queue. Each toast auto-dismisses after 3s. */
export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = ++toastCounter;
    setToasts(prev => [...prev, { id, type, text }]);
    timers.current.set(id, setTimeout(() => dismiss(id), 3000));
  }, [dismiss]);

  return { toasts, showToast, dismiss };
}
