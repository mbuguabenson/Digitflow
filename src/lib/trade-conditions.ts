import { computeEvenOddStats, computeOverUnderStats, computeDigitStats } from '@/lib/analysis';

export type Comparator = '>' | '<' | '>=' | '<=' | '==';

export type ConditionField =
  | 'evenProb'      // Even probability %
  | 'oddProb'       // Odd probability %
  | 'overProb'      // Over probability % (relative to barrier)
  | 'underProb'     // Under probability % (relative to barrier)
  | 'digitProb'     // Specific digit probability % (relative to target)
  | 'differProb'    // Differ probability % (100 - digitProb)
  | 'riseProb'      // Rise probability %
  | 'fallProb'      // Fall probability %
  | 'lastNMatch'    // Last N ticks match a type (Even/Odd/Over/Under/Rise/Fall)
  | 'streakLen'     // Current streak length of a type
  | 'tickCount';    // Total tick count

export type MatchType = 'even' | 'odd' | 'over' | 'under' | 'rise' | 'fall' | 'digit';

export interface ConditionRule {
  id: string;
  field: ConditionField;
  comparator: Comparator;
  value: number;
  // For lastNMatch / streakLen — which type to check
  matchType?: MatchType;
  // For lastNMatch — how many last ticks
  matchN?: number;
  // For streakLen — min streak
  streakValue?: number;
}

export type TradeAction =
  | 'BUY_EVEN' | 'BUY_ODD'
  | 'BUY_OVER' | 'BUY_UNDER'
  | 'BUY_MATCH' | 'BUY_DIFFER'
  | 'BUY_RISE' | 'BUY_FALL';

export interface TradeConfig {
  rules: ConditionRule[];
  action: TradeAction;
  stake: number;
  ticks: number;
  martingale: number;
}

export interface ConditionContext {
  digits: number[];
  barrier: number;     // for over/under
  targetDigit: number; // for matches/differs
}

export const FIELD_LABELS: Record<ConditionField, string> = {
  evenProb: 'Even Prob',
  oddProb: 'Odd Prob',
  overProb: 'Over Prob',
  underProb: 'Under Prob',
  digitProb: 'Digit Prob',
  differProb: 'Differ Prob',
  riseProb: 'Rise Prob',
  fallProb: 'Fall Prob',
  lastNMatch: 'Last N ticks are',
  streakLen: 'Current streak',
  tickCount: 'Total ticks',
};

export const COMPARATOR_LABELS: Record<Comparator, string> = {
  '>': '>',
  '<': '<',
  '>=': '≥',
  '<=': '≤',
  '==': '=',
};

export const ACTION_LABELS: Record<TradeAction, string> = {
  BUY_EVEN: 'Buy Even',
  BUY_ODD: 'Buy Odd',
  BUY_OVER: 'Buy Over',
  BUY_UNDER: 'Buy Under',
  BUY_MATCH: 'Buy Match',
  BUY_DIFFER: 'Buy Differ',
  BUY_RISE: 'Buy Rise',
  BUY_FALL: 'Buy Fall',
};

export const ACTION_TO_CONTRACT: Record<TradeAction, { contractType: string; needsBarrier: boolean }> = {
  BUY_EVEN: { contractType: 'DIGITEVEN', needsBarrier: false },
  BUY_ODD: { contractType: 'DIGITODD', needsBarrier: false },
  BUY_OVER: { contractType: 'DIGITOVER', needsBarrier: true },
  BUY_UNDER: { contractType: 'DIGITUNDER', needsBarrier: true },
  BUY_MATCH: { contractType: 'DIGITMATCH', needsBarrier: true },
  BUY_DIFFER: { contractType: 'DIGITDIFF', needsBarrier: true },
  BUY_RISE: { contractType: 'CALL', needsBarrier: false },
  BUY_FALL: { contractType: 'PUT', needsBarrier: false },
};

function computeRiseFallProb(digits: number[]) {
  let rise = 0, fall = 0, total = 0;
  for (let i = 1; i < digits.length; i++) {
    total++;
    if (digits[i] > digits[i - 1]) rise++;
    else if (digits[i] < digits[i - 1]) fall++;
  }
  const t = total || 1;
  return { riseProb: (rise / t) * 100, fallProb: (fall / t) * 100 };
}

function lastNMatchType(digits: number[], n: number, type: MatchType, barrier: number, targetDigit: number): boolean[] {
  return digits.slice(-n).map((d) => {
    switch (type) {
      case 'even': return d % 2 === 0;
      case 'odd': return d % 2 !== 0;
      case 'over': return d > barrier;
      case 'under': return d < barrier;
      case 'rise': return false; // placeholder, handled via consecutive comparison
      case 'fall': return false;
      case 'digit': return d === targetDigit;
    }
  });
}

function consecutiveRiseFall(digits: number[], n: number, type: 'rise' | 'fall'): boolean {
  if (digits.length < n + 1) return false;
  const slice = digits.slice(-n - 1);
  for (let i = 1; i < slice.length; i++) {
    if (type === 'rise' && slice[i] <= slice[i - 1]) return false;
    if (type === 'fall' && slice[i] >= slice[i - 1]) return false;
  }
  return true;
}

function currentStreakOfType(digits: number[], type: MatchType, barrier: number, targetDigit: number): number {
  if (!digits.length) return 0;
  let count = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    const d = digits[i];
    let matches = false;
    switch (type) {
      case 'even': matches = d % 2 === 0; break;
      case 'odd': matches = d % 2 !== 0; break;
      case 'over': matches = d > barrier; break;
      case 'under': matches = d < barrier; break;
      case 'digit': matches = d === targetDigit; break;
      case 'rise': case 'fall':
        if (i === digits.length - 1) { matches = true; count = 1; continue; }
        matches = type === 'rise' ? d > digits[i - 1] : d < digits[i - 1];
        if (i < digits.length - 1) matches = type === 'rise' ? digits[i + 1] > d : digits[i + 1] < d;
        break;
    }
    if (matches) count++;
    else break;
  }
  return count;
}

function compare(a: number, cmp: Comparator, b: number): boolean {
  switch (cmp) {
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '==': return a === b;
  }
}

export function evaluateCondition(rule: ConditionRule, ctx: ConditionContext): boolean {
  const { digits, barrier, targetDigit } = ctx;
  const eo = computeEvenOddStats(digits);
  const ou = computeOverUnderStats(digits, barrier);
  const ds = computeDigitStats(digits);
  const rf = computeRiseFallProb(digits);

  switch (rule.field) {
    case 'evenProb': return compare(eo.evenPercent, rule.comparator, rule.value);
    case 'oddProb': return compare(eo.oddPercent, rule.comparator, rule.value);
    case 'overProb': return compare(ou.overPercent, rule.comparator, rule.value);
    case 'underProb': return compare(ou.underPercent, rule.comparator, rule.value);
    case 'digitProb': return compare(ds.percents[targetDigit] ?? 0, rule.comparator, rule.value);
    case 'differProb': return compare(100 - (ds.percents[targetDigit] ?? 0), rule.comparator, rule.value);
    case 'riseProb': return compare(rf.riseProb, rule.comparator, rule.value);
    case 'fallProb': return compare(rf.fallProb, rule.comparator, rule.value);
    case 'tickCount': return compare(digits.length, rule.comparator, rule.value);
    case 'lastNMatch': {
      const n = rule.matchN ?? 1;
      const type = rule.matchType ?? 'even';
      if (type === 'rise') return consecutiveRiseFall(digits, n, 'rise');
      if (type === 'fall') return consecutiveRiseFall(digits, n, 'fall');
      const matches = lastNMatchType(digits, n, type, barrier, targetDigit);
      return matches.length === n && matches.every(Boolean);
    }
    case 'streakLen': {
      const type = rule.matchType ?? 'even';
      const streak = currentStreakOfType(digits, type, barrier, targetDigit);
      return compare(streak, rule.comparator, rule.value);
    }
  }
}

export function evaluateAllRules(rules: ConditionRule[], ctx: ConditionContext): boolean {
  return rules.length > 0 && rules.every((r) => evaluateCondition(r, ctx));
}

export function newRuleId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function createDefaultRule(field: ConditionField, value: number): ConditionRule {
  return { id: newRuleId(), field, comparator: '>', value, matchN: 3, matchType: 'even' };
}
