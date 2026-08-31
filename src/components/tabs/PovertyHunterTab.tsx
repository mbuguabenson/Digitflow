import { useState, useEffect, useRef, useMemo } from 'react';
import { Bot, Play, Square, Target, Loader2, TrendingDown, TrendingUp, Radar, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Account, TradeResult } from '@/hooks/useDerivAuth';
import type { SymbolInfo } from '@/hooks/useDerivTicks';
import { usePovertyScanner } from '@/hooks/usePovertyScanner';
import { Line } from 'react-chartjs-2';

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
  activeSymbol: string;
  symbols: SymbolInfo[];
  onSymbolChange: (symbol: string) => void;
  digits: number[];
  currentDigit: number;
  currentQuote: number;
};

type BotState = 'IDLE' | 'ANALYZING_DIFFERS' | 'WAITING_DIFFERS_TRIGGER' | 'COUNTING_TICKS' | 'TRADING_DIFFERS' | 'RECOVERY_ANALYSIS' | 'WAITING_RECOVERY_TRIGGER' | 'TRADING_RECOVERY';

export function PovertyHunterTab({
  account, placeTrade, watchContract, refreshBalance, isDark,
  onLoginRequest, activeSymbol, symbols, onSymbolChange,
  digits, currentDigit, currentQuote
}: Props) {
  const [isScanning, setIsScanning] = useState(true);
  const { marketStats, bestMarket, isRefreshing } = usePovertyScanner(symbols, isScanning);

  // Auto-switch best market if IDLE or ANALYZING and after runs
  useEffect(() => {
    if (bestMarket && bestMarket !== activeSymbol && (botState === 'IDLE' || botState === 'ANALYZING_DIFFERS') && !isRunning) {
      onSymbolChange(bestMarket);
    }
  }, [bestMarket, activeSymbol, onSymbolChange]); // omitted botState/isRunning intentional for auto-switch logic check elsewhere if running

  // Bot Settings
  const [baseStake, setBaseStake] = useState(1);
  const [takeProfit, setTakeProfit] = useState(10);
  const [stopLoss, setStopLoss] = useState(20);
  const [ticksDuration, setTicksDuration] = useState(1);
  const [bulkPurchase, setBulkPurchase] = useState(6); // Default 6 runs per differs trigger

  const [isRunning, setIsRunning] = useState(false);
  const [sessionProfit, setSessionProfit] = useState(0);
  const [currentStake, setCurrentStake] = useState(baseStake);
  const [botState, setBotState] = useState<BotState>('IDLE');
  
  const [targetDiffersDigit, setTargetDiffersDigit] = useState<number | null>(null);
  const [tickWaitCount, setTickWaitCount] = useState(0);
  const [runCount, setRunCount] = useState(0); // Current sequential runs

  // Recovery Settings
  const [recoverySignal, setRecoverySignal] = useState<'UNDER' | 'OVER' | null>(null);
  const [recoveryMultiplier, setRecoveryMultiplier] = useState(2.0); // Starts at 2.0, moves to 2.6 on subsequent losses

  const last60 = digits.slice(-60);
  const last50 = digits.slice(-50);
  const last15 = digits.slice(-15);
  const last10 = digits.slice(-10);

  // Stats calculation for both Differs and Over/Under
  const stats = useMemo(() => {
    // Differs stats (last 60)
    const counts = Array(10).fill(0);
    for (const d of last60) counts[d]++;
    const sorted = [...counts].sort((a, b) => b - a);
    const maxCount = sorted[0];
    const secondMax = sorted[1];
    const minCount = sorted[9];
    
    let target = null;
    const excluded = new Set([0, 1, 8, 9]);
    for (let d = 0; d <= 9; d++) {
      if (counts[d] === maxCount || counts[d] === secondMax || counts[d] === minCount) excluded.add(d);
    }
    for (let d = 2; d <= 7; d++) {
      if (!excluded.has(d) && counts[d] <= 5) {
        const count15 = last15.filter(x => x === d).length;
        if (count15 <= 3) {
          target = d;
          break; // Grab first valid
        }
      }
    }

    // Over/Under Elite stats (last 50)
    let under0to4 = 0, over5to9 = 0;
    let under0to5 = 0, over4to9 = 0;
    let maxOverDigit = -1, maxUnderDigit = -1;

    for (const d of last50) {
      if (d <= 4) under0to4++;
      if (d >= 5) over5to9++;
      if (d <= 5) under0to5++;
      if (d >= 4) over4to9++;
      if (d >= 5 && d > maxOverDigit) maxOverDigit = d;
      if (d <= 4 && d > maxUnderDigit) maxUnderDigit = d;
    }

    let recentUnder = 0, recentOver = 0;
    for (const d of last10) {
      if (d <= 4) recentUnder++;
      if (d >= 5) recentOver++;
    }

    const underThreshold = (under0to4 / 50) * 100;
    const overThreshold = (over5to9 / 50) * 100;

    return {
      counts, maxCount, secondMax, minCount, excluded, target,
      under0to4, over5to9, under0to5, over4to9,
      underThreshold, overThreshold,
      recentUnder, recentOver,
      maxOverDigit, maxUnderDigit
    };
  }, [last60, last50, last15, last10]);

  // Main Bot Loop
  const placingRef = useRef(false);
  const isRunningRef = useRef(isRunning);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  useEffect(() => {
    if (!isRunningRef.current || placingRef.current || !account) return;

    if (sessionProfit >= takeProfit) {
      setIsRunning(false); setBotState('IDLE');
      alert(`Take Profit reached: +$${sessionProfit.toFixed(2)}`); return;
    }
    if (sessionProfit <= -stopLoss) {
      setIsRunning(false); setBotState('IDLE');
      alert(`Stop Loss reached: -$${Math.abs(sessionProfit).toFixed(2)}`); return;
    }

    // --- RECOVERY MODE ---
    if (botState === 'RECOVERY_ANALYSIS') {
      let sig: 'UNDER' | 'OVER' | null = null;
      if (stats.underThreshold >= 55 && stats.recentUnder >= 7) sig = 'UNDER';
      else if (stats.overThreshold >= 55 && stats.recentOver >= 7) sig = 'OVER';
      
      if (sig) {
        setRecoverySignal(sig);
        setBotState('WAITING_RECOVERY_TRIGGER');
      }
      return;
    }

    if (botState === 'WAITING_RECOVERY_TRIGGER') {
      if (!recoverySignal) {
        setBotState('RECOVERY_ANALYSIS');
        return;
      }
      let trigger = false;
      if (recoverySignal === 'UNDER' && currentDigit >= 5 && currentDigit === stats.maxOverDigit) trigger = true;
      if (recoverySignal === 'OVER' && currentDigit <= 4 && currentDigit === stats.maxUnderDigit) trigger = true;
      
      if (trigger) {
        executeRecoveryTrade(recoverySignal);
      }
      return;
    }

    // --- DIFFERS MODE ---
    if (botState === 'IDLE') {
      setBotState('ANALYZING_DIFFERS');
      return;
    }

    if (botState === 'ANALYZING_DIFFERS') {
      if (stats.target !== null) {
        setTargetDiffersDigit(stats.target);
        setBotState('WAITING_DIFFERS_TRIGGER');
      } else {
        // Condition not met, maybe switch market if we've been waiting too long.
        // For simplicity, auto-switch to bestMarket if available
        if (bestMarket && bestMarket !== activeSymbol) {
           onSymbolChange(bestMarket);
        }
      }
      return;
    }

    if (botState === 'WAITING_DIFFERS_TRIGGER') {
      if (stats.target === null || targetDiffersDigit !== stats.target) {
         // Target changed or no longer valid
         setBotState('ANALYZING_DIFFERS');
         return;
      }
      if (currentDigit === targetDiffersDigit) {
        // Trigger digit hit! Start counting 3 ticks.
        setTickWaitCount(1);
        setBotState('COUNTING_TICKS');
      }
      return;
    }

    if (botState === 'COUNTING_TICKS') {
      if (currentDigit === targetDiffersDigit) {
        // Digit reappeared! Abort and re-analyze
        setBotState('ANALYZING_DIFFERS');
        setTickWaitCount(0);
        return;
      }
      if (tickWaitCount >= 3) {
        // Success! Execute Differs trade
        setTickWaitCount(0);
        executeDiffersTrade(targetDiffersDigit!);
      } else {
        setTickWaitCount(c => c + 1);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDigit, stats]);

  const executeDiffersTrade = async (target: number) => {
    placingRef.current = true;
    setBotState('TRADING_DIFFERS');
    
    try {
      const res = await placeTrade({
        symbol: activeSymbol,
        contractType: 'DIGITDIFF',
        barrier: String(target),
        amount: currentStake,
        duration: ticksDuration,
        durationUnit: 't'
      });
      
      if (res.success && res.contractId && watchContract) {
        const unwatch = watchContract(String(res.contractId), (data) => {
          if (data.is_sold) {
            unwatch();
            const profit = Number(data.profit);
            setSessionProfit(p => p + profit);
            if (refreshBalance) refreshBalance();
            placingRef.current = false;

            if (profit > 0) {
              const newRunCount = runCount + 1;
              if (newRunCount >= bulkPurchase) { // Using bulkPurchase as max runs per cycle
                setRunCount(0);
                setBotState('ANALYZING_DIFFERS'); // Re-analyze after cycle
              } else {
                setRunCount(newRunCount);
                executeDiffersTrade(target); // Sequential bulk execution
              }
            } else {
              // Loss occurred! Switch to Recovery mode
              setRunCount(0);
              setCurrentStake(s => Number((s * 2.0).toFixed(2))); // Initial loss multiplier is 2.0
              setRecoveryMultiplier(2.6); // Setup subsequent martingale to 2.6
              setBotState('RECOVERY_ANALYSIS');
            }
          }
        });
      } else {
        placingRef.current = false;
        setBotState('ANALYZING_DIFFERS');
      }
    } catch {
      placingRef.current = false;
      setBotState('ANALYZING_DIFFERS');
    }
  };

  const executeRecoveryTrade = async (signal: 'UNDER' | 'OVER') => {
    placingRef.current = true;
    setBotState('TRADING_RECOVERY');
    
    try {
      const contractType = signal === 'UNDER' ? 'DIGITUNDER' : 'DIGITOVER';
      // Poverty Hunter uses Over 2 (barrier 2) and Under 8 (barrier 8)
      const barrier = signal === 'UNDER' ? '8' : '2';
      
      const res = await placeTrade({
        symbol: activeSymbol,
        contractType,
        barrier,
        amount: currentStake,
        duration: ticksDuration,
        durationUnit: 't'
      });
      
      if (res.success && res.contractId && watchContract) {
        const unwatch = watchContract(String(res.contractId), (data) => {
          if (data.is_sold) {
            unwatch();
            const profit = Number(data.profit);
            setSessionProfit(p => p + profit);
            if (refreshBalance) refreshBalance();
            placingRef.current = false;

            if (profit > 0) {
              // Recovered! Back to Differs mode with base stake
              setCurrentStake(baseStake);
              setBotState('ANALYZING_DIFFERS');
            } else {
              // Loss again in recovery! Martingale and keep trying
              setCurrentStake(s => Number((s * recoveryMultiplier).toFixed(2)));
              setBotState('RECOVERY_ANALYSIS');
            }
          }
        });
      } else {
        placingRef.current = false;
        setBotState('RECOVERY_ANALYSIS');
      }
    } catch {
      placingRef.current = false;
      setBotState('RECOVERY_ANALYSIS');
    }
  };

  // UI Setup
  const synthetics = symbols.filter(s => s.market === 'synthetic_index');
  const marketList = Array.from(marketStats.values());

  const chartData = {
    labels: last50.map((_, i) => i),
    datasets: [{
      label: 'Digit',
      data: last50,
      borderColor: '#8B8FEA',
      backgroundColor: '#8B8FEA',
      pointBackgroundColor: '#8B8FEA',
      pointBorderColor: '#8B8FEA',
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2,
      tension: 0.4,
      fill: false,
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { 
      y: { display: false, min: -1, max: 11 }, 
      x: { display: false } 
    },
    plugins: { 
      legend: { display: false },
      datalabels: {
        color: '#14b8a6',
        align: 'top',
        anchor: 'end',
        offset: 4,
        font: { weight: 'bold', size: 13 },
        formatter: (value: number) => value
      }
    },
    layout: { padding: { top: 20, bottom: 10, left: 10, right: 10 } },
    animation: { duration: 0 }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-140px)]">
      {/* Sidebar - Market Scanner */}
      <div className={cn(
        "w-full lg:w-1/4 rounded-xl border flex flex-col h-full overflow-hidden",
        isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100"
      )}>
        <div className="p-3 border-b border-white/5 flex items-center justify-between">
          <h3 className={cn("text-sm font-bold flex items-center gap-2", isDark ? "text-slate-200" : "text-[#1a2a4a]")}>
            <Radar className="w-4 h-4 text-purple-500" /> Scanner
          </h3>
          {isRefreshing && <Loader2 className="w-4 h-4 animate-spin text-purple-500" />}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {marketList.map(m => {
            const isSelected = activeSymbol === m.symbol;
            return (
              <button
                key={m.symbol}
                onClick={() => onSymbolChange(m.symbol)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border transition-all",
                  isSelected 
                    ? "border-purple-500 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                    : isDark ? "border-white/5 bg-white/5 hover:bg-white/10" : "border-purple-100 hover:bg-purple-50"
                )}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className={cn("text-xs font-bold", isDark ? "text-slate-200" : "text-gray-800")}>{m.name}</span>
                  <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-mono">{m.lastPrice.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className={cn("font-semibold", m.isEligible ? "text-green-500" : "text-gray-500")}>
                    {m.isEligible ? `Target: ${m.targetDigit}` : 'No Target'}
                  </span>
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-purple-600 text-white font-bold text-[10px]">
                    {m.lastDigit}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 pb-4">
        {/* Header Stats */}
        <div className={cn(
          "rounded-xl border p-4 flex justify-between items-center",
          isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100"
        )}>
          <div>
            <h2 className={cn("text-lg font-bold", isDark ? "text-white" : "text-gray-900")}>
              {synthetics.find(s => s.symbol === activeSymbol)?.display_name || activeSymbol}
            </h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
              <span>Price: <span className="font-mono font-bold text-purple-400">{currentQuote}</span></span>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-400 mb-1">Last Digit</span>
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-purple-600 text-white font-bold text-lg shadow-lg shadow-purple-500/40">
              {currentDigit}
            </div>
          </div>
        </div>

        {/* 0-9 Digit Analysis Grid */}
        <div className={cn(
          "rounded-xl border p-4",
          isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100"
        )}>
          <h3 className={cn("text-xs font-bold uppercase tracking-wider mb-3", isDark ? "text-slate-400" : "text-gray-500")}>
            Digit Statistics (Last 60 Ticks)
          </h3>
          <div className="flex justify-between gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
              const count = stats.counts[d];
              const isEdge = [0, 1, 8, 9].includes(d);
              const isExcluded = stats.excluded.has(d);
              const isTarget = stats.target === d;
              
              let badge = '';
              if (count === stats.maxCount) badge = 'Highest';
              else if (count === stats.secondMax) badge = '2nd High';
              else if (count === stats.minCount) badge = 'Lowest';

              return (
                <div key={d} className={cn(
                  "flex-1 flex flex-col items-center p-2 rounded-lg border transition-all",
                  isTarget ? "border-purple-500 bg-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.3)]" :
                  isExcluded ? "opacity-40 grayscale" : "border-white/5 bg-white/5"
                )}>
                  <span className={cn("text-lg font-bold", isTarget ? "text-purple-400" : "text-gray-400")}>{d}</span>
                  <span className="text-xs font-mono">{count}</span>
                  <span className="text-[9px] text-gray-500 h-3 text-center">{badge}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart & Bot Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={cn(
            "col-span-2 rounded-xl border p-4 h-64 flex flex-col",
            isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100"
          )}>
            <Line 
              data={chartData} 
              options={chartOptions as any} 
            />
          </div>

          <div className={cn(
            "rounded-xl border p-4 flex flex-col justify-center items-center text-center relative overflow-hidden",
            isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100",
            botState.includes('RECOVERY') ? "border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.1)]" : ""
          )}>
            {!botState.includes('RECOVERY') ? (
              <>
                <Target className={cn("w-8 h-8 mb-2", botState === 'WAITING_DIFFERS_TRIGGER' ? "text-purple-500 animate-pulse" : "text-gray-400")} />
                <h4 className={cn("text-sm font-bold", isDark ? "text-white" : "text-gray-900")}>Differs Target</h4>
                <div className={cn("text-4xl font-black my-2", targetDiffersDigit !== null ? "text-purple-500 drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]" : "text-gray-600")}>
                  {targetDiffersDigit !== null ? targetDiffersDigit : '-'}
                </div>
                {botState === 'COUNTING_TICKS' && (
                  <div className="text-xs font-bold text-purple-400 bg-purple-500/20 px-3 py-1 rounded-full">
                    Waiting 3 ticks ({tickWaitCount}/3)
                  </div>
                )}
                {botState === 'TRADING_DIFFERS' && (
                  <div className="text-xs font-bold text-blue-400 bg-blue-500/20 px-3 py-1 rounded-full">
                    Trading (Run {runCount + 1}/{bulkPurchase})
                  </div>
                )}
              </>
            ) : (
              <>
                <ShieldAlert className="w-8 h-8 mb-2 text-orange-500 animate-pulse" />
                <h4 className="text-sm font-bold text-orange-500">Recovery Mode</h4>
                <p className="text-xs text-orange-400/80 mb-2">Over 2 / Under 8</p>
                <div className="flex gap-4 mt-2">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-500">Max Over</span>
                    <span className="text-lg font-bold text-orange-400">{stats.maxOverDigit !== -1 ? stats.maxOverDigit : '-'}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-500">Max Under</span>
                    <span className="text-lg font-bold text-blue-400">{stats.maxUnderDigit !== -1 ? stats.maxUnderDigit : '-'}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Over/Under Stats (Always visible for transparency) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={cn("rounded-xl border p-4", isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100")}>
              <h3 className={cn("text-xs font-bold uppercase tracking-wider mb-3", isDark ? "text-slate-400" : "text-gray-500")}>Threshold (0-4 vs 5-9)</h3>
              <div className="flex justify-between mb-1"><span className="text-sm font-semibold text-blue-500">Under 0-4</span><span className="text-sm font-bold">{stats.underThreshold.toFixed(1)}%</span></div>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-3"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${stats.underThreshold}%` }} /></div>
              <div className="flex justify-between mb-1"><span className="text-sm font-semibold text-orange-500">Over 5-9</span><span className="text-sm font-bold">{stats.overThreshold.toFixed(1)}%</span></div>
              <div className="w-full bg-white/10 rounded-full h-1.5"><div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${stats.overThreshold}%` }} /></div>
            </div>
            <div className={cn("rounded-xl border p-4", isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100")}>
              <h3 className={cn("text-xs font-bold uppercase tracking-wider mb-3", isDark ? "text-slate-400" : "text-gray-500")}>Overlap Stats (0-5 vs 4-9)</h3>
              <div className="flex justify-between mb-2"><span className="text-sm font-semibold text-blue-500">Under 0-5</span><span className="text-sm font-bold">{stats.under0to5} / 50</span></div>
              <div className="flex justify-between"><span className="text-sm font-semibold text-orange-500">Over 4-9</span><span className="text-sm font-bold">{stats.over4to9} / 50</span></div>
            </div>
        </div>

        {/* Bot Controls */}
        <div className={cn(
          "rounded-xl border p-4",
          isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100"
        )}>
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Bot className={cn("w-5 h-5", isRunning ? "text-green-500 animate-pulse" : "text-gray-400")} />
              <span className={cn("text-sm font-bold", isDark ? "text-white" : "text-gray-900")}>Poverty Hunter Engine</span>
              <span className={cn(
                "ml-2 text-[10px] px-2 py-0.5 rounded font-bold",
                botState === 'IDLE' ? "bg-gray-500/20 text-gray-400" :
                botState.includes('RECOVERY') ? "bg-orange-500/20 text-orange-400" :
                "bg-purple-500/20 text-purple-400"
              )}>
                {botState}
              </span>
            </div>
            <div className="flex gap-2">
              {!account ? (
                <button onClick={onLoginRequest} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-500 text-white">Login to Trade</button>
              ) : (
                <button
                  onClick={() => setIsRunning(!isRunning)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                    isRunning ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-green-500 hover:bg-green-600 text-white"
                  )}
                >
                  {isRunning ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                  {isRunning ? 'Stop Bot' : 'Start Bot'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Stake ($)</label>
              <input type="number" min="0.35" step="0.01" value={baseStake} onChange={e => setBaseStake(Number(e.target.value))} disabled={isRunning} className="w-full rounded bg-transparent border border-white/10 px-2 py-1 text-sm outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Take Profit ($)</label>
              <input type="number" min="1" step="1" value={takeProfit} onChange={e => setTakeProfit(Number(e.target.value))} disabled={isRunning} className="w-full rounded bg-transparent border border-white/10 px-2 py-1 text-sm outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Stop Loss ($)</label>
              <input type="number" min="1" step="1" value={stopLoss} onChange={e => setStopLoss(Number(e.target.value))} disabled={isRunning} className="w-full rounded bg-transparent border border-white/10 px-2 py-1 text-sm outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Ticks</label>
              <input type="number" min="1" max="10" step="1" value={ticksDuration} onChange={e => setTicksDuration(Number(e.target.value))} disabled={isRunning} className="w-full rounded bg-transparent border border-white/10 px-2 py-1 text-sm outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Bulk Purchase</label>
              <input type="number" min="1" max="10" step="1" value={bulkPurchase} onChange={e => setBulkPurchase(Number(e.target.value))} disabled={isRunning} className="w-full rounded bg-transparent border border-white/10 px-2 py-1 text-sm outline-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

