export interface FrequencyData {
  digit: number;
  count: number;
  percentage: number;
  deviation: number;
}

export interface HotColdData {
  hot: FrequencyData[];
  cold: FrequencyData[];
}

export interface StreakInfo {
  digit: number;
  length: number;
  startIndex: number;
  isActive: boolean;
  momentum: number;
}

export interface GapAnalysis {
  digit: number;
  lastSeen: number;
  gap: number;
  overdueScore: number;
}

export interface RiskMetrics {
  volatility: number;
  momentum: number;
  trendStrength: number;
  overallRisk: 'low' | 'medium' | 'high';
}

export interface PredictionResult {
  digit: number;
  probability: number;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
  trend: 'rising' | 'falling' | 'stable';
}

export interface TradingSignal {
  action: 'BUY' | 'HOLD' | 'AVOID';
  targetDigit: number;
  confidence: number;
  reasoning: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface CorrelationMatrix {
  matrix: number[][];
  maxProb: number;
}

export interface SmartAnalysisResult {
  predictions: PredictionResult[];
  hotCold: HotColdData;
  risk: RiskMetrics;
  signal: TradingSignal;
  streaks: StreakInfo[];
  gaps: GapAnalysis[];
  correlations: CorrelationMatrix;
  frequency: FrequencyData[];
  average: number;
  stdDev: number;
}

function calculateStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function analyzeFrequency(digits: number[]): {
  frequencies: FrequencyData[];
  hot: FrequencyData[];
  cold: FrequencyData[];
  average: number;
  stdDev: number;
} {
  const counts = new Array(10).fill(0);
  for (const d of digits) {
    if (d >= 0 && d <= 9) counts[d]++;
  }

  const total = digits.length || 1;
  const average = total / 10;
  const frequencies: FrequencyData[] = counts.map((count, digit) => ({
    digit,
    count,
    percentage: (count / total) * 100,
    deviation: Math.abs(count - average),
  }));

  const mean = frequencies.reduce((s, f) => s + f.percentage, 0) / 10;
  const stdDev = calculateStdDev(
    frequencies.map((f) => f.percentage),
    mean
  );

  const hot = frequencies
    .filter((f) => f.count > average + stdDev * 0.5)
    .sort((a, b) => b.percentage - a.percentage);
  const cold = frequencies
    .filter((f) => f.count < average - stdDev * 0.5)
    .sort((a, b) => a.percentage - b.percentage);

  return { frequencies, hot, cold, average, stdDev };
}

export function buildMarkovChain(digits: number[]): number[][] {
  const transitions = Array.from({ length: 10 }, () => new Array(10).fill(0));
  for (let i = 0; i < digits.length - 1; i++) {
    const current = digits[i];
    const next = digits[i + 1];
    if (current >= 0 && current <= 9 && next >= 0 && next <= 9) {
      transitions[current][next]++;
    }
  }
  return transitions.map((row) => {
    const total = row.reduce((sum, count) => sum + count, 0);
    return row.map((count) => (total > 0 ? (count / total) * 100 : 0));
  });
}

export function predictNextDigit(lastDigit: number, markovChain: number[][]): { digit: number; probability: number }[] {
  if (lastDigit < 0 || lastDigit > 9) return [];
  const probabilities = markovChain[lastDigit];
  return probabilities
    .map((prob, digit) => ({ digit, probability: prob }))
    .sort((a, b) => b.probability - a.probability);
}

export function detectStreaks(digits: number[]): StreakInfo[] {
  const streaks: StreakInfo[] = [];
  let currentStreak: StreakInfo | null = null;

  for (let i = 0; i < digits.length; i++) {
    const digit = digits[i];
    if (!currentStreak || currentStreak.digit !== digit) {
      if (currentStreak && currentStreak.length >= 2) {
        streaks.push(currentStreak);
      }
      currentStreak = {
        digit,
        length: 1,
        startIndex: i,
        isActive: i === digits.length - 1,
        momentum: 0,
      };
    } else {
      currentStreak.length++;
      currentStreak.isActive = i === digits.length - 1;
    }
  }
  if (currentStreak && currentStreak.length >= 2) {
    streaks.push(currentStreak);
  }

  streaks.forEach((streak) => {
    streak.momentum = streak.length * (streak.isActive ? 2 : 1);
  });

  return streaks.sort((a, b) => b.momentum - a.momentum);
}

export function analyzeGaps(digits: number[]): GapAnalysis[] {
  const gaps: GapAnalysis[] = [];
  const total = digits.length;

  for (let digit = 0; digit < 10; digit++) {
    let lastSeen = -1;
    for (let i = total - 1; i >= 0; i--) {
      if (digits[i] === digit) {
        lastSeen = i;
        break;
      }
    }
    const gap = lastSeen === -1 ? total : total - 1 - lastSeen;
    const expectedFreq = total / 10;
    const overdueScore = expectedFreq > 0 && gap > expectedFreq ? (gap / expectedFreq) * 100 : 0;
    gaps.push({ digit, lastSeen, gap, overdueScore });
  }

  return gaps.sort((a, b) => b.overdueScore - a.overdueScore);
}

interface ConfidenceFactors {
  frequency: number;
  markovProb: number;
  streakMomentum: number;
  gapOverdue: number;
  volatility: number;
}

function calculateConfidence(factors: ConfidenceFactors): { score: number; level: 'high' | 'medium' | 'low' } {
  const weights = {
    frequency: 0.3,
    markovProb: 0.25,
    streakMomentum: 0.2,
    gapOverdue: 0.15,
    volatility: 0.1,
  };

  const normalized = {
    frequency: Math.min(factors.frequency * 10, 100),
    markovProb: factors.markovProb,
    streakMomentum: Math.min(factors.streakMomentum * 20, 100),
    gapOverdue: Math.min(factors.gapOverdue, 100),
    volatility: 100 - Math.min(factors.volatility, 100),
  };

  const score =
    normalized.frequency * weights.frequency +
    normalized.markovProb * weights.markovProb +
    normalized.streakMomentum * weights.streakMomentum +
    normalized.gapOverdue * weights.gapOverdue +
    normalized.volatility * weights.volatility;

  let level: 'high' | 'medium' | 'low';
  if (score >= 70) level = 'high';
  else if (score >= 50) level = 'medium';
  else level = 'low';

  return { score, level };
}

export function assessRisk(digits: number[]): RiskMetrics {
  const freqAnalysis = analyzeFrequency(digits);
  const freqValues = freqAnalysis.frequencies.map((f) => f.percentage);
  const volatility = calculateStdDev(freqValues, 10) * 10;

  const recent20 = digits.slice(-20);
  const previous20 = digits.slice(-40, -20);
  const recentFreq = analyzeFrequency(recent20);
  const prevFreq = analyzeFrequency(previous20);

  let totalChange = 0;
  for (let i = 0; i < 10; i++) {
    totalChange += Math.abs(
      recentFreq.frequencies[i].percentage - prevFreq.frequencies[i].percentage
    );
  }
  const momentum = (totalChange / 10) * 10;

  const streaks = detectStreaks(digits);
  const maxStreak = streaks.length > 0 ? Math.max(...streaks.map((s) => s.length)) : 0;
  const trendStrength = Math.min(maxStreak * 20, 100);

  const overallScore = volatility * 0.4 + momentum * 0.35 + trendStrength * 0.25;
  let overallRisk: 'low' | 'medium' | 'high';
  if (overallScore < 40) overallRisk = 'low';
  else if (overallScore < 70) overallRisk = 'medium';
  else overallRisk = 'high';

  return {
    volatility: Math.round(volatility),
    momentum: Math.round(momentum),
    trendStrength: Math.round(trendStrength),
    overallRisk,
  };
}

function buildCorrelationMatrix(digits: number[]): CorrelationMatrix {
  const transitions = Array.from({ length: 10 }, () => new Array(10).fill(0));
  for (let i = 0; i < digits.length - 1; i++) {
    const current = digits[i];
    const next = digits[i + 1];
    if (current >= 0 && current <= 9 && next >= 0 && next <= 9) {
      transitions[current][next]++;
    }
  }
  const matrix = transitions.map((row) => {
    const total = row.reduce((sum, count) => sum + count, 0);
    return row.map((count) => (total > 0 ? (count / total) * 100 : 0));
  });
  const maxProb = Math.max(...matrix.flat());
  return { matrix, maxProb };
}

export function generateSmartAnalysis(digits: number[]): SmartAnalysisResult {
  const freqAnalysis = analyzeFrequency(digits);
  const markovChain = buildMarkovChain(digits);
  const lastDigit = digits.length > 0 ? digits[digits.length - 1] : 0;
  const markovPreds = predictNextDigit(lastDigit, markovChain);
  const streaks = detectStreaks(digits);
  const gaps = analyzeGaps(digits);
  const riskMetrics = assessRisk(digits);
  const correlations = buildCorrelationMatrix(digits);

  const predictions: PredictionResult[] = [];

  for (let digit = 0; digit < 10; digit++) {
    const frequency = freqAnalysis.frequencies[digit].percentage;
    const markovProb = markovPreds.find((p) => p.digit === digit)?.probability ?? 0;
    const activeStreak = streaks.find((s) => s.digit === digit && s.isActive);
    const streakMomentum = activeStreak ? activeStreak.momentum : 0;
    const gapData = gaps.find((g) => g.digit === digit);
    const gapOverdue = gapData?.overdueScore ?? 0;

    const confidence = calculateConfidence({
      frequency,
      markovProb,
      streakMomentum,
      gapOverdue,
      volatility: riskMetrics.volatility,
    });

    const reasoning: string[] = [];
    if (frequency > 12) reasoning.push(`High frequency (${frequency.toFixed(1)}%)`);
    if (markovProb > 15) reasoning.push(`Strong Markov probability (${markovProb.toFixed(1)}%)`);
    if (activeStreak) reasoning.push(`Active streak (${activeStreak.length} consecutive)`);
    if (gapOverdue > 80) reasoning.push(`Highly overdue (${gapData?.gap} ticks since last)`);
    if (riskMetrics.volatility < 30) reasoning.push('Low volatility environment');
    if (reasoning.length === 0) reasoning.push('Standard distribution analysis');

    let trend: 'rising' | 'falling' | 'stable' = 'stable';
    if (frequency > 12 && markovProb > 15) trend = 'rising';
    else if (frequency < 8 && gapOverdue > 50) trend = 'falling';

    predictions.push({
      digit,
      probability: confidence.score,
      confidence: confidence.level,
      reasoning,
      trend,
    });
  }

  predictions.sort((a, b) => b.probability - a.probability);
  const top5 = predictions.slice(0, 5);
  const topPrediction = top5[0];

  let action: 'BUY' | 'HOLD' | 'AVOID';
  if (topPrediction && topPrediction.confidence === 'high' && topPrediction.probability >= 70) {
    action = 'BUY';
  } else if (topPrediction && (topPrediction.confidence === 'medium' || topPrediction.probability >= 50)) {
    action = 'HOLD';
  } else {
    action = 'AVOID';
  }

  const signal: TradingSignal = {
    action,
    targetDigit: topPrediction?.digit ?? 0,
    confidence: topPrediction?.probability ?? 0,
    reasoning: topPrediction?.reasoning ?? ['Insufficient data'],
    riskLevel: riskMetrics.overallRisk,
  };

  return {
    predictions: top5,
    hotCold: { hot: freqAnalysis.hot, cold: freqAnalysis.cold },
    risk: riskMetrics,
    signal,
    streaks,
    gaps,
    correlations,
    frequency: freqAnalysis.frequencies,
    average: freqAnalysis.average,
    stdDev: freqAnalysis.stdDev,
  };
}
