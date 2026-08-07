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

export const pipSizeMap = new Map<string, number>();

function extractDigit(quote: number, pipSize: number): number {
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

function extractDigitFromStr(quoteStr: string): number {
  const cleaned = quoteStr.replace('.', '').replace(/[^0-9]/g, '');
  if (cleaned.length === 0) return 0;
  return parseInt(cleaned.slice(-1), 10);
}

let cachedSymbols: SymbolInfo[] | null = null;
let symbolFetchPromise: Promise<SymbolInfo[]> | null = null;

export async function fetchActiveSymbols(): Promise<SymbolInfo[]> {
  if (cachedSymbols) return cachedSymbols;
  if (symbolFetchPromise) return symbolFetchPromise;

  symbolFetchPromise = new Promise<SymbolInfo[]>((resolve) => {
    const ws = new WebSocket(PUBLIC_WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      resolve([]);
    }, 10000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ active_symbols: 'brief', req_id: nextReqId() }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          clearTimeout(timeout);
          ws.close();
          resolve([]);
          return;
        }
        if (data.msg_type === 'active_symbols' && Array.isArray(data.active_symbols)) {
          clearTimeout(timeout);
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
          cachedSymbols = symbols;
          ws.close();
          resolve(symbols);
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve([]);
    };
  });

  return symbolFetchPromise;
}

export function useActiveSymbols() {
  const [symbols, setSymbols] = useState<SymbolInfo[]>(cachedSymbols ?? []);
  const [loading, setLoading] = useState(!cachedSymbols);

  useEffect(() => {
    if (cachedSymbols) {
      setSymbols(cachedSymbols);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchActiveSymbols().then((result) => {
      if (!cancelled) {
        setSymbols(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return { symbols, loading };
}

export function useDerivTicks(symbol: string, maxDigits = 1000) {
  const [digits, setDigits] = useState<number[]>([]);
  const [quotes, setQuotes] = useState<number[]>([]);
  const [currentDigit, setCurrentDigit] = useState<number>(0);
  const [currentQuote, setCurrentQuote] = useState<number>(0);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [tickCount, setTickCount] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number>(0);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subIdRef = useRef<string | null>(null);
  const historyReqRef = useRef<number | null>(null);

  const fetchHistory = useCallback((count: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const reqId = nextReqId();
    historyReqRef.current = reqId;
    setHistoryLoading(true);
    ws.send(JSON.stringify({
      ticks_history: symbol,
      end: 'latest',
      count,
      style: 'ticks',
      req_id: reqId,
    }));
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    // Reset tick history states immediately on symbol change
    setDigits([]);
    setQuotes([]);
    setCurrentDigit(0);
    setCurrentQuote(0);
    setTickCount(0);
    setHistoryLoading(true);

    function connect() {
      if (cancelled) return;
      setStatus('connecting');
      const ws = new WebSocket(PUBLIC_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setStatus('open');
        reconnectRef.current = 0;

        ws.send(JSON.stringify({
          ticks_history: symbol,
          end: 'latest',
          count: 100,
          style: 'ticks',
          subscribe: 1,
          req_id: nextReqId(),
        }));
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const raw = event.data as string;
          const data = JSON.parse(raw);

          if (data.error) {
            if (data.req_id === historyReqRef.current) {
              setHistoryLoading(false);
              historyReqRef.current = null;
              console.error("History fetch error:", data.error.message);
            } else {
              setStatus('error');
            }
            return;
          }

          if (data.msg_type === 'history') {
            const prices: number[] = data.history?.prices ?? [];
            const ps = (data.pip_size as number) ?? pipSizeMap.get(symbol) ?? 4;
            if (ps) pipSizeMap.set(symbol, ps);
            const historyDigits = prices.map((p) => extractDigit(p, ps));

            // Immediately set currentQuote and currentDigit from the latest history tick
            if (prices.length > 0) {
              const lastPrice = prices[prices.length - 1];
              setCurrentQuote(lastPrice);
              setCurrentDigit(extractDigit(lastPrice, ps));
            }

            if (data.req_id === historyReqRef.current) {
              historyReqRef.current = null;
              setHistoryLoading(false);
              setDigits(historyDigits.slice(-maxDigits));
              setQuotes(prices.slice(-maxDigits));
            } else {
              setHistoryLoading(false);
              setDigits((prev) => {
                const merged = [...historyDigits, ...prev].slice(-maxDigits);
                return merged;
              });
              setQuotes((prev) => {
                const merged = [...prices, ...prev].slice(-maxDigits);
                return merged;
              });
            }
            if (data.subscription?.id) {
              subIdRef.current = data.subscription.id;
            }
          } else if (data.msg_type === 'tick') {
            const quote = data.tick.quote;
            const ps = (data.tick.pip_size as number) ?? (data.pip_size as number) ?? pipSizeMap.get(symbol) ?? 4;
            if (ps) pipSizeMap.set(symbol, ps);
            const lastDigit = extractDigit(quote, ps);
            setCurrentDigit(lastDigit);
            setCurrentQuote(quote);
            setTickCount((c) => c + 1);
            setDigits((prev) => [...prev, lastDigit].slice(-maxDigits));
            setQuotes((prev) => [...prev, quote].slice(-maxDigits));
            if (data.subscription?.id) {
              subIdRef.current = data.subscription.id;
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        if (cancelled) return;
        setStatus('error');
      };

      ws.onclose = () => {
        if (cancelled) return;
        setStatus('closed');
        if (pingRef.current) {
          clearInterval(pingRef.current);
          pingRef.current = null;
        }
        reconnectRef.current += 1;
        const delay = Math.min(1000 * 2 ** reconnectRef.current, 10000);
        reconnectTimer = setTimeout(connect, delay);
      };

      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ ping: 1, req_id: nextReqId() }));
        }
      }, 30000);
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
      if (wsRef.current) {
        if (subIdRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ forget: subIdRef.current }));
        }
        if (wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.onopen = () => {
            if (wsRef.current) wsRef.current.close();
          };
        } else {
          wsRef.current.close();
        }
        wsRef.current = null;
      }
      subIdRef.current = null;
    };
  }, [symbol, maxDigits]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
  }, []);

  return { digits, quotes, currentDigit, currentQuote, status, tickCount, historyLoading, fetchHistory, reconnect };
}
