import { useState, useEffect, useCallback } from 'react';
import { PUBLIC_WS_URL } from '@/lib/config';
import { type SymbolInfo, pipSizeMap } from '@/hooks/useDerivTicks';

export type PovertyMarketStats = {
  symbol: string;
  name: string;
  lastPrice: number;
  lastDigit: number;
  last60Digits: number[];
  digitCounts: number[]; // 0-9 counts
  targetDigit: number | null; // The chosen digit 2-7
  isEligible: boolean;
};

export function extractDigit(quote: number, pipSize: number): number {
  const fixed = quote.toFixed(pipSize);
  const cleaned = fixed.replace('.', '').replace(/[^0-9]/g, '');
  if (cleaned.length === 0) return 0;
  return parseInt(cleaned.slice(-1), 10);
}

export function usePovertyScanner(symbols: SymbolInfo[], isScanning: boolean) {
  const [marketStats, setMarketStats] = useState<Map<string, PovertyMarketStats>>(new Map());
  const [bestMarket, setBestMarket] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const scanMarkets = useCallback(async () => {
    if (!symbols.length) return;
    setIsRefreshing(true);
    
    const synthetics = symbols.filter(s => s.market === 'synthetic_index');
    if (!synthetics.length) {
      setIsRefreshing(false);
      return;
    }

    return new Promise<void>((resolve) => {
      const ws = new WebSocket(PUBLIC_WS_URL);
      const results = new Map<string, PovertyMarketStats>();
      let currentIndex = 0;
      let reqIdCounter = 2000;
      
      const fetchNext = () => {
        if (currentIndex >= synthetics.length) {
          ws.close();
          return;
        }
        const sym = synthetics[currentIndex];
        ws.send(JSON.stringify({
          ticks_history: sym.symbol,
          end: 'latest',
          count: 60, // Fetch 60 for stats calculation
          style: 'ticks',
          req_id: reqIdCounter + currentIndex,
        }));
      };

      ws.onopen = () => {
        const batchSize = 10;
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
              const last60 = digits.slice(-60);
              
              const counts = Array(10).fill(0);
              for (const d of last60) {
                counts[d]++;
              }
              
              const sortedCounts = [...counts].sort((a, b) => b - a);
              const maxCount = sortedCounts[0];
              const secondMaxCount = sortedCounts[1];
              const minCount = sortedCounts[9];
              
              // Find exclusions
              const excluded = new Set([0, 1, 8, 9]);
              for (let d = 0; d <= 9; d++) {
                if (counts[d] === maxCount || counts[d] === secondMaxCount || counts[d] === minCount) {
                  excluded.add(d);
                }
              }
              
              let targetDigit: number | null = null;
              let bestCount = 999;
              
              for (let d = 2; d <= 7; d++) {
                if (!excluded.has(d)) {
                  const c = counts[d];
                  if (c < 6) { // Less than 10% of 60 = < 6 = <= 5
                    // Also check last 15 ticks <= 3
                    const last15 = last60.slice(-15);
                    const count15 = last15.filter(x => x === d).length;
                    if (count15 <= 3) {
                      if (c < bestCount) {
                        bestCount = c;
                        targetDigit = d;
                      }
                    }
                  }
                }
              }

              const lastPrice = prices[prices.length - 1];
              const lastDigit = digits[digits.length - 1];

              results.set(symbol, {
                symbol,
                name: symInfo.display_name,
                lastPrice,
                lastDigit,
                last60Digits: last60,
                digitCounts: counts,
                targetDigit,
                isEligible: targetDigit !== null,
              });
            }

            if (currentIndex < synthetics.length) {
              fetchNext();
              currentIndex++;
            }
          }

          if (results.size >= synthetics.length || data.error) {
            if (results.size === synthetics.length) {
              setMarketStats(new Map(results));
              
              // Find best market (has eligible target, pick one with lowest count)
              let bestSym = null;
              let lowestTargetCount = 999;
              for (const [sym, stat] of results.entries()) {
                if (stat.isEligible && stat.targetDigit !== null) {
                  const targetCount = stat.digitCounts[stat.targetDigit];
                  if (targetCount < lowestTargetCount) {
                    lowestTargetCount = targetCount;
                    bestSym = sym;
                  }
                }
              }
              if (bestSym) setBestMarket(bestSym);
            }
          }
        } catch {
          // Ignore
        }
      };

      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setIsRefreshing(false);
        resolve();
      };
    });
  }, [symbols]);

  useEffect(() => {
    if (!isScanning) return;
    scanMarkets();
    const interval = setInterval(() => scanMarkets(), 30000);
    return () => clearInterval(interval);
  }, [isScanning, scanMarkets]);

  return { marketStats, bestMarket, isRefreshing, forceScan: scanMarkets };
}
