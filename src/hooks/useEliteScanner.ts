import { useState, useEffect, useRef, useCallback } from 'react';
import { PUBLIC_WS_URL } from '@/lib/config';
import { type SymbolInfo, pipSizeMap } from '@/hooks/useDerivTicks';

export type MarketStats = {
  symbol: string;
  name: string;
  under0to5: number;
  over4to9: number;
  under0to4: number;
  over5to9: number;
  lastPrice: number;
  lastDigit: number;
  trendStrength: number; // e.g. Math.abs(under0to5 - 25)
  last50Digits: number[];
};

export function extractDigit(quote: number, pipSize: number): number {
  const fixed = quote.toFixed(pipSize);
  const cleaned = fixed.replace('.', '').replace(/[^0-9]/g, '');
  if (cleaned.length === 0) return 0;
  return parseInt(cleaned.slice(-1), 10);
}

export function useEliteScanner(symbols: SymbolInfo[], isScanning: boolean) {
  const [marketStats, setMarketStats] = useState<Map<string, MarketStats>>(new Map());
  const [bestMarket, setBestMarket] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const scanMarkets = useCallback(async () => {
    if (!symbols.length) return;
    setIsRefreshing(true);
    
    // Filter synthetic indices
    const synthetics = symbols.filter(s => s.market === 'synthetic_index');
    if (!synthetics.length) {
      setIsRefreshing(false);
      return;
    }

    return new Promise<void>((resolve) => {
      const ws = new WebSocket(PUBLIC_WS_URL);
      const results = new Map<string, MarketStats>();
      let currentIndex = 0;
      let reqIdCounter = 1000;
      
      const fetchNext = () => {
        if (currentIndex >= synthetics.length) {
          ws.close();
          return;
        }
        const sym = synthetics[currentIndex];
        ws.send(JSON.stringify({
          ticks_history: sym.symbol,
          end: 'latest',
          count: 50, // Fetch 50 for stats calculation
          style: 'ticks',
          req_id: reqIdCounter + currentIndex,
        }));
      };

      ws.onopen = () => {
        // Send requests in small batches
        const batchSize = 2;
        for (let i = 0; i < Math.min(batchSize, synthetics.length); i++) {
          fetchNext();
          currentIndex++;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.msg_type === 'history') {
            const symbol = data.echo_req.ticks_history;
            const prices: number[] = data.history?.prices ?? [];
            const ps = (data.pip_size as number) ?? pipSizeMap.get(symbol) ?? 4;
            const symInfo = synthetics.find(s => s.symbol === symbol);
            
            if (prices.length > 0 && symInfo) {
              const digits = prices.map(p => extractDigit(p, ps));
              const last50 = digits.slice(-50);
              
              let under0to5 = 0;
              let over4to9 = 0;
              let under0to4 = 0;
              let over5to9 = 0;

              for (const d of last50) {
                if (d <= 5) under0to5++;
                if (d >= 4) over4to9++;
                if (d <= 4) under0to4++;
                if (d >= 5) over5to9++;
              }
              
              const lastPrice = prices[prices.length - 1];
              const lastDigit = digits[digits.length - 1];
              
              // Trend strength based on divergence from 25 (since out of 50, random is 25 for both groups - wait, 0-5 is 6 numbers, expected is 30. 0-4 is 5 numbers, expected is 25)
              // Let's use 0-4 vs 5-9 which is 5 digits each, so 25 is exact 50%
              const trendStrength = Math.max(Math.abs(under0to4 - 25), Math.abs(over5to9 - 25));

              results.set(symbol, {
                symbol,
                name: symInfo.display_name,
                under0to5,
                over4to9,
                under0to4,
                over5to9,
                lastPrice,
                lastDigit,
                trendStrength,
                last50Digits: last50,
              });
            }

            // Fetch next one
            if (currentIndex < synthetics.length) {
              fetchNext();
              currentIndex++;
            }
          }

          if (results.size >= synthetics.length || data.error) {
            // Error or done
            if (results.size === synthetics.length) {
              setMarketStats(new Map(results));
              
              // Find best market
              let bestSym = null;
              let maxStrength = -1;
              for (const [sym, stat] of results.entries()) {
                if (stat.trendStrength > maxStrength) {
                  maxStrength = stat.trendStrength;
                  bestSym = sym;
                }
              }
              if (bestSym) setBestMarket(bestSym);
            }
          }
        } catch {
          // Ignore
        }
      };

      ws.onerror = () => {
        ws.close();
      };
      
      ws.onclose = () => {
        setIsRefreshing(false);
        resolve();
      };
    });
  }, [symbols]);

  useEffect(() => {
    if (!isScanning) return;
    
    scanMarkets(); // Initial scan
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      scanMarkets();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [isScanning, scanMarkets]);

  return { marketStats, bestMarket, isRefreshing, forceScan: scanMarkets };
}
