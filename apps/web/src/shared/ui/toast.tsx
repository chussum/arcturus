'use client';

import { styled } from '@linaria/react';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { colors, font, typography } from '../styles/tokens';

interface Toast {
  id: number;
  tone: 'error' | 'success';
  message: string;
  leaving: boolean;
}

interface ToastValue {
  /** Shows a toast for 4 seconds; error tone for failures, success for confirmations. */
  notify: (tone: Toast['tone'], message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const Stack = styled.div`
  position: fixed;
  top: 60px;
  right: 20px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(360px, calc(100vw - 40px));
  pointer-events: none;
`;

const Item = styled.button<{ $tone: 'error' | 'success'; $leaving: boolean }>`
  ${font(typography.caption)}
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(29, 26, 18, 0.92);
  backdrop-filter: saturate(160%) blur(16px);
  -webkit-backdrop-filter: saturate(160%) blur(16px);
  border: 1px solid ${colors.hairlineStrong};
  color: ${colors.text};
  animation: ${({ $leaving }) => ($leaving ? 'arcturus-toast-out' : 'arcturus-toast-in')} 220ms
    cubic-bezier(0.21, 0.8, 0.32, 1) both;

  &::before {
    content: '';
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 9999px;
    background: ${({ $tone }) => ($tone === 'error' ? colors.statusFailed : colors.statusRunning)};
  }

  @keyframes arcturus-toast-in {
    from {
      opacity: 0;
      transform: translateX(16px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  @keyframes arcturus-toast-out {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(16px);
    }
  }
`;

const VISIBLE_MS = 4000;
const LEAVE_MS = 220;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  const notify = useCallback(
    (tone: Toast['tone'], message: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, tone, message, leaving: false }]);
      setTimeout(() => dismiss(id), VISIBLE_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <Stack aria-live="polite">
        {toasts.map((toast) => (
          <Item
            key={toast.id}
            type="button"
            $tone={toast.tone}
            $leaving={toast.leaving}
            onClick={() => dismiss(toast.id)}
          >
            {toast.message}
          </Item>
        ))}
      </Stack>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}
