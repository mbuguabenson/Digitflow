import { computeDigitStats, computeEvenOddStats, computeOverUnderStats } from './analysis';
import type { SymbolInfo } from '@/hooks/useDerivTicks';

export type StrategyType = 'over-under' | 'even-odd' | 'differs';

export type AutotraderSignal = {
  strategy: StrategyType;
  market: string;
  action: 'WAIT' | 'TRADE' | 'COOLDOWN';
  prediction?: number | 'over' | 'under' | 'even' | 'odd';
  barrier?: number;
  confidence: number; // 0 to 100
  reason: string;
  contractType?: string; // e.g., 'DIGITOVER', 'DIGITUNDER', 'DIGITDIFF', 'DIGITEVEN', 'DIGITODD'
};

// --- Over/Under Strategy ---
// Over 1,2,3 only (which means we predict >1, >2, >3) - wait, if we predict >1, barrier is 1.
// Under 8,7,6 only (which means we predict <8, <7, <6) - wait, if we predict <8, barrier is 8.
export function analyzeOverUnder(
  ticks60: number[],
  ticks1800: number[], // ~30 mins
  symbol: string
): AutotraderSignal {
  if (ticks60.length < 60) return { strategy: 'over-under', market: symbol, action: 'WAIT', confidence: 0, reason: `Waiting for 60 ticks (${ticks60.length}/60)` };
  
  let underCount60 = 0, overCount60 = 0;
  for (const d of ticks60) {
    if (d <= 4) underCount60++; else overCount60++;
  }
  const underPct60 = (underCount60 / ticks60.length) * 100;
  const overPct60 = (overCount60 / ticks60.length) * 100;

  const dominant = underPct60 >= 60 ? 'under' : (overPct60 >= 60 ? 'over' : null);
  
  if (!dominant) {
    return { strategy: 'over-under', market: symbol, action: 'WAIT', confidence: Math.max(underPct60, overPct60), reason: `No dominant trend (Under: ${underPct60.toFixed(1)}%, Over: ${overPct60.toFixed(1)}%)` };
  }

  // Check if increasing (compare to older half of the 60 ticks) - skip for brevity, long term check is better
  let underCount1800 = 0, overCount1800 = 0;
  for (const d of ticks1800) {
    if (d <= 4) underCount1800++; else overCount1800++;
  }
  const underPct1800 = ticks1800.length > 0 ? (underCount1800 / ticks1800.length) * 100 : underPct60;
  const overPct1800 = ticks1800.length > 0 ? (overCount1800 / ticks1800.length) * 100 : overPct60;

  const isLongTermConfirmed = dominant === 'under' ? underPct1800 > 50 : overPct1800 > 50;
  if (!isLongTermConfirmed) {
     return { strategy: 'over-under', market: symbol, action: 'WAIT', confidence: dominant === 'under' ? underPct60 : overPct60, reason: `Long-term trend does not confirm ${dominant}` };
  }

  // Digit distribution check
  const digitStats = computeDigitStats(ticks60);
  const sortedDigits = digitStats.percents.map((pct, idx) => ({ digit: idx, pct })).sort((a, b) => b.pct - a.pct);
  
  const mostAppearing = sortedDigits[0].digit;
  const secondMostAppearing = sortedDigits[1].digit;
  const leastAppearing = sortedDigits[9].digit;

  let highestDominantDigit = -1;

  if (dominant === 'under') {
    const mostInUnder = mostAppearing <= 4;
    const secondInUnder = secondMostAppearing <= 4;
    const leastInUnder = leastAppearing <= 4;
    
    let overDigitsBelow10 = true;
    for (let i = 5; i <= 9; i++) {
      if (digitStats.percents[i] >= 10) overDigitsBelow10 = false;
    }

    if (mostInUnder && secondInUnder && leastInUnder && overDigitsBelow10) {
      highestDominantDigit = mostAppearing;
    } else {
       return { strategy: 'over-under', market: symbol, action: 'WAIT', confidence: underPct60, reason: `Distribution criteria not met for Under` };
    }
  } else {
    const mostInOver = mostAppearing >= 5;
    const secondInOver = secondMostAppearing >= 5;
    const leastInOver = leastAppearing >= 5;
    
    let underDigitsBelow10 = true;
    for (let i = 0; i <= 4; i++) {
      if (digitStats.percents[i] >= 10) underDigitsBelow10 = false;
    }

    if (mostInOver && secondInOver && leastInOver && underDigitsBelow10) {
      highestDominantDigit = mostAppearing;
    } else {
       return { strategy: 'over-under', market: symbol, action: 'WAIT', confidence: overPct60, reason: `Distribution criteria not met for Over` };
    }
  }

  // Last 15 ticks must be in dominant direction
  const last15 = ticks60.slice(-15);
  let allLast15Dominant = true;
  for (const d of last15) {
    if (dominant === 'under' && d > 4) allLast15Dominant = false;
    if (dominant === 'over' && d <= 4) allLast15Dominant = false;
  }

  if (!allLast15Dominant) {
    return { strategy: 'over-under', market: symbol, action: 'COOLDOWN', confidence: dominant === 'under' ? underPct60 : overPct60, reason: `Waiting for ${dominant} digits to return (Cooldown)` };
  }

  // Entry condition
  const lastTick = ticks60[ticks60.length - 1];
  if (lastTick === highestDominantDigit) {
    const barrier = dominant === 'under' ? 8 : 1; 
    const contractType = dominant === 'under' ? 'DIGITUNDER' : 'DIGITOVER';

    return {
      strategy: 'over-under',
      market: symbol,
      action: 'TRADE',
      prediction: dominant,
      barrier,
      contractType,
      confidence: dominant === 'under' ? underPct60 : overPct60,
      reason: `Entry condition met! High ${dominant} probability.`
    };
  }

  return { strategy: 'over-under', market: symbol, action: 'WAIT', confidence: dominant === 'under' ? underPct60 : overPct60, reason: `Waiting for highest digit (${highestDominantDigit}) to appear` };
}

// --- Even/Odd Strategy ---
export function analyzeEvenOdd(
  ticks60: number[],
  ticks1800: number[],
  symbol: string
): AutotraderSignal {
  if (ticks60.length < 60) return { strategy: 'even-odd', market: symbol, action: 'WAIT', confidence: 0, reason: `Waiting for 60 ticks (${ticks60.length}/60)` };

  let evenCount60 = 0, oddCount60 = 0;
  for (const d of ticks60) {
    if (d % 2 === 0) evenCount60++; else oddCount60++;
  }
  const evenPct60 = (evenCount60 / ticks60.length) * 100;
  const oddPct60 = (oddCount60 / ticks60.length) * 100;

  const dominant = evenPct60 >= 60 ? 'even' : (oddPct60 >= 60 ? 'odd' : null);
  
  if (!dominant) {
    return { strategy: 'even-odd', market: symbol, action: 'WAIT', confidence: Math.max(evenPct60, oddPct60), reason: `No dominant trend (Even: ${evenPct60.toFixed(1)}%, Odd: ${oddPct60.toFixed(1)}%)` };
  }

  let evenCount1800 = 0, oddCount1800 = 0;
  for (const d of ticks1800) {
    if (d % 2 === 0) evenCount1800++; else oddCount1800++;
  }
  const evenPct1800 = ticks1800.length > 0 ? (evenCount1800 / ticks1800.length) * 100 : evenPct60;
  const oddPct1800 = ticks1800.length > 0 ? (oddCount1800 / ticks1800.length) * 100 : oddPct60;

  const isLongTermConfirmed = dominant === 'even' ? evenPct1800 > 50 : oddPct1800 > 50;
  if (!isLongTermConfirmed) {
     return { strategy: 'even-odd', market: symbol, action: 'WAIT', confidence: dominant === 'even' ? evenPct60 : oddPct60, reason: `Long-term trend does not confirm ${dominant}` };
  }

  let currentIdx = ticks60.length - 1;
  const lastTick = ticks60[currentIdx];
  const isLastDominant = dominant === 'even' ? lastTick % 2 === 0 : lastTick % 2 !== 0;

  if (!isLastDominant) {
    return { strategy: 'even-odd', market: symbol, action: 'WAIT', confidence: dominant === 'even' ? evenPct60 : oddPct60, reason: `Waiting for entry pattern` };
  }

  let oppositeCount = 0;
  currentIdx--;
  while (currentIdx >= 0) {
    const d = ticks60[currentIdx];
    const isOpposite = dominant === 'even' ? d % 2 !== 0 : d % 2 === 0;
    if (isOpposite) {
      oppositeCount++;
      currentIdx--;
    } else {
      break;
    }
  }

  if (oppositeCount >= 2) {
    let dominantCount = 0;
    while (currentIdx >= 0) {
      const d = ticks60[currentIdx];
      const isDom = dominant === 'even' ? d % 2 === 0 : d % 2 !== 0;
      if (isDom) {
        dominantCount++;
        currentIdx--;
      } else {
        break;
      }
    }

    if (dominantCount >= 7) {
      return {
        strategy: 'even-odd',
        market: symbol,
        action: 'TRADE',
        prediction: dominant,
        contractType: dominant === 'even' ? 'DIGITEVEN' : 'DIGITODD',
        confidence: dominant === 'even' ? evenPct60 : oddPct60,
        reason: `Entry condition met! Pattern found.`
      };
    }
  }

  const last10 = ticks60.slice(-10);
  let recentOppositeCount = 0;
  for (const d of last10) {
    const isOpp = dominant === 'even' ? d % 2 !== 0 : d % 2 === 0;
    if (isOpp) recentOppositeCount++;
  }
  if (recentOppositeCount >= 7) {
    return { strategy: 'even-odd', market: symbol, action: 'COOLDOWN', confidence: dominant === 'even' ? evenPct60 : oddPct60, reason: `Market shifted to opposite direction. Cooldown.` };
  }

  return { strategy: 'even-odd', market: symbol, action: 'WAIT', confidence: dominant === 'even' ? evenPct60 : oddPct60, reason: `Waiting for entry pattern ([7+ ${dominant}], [2+ opp], [1 ${dominant}])` };
}

// --- Differs Strategy ---
export function analyzeDiffers(
  ticks60: number[],
  symbol: string
): AutotraderSignal {
  if (ticks60.length < 60) return { strategy: 'differs', market: symbol, action: 'WAIT', confidence: 0, reason: `Waiting for 60 ticks (${ticks60.length}/60)` };

  const digitStats = computeDigitStats(ticks60);
  const sortedDigits = digitStats.percents.map((pct, idx) => ({ digit: idx, pct })).sort((a, b) => b.pct - a.pct);
  
  const mostAppearing = sortedDigits[0].digit;
  const secondMostAppearing = sortedDigits[1].digit;
  const leastAppearing = sortedDigits[9].digit;

  let constantDigit = -1;
  let bestPct = 100;

  for (let i = sortedDigits.length - 1; i >= 0; i--) {
    const item = sortedDigits[i];
    if (item.pct < 10 && item.digit !== mostAppearing && item.digit !== secondMostAppearing && item.digit !== leastAppearing) {
      constantDigit = item.digit;
      bestPct = item.pct;
      break;
    }
  }

  if (constantDigit === -1) {
    return { strategy: 'differs', market: symbol, action: 'WAIT', confidence: 0, reason: `No qualifying constant digit found` };
  }

  const lastTick = ticks60[ticks60.length - 1];
  if (lastTick === constantDigit) {
     return { strategy: 'differs', market: symbol, action: 'COOLDOWN', confidence: 100 - bestPct, reason: `Target digit (${constantDigit}) just appeared. Cooldown.` };
  }

  return {
    strategy: 'differs',
    market: symbol,
    action: 'TRADE',
    prediction: constantDigit,
    barrier: constantDigit, // For differs, barrier is the predicted digit to differ from
    contractType: 'DIGITDIFF',
    confidence: 100 - bestPct,
    reason: `Selected constant digit: ${constantDigit} (${bestPct.toFixed(1)}%)`
  };
}

export function evaluateMarkets(signals: AutotraderSignal[]): AutotraderSignal | null {
  const readyToTrade = signals.filter(s => s.action === 'TRADE');
  if (readyToTrade.length === 0) return null;
  readyToTrade.sort((a, b) => b.confidence - a.confidence);
  return readyToTrade[0];
}
