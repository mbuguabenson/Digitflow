// ─── Types ───────────────────────────────────────────────────────────────────
export type ChallengeConfig = {
  name: string;
  startCapital: number;
  targetBalance: number;
  challengeDays: number;
  sessionsPerDay: number;
  tradingDays: 'daily' | number[]; // number[] = weekday indices 0-6
  currency: string;
  dailyProfitTargetOverride: number | null;
  autoCompounding: boolean;
  startDate: string; // ISO date
  // Risk management
  riskPerTrade: number;
  maxConsecutiveLosses: number;
  maxDailyLoss: number;
  maxDailyProfit: number;
  maxTradesPerSession: number;
  martingaleEnabled: boolean;
  martingaleMultiplier: number;
  stopAfterTarget: boolean;
  resumeNextSession: boolean;
  // Strategy
  strategy: string;
};

export type SessionRow = {
  session: number;
  startBalance: number;
  sessionTarget: number;
  actualProfit: number;
  actualBalance: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  status: 'pending' | 'completed' | 'target' | 'loss';
};

export type DayRow = {
  day: number;
  date: string;
  startBalance: number;
  dailyTargetProfit: number;
  targetEndBalance: number;
  actualEndBalance: number;
  difference: number;
  status: 'pending' | 'achieved' | 'partial' | 'missed';
  progressPct: number;
  notes: string;
  sessions: SessionRow[];
};

export type ChallengeStats = {
  currentBalance: number;
  targetBalance: number;
  remainingBalance: number;
  challengeProgressPct: number;
  dailyTarget: number;
  todayProfit: number;
  remainingDays: number;
  completedDays: number;
  winningDays: number;
  losingDays: number;
  currentSession: number;
  nextSessionTarget: number;
  overallROI: number;
  estimatedFinishDate: string;
  // Calculated targets
  requiredDailyGrowthPct: number;
  requiredSessionGrowthPct: number;
  totalProfitRequired: number;
  remainingProfit: number;
  expectedFinalBalance: number;
  sessionTarget: number;
  totalPercentageGrowth: number;
  avgProfitPerSession: number;
  // Statistics
  highestBalance: number;
  lowestBalance: number;
  totalProfit: number;
  avgDailyProfit: number;
  bestDay: number;
  worstDay: number;
  completionPct: number;
};

export type Challenge = {
  id: string;
  config: ChallengeConfig;
  days: DayRow[];
  stats: ChallengeStats;
  status: 'active' | 'paused' | 'completed' | 'stopped';
  createdAt: string;
  updatedAt: string;
};

// ─── Calculation Functions ───────────────────────────────────────────────────
export function calculateChallenge(config: ChallengeConfig, currentBalance?: number): {
  days: DayRow[];
  stats: ChallengeStats;
} {
  const totalProfitRequired = config.targetBalance - config.startCapital;
  const requiredDailyGrowthPct = (Math.pow(config.targetBalance / config.startCapital, 1 / config.challengeDays) - 1) * 100;
  const requiredSessionGrowthPct = (Math.pow(config.targetBalance / config.startCapital, 1 / (config.challengeDays * config.sessionsPerDay)) - 1) * 100;

  const days: DayRow[] = [];
  let balance = config.startCapital;
  const start = new Date(config.startDate);

  for (let d = 1; d <= config.challengeDays; d++) {
    // Calculate trading day date
    let date = new Date(start);
    if (config.tradingDays === 'daily') {
      date.setDate(start.getDate() + d - 1);
    } else {
      // Skip non-trading days
      let added = 0;
      let cur = new Date(start);
      while (added < d) {
        cur.setDate(cur.getDate() + 1);
        if (config.tradingDays.includes(cur.getDay())) added++;
      }
      date = cur;
    }

    const dayStartBalance = balance;
    const dailyTargetProfit = config.dailyProfitTargetOverride ?? (balance * requiredDailyGrowthPct / 100);
    const targetEndBalance = balance + dailyTargetProfit;

    const sessions: SessionRow[] = [];
    let sessionStartBalance = balance;
    const sessionTarget = dailyTargetProfit / config.sessionsPerDay;

    for (let s = 1; s <= config.sessionsPerDay; s++) {
      sessions.push({
        session: s,
        startBalance: sessionStartBalance,
        sessionTarget,
        actualProfit: 0,
        actualBalance: sessionStartBalance,
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        status: 'pending',
      });
      sessionStartBalance += sessionTarget;
    }

    days.push({
      day: d,
      date: date.toISOString().split('T')[0],
      startBalance: dayStartBalance,
      dailyTargetProfit,
      targetEndBalance,
      actualEndBalance: dayStartBalance,
      difference: 0,
      status: 'pending',
      progressPct: 0,
      notes: '',
      sessions,
    });

    balance = targetEndBalance;
  }

  const curBalance = currentBalance ?? config.startCapital;
  const totalProfit = curBalance - config.startCapital;
  const remainingProfit = config.targetBalance - curBalance;
  const challengeProgressPct = (totalProfit / totalProfitRequired) * 100;
  const overallROI = (totalProfit / config.startCapital) * 100;
  const today = new Date().toISOString().split('T')[0];
  const completedDays = days.filter(d => d.status !== 'pending').length;
  const winningDays = days.filter(d => d.status === 'achieved').length;
  const losingDays = days.filter(d => d.status === 'missed').length;
  const remainingDays = config.challengeDays - completedDays;
  const todayProfit = days.find(d => d.date === today)?.difference ?? 0;
  const currentDay = days.find(d => d.date === today) ?? days[completedDays];
  const currentSession = currentDay?.sessions.findIndex(s => s.status === 'pending') ?? 0;
  const nextSessionTarget = currentDay?.sessions[currentSession]?.sessionTarget ?? 0;

  const estimatedFinishDate = days[days.length - 1].date;
  const avgDailyProfit = totalProfit / (completedDays || 1);
  const avgProfitPerSession = totalProfit / (completedDays * config.sessionsPerDay || 1);
  const totalPercentageGrowth = ((curBalance - config.startCapital) / config.startCapital) * 100;
  const completionPct = (completedDays / config.challengeDays) * 100;

  const actualBalances = days.map(d => d.actualEndBalance).filter(b => b > config.startCapital);
  const highestBalance = Math.max(curBalance, ...actualBalances, config.startCapital);
  const lowestBalance = Math.min(curBalance, ...actualBalances.filter(b => b > 0), config.startCapital);
  const dayProfits = days.map(d => d.difference);
  const bestDay = dayProfits.length ? Math.max(...dayProfits) : 0;
  const worstDay = dayProfits.length ? Math.min(...dayProfits) : 0;

  const stats: ChallengeStats = {
    currentBalance: curBalance,
    targetBalance: config.targetBalance,
    remainingBalance: remainingProfit,
    challengeProgressPct: Math.max(0, Math.min(100, challengeProgressPct)),
    dailyTarget: config.dailyProfitTargetOverride ?? (curBalance * requiredDailyGrowthPct / 100),
    todayProfit,
    remainingDays: Math.max(0, remainingDays),
    completedDays,
    winningDays,
    losingDays,
    currentSession: currentSession + 1,
    nextSessionTarget,
    overallROI,
    estimatedFinishDate,
    requiredDailyGrowthPct,
    requiredSessionGrowthPct,
    totalProfitRequired,
    remainingProfit,
    expectedFinalBalance: config.targetBalance,
    sessionTarget: config.dailyProfitTargetOverride
      ? config.dailyProfitTargetOverride / config.sessionsPerDay
      : (curBalance * requiredDailyGrowthPct / 100) / config.sessionsPerDay,
    totalPercentageGrowth,
    avgProfitPerSession,
    highestBalance,
    lowestBalance,
    totalProfit,
    avgDailyProfit,
    bestDay,
    worstDay,
    completionPct,
  };

  return { days, stats };
}

export function recommendedStake(balance: number, riskPercent: number): number {
  return Math.max(0.35, (balance * riskPercent) / 100);
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function defaultConfig(): ChallengeConfig {
  return {
    name: 'My Challenge',
    startCapital: 20,
    targetBalance: 100,
    challengeDays: 30,
    sessionsPerDay: 4,
    tradingDays: 'daily',
    currency: 'USD',
    dailyProfitTargetOverride: null,
    autoCompounding: true,
    startDate: new Date().toISOString().split('T')[0],
    riskPerTrade: 1,
    maxConsecutiveLosses: 3,
    maxDailyLoss: 5,
    maxDailyProfit: 10,
    maxTradesPerSession: 5,
    martingaleEnabled: false,
    martingaleMultiplier: 2,
    stopAfterTarget: true,
    resumeNextSession: true,
    strategy: 'over-under',
  };
}
