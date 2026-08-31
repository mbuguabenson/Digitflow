import { useState, useEffect, useCallback } from 'react';
import { PUBLIC_WS_URL } from '@/lib/config';
import { type SymbolInfo, pipSizeMap } from '@/hooks/useDerivTicks';

export type AutoXEOMarketStats = {
  symbol: string;
  name: string;
  lastPrice: number;
  lastDigit: number;
  last60Digits: number[];
  digitCounts: number[]; // 0-9 counts
  evenCount: number;
  oddCount: number;
  evenProb: number;
  oddProb: number;
  targetDirection: 'EVEN' | 'ODD' | null;
  isEligible: boolean;
};

export function extractDigit(quote: number, pipSize: number): number {
  const fixed = quote.toFixed(pipSize);
  const cleaned = fixed.replace('.', '').replace(/[^0-9]/g, '');
  if (cleaned.length === 0) return 0;
  return parseInt(cleaned.slice(-1), 10);
}

export function useAutoXEoScanner(symbols: SymbolInfo[], isScanning: boolean) {
  const [marketStats, setMarketStats] = useState<Map<string, AutoXEOMarketStats>>(new Map());
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
      const results = new Map<string, AutoXEOMarketStats>();
      let currentIndex = 0;
      let reqIdCounter = 3000;
      
      const fetchNext = () => {
        if (currentIndex >= synthetics.length) {
          ws.close();
          return;
        }
        const sym = synthetics[currentIndex];
        ws.send(JSON.stringify({
          ticks_history: sym.symbol,
          end: 'latest',
          count: 60,
          style: 'ticks',
          req_id: reqIdCounter + currentIndex,
        }));
      };

      ws.onopen = () => {
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
              const last60 = digits.slice(-60);
              const last15 = digits.slice(-15);
              
              const counts = Array(10).fill(0);
              let evenCount = 0;
              let oddCount = 0;
              
              for (const d of last60) {
                counts[d]++;
                if (d % 2 === 0) evenCount++;
                else oddCount++;
              }
              
              const evenProb = (evenCount / 60) * 100;
              const oddProb = (oddCount / 60) * 100;
              
              let recentEven = 0;
              let recentOdd = 0;
              for (const d of last15) {
                if (d % 2 === 0) recentEven++;
                else recentOdd++;
              }

              const sortedDigits = [0,1,2,3,4,5,6,7,8,9].sort((a, b) => counts[b] - counts[a]);
              const mostAppearing = sortedDigits[0];
              const secondMost = sortedDigits[1];
              const leastAppearing = sortedDigits[9];

              let targetDirection: 'EVEN' | 'ODD' | null = null;
              
              // 10.5% of 60 is 6.3. So > 10.5% means >= 7 occurrences.
              const thresholdCount = 7;
              
              // Check Even
              if (evenProb >= 58 && recentEven >= 10) {
                const evenDigits = [0, 2, 4, 6, 8];
                const strongEvenCount = evenDigits.filter(d => counts[d] >= thresholdCount).length;
                if (strongEvenCount >= 3) {
                  // Extremes check: Most and 2nd Most should be Even, Least should be Odd
                  if (mostAppearing % 2 === 0 && secondMost % 2 === 0 && leastAppearing % 2 !== 0) {
                    targetDirection = 'EVEN';
                  }
                }
              }
              // Check Odd
              else if (oddProb >= 58 && recentOdd >= 10) {
                const oddDigits = [1, 3, 5, 7, 9];
                const strongOddCount = oddDigits.filter(d => counts[d] >= thresholdCount).length;
                if (strongOddCount >= 3) {
                  // Extremes check
                  if (mostAppearing % 2 !== 0 && secondMost % 2 !== 0 && leastAppearing % 2 === 0) {
                    targetDirection = 'ODD';
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
                evenCount,
                oddCount,
                evenProb,
                oddProb,
                targetDirection,
                isEligible: targetDirection !== null,
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
              
              let bestSym = null;
              let maxProb = 0;
              for (const [sym, stat] of results.entries()) {
                if (stat.isEligible) {
                  const prob = stat.targetDirection === 'EVEN' ? stat.evenProb : stat.oddProb;
                  if (prob > maxProb) {
                    maxProb = prob;
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
