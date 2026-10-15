import { useEffect, useRef, useState, useCallback } from 'react';
import { PUBLIC_WS_URL } from '@/lib/config';

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

export type Tick = {
  digit: number;
  quote: number;
  epoch: number;
};

export type SymbolInfo = {
  symbol: string;
  display_name: string;
  market: string;
  submarket: string;
  exchange_is_open: number;
  is_trading_suspended: number;
  pip_size: number;
};

export const pipSizeMap = new Map<string, number>([
  ['R_10', 3],
  ['R_25', 3],
  ['R_50', 4],
  ['R_75', 4],
  ['R_100', 2],
  ['1HZ10V', 2],
  ['1HZ25V', 2],
  ['1HZ50V', 2],
  ['1HZ75V', 2],
  ['1HZ100V', 2],
]);

function extractDigit(quote: number, pipSize: number): number {
  if (typeof quote !== 'number' || isNaN(quote)) return 0;
  const fixed = quote.toFixed(pipSize);
  const cleaned = fixed.replace('.', '').replace(/[^0-9]/g, '');
  if (cleaned.length === 0) return 0;
  return parseInt(cleaned.slice(-1), 10);
}

let reqIdCounter = 0;
function nextReqId(): number {
  reqIdCounter += 1;
  return reqIdCounter;
}

// ── Cache for Active Symbols ──────────────────────────────────────────────
const SYMBOLS_STORAGE_KEY = 'digitflow_active_symbols_cache_v1';
let cachedSymbols: SymbolInfo[] | null = null;
let symbolFetchPromise: Promise<SymbolInfo[]> | null = null;

try {
  const stored = localStorage.getItem(SYMBOLS_STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0) {
      cachedSymbols = parsed;
      for (const s of parsed) {
        if (s.symbol && typeof s.pip_size === 'number') {
          pipSizeMap.set(s.symbol, s.pip_size);
        }
      }
    }
  }
} catch {
  // localStorage not available or parse error
}

// ── Singleton Market Data WebSocket Client ─────────────────────────────────
// Ensures ONLY 1 persistent WebSocket connection is opened for public market data,
// avoiding Deriv's strict 5-connection limit and preventing reconnection storms.
class DerivPublicClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'closed';
  private currentSymbol: string = '';
  private currentSubId: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private historyReqId: number | null = null;

  // Listeners
  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private tickListeners = new Set<(tick: { digit: number; quote: number; symbol: string }) => void>();
  private historyListeners = new Set<(payload: { digits: number[]; quotes: number[]; symbol: string; isFetchCount?: boolean }) => void>();
  private symbolsListeners = new Set<(symbols: SymbolInfo[]) => void>();
  private historyLoadingListeners = new Set<(loading: boolean) => void>();

  constructor() {
    // Automatically connect on initialization
    this.connect();
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public addStatusListener(fn: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => { this.statusListeners.delete(fn); };
  }

  public addTickListener(fn: (tick: { digit: number; quote: number; symbol: string }) => void): () => void {
    this.tickListeners.add(fn);
    return () => { this.tickListeners.delete(fn); };
  }

  public addHistoryListener(fn: (payload: { digits: number[]; quotes: number[]; symbol: string; isFetchCount?: boolean }) => void): () => void {
    this.historyListeners.add(fn);
    return () => { this.historyListeners.delete(fn); };
  }

  public addSymbolsListener(fn: (symbols: SymbolInfo[]) => void): () => void {
    this.symbolsListeners.add(fn);
    if (cachedSymbols) fn(cachedSymbols);
    return () => { this.symbolsListeners.delete(fn); };
  }

  public addHistoryLoadingListener(fn: (loading: boolean) => void): () => void {
    this.historyLoadingListeners.add(fn);
    return () => { this.historyLoadingListeners.delete(fn); };
  }

  private notifyStatus(s: ConnectionStatus) {
    this.status = s;
    for (const fn of this.statusListeners) fn(s);
  }

  private notifyLoading(loading: boolean) {
    for (const fn of this.historyLoadingListeners) fn(loading);
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.notifyStatus('connecting');

    try {
      const ws = new WebSocket(PUBLIC_WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.reconnectAttempts = 0;
        this.notifyStatus('open');

        // Start keepalive heartbeat every 25 seconds
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ ping: 1, req_id: nextReqId() }));
          }
        }, 25000);

        // Fetch active symbols if not cached
        if (!cachedSymbols) {
          ws.send(JSON.stringify({ active_symbols: 'brief', req_id: nextReqId() }));
        }

        // Subscribe to current symbol if set
        if (this.currentSymbol) {
          this.notifyLoading(true);
          ws.send(JSON.stringify({
            ticks_history: this.currentSymbol,
            end: 'latest',
            count: 100,
            style: 'ticks',
            subscribe: 1,
            req_id: nextReqId(),
          }));
        }
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        try {
          const data = JSON.parse(event.data);

          if (data.error) {
            if (data.req_id === this.historyReqId) {
              this.notifyLoading(false);
              this.historyReqId = null;
            }
            return;
          }

          if (data.msg_type === 'active_symbols' && Array.isArray(data.active_symbols)) {
            const symbols: SymbolInfo[] = data.active_symbols
              .filter((s: Record<string, unknown>) => {
                if (!s || typeof s.underlying_symbol !== 'string') return false;
                const name = (s.underlying_symbol_name as string || '').toLowerCase();
                return name.includes('volatility') || name.includes('jump');
              })
              .map((s: Record<string, unknown>) => {
                const sym = s.underlying_symbol as string;
                const ps = (s.pip_size as number) ?? 4;
                pipSizeMap.set(sym, ps);
                return {
                  symbol: sym,
                  display_name: s.underlying_symbol_name as string,
                  market: s.market as string,
                  submarket: s.submarket as string,
                  exchange_is_open: s.exchange_is_open as number,
                  is_trading_suspended: s.is_trading_suspended as number,
                  pip_size: ps,
                };
              });

            if (symbols.length > 0) {
              cachedSymbols = symbols;
              try {
                localStorage.setItem(SYMBOLS_STORAGE_KEY, JSON.stringify(symbols));
              } catch {
                // ignore storage error
              }
              for (const fn of this.symbolsListeners) fn(symbols);
            }
          } else if (data.msg_type === 'history') {
            const prices: number[] = data.history?.prices ?? [];
            const sym = (data.echo_req?.ticks_history as string) || this.currentSymbol;
            const ps = (data.pip_size as number) ?? pipSizeMap.get(sym) ?? 4;
            if (ps) pipSizeMap.set(sym, ps);
            const historyDigits = prices.map((p) => extractDigit(p, ps));

            if (data.subscription?.id) {
              this.currentSubId = data.subscription.id;
            }

            const isFetchCount = data.req_id === this.historyReqId;
            if (isFetchCount) {
              this.historyReqId = null;
            }
            this.notifyLoading(false);

            for (const fn of this.historyListeners) {
              fn({ digits: historyDigits, quotes: prices, symbol: sym, isFetchCount });
            }
          } else if (data.msg_type === 'tick') {
            const quote = data.tick.quote;
            const sym = data.tick.symbol as string;
            const ps = (data.tick.pip_size as number) ?? (data.pip_size as number) ?? pipSizeMap.get(sym) ?? 4;
            if (ps) pipSizeMap.set(sym, ps);
            const lastDigit = extractDigit(quote, ps);

            if (data.subscription?.id) {
              this.currentSubId = data.subscription.id;
            }

            for (const fn of this.tickListeners) {
              fn({ digit: lastDigit, quote, symbol: sym });
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        this.notifyStatus('error');
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.notifyStatus('closed');
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }

        // Exponential backoff reconnect: 1s, 2s, 4s, up to 8s max
        this.reconnectAttempts += 1;
        const delay = Math.min(1000 * 1.5 ** (this.reconnectAttempts - 1), 8000);
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, delay);
      };
    } catch {
      this.notifyStatus('error');
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }
  }

  public setSymbol(symbol: string) {
    if (this.currentSymbol === symbol && this.currentSubId) {
      return;
    }

    const prevSymbol = this.currentSymbol;
    this.currentSymbol = symbol;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Unsubscribe from previous symbol ticks
      if (this.currentSubId) {
        try {
          this.ws.send(JSON.stringify({ forget: this.currentSubId }));
        } catch {
          // ignore
        }
        this.currentSubId = null;
      }

      this.notifyLoading(true);
      this.ws.send(JSON.stringify({
        ticks_history: symbol,
        end: 'latest',
        count: 100,
        style: 'ticks',
        subscribe: 1,
        req_id: nextReqId(),
      }));
    } else {
      this.connect();
    }
  }

  public fetchHistory(count: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.currentSymbol) return;
    const reqId = nextReqId();
    this.historyReqId = reqId;
    this.notifyLoading(true);
    this.ws.send(JSON.stringify({
      ticks_history: this.currentSymbol,
      end: 'latest',
      count,
      style: 'ticks',
      req_id: reqId,
    }));
  }

  public reconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }
    this.connect();
  }

  public requestSymbols() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ active_symbols: 'brief', req_id: nextReqId() }));
    } else {
      this.connect();
    }
  }
}

// Global client instance
const publicClient = new DerivPublicClient();

export async function fetchActiveSymbols(): Promise<SymbolInfo[]> {
  if (cachedSymbols && cachedSymbols.length > 0) return cachedSymbols;
  if (symbolFetchPromise) return symbolFetchPromise;

  symbolFetchPromise = new Promise<SymbolInfo[]>((resolve) => {
    const unsub = publicClient.addSymbolsListener((symbols) => {
      if (symbols && symbols.length > 0) {
        unsub();
        resolve(symbols);
      }
    });

    publicClient.requestSymbols();

    // Fallback timeout after 8 seconds
    setTimeout(() => {
      unsub();
      resolve(cachedSymbols || []);
    }, 8000);
  });

  return symbolFetchPromise;
}

export function useActiveSymbols() {
  const [symbols, setSymbols] = useState<SymbolInfo[]>(cachedSymbols ?? []);
  const [loading, setLoading] = useState(!cachedSymbols || cachedSymbols.length === 0);

  useEffect(() => {
    const unsub = publicClient.addSymbolsListener((newSymbols) => {
      if (newSymbols && newSymbols.length > 0) {
        setSymbols(newSymbols);
        setLoading(false);
      }
    });

    if (!cachedSymbols || cachedSymbols.length === 0) {
      publicClient.requestSymbols();
    }

    return () => {
      unsub();
    };
  }, []);

  return { symbols, loading };
}

export function useDerivTicks(symbol: string, maxDigits = 1000) {
  const [digits, setDigits] = useState<number[]>([]);
  const [quotes, setQuotes] = useState<number[]>([]);
  const [currentDigit, setCurrentDigit] = useState<number>(0);
  const [currentQuote, setCurrentQuote] = useState<number>(0);
  const [status, setStatus] = useState<ConnectionStatus>(publicClient.getStatus());
  const [tickCount, setTickCount] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const activeSymbolRef = useRef(symbol);

  useEffect(() => {
    activeSymbolRef.current = symbol;
    publicClient.setSymbol(symbol);
  }, [symbol]);

  useEffect(() => {
    const unsubStatus = publicClient.addStatusListener((s) => {
      setStatus(s);
    });

    const unsubLoading = publicClient.addHistoryLoadingListener((l) => {
      setHistoryLoading(l);
    });

    const unsubHistory = publicClient.addHistoryListener(({ digits: histDigits, quotes: histQuotes, symbol: sym, isFetchCount }) => {
      if (sym !== activeSymbolRef.current) return;

      if (histPricesValid(histQuotes)) {
        const lastPrice = histQuotes[histQuotes.length - 1];
        const lastD = histDigits[histDigits.length - 1];
        setCurrentQuote(lastPrice);
        setCurrentDigit(lastD);
      }

      if (isFetchCount) {
        setDigits(histDigits.slice(-maxDigits));
        setQuotes(histQuotes.slice(-maxDigits));
      } else {
        setDigits((prev) => {
          // If we had no digits or symbol just changed, replace completely
          if (prev.length === 0 || digitsSymbolMismatch(prev, histDigits)) {
            return histDigits.slice(-maxDigits);
          }
          return [...histDigits, ...prev].slice(-maxDigits);
        });
        setQuotes((prev) => {
          if (prev.length === 0) return histQuotes.slice(-maxDigits);
          return [...histQuotes, ...prev].slice(-maxDigits);
        });
      }
    });

    const unsubTick = publicClient.addTickListener(({ digit, quote, symbol: sym }) => {
      if (sym !== activeSymbolRef.current) return;

      setCurrentDigit(digit);
      setCurrentQuote(quote);
      setTickCount((c) => c + 1);
      setDigits((prev) => [...prev, digit].slice(-maxDigits));
      setQuotes((prev) => [...prev, quote].slice(-maxDigits));
    });

    return () => {
      unsubStatus();
      unsubLoading();
      unsubHistory();
      unsubTick();
    };
  }, [maxDigits]);

  const fetchHistory = useCallback((count: number) => {
    publicClient.fetchHistory(count);
  }, []);

  const reconnect = useCallback(() => {
    publicClient.reconnect();
  }, []);

  return {
    digits,
    quotes,
    currentDigit,
    currentQuote,
    status,
    tickCount,
    historyLoading,
    fetchHistory,
    reconnect,
  };
}

function histPricesValid(prices: number[]): boolean {
  return Array.isArray(prices) && prices.length > 0;
}

function digitsSymbolMismatch(prev: number[], next: number[]): boolean {
  // If lengths or patterns differ drastically, prefer the fresh history
  return prev.length > 0 && next.length > 0;
}
