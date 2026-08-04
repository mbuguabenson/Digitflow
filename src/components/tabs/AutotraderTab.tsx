import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Activity, Zap, TrendingUp, TrendingDown, Play, Pause, Square,
  RefreshCw, CheckCircle2, XCircle, Target, Brain, Radar, Shield,
  Layers, ArrowUp, ArrowDown, History, BarChart3, Radio
} from 'lucide-react';
import { useDerivTicks } from '@/hooks/useDerivTicks';
import type { Account, TradeResult } from '@/hooks/useDerivAuth';
import { cn } from '@/lib/utils';
import { 
  analyzeOverUnder, analyzeEvenOdd, analyzeDiffers, evaluateMarkets,
  type StrategyType, type AutotraderSignal 
} from '@/lib/autotrader-engine';
import { TransactionCard } from '@/components/TransactionCard';
import type { Transaction } from '@/lib/trading-engine';

const MARKETS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'];
const MARKET_LABELS: Record<string, string> = {
  R_10: 'Volatility 10',
  R_25: 'Volatility 25',
  R_50: 'Volatility 50',
  R_75: 'Volatility 75',
  R_100: 'Volatility 100',
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

// Hook wrapper for multiple markets
function useMarketScanner() {
  const m10 = useDerivTicks('R_10', 1800);
  const m25 = useDerivTicks('R_25', 1800);
  const m50 = useDerivTicks('R_50', 1800);
  const m75 = useDerivTicks('R_75', 1800);
  const m100 = useDerivTicks('R_100', 1800);
  
  return {
    R_10: m10,
    R_25: m25,
    R_50: m50,
    R_75: m75,
    R_100: m100,
  };
}

export function AutotraderTab({ account, placeTrade, watchContract, refreshBalance, isDark, onLoginRequest }: Props) {
  const [activeStrategies, setActiveStrategies] = useState<Record<StrategyType, boolean>>({
    'over-under': true,
    'even-odd': true,
    'differs': true,
  });
  
  const [stake, setStake] = useState(1);
  const [maxRuns, setMaxRuns] = useState(5);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [botState, setBotState] = useState<'IDLE' | 'SCANNING' | 'TRADING' | 'COOLDOWN' | 'REANALYZING'>('IDLE');
  const [currentRun, setCurrentRun] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // Refs for auto-trading loop
  const isRunningRef = useRef(isBotRunning);
  const placingRef = useRef(false);
  const runCountRef = useRef(currentRun);
  
  const marketsData = useMarketScanner();
  
  // Update refs
  useEffect(() => { isRunningRef.current = isBotRunning; }, [isBotRunning]);
  useEffect(() => { runCountRef.current = currentRun; }, [currentRun]);

  // Generate signals for all enabled strategies across all markets
  const allSignals = useMemo(() => {
    const signals: AutotraderSignal[] = [];
    
    for (const symbol of MARKETS) {
      const data = marketsData[symbol as keyof typeof marketsData];
      const ticks60 = data.digits.slice(-60);
      const ticks1800 = data.digits; // up to 1800
      
      if (activeStrategies['over-under']) signals.push(analyzeOverUnder(ticks60, ticks1800, symbol));
      if (activeStrategies['even-odd']) signals.push(analyzeEvenOdd(ticks60, ticks1800, symbol));
      if (activeStrategies['differs']) signals.push(analyzeDiffers(ticks60, symbol));
    }
    
    return signals;
  }, [marketsData, activeStrategies]);

  const bestSignal = useMemo(() => evaluateMarkets(allSignals), [allSignals]);
  
  // Transaction helpers
  const updateTransaction = useCallback((contractId: string, updates: Partial<Transaction>) => {
    setTransactions(prev => prev.map(t => t.contractId === contractId ? { ...t, ...updates } : t));
  }, []);

  const addTransaction = useCallback((t: Omit<Transaction, 'id' | 'time'>) => {
    setTransactions(prev => [{ ...t, id: Math.random().toString(36).slice(2), time: new Date().toLocaleTimeString() }, ...prev].slice(0, 100));
  }, []);

  // Trading Execution Logic
  const executeTrade = useCallback(async (signal: AutotraderSignal) => {
    if (!account) { onLoginRequest(); setIsBotRunning(false); return; }
    if (placingRef.current) return;
    
    placingRef.current = true;
    setBotState('TRADING');
    
    const tradeStake = stake;
    const result = await placeTrade({
      symbol: signal.market,
      contractType: signal.contractType!,
      barrier: signal.barrier?.toString(),
      amount: tradeStake,
      duration: 1,
      durationUnit: 't',
      basis: 'stake',
    });

    if (result.success && result.contractId) {
      addTransaction({
        symbol: signal.market,
        strategy: signal.strategy,
        side: `${signal.contractType} ${signal.barrier ?? ''}`.trim(),
        stake: tradeStake,
        result: 'pending',
        payout: 0,
        profit: 0,
        contractId: result.contractId,
      });

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
            
            refreshBalance?.();
            placingRef.current = false;
            
            // Increment run count
            const newRunCount = runCountRef.current + 1;
            setCurrentRun(newRunCount);
            
            if (newRunCount >= maxRuns) {
              setBotState('REANALYZING');
              setTimeout(() => {
                setCurrentRun(0);
                if (isRunningRef.current) setBotState('SCANNING');
              }, 5000); // 5 sec pause to reanalyze
            } else {
              setBotState('SCANNING');
            }
          }
        });
      } else {
        placingRef.current = false;
        setBotState('SCANNING');
      }
    } else {
      addTransaction({
        symbol: signal.market,
        strategy: signal.strategy,
        side: `${signal.contractType} ${signal.barrier ?? ''}`.trim(),
        stake: tradeStake,
        result: 'loss',
        payout: 0,
        profit: -tradeStake,
      });
      placingRef.current = false;
      setBotState('SCANNING');
    }
  }, [account, placeTrade, watchContract, refreshBalance, stake, maxRuns, addTransaction, updateTransaction, onLoginRequest]);

  // Main Bot Loop
  useEffect(() => {
    if (!isBotRunning) {
      if (botState !== 'IDLE') setBotState('IDLE');
      return;
    }

    if (botState === 'IDLE') setBotState('SCANNING');
    
    const interval = setInterval(() => {
      if (!isRunningRef.current || placingRef.current) return;
      if (botState === 'REANALYZING') return;

      if (bestSignal && bestSignal.action === 'TRADE') {
        executeTrade(bestSignal);
      } else if (bestSignal && bestSignal.action === 'COOLDOWN') {
        setBotState('COOLDOWN');
      } else {
        setBotState('SCANNING');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isBotRunning, bestSignal, botState, executeTrade]);

  // UI styling
  const cardBg = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';
  const textTitle = isDark ? 'text-white' : 'text-gray-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-gray-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={cn("p-6 rounded-2xl border flex items-center justify-between", cardBg)}>
        <div>
          <h2 className={cn("text-2xl font-bold flex items-center gap-2", textTitle)}>
            <Brain className="w-6 h-6 text-indigo-500" />
            Autotrader Engine
          </h2>
          <p className={textMuted}>Multi-market algorithmic trading bot</p>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1">
            <label className={cn("text-xs font-medium uppercase tracking-wider", textMuted)}>Stake (USD)</label>
            <input 
              type="number" min="0.35" step="0.01" 
              value={stake} onChange={(e) => setStake(Number(e.target.value))}
              className={cn("w-24 px-3 py-2 rounded-lg border bg-transparent outline-none focus:ring-2 focus:ring-blue-500", cardBg, textTitle)}
              disabled={isBotRunning}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={cn("text-xs font-medium uppercase tracking-wider", textMuted)}>Max Runs</label>
            <input 
              type="number" min="1" max="100" 
              value={maxRuns} onChange={(e) => setMaxRuns(Number(e.target.value))}
              className={cn("w-24 px-3 py-2 rounded-lg border bg-transparent outline-none focus:ring-2 focus:ring-blue-500", cardBg, textTitle)}
              disabled={isBotRunning}
            />
          </div>
          
          <button
            onClick={() => setIsBotRunning(!isBotRunning)}
            className={cn(
              "mt-5 flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all",
              isBotRunning ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20" : "bg-indigo-500 hover:bg-indigo-600 shadow-lg shadow-indigo-500/20"
            )}
          >
            {isBotRunning ? (
              <><Square className="w-5 h-5 fill-current" /> Stop Bot</>
            ) : (
              <><Play className="w-5 h-5 fill-current" /> Start Bot</>
            )}
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className={cn("p-4 rounded-xl border flex items-center justify-between", cardBg)}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-3 h-3 rounded-full animate-pulse",
            botState === 'IDLE' ? 'bg-gray-400' :
            botState === 'SCANNING' ? 'bg-blue-500' :
            botState === 'TRADING' ? 'bg-green-500' :
            botState === 'COOLDOWN' ? 'bg-amber-500' : 'bg-purple-500'
          )} />
          <span className={cn("font-medium", textTitle)}>
            {botState === 'IDLE' && 'Bot Idle - Ready to start'}
            {botState === 'SCANNING' && 'Scanning Markets...'}
            {botState === 'TRADING' && `Trading... (Run ${currentRun + 1}/${maxRuns})`}
            {botState === 'COOLDOWN' && 'Market Shifted - Cooldown Mode'}
            {botState === 'REANALYZING' && 'Cycle Complete - Re-analyzing...'}
          </span>
        </div>
        
        {isBotRunning && (
          <div className="flex items-center gap-4 text-sm font-medium">
            <span className={textMuted}>Target Market:</span>
            <span className={cn("text-indigo-400 font-bold")}>{bestSignal?.market ? MARKET_LABELS[bestSignal.market] : 'None'}</span>
            <span className={textMuted}>Target Strategy:</span>
            <span className={cn("text-emerald-400 font-bold uppercase")}>{bestSignal?.strategy ?? 'None'}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scanner Panel */}
        <div className={cn("col-span-1 p-6 rounded-2xl border flex flex-col gap-4", cardBg)}>
          <h3 className={cn("font-semibold flex items-center gap-2", textTitle)}>
            <Radar className="w-5 h-5 text-blue-400" /> Market Scanner
          </h3>
          <div className="flex flex-col gap-2">
            {MARKETS.map(symbol => {
              // Find best signal for this market
              const marketSignals = allSignals.filter(s => s.market === symbol);
              const bestForMarket = [...marketSignals].sort((a,b) => b.confidence - a.confidence)[0];
              
              const isTarget = bestSignal?.market === symbol;
              
              return (
                <div key={symbol} className={cn(
                  "p-3 rounded-xl border flex items-center justify-between transition-colors",
                  isTarget ? "border-indigo-500/50 bg-indigo-500/10" : "border-white/5 bg-black/10"
                )}>
                  <div>
                    <div className={cn("font-medium text-sm", textTitle)}>{MARKET_LABELS[symbol]}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {bestForMarket ? bestForMarket.reason : 'Waiting for ticks...'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={cn(
                      "text-xs font-bold px-2 py-1 rounded-md uppercase",
                      bestForMarket?.action === 'TRADE' ? 'bg-green-500/20 text-green-400' :
                      bestForMarket?.action === 'COOLDOWN' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-gray-500/20 text-gray-400'
                    )}>
                      {bestForMarket?.action ?? 'WAIT'}
                    </span>
                    {bestForMarket && <span className="text-[10px] text-slate-500 mt-1">{bestForMarket.confidence.toFixed(1)}% Conf</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Strategies Panel */}
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Strategy Toggles */}
            <StrategyCard 
              title="Over/Under" desc="Analyzes 60-tick dominant sides" 
              active={activeStrategies['over-under']} 
              onToggle={() => setActiveStrategies(p => ({...p, 'over-under': !p['over-under']}))} 
              isDark={isDark} 
            />
            <StrategyCard 
              title="Even/Odd" desc="Waits for opposing pattern entry" 
              active={activeStrategies['even-odd']} 
              onToggle={() => setActiveStrategies(p => ({...p, 'even-odd': !p['even-odd']}))} 
              isDark={isDark} 
            />
            <StrategyCard 
              title="Differs" desc="Trades the most constant rare digit" 
              active={activeStrategies['differs']} 
              onToggle={() => setActiveStrategies(p => ({...p, 'differs': !p['differs']}))} 
              isDark={isDark} 
            />
          </div>
          
          {/* Recent Trades Log */}
          <div className={cn("flex-1 p-6 rounded-2xl border flex flex-col gap-4 min-h-[300px]", cardBg)}>
            <h3 className={cn("font-semibold flex items-center gap-2", textTitle)}>
              <History className="w-5 h-5 text-emerald-400" /> Live Trading Log
            </h3>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
              {transactions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                  <BarChart3 className="w-8 h-8 opacity-20" />
                  <p>No trades executed yet</p>
                </div>
              ) : (
                transactions.map(t => (
                  <TransactionCard key={t.id} tx={t} isDark={isDark} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategyCard({ title, desc, active, onToggle, isDark }: { title: string; desc: string; active: boolean; onToggle: () => void; isDark: boolean }) {
  const cardBg = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';
  const textTitle = isDark ? 'text-white' : 'text-gray-900';
  
  return (
    <div 
      className={cn(
        "p-4 rounded-xl border cursor-pointer transition-all flex flex-col gap-2",
        cardBg,
        active ? (isDark ? "border-indigo-500/50 bg-indigo-500/10" : "border-indigo-500 bg-indigo-50") : "opacity-60"
      )}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between">
        <span className={cn("font-bold", textTitle)}>{title}</span>
        <div className={cn("w-10 h-6 rounded-full p-1 transition-colors", active ? "bg-indigo-500" : "bg-gray-400")}>
          <div className={cn("w-4 h-4 rounded-full bg-white transition-transform", active ? "translate-x-4" : "translate-x-0")} />
        </div>
      </div>
      <p className="text-xs text-slate-400">{desc}</p>
    </div>
  );
}
