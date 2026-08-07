// Trading Engine: strategy types, market analysis, signal generation, auto-stake

import {
  computeDigitStats, computeOverUnderStats, computeEvenOddStats,
  computeStreaks, computeMatchesStats, computeDiffersStats,
} from '@/lib/analysis';

// ─── Strategy Types ──────────────────────────────────────────────────────────
export type StrategyId =
  | 'over-under' | 'even-odd' | 'differs' | 'matches'
  | 'rise-fall' | 'high-low';

export type StrategyInfo = {
  id: StrategyId;
  label: string;
  short: string;
  description: string;
  threshold: number; // % deviation needed for signal
};

export const STRATEGIES: StrategyInfo[] = [
  { id: 'over-under', label: 'Over/Under', short: 'O/U', description: 'Analyzes Over 5-9 vs Under 0-4 markets', threshold: 55 },
  { id: 'even-odd', label: 'Even/Odd', short: 'E/O', description: 'Even vs Odd digit dominance', threshold: 7 },
  { id: 'differs', label: 'Differs', short: 'DIF', description: 'Identifies the coldest digit to trade differs', threshold: 10 },
  { id: 'matches', label: 'Matches', short: 'MAT', description: 'Identifies the hottest digit to trade matches', threshold: 12 },
  { id: 'rise-fall', label: 'Rise/Fall', short: 'R/F', description: 'Tick-by-tick price movement analysis', threshold: 8 },
  { id: 'high-low', label: 'High/Low Ticks', short: 'H/L', description: 'High/Low tick barrier analysis', threshold: 55 },
];

// ─── Market Analysis ─────────────────────────────────────────────────────────
export type MarketAnalysis = {
  symbol: string;
  displayName: string;
  digits: number[];
  digitStats: ReturnType<typeof computeDigitStats>;
  overUnder5: ReturnType<typeof computeOverUnderStats>;
  overUnder4: ReturnType<typeof computeOverUnderStats>;
  overUnder6: ReturnType<typeof computeOverUnderStats>;
  evenOdd: ReturnType<typeof computeEvenOddStats>;
  streaks: ReturnType<typeof computeStreaks>;
  matches: ReturnType<typeof computeMatchesStats>;
  differs: ReturnType<typeof computeDiffersStats>;
  hottestDigit: number;
  coldestDigit: number;
  hottestPercent: number;
  coldestPercent: number;
  // Over/Under specific
  overPower: number; // % of over digits (5-9)
  underPower: number; // % of under digits (0-4)
  overDigits: number[]; // digits in over range sorted by frequency
  underDigits: number[]; // digits in under range sorted by frequency
  topOverDigit: number;
  topUnderDigit: number;
  // Even/Odd
  evenPower: number;
  oddPower: number;
  evenOddDeviation: number;
  // Rise/Fall
  riseCount: number;
  fallCount: number;
  risePercent: number;
  fallPercent: number;
  riseFallDeviation: number;
  // Last 15 ticks trend
  last15Trend: 'up' | 'down' | 'flat';
  // 500→60 tick guidance
  longTermBias: 'over' | 'under' | 'even' | 'odd' | 'neutral';
  longTermBiasPercent: number;
};

export function analyzeMarket(
  symbol: string,
  displayName: string,
  digits: number[],
  quotes: number[] = [],
): MarketAnalysis {
  const digitStats = computeDigitStats(digits);
  const overUnder5 = computeOverUnderStats(digits, 5);
  const overUnder4 = computeOverUnderStats(digits, 4);
  const overUnder6 = computeOverUnderStats(digits, 6);
  const evenOdd = computeEvenOddStats(digits);
  const streaks = computeStreaks(digits);
  const matches = computeMatchesStats(digits);
  const differs = computeDiffersStats(digits);

  // Hottest / coldest
  let hottestDigit = 0, coldestDigit = 0, maxPct = -1, minPct = 101;
  for (let i = 0; i <= 9; i++) {
    if (digitStats.percents[i] > maxPct) { maxPct = digitStats.percents[i]; hottestDigit = i; }
    if (digitStats.percents[i] < minPct) { minPct = digitStats.percents[i]; coldestDigit = i; }
  }

  // Over/Under power
  const overDigits = [5, 6, 7, 8, 9].sort((a, b) => digitStats.percents[b] - digitStats.percents[a]);
  const underDigits = [0, 1, 2, 3, 4].sort((a, b) => digitStats.percents[b] - digitStats.percents[a]);
  const overPower = overUnder5.overPercent;
  const underPower = overUnder5.underPercent;

  // Even/Odd
  const evenPower = evenOdd.evenPercent;
  const oddPower = evenOdd.oddPercent;
  const evenOddDeviation = Math.abs(evenPower - oddPower);

  // Rise/Fall from quotes
  let riseCount = 0, fallCount = 0;
  for (let i = 1; i < quotes.length; i++) {
    if (quotes[i] > quotes[i - 1]) riseCount++;
    else if (quotes[i] < quotes[i - 1]) fallCount++;
  }
  const totalMoves = riseCount + fallCount || 1;
  const risePercent = (riseCount / totalMoves) * 100;
  const fallPercent = (fallCount / totalMoves) * 100;
  const riseFallDeviation = Math.abs(risePercent - fallPercent);

  // Last 15 ticks trend
  const last15 = digits.slice(-15);
  const last15Avg = last15.reduce((a, b) => a + b, 0) / (last15.length || 1);
  const prev15 = digits.slice(-30, -15);
  const prev15Avg = prev15.reduce((a, b) => a + b, 0) / (prev15.length || 1);
  const last15Trend: 'up' | 'down' | 'flat' =
    last15Avg > prev15Avg + 0.5 ? 'up' : last15Avg < prev15Avg - 0.5 ? 'down' : 'flat';

  // Long-term bias (500→60 ticks)
  const longSlice = digits.slice(-500, -60);
  const longOU = computeOverUnderStats(longSlice.length ? longSlice : digits, 5);
  const longEO = computeEvenOddStats(longSlice.length ? longSlice : digits);
  let longTermBias: MarketAnalysis['longTermBias'] = 'neutral';
  let longTermBiasPercent = 0;
  if (Math.abs(longOU.overPercent - longOU.underPercent) > Math.abs(longEO.evenPercent - longEO.oddPercent)) {
    if (longOU.overPercent > longOU.underPercent) { longTermBias = 'over'; longTermBiasPercent = longOU.overPercent; }
    else { longTermBias = 'under'; longTermBiasPercent = longOU.underPercent; }
  } else {
    if (longEO.evenPercent > longEO.oddPercent) { longTermBias = 'even'; longTermBiasPercent = longEO.evenPercent; }
    else { longTermBias = 'odd'; longTermBiasPercent = longEO.oddPercent; }
  }

  return {
    symbol, displayName, digits, digitStats,
    overUnder5, overUnder4, overUnder6, evenOdd, streaks, matches, differs,
    hottestDigit, coldestDigit, hottestPercent: maxPct, coldestPercent: minPct,
    overPower, underPower, overDigits, underDigits,
    topOverDigit: overDigits[0], topUnderDigit: underDigits[0],
    evenPower, oddPower, evenOddDeviation,
    riseCount, fallCount, risePercent, fallPercent, riseFallDeviation,
    last15Trend, longTermBias, longTermBiasPercent,
  };
}

// ─── Signal Generation ────────────────────────────────────────────────────────
export type TradingSignal = {
  strategy: StrategyId;
  action: 'BUY' | 'WAIT' | 'AVOID';
  side: string; // e.g. "Over", "Under", "Even", "Odd", "Rise", "Fall"
  targetDigit?: number;
  entryDigit?: number; // digit to wait for before entering
  skipTicks: number; // ticks to skip before entry
  confidence: 'high' | 'medium' | 'low';
  confidencePercent: number;
  reason: string;
  warning?: string;
};

export function generateSignal(analysis: MarketAnalysis, strategy: StrategyId): TradingSignal {
  const digits = analysis.digits;

  switch (strategy) {
    case 'over-under': {
      const { overPower, underPower, topOverDigit, topUnderDigit, last15Trend } = analysis;
      const dominant = overPower >= underPower ? 'over' : 'under';
      const dominantPower = Math.max(overPower, underPower);
      const weakPower = Math.min(overPower, underPower);
      const entryDigit = dominant === 'over' ? topOverDigit : topUnderDigit;
      const oppositeDigit = dominant === 'over' ? topUnderDigit : topOverDigit;

      // Count digits with high appearance in dominant side
      const dominantDigits = dominant === 'over' ? analysis.overDigits : analysis.underDigits;
      const strongDigits = dominantDigits.filter(d => analysis.digitStats.percents[d] > 10).length;

      // Check if opposite side is disturbing (increasing power)
      const recent20 = digits.slice(-20);
      const recentOU = computeOverUnderStats(recent20, 5);
      const recentWeakPower = dominant === 'over' ? recentOU.underPercent : recentOU.overPercent;
      const recentDominantPower = dominant === 'over' ? recentOU.overPercent : recentOU.underPercent;
      const weakIncreasing = recentWeakPower > weakPower + 5;

      // Trend must favor
      const trendFavor = dominant === 'over' ? last15Trend !== 'down' : last15Trend !== 'up';

      // Skip ticks: look at pattern after entry digit
      let skipTicks = 0;
      if (entryDigit !== null && entryDigit !== undefined) {
        for (let i = digits.length - 1; i >= Math.max(0, digits.length - 5); i--) {
          if (digits[i] === oppositeDigit) { skipTicks = digits.length - i; break; }
        }
        skipTicks = Math.min(skipTicks, 5);
      }

      if (dominantPower >= 55 && strongDigits >= 2 && trendFavor) {
        const confidence: TradingSignal['confidence'] = dominantPower >= 60 ? 'high' : 'medium';
        return {
          strategy, action: 'BUY', side: dominant === 'over' ? 'Over' : 'Under',
          targetDigit: entryDigit, entryDigit, skipTicks,
          confidence, confidencePercent: dominantPower,
          reason: `${dominant === 'over' ? 'Over' : 'Under'} power at ${dominantPower.toFixed(1)}% with ${strongDigits} strong digits`,
          warning: weakIncreasing ? `Warning: opposite side power increasing (${recentWeakPower.toFixed(1)}%)` : undefined,
        };
      }
      return {
        strategy, action: 'WAIT', side: dominant === 'over' ? 'Over' : 'Under',
        entryDigit, skipTicks,
        confidence: 'low', confidencePercent: dominantPower,
        reason: `Dominant side below 55% threshold (${dominantPower.toFixed(1)}%)`,
        warning: weakIncreasing ? `Opposite side increasing` : undefined,
      };
    }

    case 'even-odd': {
      const { evenPower, oddPower, evenOddDeviation } = analysis;
      const dominant = evenPower >= oddPower ? 'Even' : 'Odd';
      const dominantPower = Math.max(evenPower, oddPower);

      if (evenOddDeviation >= 7) {
        return {
          strategy, action: 'BUY', side: dominant,
          confidence: evenOddDeviation >= 12 ? 'high' : 'medium',
          confidencePercent: dominantPower,
          reason: `${dominant} dominance at ${dominantPower.toFixed(1)}% (deviation ${evenOddDeviation.toFixed(1)}%)`,
          skipTicks: 0,
        };
      }
      return {
        strategy, action: 'WAIT', side: dominant,
        confidence: 'low', confidencePercent: dominantPower,
        reason: `Deviation below 7% threshold (${evenOddDeviation.toFixed(1)}%)`,
        skipTicks: 0,
      };
    }

    case 'rise-fall': {
      const { risePercent, fallPercent, riseFallDeviation } = analysis;
      const dominant = risePercent >= fallPercent ? 'Rise' : 'Fall';
      const dominantPower = Math.max(risePercent, fallPercent);

      if (riseFallDeviation >= 8) {
        return {
          strategy, action: 'BUY', side: dominant,
          confidence: riseFallDeviation >= 15 ? 'high' : 'medium',
          confidencePercent: dominantPower,
          reason: `${dominant} trend at ${dominantPower.toFixed(1)}% (deviation ${riseFallDeviation.toFixed(1)}%)`,
          skipTicks: 0,
        };
      }
      return {
        strategy, action: 'WAIT', side: dominant,
        confidence: 'low', confidencePercent: dominantPower,
        reason: `Directional deviation below 8% (${riseFallDeviation.toFixed(1)}%)`,
        skipTicks: 0,
      };
    }

    case 'differs': {
      const { coldestDigit, coldestPercent } = analysis;
      if (coldestPercent < 10) {
        return {
          strategy, action: 'BUY', side: 'Differs', targetDigit: coldestDigit,
          confidence: coldestPercent < 6 ? 'high' : 'medium',
          confidencePercent: 100 - coldestPercent,
          reason: `Digit ${coldestDigit} is coldest at ${coldestPercent.toFixed(1)}% (below 10% expectation)`,
          skipTicks: 0,
        };
      }
      return {
        strategy, action: 'WAIT', side: 'Differs', targetDigit: coldestDigit,
        confidence: 'low', confidencePercent: 100 - coldestPercent,
        reason: `Coldest digit ${coldestDigit} at ${coldestPercent.toFixed(1)}% — not below 10%`,
        skipTicks: 0,
      };
    }

    case 'matches': {
      const { hottestDigit, hottestPercent } = analysis;
      if (hottestPercent >= 12) {
        return {
          strategy, action: 'BUY', side: 'Matches', targetDigit: hottestDigit,
          confidence: hottestPercent >= 16 ? 'high' : 'medium',
          confidencePercent: hottestPercent,
          reason: `Digit ${hottestDigit} is hottest at ${hottestPercent.toFixed(1)}% (high power score)`,
          skipTicks: 0,
        };
      }
      return {
        strategy, action: 'WAIT', side: 'Matches', targetDigit: hottestDigit,
        confidence: 'low', confidencePercent: hottestPercent,
        reason: `Hottest digit ${hottestDigit} at ${hottestPercent.toFixed(1)}% — below 12% threshold`,
        skipTicks: 0,
      };
    }

    case 'high-low': {
      const { overPower, underPower } = analysis;
      const dominant = overPower >= underPower ? 'High' : 'Low';
      const dominantPower = Math.max(overPower, underPower);
      if (dominantPower >= 55) {
        return {
          strategy, action: 'BUY', side: dominant,
          confidence: dominantPower >= 60 ? 'high' : 'medium',
          confidencePercent: dominantPower,
          reason: `${dominant} tick dominance at ${dominantPower.toFixed(1)}%`,
          skipTicks: 0,
        };
      }
      return {
        strategy, action: 'WAIT', side: dominant,
        confidence: 'low', confidencePercent: dominantPower,
        reason: `Dominance below 55% (${dominantPower.toFixed(1)}%)`,
        skipTicks: 0,
      };
    }
  }
}

// ─── Auto-Stake Calculation ──────────────────────────────────────────────────
export function calcAutoStake(
  balance: number,
  riskPercent: number,
  strategy: StrategyId,
  sessionsPerDay: number,
): { stake: number; dailyStopLoss: number; riskPerSession: number } {
  const riskAmount = balance * (riskPercent / 100);
  const stake = parseFloat(Math.max(0.35, riskAmount).toFixed(2));
  // Daily stop loss = 5 consecutive losses worth
  const dailyStopLoss = parseFloat((stake * 5).toFixed(2));
  // Risk per session = total daily risk / sessions
  const riskPerSession = parseFloat(((balance * (riskPercent / 100)) / (sessionsPerDay || 1)).toFixed(2));
  return { stake, dailyStopLoss, riskPerSession };
}

// ─── Martingale for Over 1,2,3 / Under 6,7,8 ──────────────────────────────────
export const MARTINGALE_TABLE: Record<string, number> = {
  'over_3': 1.5, 'under_6': 1.5,
  'over_2': 2.1, 'under_7': 2.1,
  'over_1': 3.1, 'under_8': 3.1,
};

export function getMartingaleMultiplier(barrier: string, contractType: 'over' | 'under'): number {
  const key = `${contractType}_${barrier}`;
  return MARTINGALE_TABLE[key] ?? 2;
}

// ─── Deriv Contract Mapping ───────────────────────────────────────────────────
export function strategyToContract(
  strategy: StrategyId,
  side: string,
  targetDigit?: number,
  barrier?: string,
): { contractType: string; barrier?: string } {
  switch (strategy) {
    case 'over-under':
      if (side === 'Over') return { contractType: 'DIGITOVER', barrier: barrier ?? '5' };
      return { contractType: 'DIGITUNDER', barrier: barrier ?? '4' };
    case 'even-odd':
      return { contractType: side === 'Even' ? 'DIGITEVEN' : 'DIGITODD' };
    case 'differs':
      return { contractType: 'DIGITDIFF', barrier: String(targetDigit ?? 0) };
    case 'matches':
      return { contractType: 'DIGITMATCH', barrier: String(targetDigit ?? 0) };
    case 'rise-fall':
      return { contractType: side === 'Rise' ? 'CALL' : 'PUT' };
    case 'high-low':
      return { contractType: side === 'High' ? 'CALL' : 'PUT' };
  }
}

// ─── Volatility Markets ──────────────────────────────────────────────────────
export const VOLATILITY_SYMBOLS = [
  { symbol: 'R_10', display: 'Volatility 10 Index' },
  { symbol: 'R_25', display: 'Volatility 25 Index' },
  { symbol: 'R_50', display: 'Volatility 50 Index' },
  { symbol: 'R_75', display: 'Volatility 75 Index' },
  { symbol: 'R_100', display: 'Volatility 100 Index' },
  { symbol: 'BOOM500', display: 'Boom 500 Index' },
  { symbol: 'BOOM1000', display: 'Boom 1000 Index' },
  { symbol: 'CRASH500', display: 'Crash 500 Index' },
  { symbol: 'CRASH1000', display: 'Crash 1000 Index' },
  { symbol: 'JD10', display: 'Jump 10 Index' },
  { symbol: 'JD25', display: 'Jump 25 Index' },
  { symbol: 'JD50', display: 'Jump 50 Index' },
  { symbol: 'JD75', display: 'Jump 75 Index' },
  { symbol: 'JD100', display: 'Jump 100 Index' },
];

// ─── Transaction History ─────────────────────────────────────────────────────
export type Transaction = {
  id: string;
  time: string;
  symbol: string;
  strategy: string;
  side: string;
  stake: number;
  result: 'win' | 'loss' | 'pending';
  payout: number;
  profit: number;
  contractId?: string;
};

export type TradeStats = {
  totalRuns: number;
  wins: number;
  losses: number;
  totalStake: number;
  totalProfit: number;
};

export function calcTradeStats(transactions: Transaction[]): TradeStats {
  let wins = 0, losses = 0, totalStake = 0, totalProfit = 0;
  for (const t of transactions) {
    if (t.result === 'win') wins++;
    else if (t.result === 'loss') losses++;
    totalStake += Number(t.stake) || 0;
    totalProfit += Number(t.profit) || 0;
  }
  return { totalRuns: transactions.length, wins, losses, totalStake, totalProfit };
}
