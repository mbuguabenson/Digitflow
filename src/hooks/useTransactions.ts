import { useState, useCallback, useRef, useEffect } from 'react';

export type Transaction = {
  id: string;
  contractId: string;
  symbol: string;
  contractType: string;
  barrier?: string;
  amount: number;
  duration: number;
  durationUnit: string;
  status: 'pending' | 'won' | 'lost' | 'error';
  payout?: number;
  profit?: number;
  entrySpot?: number;
  exitSpot?: number;
  timestamp: number;
  settledAt?: number;
  error?: string;
};

const STORAGE_KEY = 'deriv_transactions';
const MAX_TRANSACTIONS = 100;

function loadStored(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Transaction[];
  } catch {
    return [];
  }
}

function saveStored(txs: Transaction[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs.slice(0, MAX_TRANSACTIONS)));
  } catch {
    // ignore
  }
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadStored());
  const watchRef = useRef<((contractId: string, onUpdate: (data: Record<string, unknown>) => void) => () => void) | null>(null);
  const unwatchRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    saveStored(transactions);
  }, [transactions]);

  const setWatchFn = useCallback((fn: typeof watchRef.current) => {
    watchRef.current = fn;
  }, []);

  const addTransaction = useCallback((tx: Omit<Transaction, 'id' | 'timestamp' | 'status'> & { status?: Transaction['status'] }) => {
    const fullTx: Transaction = {
      ...tx,
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      status: tx.status ?? 'pending',
    };

    setTransactions((prev) => [fullTx, ...prev].slice(0, MAX_TRANSACTIONS));

    if (watchRef.current && fullTx.contractId) {
      const unwatch = watchRef.current(fullTx.contractId, (data) => {
        const poc = data.proposal_open_contract as Record<string, unknown> | undefined;
        if (!poc) return;

        const isSold = poc.is_sold as number | undefined;
        const status = (poc.status as string | undefined) ?? '';
        const profit = poc.profit as number | undefined;
        const payout = poc.payout as number | undefined;
        const entrySpot = poc.entry_spot as number | undefined;
        const exitSpot = poc.exit_spot as number | undefined;

        if (isSold === 1 || status === 'sold' || status === 'won' || status === 'lost') {
          const finalStatus: Transaction['status'] = (profit ?? 0) > 0 ? 'won' : 'lost';
          setTransactions((prev) =>
            prev.map((t) =>
              t.contractId === fullTx.contractId
                ? {
                    ...t,
                    status: finalStatus,
                    payout,
                    profit,
                    entrySpot,
                    exitSpot,
                    settledAt: Date.now(),
                  }
                : t
            )
          );
          const cleanup = unwatchRef.current.get(fullTx.contractId);
          if (cleanup) {
            cleanup();
            unwatchRef.current.delete(fullTx.contractId);
          }
        }
      });
      unwatchRef.current.set(fullTx.contractId, unwatch);
    }

    return fullTx.id;
  }, []);

  const clearTransactions = useCallback(() => {
    unwatchRef.current.forEach((fn) => fn());
    unwatchRef.current.clear();
    setTransactions([]);
    saveStored([]);
  }, []);

  return { transactions, addTransaction, clearTransactions, setWatchFn };
}
