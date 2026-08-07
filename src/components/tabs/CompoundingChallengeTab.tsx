import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react';
import {
  Target, Calendar, TrendingUp, TrendingDown, DollarSign, Percent,
  Play, Pause, Square, RefreshCw, Download, FileText, Printer,
  Save, FolderOpen, ChevronDown, ChevronRight, Award, Clock,
  BarChart3, Activity, AlertTriangle, Settings2, Zap, X,
  CheckCircle2, Wallet, Trophy, Flame,
} from 'lucide-react';
import {
  type Challenge, type ChallengeConfig, type DayRow,
  calculateChallenge, recommendedStake, defaultConfig, formatCurrency,
} from '@/lib/challenge';
import { type StrategyId, STRATEGIES, calcAutoStake, strategyToContract } from '@/lib/trading-engine';
import { 
  analyzeOverUnder, analyzeEvenOdd, analyzeDiffers, evaluateMarkets,
  type StrategyType, type AutotraderSignal 
} from '@/lib/autotrader-engine';
import { exportExcel, exportPDF, printChallenge } from '@/lib/challengeExport';
import { useChallengeStore } from '@/hooks/useChallengeStore';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationStack } from '@/hooks/useNotifications';
import type { Account, TradeResult } from '@/hooks/useDerivAuth';
import { cn } from '@/lib/utils';

type Props = {
  symbol: string;
  account: Account | null;
  placeTrade: (p: {
    symbol: string; contractType: string; barrier?: string;
    amount: number; duration: number; durationUnit: string; basis?: string;
  }) => Promise<TradeResult>;
  watchContract?: (contractId: string, onUpdate: (data: Record<string, unknown>) => void) => () => void;
  digits: number[];
  isDark: boolean;
  onLoginRequest: () => void;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Circular Progress ───────────────────────────────────────────────────────
function CircularProgress({
  value, size = 120, strokeWidth = 8, color = '#3b82f6', label, sublabel, isDark,
}: {
  value: number; size?: number; strokeWidth?: number; color?: string;
  label?: string; sublabel?: string; isDark: boolean;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(Math.max(value, 0), 100) / 100) * circ;
  const trackColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-2xl font-black', isDark ? 'text-white' : 'text-gray-800')}>
            {value.toFixed(1)}%
          </span>
          {sublabel && <span className={cn('text-[10px] mt-0.5', isDark ? 'text-slate-400' : 'text-gray-500')}>{sublabel}</span>}
        </div>
      </div>
      {label && <span className={cn('mt-2 text-xs font-semibold', isDark ? 'text-slate-300' : 'text-gray-600')}>{label}</span>}
    </div>
  );
}

// ─── Mini Stat Card ───────────────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sublabel, color, isDark,
}: {
  icon: typeof DollarSign; label: string; value: string; sublabel?: string;
  color: string; isDark: boolean;
}) {
  return (
    <div className={cn(
      'rounded-2xl border p-4 flex flex-col gap-1 transition-all hover:scale-[1.02]',
      isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
    )}>
      <div className="flex items-center gap-2">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', color)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <span className={cn('text-[11px] font-semibold uppercase tracking-wide', isDark ? 'text-slate-400' : 'text-gray-500')}>{label}</span>
      </div>
      <span className={cn('text-xl font-black', isDark ? 'text-white' : 'text-gray-800')}>{value}</span>
      {sublabel && <span className={cn('text-[10px]', isDark ? 'text-slate-500' : 'text-gray-400')}>{sublabel}</span>}
    </div>
  );
}

// ─── Chart Components ────────────────────────────────────────────────────────
function BalanceGrowthChart({ days, config, isDark }: { days: DayRow[]; config: ChallengeConfig; isDark: boolean }) {
  const W = 600, H = 180;
  const PAD = { l: 40, r: 15, t: 15, b: 25 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const balances = days.map(d => d.actualEndBalance);
  const targets = days.map(d => d.targetEndBalance);
  const allVals = [...balances, ...targets, config.startCapital, config.targetBalance];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const n = days.length;
  const xOf = (i: number) => PAD.l + (n <= 1 ? innerW/2 : (i / (n - 1)) * innerW);
  const yOf = (v: number) => PAD.t + innerH - ((v - minV) / range) * innerH;

  const targetPath = targets.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)},${yOf(v)}`).join(' ');
  const actualPath = balances.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)},${yOf(v)}`).join(' ');
  const areaPath = actualPath + ` L ${xOf(n-1)},${PAD.t + innerH} L ${xOf(0)},${PAD.t + innerH} Z`;

  const gridColor = isDark ? '#1e2a5e' : '#e5e7eb';
  const textColor = isDark ? '#64748b' : '#9ca3af';
  const bg = isDark ? '#0a0e27' : '#f8faff';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: bg, borderRadius: 12 }}>
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = PAD.t + innerH - f * innerH;
        const val = minV + f * range;
        return (
          <g key={f}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke={gridColor} strokeWidth="1" />
            <text x={PAD.l - 5} y={y + 3} textAnchor="end" fill={textColor} fontSize="9">{val.toFixed(0)}</text>
          </g>
        );
      })}
      <path d={areaPath} fill={isDark ? '#3b82f620' : '#3b82f615'} />
      <path d={targetPath} fill="none" stroke={isDark ? '#64748b' : '#94a3b8'} strokeWidth="2" strokeDasharray="4 4" />
      <path d={actualPath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
      {balances.map((v, i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(v)} r="3" fill="#3b82f6" />
      ))}
      {[0, Math.floor(n/2), n-1].map(i => (
        <text key={i} x={xOf(i)} y={H - 8} textAnchor="middle" fill={textColor} fontSize="9">D{days[i].day}</text>
      ))}
    </svg>
  );
}

function DailyProfitChart({ days, isDark }: { days: DayRow[]; isDark: boolean }) {
  const W = 600, H = 150;
  const PAD = { l: 35, r: 10, t: 10, b: 25 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const profits = days.map(d => d.difference);
  const maxAbs = Math.max(...profits.map(Math.abs), 1);
  const n = days.length;
  const barW = innerW / n * 0.7;
  const gap = innerW / n * 0.3;
  const zeroY = PAD.t + innerH / 2;
  const barH = (v: number) => (Math.abs(v) / maxAbs) * (innerH / 2);

  const gridColor = isDark ? '#1e2a5e' : '#e5e7eb';
  const textColor = isDark ? '#64748b' : '#9ca3af';
  const bg = isDark ? '#0a0e27' : '#f8faff';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: bg, borderRadius: 12 }}>
      <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} stroke={gridColor} strokeWidth="1" />
      {profits.map((v, i) => {
        const x = PAD.l + i * (barW + gap) + gap/2;
        const h = barH(v);
        const y = v >= 0 ? zeroY - h : zeroY;
        return <rect key={i} x={x} y={y} width={barW} height={h} rx="2"
          fill={v >= 0 ? '#22c55e' : '#ef4444'} opacity={v === 0 ? 0.3 : 0.85} />;
      })}
      {[0, Math.floor(n/2), n-1].map(i => (
        <text key={i} x={PAD.l + i * (barW + gap) + gap/2 + barW/2} y={H - 8} textAnchor="middle" fill={textColor} fontSize="9">D{days[i].day}</text>
      ))}
    </svg>
  );
}

function ProgressChart({ days, isDark }: { days: DayRow[]; isDark: boolean }) {
  const W = 600, H = 150;
  const PAD = { l: 35, r: 10, t: 10, b: 25 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const n = days.length;
  const xOf = (i: number) => PAD.l + (n <= 1 ? innerW/2 : (i / (n - 1)) * innerW);
  const yOf = (v: number) => PAD.t + innerH - (v / 100) * innerH;
  const path = days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)},${yOf(d.progressPct)}`).join(' ');
  const area = path + ` L ${xOf(n-1)},${PAD.t + innerH} L ${xOf(0)},${PAD.t + innerH} Z`;

  const gridColor = isDark ? '#1e2a5e' : '#e5e7eb';
  const textColor = isDark ? '#64748b' : '#9ca3af';
  const bg = isDark ? '#0a0e27' : '#f8faff';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: bg, borderRadius: 12 }}>
      {[0, 25, 50, 75, 100].map(v => {
        const y = yOf(v);
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke={gridColor} strokeWidth="1" />
            <text x={PAD.l - 5} y={y + 3} textAnchor="end" fill={textColor} fontSize="9">{v}%</text>
          </g>
        );
      })}
      <path d={area} fill={isDark ? '#22c55e20' : '#22c55e15'} />
      <path d={path} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
      {[0, Math.floor(n/2), n-1].map(i => (
        <text key={i} x={xOf(i)} y={H - 8} textAnchor="middle" fill={textColor} fontSize="9">D{days[i].day}</text>
      ))}
    </svg>
  );
}

// ─── Input Field ──────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, type = 'number', min, max, step, placeholder, isDark, suffix,
}: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; min?: number; max?: number; step?: number; placeholder?: string; isDark: boolean; suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className={cn('text-[11px] font-semibold uppercase tracking-wide', isDark ? 'text-slate-400' : 'text-gray-500')}>{label}</label>
      <div className="relative">
        <input
          type={type} min={min} step={step} value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none transition-colors',
            isDark
              ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20'
              : 'bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50'
          )}
        />
        {suffix && <span className={cn('absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold', isDark ? 'text-slate-500' : 'text-gray-400')}>{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function CompoundingChallengeTab({ symbol, account, placeTrade, watchContract, digits, isDark, onLoginRequest }: Props) {
  const { challenges, save, remove, loadAll } = useChallengeStore();
  const { notifications, notify, dismiss } = useNotifications();
  const [config, setConfig] = useState<ChallengeConfig>(defaultConfig());
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [botState, setBotState] = useState<'IDLE' | 'SCANNING' | 'TRADING' | 'COOLDOWN'>('IDLE');
  const [autoTrading, setAutoTrading] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyId>('over-under');
  const autoRef = useRef(false);
  const prevBalanceRef = useRef<number | null>(null);

  // Recalculate on config change
  const { days, stats } = useMemo(() => calculateChallenge(config, challenge?.stats.currentBalance ?? account?.balance ?? config.startCapital), [config, challenge?.stats.currentBalance, account?.balance]);

  const currentChallenge: Challenge = useMemo(() => {
    return challenge ?? {
      id: '',
      config,
      days,
      stats,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [challenge, config, days, stats]);

  const updateConfig = (key: keyof ChallengeConfig, value: unknown) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleGenerate = useCallback(() => {
    const { days: newDays, stats: newStats } = calculateChallenge(config);
    const newChallenge: Challenge = {
      id: challenge?.id ?? '',
      config,
      days: newDays,
      stats: newStats,
      status: 'active',
      createdAt: challenge?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setChallenge(newChallenge);
    notify('success', `Challenge generated: ${config.challengeDays} days, ${config.sessionsPerDay} sessions/day`);
  }, [config, challenge, notify]);

  const handleReset = useCallback(() => {
    setConfig(defaultConfig());
    setChallenge(null);
    notify('info', 'Challenge reset to defaults');
  }, [notify]);

  const handleSave = useCallback(async () => {
    if (!challenge) {
      const { days: newDays, stats: newStats } = calculateChallenge(config);
      const newCh: Challenge = {
        id: '', config, days: newDays, stats: newStats,
        status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      const saved = await save(newCh);
      if (saved) {
        setChallenge(saved);
        notify('success', 'Challenge saved');
      } else {
        notify('error', 'Failed to save challenge');
      }
    } else {
      const updated = { ...challenge, config, days, stats, updatedAt: new Date().toISOString() };
      const saved = await save(updated);
      if (saved) {
        setChallenge(saved);
        notify('success', 'Challenge saved');
      } else {
        notify('error', 'Failed to save challenge');
      }
    }
  }, [challenge, config, days, stats, save, notify]);

  const handleLoad = useCallback((ch: Challenge) => {
    setConfig(ch.config);
    setChallenge(ch);
    setShowHistory(false);
    notify('success', `Loaded challenge: ${ch.config.name}`);
  }, [notify]);

  const handleExportExcel = useCallback(() => {
    exportExcel(currentChallenge);
    notify('success', 'Excel file exported');
  }, [currentChallenge, notify]);

  const handleExportPDF = useCallback(() => {
    exportPDF(currentChallenge);
    notify('success', 'PDF report opened');
  }, [currentChallenge, notify]);

  const handlePrint = useCallback(() => {
    printChallenge(currentChallenge);
    notify('success', 'Print dialog opened');
  }, [currentChallenge, notify]);

  // ── Trading Integration ──
  const updateChallengeBalance = useCallback((newBalance: number) => {
    if (!challenge) return;
    const today = new Date().toISOString().split('T')[0];
    const updatedDays = [...challenge.days];
    const dayIdx = updatedDays.findIndex(d => d.date === today);
    if (dayIdx < 0) return;
    const day = { ...updatedDays[dayIdx] };
    const dayProfit = newBalance - day.startBalance;
    day.actualEndBalance = newBalance;
    day.difference = dayProfit;
    day.progressPct = day.dailyTargetProfit > 0 ? Math.min(100, (dayProfit / day.dailyTargetProfit) * 100) : 0;
    day.status = day.progressPct >= 100 ? 'achieved' : dayProfit > 0 ? 'partial' : dayProfit < 0 ? 'missed' : 'pending';
    updatedDays[dayIdx] = day;
    const { stats: newStats } = calculateChallenge(challenge.config, newBalance);
    const updated = { ...challenge, days: updatedDays, stats: newStats, updatedAt: new Date().toISOString() };
    setChallenge(updated);
    if (newBalance !== prevBalanceRef.current) {
      notify('info', `New balance recorded: ${formatCurrency(newBalance, challenge.config.currency)}`);
      prevBalanceRef.current = newBalance;
    }
  }, [challenge, notify]);

  // Track account balance changes
  useEffect(() => {
    if (account && challenge) {
      const bal = account.balance;
      if (prevBalanceRef.current === null) {
        prevBalanceRef.current = bal;
      } else if (bal !== prevBalanceRef.current) {
        updateChallengeBalance(bal);
      }
    }
  }, [account?.balance, challenge, updateChallengeBalance]);

  // Auto trading effect
  const startAutoTrading = useCallback(async () => {
    if (!account) { onLoginRequest(); return; }
    if (!challenge) { notify('warning', 'Generate a challenge first'); return; }
    setAutoTrading(true);
    setAutoPaused(false);
    autoRef.current = true;
    setBotState('SCANNING');
    notify('success', 'Auto trading started');
  }, [account, challenge, notify, onLoginRequest]);

  const pauseAutoTrading = useCallback(() => {
    setAutoPaused(true);
    setBotState('IDLE');
    notify('warning', 'Auto trading paused');
  }, [notify]);

  const resumeAutoTrading = useCallback(() => {
    setAutoPaused(false);
    setBotState('SCANNING');
    notify('success', 'Auto trading resumed');
  }, [notify]);

  const stopAutoTrading = useCallback(() => {
    setAutoTrading(false);
    setAutoPaused(false);
    autoRef.current = false;
    setBotState('IDLE');
    notify('warning', 'Auto trading stopped');
  }, [notify]);

  // Auto trade execution loop
  useEffect(() => {
    if (!autoTrading || autoPaused || !account || !challenge || botState !== 'SCANNING' || tradeLoading) return;
    
    // Check if daily target reached
    const today = new Date().toISOString().split('T')[0];
    const dayIdx = challenge.days.findIndex(d => d.date === today);
    if (dayIdx < 0) return;
    const day = challenge.days[dayIdx];
    const sessionIdx = day.sessions.findIndex(s => s.status === 'pending');
    if (sessionIdx < 0) {
      notify('info', 'Daily target reached - stopping for today');
      stopAutoTrading();
      return;
    }
    const session = day.sessions[sessionIdx];
    if (session.actualProfit >= session.sessionTarget) {
      notify('success', `Session ${sessionIdx + 1} completed`);
      return;
    }

    // Wait for enough ticks
    if (!digits || digits.length < 60) return;

    // Generate signal
    let signal: AutotraderSignal | null = null;
    if (selectedStrategy === 'over-under') signal = analyzeOverUnder(digits, digits, symbol);
    else if (selectedStrategy === 'even-odd') signal = analyzeEvenOdd(digits, digits, symbol);
    else if (selectedStrategy === 'differs') signal = analyzeDiffers(digits, symbol);
    
    if (!signal || signal.action !== 'TRADE') return;

    // Execute trade
    const stake = recommendedStake(account.balance, config.riskPerTrade);
    setBotState('TRADING');
    setTradeLoading(true);

    const go = async () => {
      const result = await placeTrade({
        symbol,
        contractType: signal!.contractType!,
        barrier: signal!.barrier?.toString(),
        amount: stake,
        duration: 1,
        durationUnit: 't',
        basis: 'stake',
      });
      
      if (result.success && result.contractId) {
        notify('success', `Trade placed: ${formatCurrency(stake, config.currency)} (${signal!.strategy})`);
        
        if (watchContract) {
          const unwatch = watchContract(result.contractId, (data) => {
            const poc = (data as any).proposal_open_contract;
            if (poc && (poc.is_sold === 1 || poc.status === 'won' || poc.status === 'lost')) {
              unwatch();
              setTradeLoading(false);
              setBotState('COOLDOWN');
              setTimeout(() => {
                if (autoRef.current && !autoPaused) setBotState('SCANNING');
              }, 2000); // 2 second cooldown
            }
          });
        } else {
          setTradeLoading(false);
          setBotState('COOLDOWN');
          setTimeout(() => {
            if (autoRef.current && !autoPaused) setBotState('SCANNING');
          }, 2000);
        }
      } else {
        notify('error', `Trade failed: ${result.error}`);
        setTradeLoading(false);
        setBotState('COOLDOWN');
        setTimeout(() => {
          if (autoRef.current && !autoPaused) setBotState('SCANNING');
        }, 3000);
      }
    };
    go();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrading, autoPaused, account?.balance, challenge, tradeLoading, botState, digits, symbol, selectedStrategy]);

  const stake = account ? recommendedStake(account.balance, config.riskPerTrade) : 0;

  const td = isDark ? 'text-slate-300' : 'text-gray-700';
  const tl = isDark ? 'text-slate-400' : 'text-gray-500';
  const cardBg = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';
  const inputBg = isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200';

  return (
    <div className="space-y-4">
      <NotificationStack notifications={notifications} onDismiss={dismiss} />

      {/* ── Header ── */}
      <div className={cn('rounded-2xl border p-4 flex flex-wrap items-center gap-3', cardBg)}>
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
            <Trophy className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className={cn('text-lg font-black', isDark ? 'text-white' : 'text-gray-800')}>Compounding Challenge</h2>
            <p className={cn('text-xs', tl)}>Smart AI Growth Tracker</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {account && (
            <div className={cn('flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold border',
              isDark ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700')}>
              <Wallet className="h-3.5 w-3.5" />
              {formatCurrency(account.balance, account.currency)}
            </div>
          )}
          <button onClick={() => setShowSettings(s => !s)}
            className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors',
              showSettings ? 'bg-blue-500 border-blue-400 text-white' : isDark ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100')}>
            <Settings2 className="h-3.5 w-3.5" /> Risk Settings
          </button>
          <button onClick={() => { loadAll(); setShowHistory(s => !s); }}
            className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors',
              isDark ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100')}>
            <FolderOpen className="h-3.5 w-3.5" /> History
          </button>
        </div>
      </div>

      {/* ── Challenge Creation Form ── */}
      <div className={cn('rounded-2xl border p-5', cardBg)}>
        <h3 className={cn('text-sm font-bold mb-4 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-800')}>
          <Target className="h-4 w-4 text-blue-500" /> Create Challenge
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <Field label="Challenge Name" type="text" value={config.name} onChange={v => updateConfig('name', v)} isDark={isDark} />
          <Field label="Starting Capital" value={config.startCapital} onChange={v => updateConfig('startCapital', parseFloat(v) || 0)} min={0} step={1} isDark={isDark} suffix={config.currency} />
          <Field label="Target Balance" value={config.targetBalance} onChange={v => updateConfig('targetBalance', parseFloat(v) || 0)} min={0} step={1} isDark={isDark} suffix={config.currency} />
          <Field label="Challenge Days" value={config.challengeDays} onChange={v => updateConfig('challengeDays', parseInt(v) || 1)} min={1} step={1} isDark={isDark} />
          <Field label="Sessions Per Day" value={config.sessionsPerDay} onChange={v => updateConfig('sessionsPerDay', parseInt(v) || 1)} min={1} step={1} isDark={isDark} />
          <Field label="Daily Target Override" value={config.dailyProfitTargetOverride ?? ''} onChange={v => updateConfig('dailyProfitTargetOverride', v ? parseFloat(v) : null)} min={0} step={0.1} isDark={isDark} suffix={config.currency} />
        </div>

        {/* Trading days + toggles */}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={cn('text-[11px] font-semibold uppercase', tl)}>Trading Days:</span>
            <button onClick={() => updateConfig('tradingDays', 'daily')}
              className={cn('rounded-lg px-3 py-1 text-xs font-bold border transition-colors',
                config.tradingDays === 'daily' ? 'bg-blue-500 border-blue-400 text-white' : isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-gray-50 border-gray-200 text-gray-600')}>
              Every Day
            </button>
            <div className="flex gap-1">
              {WEEKDAYS.map((d, i) => {
                const selected = config.tradingDays !== 'daily' && (config.tradingDays as number[]).includes(i);
                return (
                  <button key={i} onClick={() => {
                    if (config.tradingDays === 'daily') {
                      updateConfig('tradingDays', [i]);
                    } else {
                      const arr = config.tradingDays as number[];
                      updateConfig('tradingDays', arr.includes(i) ? arr.filter(x => x !== i) : [...arr, i]);
                    }
                  }}
                    className={cn('h-7 w-9 rounded-lg text-[10px] font-bold border transition-colors',
                      selected ? 'bg-blue-500 border-blue-400 text-white' : isDark ? 'bg-white/5 border-white/10 text-slate-400' : 'bg-gray-50 border-gray-200 text-gray-400')}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <button onClick={() => updateConfig('autoCompounding', !config.autoCompounding)}
              className={cn('relative h-5 w-10 rounded-full transition-colors', config.autoCompounding ? 'bg-blue-500' : isDark ? 'bg-white/10' : 'bg-gray-300')}>
              <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', config.autoCompounding ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
            <span className={cn('text-xs font-semibold', td)}>Auto Compounding</span>
          </label>
        </div>

        {/* Strategy selector */}
        <div className="mt-3">
          <span className={cn('text-[11px] font-semibold uppercase', tl)}>Trading Strategy:</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {STRATEGIES.map(s => (
              <button key={s.id} onClick={() => setSelectedStrategy(s.id)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors',
                  selectedStrategy === s.id ? 'bg-blue-500 border-blue-400 text-white' : isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-gray-50 border-gray-200 text-gray-600')}>
                {s.label}
              </button>
            ))}
          </div>
          {(() => {
            const auto = calcAutoStake(account?.balance ?? config.startCapital, config.riskPerTrade, selectedStrategy, config.sessionsPerDay);
            return (
              <div className={cn('mt-2 flex flex-wrap gap-4 text-xs font-bold', tl)}>
                <span>Auto Stake: <span className={isDark ? 'text-blue-400' : 'text-blue-600'}>{formatCurrency(auto.stake, config.currency)}</span></span>
                <span>Auto Daily Stop: <span className={isDark ? 'text-red-400' : 'text-red-600'}>{formatCurrency(auto.dailyStopLoss, config.currency)}</span></span>
                <span>Auto Risk/Session: <span className={isDark ? 'text-amber-400' : 'text-amber-600'}>{formatCurrency(auto.riskPerSession, config.currency)}</span></span>
              </div>
            );
          })()}
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={handleGenerate}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 px-4 py-2 text-sm font-bold text-white hover:shadow-lg hover:shadow-blue-500/30 transition-all">
            <Zap className="h-4 w-4" /> Generate Challenge
          </button>
          <button onClick={handleReset}
            className={cn('flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold border transition-colors',
              isDark ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100')}>
            <RefreshCw className="h-4 w-4" /> Reset
          </button>
          <button onClick={handleSave}
            className={cn('flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold border transition-colors',
              isDark ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/20' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100')}>
            <Save className="h-4 w-4" /> Save
          </button>
          <button onClick={handleExportExcel}
            className={cn('flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold border transition-colors',
              isDark ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100')}>
            <Download className="h-4 w-4" /> Excel
          </button>
          <button onClick={handleExportPDF}
            className={cn('flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold border transition-colors',
              isDark ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100')}>
            <FileText className="h-4 w-4" /> PDF
          </button>
          <button onClick={handlePrint}
            className={cn('flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold border transition-colors',
              isDark ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100')}>
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>

        {/* Quick calculation preview */}
        <div className={cn('mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl p-3', isDark ? 'bg-white/5' : 'bg-gray-50')}>
          <div className="text-center">
            <p className={cn('text-[10px] uppercase', tl)}>Daily Growth</p>
            <p className="text-lg font-black text-blue-500">{stats.requiredDailyGrowthPct.toFixed(2)}%</p>
          </div>
          <div className="text-center">
            <p className={cn('text-[10px] uppercase', tl)}>Session Growth</p>
            <p className="text-lg font-black text-cyan-500">{stats.requiredSessionGrowthPct.toFixed(2)}%</p>
          </div>
          <div className="text-center">
            <p className={cn('text-[10px] uppercase', tl)}>Daily Target</p>
            <p className="text-lg font-black text-green-500">{formatCurrency(stats.dailyTarget, config.currency)}</p>
          </div>
          <div className="text-center">
            <p className={cn('text-[10px] uppercase', tl)}>Session Target</p>
            <p className="text-lg font-black text-amber-500">{formatCurrency(stats.sessionTarget, config.currency)}</p>
          </div>
        </div>
      </div>

      {/* ── Risk Settings Panel ── */}
      {showSettings && (
        <div className={cn('rounded-2xl border p-5 fade-up', cardBg)}>
          <h3 className={cn('text-sm font-bold mb-4 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-800')}>
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Risk Management Settings
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Risk Per Trade %" value={config.riskPerTrade} onChange={v => updateConfig('riskPerTrade', parseFloat(v) || 0)} min={0.5} max={5} step={0.1} isDark={isDark} />
            <Field label="Max Consecutive Losses" value={config.maxConsecutiveLosses} onChange={v => updateConfig('maxConsecutiveLosses', parseInt(v) || 0)} min={1} step={1} isDark={isDark} />
            <Field label="Max Daily Loss %" value={config.maxDailyLoss} onChange={v => updateConfig('maxDailyLoss', parseFloat(v) || 0)} min={0} step={0.5} isDark={isDark} />
            <Field label="Max Daily Profit %" value={config.maxDailyProfit} onChange={v => updateConfig('maxDailyProfit', parseFloat(v) || 0)} min={0} step={0.5} isDark={isDark} />
            <Field label="Max Trades/Session" value={config.maxTradesPerSession} onChange={v => updateConfig('maxTradesPerSession', parseInt(v) || 0)} min={1} step={1} isDark={isDark} />
            <Field label="Martingale Multiplier" value={config.martingaleMultiplier} onChange={v => updateConfig('martingaleMultiplier', parseFloat(v) || 1)} min={1} step={0.1} isDark={isDark} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <button onClick={() => updateConfig('martingaleEnabled', !config.martingaleEnabled)}
                className={cn('relative h-5 w-10 rounded-full transition-colors', config.martingaleEnabled ? 'bg-blue-500' : isDark ? 'bg-white/10' : 'bg-gray-300')}>
                <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', config.martingaleEnabled ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
              <span className={cn('text-xs font-semibold', td)}>Martingale</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <button onClick={() => updateConfig('stopAfterTarget', !config.stopAfterTarget)}
                className={cn('relative h-5 w-10 rounded-full transition-colors', config.stopAfterTarget ? 'bg-blue-500' : isDark ? 'bg-white/10' : 'bg-gray-300')}>
                <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', config.stopAfterTarget ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
              <span className={cn('text-xs font-semibold', td)}>Stop After Target</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <button onClick={() => updateConfig('resumeNextSession', !config.resumeNextSession)}
                className={cn('relative h-5 w-10 rounded-full transition-colors', config.resumeNextSession ? 'bg-blue-500' : isDark ? 'bg-white/10' : 'bg-gray-300')}>
                <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', config.resumeNextSession ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
              <span className={cn('text-xs font-semibold', td)}>Resume Next Session</span>
            </label>
          </div>
          <div className={cn('mt-3 rounded-xl p-3 text-sm', isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700')}>
            Recommended stake: <span className="font-black">{formatCurrency(stake, config.currency)}</span> ({config.riskPerTrade}% of {account ? formatCurrency(account.balance, account.currency) : formatCurrency(config.startCapital, config.currency)})
          </div>
        </div>
      )}

      {/* ── History Panel ── */}
      {showHistory && (
        <div className={cn('rounded-2xl border p-5 fade-up', cardBg)}>
          <h3 className={cn('text-sm font-bold mb-4 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-800')}>
            <Clock className="h-4 w-4 text-blue-500" /> Challenge History
          </h3>
          {challenges.length === 0 ? (
            <p className={cn('text-sm text-center py-6', tl)}>No saved challenges yet</p>
          ) : (
            <div className="space-y-2">
              {challenges.map(ch => (
                <div key={ch.id} className={cn('flex items-center gap-3 rounded-xl p-3 border', isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200')}>
                  <div className="flex-1">
                    <p className={cn('text-sm font-bold', isDark ? 'text-white' : 'text-gray-800')}>{ch.config.name}</p>
                    <p className={cn('text-xs', tl)}>
                      {formatCurrency(ch.config.startCapital, ch.config.currency)} → {formatCurrency(ch.config.targetBalance, ch.config.currency)} · {ch.config.challengeDays} days · ROI: {ch.stats.overallROI.toFixed(1)}%
                    </p>
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                    ch.status === 'active' ? 'bg-green-500/20 text-green-400' : ch.status === 'completed' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400')}>
                    {ch.status}
                  </span>
                  <button onClick={() => handleLoad(ch)}
                    className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-600 transition-colors">
                    Load
                  </button>
                  <button onClick={() => remove(ch.id)}
                    className={cn('rounded-lg p-1.5 transition-colors', isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-50')}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Dashboard ── */}
      <div className={cn('rounded-2xl border p-5', cardBg)}>
        <h3 className={cn('text-sm font-bold mb-4 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-800')}>
          <BarChart3 className="h-4 w-4 text-blue-500" /> Dashboard
        </h3>

        {/* Circular progress + key metrics */}
        <div className="flex flex-col lg:flex-row gap-6 items-center">
          <div className="flex gap-6">
            <CircularProgress value={stats.challengeProgressPct} color="#3b82f6" label="Challenge Progress" sublabel={`${stats.completedDays}/${config.challengeDays} days`} isDark={isDark} />
            <CircularProgress value={stats.overallROI} color="#22c55e" label="Overall ROI" size={100} strokeWidth={6} isDark={isDark} />
          </div>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 w-full">
            <StatCard icon={Wallet} label="Current Balance" value={formatCurrency(stats.currentBalance, config.currency)} color="bg-blue-500" isDark={isDark} />
            <StatCard icon={Target} label="Target Balance" value={formatCurrency(stats.targetBalance, config.currency)} color="bg-purple-500" isDark={isDark} />
            <StatCard icon={TrendingUp} label="Remaining" value={formatCurrency(stats.remainingBalance, config.currency)} color="bg-amber-500" isDark={isDark} />
            <StatCard icon={DollarSign} label="Daily Target" value={formatCurrency(stats.dailyTarget, config.currency)} color="bg-green-500" isDark={isDark} />
            <StatCard icon={TrendingUp} label="Today's Profit" value={formatCurrency(stats.todayProfit, config.currency)} color={stats.todayProfit >= 0 ? 'bg-green-500' : 'bg-red-500'} isDark={isDark} />
            <StatCard icon={Clock} label="Remaining Days" value={String(stats.remainingDays)} color="bg-cyan-500" isDark={isDark} />
            <StatCard icon={CheckCircle2} label="Winning Days" value={String(stats.winningDays)} color="bg-green-500" isDark={isDark} />
            <StatCard icon={X} label="Losing Days" value={String(stats.losingDays)} color="bg-red-500" isDark={isDark} />
            <StatCard icon={Activity} label="Current Session" value={`${stats.currentSession}/${config.sessionsPerDay}`} color="bg-blue-500" isDark={isDark} />
            <StatCard icon={Zap} label="Next Session Target" value={formatCurrency(stats.nextSessionTarget, config.currency)} color="bg-amber-500" isDark={isDark} />
            <StatCard icon={Award} label="Completed Days" value={`${stats.completedDays}/${config.challengeDays}`} color="bg-purple-500" isDark={isDark} />
            <StatCard icon={Calendar} label="Est. Finish" value={stats.estimatedFinishDate} color="bg-cyan-500" isDark={isDark} />
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className={cn('text-xs font-semibold', td)}>Challenge Progress</span>
            <span className={cn('text-xs font-bold', isDark ? 'text-blue-400' : 'text-blue-600')}>{stats.challengeProgressPct.toFixed(1)}%</span>
          </div>
          <div className={cn('h-3 rounded-full overflow-hidden', isDark ? 'bg-white/10' : 'bg-gray-200')}>
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-700"
              style={{ width: `${Math.min(stats.challengeProgressPct, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* ── Auto Trading Controls ── */}
      <div className={cn('rounded-2xl border p-4', cardBg)}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('text-sm font-bold flex items-center gap-2 mr-auto', isDark ? 'text-white' : 'text-gray-800')}>
            <Flame className="h-4 w-4 text-orange-500" /> Trading Engine
          </h3>
          {!autoTrading ? (
            <button onClick={startAutoTrading}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-2 text-sm font-bold text-white hover:shadow-lg hover:shadow-green-500/30 transition-all">
              <Play className="h-4 w-4" /> Start Auto Trading
            </button>
          ) : (
            <>
              {autoPaused ? (
                <button onClick={resumeAutoTrading}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-2 text-sm font-bold text-white hover:shadow-lg transition-all">
                  <Play className="h-4 w-4" /> Resume
                </button>
              ) : (
                <button onClick={pauseAutoTrading}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 transition-all">
                  <Pause className="h-4 w-4" /> Pause
                </button>
              )}
              <button onClick={stopAutoTrading}
                className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 transition-all">
                <Square className="h-4 w-4" /> Stop
              </button>
            </>
          )}
          <div className={cn('flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold border',
            autoTrading && !autoPaused ? 'bg-green-500/10 border-green-400/30 text-green-400' :
            autoPaused ? 'bg-amber-500/10 border-amber-400/30 text-amber-400' :
            isDark ? 'bg-white/5 border-white/10 text-slate-400' : 'bg-gray-50 border-gray-200 text-gray-400')}>
            <span className={cn('h-2 w-2 rounded-full', autoTrading && !autoPaused ? 'bg-green-500 animate-pulse' : 'bg-gray-400')} />
            {autoTrading ? (autoPaused ? 'Paused' : 'Running') : 'Idle'}
          </div>
        </div>
        {tradeLoading && (
          <div className={cn('mt-2 flex items-center gap-2 text-xs', isDark ? 'text-blue-400' : 'text-blue-600')}>
            <div className="h-3 w-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            Placing trade...
          </div>
        )}
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cn('rounded-2xl border p-4', cardBg)}>
          <h3 className={cn('text-sm font-bold mb-3', isDark ? 'text-white' : 'text-gray-800')}>Balance Growth (Actual vs Target)</h3>
          <BalanceGrowthChart days={days} config={config} isDark={isDark} />
        </div>
        <div className={cn('rounded-2xl border p-4', cardBg)}>
          <h3 className={cn('text-sm font-bold mb-3', isDark ? 'text-white' : 'text-gray-800')}>Daily Profit</h3>
          <DailyProfitChart days={days} isDark={isDark} />
        </div>
        <div className={cn('rounded-2xl border p-4', cardBg)}>
          <h3 className={cn('text-sm font-bold mb-3', isDark ? 'text-white' : 'text-gray-800')}>Challenge Progress</h3>
          <ProgressChart days={days} isDark={isDark} />
        </div>
        <div className={cn('rounded-2xl border p-4', cardBg)}>
          <h3 className={cn('text-sm font-bold mb-3', isDark ? 'text-white' : 'text-gray-800')}>ROI Growth</h3>
          <div className="flex items-center justify-center h-[150px]">
            <CircularProgress value={Math.max(0, stats.overallROI)} size={140} strokeWidth={10} color="#22c55e" label="Total ROI" sublabel={`${stats.totalProfit >= 0 ? '+' : ''}${formatCurrency(stats.totalProfit, config.currency)}`} isDark={isDark} />
          </div>
        </div>
      </div>

      {/* ── Daily Challenge Table ── */}
      <div className={cn('rounded-2xl border overflow-hidden', cardBg)}>
        <div className="p-4 border-b border-white/10">
          <h3 className={cn('text-sm font-bold', isDark ? 'text-white' : 'text-gray-800')}>Daily Challenge Tracker</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={cn('border-b', isDark ? 'border-white/10' : 'border-gray-200')}>
                <th className="px-3 py-2 text-left font-semibold"></th>
                <th className="px-3 py-2 text-left font-semibold">Day</th>
                <th className="px-3 py-2 text-right font-semibold">Start Balance</th>
                <th className="px-3 py-2 text-right font-semibold">Daily Target</th>
                <th className="px-3 py-2 text-right font-semibold">Target End</th>
                <th className="px-3 py-2 text-right font-semibold">Actual End</th>
                <th className="px-3 py-2 text-right font-semibold">Diff (+/-)</th>
                <th className="px-3 py-2 text-center font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Progress</th>
              </tr>
            </thead>
            <tbody>
              {days.map(d => (
                <Fragment key={d.day}>
                  <tr key={d.day} className={cn('border-b cursor-pointer hover:bg-white/5', isDark ? 'border-white/5' : 'border-gray-100')}
                    onClick={() => setExpandedDay(expandedDay === d.day ? null : d.day)}>
                    <td className="px-3 py-2">
                      {expandedDay === d.day
                        ? <ChevronDown className="h-3.5 w-3.5" />
                        : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className={cn('px-3 py-2 font-bold', isDark ? 'text-white' : 'text-gray-800')}>Day {d.day}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', td)}>{d.startBalance.toFixed(2)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', td)}>{d.dailyTargetProfit.toFixed(2)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', td)}>{d.targetEndBalance.toFixed(2)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-bold', isDark ? 'text-white' : 'text-gray-800')}>{d.actualEndBalance.toFixed(2)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-bold',
                      d.difference > 0 ? 'text-green-500' : d.difference < 0 ? 'text-red-500' : td)}>
                      {d.difference > 0 ? '+' : ''}{d.difference.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        d.status === 'achieved' ? 'bg-green-500/20 text-green-400' :
                        d.status === 'partial' ? 'bg-amber-500/20 text-amber-400' :
                        d.status === 'missed' ? 'bg-red-500/20 text-red-400' :
                        isDark ? 'bg-white/5 text-slate-400' : 'bg-gray-100 text-gray-400')}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className={cn('h-1.5 w-16 rounded-full overflow-hidden', isDark ? 'bg-white/10' : 'bg-gray-200')}>
                          <div className={cn('h-full rounded-full',
                            d.progressPct >= 100 ? 'bg-green-500' : d.progressPct > 0 ? 'bg-blue-500' : 'bg-gray-400')}
                            style={{ width: `${Math.min(d.progressPct, 100)}%` }} />
                        </div>
                        <span className={cn('text-[10px] tabular-nums w-10', td)}>{d.progressPct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                  {expandedDay === d.day && (
                    <tr className={cn('border-b', isDark ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-100')}>
                      <td colSpan={9} className="px-4 py-3">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className={cn('border-b', isDark ? 'border-white/10' : 'border-gray-200')}>
                                <th className="px-2 py-1.5 text-left font-semibold">Session</th>
                                <th className="px-2 py-1.5 text-right font-semibold">Start Balance</th>
                                <th className="px-2 py-1.5 text-right font-semibold">Session Target</th>
                                <th className="px-2 py-1.5 text-right font-semibold">Actual Profit</th>
                                <th className="px-2 py-1.5 text-right font-semibold">Actual Balance</th>
                                <th className="px-2 py-1.5 text-right font-semibold">Trades</th>
                                <th className="px-2 py-1.5 text-right font-semibold">Wins</th>
                                <th className="px-2 py-1.5 text-right font-semibold">Losses</th>
                                <th className="px-2 py-1.5 text-right font-semibold">Win Rate</th>
                                <th className="px-2 py-1.5 text-center font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.sessions.map(s => (
                                <tr key={s.session} className={cn('border-b', isDark ? 'border-white/5' : 'border-gray-100')}>
                                  <td className={cn('px-2 py-1.5 font-bold', isDark ? 'text-white' : 'text-gray-800')}>S{s.session}</td>
                                  <td className={cn('px-2 py-1.5 text-right tabular-nums', td)}>{s.startBalance.toFixed(2)}</td>
                                  <td className={cn('px-2 py-1.5 text-right tabular-nums', td)}>{s.sessionTarget.toFixed(2)}</td>
                                  <td className={cn('px-2 py-1.5 text-right tabular-nums font-bold',
                                    s.actualProfit > 0 ? 'text-green-500' : s.actualProfit < 0 ? 'text-red-500' : td)}>
                                    {s.actualProfit > 0 ? '+' : ''}{s.actualProfit.toFixed(2)}
                                  </td>
                                  <td className={cn('px-2 py-1.5 text-right tabular-nums', td)}>{s.actualBalance.toFixed(2)}</td>
                                  <td className={cn('px-2 py-1.5 text-right tabular-nums', td)}>{s.trades}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-green-500">{s.wins}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-red-500">{s.losses}</td>
                                  <td className={cn('px-2 py-1.5 text-right tabular-nums', td)}>{s.winRate.toFixed(0)}%</td>
                                  <td className="px-2 py-1.5 text-center">
                                    <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold uppercase',
                                      s.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                      s.status === 'target' ? 'bg-blue-500/20 text-blue-400' :
                                      s.status === 'loss' ? 'bg-red-500/20 text-red-400' :
                                      isDark ? 'bg-white/5 text-slate-400' : 'bg-gray-100 text-gray-400')}>
                                      {s.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
