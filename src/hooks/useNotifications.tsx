import { useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Notification = {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const idRef = useRef(0);

  const notify = useCallback((type: Notification['type'], message: string) => {
    const id = `n${++idRef.current}`;
    const n: Notification = { id, type, message, timestamp: Date.now() };
    setNotifications(prev => [...prev, n]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(x => x.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(x => x.id !== id));
  }, []);

  return { notifications, notify, dismiss };
}

export function NotificationStack({
  notifications,
  onDismiss,
}: {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map(n => {
        const Icon = n.type === 'success' ? CheckCircle2
          : n.type === 'error' ? XCircle
          : n.type === 'warning' ? AlertCircle
          : Info;
        const color = n.type === 'success' ? 'text-green-500'
          : n.type === 'error' ? 'text-red-500'
          : n.type === 'warning' ? 'text-amber-500'
          : 'text-blue-500';
        const border = n.type === 'success' ? 'border-green-500/30'
          : n.type === 'error' ? 'border-red-500/30'
          : n.type === 'warning' ? 'border-amber-500/30'
          : 'border-blue-500/30';
        return (
          <div
            key={n.id}
            className={cn(
              'flex items-start gap-2.5 rounded-xl border bg-[#111736]/95 backdrop-blur-xl px-4 py-3 shadow-lg fade-up',
              border
            )}
            onClick={() => onDismiss(n.id)}
          >
            <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', color)} />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">{n.message}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {new Date(n.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
