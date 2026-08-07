import { useState, useEffect, useRef } from 'react';
import { PUBLIC_WS_URL } from '@/lib/config';
import { fetchActiveSymbols, type SymbolInfo } from './useDerivTicks';

export type MarketPrice = {
  symbol: string;
  price: number;
  digit: number; // The latest digit for UI
  ticks: number[]; // Array of last 60 digits for analysis
  epoch: number;
  displayName: string;
  pipSize: number;
};

// Maintains a single WebSocket connection to stream multiple markets
export function useMarketPrices() {
  const [prices, setPrices] = useState<Record<string, MarketPrice>>({});
  const [markets, setMarkets] = useState<SymbolInfo[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setStatus('connecting');
      const activeSymbols = await fetchActiveSymbols();
      if (cancelled) return;

      // Filter for volatility and jump indices
      const targetMarkets = activeSymbols.filter(s => 
        s.market === 'synthetic_index' && 
        (s.submarket === 'random_index' || s.submarket === 'jump_index')
      );
      
      setMarkets(targetMarkets);

      const ws = new WebSocket(PUBLIC_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setStatus('connected');
        
        // Subscribe to all target markets
        targetMarkets.forEach((m, idx) => {
          ws.send(JSON.stringify({
            ticks: m.symbol,
            subscribe: 1,
            req_id: idx
          }));
        });
      };

      ws.onmessage = (msg) => {
        if (cancelled) return;
        const data = JSON.parse(msg.data);
        
        if (data.msg_type === 'tick' && data.tick) {
          const tick = data.tick;
          const symbol = tick.symbol;
          const quote = Number(tick.quote);
          const epoch = tick.epoch;
          
          // We need the pip size to extract the last digit correctly
          const symbolInfo = targetMarkets.find(m => m.symbol === symbol);
          if (!symbolInfo) return;
          
          const pipSize = (tick.pip_size as number) ?? symbolInfo.pip_size;
          const fixedStr = quote.toFixed(pipSize);
          const cleaned = fixedStr.replace('.', '').replace(/[^0-9]/g, '');
          const digit = cleaned.length > 0 ? parseInt(cleaned.slice(-1), 10) : 0;
          
          setPrices(prev => {
            const prevMarket = prev[symbol];
            const newTicks = prevMarket ? [...prevMarket.ticks, digit].slice(-60) : [digit];
            
            return {
              ...prev,
              [symbol]: {
                symbol,
                price: quote,
                digit,
                ticks: newTicks,
                epoch,
                displayName: symbolInfo.display_name,
                pipSize
              }
            };
          });
        }
      };

      ws.onerror = () => {
        if (!cancelled) setStatus('error');
      };

      ws.onclose = () => {
        if (!cancelled) setStatus('error'); // Basic reconnect logic omitted for brevity
      };
    }

    init();

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { prices, markets, status };
}
