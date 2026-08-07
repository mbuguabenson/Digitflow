import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Activity, Zap, TrendingUp, TrendingDown, Play, Pause, Square,
  RefreshCw, CheckCircle2, XCircle, Target, Brain, Radar, Shield,
  Layers, ArrowUp, ArrowDown, History, BarChart3, Radio, Power, Settings
} from 'lucide-react';
import { useDerivTicks } from '@/hooks/useDerivTicks';
import { useMarketPrices } from '@/hooks/useMarketPrices';
import type { Account, TradeResult } from '@/hooks/useDerivAuth';
import { cn } from '@/lib/utils';
import { 
  analyzeOverUnder, analyzeEvenOdd, analyzeDiffers, evaluateMarkets,
  type StrategyType, type AutotraderSignal 
} from '@/lib/autotrader-engine';
import type { Transaction } from '@/lib/trading-engine';

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

export function AutotraderTab({ account, placeTrade, watchContract, refreshBalance, isDark, onLoginRequest }: Props) {
  const [selectedMarket, setSelectedMarket] = useState<string>('R_100');
  
  // Modes & Config
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [activeStrategies, setActiveStrategies] = useState<Record<StrategyType, boolean>>({
    'over-under': true,
    'even-odd': true,
    'differs': true,
  });
  
  const [baseStake, setBaseStake] = useState(1);
  const [currentStake, setCurrentStake] = useState(1);
  const [martingale, setMartingale] = useState(2.1);
  const [takeProfit, setTakeProfit] = useState(10);
  const [stopLoss, setStopLoss] = useState(20);
  
  const [maxRuns, setMaxRuns] = useState(5);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [botState, setBotState] = useState<'IDLE' | 'SCANNING' | 'TRADING' | 'COOLDOWN' | 'REANALYZING'>('IDLE');
  
  const [currentRun, setCurrentRun] = useState(0);
  const [sessionProfit, setSessionProfit] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // Hooks
  const { prices, markets, status: scannerStatus } = useMarketPrices();
  const { digits, fetchHistory, historyLoading } = useDerivTicks(selectedMarket, 1800);
  
  // Refs for auto-trading loop
  const isRunningRef = useRef(isBotRunning);
  const placingRef = useRef(false);
  
  useEffect(() => { isRunningRef.current = isBotRunning; }, [isBotRunning]);
  useEffect(() => { setCurrentStake(baseStake); }, [baseStake]);

  // Load history on market switch to support the UI / manual trading analysis
  useEffect(() => {
    fetchHistory(1800);
  }, [fetchHistory, selectedMarket]);

  // Stop bot if user changes mode
  useEffect(() => {
    setIsBotRunning(false);
    setBotState('IDLE');
  }, [isAutoMode]);

  // Stop bot if TP/SL hit
  useEffect(() => {
    if (isBotRunning) {
      if (sessionProfit >= takeProfit) {
        setIsBotRunning(false);
        setBotState('IDLE');
        alert(`Take Profit reached: +$${sessionProfit.toFixed(2)}!`);
      } else if (sessionProfit <= -stopLoss) {
        setIsBotRunning(false);
        setBotState('IDLE');
        alert(`Stop Loss reached: -$${Math.abs(sessionProfit).toFixed(2)}!`);
      }
    }
  }, [sessionProfit, takeProfit, stopLoss, isBotRunning]);

  // ─── CROSS-MARKET SCANNING LOGIC ───
  // Calculate signals for ALL markets in the background using `prices` ticks (max 60 length)
  const bestAutoSignal = useMemo(() => {
    if (!isAutoMode || !isBotRunning) return null;
    
    const allSignals: AutotraderSignal[] = [];
    
    for (const m of markets) {
      const marketData = prices[m.symbol];
      if (!marketData || marketData.ticks.length < 60) continue;
      
      const ticks60 = marketData.ticks;
      // We pass ticks60 twice because we don't have 1800 ticks for every market in the background yet
      if (activeStrategies['over-under']) allSignals.push(analyzeOverUnder(ticks60, ticks60, m.symbol));
      if (activeStrategies['even-odd']) allSignals.push(analyzeEvenOdd(ticks60, ticks60, m.symbol));
      if (activeStrategies['differs']) allSignals.push(analyzeDiffers(ticks60, m.symbol));
    }
    
    return evaluateMarkets(allSignals);
  }, [isAutoMode, isBotRunning, markets, prices, activeStrategies]);

  // Generate signals for the UI selected market (Manual / Dashboard view)
  const dashboardSignal = useMemo(() => {
    if (digits.length < 60) return null;
    const ticks60 = digits.slice(-60);
    const ticks1800 = digits;
    
    const signals: AutotraderSignal[] = [];
    if (activeStrategies['over-under']) signals.push(analyzeOverUnder(ticks60, ticks1800, selectedMarket));
    if (activeStrategies['even-odd']) signals.push(analyzeEvenOdd(ticks60, ticks1800, selectedMarket));
    if (activeStrategies['differs']) signals.push(analyzeDiffers(ticks60, selectedMarket));
    
    return evaluateMarkets(signals);
  }, [digits, activeStrategies, selectedMarket]);

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
    
    // Auto-switch UI to the market we are actually trading
    if (signal.market !== selectedMarket) {
      setSelectedMarket(signal.market);
    }
    
    placingRef.current = true;
    if (isAutoMode) setBotState('TRADING');
    
    const tradeStake = currentStake;
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
            
            setSessionProfit(prev => prev + profit);
            setCurrentStake(isWin ? baseStake : tradeStake * martingale);
            refreshBalance?.();
            placingRef.current = false;
            
            if (isAutoMode) {
              const newRunCount = currentRun + 1;
              setCurrentRun(newRunCount);
              
              if (newRunCount >= maxRuns) {
                setBotState('REANALYZING');
                setTimeout(() => {
                  setCurrentRun(0);
                  if (isRunningRef.current) setBotState('SCANNING');
                }, 5000);
              } else {
                setBotState('SCANNING');
              }
            }
          }
        });
      } else {
        placingRef.current = false;
        if (isAutoMode) setBotState('SCANNING');
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
      setSessionProfit(prev => prev - tradeStake);
      setCurrentStake(tradeStake * martingale);
      placingRef.current = false;
      if (isAutoMode) setBotState('SCANNING');
    }
  }, [account, placeTrade, watchContract, refreshBalance, currentStake, baseStake, martingale, maxRuns, currentRun, addTransaction, updateTransaction, onLoginRequest, isAutoMode, selectedMarket]);

  // Main Auto-Bot Loop
  useEffect(() => {
    if (!isAutoMode || !isBotRunning) return;
    if (botState === 'IDLE') setBotState('SCANNING');
    
    const interval = setInterval(() => {
      if (!isRunningRef.current || placingRef.current || botState === 'REANALYZING') return;

      if (bestAutoSignal && bestAutoSignal.action === 'TRADE') {
        executeTrade(bestAutoSignal);
      } else if (bestAutoSignal && bestAutoSignal.action === 'COOLDOWN') {
        setBotState('COOLDOWN');
      } else {
        setBotState('SCANNING');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isBotRunning, isAutoMode, bestAutoSignal, botState, executeTrade]);

  // UI styling
  const cardBg = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';
  const textTitle = isDark ? 'text-white' : 'text-gray-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-gray-500';

  return (
    <div className="space-y-6">
      
      {/* ─── Header & Config ─── */}
      <div className={cn("p-6 rounded-2xl border flex flex-col xl:flex-row xl:items-start justify-between gap-6", cardBg)}>
        <div className="flex-1">
          <h2 className={cn("text-2xl font-bold flex items-center gap-2", textTitle)}>
            <Brain className="w-6 h-6 text-indigo-500" />
            Autotrader Engine
          </h2>
          <p className={textMuted}>Advanced scanning & automated strategy execution</p>
          
          <div className="mt-4 flex items-center gap-2 bg-black/10 w-fit p-1 rounded-xl border border-white/5">
            <button 
              onClick={() => setIsAutoMode(true)}
              className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2", isAutoMode ? "bg-indigo-500 text-white shadow-md" : textMuted)}
            >
              <Power className="w-4 h-4" /> Auto
            </button>
            <button 
              onClick={() => setIsAutoMode(false)}
              className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2", !isAutoMode ? "bg-emerald-500 text-white shadow-md" : textMuted)}
            >
              <Target className="w-4 h-4" /> Manual
            </button>
          </div>
        </div>
        
        {/* Config Inputs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
          <ConfigInput label="Stake (USD)" value={baseStake} onChange={setBaseStake} isDark={isDark} disabled={isBotRunning} step={0.1} />
          <ConfigInput label="Martingale" value={martingale} onChange={setMartingale} isDark={isDark} disabled={isBotRunning} step={0.1} />
          <ConfigInput label="Take Profit" value={takeProfit} onChange={setTakeProfit} isDark={isDark} disabled={isBotRunning} />
          <ConfigInput label="Stop Loss" value={stopLoss} onChange={setStopLoss} isDark={isDark} disabled={isBotRunning} />
        </div>
        
        <div className="flex flex-col items-center justify-center gap-2">
          {isAutoMode && (
            <button
              onClick={() => setIsBotRunning(!isBotRunning)}
              className={cn(
                "relative flex items-center justify-center w-16 h-16 rounded-full font-bold text-white transition-all overflow-hidden",
                isBotRunning ? "bg-indigo-600 shadow-lg shadow-indigo-500/30" : "bg-emerald-500 hover:bg-emerald-600 shadow-lg"
              )}
            >
              {isBotRunning ? (
                <>
                  <div className="absolute inset-0 border-4 border-indigo-400 rounded-full border-t-white animate-spin"></div>
                  <Square className="w-5 h-5 fill-current z-10" />
                </>
              ) : (
                <Play className="w-6 h-6 fill-current ml-1" />
              )}
            </button>
          )}
          {isAutoMode && (
            <span className={cn("text-xs font-bold uppercase tracking-wider", isBotRunning ? "text-indigo-400" : textMuted)}>
              {isBotRunning ? 'Running' : 'Start Auto'}
            </span>
          )}
        </div>
      </div>

      {/* ─── Main Grid: Explorer + Dashboard ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Sidebar: Market Explorer */}
        <div className={cn("col-span-1 p-4 rounded-2xl border flex flex-col gap-4 max-h-[800px]", cardBg)}>
          <div className="flex items-center justify-between pb-2 border-b border-gray-500/20">
            <h3 className={cn("font-semibold flex items-center gap-2", textTitle)}>
              <Radar className="w-5 h-5 text-blue-400" /> Markets
            </h3>
            {scannerStatus === 'connecting' && <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />}
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
            {markets.map(m => {
              const liveData = prices[m.symbol];
              const isSelected = selectedMarket === m.symbol;
              const isOverUnder = activeStrategies['over-under'];
              
              let digitColor = textTitle;
              if (liveData && isOverUnder) {
                digitColor = liveData.digit >= 5 ? 'text-green-500' : 'text-red-500';
              }
              
              return (
                <div 
                  key={m.symbol}
                  onClick={() => !isBotRunning && setSelectedMarket(m.symbol)}
                  className={cn(
                    "p-3 rounded-xl border flex flex-col gap-1 transition-all cursor-pointer",
                    isSelected ? "border-indigo-500 bg-indigo-500/10 shadow-sm" : "border-white/5 bg-black/5 hover:bg-black/10",
                    isBotRunning && !isSelected && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex justify-between items-center">
                    <span className={cn("font-medium text-sm", textTitle)}>{m.display_name}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className={cn("text-xs font-mono", textMuted)}>
                      {liveData ? liveData.price.toFixed(liveData.pipSize) : '---'}
                    </span>
                    <span className={cn("text-lg font-bold font-mono", digitColor)}>
                      {liveData ? liveData.digit : '-'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Dashboard */}
        <div className="col-span-1 lg:col-span-3 flex flex-col gap-6">
          
          {/* Status Bar */}
          <div className={cn("p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4", cardBg)}>
            {isAutoMode ? (
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-3 h-3 rounded-full animate-pulse",
                  botState === 'IDLE' ? 'bg-gray-400' :
                  botState === 'SCANNING' ? 'bg-blue-500' :
                  botState === 'TRADING' ? 'bg-green-500' :
                  botState === 'COOLDOWN' ? 'bg-amber-500' : 'bg-purple-500'
                )} />
                <span className={cn("font-medium", textTitle)}>
                  {botState === 'IDLE' && 'Auto Bot Idle - Ready to scan all markets'}
                  {botState === 'SCANNING' && 'Scanning All Markets...'}
                  {botState === 'TRADING' && `Executing Trade (Run ${currentRun + 1}/${maxRuns})`}
                  {botState === 'COOLDOWN' && 'Market Shifted - Global Cooldown'}
                  {botState === 'REANALYZING' && 'Cycle Complete - Re-analyzing...'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className={cn("font-medium", textTitle)}>Manual Trading - Waiting for your command</span>
              </div>
            )}
            
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium bg-black/10 px-4 py-2 rounded-lg border border-white/5">
              <span className={textMuted}>Session P/L:</span>
              <span className={cn("font-bold", sessionProfit > 0 ? "text-green-500" : sessionProfit < 0 ? "text-red-500" : textTitle)}>
                {sessionProfit > 0 ? '+' : ''}{sessionProfit.toFixed(2)} USD
              </span>
              <span className={textMuted}>Next Stake:</span>
              <span className={textTitle}>{currentStake.toFixed(2)} USD</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StrategyCard title="Over/Under" desc="Trades O1, O2, O3 / U8, U7, U6" active={activeStrategies['over-under']} onToggle={() => setActiveStrategies(p => ({...p, 'over-under': !p['over-under']}))} isDark={isDark} />
            <StrategyCard title="Even/Odd" desc="Trades reversals from trends" active={activeStrategies['even-odd']} onToggle={() => setActiveStrategies(p => ({...p, 'even-odd': !p['even-odd']}))} isDark={isDark} />
            <StrategyCard title="Differs" desc="Trades the most constant rare digit" active={activeStrategies['differs']} onToggle={() => setActiveStrategies(p => ({...p, 'differs': !p['differs']}))} isDark={isDark} />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Active Analysis Panel */}
            <div className={cn("p-6 rounded-2xl border flex flex-col gap-4 min-h-[300px]", cardBg)}>
              <div className="flex items-center justify-between">
                <h3 className={cn("font-semibold flex items-center gap-2", textTitle)}>
                  <Activity className="w-5 h-5 text-purple-400" /> {isAutoMode ? 'Global Scanner Output' : 'Selected Market Analysis'}
                </h3>
              </div>
              
              {historyLoading || digits.length < 60 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin opacity-50 text-indigo-500" />
                  <p>Analyzing ticks...</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Display the active signal based on mode */}
                  {(() => {
                    const signal = isAutoMode ? bestAutoSignal : dashboardSignal;
                    if (!signal) return <div className="flex-1 flex items-center justify-center text-slate-500"><p>No active signals detected.</p></div>;
                    
                    return (
                      <>
                        <div className="p-4 rounded-xl bg-black/10 border border-white/5">
                          <div className="flex justify-between items-center mb-2">
                            <span className={textMuted}>Target Market</span>
                            <span className={cn("font-bold text-indigo-400")}>{markets.find(m => m.symbol === signal.market)?.display_name || signal.market}</span>
                          </div>
                          <div className="flex justify-between items-center mb-2">
                            <span className={textMuted}>Strategy</span>
                            <span className={cn("font-bold uppercase", textTitle)}>{signal.strategy}</span>
                          </div>
                          <div className="flex justify-between items-center mb-2">
                            <span className={textMuted}>Confidence</span>
                            <span className="font-bold text-emerald-400">{signal.confidence.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className={textMuted}>Recommendation</span>
                            <span className={cn(
                              "font-bold px-2 py-1 rounded text-xs",
                              signal.action === 'TRADE' ? 'bg-green-500/20 text-green-400' :
                              signal.action === 'COOLDOWN' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'
                            )}>{signal.action} {signal.contractType ? `(${signal.contractType} ${signal.barrier ?? ''})` : ''}</span>
                          </div>
                        </div>
                        
                        <div className={cn("p-4 rounded-xl border text-sm", signal.action === 'TRADE' ? 'border-green-500/50 bg-green-500/10' : 'border-white/5 bg-black/10', textTitle)}>
                          <p className="font-medium mb-1">Reasoning:</p>
                          <p className={textMuted}>{signal.reason}</p>
                        </div>

                        {!isAutoMode && signal.action === 'TRADE' && (
                          <button 
                            onClick={() => executeTrade(signal)}
                            disabled={placingRef.current}
                            className="mt-2 w-full py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold transition-colors disabled:opacity-50"
                          >
                            Execute Trade Now
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Trade Log */}
            <div className={cn("p-6 rounded-2xl border flex flex-col gap-4 min-h-[300px]", cardBg)}>
              <h3 className={cn("font-semibold flex items-center gap-2", textTitle)}>
                <History className="w-5 h-5 text-emerald-400" /> Live Trading Log
              </h3>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {transactions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                    <BarChart3 className="w-8 h-8 opacity-20" />
                    <p>No trades executed yet</p>
                  </div>
                ) : (
                  transactions.map(t => (
                    <div key={t.id} className={cn("p-3 rounded-xl border flex flex-col gap-2", isDark ? 'border-white/5 bg-black/10' : 'border-gray-100 bg-gray-50')}>
                      <div className="flex justify-between items-center">
                        <span className={cn("font-bold text-xs uppercase", textTitle)}>{t.strategy}</span>
                        <span className={cn("text-xs font-bold px-2 py-1 rounded", t.result === 'win' ? 'bg-green-500/20 text-green-500' : t.result === 'loss' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500')}>
                          {t.result.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className={textMuted}>{t.symbol} • {t.side}</span>
                        <span className={cn("font-bold", t.profit > 0 ? "text-green-500" : t.profit < 0 ? "text-red-500" : textTitle)}>
                          {t.profit > 0 ? '+' : ''}{t.profit.toFixed(2)} USD
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigInput({ label, value, onChange, isDark, disabled, step = 1 }: any) {
  return (
    <div className="flex flex-col gap-1">
      <label className={cn("text-[10px] font-bold uppercase tracking-wider", isDark ? "text-slate-400" : "text-gray-500")}>{label}</label>
      <input 
        type="number" min="0" step={step} 
        value={value} onChange={(e) => onChange(Number(e.target.value))}
        className={cn("w-full px-3 py-2 rounded-lg border bg-transparent outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm", isDark ? "border-white/10 text-white" : "border-gray-200 text-gray-900")}
        disabled={disabled}
      />
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
