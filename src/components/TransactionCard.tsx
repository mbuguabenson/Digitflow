import { useState, useMemo } from 'react';
import {
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Receipt,
  Trash2,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/hooks/useTransactions';

type FilterType = 'all' | 'won' | 'lost' | 'pending';

const CONTRACT_LABELS: Record<string, string> = {
  DIGITOVER: 'Over',
  DIGITUNDER: 'Under',
  DIGITMATCH: 'Matches',
  DIGITDIFF: 'Differs',
  DIGITEVEN: 'Even',
  DIGITODD: 'Odd',
  CALL: 'Rise',
  PUT: 'Fall',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatProfit(profit: number | undefined, currency: string): string {
  if (profit === undefined) return '--';
  const sign = profit >= 0 ? '+' : '';
  return `${sign}${profit.toFixed(2)} ${currency}`;
}

export function TransactionCard({
  transactions,
  isDark,
  onClear,
}: {
  transactions: Transaction[];
  isDark: boolean;
  onClear: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = useMemo(() => {
    const txs = transactions || [];
    if (filter === 'all') return txs;
    return txs.filter((t) => t?.status === filter);
  }, [transactions, filter]);

  const stats = useMemo(() => {
    const txs = transactions || [];
    const settled = txs.filter((t) => t?.status === 'won' || t?.status === 'lost');
    const wins = settled.filter((t) => t?.status === 'won');
    const losses = settled.filter((t) => t?.status === 'lost');
    const pending = txs.filter((t) => t?.status === 'pending');
    const totalProfit = settled.reduce((sum, t) => sum + (t?.profit ?? 0), 0);
    const winRate = settled.length ? (wins.length / settled.length) * 100 : 0;
    return { total: txs.length, wins: wins.length, losses: losses.length, pending: pending.length, totalProfit, winRate };
  }, [transactions]);

  const headingColor = isDark ? 'text-white' : 'text-[#1a2a4a]';
  const subTextColor = isDark ? 'text-[#9ca3af]' : 'text-[#7a8aaa]';
  const mutedTextColor = isDark ? 'text-[#6b7280]' : 'text-[#9aaaba]';
  const panelBorder = isDark ? 'border-white/10' : 'border-blue-200/40';
  const panelBg = isDark ? '#0a0e27' : '#ffffff';
  const innerCardBg = isDark ? '#111736' : '#f8faff';
  const innerCardBorder = isDark ? 'border-[#1e2a5e]' : 'border-blue-200/50';

  const filterButtons: { id: FilterType; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: stats.total },
    { id: 'pending', label: 'Pending', count: stats.pending },
    { id: 'won', label: 'Won', count: stats.wins },
    { id: 'lost', label: 'Lost', count: stats.losses },
  ];

  return (
    <div className={cn('rounded-2xl overflow-hidden border transition-all', panelBorder)} style={{ background: panelBg }}>
      {/* Header / collapse bar */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn('w-full flex items-center justify-between px-5 py-4 transition-colors', isDark ? 'hover:bg-white/5' : 'hover:bg-blue-50/50')}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-md shadow-blue-500/20">
            <Receipt className="h-5 w-5 text-white" />
          </div>
          <div className="text-left">
            <h3 className={cn('text-sm font-bold', headingColor)}>Transactions</h3>
            <p className={cn('text-[11px]', mutedTextColor)}>
              {stats.total} {stats.total === 1 ? 'trade' : 'trades'} · {stats.wins}W / {stats.losses}L · {stats.winRate.toFixed(0)}% win rate
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* P/L badge */}
          <div className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold',
            stats.totalProfit > 0
              ? (isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
              : stats.totalProfit < 0
                ? (isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600')
                : (isDark ? 'bg-white/5 text-slate-400' : 'bg-blue-50 text-[#7a8aaa]')
          )}>
            {stats.totalProfit > 0 ? <TrendingUp className="h-3 w-3" /> : stats.totalProfit < 0 ? <TrendingDown className="h-3 w-3" /> : null}
            {formatProfit(stats.totalProfit, 'USD')}
          </div>
          <ChevronDown className={cn('h-4 w-4 transition-transform', collapsed ? '' : 'rotate-180', mutedTextColor)} />
        </div>
      </button>

      {/* Collapsible content */}
      {!collapsed && (
        <div className={cn('border-t', panelBorder)}>
          {/* Filter bar */}
          <div className="flex items-center justify-between px-5 py-3 gap-2">
            <div className="flex items-center gap-1.5">
              <Filter className={cn('h-3.5 w-3.5', mutedTextColor)} />
              {filterButtons.map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setFilter(btn.id)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-bold transition-all',
                    filter === btn.id
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-sm'
                      : isDark
                        ? 'bg-white/5 text-slate-400 hover:bg-white/10'
                        : 'bg-blue-50 text-[#7a8aaa] hover:bg-blue-100'
                  )}
                >
                  {btn.label} {btn.count > 0 && <span className="opacity-70">{btn.count}</span>}
                </button>
              ))}
            </div>
            {transactions.length > 0 && (
              <button
                onClick={onClear}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-50'
                )}
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>

          {/* Transaction list */}
          <div className="max-h-[420px] overflow-y-auto px-3 pb-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className={cn('flex h-12 w-12 items-center justify-center rounded-full', isDark ? 'bg-white/5' : 'bg-blue-50')}>
                  <Receipt className={cn('h-5 w-5', mutedTextColor)} />
                </div>
                <p className={cn('mt-3 text-sm font-medium', mutedTextColor)}>
                  {transactions.length === 0 ? 'No transactions yet' : 'No transactions match this filter'}
                </p>
                <p className={cn('text-[11px] mt-0.5', mutedTextColor)}>
                  {transactions.length === 0 ? 'Trades will appear here once placed' : 'Try a different filter'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((tx) => {
                  const isPending = tx.status === 'pending';
                  const isWon = tx.status === 'won';
                  const isLost = tx.status === 'lost';
                  const isError = tx.status === 'error';

                  const statusIcon = isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                    : isWon ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    : isLost ? <XCircle className="h-3.5 w-3.5 text-red-500" />
                    : isError ? <XCircle className="h-3.5 w-3.5 text-red-500" />
                    : null;

                  const statusLabel = isPending ? 'Pending' : isWon ? 'Won' : isLost ? 'Lost' : isError ? 'Error' : '';

                  const accentColor = isPending ? '#3b82f6' : isWon ? '#22c55e' : isLost ? '#ef4444' : '#ef4444';

                  return (
                    <div
                      key={tx.id}
                      className={cn('rounded-xl border p-3 transition-all', innerCardBorder)}
                      style={{ background: innerCardBg }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Left: contract info */}
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                            style={{ background: accentColor }}
                          >
                            {statusIcon}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn('text-sm font-bold', headingColor)}>
                                {CONTRACT_LABELS[tx.contractType] ?? tx.contractType}
                              </span>
                              {tx.barrier && (
                                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', isDark ? 'bg-white/10 text-slate-300' : 'bg-blue-100 text-blue-600')}>
                                  {tx.barrier}
                                </span>
                              )}
                              <span className={cn('text-[11px] font-mono', mutedTextColor)}>{tx.symbol}</span>
                            </div>
                            <div className={cn('flex items-center gap-2 mt-0.5 text-[11px]', mutedTextColor)}>
                              <Clock className="h-3 w-3" />
                              {formatTime(tx.timestamp)}
                              <span>·</span>
                              <span>{tx.duration}{tx.durationUnit === 't' ? ' ticks' : tx.durationUnit === 'm' ? ' min' : ' sec'}</span>
                              <span>·</span>
                              <span>{tx.amount.toFixed(2)} stake</span>
                            </div>
                          </div>
                        </div>

                        {/* Right: P/L */}
                        <div className="text-right shrink-0">
                          <div className={cn(
                            'text-sm font-black',
                            isPending ? (isDark ? 'text-slate-400' : 'text-[#7a8aaa]')
                            : (tx.profit ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'
                          )}>
                            {isPending ? '--' : formatProfit(tx.profit, 'USD')}
                          </div>
                          <div className={cn(
                            'text-[10px] font-bold uppercase tracking-wide',
                            isPending ? 'text-blue-400' : isWon ? 'text-emerald-500' : isLost ? 'text-red-500' : 'text-red-500'
                          )}>
                            {statusLabel}
                          </div>
                        </div>
                      </div>

                      {/* Settled details */}
                      {(isWon || isLost) && (tx.entrySpot !== undefined || tx.exitSpot !== undefined) && (
                        <div className={cn('mt-2 flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-[10px]', isDark ? 'bg-white/5' : 'bg-blue-50/60')}>
                          {tx.entrySpot !== undefined && (
                            <span className={mutedTextColor}>
                              Entry: <span className={cn('font-mono font-bold', headingColor)}>{tx.entrySpot}</span>
                            </span>
                          )}
                          {tx.exitSpot !== undefined && (
                            <span className={mutedTextColor}>
                              Exit: <span className={cn('font-mono font-bold', headingColor)}>{tx.exitSpot}</span>
                            </span>
                          )}
                          {tx.payout !== undefined && (
                            <span className={mutedTextColor}>
                              Payout: <span className={cn('font-mono font-bold', headingColor)}>{tx.payout.toFixed(2)}</span>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Error message */}
                      {isError && tx.error && (
                        <div className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-500">
                          {tx.error}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
