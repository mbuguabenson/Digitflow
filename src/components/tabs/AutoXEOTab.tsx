import { useState, useEffect, useRef, useMemo } from 'react';
import { Bot, Play, Square, Loader2, Radar, ShieldAlert, Zap, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Account, TradeResult } from '@/hooks/useDerivAuth';
import type { SymbolInfo } from '@/hooks/useDerivTicks';
import { useAutoXEoScanner } from '@/hooks/useAutoXEoScanner';
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

type BotState = 'IDLE' | 'ANALYZING_EO' | 'WAITING_EO_TRIGGER' | 'TRADING_EO' | 'RECOVERY_ANALYSIS' | 'WAITING_RECOVERY_TRIGGER' | 'TRADING_RECOVERY';

export function AutoXEOTab({
  account, placeTrade, watchContract, refreshBalance, isDark,
  onLoginRequest, activeSymbol, symbols, onSymbolChange,
  digits, currentDigit, currentQuote
}: Props) {
  const [isScanning, setIsScanning] = useState(true);
  const { marketStats, bestMarket, isRefreshing } = useAutoXEoScanner(symbols, isScanning);

  useEffect(() => {
    if (bestMarket && bestMarket !== activeSymbol && (botState === 'IDLE' || botState === 'ANALYZING_EO') && !isRunning) {
      onSymbolChange(bestMarket);
    }
  }, [bestMarket, activeSymbol, onSymbolChange]);

  const [baseStake, setBaseStake] = useState(1);
  const [takeProfit, setTakeProfit] = useState(10);
  const [stopLoss, setStopLoss] = useState(20);
  const [ticksDuration, setTicksDuration] = useState(1);
  const [bulkPurchase, setBulkPurchase] = useState(6);

  const [isRunning, setIsRunning] = useState(false);
  const [sessionProfit, setSessionProfit] = useState(0);
  const [currentStake, setCurrentStake] = useState(baseStake);
  const [botState, setBotState] = useState<BotState>('IDLE');
  
  const [targetDirection, setTargetDirection] = useState<'EVEN' | 'ODD' | null>(null);
  const [triggerSequence, setTriggerSequence] = useState<number[]>([]);
  const [runCount, setRunCount] = useState(0);

  const [recoverySignal, setRecoverySignal] = useState<'UNDER' | 'OVER' | null>(null);
  const [recoveryMultiplier, setRecoveryMultiplier] = useState(2.0);

  const last60 = digits.slice(-60);
  const last50 = digits.slice(-50);
  const last15 = digits.slice(-15);
  const last10 = digits.slice(-10);

  const stats = useMemo(() => {
    // E/O Stats
    const counts = Array(10).fill(0);
    let evenCount = 0, oddCount = 0;
    for (const d of last60) {
      counts[d]++;
      if (d % 2 === 0) evenCount++; else oddCount++;
    }
    const evenProb = (evenCount / 60) * 100;
    const oddProb = (oddCount / 60) * 100;

    let recentEven = 0, recentOdd = 0;
    for (const d of last15) {
      if (d % 2 === 0) recentEven++; else recentOdd++;
    }

    const sortedDigits = [0,1,2,3,4,5,6,7,8,9].sort((a, b) => counts[b] - counts[a]);
    const max = sortedDigits[0], secondMax = sortedDigits[1], min = sortedDigits[9];

    let target: 'EVEN' | 'ODD' | null = null;
    if (evenProb >= 58 && recentEven >= 10) {
      if ([0,2,4,6,8].filter(d => counts[d] >= 7).length >= 3) {
        if (max % 2 === 0 && secondMax % 2 === 0 && min % 2 !== 0) target = 'EVEN';
      }
    } else if (oddProb >= 58 && recentOdd >= 10) {
      if ([1,3,5,7,9].filter(d => counts[d] >= 7).length >= 3) {
        if (max % 2 !== 0 && secondMax % 2 !== 0 && min % 2 === 0) target = 'ODD';
      }
    }

    // Over/Under Stats
    let under0to4 = 0, over5to9 = 0;
    let under0to5 = 0, over4to9 = 0;
    let maxOverDigit = -1, maxUnderDigit = -1;

    for (const d of last50) {
      if (d <= 4) under0to4++; if (d >= 5) over5to9++;
      if (d <= 5) under0to5++; if (d >= 4) over4to9++;
      if (d >= 5 && d > maxOverDigit) maxOverDigit = d;
      if (d <= 4 && d > maxUnderDigit) maxUnderDigit = d;
    }
    let rUnder = 0, rOver = 0;
    for (const d of last10) {
      if (d <= 4) rUnder++; if (d >= 5) rOver++;
    }
    return {
      counts, evenProb, oddProb, target, max, secondMax, min,
      underThreshold: (under0to4 / 50) * 100,
      overThreshold: (over5to9 / 50) * 100,
      rUnder, rOver, maxOverDigit, maxUnderDigit,
      under0to5, over4to9
    };
  }, [last60, last50, last15, last10]);

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
      if (stats.underThreshold >= 55 && stats.rUnder >= 7) sig = 'UNDER';
      else if (stats.overThreshold >= 55 && stats.rOver >= 7) sig = 'OVER';
      
      if (sig) {
        setRecoverySignal(sig);
        setBotState('WAITING_RECOVERY_TRIGGER');
      }
      return;
    }

    if (botState === 'WAITING_RECOVERY_TRIGGER') {
      if (!recoverySignal) { setBotState('RECOVERY_ANALYSIS'); return; }
      let trigger = false;
      if (recoverySignal === 'UNDER' && currentDigit >= 5 && currentDigit === stats.maxOverDigit) trigger = true;
      if (recoverySignal === 'OVER' && currentDigit <= 4 && currentDigit === stats.maxUnderDigit) trigger = true;
      if (trigger) executeRecoveryTrade(recoverySignal);
      return;
    }

    // --- E/O MODE ---
    if (botState === 'IDLE') {
      setBotState('ANALYZING_EO');
      return;
    }

    if (botState === 'ANALYZING_EO') {
      if (stats.target) {
        setTargetDirection(stats.target);
        setTriggerSequence([]);
        setBotState('WAITING_EO_TRIGGER');
      } else {
        if (bestMarket && bestMarket !== activeSymbol) onSymbolChange(bestMarket);
      }
      return;
    }

    if (botState === 'WAITING_EO_TRIGGER') {
      if (!stats.target || targetDirection !== stats.target) {
         setBotState('ANALYZING_EO'); return;
      }
      
      const newSeq = [...triggerSequence, currentDigit].slice(-3);
      setTriggerSequence(newSeq);

      if (newSeq.length === 3) {
        const [d1, d2, d3] = newSeq;
        if (targetDirection === 'EVEN') {
          // Opposing -> Opposing -> Target (Odd -> Odd -> Even)
          if (d1 % 2 !== 0 && d2 % 2 !== 0 && d3 % 2 === 0) {
            executeEOTrade('DIGITEVEN');
          }
        } else {
          // Even -> Even -> Odd
          if (d1 % 2 === 0 && d2 % 2 === 0 && d3 % 2 !== 0) {
            executeEOTrade('DIGITODD');
          }
        }
      }
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDigit, stats]);

  const executeEOTrade = async (contractType: 'DIGITEVEN' | 'DIGITODD') => {
    placingRef.current = true;
    setBotState('TRADING_EO');
    try {
      const res = await placeTrade({
        symbol: activeSymbol, contractType,
        amount: currentStake, duration: ticksDuration, durationUnit: 't'
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
              const newRun = runCount + 1;
              if (newRun >= bulkPurchase) {
                setRunCount(0); setBotState('ANALYZING_EO');
              } else {
                setRunCount(newRun);
                setTriggerSequence([]); // Reset sequence for next trade
                setBotState('WAITING_EO_TRIGGER'); 
              }
            } else {
              setRunCount(0);
              setCurrentStake(s => Number((s * 2.0).toFixed(2)));
              setRecoveryMultiplier(2.6);
              setBotState('RECOVERY_ANALYSIS');
            }
          }
        });
      } else {
        placingRef.current = false; setBotState('ANALYZING_EO');
      }
    } catch {
      placingRef.current = false; setBotState('ANALYZING_EO');
    }
  };

  const executeRecoveryTrade = async (signal: 'UNDER' | 'OVER') => {
    placingRef.current = true;
    setBotState('TRADING_RECOVERY');
    try {
      const res = await placeTrade({
        symbol: activeSymbol,
        contractType: signal === 'UNDER' ? 'DIGITUNDER' : 'DIGITOVER',
        barrier: signal === 'UNDER' ? '8' : '2',
        amount: currentStake, duration: ticksDuration, durationUnit: 't'
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
              setCurrentStake(baseStake); setBotState('ANALYZING_EO');
            } else {
              setCurrentStake(s => Number((s * recoveryMultiplier).toFixed(2)));
              setBotState('RECOVERY_ANALYSIS');
            }
          }
        });
      } else {
        placingRef.current = false; setBotState('RECOVERY_ANALYSIS');
      }
    } catch {
      placingRef.current = false; setBotState('RECOVERY_ANALYSIS');
    }
  };

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
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] p-2">
      {/* Sidebar - Market Scanner (Glassmorphic) */}
      <div className={cn(
        "w-full lg:w-80 rounded-2xl border flex flex-col h-full overflow-hidden backdrop-blur-md shadow-2xl",
        isDark ? "bg-slate-900/40 border-white/10" : "bg-white/70 border-slate-200"
      )}>
        <div className="p-4 border-b border-inherit flex items-center justify-between">
          <h3 className={cn("text-sm font-bold flex items-center gap-2", isDark ? "text-slate-100" : "text-slate-800")}>
            <Activity className="w-5 h-5 text-blue-500" /> AI Scanner
          </h3>
          {isRefreshing && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {marketList.map(m => {
            const isSelected = activeSymbol === m.symbol;
            return (
              <button
                key={m.symbol}
                onClick={() => onSymbolChange(m.symbol)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border transition-all duration-300",
                  isSelected 
                    ? "border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.15)] scale-[1.02]"
                    : isDark ? "border-white/5 bg-white/5 hover:bg-white/10" : "border-slate-100 bg-white hover:bg-slate-50 shadow-sm"
                )}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className={cn("text-xs font-bold", isDark ? "text-slate-200" : "text-slate-700")}>{m.name}</span>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded font-mono font-bold", isDark ? "bg-black/30" : "bg-slate-100")}>
                    {m.lastPrice.toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <div className="flex gap-2">
                    <span className="text-[10px] font-bold text-blue-400">E: {m.evenProb.toFixed(0)}%</span>
                    <span className="text-[10px] font-bold text-orange-400">O: {m.oddProb.toFixed(0)}%</span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded",
                    m.isEligible ? "bg-green-500/20 text-green-500" : "bg-slate-500/20 text-slate-500"
                  )}>
                    {m.isEligible ? m.targetDirection : 'WAIT'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-4">
        {/* Header */}
        <div className={cn(
          "rounded-2xl border p-6 flex justify-between items-center backdrop-blur-md shadow-xl",
          isDark ? "bg-slate-900/40 border-white/10" : "bg-white/70 border-slate-200"
        )}>
          <div>
            <h2 className={cn("text-2xl font-black tracking-tight", isDark ? "text-white" : "text-slate-900")}>
              {synthetics.find(s => s.symbol === activeSymbol)?.display_name || activeSymbol}
            </h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Current Quote</span>
              <span className="font-mono font-bold text-blue-500 text-lg">{currentQuote}</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-3xl shadow-lg shadow-blue-500/30 ring-4 ring-white/10">
              {currentDigit}
            </div>
          </div>
        </div>

        {/* E/O Progress & Stats */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className={cn(
            "xl:col-span-2 rounded-2xl border p-6 backdrop-blur-md shadow-xl flex flex-col justify-between",
            isDark ? "bg-slate-900/40 border-white/10" : "bg-white/70 border-slate-200"
          )}>
            <div className="mb-6">
              <h3 className={cn("text-xs font-bold uppercase tracking-widest mb-4", isDark ? "text-slate-400" : "text-slate-500")}>Market Dominance (60 Ticks)</h3>
              <div className="flex justify-between mb-2">
                <span className="text-lg font-black text-blue-500">EVEN {stats.evenProb.toFixed(1)}%</span>
                <span className="text-lg font-black text-orange-500">{stats.oddProb.toFixed(1)}% ODD</span>
              </div>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex">
                <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${stats.evenProb}%` }} />
                <div className="bg-orange-500 h-full transition-all duration-500" style={{ width: `${stats.oddProb}%` }} />
              </div>
            </div>

            <div className="flex justify-between gap-2 mt-auto">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
                const count = stats.counts[d];
                const isStrong = count >= 7; // >10.5%
                const isEven = d % 2 === 0;
                let badge = '';
                if (d === stats.max) badge = 'MAX';
                if (d === stats.secondMax) badge = '2ND';
                if (d === stats.min) badge = 'MIN';

                return (
                  <div key={d} className={cn(
                    "flex-1 flex flex-col items-center p-2 rounded-xl border transition-all relative overflow-hidden",
                    isStrong ? (isEven ? "border-blue-500/50 bg-blue-500/10" : "border-orange-500/50 bg-orange-500/10") : "border-white/5 bg-black/10",
                    !isDark && !isStrong && "bg-slate-100 border-slate-200"
                  )}>
                    <span className={cn("text-xl font-black", isEven ? "text-blue-500" : "text-orange-500")}>{d}</span>
                    <span className={cn("text-xs font-bold", isDark ? "text-slate-400" : "text-slate-600")}>{count}</span>
                    {badge && <div className="absolute top-0 right-0 text-[8px] font-black bg-white/20 px-1 rounded-bl">{badge}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={cn(
            "rounded-2xl border p-6 flex flex-col justify-center items-center text-center relative overflow-hidden backdrop-blur-md shadow-xl",
            isDark ? "bg-slate-900/40 border-white/10" : "bg-white/70 border-slate-200",
            botState.includes('RECOVERY') ? "border-orange-500/50 shadow-[0_0_30px_rgba(249,115,22,0.15)]" : ""
          )}>
            {!botState.includes('RECOVERY') ? (
              <>
                <Zap className={cn("w-10 h-10 mb-4", botState === 'WAITING_EO_TRIGGER' ? "text-blue-500 animate-pulse" : "text-slate-500")} />
                <h4 className={cn("text-sm font-bold uppercase tracking-widest", isDark ? "text-slate-300" : "text-slate-600")}>AI Target</h4>
                <div className={cn("text-4xl font-black my-3 tracking-widest", targetDirection ? (targetDirection === 'EVEN' ? 'text-blue-500' : 'text-orange-500') : "text-slate-600")}>
                  {targetDirection || 'WAIT'}
                </div>
                {botState === 'WAITING_EO_TRIGGER' && (
                  <div className="flex gap-2 mt-2">
                    {triggerSequence.map((num, i) => (
                      <div key={i} className={cn("w-8 h-8 flex items-center justify-center rounded-lg font-bold text-white", num % 2 === 0 ? "bg-blue-500" : "bg-orange-500")}>
                        {num}
                      </div>
                    ))}
                    {triggerSequence.length < 3 && Array(3 - triggerSequence.length).fill(0).map((_, i) => (
                      <div key={`e-${i}`} className="w-8 h-8 rounded-lg border-2 border-dashed border-slate-500/30" />
                    ))}
                  </div>
                )}
                {botState === 'TRADING_EO' && (
                  <div className="text-xs font-bold text-white bg-blue-500 px-4 py-1.5 rounded-full mt-2 animate-bounce">
                    Executing Run {runCount + 1}/{bulkPurchase}
                  </div>
                )}
              </>
            ) : (
              <>
                <ShieldAlert className="w-12 h-12 mb-3 text-orange-500 animate-pulse" />
                <h4 className="text-sm font-black text-orange-500 uppercase tracking-widest">Recovery Active</h4>
                <p className="text-xs text-orange-400/80 mb-4 font-bold">OVER 2 / UNDER 8</p>
                <div className="flex gap-6 mt-2">
                  <div className="flex flex-col items-center bg-black/20 p-3 rounded-xl border border-white/5">
                    <span className="text-[10px] text-slate-400 font-bold mb-1">MAX OVER</span>
                    <span className="text-2xl font-black text-orange-500">{stats.maxOverDigit !== -1 ? stats.maxOverDigit : '-'}</span>
                  </div>
                  <div className="flex flex-col items-center bg-black/20 p-3 rounded-xl border border-white/5">
                    <span className="text-[10px] text-slate-400 font-bold mb-1">MAX UNDER</span>
                    <span className="text-2xl font-black text-blue-500">{stats.maxUnderDigit !== -1 ? stats.maxUnderDigit : '-'}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chart & Recovery Sub-Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={cn("col-span-2 rounded-2xl border p-4 h-60 backdrop-blur-md", isDark ? "bg-slate-900/40 border-white/10" : "bg-white/70 border-slate-200")}>
            <Line data={chartData} options={chartOptions as any} />
          </div>
          <div className="flex flex-col gap-4">
            <div className={cn("rounded-2xl border p-5 flex-1 backdrop-blur-md", isDark ? "bg-slate-900/40 border-white/10" : "bg-white/70 border-slate-200")}>
               <h3 className={cn("text-[10px] font-bold uppercase tracking-widest mb-3", isDark ? "text-slate-400" : "text-slate-500")}>O/U Threshold (Recovery)</h3>
               <div className="flex justify-between mb-1"><span className="text-xs font-bold text-blue-500">U 0-4</span><span className="text-xs font-black">{stats.underThreshold.toFixed(1)}%</span></div>
               <div className="w-full bg-black/20 rounded-full h-1.5 mb-4"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${stats.underThreshold}%` }} /></div>
               <div className="flex justify-between mb-1"><span className="text-xs font-bold text-orange-500">O 5-9</span><span className="text-xs font-black">{stats.overThreshold.toFixed(1)}%</span></div>
               <div className="w-full bg-black/20 rounded-full h-1.5"><div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${stats.overThreshold}%` }} /></div>
            </div>
            <div className={cn("rounded-2xl border p-5 flex-1 backdrop-blur-md flex flex-col justify-center", isDark ? "bg-slate-900/40 border-white/10" : "bg-white/70 border-slate-200")}>
               <h3 className={cn("text-[10px] font-bold uppercase tracking-widest mb-3", isDark ? "text-slate-400" : "text-slate-500")}>O/U Overlap (Recovery)</h3>
               <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-blue-500">Under 0-5</span><span className="text-sm font-black">{stats.under0to5}</span></div>
               <div className="flex justify-between items-center"><span className="text-xs font-bold text-orange-500">Over 4-9</span><span className="text-sm font-black">{stats.over4to9}</span></div>
            </div>
          </div>
        </div>

        {/* Bot Controls */}
        <div className={cn(
          "rounded-2xl border p-6 backdrop-blur-md shadow-xl mt-auto",
          isDark ? "bg-slate-900/40 border-white/10" : "bg-white/70 border-slate-200"
        )}>
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <Bot className={cn("w-6 h-6", isRunning ? "text-green-500 animate-pulse" : "text-slate-400")} />
              <span className={cn("text-base font-black tracking-tight", isDark ? "text-white" : "text-slate-900")}>AUTO X ENGINE</span>
              <span className={cn(
                "ml-3 text-[10px] px-3 py-1 rounded-full font-black tracking-widest uppercase shadow-inner",
                botState === 'IDLE' ? "bg-slate-500/20 text-slate-400" :
                botState.includes('RECOVERY') ? "bg-orange-500/20 text-orange-400 border border-orange-500/20" :
                "bg-blue-500/20 text-blue-400 border border-blue-500/20"
              )}>
                {botState}
              </span>
            </div>
            <div className="flex gap-3">
              {!account ? (
                <button onClick={onLoginRequest} className="px-5 py-2 text-xs font-black uppercase tracking-wider rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all">Login to Trade</button>
              ) : (
                <button
                  onClick={() => setIsRunning(!isRunning)}
                  className={cn(
                    "flex items-center gap-2 px-6 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg",
                    isRunning ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/20"
                  )}
                >
                  {isRunning ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  {isRunning ? 'Stop Bot' : 'Start Engine'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">Stake ($)</label>
              <input type="number" min="0.35" step="0.01" value={baseStake} onChange={e => setBaseStake(Number(e.target.value))} disabled={isRunning} className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">Take Profit ($)</label>
              <input type="number" min="1" step="1" value={takeProfit} onChange={e => setTakeProfit(Number(e.target.value))} disabled={isRunning} className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">Stop Loss ($)</label>
              <input type="number" min="1" step="1" value={stopLoss} onChange={e => setStopLoss(Number(e.target.value))} disabled={isRunning} className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">Ticks</label>
              <input type="number" min="1" max="10" step="1" value={ticksDuration} onChange={e => setTicksDuration(Number(e.target.value))} disabled={isRunning} className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">Bulk Purchase</label>
              <input type="number" min="1" max="10" step="1" value={bulkPurchase} onChange={e => setBulkPurchase(Number(e.target.value))} disabled={isRunning} className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 transition-colors" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
