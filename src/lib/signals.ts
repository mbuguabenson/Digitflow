import { computeDigitStats, computeEvenOddStats, computeOverUnderStats } from '@/lib/analysis';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnalysisResult {
  digitFrequencies: { digit: number; count: number; percentage: number }[];
  evenCount: number;
  oddCount: number;
  evenPercentage: number;
  oddPercentage: number;
  highCount: number;
  lowCount: number;
  highPercentage: number;
  lowPercentage: number;
  entropy: number;
  powerIndex: { strongest: number; weakest: number; gap: number };
  missingDigits: number[];
  streaks: { digit: number; count: number }[];
  totalTicks: number;
}

export type SignalType =
  | 'even_odd' | 'over_under' | 'matches' | 'differs' | 'rise_fall'
  | 'pro_even_odd' | 'pro_over_under' | 'pro_differs'
  | 'under_7' | 'over_2';

export type SignalStatus = 'TRADE NOW' | 'WAIT' | 'NEUTRAL';

export interface Signal {
  id: string;
  type: SignalType;
  category: 'standard' | 'pro' | 'super';
  name: string;
  status: SignalStatus;
  probability: number;
  recommendation: string;
  entryCondition: string;
  targetDigit?: number;
  barrier?: number;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

export function analyzeTicks(digits: number[]): AnalysisResult {
  const stats = computeDigitStats(digits);
  const eo = computeEvenOddStats(digits);
  const ou = computeOverUnderStats(digits, 4);

  const digitFrequencies = Array.from({ length: 10 }, (_, d) => ({
    digit: d,
    count: stats.counts[d],
    percentage: stats.percents[d],
  }));

  const highCount = digits.filter((d) => d >= 5).length;
  const lowCount = digits.filter((d) => d <= 4).length;
  const highPercentage = (highCount / (digits.length || 1)) * 100;
  const lowPercentage = (lowCount / (digits.length || 1)) * 100;

  let strongest = 0, weakest = 0, maxPct = -1, minPct = 101;
  for (let d = 0; d < 10; d++) {
    if (stats.percents[d] > maxPct) { maxPct = stats.percents[d]; strongest = d; }
    if (stats.percents[d] < minPct) { minPct = stats.percents[d]; weakest = d; }
  }
  const gap = maxPct - minPct;

  let entropy = 0;
  for (let d = 0; d < 10; d++) {
    const p = stats.percents[d] / 100;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(10);
  const normalizedEntropy = (entropy / maxEntropy) * 100;

  const missingDigits: number[] = [];
  for (let d = 0; d < 10; d++) { if (stats.counts[d] === 0) missingDigits.push(d); }

  const streaks: { digit: number; count: number }[] = [];
  let curDigit = -1, curRun = 0;
  for (const d of digits) {
    if (d === curDigit) curRun++;
    else { if (curRun >= 2) streaks.push({ digit: curDigit, count: curRun }); curDigit = d; curRun = 1; }
  }
  if (curRun >= 2) streaks.push({ digit: curDigit, count: curRun });

  return {
    digitFrequencies,
    evenCount: eo.evenCount,
    oddCount: eo.oddCount,
    evenPercentage: eo.evenPercent,
    oddPercentage: eo.oddPercent,
    highCount,
    lowCount,
    highPercentage,
    lowPercentage,
    entropy: normalizedEntropy,
    powerIndex: { strongest, weakest, gap },
    missingDigits,
    streaks: streaks.slice(-10).reverse(),
    totalTicks: digits.length,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countConsecutiveLast(digits: number[], type: 'even' | 'odd'): number {
  let count = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    const isEven = digits[i] % 2 === 0;
    if (type === 'even' ? !isEven : isEven) count++;
    else break;
  }
  return count;
}

function countConsecutiveLastGT(digits: number[], threshold: number): number {
  let count = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    if (digits[i] > threshold) count++;
    else break;
  }
  return count;
}

function countConsecutiveLastLT(digits: number[], threshold: number): number {
  let count = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    if (digits[i] < threshold) count++;
    else break;
  }
  return count;
}

function countLastNOfType(digits: number[], n: number, predicate: (d: number) => boolean): number {
  return digits.slice(-n).filter(predicate).length;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Standard Signals ─────────────────────────────────────────────────────────

export function generateStandardSignals(a: AnalysisResult): Signal[] {
  const sigs: Signal[] = [];

  // 1. Even/Odd
  {
    const maxPct = Math.max(a.evenPercentage, a.oddPercentage);
    const favored = a.evenPercentage >= a.oddPercentage ? 'EVEN' : 'ODD';
    const opposite = favored === 'EVEN' ? 'odd' : 'even';
    if (maxPct >= 60) {
      sigs.push({
        id: genId(), type: 'even_odd', category: 'standard', name: 'Even/Odd',
        status: 'TRADE NOW', probability: maxPct,
        recommendation: `Strong ${favored.toLowerCase()} bias detected (${maxPct.toFixed(1)}%)`,
        entryCondition: `Wait for 2+ consecutive ${opposite} digits, then trade ${favored}`,
      });
    } else if (maxPct >= 55) {
      sigs.push({
        id: genId(), type: 'even_odd', category: 'standard', name: 'Even/Odd',
        status: 'WAIT', probability: maxPct,
        recommendation: `Moderate ${favored.toLowerCase()} bias (${maxPct.toFixed(1)}%)`,
        entryCondition: 'Monitor for stronger signal',
      });
    } else {
      sigs.push({
        id: genId(), type: 'even_odd', category: 'standard', name: 'Even/Odd',
        status: 'NEUTRAL', probability: maxPct,
        recommendation: 'No clear even/odd pattern',
        entryCondition: 'Wait for clearer bias',
      });
    }
  }

  // 2. Over/Under (4.5)
  {
    const maxPct = Math.max(a.highPercentage, a.lowPercentage);
    const favored = a.highPercentage >= a.lowPercentage ? 'OVER' : 'UNDER';
    if (maxPct >= 62 && a.powerIndex.gap >= 15) {
      sigs.push({
        id: genId(), type: 'over_under', category: 'standard', name: 'Over/Under',
        status: 'TRADE NOW', probability: maxPct,
        recommendation: `Strong ${favored.toLowerCase()} bias (${maxPct.toFixed(1)}%) with ${a.powerIndex.gap.toFixed(1)}% power gap`,
        entryCondition: `Trade ${favored} when digit ${a.powerIndex.strongest} appears`,
      });
    } else if (maxPct >= 58) {
      sigs.push({
        id: genId(), type: 'over_under', category: 'standard', name: 'Over/Under',
        status: 'WAIT', probability: maxPct,
        recommendation: `Moderate ${favored.toLowerCase()} bias (${maxPct.toFixed(1)}%)`,
        entryCondition: 'Wait for power gap to increase',
      });
    } else {
      sigs.push({
        id: genId(), type: 'over_under', category: 'standard', name: 'Over/Under',
        status: 'NEUTRAL', probability: maxPct,
        recommendation: 'No clear over/under pattern',
        entryCondition: 'Wait for clearer bias',
      });
    }
  }

  // 3. Matches
  {
    const strongestPct = a.digitFrequencies[a.powerIndex.strongest].percentage;
    if (strongestPct >= 15) {
      sigs.push({
        id: genId(), type: 'matches', category: 'standard', name: 'Matches',
        status: 'TRADE NOW', probability: strongestPct,
        recommendation: `Digit ${a.powerIndex.strongest} has strong power at ${strongestPct.toFixed(1)}%`,
        entryCondition: 'Trade Matches immediately when digit appears',
        targetDigit: a.powerIndex.strongest,
      });
    } else if (strongestPct >= 12) {
      sigs.push({
        id: genId(), type: 'matches', category: 'standard', name: 'Matches',
        status: 'WAIT', probability: strongestPct,
        recommendation: `Digit ${a.powerIndex.strongest} showing moderate frequency (${strongestPct.toFixed(1)}%)`,
        entryCondition: 'Wait for frequency to increase',
        targetDigit: a.powerIndex.strongest,
      });
    } else {
      sigs.push({
        id: genId(), type: 'matches', category: 'standard', name: 'Matches',
        status: 'NEUTRAL', probability: strongestPct,
        recommendation: 'No dominant digit pattern',
        entryCondition: 'Wait for dominant digit to emerge',
      });
    }
  }

  // 4. Differs
  {
    const weakestPct = a.digitFrequencies[a.powerIndex.weakest].percentage;
    if (weakestPct < 9) {
      const prob = 100 - weakestPct;
      sigs.push({
        id: genId(), type: 'differs', category: 'standard', name: 'Differs',
        status: 'TRADE NOW', probability: prob,
        recommendation: `Digit ${a.powerIndex.weakest} appears only ${weakestPct.toFixed(1)}% — Strong differs signal`,
        entryCondition: 'Wait for rare digit to appear, then trade DIFFERS',
        targetDigit: a.powerIndex.weakest,
      });
    } else {
      sigs.push({
        id: genId(), type: 'differs', category: 'standard', name: 'Differs',
        status: 'NEUTRAL', probability: 100 - weakestPct,
        recommendation: 'No clear differs pattern',
        entryCondition: 'Wait for rare digit to emerge',
        targetDigit: a.powerIndex.weakest,
      });
    }
  }

  return sigs;
}

// ─── Rise/Fall Signal ────────────────────────────────────────────────────────

export function generateRiseFallSignal(quotes: number[]): Signal {
  if (quotes.length < 2) {
    return {
      id: genId(), type: 'rise_fall', category: 'standard', name: 'Rise/Fall',
      status: 'NEUTRAL', probability: 0,
      recommendation: 'Insufficient data for trend detection',
      entryCondition: 'Wait for more ticks',
    };
  }
  const last10 = quotes.slice(-10);
  const trend = last10[last10.length - 1] - last10[0];
  const direction = trend >= 0 ? 'RISE' : 'FALL';
  const confidence = Math.min(60 + Math.abs(trend) * 100, 75);

  return {
    id: genId(), type: 'rise_fall', category: 'standard', name: 'Rise/Fall',
    status: confidence >= 60 ? 'TRADE NOW' : 'NEUTRAL',
    probability: confidence,
    recommendation: `${direction} trend detected with ${confidence.toFixed(1)}% confidence`,
    entryCondition: `Trade ${direction} in detected direction`,
  };
}

// ─── Pro Signals ──────────────────────────────────────────────────────────────

export function generateProSignals(a: AnalysisResult, digits: number[]): Signal[] {
  const sigs: Signal[] = [];

  // Pro Even/Odd
  {
    const evenDigits = a.digitFrequencies.filter((f) => f.digit % 2 === 0 && f.percentage >= 11);
    const strongEven = a.evenPercentage >= 55 && evenDigits.length >= 2 && a.powerIndex.strongest % 2 === 0 && countLastNOfType(digits, 20, (d) => d % 2 === 0) >= 11;
    if (strongEven) {
      const consecOdd = countConsecutiveLast(digits, 'odd');
      if (consecOdd >= 3) {
        sigs.push({
          id: genId(), type: 'pro_even_odd', category: 'pro', name: 'Pro Even/Odd',
          status: 'TRADE NOW', probability: a.evenPercentage,
          recommendation: `EVEN STRATEGY: ${consecOdd} consecutive odds detected — Enter EVEN now!`,
          entryCondition: 'Enter EVEN immediately after first even digit appears',
        });
      } else {
        sigs.push({
          id: genId(), type: 'pro_even_odd', category: 'pro', name: 'Pro Even/Odd',
          status: 'WAIT', probability: a.evenPercentage,
          recommendation: 'EVEN conditions met — Waiting for 3+ consecutive ODD digits',
          entryCondition: 'Wait for 3+ consecutive ODD digits, then enter EVEN',
        });
      }
    }
    const oddDigits = a.digitFrequencies.filter((f) => f.digit % 2 !== 0 && f.percentage >= 11);
    const strongOdd = a.oddPercentage >= 70 && oddDigits.length >= 2 && a.powerIndex.strongest % 2 !== 0 && countLastNOfType(digits, 20, (d) => d % 2 !== 0) >= 14;
    if (strongOdd) {
      const consecEven = countConsecutiveLast(digits, 'even');
      if (consecEven >= 3) {
        sigs.push({
          id: genId(), type: 'pro_even_odd', category: 'pro', name: 'Pro Even/Odd',
          status: 'TRADE NOW', probability: a.oddPercentage,
          recommendation: `ODD STRATEGY: ${consecEven} consecutive evens detected — Enter ODD now!`,
          entryCondition: 'Enter ODD immediately after first odd digit appears',
        });
      } else {
        sigs.push({
          id: genId(), type: 'pro_even_odd', category: 'pro', name: 'Pro Even/Odd',
          status: 'WAIT', probability: a.oddPercentage,
          recommendation: 'ODD conditions met — Waiting for 3+ consecutive EVEN digits',
          entryCondition: 'Wait for 3+ consecutive EVEN digits, then enter ODD',
        });
      }
    }
  }

  // Pro Over/Under — Over 1 Strategy
  {
    const d0Pct = a.digitFrequencies[0].percentage;
    const d1Pct = a.digitFrequencies[1].percentage;
    const strongDigits = a.digitFrequencies.filter((f) => f.digit >= 2 && f.percentage >= 11).length;
    if (d0Pct < 10 && d1Pct < 10 && strongDigits >= 3 && (a.powerIndex.weakest === 0 || a.powerIndex.weakest === 1) && a.highPercentage >= 90) {
      const last20GT1 = countLastNOfType(digits, 20, (d) => d > 1);
      if (last20GT1 >= 18) {
        sigs.push({
          id: genId(), type: 'pro_over_under', category: 'pro', name: 'Pro Over 1',
          status: 'TRADE NOW', probability: a.highPercentage,
          recommendation: 'OVER 1 STRATEGY: Strong signal — 90%+ win rate detected!',
          entryCondition: 'Wait for 1+ UNDER digits, then enter OVER 1 immediately',
          barrier: 1,
        });
      }
    }
  }

  // Pro Over/Under — Under 8 Strategy
  {
    const d8Pct = a.digitFrequencies[8].percentage;
    const d9Pct = a.digitFrequencies[9].percentage;
    const strongDigits = a.digitFrequencies.filter((f) => f.digit <= 7 && f.percentage >= 11).length;
    if (d8Pct < 10 && d9Pct < 10 && strongDigits >= 3 && (a.powerIndex.weakest === 8 || a.powerIndex.weakest === 9) && a.lowPercentage >= 90) {
      const last20LT8 = countLastNOfType(digits, 20, (d) => d < 8);
      if (last20LT8 >= 18) {
        sigs.push({
          id: genId(), type: 'pro_over_under', category: 'pro', name: 'Pro Under 8',
          status: 'TRADE NOW', probability: a.lowPercentage,
          recommendation: 'UNDER 8 STRATEGY: Strong signal — 90%+ win rate detected!',
          entryCondition: 'Wait for 1+ OVER digits, then enter UNDER 8 immediately',
          barrier: 8,
        });
      }
    }
  }

  // Under 7 Strategy
  {
    const highDigits = a.digitFrequencies.filter((f) => f.digit >= 7 && f.percentage < 10);
    const lowPctSum = a.digitFrequencies.filter((f) => f.digit <= 6).reduce((s, f) => s + f.percentage, 0);
    if (highDigits.length >= 2 && lowPctSum >= 70) {
      const entryDigit = a.digitFrequencies.filter((f) => f.digit >= 7).sort((a, b) => b.percentage - a.percentage)[0];
      sigs.push({
        id: genId(), type: 'under_7', category: 'pro', name: 'Pro Under 7',
        status: 'TRADE NOW', probability: lowPctSum,
        recommendation: `UNDER 7 STRATEGY: Digits 0-6 dominant at ${lowPctSum.toFixed(1)}%`,
        entryCondition: entryDigit ? `Enter UNDER 7 when digit ${entryDigit.digit} appears (>10%)` : 'Enter UNDER 7 on any 7+ digit',
        barrier: 7,
      });
    }
  }

  // Over 2 Strategy
  {
    const lowDigits = a.digitFrequencies.filter((f) => f.digit <= 2 && f.percentage < 10);
    const highPctSum = a.digitFrequencies.filter((f) => f.digit >= 3).reduce((s, f) => s + f.percentage, 0);
    if (lowDigits.length >= 2 && highPctSum >= 70) {
      const entryDigit = a.digitFrequencies.filter((f) => f.digit <= 2).sort((a, b) => b.percentage - a.percentage)[0];
      sigs.push({
        id: genId(), type: 'over_2', category: 'pro', name: 'Pro Over 2',
        status: 'TRADE NOW', probability: highPctSum,
        recommendation: `OVER 2 STRATEGY: Digits 3-9 dominant at ${highPctSum.toFixed(1)}%`,
        entryCondition: entryDigit ? `Enter OVER 2 when digit ${entryDigit.digit} appears (>10%)` : 'Enter OVER 2 on any 0-2 digit',
        barrier: 2,
      });
    }
  }

  // Pro Differs — multiple rare digits
  {
    const rareDigits = a.digitFrequencies.filter((f) => f.percentage < 9);
    if (rareDigits.length >= 2) {
      const combinedRarity = rareDigits.reduce((s, f) => s + (100 - f.percentage), 0) / rareDigits.length;
      if (combinedRarity >= 92) {
        const target = rareDigits.sort((a, b) => a.percentage - b.percentage)[0];
        sigs.push({
          id: genId(), type: 'pro_differs', category: 'pro', name: 'Pro Differs',
          status: 'TRADE NOW', probability: combinedRarity,
          recommendation: `PRO DIFFERS: ${rareDigits.length} digits below 9% — extreme rarity`,
          entryCondition: `Trade DIFFERS when digit ${target.digit} appears`,
          targetDigit: target.digit,
        });
      }
    }
  }

  return sigs;
}

// ─── Super Signals (real-time scan) ───────────────────────────────────────────

export function generateSuperSignals(a: AnalysisResult, digits: number[], quotes: number[]): Signal[] {
  const sigs: Signal[] = [];

  // Over 4.5
  if (a.highPercentage >= 65) {
    sigs.push({
      id: genId(), type: 'over_under', category: 'super', name: 'Super Over 4.5',
      status: a.highPercentage >= 90 ? 'TRADE NOW' : a.highPercentage >= 75 ? 'TRADE NOW' : 'WAIT',
      probability: a.highPercentage,
      recommendation: `High digits (5-9) at ${a.highPercentage.toFixed(1)}%`,
      entryCondition: 'Trade OVER when opportunity arises',
      barrier: 4,
    });
  }

  // Under 4.5
  if (a.lowPercentage >= 65) {
    sigs.push({
      id: genId(), type: 'over_under', category: 'super', name: 'Super Under 4.5',
      status: a.lowPercentage >= 75 ? 'TRADE NOW' : 'WAIT',
      probability: a.lowPercentage,
      recommendation: `Low digits (0-4) at ${a.lowPercentage.toFixed(1)}%`,
      entryCondition: 'Trade UNDER when opportunity arises',
      barrier: 4,
    });
  }

  // Even with pattern
  if (a.evenPercentage >= 65) {
    const consecOdd = countConsecutiveLast(digits, 'odd');
    sigs.push({
      id: genId(), type: 'even_odd', category: 'super', name: 'Super Even',
      status: consecOdd >= 2 ? 'TRADE NOW' : 'WAIT',
      probability: a.evenPercentage,
      recommendation: `Even bias at ${a.evenPercentage.toFixed(1)}%${consecOdd >= 2 ? ` — ${consecOdd} consecutive odds` : ''}`,
      entryCondition: consecOdd >= 2 ? 'Enter EVEN now' : 'Wait for 2+ consecutive odds',
    });
  }

  // Odd with pattern
  if (a.oddPercentage >= 70) {
    const consecEven = countConsecutiveLast(digits, 'even');
    sigs.push({
      id: genId(), type: 'even_odd', category: 'super', name: 'Super Odd',
      status: consecEven >= 2 ? 'TRADE NOW' : 'WAIT',
      probability: a.oddPercentage,
      recommendation: `Odd bias at ${a.oddPercentage.toFixed(1)}%${consecEven >= 2 ? ` — ${consecEven} consecutive evens` : ''}`,
      entryCondition: consecEven >= 2 ? 'Enter ODD now' : 'Wait for 2+ consecutive evens',
    });
  }

  // Rise/Fall
  const rfSig = generateRiseFallSignal(quotes);
  if (rfSig.probability >= 60) {
    sigs.push({ ...rfSig, id: genId(), category: 'super', name: 'Super Rise/Fall' });
  }

  // Differs — rare digit
  {
    const weakestPct = a.digitFrequencies[a.powerIndex.weakest].percentage;
    if (weakestPct < 8) {
      sigs.push({
        id: genId(), type: 'differs', category: 'super', name: 'Super Differs',
        status: 'TRADE NOW', probability: 100 - weakestPct,
        recommendation: `Digit ${a.powerIndex.weakest} extremely rare at ${weakestPct.toFixed(1)}%`,
        entryCondition: `Trade DIFFERS when digit ${a.powerIndex.weakest} appears`,
        targetDigit: a.powerIndex.weakest,
      });
    }
  }

  // Over 2 / Under 7 from pro
  const pro = generateProSignals(a, digits);
  for (const p of pro) {
    if (p.probability >= 65) sigs.push({ ...p, id: genId(), category: 'super', name: `Super ${p.name}` });
  }

  return sigs
    .filter((s) => s.probability >= 55)
    .sort((a, b) => b.probability - a.probability);
}
