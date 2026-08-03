import { useMemo, useState } from 'react';
import {
  TrendingUp, Activity, X, Zap,
  ArrowUp, ArrowDown, Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  analyzeTicks, generateStandardSignals, generateProSignals,
  generateSuperSignals, generateRiseFallSignal,
  type Signal,
} from '@/lib/signals';

type Props = {
  digits: number[];
  quotes: number[];
  currentDigit: number;
  isDark: boolean;
};

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  'TRADE NOW': {
    bg: 'bg-gradient-to-r from-green-500/20 to-emerald-500/20',
    text: 'text-green-500',
    border: 'border-green-500/40',
    label: 'TRADE NOW',
  },
  WAIT: {
    bg: 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20',
    text: 'text-amber-500',
    border: 'border-amber-500/40',
    label: 'WAIT',
  },
  NEUTRAL: {
    bg: 'bg-gradient-to-r from-slate-500/10 to-slate-400/10',
    text: 'text-slate-400',
    border: 'border-slate-400/30',
    label: 'NEUTRAL',
  },
};

const TYPE_ICONS: Record<string, typeof Activity> = {
  even_odd: Activity,
  over_under: TrendingUp,
  matches: Target,
  differs: X,
  rise_fall: ArrowUp,
  pro_even_odd: Zap,
  pro_over_under: Zap,
  pro_differs: Zap,
  under_7: ArrowDown,
  over_2: ArrowUp,
};

export function SignalsTab({ digits, quotes, currentDigit, isDark }: Props) {
  const [filter, setFilter] = useState<'all' | 'active' | 'standard' | 'pro' | 'super'>('active');

  const analysis = useMemo(() => analyzeTicks(digits), [digits]);
  const standardSigs = useMemo(() => {
    const s = generateStandardSignals(analysis);
    s.push(generateRiseFallSignal(quotes));
    return s;
  }, [analysis, quotes]);
  const proSigs = useMemo(() => generateProSignals(analysis, digits), [analysis, digits]);
  const superSigs = useMemo(() => generateSuperSignals(analysis, digits, quotes), [analysis, digits, quotes]);

  const allSigs = useMemo(() => {
    const combined = [...superSigs, ...proSigs, ...standardSigs];
    return combined.sort((a, b) => {
      const statusOrder = { 'TRADE NOW': 0, WAIT: 1, NEUTRAL: 2 };
      const sa = statusOrder[a.status] ?? 3;
      const sb = statusOrder[b.status] ?? 3;
      if (sa !== sb) return sa - sb;
      return b.probability - a.probability;
    });
  }, [superSigs, proSigs, standardSigs]);

  const filtered = useMemo(() => {
    if (filter === 'all') return allSigs;
    if (filter === 'active') return allSigs.filter((s) => s.status !== 'NEUTRAL');
    return allSigs.filter((s) => s.category === filter);
  }, [allSigs, filter]);

  const activeCount = allSigs.filter((s) => s.status === 'TRADE NOW').length;
  const waitCount = allSigs.filter((s) => s.status === 'WAIT').length;

  const cardBg = isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-gray-200';
  const headingColor = isDark ? 'text-white' : 'text-gray-800';
  const subTextColor = isDark ? 'text-slate-400' : 'text-gray-500';

  return (
    <div className="space-y-4">
      {/* ── Header strip ── */}
      <div className={cn('flex items-center gap-4 rounded-xl px-4 py-3 border', cardBg)}>
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-500" />
          <span className={cn('text-sm font-bold', headingColor)}>Trading Signals</span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className={cn('font-bold', subTextColor)}>{activeCount} Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className={cn('font-bold', subTextColor)}>{waitCount} Waiting</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[11px]', subTextColor)}>Ticks</span>
            <span className={cn('font-mono font-bold', headingColor)}>{digits.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[11px]', subTextColor)}>Last</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-cyan-400 text-xs font-bold text-white">
              {currentDigit}
            </span>
          </div>
        </div>
      </div>

      {/* ── Filter pills ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { id: 'active', label: 'Active Only' },
          { id: 'all', label: 'All Signals' },
          { id: 'super', label: 'Super Signals' },
          { id: 'pro', label: 'Pro Signals' },
          { id: 'standard', label: 'Standard' },
        ] as const).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-all',
              filter === f.id
                ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-md shadow-blue-500/20'
                : isDark
                  ? 'bg-white/5 text-slate-400 hover:bg-white/10'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Market overview cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Even" value={`${analysis.evenPercentage.toFixed(1)}%`} sub={`${analysis.evenCount} ticks`} color="text-blue-500" isDark={isDark} />
        <MiniStat label="Odd" value={`${analysis.oddPercentage.toFixed(1)}%`} sub={`${analysis.oddCount} ticks`} color="text-purple-500" isDark={isDark} />
        <MiniStat label="High (5-9)" value={`${analysis.highPercentage.toFixed(1)}%`} sub={`${analysis.highCount} ticks`} color="text-green-500" isDark={isDark} />
        <MiniStat label="Low (0-4)" value={`${analysis.lowPercentage.toFixed(1)}%`} sub={`${analysis.lowCount} ticks`} color="text-amber-500" isDark={isDark} />
      </div>

      {/* ── Power index ── */}
      <div className={cn('rounded-xl p-4 border', cardBg)}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={cn('text-sm font-bold', headingColor)}>Power Index</h3>
          <span className={cn('text-[11px]', subTextColor)}>Strongest vs Weakest</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={cn('text-[11px]', subTextColor)}>Strongest</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-400 text-lg font-black text-white">
              {analysis.powerIndex.strongest}
            </span>
            <span className={cn('text-xs font-bold', 'text-green-500')}>
              {analysis.digitFrequencies[analysis.powerIndex.strongest].percentage.toFixed(1)}%
            </span>
          </div>
          <div className={cn('flex-1 text-center text-xs font-semibold', subTextColor)}>
            Gap: <span className={cn('font-bold', analysis.powerIndex.gap >= 15 ? 'text-green-500' : 'text-amber-500')}>{analysis.powerIndex.gap.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-bold', 'text-red-400')}>
              {analysis.digitFrequencies[analysis.powerIndex.weakest].percentage.toFixed(1)}%
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-400 text-lg font-black text-white">
              {analysis.powerIndex.weakest}
            </span>
            <span className={cn('text-[11px]', subTextColor)}>Weakest</span>
          </div>
        </div>
      </div>

      {/* ── Signals list ── */}
      <div className={cn('rounded-xl p-4 border', cardBg)}>
        <h3 className={cn('text-sm font-bold mb-3', headingColor)}>
          Signals {filter === 'active' && `(${filtered.length} active)`}
        </h3>
        <div className="space-y-2.5">
          {filtered.length === 0 && (
            <div className={cn('text-center py-8 text-sm', subTextColor)}>
              No signals match this filter
            </div>
          )}
          {filtered.map((sig) => (
            <SignalCard key={sig.id} sig={sig} isDark={isDark} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Mini Stat ─────────────────────────────────────────────────────────────────
function MiniStat({ label, value, sub, color, isDark }: {
  label: string; value: string; sub: string; color: string; isDark: boolean;
}) {
  return (
    <div className={cn('rounded-xl p-3 border', isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-gray-200')}>
      <div className={cn('text-[10px] font-bold uppercase tracking-wide', isDark ? 'text-slate-400' : 'text-gray-400')}>{label}</div>
      <div className={cn('text-lg font-black tabular-nums', color)}>{value}</div>
      <div className={cn('text-[10px]', isDark ? 'text-slate-500' : 'text-gray-400')}>{sub}</div>
    </div>
  );
}

// ── Signal Card ───────────────────────────────────────────────────────────────
function SignalCard({ sig, isDark }: { sig: Signal; isDark: boolean }) {
  const Icon = TYPE_ICONS[sig.type] ?? Activity;
  const st = STATUS_STYLES[sig.status] ?? STATUS_STYLES.NEUTRAL;
  const catBadge = sig.category === 'super'
    ? { label: 'SUPER', cls: isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-600' }
    : sig.category === 'pro'
      ? { label: 'PRO', cls: isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-600' }
      : { label: 'STANDARD', cls: isDark ? 'bg-slate-500/20 text-slate-300' : 'bg-slate-100 text-slate-600' };

  return (
    <div className={cn(
      'rounded-xl border p-3 transition-all',
      sig.status === 'TRADE NOW'
        ? isDark ? 'bg-green-500/5 border-green-500/30' : 'bg-green-50 border-green-200'
        : sig.status === 'WAIT'
          ? isDark ? 'bg-amber-500/5 border-amber-500/30' : 'bg-amber-50 border-amber-200'
          : isDark ? 'bg-white/[0.02] border-white/10' : 'bg-gray-50 border-gray-200'
    )}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          sig.status === 'TRADE NOW'
            ? 'bg-gradient-to-br from-green-500 to-emerald-400 text-white'
            : sig.status === 'WAIT'
              ? 'bg-gradient-to-br from-amber-500 to-yellow-400 text-white'
              : isDark ? 'bg-white/10 text-slate-400' : 'bg-gray-200 text-gray-400'
        )}>
          <Icon className="h-4 w-4" />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-sm font-bold', isDark ? 'text-white' : 'text-gray-800')}>{sig.name}</span>
            <span className={cn('rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide', catBadge.cls)}>{catBadge.label}</span>
            {sig.targetDigit !== undefined && (
              <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', isDark ? 'bg-white/10 text-white' : 'bg-gray-200 text-gray-700')}>
                Digit: {sig.targetDigit}
              </span>
            )}
            {sig.barrier !== undefined && (
              <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', isDark ? 'bg-white/10 text-white' : 'bg-gray-200 text-gray-700')}>
                Barrier: {sig.barrier}
              </span>
            )}
          </div>
          <p className={cn('text-xs mt-1', isDark ? 'text-slate-300' : 'text-gray-600')}>{sig.recommendation}</p>
          <p className={cn('text-[11px] mt-0.5', isDark ? 'text-slate-500' : 'text-gray-400')}>
            <span className="font-semibold">Entry:</span> {sig.entryCondition}
          </p>
        </div>

        {/* Status + Probability */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black', st.bg, st.text, st.border, 'border')}>
            {sig.status}
          </span>
          <span className={cn('text-lg font-black tabular-nums', st.text)}>{sig.probability.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
