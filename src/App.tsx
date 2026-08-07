import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Check,
  X,
  Brain,
  Sparkles,
  Wifi,
  WifiOff,
  Loader2,
  ChevronDown,
  Search,
  Sun,
  Moon,
  LogIn,
  LogOut,
  Wallet,
  XCircle,
  Trophy,
  Flame,
  Layers,
  Zap,
  Download,
} from 'lucide-react';
import { useDerivTicks, useActiveSymbols, type SymbolInfo } from '@/hooks/useDerivTicks';
import { useDerivAuth, type Account, type AccountInfo } from '@/hooks/useDerivAuth';
import { useTransactions } from '@/hooks/useTransactions';
import { useTheme } from '@/hooks/useTheme';
import { AccountDropdownCard } from '@/components/AccountDropdownCard';
import { TransactionCard } from '@/components/TransactionCard';
import { OverUnderTab } from '@/components/tabs/OverUnderTab';
import { MatchesTab } from '@/components/tabs/MatchesTab';
import { EvenOddTab } from '@/components/tabs/EvenOddTab';
import { DiffersTab } from '@/components/tabs/DiffersTab';
import { AIAnalysisTab } from '@/components/tabs/AIAnalysisTab';
import { SmartAnalysisTab } from '@/components/tabs/SmartAnalysisTab';
import { SmartTradingTab } from '@/components/tabs/SmartTradingTab';
import { CompoundingChallengeTab } from '@/components/tabs/CompoundingChallengeTab';
import { TradingEngineTab } from '@/components/tabs/TradingEngineTab';
import { SignalsTab } from '@/components/tabs/SignalsTab';
import { AutotraderTab } from '@/components/tabs/AutotraderTab';
import { cn } from '@/lib/utils';

type TabId = 'autotrader' | 'over-under' | 'matches' | 'even-odd' | 'differs' | 'ai' | 'smart' | 'smart-trading' | 'challenge' | 'engine' | 'signals';

import { Bot } from 'lucide-react';

const TABS: { id: TabId; label: string; icon: typeof Activity }[] = [
  { id: 'autotrader', label: 'Autotrader', icon: Bot },
  { id: 'challenge', label: 'Challenge', icon: Trophy },
  { id: 'engine', label: 'Trading Engine', icon: Flame },
  { id: 'smart-trading', label: 'Smart Trading', icon: TrendingDown },
  { id: 'signals', label: 'Signals', icon: Zap },
  { id: 'smart', label: 'Smart Analysis', icon: Sparkles },
  { id: 'over-under', label: 'Over/Under', icon: TrendingUp },
  { id: 'matches', label: 'Matches', icon: Check },
  { id: 'even-odd', label: 'Even/Odd', icon: Activity },
  { id: 'differs', label: 'Differs', icon: X },
  { id: 'ai', label: 'AI Analysis', icon: Brain },
];

const MARKET_LABELS: Record<string, string> = {
  synthetic_index: 'Synthetic Indices',
  forex: 'Forex',
  commodities: 'Commodities',
  stock_indices: 'Stock Indices',
  cryptocurrencies: 'Cryptocurrencies',
};

function groupSymbolsByMarket(symbols: SymbolInfo[]): Map<string, SymbolInfo[]> {
  const groups = new Map<string, SymbolInfo[]>();
  for (const s of symbols) {
    if (!groups.has(s.market)) groups.set(s.market, []);
    groups.get(s.market)!.push(s);
  }
  for (const [, list] of groups) {
    list.sort((a, b) => a.display_name.localeCompare(b.display_name));
  }
  return groups;
}

function formatBalance(acct: Account) {
  return `${acct.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${acct.currency}`;
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [symbol, setSymbol] = useState('R_100');
  const [activeTab, setActiveTab] = useState<TabId>('smart');
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [ticksOpen, setTicksOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { digits, quotes, currentDigit, currentQuote, status, tickCount, historyLoading, fetchHistory } = useDerivTicks(symbol);
  const { symbols, loading: symbolsLoading } = useActiveSymbols();
  const { account, accounts, loading: authLoading, error: authError, loginWithOAuth, logout, selectAccount, refreshBalance, placeTrade: rawPlaceTrade, watchContract } = useDerivAuth();
  const { transactions, addTransaction, clearTransactions, setWatchFn } = useTransactions();

  useEffect(() => { setWatchFn(watchContract); }, [watchContract, setWatchFn]);

  const placeTrade = useCallback(async (params: {
    symbol: string;
    contractType: string;
    barrier?: string;
    amount: number;
    duration: number;
    durationUnit: string;
    basis?: string;
  }) => {
    const result = await rawPlaceTrade(params);
    if (result.success && result.contractId) {
      addTransaction({
        contractId: String(result.contractId),
        symbol: params.symbol,
        contractType: params.contractType,
        barrier: params.barrier,
        amount: params.amount,
        duration: params.duration,
        durationUnit: params.durationUnit,
      });
    }
    return result;
  }, [rawPlaceTrade, addTransaction]);

  const statusInfo = {
    connecting: { label: 'Connecting', icon: Loader2, color: '#eab308', spin: true },
    open: { label: 'Live', icon: Wifi, color: '#22c55e', spin: false },
    closed: { label: 'Disconnected', icon: WifiOff, color: '#ef4444', spin: false },
    error: { label: 'Error', icon: WifiOff, color: '#ef4444', spin: false },
  }[status];
  const StatusIcon = statusInfo.icon;

  const tickerDigits = digits.slice(-30);
  const tickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (activeTabRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const element = activeTabRef.current;

      const containerScrollLeft = container.scrollLeft;
      const containerWidth = container.clientWidth;
      const elementOffsetLeft = element.offsetLeft;
      const elementWidth = element.clientWidth;

      const isOutOfLeft = elementOffsetLeft < containerScrollLeft;
      const isOutOfRight = (elementOffsetLeft + elementWidth) > (containerScrollLeft + containerWidth);

      if (isOutOfLeft || isOutOfRight) {
        container.scrollTo({
          left: elementOffsetLeft - (containerWidth / 2) + (elementWidth / 2),
          behavior: 'smooth'
        });
      }
    }
  }, [activeTab]);

  const currentSymbolInfo = symbols.find((s) => s.symbol === symbol);
  const currentSymbolName = currentSymbolInfo?.display_name ?? symbol;

  const filteredGroups = useMemo(() => {
    const syms = symbols || [];
    if (!syms.length) return new Map<string, SymbolInfo[]>();
    const filtered = searchQuery.trim()
      ? syms.filter((s) =>
          s?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s?.symbol?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (MARKET_LABELS[s.market] ?? s?.market)?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : syms;
    return groupSymbolsByMarket(filtered);
  }, [symbols, searchQuery]);

  useEffect(() => {
    if (symbolOpen) {
      setSearchQuery('');
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [symbolOpen]);

  useEffect(() => {
    function close() { setSymbolOpen(false); }
    if (symbolOpen) {
      document.addEventListener('click', close);
      return () => document.removeEventListener('click', close);
    }
  }, [symbolOpen]);

  const isDark = theme === 'dark';
  const headerTextPrimary = isDark ? 'text-slate-100' : 'text-[#1a2a4a]';
  const headerTextMuted = isDark ? 'text-slate-400' : 'text-[#7a8aaa]';

  return (
    <div className="bg-app">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="relative z-10">
        {/* ── Header ── */}
        <header className="sticky top-0 z-30">
          <div className="glass-static rounded-none border-x-0 border-t-0">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {/* Top row */}
              <div className="flex h-[68px] items-center justify-between">
                {/* Logo text */}
                <div>
                  <h1 className={cn('text-[19px] font-bold leading-tight', headerTextPrimary)}>
                    Digit<span className="gradient-text">Flow</span>
                  </h1>
                  <p className={cn('text-[11px] font-medium', headerTextMuted)}>Deriv Tick Analyzer</p>
                </div>

                {/* Right controls: Market | Price | Last Digit | Ticks | Live | Modes | Login */}
                <div className="flex items-center gap-2.5">
                  {/* Market dropdown */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSymbolOpen(!symbolOpen)}
                      className={cn(
                        'flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-md border text-sm font-semibold transition-colors max-w-[180px]',
                        isDark
                          ? 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                          : 'bg-white/60 border-blue-200/40 text-[#3a4a6a] hover:bg-white/80'
                      )}
                    >
                      <span className="truncate">{currentSymbolName}</span>
                      <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', symbolOpen && 'rotate-180')} />
                    </button>
                    {symbolOpen && (
                      <div className={cn(
                        'absolute right-0 top-full mt-2 w-80 rounded-2xl border p-2 shadow-xl backdrop-blur-xl max-h-[420px] flex flex-col',
                        isDark ? 'bg-[#111736]/95 border-white/10' : 'bg-white/95 border-blue-200/40'
                      )}>
                        <div className="relative mb-2">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aaaba]" />
                          <input
                            ref={searchInputRef}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search markets…"
                            className={cn(
                              'w-full rounded-xl border py-2 pl-9 pr-3 text-sm placeholder:text-[#9aaaba] focus:outline-none',
                              isDark
                                ? 'bg-white/5 border-white/10 text-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20'
                                : 'bg-blue-50/50 border-blue-200/40 text-[#3a4a6a] focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50'
                            )}
                          />
                        </div>
                        <div className="flex-1 overflow-y-auto">
                          {symbolsLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                              <span className={cn('ml-2 text-sm', headerTextMuted)}>Loading markets…</span>
                            </div>
                          ) : filteredGroups.size === 0 ? (
                            <div className={cn('py-8 text-center text-sm', headerTextMuted)}>No markets found</div>
                          ) : (
                            Array.from(filteredGroups.entries()).map(([market, list]) => (
                              <div key={market} className="mb-1">
                                <div className={cn('px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider', headerTextMuted)}>
                                  {MARKET_LABELS[market] ?? market}
                                </div>
                                {list.map((s) => (
                                  <button
                                    key={s.symbol}
                                    onClick={() => { setSymbol(s.symbol); setSymbolOpen(false); }}
                                    className={cn(
                                      'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
                                      symbol === s.symbol
                                        ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white'
                                        : isDark ? 'text-slate-200 hover:bg-white/5' : 'text-[#3a4a6a] hover:bg-blue-50'
                                    )}
                                  >
                                    <span className="truncate">{s.display_name}</span>
                                    {s.exchange_is_open === 0 && (
                                      <span className={cn(
                                        'ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase',
                                        symbol === s.symbol ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-600'
                                      )}>
                                        Closed
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <div className={cn(
                    'hidden items-center gap-1.5 rounded-full px-3 py-1.5 backdrop-blur-md border sm:flex',
                    isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-blue-200/40'
                  )}>
                    <span className={cn('text-[11px] font-semibold', headerTextMuted)}>Price</span>
                    <span className={cn('font-mono text-sm font-bold', headerTextPrimary)}>
                      {currentQuote.toFixed(4)}
                    </span>
                  </div>

                  {/* Last Digit */}
                  <div className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-1.5 border',
                    isDark ? 'bg-blue-500/10 border-blue-400/20' : 'bg-gradient-to-r from-blue-500/15 to-cyan-400/15 border-blue-200/40'
                  )}>
                    <span className={cn('text-[11px] font-semibold', headerTextMuted)}>Last</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-sm font-bold text-white shadow-md shadow-blue-500/30">
                      {currentDigit}
                    </span>
                  </div>

                  {/* Ticks drawer toggle */}
                  <button
                    onClick={() => setTicksOpen(!ticksOpen)}
                    className={cn(
                      'flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-md border text-sm font-semibold transition-all',
                      ticksOpen
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white border-transparent'
                        : isDark
                          ? 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                          : 'bg-white/60 border-blue-200/40 text-[#3a4a6a] hover:bg-white/80'
                    )}
                    title="Toggle tick stream"
                  >
                    <Layers className="h-4 w-4" />
                    <span className="hidden sm:inline">Ticks</span>
                  </button>

                  {/* Live status pill */}
                  <div className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-md border',
                    isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-blue-200/40'
                  )}>
                    <StatusIcon className="h-3.5 w-3.5" style={{ color: statusInfo.color }} />
                    {statusInfo.spin && <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>}
                    <span className="text-xs font-semibold" style={{ color: statusInfo.color }}>
                      {statusInfo.label}
                    </span>
                    {status === 'open' && <span className="live-dot" />}
                  </div>

                  {/* Modes button */}
                  <button
                    onClick={toggleTheme}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition-all hover:scale-105',
                      isDark
                        ? 'bg-amber-400/15 border-amber-300/30 text-amber-300'
                        : 'bg-white/60 border-blue-200/40 text-amber-500'
                    )}
                    title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>

                  {/* Login / Account Card */}
                  {account ? (
                    <AccountDropdownCard
                      account={account}
                      accounts={accounts}
                      selectAccount={selectAccount}
                      logout={logout}
                      refreshBalance={refreshBalance}
                      isDark={isDark}
                    />
                  ) : (
                    <button
                      onClick={() => setShowLoginModal(true)}
                      className={cn(
                        'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold backdrop-blur-md border transition-all hover:scale-105',
                        isDark
                          ? 'bg-blue-500/15 border-blue-400/30 text-blue-300 hover:bg-blue-500/25'
                          : 'bg-blue-500/10 border-blue-200/50 text-blue-600 hover:bg-blue-500/20'
                      )}
                    >
                      <LogIn className="h-4 w-4" />
                      Login
                    </button>
                  )}
                </div>
              </div>

              {/* Collapsible Ticks drawer */}
              {ticksOpen && (
                <div className="flex flex-wrap items-center gap-2 pb-3 pt-1">
                  <div className={cn('flex items-center gap-1.5 text-xs font-semibold', headerTextMuted)}>
                    <span className="live-dot" />
                    TICKS
                  </div>
                  <div ref={tickerRef} className="flex flex-1 items-center gap-1.5 overflow-hidden min-w-[200px]">
                    {tickerDigits.length === 0 && (
                      <span className={cn('text-xs', headerTextMuted)}>Waiting for data…</span>
                    )}
                    {tickerDigits.map((d, i) => (
                      <div
                        key={`${tickCount - tickerDigits.length + i}-${d}`}
                        className={cn('ticker-item', i === tickerDigits.length - 1 && 'new')}
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                  {/* History fetch buttons */}
                  <div className="flex items-center gap-1">
                    <span className={cn('text-[10px] font-semibold mr-1', headerTextMuted)}>Fetch</span>
                    {[5000, 1000, 250, 120, 60, 25].map((n) => (
                      <button
                        key={n}
                        onClick={() => fetchHistory(n)}
                        disabled={historyLoading}
                        className={cn(
                          'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold transition-all border',
                          historyLoading
                            ? 'opacity-50 cursor-wait'
                            : isDark
                              ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-blue-500/20 hover:border-blue-400/40'
                              : 'bg-white/60 border-blue-200/40 text-[#3a4a6a] hover:bg-blue-500/15 hover:border-blue-400/40'
                        )}
                      >
                        {historyLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <span className={headerTextMuted}>Quote</span>
                      <span className={cn('font-mono font-bold', headerTextPrimary)}>
                        {currentQuote.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Redundant landing page accounts cards removed. Using header accounts dropdown instead. */}

        {/* ── Tab Navigation ── */}
        <nav className="sticky top-[122px] z-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div ref={scrollContainerRef} className="flex gap-2 overflow-x-auto py-3">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={active ? activeTabRef : null}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all',
                      active ? 'tab-active' : 'tab-inactive'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* ── Main Content ── */}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {digits.length < 10 && status === 'open' ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-blue-200/50" />
                <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin text-blue-500" />
              </div>
              <p className={cn('mt-5 text-sm font-medium', headerTextMuted)}>Collecting tick data…</p>
            </div>
          ) : status !== 'open' && digits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100/60">
                <WifiOff className="h-8 w-8 text-red-500" />
              </div>
              <p className={cn('mt-5 text-sm font-medium', headerTextMuted)}>
                {status === 'connecting' ? 'Connecting to Deriv WebSocket…' : 'Unable to connect. Retrying…'}
              </p>
            </div>
          ) : (
            <>
            <div key={activeTab} className="fade-up">
              {activeTab === 'over-under' && (
                <OverUnderTab
                  digits={digits}
                  currentDigit={currentDigit}
                  symbol={symbol}
                  account={account}
                  placeTrade={placeTrade}
                  isDark={isDark}
                />
              )}
              {activeTab === 'matches' && <MatchesTab digits={digits} currentDigit={currentDigit} />}
              {activeTab === 'even-odd' && <EvenOddTab digits={digits} currentDigit={currentDigit} />}
              {activeTab === 'differs' && <DiffersTab digits={digits} currentDigit={currentDigit} />}
              {activeTab === 'ai' && <AIAnalysisTab digits={digits} currentDigit={currentDigit} />}
              {activeTab === 'challenge' && (
                <CompoundingChallengeTab
                  symbol={symbol}
                  account={account}
                  placeTrade={placeTrade}
                  isDark={isDark}
                  onLoginRequest={() => setShowLoginModal(true)}
                />
              )}
              {activeTab === 'smart-trading' && (
                <SmartTradingTab
                  digits={digits}
                  currentDigit={currentDigit}
                  currentQuote={currentQuote}
                  symbol={symbol}
                  account={account}
                  placeTrade={placeTrade}
                  watchContract={watchContract}
                  refreshBalance={refreshBalance}
                  isDark={isDark}
                  onLoginRequest={() => setShowLoginModal(true)}
                />
              )}
              {activeTab === 'signals' && (
                <SignalsTab
                  digits={digits}
                  quotes={quotes}
                  currentDigit={currentDigit}
                  isDark={isDark}
                />
              )}
              {activeTab === 'smart' && <SmartAnalysisTab digits={digits} currentDigit={currentDigit} isDark={isDark} />}
              {activeTab === 'engine' && (
                <TradingEngineTab
                  account={account}
                  placeTrade={placeTrade}
                  watchContract={watchContract}
                  refreshBalance={refreshBalance}
                  isDark={isDark}
                  onLoginRequest={() => setShowLoginModal(true)}
                />
              )}
              {activeTab === 'autotrader' && (
                <AutotraderTab
                  account={account}
                  placeTrade={placeTrade}
                  watchContract={watchContract}
                  refreshBalance={refreshBalance}
                  isDark={isDark}
                  onLoginRequest={() => setShowLoginModal(true)}
                />
              )}
            </div>

            <div className="mt-6">
              <TransactionCard transactions={transactions} isDark={isDark} onClear={clearTransactions} />
            </div>
            </>
          )}
        </main>

        {/* ── Footer ── */}
        <footer className="pb-6 pt-2">
          <div className={cn('mx-auto max-w-7xl px-4 text-center text-xs sm:px-6 lg:px-8', headerTextMuted)}>
            Data source: Deriv WebSocket API · For educational analysis only · Not financial advice
          </div>
        </footer>
      </div>

      {/* ── Login Modal ── */}
      {showLoginModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowLoginModal(false)}
        >
          <div
            className={cn(
              'w-full max-w-md rounded-2xl border p-6 shadow-2xl',
              isDark ? 'bg-[#111736] border-white/10' : 'bg-white border-blue-200/50'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
                  <LogIn className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className={cn('text-lg font-bold', headerTextPrimary)}>Login to Deriv</h2>
                  <p className={cn('text-xs', headerTextMuted)}>Connect your account to trade</p>
                </div>
              </div>
              <button
                onClick={() => setShowLoginModal(false)}
                className={cn('rounded-lg p-1.5 transition-colors', isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100')}
              >
                <X className={cn('h-5 w-5', headerTextMuted)} />
              </button>
            </div>

            <div className="space-y-4">
              <button
                onClick={() => { loginWithOAuth(); }}
                disabled={authLoading}
                className={cn(
                  'w-full rounded-xl py-3 text-sm font-bold text-white transition-all',
                  authLoading
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-400 hover:shadow-lg hover:shadow-blue-500/30'
                )}
              >
                {authLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirecting…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <LogIn className="h-4 w-4" />
                    Login with Deriv
                  </span>
                )}
              </button>

              {authError && (
                <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5">
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-500">{authError}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
