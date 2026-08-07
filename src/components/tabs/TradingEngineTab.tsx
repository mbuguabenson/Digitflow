import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Activity, Zap, TrendingUp, TrendingDown, Play, Pause, Square,
  RefreshCw, AlertTriangle, CheckCircle2, XCircle, Target,
  Radio, Gauge, Shield, Flame, Clock, DollarSign, Percent,
  ChevronRight, Settings2, Layers, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  type StrategyId, type MarketAnalysis, type TradingSignal, type Transaction,
  STRATEGIES, VOLATILITY_SYMBOLS, analyzeMarket, generateSignal,
  calcAutoStake, getMartingaleMultiplier, strategyToContract, calcTradeStats,
} from '@/lib/trading-engine';
import { computeDigitStats } from '@/lib/analysis';
import { useDerivTicks } from '@/hooks/useDerivTicks';
import type { Account, TradeResult } from '@/hooks/useDerivAuth';
import { cn } from '@/lib/utils';

const DIGIT_COLORS: Record<number, string> = {
  0: '#f59e0b', 1: '#ef4444', 2: '#3b82f6', 3: '#6366f1', 4: '#06b6d4',
  5: '#f97316', 6: '#3b82f6', 7: '#14b8a6', 8: '#22c55e', 9: '#22c55e',
};

type Props = {
  account: Account | null;
  placeTrade: (p: {
    symbol: string; contractType: string; barrier?: string;
    amount: number; duration: number; durationUnit: string; basis?: string;
  }) => Promise<TradeResult>;
  watchContract?: (contractId: string, onUpdate: (data: Record<string, unknown>) => void) => () => void;
  refreshBalance?: () => Promise<void>;
  isDark: boolean;
  onLoginRequest: () => void;
};

type SubTab = 'analyzer' | 'hourly';

// ─── Digit Ring (reused pattern) ─────────────────────────────────────────────
function DigitRing({ digit, percent, count, isNow, isDark }: {
  digit: number; percent: number; count: number; isNow: boolean; isDark: boolean;
}) {
  const r = 28, cx = 36, cy = 36, circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;
  const color = DIGIT_COLORS[digit];
  const track = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className={cn('h-4 flex items-center', !isNow && 'invisible')}>
        <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[8px] font-black text-white">NOW</span>
      </div>
      <div className="relative">
        <svg width="72" height="72" className="-rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={track} strokeWidth="5" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={isNow ? '#f97316' : color}
            strokeWidth={isNow ? 6 : 5} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-black" style={{ color: isNow ? '#f97316' : isDark ? '#fff' : '#1a2a4a' }}>{digit}</span>
          <span className="text-[9px] font-bold" style={{ color: isDark ? '#a0aec0' : '#7a8aaa' }}>{percent.toFixed(1)}%</span>
        </div>
      </div>
      <span className="text-[9px]" style={{ color: isDark ? '#4a5568' : '#9aaaba' }}>n={count}</span>
    </div>
  );
}

// ─── Last Digit Line Chart ──────────────────────────────────────────────────
function LastDigitLineChart({ digits, isDark }: { digits: number[]; isDark: boolean }) {
  const W = 500, H = 160, PAD = { t: 20, r: 20, b: 16, l: 28 };
  const show = digits.slice(-15);
  if (show.length < 2) return <div className="flex h-full items-center justify-center text-sm text-slate-400">Waiting for data...</div>;
  const n = show.length;
  const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
  const xOf = (i: number) => PAD.l + (i / (n - 1)) * innerW;
  const yOf = (v: number) => PAD.t + innerH - (v / 9) * innerH;
  const pts = show.map((d, i) => ({ x: xOf(i), y: yOf(d), v: d }));
  let path = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i - 1].x + pts[i].x) / 2;
    path += ` C ${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
  }
  const area = path + ` L ${pts[n - 1].x},${PAD.t + innerH} L ${pts[0].x},${PAD.t + innerH} Z`;
  const grid = isDark ? '#1e2a5e' : '#e5e7eb';
  const line = isDark ? '#a78bfa' : '#7c3aed';
  const bg = isDark ? '#111736' : '#f3f4f6';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: bg, borderRadius: 12 }}>
      <defs><linearGradient id="teAreaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={line} stopOpacity="0.18" />
        <stop offset="100%" stopColor={line} stopOpacity="0" />
      </linearGradient></defs>
      {[0,1,2,3,4,5,6,7,8,9].map(v => (
        <line key={v} x1={PAD.l} y1={yOf(v)} x2={W - PAD.r} y2={yOf(v)} stroke={grid} strokeWidth="1" />
      ))}
      <path d={area} fill="url(#teAreaGrad)" />
      <path d={path} fill="none" stroke={line} strokeWidth="2.5" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <rect x={p.x - 5} y={p.y - 5} width="10" height="10" fill={line} rx="2" />
          <text x={p.x} y={p.y - 9} textAnchor="middle" fill={isDark ? '#c4b5fd' : '#5b21b6'} fontSize="10" fontWeight="700">{p.v}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Last 7 Digits Cards ─────────────────────────────────────────────────────
function Last7Cards({ digits, isDark }: { digits: number[]; isDark: boolean }) {
  const last7 = digits.slice(-7);
  return (
    <div className="flex flex-wrap gap-2">
      {last7.length === 0 ? (
        <span className="text-sm text-slate-400">Waiting...</span>
      ) : last7.map((d, i) => (
        <div key={i} className={cn(
          'flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black text-white shadow-md transition-transform',
          i === last7.length - 1 && 'scale-110 ring-2 ring-white/60',
        )} style={{ background: DIGIT_COLORS[d] }}>
          {d}
        </div>
      ))}
    </div>
  );
}

// ─── Over/Under Progress Bar ─────────────────────────────────────────────────
function OUBars({ analysis, isDark }: { analysis: MarketAnalysis; isDark: boolean }) {
  const { overPower, underPower, topOverDigit, topUnderDigit } = analysis;
  const overGlow = overPower >= 55;
  const underGlow = underPower >= 55;
  return (
    <div className="space-y-3">
      {/* Over */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={cn('text-xs font-bold flex items-center gap-1', isDark ? 'text-slate-300' : 'text-gray-700')}>
            <ArrowUp className="h-3 w-3 text-green-500" /> Over (5-9)
          </span>
          <span className={cn('text-sm font-black', overGlow ? 'text-green-400' : isDark ? 'text-slate-400' : 'text-gray-500')}>
            {overPower.toFixed(1)}%
          </span>
        </div>
        <div className={cn('h-4 rounded-full overflow-hidden', isDark ? 'bg-white/10' : 'bg-gray-200')}>
          <div className={cn('h-full rounded-full transition-all duration-700', overGlow && 'shadow-[0_0_12px_rgba(34,197,94,0.6)]')}
            style={{ width: `${overPower}%`, background: 'linear-gradient(90deg, #22c55e, #16a34a)' }} />
        </div>
        <div className={cn('mt-1 text-[10px]', isDark ? 'text-slate-500' : 'text-gray-400')}>
          Top digit: <span className="font-bold" style={{ color: DIGIT_COLORS[topOverDigit] }}>{topOverDigit}</span>
        </div>
      </div>
      {/* Under */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={cn('text-xs font-bold flex items-center gap-1', isDark ? 'text-slate-300' : 'text-gray-700')}>
            <ArrowDown className="h-3 w-3 text-red-500" /> Under (0-4)
          </span>
          <span className={cn('text-sm font-black', underGlow ? 'text-red-400' : isDark ? 'text-slate-400' : 'text-gray-500')}>
            {underPower.toFixed(1)}%
          </span>
        </div>
        <div className={cn('h-4 rounded-full overflow-hidden', isDark ? 'bg-white/10' : 'bg-gray-200')}>
          <div className={cn('h-full rounded-full transition-all duration-700', underGlow && 'shadow-[0_0_12px_rgba(239,68,68,0.6)]')}
            style={{ width: `${underPower}%`, background: 'linear-gradient(90deg, #ef4444, #dc2626)' }} />
        </div>
        <div className={cn('mt-1 text-[10px]', isDark ? 'text-slate-500' : 'text-gray-400')}>
          Top digit: <span className="font-bold" style={{ color: DIGIT_COLORS[topUnderDigit] }}>{topUnderDigit}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────
function SignalCard({ signal, isDark }: { signal: TradingSignal; isDark: boolean }) {
  const actionColor = signal.action === 'BUY' ? 'green' : signal.action === 'WAIT' ? 'amber' : 'red';
  const bg = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';
  return (
    <div className={cn('rounded-2xl border p-4', bg)}>
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl',
          actionColor === 'green' ? 'bg-green-500' : actionColor === 'amber' ? 'bg-amber-500' : 'bg-red-500')}>
          {signal.action === 'BUY' ? <Zap className="h-5 w-5 text-white" /> :
           signal.action === 'WAIT' ? <Clock className="h-5 w-5 text-white" /> :
           <XCircle className="h-5 w-5 text-white" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-lg font-black', isDark ? 'text-white' : 'text-gray-800')}>{signal.action}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
              actionColor === 'green' ? 'bg-green-500/20 text-green-400' :
              actionColor === 'amber' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400')}>
              {signal.confidence}
            </span>
            <span className={cn('text-sm font-bold', isDark ? 'text-slate-300' : 'text-gray-600')}>
              {signal.side}{signal.targetDigit !== undefined ? ` ${signal.targetDigit}` : ''}
            </span>
          </div>
          <p className={cn('text-xs mt-0.5', isDark ? 'text-slate-400' : 'text-gray-500')}>{signal.reason}</p>
        </div>
        <div className="text-right">
          <span className={cn('text-2xl font-black', actionColor === 'green' ? 'text-green-500' : actionColor === 'amber' ? 'text-amber-500' : 'text-red-500')}>
            {signal.confidencePercent.toFixed(0)}%
          </span>
        </div>
      </div>
      {signal.entryDigit !== undefined && signal.action === 'BUY' && (
        <div className={cn('rounded-xl p-3 text-xs', isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700')}>
          <span className="font-bold">Entry Point:</span> Wait for digit <span className="font-black" style={{ color: DIGIT_COLORS[signal.entryDigit] }}>{signal.entryDigit}</span>
          {signal.skipTicks > 0 && <span className="ml-2">Skip {signal.skipTicks} tick(s) first</span>}
        </div>
      )}
      {signal.warning && (
        <div className={cn('mt-2 flex items-center gap-1.5 rounded-xl p-2 text-xs', isDark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-700')}>
          <AlertTriangle className="h-3.5 w-3.5" /> {signal.warning}
        </div>
      )}
    </div>
  );
}

// ─── Trading Console ─────────────────────────────────────────────────────────
function TradingConsole({
  account, placeTrade, watchContract, refreshBalance, isDark, onLoginRequest, symbol, strategy, signal, isAutoMode,
}: {
  account: Account | null;
  placeTrade: Props['placeTrade'];
  watchContract?: Props['watchContract'];
  refreshBalance?: Props['refreshBalance'];
  isDark: boolean;
  onLoginRequest: () => void;
  symbol: string;
  strategy: StrategyId;
  signal: TradingSignal;
  isAutoMode: boolean;
}) {
  const [tradeSymbol, setTradeSymbol] = useState(symbol);
  const [contractType, setContractType] = useState('DIGITOVER');
  const [barrier, setBarrier] = useState('5');
  const [ticks, setTicks] = useState(1);
  const [entryDigit, setEntryDigit] = useState<number | ''>('');
  const [stake, setStake] = useState(1);
  const [martingale, setMartingale] = useState(false);
  const [martingaleMult, setMartingaleMult] = useState(2);
  const [takeProfit, setTakeProfit] = useState(10);
  const [stopLoss, setStopLoss] = useState(5);
  const [autoTrade, setAutoTrade] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [consecutiveLosses, setConsecutiveLosses] = useState(0);
  const [currentStake, setCurrentStake] = useState(stake);
  const autoRef = useRef(false);
  const lossRef = useRef(0);
  const stakeRef = useRef(stake);
  const placingRef = useRef(false);

  useEffect(() => { setTradeSymbol(symbol); }, [symbol]);
  useEffect(() => {
    if (signal.action === 'BUY' && signal.targetDigit !== undefined) {
      setEntryDigit(signal.entryDigit ?? signal.targetDigit);
    }
  }, [signal]);

  const stats = useMemo(() => calcTradeStats(transactions), [transactions]);

  const updateTransaction = useCallback((contractId: string, updates: Partial<Transaction>) => {
    setTransactions(prev => prev.map(t => t.contractId === contractId ? { ...t, ...updates } : t));
  }, []);

  const addTransaction = useCallback((t: Omit<Transaction, 'id' | 'time'>) => {
    setTransactions(prev => [{ ...t, id: Math.random().toString(36).slice(2), time: new Date().toLocaleTimeString() }, ...prev].slice(0, 100));
  }, []);

  const handleTradeResult = useCallback((isWin: boolean, profit: number, tradeStake: number) => {
    if (isWin) {
      lossRef.current = 0;
      setConsecutiveLosses(0);
      stakeRef.current = stake;
      setCurrentStake(stake);
    } else {
      lossRef.current += 1;
      setConsecutiveLosses(lossRef.current);
      if (martingale) {
        stakeRef.current = parseFloat((tradeStake * martingaleMult).toFixed(2));
        setCurrentStake(stakeRef.current);
      }
    }
    refreshBalance?.();
    placingRef.current = false;
    setTradeLoading(false);
  }, [stake, martingale, martingaleMult, refreshBalance]);

  const executeTrade = useCallback(async (): Promise<boolean> => {
    try {
      if (!account) { onLoginRequest(); return false; }
      if (placingRef.current) return false; // Prevent duplicate trades
    placingRef.current = true;
    setTradeLoading(true);
    const tradeStake = stakeRef.current;
    const result = await placeTrade({
      symbol: tradeSymbol,
      contractType,
      barrier: barrier || undefined,
      amount: tradeStake,
      duration: ticks,
      durationUnit: 't',
      basis: 'stake',
    });

    if (result.success && result.contractId) {
      addTransaction({
        symbol: tradeSymbol, strategy: STRATEGIES.find(s => s.id === strategy)?.label ?? strategy,
        side: contractType, stake: tradeStake, result: 'pending', payout: 0, profit: 0,
        contractId: result.contractId,
      });

      // Watch contract for real settlement
      if (watchContract) {
        const unwatch = watchContract(result.contractId, (data) => {
          const poc = (data as any).proposal_open_contract;
          if (poc && (poc.is_sold === 1 || poc.status === 'won' || poc.status === 'lost')) {
            unwatch();
            const profit = Number(poc.profit || 0);
            const payout = Number(poc.payout || 0);
            const isWin = poc.status === 'won' || profit > 0;
            updateTransaction(result.contractId!, {
              result: isWin ? 'win' : 'loss',
              profit,
              payout,
            });
            handleTradeResult(isWin, profit, tradeStake);
          }
        });
      } else {
        // No watchContract available, mark as placed and release lock
        placingRef.current = false;
        setTradeLoading(false);
      }
      return true;
    } else {
      addTransaction({
        symbol: tradeSymbol, strategy: STRATEGIES.find(s => s.id === strategy)?.label ?? strategy,
        side: contractType, stake: tradeStake, result: 'loss', payout: 0, profit: -tradeStake,
      });
      lossRef.current += 1;
      setConsecutiveLosses(lossRef.current);
      if (martingale) {
        stakeRef.current = parseFloat((tradeStake * martingaleMult).toFixed(2));
        setCurrentStake(stakeRef.current);
      }
      placingRef.current = false;
      setTradeLoading(false);
      return false;
    }
    } catch (error) {
      console.error("Trade execution error:", error);
      placingRef.current = false;
      setTradeLoading(false);
      return false;
    }
  }, [account, placeTrade, watchContract, tradeSymbol, contractType, barrier, ticks, martingale, martingaleMult, strategy, addTransaction, updateTransaction, handleTradeResult, onLoginRequest]);

  const handleManualTrade = useCallback(() => {
    executeTrade();
  }, [executeTrade]);

  // Auto trade loop: event-driven, waits for contract settlement
  useEffect(() => {
    if (!autoTrade || !account) return;
    autoRef.current = true;

    const tryNextTrade = () => {
      if (!autoRef.current) return;
      // Check TP/SL using refs for current values
      if (lossRef.current >= stopLoss) {
        setAutoTrade(false);
        autoRef.current = false;
        return;
      }
      // Delay 2s after last trade settles before placing next
      setTimeout(() => {
        if (!autoRef.current) return;
        executeTrade();
      }, 2000);
    };

    // Start the first trade
    executeTrade();

    // Watch for trade settlement to trigger next trade
    const interval = setInterval(() => {
      if (!autoRef.current) return;
      if (!placingRef.current) {
        // Previous trade settled, place next
        tryNextTrade();
      }
    }, 1000);

    return () => {
      autoRef.current = false;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrade, account]);

  // Stop auto-trade if TP reached (check stats reactively)
  useEffect(() => {
    if (autoTrade && stats.totalProfit >= takeProfit) {
      setAutoTrade(false);
      autoRef.current = false;
    }
  }, [autoTrade, stats.totalProfit, takeProfit]);

  const resetStake = useCallback(() => {
    stakeRef.current = stake;
    setCurrentStake(stake);
    lossRef.current = 0;
    setConsecutiveLosses(0);
    setTransactions([]);
  }, [stake]);

  const cardBg = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';
  const inputCls = cn(
    'w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none',
    isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-800',
  );

  return (
    <div className={cn('rounded-2xl border p-5', cardBg)}>
      <h3 className={cn('text-sm font-bold mb-4 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-800')}>
        <Flame className="h-4 w-4 text-orange-500" /> Trading Console
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Market</label>
          <select className={inputCls} value={tradeSymbol} onChange={e => setTradeSymbol(e.target.value)}>
            {VOLATILITY_SYMBOLS.map(s => <option key={s.symbol} value={s.symbol}>{s.display}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Trade Type</label>
          <select className={inputCls} value={contractType} onChange={e => setContractType(e.target.value)}>
            <option value="DIGITOVER">Digit Over</option>
            <option value="DIGITUNDER">Digit Under</option>
            <option value="DIGITEVEN">Digit Even</option>
            <option value="DIGITODD">Digit Odd</option>
            <option value="DIGITMATCH">Digit Match</option>
            <option value="DIGITDIFF">Digit Differs</option>
            <option value="CALL">Rise</option>
            <option value="PUT">Fall</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Barrier / Digit</label>
          <input type="text" className={inputCls} value={barrier} onChange={e => setBarrier(e.target.value)} placeholder="e.g. 5" />
        </div>
        <div className="flex flex-col gap-1">
          <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Ticks</label>
          <input type="number" min={1} max={10} className={inputCls} value={ticks} onChange={e => setTicks(parseInt(e.target.value) || 1)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Entry Point (Digit)</label>
          <input type="number" min={0} max={9} className={inputCls} value={entryDigit} onChange={e => setEntryDigit(e.target.value === '' ? '' : parseInt(e.target.value))} placeholder="Auto" />
        </div>
        <div className="flex flex-col gap-1">
          <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Stake</label>
          <input type="number" min={0.35} step={0.1} className={inputCls} value={currentStake} onChange={e => { const v = parseFloat(e.target.value) || 0; setStake(v); stakeRef.current = v; setCurrentStake(v); }} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Take Profit</label>
          <input type="number" min={1} step={1} className={inputCls} value={takeProfit} onChange={e => setTakeProfit(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Stop Loss (losses)</label>
          <input type="number" min={1} max={10} className={inputCls} value={stopLoss} onChange={e => setStopLoss(parseInt(e.target.value) || 5)} />
        </div>
      </div>

      {/* Martingale toggle */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <button onClick={() => setMartingale(!martingale)}
            className={cn('relative h-5 w-10 rounded-full transition-colors', martingale ? 'bg-blue-500' : isDark ? 'bg-white/10' : 'bg-gray-300')}>
            <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', martingale ? 'translate-x-5' : 'translate-x-0.5')} />
          </button>
          <span className={cn('text-xs font-semibold', isDark ? 'text-slate-300' : 'text-gray-700')}>Martingale</span>
        </label>
        {martingale && (
          <div className="flex items-center gap-2">
            <label className={cn('text-xs font-semibold', isDark ? 'text-slate-400' : 'text-gray-500')}>Multiplier:</label>
            <input type="number" min={1} step={0.1} className={cn(inputCls, 'w-20')} value={martingaleMult} onChange={e => setMartingaleMult(parseFloat(e.target.value) || 2)} />
          </div>
        )}
        <button onClick={resetStake} className={cn('ml-auto rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors',
          isDark ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100')}>
          <RefreshCw className="h-3 w-3 inline mr-1" /> Reset Stake
        </button>
      </div>

      {/* Trade buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={handleManualTrade} disabled={tradeLoading}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 px-4 py-2 text-sm font-bold text-white hover:shadow-lg transition-all disabled:opacity-50">
          {tradeLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Purchase Contract
        </button>
        {!autoTrade ? (
          <button onClick={() => { if (!account) { onLoginRequest(); return; } setAutoTrade(true); }}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-2 text-sm font-bold text-white hover:shadow-lg transition-all">
            <Zap className="h-4 w-4" /> Start Auto Trading
          </button>
        ) : (
          <button onClick={() => setAutoTrade(false)}
            className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 transition-all">
            <Square className="h-4 w-4" /> Stop Auto
          </button>
        )}
        {consecutiveLosses > 0 && (
          <div className={cn('flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold',
            isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600')}>
            <AlertTriangle className="h-3.5 w-3.5" /> {consecutiveLosses} consecutive losses
          </div>
        )}
      </div>

      {/* Stats */}
      <div className={cn('grid grid-cols-2 md:grid-cols-6 gap-2 rounded-xl p-3 mb-4', isDark ? 'bg-white/5' : 'bg-gray-50')}>
        <div className="text-center">
          <p className={cn('text-[10px] uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Total Runs</p>
          <p className={cn('text-lg font-black', isDark ? 'text-white' : 'text-gray-800')}>{stats.totalRuns}</p>
        </div>
        <div className="text-center">
          <p className={cn('text-[10px] uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Wins</p>
          <p className="text-lg font-black text-green-500">{stats.wins}</p>
        </div>
        <div className="text-center">
          <p className={cn('text-[10px] uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Losses</p>
          <p className="text-lg font-black text-red-500">{stats.losses}</p>
        </div>
        <div className="text-center">
          <p className={cn('text-[10px] uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Total Stake</p>
          <p className={cn('text-lg font-black', isDark ? 'text-white' : 'text-gray-800')}>{stats.totalStake.toFixed(2)}</p>
        </div>
        <div className="text-center col-span-2">
          <p className={cn('text-[10px] uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Total Profit</p>
          <p className={cn('text-2xl font-black', stats.totalProfit >= 0 ? 'text-green-500' : 'text-red-500')}>
            {stats.totalProfit >= 0 ? '+' : '-'}{Math.abs(stats.totalProfit).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Transaction History */}
      {transactions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={cn('border-b', isDark ? 'border-white/10' : 'border-gray-200')}>
                <th className="px-2 py-1.5 text-left font-semibold">Time</th>
                <th className="px-2 py-1.5 text-left font-semibold">Market</th>
                <th className="px-2 py-1.5 text-left font-semibold">Type</th>
                <th className="px-2 py-1.5 text-right font-semibold">Stake</th>
                <th className="px-2 py-1.5 text-center font-semibold">Result</th>
                <th className="px-2 py-1.5 text-right font-semibold">P/L</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 20).map(t => (
                <tr key={t.id} className={cn('border-b', isDark ? 'border-white/5' : 'border-gray-100')}>
                  <td className={cn('px-2 py-1.5', isDark ? 'text-slate-400' : 'text-gray-500')}>{t.time}</td>
                  <td className={cn('px-2 py-1.5 font-semibold', isDark ? 'text-slate-300' : 'text-gray-700')}>{t.symbol}</td>
                  <td className={cn('px-2 py-1.5', isDark ? 'text-slate-300' : 'text-gray-700')}>{t.side}</td>
                  <td className={cn('px-2 py-1.5 text-right tabular-nums', isDark ? 'text-slate-300' : 'text-gray-700')}>{(t.stake || 0).toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold uppercase',
                      t.result === 'win' ? 'bg-green-500/20 text-green-400' :
                      t.result === 'loss' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400')}>
                      {t.result}
                    </span>
                  </td>
                  <td className={cn('px-2 py-1.5 text-right tabular-nums font-bold',
                    t.profit > 0 ? 'text-green-500' : t.profit < 0 ? 'text-red-500' : isDark ? 'text-slate-400' : 'text-gray-400')}>
                    {(t.profit || 0) > 0 ? '+' : ''}{(t.profit || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Recovery Panel ──────────────────────────────────────────────────────────
function RecoveryPanel({ isDark, losses, onActivate }: {
  isDark: boolean; losses: number; onActivate: () => void;
}) {
  const [threshold, setThreshold] = useState(3);
  const cardBg = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';
  return (
    <div className={cn('rounded-2xl border p-4', cardBg)}>
      <h3 className={cn('text-sm font-bold mb-3 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-800')}>
        <Shield className="h-4 w-4 text-blue-500" /> Alternate / Recovery Entry
      </h3>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className={cn('text-xs font-semibold', isDark ? 'text-slate-400' : 'text-gray-500')}>Trigger after X losses:</label>
          <input type="number" min={1} max={10} value={threshold} onChange={e => setThreshold(parseInt(e.target.value) || 3)}
            className={cn('w-16 rounded-lg border px-2 py-1 text-sm font-bold', isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-800')} />
        </div>
        <button onClick={onActivate}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-bold text-white hover:shadow-lg transition-all">
          <Shield className="h-4 w-4" /> Activate Recovery
        </button>
        {losses >= threshold && (
          <span className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold',
            isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600')}>
            <AlertTriangle className="h-3.5 w-3.5" /> Recovery threshold reached!
          </span>
        )}
      </div>
      <p className={cn('mt-2 text-xs', isDark ? 'text-slate-500' : 'text-gray-400')}>
        Switches to a high-probability safe entry (Over 0 or Even) to recoup losses.
      </p>
    </div>
  );
}

// ─── Hourly Sub-Tab (Over 1,2,3 / Under 6,7,8) ───────────────────────────────
function HourlySubTab({ account, placeTrade, watchContract, refreshBalance, isDark, onLoginRequest }: {
  account: Account | null; placeTrade: Props['placeTrade']; watchContract?: Props['watchContract']; refreshBalance?: Props['refreshBalance']; isDark: boolean; onLoginRequest: () => void;
}) {
  const [hours, setHours] = useState(8);
  const [targetPerHour, setTargetPerHour] = useState(5);
  const [riskPct, setRiskPct] = useState(2);
  const [useMartingale, setUseMartingale] = useState(false);
  const [tradeType, setTradeType] = useState<'over' | 'under'>('over');
  const [barrier, setBarrier] = useState('3');
  const [autoRun, setAutoRun] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [consecutiveLosses, setConsecutiveLosses] = useState(0);
  const [currentStake, setCurrentStake] = useState(1);
  const [tradeLoading, setTradeLoading] = useState(false);
  const stakeRef = useRef(1);
  const lossRef = useRef(0);
  const placingRef = useRef(false);
  const autoRunRef = useRef(false);

  const balance = account?.balance ?? 100;
  const autoStake = useMemo(() => {
    const riskAmount = balance * (riskPct / 100);
    return Math.max(0.35, riskAmount);
  }, [balance, riskPct]);

  const martingaleMult = useMemo(() => getMartingaleMultiplier(barrier, tradeType), [barrier, tradeType]);

  const stats = useMemo(() => calcTradeStats(transactions), [transactions]);

  const addTx = useCallback((t: Omit<Transaction, 'id' | 'time'>) => {
    setTransactions(prev => [{ ...t, id: Math.random().toString(36).slice(2), time: new Date().toLocaleTimeString() }, ...prev].slice(0, 100));
  }, []);

  const updateTx = useCallback((contractId: string, updates: Partial<Transaction>) => {
    setTransactions(prev => prev.map(t => t.contractId === contractId ? { ...t, ...updates } : t));
  }, []);

  const executeHourlyTrade = useCallback(async () => {
    try {
      if (!account) { onLoginRequest(); return; }
      if (placingRef.current) return; // Prevent duplicate trades
      placingRef.current = true;
      setTradeLoading(true);
      const contractType = tradeType === 'over' ? 'DIGITOVER' : 'DIGITUNDER';
      const tradeStake = stakeRef.current;
      const result = await placeTrade({
      symbol: 'R_100', contractType, barrier,
      amount: tradeStake, duration: 1, durationUnit: 't', basis: 'stake',
    });

    if (result.success && result.contractId) {
      addTx({ symbol: 'R_100', strategy: 'Hourly', side: `${tradeType} ${barrier}`, stake: tradeStake, result: 'pending', payout: 0, profit: 0, contractId: result.contractId });

      if (watchContract) {
        const unwatch = watchContract(result.contractId, (data) => {
          const poc = (data as any).proposal_open_contract;
          if (poc && (poc.is_sold === 1 || poc.status === 'won' || poc.status === 'lost')) {
            unwatch();
            const profit = Number(poc.profit || 0);
            const payout = Number(poc.payout || 0);
            const isWin = poc.status === 'won' || profit > 0;
            updateTx(result.contractId!, { result: isWin ? 'win' : 'loss', profit, payout });

            if (isWin) {
              lossRef.current = 0;
              setConsecutiveLosses(0);
            } else {
              lossRef.current += 1;
              setConsecutiveLosses(lossRef.current);
              if (useMartingale) {
                stakeRef.current = parseFloat((tradeStake * martingaleMult).toFixed(2));
                setCurrentStake(stakeRef.current);
              }
              if (lossRef.current >= 5) { setAutoRun(false); autoRunRef.current = false; }
            }
            refreshBalance?.();
            placingRef.current = false;
            setTradeLoading(false);
          }
        });
      } else {
        placingRef.current = false;
        setTradeLoading(false);
      }
    } else {
      addTx({ symbol: 'R_100', strategy: 'Hourly', side: `${tradeType} ${barrier}`, stake: tradeStake, result: 'loss', payout: 0, profit: -tradeStake });
      lossRef.current += 1;
      setConsecutiveLosses(lossRef.current);
      if (useMartingale) {
        stakeRef.current = parseFloat((tradeStake * martingaleMult).toFixed(2));
        setCurrentStake(stakeRef.current);
      }
      placingRef.current = false;
      setTradeLoading(false);
    }
    } catch (error) {
      console.error("Hourly trade execution error:", error);
      placingRef.current = false;
      setTradeLoading(false);
    }
  }, [account, placeTrade, watchContract, refreshBalance, tradeType, barrier, useMartingale, martingaleMult, addTx, updateTx, onLoginRequest]);

  // Auto-run bot: event-driven, waits for trade to settle
  useEffect(() => {
    if (!autoRun || !account) return;
    autoRunRef.current = true;

    // Place first trade
    executeHourlyTrade();

    // Poll to see if previous trade settled and place next
    const interval = setInterval(() => {
      if (!autoRunRef.current) return;
      if (!placingRef.current) {
        setTimeout(() => {
          if (autoRunRef.current && !placingRef.current) {
            executeHourlyTrade();
          }
        }, 2000);
      }
    }, 1000);

    return () => {
      autoRunRef.current = false;
      clearInterval(interval);
    };
  }, [autoRun, account, executeHourlyTrade]);

  useEffect(() => { stakeRef.current = autoStake; setCurrentStake(autoStake); }, [autoStake]);

  const cardBg = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';
  const inputCls = cn('w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none',
    isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-800');

  return (
    <div className="space-y-4">
      <div className={cn('rounded-2xl border p-5', cardBg)}>
        <h3 className={cn('text-sm font-bold mb-4 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-800')}>
          <Clock className="h-4 w-4 text-blue-500" /> Hourly High-Probability Trading
        </h3>
        <p className={cn('text-xs mb-4', isDark ? 'text-slate-400' : 'text-gray-500')}>
          Only trades Over 1, 2, 3 or Under 6, 7, 8. Auto-calculates stake from account balance. Stop loss at 5 consecutive losses.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="flex flex-col gap-1">
            <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Hours to Trade</label>
            <input type="number" min={1} max={24} className={inputCls} value={hours} onChange={e => setHours(parseInt(e.target.value) || 1)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Target/Hour ($)</label>
            <input type="number" min={1} className={inputCls} value={targetPerHour} onChange={e => setTargetPerHour(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Risk % of Balance</label>
            <select className={inputCls} value={riskPct} onChange={e => setRiskPct(parseFloat(e.target.value))}>
              {[1, 2, 3, 4, 5].map(p => <option key={p} value={p}>{p}%</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Trade Type</label>
            <select className={inputCls} value={tradeType} onChange={e => { setTradeType(e.target.value as 'over' | 'under'); setBarrier(e.target.value === 'over' ? '3' : '6'); }}>
              <option value="over">Over</option>
              <option value="under">Under</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={cn('text-[10px] font-bold uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Barrier</label>
            <select className={inputCls} value={barrier} onChange={e => setBarrier(e.target.value)}>
              {tradeType === 'over'
                ? [<option key="1" value="1">1</option>, <option key="2" value="2">2</option>, <option key="3" value="3">3</option>]
                : [<option key="6" value="6">6</option>, <option key="7" value="7">7</option>, <option key="8" value="8">8</option>]}
            </select>
          </div>
        </div>

        {/* Martingale table display */}
        <div className={cn('rounded-xl p-3 mb-4', isDark ? 'bg-white/5' : 'bg-gray-50')}>
          <p className={cn('text-xs font-bold mb-2', isDark ? 'text-slate-300' : 'text-gray-700')}>Martingale Multipliers:</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className={cn('rounded-lg p-2 text-center', barrier === '3' && tradeType === 'over' && useMartingale && 'ring-2 ring-blue-500', isDark ? 'bg-white/5' : 'bg-white')}>
              Over 3 / Under 6: <span className="font-black">1.5x</span>
            </div>
            <div className={cn('rounded-lg p-2 text-center', barrier === '2' && tradeType === 'over' && useMartingale && 'ring-2 ring-blue-500', isDark ? 'bg-white/5' : 'bg-white')}>
              Over 2 / Under 7: <span className="font-black">2.1x</span>
            </div>
            <div className={cn('rounded-lg p-2 text-center', barrier === '1' && tradeType === 'over' && useMartingale && 'ring-2 ring-blue-500', isDark ? 'bg-white/5' : 'bg-white')}>
              Over 1 / Under 8: <span className="font-black">3.1x</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <button onClick={() => setUseMartingale(!useMartingale)}
              className={cn('relative h-5 w-10 rounded-full transition-colors', useMartingale ? 'bg-blue-500' : isDark ? 'bg-white/10' : 'bg-gray-300')}>
              <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', useMartingale ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
            <span className={cn('text-xs font-semibold', isDark ? 'text-slate-300' : 'text-gray-700')}>Use Martingale</span>
          </label>
          <div className={cn('text-xs font-bold', isDark ? 'text-slate-400' : 'text-gray-500')}>
            Auto Stake: <span className={cn('font-black', isDark ? 'text-blue-400' : 'text-blue-600')}>{autoStake.toFixed(2)}</span>
          </div>
          <div className={cn('text-xs font-bold', isDark ? 'text-slate-400' : 'text-gray-500')}>
            Current Stake: <span className={cn('font-black', isDark ? 'text-amber-400' : 'text-amber-600')}>{currentStake.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {!autoRun ? (
            <button onClick={() => { if (!account) { onLoginRequest(); return; } setAutoRun(true); }}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-2 text-sm font-bold text-white hover:shadow-lg transition-all">
              <Play className="h-4 w-4" /> Start Hourly Bot
            </button>
          ) : (
            <button onClick={() => setAutoRun(false)}
              className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 transition-all">
              <Square className="h-4 w-4" /> Stop Bot
            </button>
          )}
          <button onClick={executeHourlyTrade} disabled={tradeLoading}
            className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600 transition-all disabled:opacity-50">
            {tradeLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Manual Trade
          </button>
        </div>

        {/* Stats */}
        <div className={cn('grid grid-cols-2 md:grid-cols-6 gap-2 rounded-xl p-3', isDark ? 'bg-white/5' : 'bg-gray-50')}>
          <div className="text-center"><p className={cn('text-[10px] uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Runs</p><p className={cn('text-lg font-black', isDark ? 'text-white' : 'text-gray-800')}>{stats.totalRuns}</p></div>
          <div className="text-center"><p className={cn('text-[10px] uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Wins</p><p className="text-lg font-black text-green-500">{stats.wins}</p></div>
          <div className="text-center"><p className={cn('text-[10px] uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Losses</p><p className="text-lg font-black text-red-500">{stats.losses}</p></div>
          <div className="text-center"><p className={cn('text-[10px] uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Stake</p><p className={cn('text-lg font-black', isDark ? 'text-white' : 'text-gray-800')}>{stats.totalStake.toFixed(2)}</p></div>
          <div className="text-center col-span-2"><p className={cn('text-[10px] uppercase', isDark ? 'text-slate-400' : 'text-gray-500')}>Profit</p>
            <p className={cn('text-2xl font-black', stats.totalProfit >= 0 ? 'text-green-500' : 'text-red-500')}>{stats.totalProfit >= 0 ? '+' : '-'}{Math.abs(stats.totalProfit).toFixed(2)}</p>
          </div>
        </div>

        {consecutiveLosses >= 5 && (
          <div className={cn('mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold', isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600')}>
            <AlertTriangle className="h-3.5 w-3.5" /> 5 consecutive losses reached — bot stopped
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function TradingEngineTab({ account, placeTrade, watchContract, refreshBalance, isDark, onLoginRequest }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('analyzer');
  const [autoSwitchMarkets, setAutoSwitchMarkets] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState('R_100');
  const [strategy, setStrategy] = useState<StrategyId>('over-under');
  const [scanAll, setScanAll] = useState(true);
  const [marketAnalyses, setMarketAnalyses] = useState<Record<string, MarketAnalysis>>({});
  const scanRef = useRef(false);

  // Get ticks for selected symbol — using real quotes from Deriv WebSocket
  const { digits, quotes, currentDigit, currentQuote, status } = useDerivTicks(selectedSymbol, 500);

  // Analyze selected market
  const analysis = useMemo(() => {
    if (digits.length < 10) return null;
    return analyzeMarket(selectedSymbol,
      VOLATILITY_SYMBOLS.find(s => s.symbol === selectedSymbol)?.display ?? selectedSymbol,
      digits, quotes);
  }, [selectedSymbol, digits, quotes]);

  // Generate signal
  const signal = useMemo(() => {
    if (!analysis) return null;
    return generateSignal(analysis, strategy);
  }, [analysis, strategy]);

  // Scan all markets (when auto-switch is on)
  useEffect(() => {
    if (!scanAll) return;
    scanRef.current = true;
    // For each volatility symbol, we'd need ticks — but we can only subscribe to one at a time
    // So we analyze the currently selected one and rotate
    if (autoSwitchMarkets && analysis) {
      setMarketAnalyses(prev => ({ ...prev, [selectedSymbol]: analysis }));
    }
  }, [analysis, scanAll, autoSwitchMarkets, selectedSymbol]);

  // Auto-rotate through markets
  useEffect(() => {
    if (!autoSwitchMarkets || !scanAll) return;
    const interval = setInterval(() => {
      const symbols = VOLATILITY_SYMBOLS.map(s => s.symbol);
      const idx = symbols.indexOf(selectedSymbol);
      const nextIdx = (idx + 1) % symbols.length;
      setSelectedSymbol(symbols[nextIdx]);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoSwitchMarkets, scanAll, selectedSymbol]);

  const cardBg = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';
  const td = isDark ? 'text-slate-300' : 'text-gray-700';
  const tl = isDark ? 'text-slate-400' : 'text-gray-500';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={cn('rounded-2xl border p-4 flex flex-wrap items-center gap-3', cardBg)}>
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-500">
            <Flame className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className={cn('text-lg font-black', isDark ? 'text-white' : 'text-gray-800')}>Trading Engine</h2>
            <p className={cn('text-xs', tl)}>AI Market Analyzer & Auto Trader</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Sub-tab toggle */}
          <div className={cn('flex rounded-lg overflow-hidden border', isDark ? 'border-white/10' : 'border-gray-200')}>
            <button onClick={() => setSubTab('analyzer')}
              className={cn('px-3 py-1.5 text-xs font-bold transition-colors',
                subTab === 'analyzer' ? 'bg-blue-500 text-white' : isDark ? 'bg-white/5 text-slate-400' : 'bg-gray-50 text-gray-500')}>
              <Activity className="h-3.5 w-3.5 inline mr-1" /> Analyzer
            </button>
            <button onClick={() => setSubTab('hourly')}
              className={cn('px-3 py-1.5 text-xs font-bold transition-colors',
                subTab === 'hourly' ? 'bg-blue-500 text-white' : isDark ? 'bg-white/5 text-slate-400' : 'bg-gray-50 text-gray-500')}>
              <Clock className="h-3.5 w-3.5 inline mr-1" /> Hourly Bot
            </button>
          </div>
          {/* Auto-switch markets toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <button onClick={() => setAutoSwitchMarkets(!autoSwitchMarkets)}
              className={cn('relative h-5 w-10 rounded-full transition-colors', autoSwitchMarkets ? 'bg-blue-500' : isDark ? 'bg-white/10' : 'bg-gray-300')}>
              <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', autoSwitchMarkets ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
            <span className={cn('text-xs font-semibold', td)}>Auto-Switch Markets</span>
          </label>
        </div>
      </div>

      {subTab === 'analyzer' ? (
        <>
          {/* Market Selector */}
          <div className={cn('rounded-2xl border p-4', cardBg)}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn('text-xs font-bold uppercase', tl)}>Market:</span>
              <select value={selectedSymbol} onChange={e => setSelectedSymbol(e.target.value)}
                className={cn('rounded-xl border px-3 py-1.5 text-sm font-semibold',
                  isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-800')}>
                {VOLATILITY_SYMBOLS.map(s => <option key={s.symbol} value={s.symbol}>{s.display}</option>)}
              </select>
              <div className={cn('flex items-center gap-2 text-xs', isDark ? 'text-slate-400' : 'text-gray-500')}>
                <Radio className={cn('h-3.5 w-3.5', status === 'open' ? 'text-green-500 animate-pulse' : 'text-gray-400')} />
                {status === 'open' ? 'Live ticks' : status}
              </div>
              <div className={cn('text-xs font-bold', isDark ? 'text-slate-400' : 'text-gray-500')}>
                Ticks: <span className={cn(isDark ? 'text-blue-400' : 'text-blue-600')}>{digits.length}</span>
              </div>
              {autoSwitchMarkets && (
                <span className={cn('text-xs font-bold', isDark ? 'text-amber-400' : 'text-amber-600')}>
                  Rotating every 10s
                </span>
              )}
            </div>
          </div>

          {/* Strategy Selector */}
          <div className={cn('rounded-2xl border p-4', cardBg)}>
            <h3 className={cn('text-sm font-bold mb-3 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-800')}>
              <Layers className="h-4 w-4 text-blue-500" /> Select Strategy
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {STRATEGIES.map(s => (
                <button key={s.id} onClick={() => setStrategy(s.id)}
                  className={cn('rounded-xl border p-3 text-left transition-all',
                    strategy === s.id
                      ? 'bg-gradient-to-br from-blue-500 to-cyan-400 border-blue-400 text-white shadow-lg shadow-blue-500/30'
                      : isDark ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100')}>
                  <div className="text-sm font-black">{s.label}</div>
                  <div className={cn('text-[10px] mt-1', strategy === s.id ? 'text-white/80' : tl)}>{s.short}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Digit Distribution */}
          {analysis && (
            <div className={cn('rounded-2xl border p-5', cardBg)}>
              <h3 className={cn('text-sm font-bold mb-4 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-800')}>
                <Gauge className="h-4 w-4 text-blue-500" /> Digit Distribution — {analysis.displayName}
              </h3>
              <div className="flex items-start justify-between gap-2 overflow-x-auto pb-2">
                {Array.from({ length: 10 }, (_, d) => (
                  <DigitRing key={d} digit={d} percent={analysis.digitStats.percents[d]} count={analysis.digitStats.counts[d]}
                    isNow={d === currentDigit} isDark={isDark} />
                ))}
              </div>
            </div>
          )}

          {/* Last Digit Line Chart + Last 7 Cards */}
          {analysis && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className={cn('rounded-2xl border p-4', cardBg)}>
                <h3 className={cn('text-sm font-bold mb-3', isDark ? 'text-white' : 'text-gray-800')}>Last Digit Line Graph</h3>
                <LastDigitLineChart digits={digits} isDark={isDark} />
              </div>
              <div className={cn('rounded-2xl border p-4', cardBg)}>
                <h3 className={cn('text-sm font-bold mb-3', isDark ? 'text-white' : 'text-gray-800')}>Last 7 Digits</h3>
                <Last7Cards digits={digits} isDark={isDark} />
              </div>
            </div>
          )}

          {/* Strategy-Specific Analysis */}
          {analysis && signal && (
            <>
              {/* Over/Under specific */}
              {strategy === 'over-under' && (
                <div className={cn('rounded-2xl border p-5', cardBg)}>
                  <h3 className={cn('text-sm font-bold mb-4 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-800')}>
                    <TrendingUp className="h-4 w-4 text-green-500" /> Over/Under Analysis
                  </h3>
                  <OUBars analysis={analysis} isDark={isDark} />
                  {/* 500→60 guidance */}
                  <div className={cn('mt-4 rounded-xl p-3 text-xs', isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700')}>
                    <span className="font-bold">Long-term bias (500→60 ticks):</span> {analysis.longTermBias.toUpperCase()} at {analysis.longTermBiasPercent.toFixed(1)}%
                  </div>
                </div>
              )}

              {/* Even/Odd specific */}
              {strategy === 'even-odd' && (
                <div className={cn('rounded-2xl border p-5', cardBg)}>
                  <h3 className={cn('text-sm font-bold mb-4', isDark ? 'text-white' : 'text-gray-800')}>Even/Odd Analysis</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn('text-xs font-bold', td)}>Even</span>
                        <span className="text-sm font-black text-blue-500">{analysis.evenPower.toFixed(1)}%</span>
                      </div>
                      <div className={cn('h-4 rounded-full overflow-hidden', isDark ? 'bg-white/10' : 'bg-gray-200')}>
                        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${analysis.evenPower}%` }} />
                      </div>
                      <p className={cn('mt-1 text-[10px]', tl)}>Count: {analysis.evenOdd.evenCount}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn('text-xs font-bold', td)}>Odd</span>
                        <span className="text-sm font-black text-orange-500">{analysis.oddPower.toFixed(1)}%</span>
                      </div>
                      <div className={cn('h-4 rounded-full overflow-hidden', isDark ? 'bg-white/10' : 'bg-gray-200')}>
                        <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${analysis.oddPower}%` }} />
                      </div>
                      <p className={cn('mt-1 text-[10px]', tl)}>Count: {analysis.evenOdd.oddCount}</p>
                    </div>
                  </div>
                  <div className={cn('mt-3 rounded-xl p-3 text-xs', isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700')}>
                    Deviation: <span className="font-black">{analysis.evenOddDeviation.toFixed(1)}%</span> (threshold: 7%)
                  </div>
                </div>
              )}

              {/* Rise/Fall specific */}
              {strategy === 'rise-fall' && (
                <div className={cn('rounded-2xl border p-5', cardBg)}>
                  <h3 className={cn('text-sm font-bold mb-4', isDark ? 'text-white' : 'text-gray-800')}>Rise/Fall Analysis</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn('text-xs font-bold flex items-center gap-1', td)}><ArrowUp className="h-3 w-3 text-green-500" /> Rise</span>
                        <span className="text-sm font-black text-green-500">{analysis.risePercent.toFixed(1)}%</span>
                      </div>
                      <div className={cn('h-4 rounded-full overflow-hidden', isDark ? 'bg-white/10' : 'bg-gray-200')}>
                        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${analysis.risePercent}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn('text-xs font-bold flex items-center gap-1', td)}><ArrowDown className="h-3 w-3 text-red-500" /> Fall</span>
                        <span className="text-sm font-black text-red-500">{analysis.fallPercent.toFixed(1)}%</span>
                      </div>
                      <div className={cn('h-4 rounded-full overflow-hidden', isDark ? 'bg-white/10' : 'bg-gray-200')}>
                        <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${analysis.fallPercent}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className={cn('mt-3 rounded-xl p-3 text-xs', isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700')}>
                    Deviation: <span className="font-black">{analysis.riseFallDeviation.toFixed(1)}%</span> (threshold: 8%)
                  </div>
                </div>
              )}

              {/* Differs specific */}
              {strategy === 'differs' && (
                <div className={cn('rounded-2xl border p-5', cardBg)}>
                  <h3 className={cn('text-sm font-bold mb-4', isDark ? 'text-white' : 'text-gray-800')}>Differs Analysis — Coldest Digit</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black text-white shadow-lg"
                      style={{ background: DIGIT_COLORS[analysis.coldestDigit] }}>
                      {analysis.coldestDigit}
                    </div>
                    <div>
                      <p className={cn('text-sm font-bold', td)}>Coldest digit: {analysis.coldestDigit}</p>
                      <p className={cn('text-xs', tl)}>Frequency: {analysis.coldestPercent.toFixed(1)}% (expectation: 10%)</p>
                      <p className={cn('text-xs', tl)}>Differ rate: {analysis.differs.differPercent.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Matches specific */}
              {strategy === 'matches' && (
                <div className={cn('rounded-2xl border p-5', cardBg)}>
                  <h3 className={cn('text-sm font-bold mb-4', isDark ? 'text-white' : 'text-gray-800')}>Matches Analysis — Hottest Digit</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black text-white shadow-lg"
                      style={{ background: DIGIT_COLORS[analysis.hottestDigit] }}>
                      {analysis.hottestDigit}
                    </div>
                    <div>
                      <p className={cn('text-sm font-bold', td)}>Hottest digit: {analysis.hottestDigit}</p>
                      <p className={cn('text-xs', tl)}>Frequency: {analysis.hottestPercent.toFixed(1)}% (threshold: 12%)</p>
                      <p className={cn('text-xs', tl)}>Match rate: {analysis.matches.matchPercent.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Signal Card */}
              <SignalCard signal={signal} isDark={isDark} />

              {/* Recovery Panel */}
              <RecoveryPanel isDark={isDark} losses={0} onActivate={() => {}} />

              {/* Trading Console */}
              <TradingConsole
                account={account} placeTrade={placeTrade} watchContract={watchContract}
                refreshBalance={refreshBalance} isDark={isDark}
                onLoginRequest={onLoginRequest} symbol={selectedSymbol}
                strategy={strategy} signal={signal} isAutoMode={false}
              />
            </>
          )}

          {!analysis && (
            <div className={cn('rounded-2xl border p-8 text-center', cardBg)}>
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
              <p className={cn('text-sm', tl)}>Analyzing market data...</p>
            </div>
          )}
        </>
      ) : (
        <HourlySubTab account={account} placeTrade={placeTrade} watchContract={watchContract} refreshBalance={refreshBalance} isDark={isDark} onLoginRequest={onLoginRequest} />
      )}
    </div>
  );
}
