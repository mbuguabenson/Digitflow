import { useState, useEffect, useRef, useMemo } from 'react';
import { Bot, Play, Square, Settings, TrendingUp, TrendingDown, Target, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Account, TradeResult } from '@/hooks/useDerivAuth';
import type { SymbolInfo } from '@/hooks/useDerivTicks';
import { useEliteScanner } from '@/hooks/useEliteScanner';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

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

export function EliteProTab({
  account, placeTrade, watchContract, refreshBalance, isDark,
  onLoginRequest, activeSymbol, symbols, onSymbolChange,
  digits, currentDigit, currentQuote
}: Props) {
  // Scanner
  const [isScanning, setIsScanning] = useState(true);
  const { marketStats, bestMarket, isRefreshing } = useEliteScanner(symbols, isScanning);

  // Auto-select best market
  useEffect(() => {
    if (bestMarket && bestMarket !== activeSymbol) {
      onSymbolChange(bestMarket);
    }
  }, [bestMarket, activeSymbol, onSymbolChange]);

  // Bot Settings
  const [stake, setStake] = useState(1);
  const [takeProfit, setTakeProfit] = useState(5);
  const [stopLoss, setStopLoss] = useState(10);
  const [martingale, setMartingale] = useState(2.6);
  const [ticksDuration, setTicksDuration] = useState(1);
  
  const [isRunning, setIsRunning] = useState(false);
  const [sessionProfit, setSessionProfit] = useState(0);
  const [currentStake, setCurrentStake] = useState(stake);
  const [botState, setBotState] = useState<'IDLE' | 'ANALYZING' | 'WAITING_TRIGGER' | 'TRADING'>('IDLE');
  const [signalDirection, setSignalDirection] = useState<'UNDER' | 'OVER' | null>(null);

  // Analysis state
  const last50 = digits.slice(-50);
  const last10 = digits.slice(-10);

  const stats = useMemo(() => {
    let under0to4 = 0;
    let over5to9 = 0;
    let under0to5 = 0;
    let over4to9 = 0;

    for (const d of last50) {
      if (d <= 4) under0to4++;
      if (d >= 5) over5to9++;
      if (d <= 5) under0to5++;
      if (d >= 4) over4to9++;
    }
    
    let recentUnder = 0;
    let recentOver = 0;
    for (const d of last10) {
      if (d <= 4) recentUnder++;
      if (d >= 5) recentOver++;
    }

    const underThreshold = (under0to4 / 50) * 100;
    const overThreshold = (over5to9 / 50) * 100;
    
    let maxOverDigit = -1;
    let maxUnderDigit = -1;
    for (const d of last50) {
      if (d >= 5 && d > maxOverDigit) maxOverDigit = d;
      if (d <= 4 && d > maxUnderDigit) maxUnderDigit = d;
    }

    return {
      under0to4, over5to9, under0to5, over4to9,
      underThreshold, overThreshold,
      recentUnder, recentOver,
      maxOverDigit, maxUnderDigit
    };
  }, [last50, last10]);

  // Bot logic
  const isRunningRef = useRef(isRunning);
  const placingRef = useRef(false);
  
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  useEffect(() => {
    if (!isRunningRef.current || placingRef.current) return;
    if (!account) return;

    if (sessionProfit >= takeProfit) {
      setIsRunning(false);
      setBotState('IDLE');
      alert(`Take Profit reached: +$${sessionProfit.toFixed(2)}`);
      return;
    }
    if (sessionProfit <= -stopLoss) {
      setIsRunning(false);
      setBotState('IDLE');
      alert(`Stop Loss reached: -$${Math.abs(sessionProfit).toFixed(2)}`);
      return;
    }

    // 1. Analyze
    let targetSignal: 'UNDER' | 'OVER' | null = null;
    
    if (stats.underThreshold >= 55 && stats.recentUnder >= 7) {
      targetSignal = 'UNDER';
    } else if (stats.overThreshold >= 55 && stats.recentOver >= 7) {
      targetSignal = 'OVER';
    }

    if (!targetSignal) {
      setBotState('ANALYZING');
      setSignalDirection(null);
      return;
    }

    setSignalDirection(targetSignal);
    setBotState('WAITING_TRIGGER');

    // 2. Trigger
    let triggerHit = false;
    if (targetSignal === 'UNDER') {
      // For under, wait for highest entry digit in over to appear
      if (currentDigit >= 5 && currentDigit === stats.maxOverDigit) {
        triggerHit = true;
      }
    } else {
      // For over, wait for highest entry digit in under to appear
      if (currentDigit <= 4 && currentDigit === stats.maxUnderDigit) { // Or maybe just lowest digit? We'll use maxUnderDigit as prompt said "highest entry digit in under"
        triggerHit = true;
      }
    }

    if (triggerHit) {
      executeTrade(targetSignal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDigit, stats]);

  const executeTrade = async (signal: 'UNDER' | 'OVER') => {
    placingRef.current = true;
    setBotState('TRADING');
    
    try {
      const contractType = signal === 'UNDER' ? 'DIGITUNDER' : 'DIGITOVER';
      // Under 6 means prediction is 6, Over 3 means prediction is 3
      const barrier = signal === 'UNDER' ? '6' : '3';
      
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
            if (profit > 0) {
              setCurrentStake(stake);
            } else {
              setCurrentStake(s => Number((s * martingale).toFixed(2)));
            }
            if (refreshBalance) refreshBalance();
            placingRef.current = false;
            setBotState('ANALYZING');
          }
        });
      } else {
        placingRef.current = false;
        setBotState('ANALYZING');
      }
    } catch {
      placingRef.current = false;
      setBotState('ANALYZING');
    }
  };

  // Chart data
  const chartData = {
    labels: last50.map((_, i) => i),
    datasets: [{
      label: 'Digit',
      data: last50,
      borderColor: isDark ? '#3b82f6' : '#2563eb',
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.1)',
      tension: 0.4,
      fill: true,
    }]
  };
  
  const synthetics = symbols.filter(s => s.market === 'synthetic_index');
  const marketList = Array.from(marketStats.values());

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-140px)]">
      {/* Left Sidebar - Market List */}
      <div className={cn(
        "w-full lg:w-1/4 rounded-xl border flex flex-col h-full overflow-hidden",
        isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100"
      )}>
        <div className="p-3 border-b border-white/5 flex items-center justify-between">
          <h3 className={cn("text-sm font-bold", isDark ? "text-slate-200" : "text-[#1a2a4a]")}>
            Market Scanner
          </h3>
          {isRefreshing && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
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
                    ? "border-blue-500 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                    : isDark ? "border-white/5 bg-white/5 hover:bg-white/10" : "border-blue-100 hover:bg-blue-50"
                )}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className={cn("text-xs font-bold", isDark ? "text-slate-200" : "text-gray-800")}>{m.name}</span>
                  <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-mono">{m.lastPrice.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-gray-400">Strength: {m.trendStrength}</span>
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold text-[10px]">
                    {m.lastDigit}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Content */}
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
              <span>Price: <span className="font-mono font-bold text-blue-400">{currentQuote}</span></span>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-400 mb-1">Last Digit</span>
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold text-lg shadow-lg shadow-orange-500/40">
              {currentDigit}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Chart */}
          <div className={cn(
            "rounded-xl border p-4 h-64",
            isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100"
          )}>
            <Line 
              data={chartData} 
              options={{ 
                responsive: true, maintainAspectRatio: false,
                scales: { 
                  y: { min: 0, max: 9, ticks: { stepSize: 1 } },
                  x: { display: false } 
                },
                plugins: { legend: { display: false } },
                animation: { duration: 0 }
              }} 
            />
          </div>
          
          {/* Stats Analysis */}
          <div className="flex flex-col gap-4">
            {/* Threshold Card */}
            <div className={cn(
              "flex-1 rounded-xl border p-4",
              isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100"
            )}>
              <h3 className={cn("text-xs font-bold uppercase tracking-wider mb-3", isDark ? "text-slate-400" : "text-gray-500")}>
                Threshold (0-4 vs 5-9)
              </h3>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-blue-500">Under 0-4</span>
                <span className="text-sm font-bold">{stats.underThreshold.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-4">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${stats.underThreshold}%` }} />
              </div>

              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-orange-500">Over 5-9</span>
                <span className="text-sm font-bold">{stats.overThreshold.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5">
                <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${stats.overThreshold}%` }} />
              </div>
            </div>

            {/* Digits 0-5 vs 4-9 Card */}
            <div className={cn(
              "flex-1 rounded-xl border p-4",
              isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100"
            )}>
              <h3 className={cn("text-xs font-bold uppercase tracking-wider mb-3", isDark ? "text-slate-400" : "text-gray-500")}>
                Overlap Stats (0-5 vs 4-9)
              </h3>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-blue-500">Under 0-5</span>
                <span className="text-sm font-bold">{stats.under0to5} / 50</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-orange-500">Over 4-9</span>
                <span className="text-sm font-bold">{stats.over4to9} / 50</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trigger / Bot Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={cn(
            "col-span-1 rounded-xl border p-4 relative overflow-hidden flex flex-col justify-center items-center text-center",
            isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100",
            botState === 'WAITING_TRIGGER' && "border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]"
          )}>
            <Target className={cn("w-6 h-6 mb-2", botState === 'WAITING_TRIGGER' ? "text-green-500 animate-pulse" : "text-gray-400")} />
            <h4 className={cn("text-sm font-bold", isDark ? "text-white" : "text-gray-900")}>Trigger Digit</h4>
            <p className="text-xs text-gray-400 mb-2">Waiting for max entry digit</p>
            <div className="flex gap-4 w-full justify-center">
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-gray-500 mb-1">Max Over</span>
                <span className={cn("text-lg font-bold", currentDigit === stats.maxOverDigit && "text-orange-500 drop-shadow-[0_0_5px_rgba(249,115,22,0.8)]")}>
                  {stats.maxOverDigit !== -1 ? stats.maxOverDigit : '-'}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-gray-500 mb-1">Max Under</span>
                <span className={cn("text-lg font-bold", currentDigit === stats.maxUnderDigit && "text-blue-500 drop-shadow-[0_0_5px_rgba(59,130,246,0.8)]")}>
                  {stats.maxUnderDigit !== -1 ? stats.maxUnderDigit : '-'}
                </span>
              </div>
            </div>
          </div>

          <div className={cn(
            "col-span-2 rounded-xl border p-4 flex flex-col",
            isDark ? "bg-[#111736]/50 border-white/5" : "bg-white border-blue-100"
          )}>
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Bot className={cn("w-5 h-5", isRunning ? "text-green-500 animate-pulse" : "text-gray-400")} />
                <span className={cn("text-sm font-bold", isDark ? "text-white" : "text-gray-900")}>Autotrader</span>
                <span className={cn(
                  "ml-2 text-[10px] px-2 py-0.5 rounded font-bold uppercase",
                  botState === 'IDLE' ? "bg-gray-500/20 text-gray-400" :
                  botState === 'TRADING' ? "bg-blue-500/20 text-blue-400 animate-pulse" :
                  botState === 'WAITING_TRIGGER' ? "bg-orange-500/20 text-orange-400" :
                  "bg-green-500/20 text-green-400"
                )}>
                  {botState}
                </span>
                {signalDirection && (
                  <span className={cn(
                    "ml-1 text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1",
                    signalDirection === 'UNDER' ? "bg-blue-500/20 text-blue-400" : "bg-orange-500/20 text-orange-400"
                  )}>
                    {signalDirection === 'UNDER' ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                    {signalDirection}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {!account ? (
                  <button
                    onClick={onLoginRequest}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-all"
                  >
                    Login to Trade
                  </button>
                ) : (
                  <button
                    onClick={() => setIsRunning(!isRunning)}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                      isRunning 
                        ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" 
                        : "bg-green-500 hover:bg-green-600 text-white"
                    )}
                  >
                    {isRunning ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                    {isRunning ? 'Stop Bot' : 'Start Bot'}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">Stake ($)</label>
                <input 
                  type="number" min="0.35" step="0.01"
                  value={stake} onChange={e => setStake(Number(e.target.value))}
                  disabled={isRunning}
                  className={cn(
                    "w-full rounded bg-transparent border px-2 py-1 text-sm outline-none",
                    isDark ? "border-white/10 focus:border-blue-500" : "border-blue-200"
                  )}
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">Martingale</label>
                <input 
                  type="number" min="1" step="0.1"
                  value={martingale} onChange={e => setMartingale(Number(e.target.value))}
                  disabled={isRunning}
                  className={cn(
                    "w-full rounded bg-transparent border px-2 py-1 text-sm outline-none",
                    isDark ? "border-white/10 focus:border-blue-500" : "border-blue-200"
                  )}
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">Take Profit ($)</label>
                <input 
                  type="number" min="1" step="1"
                  value={takeProfit} onChange={e => setTakeProfit(Number(e.target.value))}
                  disabled={isRunning}
                  className={cn(
                    "w-full rounded bg-transparent border px-2 py-1 text-sm outline-none",
                    isDark ? "border-white/10 focus:border-blue-500" : "border-blue-200"
                  )}
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">Stop Loss ($)</label>
                <input 
                  type="number" min="1" step="1"
                  value={stopLoss} onChange={e => setStopLoss(Number(e.target.value))}
                  disabled={isRunning}
                  className={cn(
                    "w-full rounded bg-transparent border px-2 py-1 text-sm outline-none",
                    isDark ? "border-white/10 focus:border-blue-500" : "border-blue-200"
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
