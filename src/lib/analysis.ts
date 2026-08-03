export type DigitStats = {
  counts: number[]; // index 0-9
  percents: number[];
  total: number;
};

export type EvenOddStats = {
  evenCount: number;
  oddCount: number;
  evenPercent: number;
  oddPercent: number;
};

export type OverUnderStats = {
  overCount: number;
  underCount: number;
  overPercent: number;
  underPercent: number;
};

export type StreakInfo = {
  current: number;
  type: 'digit' | 'even' | 'odd' | 'over' | 'under' | null;
  digitValue: number | null;
};

export function computeDigitStats(digits: number[]): DigitStats {
  const counts = new Array(10).fill(0);
  for (const d of digits) {
    if (d >= 0 && d <= 9) counts[d]++;
  }
  const total = digits.length || 1;
  const percents = counts.map((c) => (c / total) * 100);
  return { counts, percents, total: digits.length };
}

export function computeEvenOddStats(digits: number[]): EvenOddStats {
  let evenCount = 0;
  let oddCount = 0;
  for (const d of digits) {
    if (d % 2 === 0) evenCount++;
    else oddCount++;
  }
  const total = digits.length || 1;
  return {
    evenCount,
    oddCount,
    evenPercent: (evenCount / total) * 100,
    oddPercent: (oddCount / total) * 100,
  };
}

export function computeOverUnderStats(digits: number[], barrier: number): OverUnderStats {
  let overCount = 0;
  let underCount = 0;
  for (const d of digits) {
    if (d > barrier) overCount++;
    else if (d < barrier) underCount++;
  }
  const total = digits.length || 1;
  return {
    overCount,
    underCount,
    overPercent: (overCount / total) * 100,
    underPercent: (underCount / total) * 100,
  };
}

export function computeStreaks(digits: number[]): {
  longestDigit: Record<number, number>;
  longestEven: number;
  longestOdd: number;
  longestOver: Record<number, number>;
  longestUnder: Record<number, number>;
  currentStreak: StreakInfo;
} {
  const longestDigit: Record<number, number> = {};
  const longestOver: Record<number, number> = {};
  const longestUnder: Record<number, number> = {};
  let longestEven = 0;
  let longestOdd = 0;

  for (let i = 0; i <= 9; i++) {
    longestDigit[i] = 0;
    longestOver[i] = 0;
    longestUnder[i] = 0;
  }

  let curDigit = -1;
  let curDigitRun = 0;
  let curEvenRun = 0;
  let curOddRun = 0;
  let curEvenOddType: 'even' | 'odd' | null = null;
  let curBarrierRuns: Record<number, { over: number; under: number }> = {};

  for (let b = 0; b <= 9; b++) {
    curBarrierRuns[b] = { over: 0, under: 0 };
  }

  for (const d of digits) {
    // Digit streak
    if (d === curDigit) {
      curDigitRun++;
    } else {
      curDigit = d;
      curDigitRun = 1;
    }
    if (curDigitRun > longestDigit[d]) longestDigit[d] = curDigitRun;

    // Even/odd streak
    if (d % 2 === 0) {
      curEvenRun++;
      curOddRun = 0;
      curEvenOddType = 'even';
    } else {
      curOddRun++;
      curEvenRun = 0;
      curEvenOddType = 'odd';
    }
    if (curEvenRun > longestEven) longestEven = curEvenRun;
    if (curOddRun > longestOdd) longestOdd = curOddRun;

    // Over/Under streaks for each barrier 0-9
    for (let b = 0; b <= 9; b++) {
      if (d > b) {
        curBarrierRuns[b].over++;
        curBarrierRuns[b].under = 0;
        if (curBarrierRuns[b].over > longestOver[b]) longestOver[b] = curBarrierRuns[b].over;
      } else if (d < b) {
        curBarrierRuns[b].under++;
        curBarrierRuns[b].over = 0;
        if (curBarrierRuns[b].under > longestUnder[b]) longestUnder[b] = curBarrierRuns[b].under;
      } else {
        curBarrierRuns[b].over = 0;
        curBarrierRuns[b].under = 0;
      }
    }
  }

  // Current streak info
  let currentStreak: StreakInfo = { current: 0, type: null, digitValue: null };
  if (digits.length > 0) {
    const last = digits[digits.length - 1];
    let run = 0;
    for (let i = digits.length - 1; i >= 0; i--) {
      if (digits[i] === last) run++;
      else break;
    }
    currentStreak = { current: run, type: 'digit', digitValue: last };
  }

  return { longestDigit, longestEven, longestOdd, longestOver, longestUnder, currentStreak };
}

export function computeMatchesStats(digits: number[]) {
  const stats = computeDigitStats(digits);
  // For each pair of consecutive digits, count how many times they match
  let matchCount = 0;
  let totalPairs = 0;
  for (let i = 1; i < digits.length; i++) {
    totalPairs++;
    if (digits[i] === digits[i - 1]) matchCount++;
  }
  const matchPercent = totalPairs > 0 ? (matchCount / totalPairs) * 100 : 0;
  const expectedMatchPercent = 10; // 1/10 chance for random

  // Most recent matches
  const recentPairs: { a: number; b: number; match: boolean }[] = [];
  for (let i = digits.length - 1; i >= 1 && recentPairs.length < 20; i--) {
    recentPairs.unshift({ a: digits[i - 1], b: digits[i], match: digits[i] === digits[i - 1] });
  }

  return { stats, matchCount, totalPairs, matchPercent, expectedMatchPercent, recentPairs };
}

export function computeDiffersStats(digits: number[]) {
  const stats = computeDigitStats(digits);
  let differCount = 0;
  let totalPairs = 0;
  for (let i = 1; i < digits.length; i++) {
    totalPairs++;
    if (digits[i] !== digits[i - 1]) differCount++;
  }
  const differPercent = totalPairs > 0 ? (differCount / totalPairs) * 100 : 0;
  const expectedDifferPercent = 90;

  // For each digit, what's the probability the NEXT digit differs
  const digitNextDiffers: Record<number, { differs: number; total: number; percent: number }> = {};
  for (let i = 0; i <= 9; i++) {
    digitNextDiffers[i] = { differs: 0, total: 0, percent: 0 };
  }
  for (let i = 0; i < digits.length - 1; i++) {
    const cur = digits[i];
    const next = digits[i + 1];
    digitNextDiffers[cur].total++;
    if (next !== cur) digitNextDiffers[cur].differs++;
  }
  for (let i = 0; i <= 9; i++) {
    const d = digitNextDiffers[i];
    d.percent = d.total > 0 ? (d.differs / d.total) * 100 : 0;
  }

  // Recent transitions matrix (last 30 transitions)
  const recentTransitions: { from: number; to: number; differs: boolean }[] = [];
  for (let i = digits.length - 1; i >= 1 && recentTransitions.length < 30; i--) {
    recentTransitions.unshift({
      from: digits[i - 1],
      to: digits[i],
      differs: digits[i] !== digits[i - 1],
    });
  }

  return {
    stats,
    differCount,
    totalPairs,
    differPercent,
    expectedDifferPercent,
    digitNextDiffers,
    recentTransitions,
  };
}

export function computeAIAnalysis(digits: number[]) {
  const stats = computeDigitStats(digits);
  const evenOdd = computeEvenOddStats(digits);
  const streaks = computeStreaks(digits);
  const matches = computeMatchesStats(digits);
  const differs = computeDiffersStats(digits);

  // Find hottest and coldest digits
  let hottestDigit = 0;
  let coldestDigit = 0;
  let maxPercent = -1;
  let minPercent = 101;
  for (let i = 0; i <= 9; i++) {
    if (stats.percents[i] > maxPercent) {
      maxPercent = stats.percents[i];
      hottestDigit = i;
    }
    if (stats.percents[i] < minPercent) {
      minPercent = stats.percents[i];
      coldestDigit = i;
    }
  }

  // Mean and standard deviation
  const mean = digits.reduce((a, b) => a + b, 0) / (digits.length || 1);
  const variance = digits.reduce((a, b) => a + (b - mean) ** 2, 0) / (digits.length || 1);
  const stdDev = Math.sqrt(variance);

  // Trend detection: compare first half vs second half averages
  const half = Math.floor(digits.length / 2);
  const firstHalfAvg = digits.slice(0, half).reduce((a, b) => a + b, 0) / (half || 1);
  const secondHalfAvg = digits.slice(half).reduce((a, b) => a + b, 0) / (digits.length - half || 1);
  const trend = secondHalfAvg - firstHalfAvg;

  // Entropy (normalized Shannon entropy)
  let entropy = 0;
  for (let i = 0; i <= 9; i++) {
    const p = stats.percents[i] / 100;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(10);
  const normalizedEntropy = (entropy / maxEntropy) * 100;

  // Confidence scores for predictions
  const predictions: {
    digit: number;
    probability: number;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  }[] = [];

  // Predict next digit based on hottest digit
  if (stats.total >= 20) {
    const hotPercent = stats.percents[hottestDigit];
    const confidence: 'high' | 'medium' | 'low' =
      hotPercent > 18 ? 'high' : hotPercent > 14 ? 'medium' : 'low';
    predictions.push({
      digit: hottestDigit,
      probability: hotPercent,
      confidence,
      reason: `Digit ${hottestDigit} appears ${hotPercent.toFixed(1)}% of the time (${stats.counts[hottestDigit]} occurrences)`,
    });
  }

  // Predict even/odd
  const evenConfidence: 'high' | 'medium' | 'low' =
    Math.abs(evenOdd.evenPercent - 50) > 10
      ? 'high'
      : Math.abs(evenOdd.evenPercent - 50) > 5
      ? 'medium'
      : 'low';

  // Predict over/under 5
  const ou5 = computeOverUnderStats(digits, 5);
  const ouConfidence: 'high' | 'medium' | 'low' =
    Math.abs(ou5.overPercent - 50) > 10
      ? 'high'
      : Math.abs(ou5.overPercent - 50) > 5
      ? 'medium'
      : 'low';

  // Pattern detection
  const patterns: { name: string; description: string; strength: 'strong' | 'moderate' | 'weak' }[] = [];

  // Alternating pattern detection
  let alternatingCount = 0;
  for (let i = 2; i < digits.length; i++) {
    if (digits[i] === digits[i - 2] && digits[i] !== digits[i - 1]) alternatingCount++;
  }
  const alternatingPercent = (alternatingCount / (digits.length - 2 || 1)) * 100;
  if (alternatingPercent > 40) {
    patterns.push({
      name: 'Alternating Pattern',
      description: `Digits alternate frequently (${alternatingPercent.toFixed(1)}% of the time)`,
      strength: alternatingPercent > 55 ? 'strong' : alternatingPercent > 45 ? 'moderate' : 'weak',
    });
  }

  // Repeating pattern detection
  if (streaks.currentStreak.current >= 3) {
    patterns.push({
      name: 'Repeating Streak',
      description: `Digit ${streaks.currentStreak.digitValue} has appeared ${streaks.currentStreak.current} times in a row`,
      strength: streaks.currentStreak.current >= 5 ? 'strong' : streaks.currentStreak.current >= 4 ? 'moderate' : 'weak',
    });
  }

  // Bias detection
  if (normalizedEntropy < 85) {
    patterns.push({
      name: 'Distribution Bias',
      description: `Entropy is ${normalizedEntropy.toFixed(1)}% (below 85%), indicating non-uniform distribution`,
      strength: normalizedEntropy < 75 ? 'strong' : normalizedEntropy < 82 ? 'moderate' : 'weak',
    });
  }

  // Even/odd bias
  if (Math.abs(evenOdd.evenPercent - 50) > 8) {
    patterns.push({
      name: evenOdd.evenPercent > 50 ? 'Even Bias' : 'Odd Bias',
      description: `${evenOdd.evenPercent > 50 ? 'Even' : 'Odd'} digits appear ${Math.abs(evenOdd.evenPercent - 50).toFixed(1)}% more than expected`,
      strength: Math.abs(evenOdd.evenPercent - 50) > 15 ? 'strong' : Math.abs(evenOdd.evenPercent - 50) > 10 ? 'moderate' : 'weak',
    });
  }

  // Over/under bias
  if (Math.abs(ou5.overPercent - 50) > 8) {
    patterns.push({
      name: ou5.overPercent > 50 ? 'Over Bias' : 'Under Bias',
      description: `${ou5.overPercent > 50 ? 'Over' : 'Under'} 5 appears ${Math.abs(ou5.overPercent - 50).toFixed(1)}% more than expected`,
      strength: Math.abs(ou5.overPercent - 50) > 15 ? 'strong' : Math.abs(ou5.overPercent - 50) > 10 ? 'moderate' : 'weak',
    });
  }

  return {
    stats,
    evenOdd,
    streaks,
    matches,
    differs,
    hottestDigit,
    coldestDigit,
    maxPercent,
    minPercent,
    mean,
    stdDev,
    trend,
    normalizedEntropy,
    predictions,
    evenConfidence,
    ou5,
    ouConfidence,
    patterns,
  };
}
