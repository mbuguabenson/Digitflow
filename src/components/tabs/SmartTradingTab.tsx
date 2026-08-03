import { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Square, Loader2, RefreshCw } from 'lucide-react';
import {
  computeEvenOddStats,
  computeOverUnderStats,
  computeDigitStats,
} from '@/lib/analysis';
import { cn } from '@/lib/utils';
import type { Account, TradeResult } from '@/hooks/useDerivAuth';
import {
  type TradeAction, type TradeConfig, type ConditionField,
  evaluateAllRules, ACTION_TO_CONTRACT, newRuleId, createDefaultRule,
} from '@/lib/trade-conditions';

type TradeParams = {
  symbol: string; contractType: string; barrier?: string;
  amount: number; duration: number; durationUnit: string; basis?: string;
};

type Props = {
  digits: number[]; currentDigit: number; currentQuote: number; symbol: string;
  account: Account | null;
  placeTrade: (p: TradeParams) => Promise<TradeResult>;
  isDark: boolean; onLoginRequest: () => void;
};

type AutoState = {
  running: boolean; currentStake: number; wins: number; losses: number;
  log: { time: string; result: 'placed' | 'error' }[];
};

const INIT_AUTO: AutoState = { running: false, currentStake: 0, wins: 0, losses: 0, log: [] };

const ALL_ACTIONS: { value: string; label: string }[] = [
  { value: 'BUY_RISE', label: 'Buy Rise' },
  { value: 'BUY_FALL', label: 'Buy Fall' },
  { value: 'BUY_EVEN', label: 'Buy Even' },
  { value: 'BUY_ODD', label: 'Buy Odd' },
  { value: 'BUY_OVER', label: 'Buy Over' },
  { value: 'BUY_UNDER', label: 'Buy Under' },
  { value: 'BUY_MATCH', label: 'Buy Matches' },
  { value: 'BUY_DIFFER', label: 'Buy Differs' },
];

function fmtTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function computeRiseFall(digits: number[]) {
  let rise = 0, fall = 0, total = 0;
  for (let i = 1; i < digits.length; i++) {
    total++;
    if (digits[i] > digits[i - 1]) rise++;
    else if (digits[i] < digits[i - 1]) fall++;
  }
  const t = total || 1;
  return { risePercent: (rise / t) * 100, fallPercent: (fall / t) * 100, total };
}

// ─── Shared primitives ────────────────────────────────────────────────────────
function PctBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}

function SmallInput({ value, onChange, min = 0, step = 1, className }: {
  value: number; onChange: (v: number) => void; min?: number; step?: number; className?: string;
}) {
  return (
    <input
      type="number" min={min} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={cn(
        'w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400',
        className,
      )}
    />
  );
}

function SmallSelect({ value, onChange, options, className }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      className={cn(
        'rounded border border-gray-300 bg-white px-1.5 py-1 text-xs font-semibold text-gray-800 outline-none focus:border-blue-400 cursor-pointer',
        className,
      )}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Inline Condition Builder (image-matching style) ─────────────────────────
type InlineCondProps = {
  // primary prob condition
  probField: string; probFieldOptions: { value: string; label: string }[];
  onProbFieldChange: (v: string) => void;
  comparator: string; onComparatorChange: (v: string) => void;
  probValue: number; onProbValueChange: (v: number) => void;
  // "for digit" (matches/differs only)
  showForDigit?: boolean; forDigit?: number; onForDigitChange?: (v: number) => void;
  // secondary "last N ticks" condition
  showLastN: boolean; lastNEnabled: boolean; onLastNToggle: (v: boolean) => void;
  lastN: number; onLastNChange: (v: number) => void;
  lastNType: string; lastNTypeOptions: { value: string; label: string }[];
  onLastNTypeChange: (v: string) => void;
  lastNExtra?: React.ReactNode;
  // action
  action: string;
  onActionChange: (v: string) => void;
  actionOptions: { value: string; label: string }[];
};

function InlineConditionBuilder({
  probField, probFieldOptions, onProbFieldChange,
  comparator, onComparatorChange, probValue, onProbValueChange,
  showForDigit, forDigit, onForDigitChange,
  showLastN, lastNEnabled, onLastNToggle,
  lastN, onLastNChange, lastNType, lastNTypeOptions, onLastNTypeChange,
  lastNExtra,
  action, onActionChange, actionOptions,
}: InlineCondProps) {
  const cmpOptions = [
    { value: '>', label: '>' }, { value: '<', label: '<' },
    { value: '>=', label: '≥' }, { value: '<=', label: '≤' },
  ];
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Trading Condition</p>
      {/* Primary condition row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-gray-500">if</span>
        <SmallSelect value={probField} onChange={onProbFieldChange} options={probFieldOptions} />
        {showForDigit && onForDigitChange !== undefined && forDigit !== undefined && (
          <>
            <span className="text-xs text-gray-500">for</span>
            <SmallInput value={forDigit} onChange={v => onForDigitChange(Math.max(0, Math.min(9, Math.round(v))))} min={0} step={1} className="w-10 text-center" />
          </>
        )}
        <SmallSelect value={comparator} onChange={onComparatorChange} options={cmpOptions} className="w-10 text-center" />
        <SmallInput value={probValue} onChange={onProbValueChange} min={0} step={1} className="w-14 text-center" />
        <span className="text-xs text-gray-500">%</span>
      </div>
      {/* Secondary last-N condition */}
      {showLastN && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => onLastNToggle(!lastNEnabled)}
            className={cn(
              'relative h-4 w-8 rounded-full transition-colors shrink-0',
              lastNEnabled ? 'bg-blue-500' : 'bg-gray-300',
            )}
          >
            <div className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform', lastNEnabled ? 'translate-x-4' : 'translate-x-0.5')} />
          </button>
          <span className="text-xs text-gray-500">and last</span>
          <SmallInput value={lastN} onChange={v => onLastNChange(Math.max(1, Math.round(v)))} min={1} step={1} className="w-10 text-center" />
          <span className="text-xs text-gray-500">ticks are</span>
          <SmallSelect value={lastNType} onChange={onLastNTypeChange} options={lastNTypeOptions} />
          {lastNExtra}
        </div>
      )}
      {/* Then action */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
        <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">Then</span>
        <SmallSelect value={action} onChange={onActionChange} options={actionOptions} className="flex-1" />
      </div>
    </div>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────────
function TradeCard({ title, statusDot, children, isDark }: {
  title: string; statusDot: 'green' | 'gray'; children: React.ReactNode; isDark: boolean;
}) {
  return (
    <div className={cn(
      'flex flex-col rounded-2xl border overflow-hidden',
      isDark ? 'bg-[#ffffff08] border-white/10' : 'bg-white border-gray-200',
    )}>
      <div className={cn('flex items-center justify-between px-4 py-3 border-b', isDark ? 'border-white/10' : 'border-gray-100')}>
        <h3 className={cn('text-sm font-bold', isDark ? 'text-white' : 'text-gray-800')}>{title}</h3>
        <div className={cn('h-2.5 w-2.5 rounded-full', statusDot === 'green' ? 'bg-green-500' : 'bg-gray-300')} />
      </div>
      <div className="flex flex-col gap-3 p-4 flex-1">{children}</div>
    </div>
  );
}

function AutoButton({ running, loading, onClick }: { running: boolean; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} disabled={loading}
      className={cn(
        'mt-auto w-full rounded-xl border py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-all',
        running
          ? 'bg-red-500 border-red-400 text-white hover:bg-red-600'
          : 'bg-white border-red-400 text-red-500 hover:bg-red-50',
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" />
        : running ? <><Square className="h-3.5 w-3.5" /> Stop Auto Trading</>
        : <><Play className="h-3.5 w-3.5" /> Start Auto Trading</>}
    </button>
  );
}

function StakeRow({ stake, onStake, ticks, onTicks, martingale, onMartingale }: {
  stake: number; onStake: (v: number) => void;
  ticks: number; onTicks: (v: number) => void;
  martingale: number; onMartingale: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'Stake', value: stake, onChange: onStake, min: 0.35, step: 0.1 },
        { label: 'Ticks', value: ticks, onChange: onTicks, min: 1, step: 1 },
        { label: 'Martingale', value: martingale, onChange: onMartingale, min: 1, step: 0.1 },
      ].map(({ label, value, onChange, min, step }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold uppercase text-gray-400">{label}</label>
          <SmallInput value={value} onChange={onChange} min={min} step={step} />
        </div>
      ))}
    </div>
  );
}

// ─── Generic auto-trade hook ──────────────────────────────────────────────────
function useAutoTrade(
  running: boolean,
  digits: number[],
  conditionsMet: boolean,
  stake: number,
  martingale: number,
  ticks: number,
  action: TradeAction,
  barrier: number,
  targetDigit: number,
  symbol: string,
  placeTrade: (p: TradeParams) => Promise<TradeResult>,
  onStop: () => void,
) {
  const [placing, setPlacing] = useState(false);
  const [currentStake, setCurrentStake] = useState(stake);
  const [log, setLog] = useState<AutoState['log']>([]);
  const prevLen = useRef(digits.length);
  const stakeRef = useRef(stake);
  const runRef = useRef(running);
  runRef.current = running;

  useEffect(() => { stakeRef.current = stake; setCurrentStake(stake); }, [stake]);

  useEffect(() => {
    if (!running || placing) return;
    if (digits.length === prevLen.current) return;
    prevLen.current = digits.length;
    if (!conditionsMet) return;

    const go = async () => {
      setPlacing(true);
      const info = ACTION_TO_CONTRACT[action];
      const params: TradeParams = {
        symbol, contractType: info.contractType,
        amount: stakeRef.current, duration: ticks, durationUnit: 't', basis: 'stake',
      };
      if (info.needsBarrier) {
        params.barrier = (action === 'BUY_MATCH' || action === 'BUY_DIFFER')
          ? String(targetDigit) : String(barrier);
      }
      const result = await placeTrade(params);
      setLog(prev => [...prev.slice(-19), { time: fmtTime(), result: result.success ? 'placed' : 'error' }]);
      if (!result.success) {
        stakeRef.current = parseFloat((stakeRef.current * martingale).toFixed(2));
        setCurrentStake(stakeRef.current);
      } else {
        stakeRef.current = stake;
        setCurrentStake(stake);
      }
      setPlacing(false);
    };
    go();
  }, [digits, running, placing, conditionsMet, action, barrier, targetDigit, symbol, ticks, martingale, stake, placeTrade]);

  const reset = () => { setLog([]); setCurrentStake(stake); stakeRef.current = stake; };
  return { placing, currentStake, log, reset };
}

// ─── 1. Rise / Fall Card ─────────────────────────────────────────────────────
function RiseFallCard({ digits, symbol, account, placeTrade, isDark, onLoginRequest }: Omit<Props, 'currentDigit' | 'currentQuote'>) {
  const rf = useMemo(() => computeRiseFall(digits), [digits]);
  const [probField, setProbField] = useState('riseProb');
  const [comparator, setComparator] = useState('>');
  const [probValue, setProbValue] = useState(65);
  const [lastNEnabled, setLastNEnabled] = useState(false);
  const [lastN, setLastN] = useState(3);
  const [lastNType, setLastNType] = useState('rise');
  const [stake, setStake] = useState(0.5);
  const [ticks, setTicks] = useState(1);
  const [martingale, setMartingale] = useState(1);
  const [running, setRunning] = useState(false);
  const [action, setAction] = useState<TradeAction>('BUY_RISE');

  const rules = useMemo(() => {
    const r = [createDefaultRule(probField as ConditionField, probValue)];
    r[0].comparator = comparator as any;
    if (lastNEnabled) r.push({ id: newRuleId(), field: 'lastNMatch' as ConditionField, comparator: '>' as any, value: 0, matchType: lastNType as any, matchN: lastN });
    return r;
  }, [probField, comparator, probValue, lastNEnabled, lastN, lastNType]);

  const conditionsMet = useMemo(() => evaluateAllRules(rules, { digits, barrier: 5, targetDigit: 5 }), [rules, digits]);
  const { placing, log } = useAutoTrade(running, digits, conditionsMet, stake, martingale, ticks, action, 5, 5, symbol, placeTrade, () => setRunning(false));

  const recommend = rf.risePercent >= rf.fallPercent ? 'RISE' : 'FALL';
  const recommendPct = Math.max(rf.risePercent, rf.fallPercent);

  return (
    <TradeCard title="Rise/Fall" statusDot={running ? 'green' : 'gray'} isDark={isDark}>
      {/* Recommendation */}
      <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
        <span className="text-xs text-gray-500">Recommendation</span>
        <span className={cn('rounded px-2 py-0.5 text-xs font-black text-white', recommend === 'RISE' ? 'bg-green-500' : 'bg-red-500')}>{recommend}</span>
        <span className="ml-auto text-xs font-bold text-blue-600">{recommendPct.toFixed(2)}%</span>
      </div>
      {/* Bars */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-8 text-xs font-semibold text-green-600">Rise</span>
          <div className="flex-1"><PctBar pct={rf.risePercent} color="#22c55e" /></div>
          <span className="w-14 text-right text-xs font-bold text-green-600 tabular-nums">{rf.risePercent.toFixed(2)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-xs font-semibold text-red-500">Fall</span>
          <div className="flex-1"><PctBar pct={rf.fallPercent} color="#ef4444" /></div>
          <span className="w-14 text-right text-xs font-bold text-red-500 tabular-nums">{rf.fallPercent.toFixed(2)}%</span>
        </div>
      </div>
      {/* Condition */}
      <InlineConditionBuilder
        probField={probField} probFieldOptions={[{ value: 'riseProb', label: 'Rise Prob' }, { value: 'fallProb', label: 'Fall Prob' }]}
        onProbFieldChange={setProbField}
        comparator={comparator} onComparatorChange={setComparator}
        probValue={probValue} onProbValueChange={setProbValue}
        showLastN lastNEnabled={lastNEnabled} onLastNToggle={setLastNEnabled}
        lastN={lastN} onLastNChange={setLastN}
        lastNType={lastNType}
        lastNTypeOptions={[{ value: 'rise', label: 'Rising' }, { value: 'fall', label: 'Falling' }]}
        onLastNTypeChange={setLastNType}
        action={action} onActionChange={(v) => setAction(v as TradeAction)} actionOptions={ALL_ACTIONS}
      />
      <StakeRow stake={stake} onStake={setStake} ticks={ticks} onTicks={setTicks} martingale={martingale} onMartingale={setMartingale} />
      {log.length > 0 && (
        <div className="flex gap-2 text-[10px]">
          <span className="text-green-600 font-bold">Placed: {log.filter(l => l.result === 'placed').length}</span>
          <span className="text-red-500 font-bold">Errors: {log.filter(l => l.result === 'error').length}</span>
          <span className="ml-auto text-gray-400">{log[log.length - 1]?.time}</span>
        </div>
      )}
      <AutoButton running={running} loading={placing} onClick={() => { if (!account) { onLoginRequest(); return; } setRunning(r => !r); }} />
    </TradeCard>
  );
}

// ─── 2. Even / Odd Stats Card ─────────────────────────────────────────────────
function EvenOddStatsCard({ digits, symbol, account, placeTrade, isDark, onLoginRequest }: Omit<Props, 'currentDigit' | 'currentQuote'>) {
  const eo = useMemo(() => computeEvenOddStats(digits), [digits]);
  const [probField, setProbField] = useState('evenProb');
  const [comparator, setComparator] = useState('>');
  const [probValue, setProbValue] = useState(60);
  const [lastNEnabled, setLastNEnabled] = useState(false);
  const [lastN, setLastN] = useState(3);
  const [lastNType, setLastNType] = useState('even');
  const [stake, setStake] = useState(0.5);
  const [ticks, setTicks] = useState(1);
  const [martingale, setMartingale] = useState(1);
  const [running, setRunning] = useState(false);
  const [action, setAction] = useState<TradeAction>('BUY_EVEN');
  const rules = useMemo(() => {
    const r = [createDefaultRule(probField as ConditionField, probValue)];
    r[0].comparator = comparator as any;
    if (lastNEnabled) r.push({ id: newRuleId(), field: 'lastNMatch' as ConditionField, comparator: '>' as any, value: 0, matchType: lastNType as any, matchN: lastN });
    return r;
  }, [probField, comparator, probValue, lastNEnabled, lastN, lastNType]);

  const conditionsMet = useMemo(() => evaluateAllRules(rules, { digits, barrier: 5, targetDigit: 5 }), [rules, digits]);
  const { placing, log } = useAutoTrade(running, digits, conditionsMet, stake, martingale, ticks, action, 5, 5, symbol, placeTrade, () => setRunning(false));

  return (
    <TradeCard title="Even/Odd" statusDot={running ? 'green' : 'gray'} isDark={isDark}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-8 text-xs font-semibold text-blue-600">Even</span>
          <div className="flex-1"><PctBar pct={eo.evenPercent} color="#3b82f6" /></div>
          <span className="w-14 text-right text-xs font-bold text-blue-600 tabular-nums">{eo.evenPercent.toFixed(2)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-xs font-semibold text-purple-600">Odd</span>
          <div className="flex-1"><PctBar pct={eo.oddPercent} color="#a855f7" /></div>
          <span className="w-14 text-right text-xs font-bold text-purple-600 tabular-nums">{eo.oddPercent.toFixed(2)}%</span>
        </div>
      </div>
      <InlineConditionBuilder
        probField={probField} probFieldOptions={[{ value: 'evenProb', label: 'Even Prob' }, { value: 'oddProb', label: 'Odd Prob' }]}
        onProbFieldChange={setProbField}
        comparator={comparator} onComparatorChange={setComparator}
        probValue={probValue} onProbValueChange={setProbValue}
        showLastN lastNEnabled={lastNEnabled} onLastNToggle={setLastNEnabled}
        lastN={lastN} onLastNChange={setLastN}
        lastNType={lastNType}
        lastNTypeOptions={[{ value: 'even', label: 'Even' }, { value: 'odd', label: 'Odd' }]}
        onLastNTypeChange={setLastNType}
        action={action} onActionChange={(v) => setAction(v as TradeAction)} actionOptions={ALL_ACTIONS}
      />
      <StakeRow stake={stake} onStake={setStake} ticks={ticks} onTicks={setTicks} martingale={martingale} onMartingale={setMartingale} />
      {log.length > 0 && (
        <div className="flex gap-2 text-[10px]">
          <span className="text-green-600 font-bold">Placed: {log.filter(l => l.result === 'placed').length}</span>
          <span className="text-red-500 font-bold">Errors: {log.filter(l => l.result === 'error').length}</span>
        </div>
      )}
      <AutoButton running={running} loading={placing} onClick={() => { if (!account) { onLoginRequest(); return; } setRunning(r => !r); }} />
    </TradeCard>
  );
}

// ─── 3. Even / Odd Pattern Card ───────────────────────────────────────────────
function EvenOddPatternCard({ digits, symbol, account, placeTrade, isDark, onLoginRequest }: Omit<Props, 'currentDigit' | 'currentQuote'>) {
  const [lastN, setLastN] = useState(3);
  const [lastNType, setLastNType] = useState('even');
  const [stake, setStake] = useState(0.5);
  const [ticks, setTicks] = useState(1);
  const [martingale, setMartingale] = useState(1);
  const [running, setRunning] = useState(false);
  const [action, setAction] = useState<TradeAction>('BUY_EVEN');
  const rules = useMemo(() => [{
    id: newRuleId(), field: 'lastNMatch' as ConditionField,
    comparator: '>' as any, value: 0, matchType: lastNType as any, matchN: lastN,
  }], [lastNType, lastN]);

  const conditionsMet = useMemo(() => evaluateAllRules(rules, { digits, barrier: 5, targetDigit: 5 }), [rules, digits]);
  const { placing, log } = useAutoTrade(running, digits, conditionsMet, stake, martingale, ticks, action, 5, 5, symbol, placeTrade, () => setRunning(false));

  // Streak
  const streak = useMemo(() => {
    if (!digits.length) return { count: 0, type: 'Even' };
    let count = 0;
    const isEven = (d: number) => d % 2 === 0;
    const last = isEven(digits[digits.length - 1]);
    for (let i = digits.length - 1; i >= 0; i--) {
      if (isEven(digits[i]) === last) count++;
      else break;
    }
    return { count, type: last ? 'Even' : 'Odd' };
  }, [digits]);

  const last20 = digits.slice(-20);

  return (
    <TradeCard title="Even/Odd" statusDot={running ? 'green' : 'gray'} isDark={isDark}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Last Digits Pattern</p>
        <div className="flex flex-wrap gap-1">
          {last20.map((d, i) => {
            const isE = d % 2 === 0;
            return (
              <div key={i} className={cn(
                'flex h-8 w-8 flex-col items-center justify-center rounded-full text-[9px] font-black text-white leading-none',
                isE ? 'bg-blue-500' : 'bg-purple-500',
                i === last20.length - 1 && 'ring-2 ring-white shadow-md',
              )}>
                <span>{isE ? 'E' : 'O'}</span>
                <span className="opacity-75">{d}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] text-gray-400">Recent digit pattern (E=Even, O=Odd)</p>
        <p className="text-xs font-semibold text-gray-700 mt-0.5">
          Current streak: <span className={streak.type === 'Even' ? 'text-blue-600' : 'text-purple-600'}>{streak.count} {streak.type}</span>
        </p>
      </div>
      {/* Condition: check if last N digits are type */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Trading Condition</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-500">Check if the last</span>
          <SmallInput value={lastN} onChange={v => setLastN(Math.max(1, Math.round(v)))} min={1} step={1} className="w-10 text-center" />
          <span className="text-xs text-gray-500">digits are</span>
          <SmallSelect
            value={lastNType}
            onChange={setLastNType}
            options={[{ value: 'even', label: 'Even' }, { value: 'odd', label: 'Odd' }]}
          />
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
          <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">Then</span>
          <SmallSelect value={action} onChange={(v) => setAction(v as TradeAction)} options={ALL_ACTIONS} className="flex-1" />
        </div>
      </div>
      <StakeRow stake={stake} onStake={setStake} ticks={ticks} onTicks={setTicks} martingale={martingale} onMartingale={setMartingale} />
      {log.length > 0 && (
        <div className="flex gap-2 text-[10px]">
          <span className="text-green-600 font-bold">Placed: {log.filter(l => l.result === 'placed').length}</span>
        </div>
      )}
      <AutoButton running={running} loading={placing} onClick={() => { if (!account) { onLoginRequest(); return; } setRunning(r => !r); }} />
    </TradeCard>
  );
}

// ─── 4. Over / Under Stats Card ───────────────────────────────────────────────
function OverUnderStatsCard({ digits, symbol, account, placeTrade, isDark, onLoginRequest }: Omit<Props, 'currentDigit' | 'currentQuote'>) {
  const [barrier, setBarrier] = useState(5);
  const ou = useMemo(() => computeOverUnderStats(digits, barrier), [digits, barrier]);
  const [probField, setProbField] = useState('overProb');
  const [comparator, setComparator] = useState('>');
  const [probValue, setProbValue] = useState(55);
  const [lastNEnabled, setLastNEnabled] = useState(false);
  const [lastN, setLastN] = useState(3);
  const [lastNType, setLastNType] = useState('over');
  const [stake, setStake] = useState(0.5);
  const [ticks, setTicks] = useState(1);
  const [martingale, setMartingale] = useState(1);
  const [running, setRunning] = useState(false);
  const [action, setAction] = useState<TradeAction>('BUY_OVER');
  const rules = useMemo(() => {
    const r = [createDefaultRule(probField as ConditionField, probValue)];
    r[0].comparator = comparator as any;
    if (lastNEnabled) r.push({ id: newRuleId(), field: 'lastNMatch' as ConditionField, comparator: '>' as any, value: 0, matchType: lastNType as any, matchN: lastN });
    return r;
  }, [probField, comparator, probValue, lastNEnabled, lastN, lastNType]);

  const conditionsMet = useMemo(() => evaluateAllRules(rules, { digits, barrier, targetDigit: 5 }), [rules, digits, barrier]);
  const { placing, log } = useAutoTrade(running, digits, conditionsMet, stake, martingale, ticks, action, barrier, 5, symbol, placeTrade, () => setRunning(false));

  return (
    <TradeCard title="Over/Under" statusDot={running ? 'green' : 'gray'} isDark={isDark}>
      {/* Barrier */}
      <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
        <span className="text-xs text-gray-500">Barrier</span>
        <SmallInput value={barrier} onChange={v => setBarrier(Math.max(0, Math.min(9, Math.round(v))))} min={0} step={1} className="w-10 text-center" />
        <span className="text-[10px] text-gray-400 ml-1">Under: 0–{barrier - 1}, Equals: {barrier}, Over: {barrier + 1}–9</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-10 text-xs font-semibold text-green-600">Over</span>
          <div className="flex-1"><PctBar pct={ou.overPercent} color="#22c55e" /></div>
          <span className="w-14 text-right text-xs font-bold text-green-600 tabular-nums">{ou.overPercent.toFixed(2)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-10 text-xs font-semibold text-amber-600">Under</span>
          <div className="flex-1"><PctBar pct={ou.underPercent} color="#f59e0b" /></div>
          <span className="w-14 text-right text-xs font-bold text-amber-600 tabular-nums">{ou.underPercent.toFixed(2)}%</span>
        </div>
      </div>
      <InlineConditionBuilder
        probField={probField} probFieldOptions={[{ value: 'overProb', label: 'Over Prob' }, { value: 'underProb', label: 'Under Prob' }]}
        onProbFieldChange={setProbField}
        comparator={comparator} onComparatorChange={setComparator}
        probValue={probValue} onProbValueChange={setProbValue}
        showLastN lastNEnabled={lastNEnabled} onLastNToggle={setLastNEnabled}
        lastN={lastN} onLastNChange={setLastN}
        lastNType={lastNType}
        lastNTypeOptions={[{ value: 'over', label: 'Over' }, { value: 'under', label: 'Under' }]}
        onLastNTypeChange={setLastNType}
        lastNExtra={<span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-700">{barrier}</span>}
        action={action} onActionChange={(v) => setAction(v as TradeAction)} actionOptions={ALL_ACTIONS}
      />
      <StakeRow stake={stake} onStake={setStake} ticks={ticks} onTicks={setTicks} martingale={martingale} onMartingale={setMartingale} />
      {log.length > 0 && (
        <div className="flex gap-2 text-[10px]">
          <span className="text-green-600 font-bold">Placed: {log.filter(l => l.result === 'placed').length}</span>
        </div>
      )}
      <AutoButton running={running} loading={placing} onClick={() => { if (!account) { onLoginRequest(); return; } setRunning(r => !r); }} />
    </TradeCard>
  );
}

// ─── 5. Over / Under Pattern Card ────────────────────────────────────────────
function OverUnderPatternCard({ digits, symbol, account, placeTrade, isDark, onLoginRequest }: Omit<Props, 'currentDigit' | 'currentQuote'>) {
  const [barrier, setBarrier] = useState(5);
  const [lastN, setLastN] = useState(3);
  const [lastNType, setLastNType] = useState('over');
  const [stake, setStake] = useState(0.5);
  const [ticks, setTicks] = useState(1);
  const [martingale, setMartingale] = useState(1);
  const [running, setRunning] = useState(false);
  const [action, setAction] = useState<TradeAction>('BUY_OVER');

  const ds = useMemo(() => computeDigitStats(digits), [digits]);
  const last20 = digits.slice(-20);

  const rules = useMemo(() => [{
    id: newRuleId(), field: 'lastNMatch' as ConditionField,
    comparator: '>' as any, value: 0, matchType: lastNType as any, matchN: lastN,
  }], [lastNType, lastN]);

  const conditionsMet = useMemo(() => evaluateAllRules(rules, { digits, barrier, targetDigit: 5 }), [rules, digits, barrier]);
  const { placing, log } = useAutoTrade(running, digits, conditionsMet, stake, martingale, ticks, action, barrier, 5, symbol, placeTrade, () => setRunning(false));

  const maxPct = Math.max(...ds.percents, 1);

  return (
    <TradeCard title="Over/Under" statusDot={running ? 'green' : 'gray'} isDark={isDark}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Last Digits Pattern</p>
        <div className="flex flex-wrap gap-1">
          {last20.map((d, i) => {
            const isO = d > barrier, isU = d < barrier;
            const label = isO ? 'O' : isU ? 'U' : 'E';
            const bg = isO ? '#22c55e' : isU ? '#f59e0b' : '#94a3b8';
            return (
              <div key={i} className="flex h-8 w-8 flex-col items-center justify-center rounded-full text-[9px] font-black text-white leading-none"
                style={{ background: bg, boxShadow: i === last20.length - 1 ? '0 0 0 2px white, 0 0 0 3px #64748b' : undefined }}>
                <span>{label}{d}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] text-gray-400">O=Over (&gt;{barrier}), E=Equal (={barrier}), U=Under (&lt;{barrier})</p>
      </div>
      {/* Digit frequency bars */}
      <div>
        <div className="flex items-end gap-1" style={{ height: 56 }}>
          {Array.from({ length: 10 }, (_, d) => {
            const pct = ds.percents[d];
            const h = Math.max(4, (pct / maxPct) * 48);
            const isO = d > barrier, isU = d < barrier;
            const color = isO ? '#22c55e' : isU ? '#f59e0b' : '#94a3b8';
            return (
              <div key={d} className="flex flex-col items-center flex-1 gap-0.5">
                <span className="text-[8px] tabular-nums leading-none text-gray-400">{pct.toFixed(1)}%</span>
                <div className="w-full rounded-t-sm" style={{ height: h, background: color }} />
                <span className="text-[9px] font-bold text-gray-600">{d}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* Condition */}
      <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
        <span className="text-xs text-gray-500">Barrier</span>
        <SmallInput value={barrier} onChange={v => setBarrier(Math.max(0, Math.min(9, Math.round(v))))} min={0} step={1} className="w-10 text-center" />
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Trading Condition</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-500">Check if the last</span>
          <SmallInput value={lastN} onChange={v => setLastN(Math.max(1, Math.round(v)))} min={1} step={1} className="w-10 text-center" />
          <span className="text-xs text-gray-500">digits are</span>
          <SmallSelect value={lastNType} onChange={setLastNType} options={[{ value: 'over', label: 'Over' }, { value: 'under', label: 'Under' }]} />
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-700">{barrier}</span>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
          <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">Then</span>
          <SmallSelect value={action} onChange={(v) => setAction(v as TradeAction)} options={ALL_ACTIONS} className="flex-1" />
        </div>
      </div>
      <StakeRow stake={stake} onStake={setStake} ticks={ticks} onTicks={setTicks} martingale={martingale} onMartingale={setMartingale} />
      {log.length > 0 && (
        <div className="flex gap-2 text-[10px]">
          <span className="text-green-600 font-bold">Placed: {log.filter(l => l.result === 'placed').length}</span>
        </div>
      )}
      <AutoButton running={running} loading={placing} onClick={() => { if (!account) { onLoginRequest(); return; } setRunning(r => !r); }} />
    </TradeCard>
  );
}

// ─── 6. Matches / Differs Card ────────────────────────────────────────────────
function MatchesDiffersCard({ digits, symbol, account, placeTrade, isDark, onLoginRequest }: Omit<Props, 'currentDigit' | 'currentQuote'>) {
  const [targetDigit, setTargetDigit] = useState(5);
  const [probField, setProbField] = useState('digitProb');
  const [comparator, setComparator] = useState('>');
  const [probValue, setProbValue] = useState(55);
  const [stake, setStake] = useState(0.5);
  const [ticks, setTicks] = useState(1);
  const [martingale, setMartingale] = useState(1);
  const [running, setRunning] = useState(false);
  const [action, setAction] = useState<TradeAction>('BUY_MATCH');

  const ds = useMemo(() => computeDigitStats(digits), [digits]);
  const mostFreq = useMemo(() => {
    let max = -1, idx = 0;
    ds.percents.forEach((p, i) => { if (p > max) { max = p; idx = i; } });
    return { digit: idx, pct: max };
  }, [ds]);

  const matchPct = ds.percents[targetDigit] ?? 0;
  const differPct = 100 - matchPct;
  const maxPct = Math.max(...ds.percents, 1);

  const rules = useMemo(() => {
    const r = [createDefaultRule(probField as ConditionField, probValue)];
    r[0].comparator = comparator as any;
    return r;
  }, [probField, comparator, probValue]);

  const conditionsMet = useMemo(() => evaluateAllRules(rules, { digits, barrier: 5, targetDigit }), [rules, digits, targetDigit]);
  const { placing, log } = useAutoTrade(running, digits, conditionsMet, stake, martingale, ticks, action, 5, targetDigit, symbol, placeTrade, () => setRunning(false));

  return (
    <TradeCard title="Matches/Differs" statusDot={running ? 'green' : 'gray'} isDark={isDark}>
      {/* Most frequent */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">
        Most frequent: <span className="font-black">{mostFreq.digit}</span> ({mostFreq.pct.toFixed(2)}%)
      </div>
      {/* Matches/Differs bars */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-20 text-xs font-semibold text-purple-600">Matches {targetDigit}</span>
          <div className="flex-1"><PctBar pct={matchPct} color="#a855f7" /></div>
          <span className="w-14 text-right text-xs font-bold text-purple-600 tabular-nums">{matchPct.toFixed(2)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-20 text-xs font-semibold text-pink-600">Differs from {targetDigit}</span>
          <div className="flex-1"><PctBar pct={differPct} color="#ec4899" /></div>
          <span className="w-14 text-right text-xs font-bold text-pink-600 tabular-nums">{differPct.toFixed(2)}%</span>
        </div>
        <p className="text-[10px] text-gray-400">Barrier digit {targetDigit} appears {matchPct.toFixed(2)}% of the time</p>
      </div>
      {/* Digit freq distribution */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Digit Frequency Distribution</p>
        <div className="flex items-end gap-1" style={{ height: 56 }}>
          {Array.from({ length: 10 }, (_, d) => {
            const pct = ds.percents[d];
            const h = Math.max(4, (pct / maxPct) * 48);
            const isTarget = d === targetDigit;
            return (
              <div key={d} className="flex flex-col items-center flex-1 gap-0.5">
                <span className="text-[8px] tabular-nums leading-none text-gray-400">{pct.toFixed(1)}%</span>
                <div className="w-full rounded-t-sm" style={{ height: h, background: isTarget ? '#ec4899' : '#d1d5db' }} />
                <span className={cn('text-[9px] font-bold', isTarget ? 'text-pink-600' : 'text-gray-600')}>{d}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* Condition */}
      <InlineConditionBuilder
        probField={probField} probFieldOptions={[{ value: 'digitProb', label: 'Matches Prob' }, { value: 'differProb', label: 'Differs Prob' }]}
        onProbFieldChange={setProbField}
        comparator={comparator} onComparatorChange={setComparator}
        probValue={probValue} onProbValueChange={setProbValue}
        showForDigit forDigit={targetDigit} onForDigitChange={setTargetDigit}
        showLastN={false} lastNEnabled={false} onLastNToggle={() => {}}
        lastN={3} onLastNChange={() => {}} lastNType="even" lastNTypeOptions={[]} onLastNTypeChange={() => {}}
        action={action} onActionChange={(v) => setAction(v as TradeAction)} actionOptions={ALL_ACTIONS}
      />
      <StakeRow stake={stake} onStake={setStake} ticks={ticks} onTicks={setTicks} martingale={martingale} onMartingale={setMartingale} />
      {log.length > 0 && (
        <div className="flex gap-2 text-[10px]">
          <span className="text-green-600 font-bold">Placed: {log.filter(l => l.result === 'placed').length}</span>
        </div>
      )}
      <AutoButton running={running} loading={placing} onClick={() => { if (!account) { onLoginRequest(); return; } setRunning(r => !r); }} />
    </TradeCard>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────
export function SmartTradingTab({ digits, currentDigit, currentQuote, symbol, account, placeTrade, isDark, onLoginRequest }: Props) {
  const cardProps = { digits, symbol, account, placeTrade, isDark, onLoginRequest };

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className={cn(
        'flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3 text-sm',
        isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-800',
      )}>
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase text-gray-400">Symbol</p>
            <p className="font-bold">{symbol}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-gray-400">Ticks</p>
            <p className="font-bold tabular-nums">{digits.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-gray-400">Price</p>
            <p className="font-bold tabular-nums">{currentQuote.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-gray-400">Last Digit</p>
            <p className="font-black text-blue-600 tabular-nums">{currentDigit}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {account ? (
            <span className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700">
              {account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {account.currency}
            </span>
          ) : (
            <button onClick={onLoginRequest}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-600 transition-colors">
              <RefreshCw className="h-3.5 w-3.5" /> Reconnect
            </button>
          )}
        </div>
      </div>

      {/* 4-column card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <RiseFallCard {...cardProps} />
        <EvenOddStatsCard {...cardProps} />
        <EvenOddPatternCard {...cardProps} />
        <OverUnderStatsCard {...cardProps} />
      </div>

      {/* 2nd row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <OverUnderPatternCard {...cardProps} />
        <MatchesDiffersCard {...cardProps} />
      </div>
    </div>
  );
}
