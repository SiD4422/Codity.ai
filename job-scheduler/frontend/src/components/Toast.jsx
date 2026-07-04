import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, kind = 'error') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div style={{
        position: 'fixed', bottom: 20, right: 20, display: 'flex',
        flexDirection: 'column', gap: 8, zIndex: 1000,
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: 'var(--bg-panel-alt)',
            border: `1px solid ${t.kind === 'error' ? 'var(--accent-red)' : 'var(--accent-teal)'}`,
            borderRadius: 'var(--radius-md)', padding: '10px 16px', fontSize: 13,
            color: 'var(--text-primary)', maxWidth: 320, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
