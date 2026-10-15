import { useMemo, useState } from 'react';
import { CheckCircle2, Check, X, Target, BarChart2, Flame, RefreshCw, Zap } from 'lucide-react';
import { computeMatchesStats } from '@/lib/analysis';
import { DigitsLineChart } from '@/components/DigitsLineChart';
import { cn } from '@/lib/utils';

type Props = {
  digits: number[];
  currentDigit: number;
  isDark?: boolean;
};

export function MatchesTab({ digits, currentDigit, isDark = true }: Props) {
  const [lookback, setLookback] = useState<25 | 50 | 100 | 200>(50);
  const [filterMatchesOnly, setFilterMatchesOnly] = useState(false);

  const slice = useMemo(() => digits.slice(-lookback), [digits, lookback]);
  const m = useMemo(() => computeMatchesStats(slice), [slice]);

  const lastDigit = slice.length > 0 ? slice[slice.length - 1] : currentDigit;
  const lastDigitCount = m.stats.counts[lastDigit] ?? 0;
  const lastDigitPercent = m.stats.percents[lastDigit] ?? 0;

  // Calculate ticks since last consecutive match
  const ticksSinceLastMatch = useMemo(() => {
    let count = 0;
    for (let i = slice.length - 1; i >= 1; i--) {
      if (slice[i] === slice[i - 1]) return count;
      count++;
    }
    return count;
  }, [slice]);

  // Theme styling tokens
  const panelBg = isDark ? '#0a0e27' : '#ffffff';
  const panelBorder = isDark ? 'border-white/10' : 'border-blue-200/50';
  const cardBg = isDark ? '#111736' : '#f8faff';
  const cardBorder = isDark ? 'border-[#1e2a5e]' : 'border-blue-200/40';
  const headingColor = isDark ? 'text-white' : 'text-[#1a2a4a]';
  const subTextColor = isDark ? 'text-[#9ca3af]' : 'text-[#7a8aaa]';
  const mutedColor = isDark ? 'text-[#6b7280]' : 'text-[#9aaaba]';
  const pillActive = 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25';
  const pillInactive = isDark
    ? 'bg-white/5 text-[#9ca3af] hover:bg-white/10 hover:text-white border border-white/5'
    : 'bg-blue-50/70 text-[#5a6a8a] hover:bg-blue-100 hover:text-[#2563eb] border border-blue-200/40';

  const deviation = m.matchPercent - m.expectedMatchPercent;
  const filteredPairs = filterMatchesOnly ? m.recentPairs.filter(p => p.match) : m.recentPairs;

  return (
    <div className="space-y-4">
      {/* ── Header Controls ── */}
      <div className={cn('rounded-2xl p-5 border shadow-sm glass-panel', panelBorder)}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30 neu-tile">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className={cn('text-lg font-bold flex items-center gap-2', headingColor)}>
                Matches Analysis
                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border shadow-sm', isDark ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-400' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
                  Expected 10.0% Match Rate
                </span>
              </h2>
              <p className={cn('text-xs mt-0.5', subTextColor)}>
                Real-time tracking of consecutive digit repeats (Digit[T] === Digit[T-1]) and frequency clusters
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className={cn('text-xs font-bold uppercase tracking-wider', mutedColor)}>Lookback:</span>
            <div className="inline-flex rounded-xl p-1 neu-inset">
              {([25, 50, 100, 200] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setLookback(n)}
                  className={cn('rounded-lg px-3 py-1 text-xs font-bold transition-all', lookback === n ? pillActive : pillInactive)}
                >
                  {n} Ticks
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Hero Metrics Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Match Rate Card */}
        <div className={cn('rounded-2xl p-4 border shadow-sm flex flex-col justify-between glass-card-elevated', cardBorder)}>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className={cn('text-xs font-medium', subTextColor)}>Observed Match Rate</p>
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm', deviation >= 0 ? (isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700') : (isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'))}>
                {deviation >= 0 ? `+${deviation.toFixed(1)}%` : `${deviation.toFixed(1)}%`} vs Exp
              </span>
            </div>
            <p className={cn('text-3xl font-black', m.matchPercent >= 10 ? 'text-emerald-400' : 'text-blue-400')}>
              {m.matchPercent.toFixed(1)}%
            </p>
          </div>
          <div className="mt-3">
            <div className={cn('h-2 w-full rounded-full overflow-hidden p-0.5', isDark ? 'bg-black/40' : 'bg-blue-100')}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                style={{ width: `${Math.min(m.matchPercent * 3.3, 100)}%` }}
              />
            </div>
            <p className={cn('text-[10px] mt-1', mutedColor)}>Baseline probability: 10.0% (1 in 10)</p>
          </div>
        </div>

        {/* Total Matches Card */}
        <div className={cn('rounded-2xl p-4 border shadow-sm flex flex-col justify-between glass-card-elevated', cardBorder)}>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Target className="h-4 w-4 text-emerald-400" />
              <p className={cn('text-xs font-medium', subTextColor)}>Consecutive Matches</p>
            </div>
            <p className="text-3xl font-black text-emerald-400">
              {m.matchCount} <span className={cn('text-sm font-semibold', mutedColor)}>/ {m.totalPairs} pairs</span>
            </p>
          </div>
          <p className={cn('text-xs mt-3', subTextColor)}>
            {m.matchCount > 0 ? `${(m.totalPairs / m.matchCount).toFixed(1)} ticks per match average` : 'No matches recorded yet'}
          </p>
        </div>

        {/* Drought Meter */}
        <div className={cn('rounded-2xl p-4 border shadow-sm flex flex-col justify-between glass-card-elevated', cardBorder)}>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Flame className={cn('h-4 w-4', ticksSinceLastMatch > 15 ? 'text-amber-400' : 'text-blue-400')} />
              <p className={cn('text-xs font-medium', subTextColor)}>Ticks Since Match</p>
            </div>
            <p className={cn('text-3xl font-black', ticksSinceLastMatch >= 20 ? 'text-orange-400' : 'text-blue-400')}>
              {ticksSinceLastMatch} <span className={cn('text-sm font-semibold', mutedColor)}>ticks ago</span>
            </p>
          </div>
          <p className={cn('text-xs mt-3', subTextColor)}>
            {ticksSinceLastMatch >= 18 ? '⚡ Statistically due for a match repeat' : 'Active match interval normal'}
          </p>
        </div>

        {/* Current Digit Focus */}
        <div className={cn('rounded-2xl p-4 border shadow-sm flex flex-col justify-between glass-card-elevated', cardBorder)}>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <RefreshCw className="h-4 w-4 text-indigo-400" />
              <p className={cn('text-xs font-medium', subTextColor)}>Latest Digit</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white font-black text-xl shadow-md shadow-indigo-500/30 neu-tile">
                {lastDigit}
              </span>
              <div>
                <p className={cn('text-sm font-black', headingColor)}>{lastDigitPercent.toFixed(1)}%</p>
                <p className={cn('text-[11px]', mutedColor)}>{lastDigitCount} occurrences</p>
              </div>
            </div>
          </div>
          <p className={cn('text-xs mt-3', subTextColor)}>Target to repeat next: Digit {lastDigit}</p>
        </div>
      </div>

      {/* ── Digit Frequency Matrix ── */}
      <div className={cn('rounded-2xl p-5 border shadow-sm glass-panel', panelBorder)}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={cn('text-sm font-bold', headingColor)}>Digit Distribution & Repeat Frequency</h3>
            <p className={cn('text-xs', subTextColor)}>Occurrences and share of each digit over the last {lookback} ticks</p>
          </div>
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded border shadow-sm', isDark ? 'border-white/10 text-gray-400' : 'border-gray-200 text-gray-600')}>
            Active digit glowing
          </span>
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2.5">
          {m.stats.counts.map((count, digit) => {
            const pct = m.stats.percents[digit];
            const isCurrent = digit === lastDigit;
            return (
              <div
                key={digit}
                className={cn(
                  'rounded-xl p-2.5 text-center transition-all border shadow-sm',
                  isCurrent
                    ? (isDark ? 'bg-blue-600/20 border-blue-500 text-white ring-2 ring-blue-500/40' : 'bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-300')
                    : 'glass-card-elevated',
                  cardBorder
                )}
              >
                <div
                  className={cn(
                    'mx-auto h-9 w-9 flex items-center justify-center rounded-lg font-black text-base shadow-sm mb-1 neu-tile',
                    isCurrent
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
                      : (isDark ? 'bg-white/5 text-white' : 'bg-gray-100 text-[#1a2a4a]')
                  )}
                >
                  {digit}
                </div>
                <p className={cn('text-xs font-bold leading-tight', isCurrent ? 'text-blue-400' : headingColor)}>
                  {count}x
                </p>
                <p className={cn('text-[10px] leading-tight', mutedColor)}>
                  {pct.toFixed(0)}%
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Digits Line Chart Section ── */}
      <div className={cn('rounded-2xl border overflow-hidden shadow-sm glass-panel', panelBorder)}>
        <div className="px-5 pt-4 pb-2 border-b flex items-center justify-between" style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
          <h3 className={cn('text-sm font-bold flex items-center gap-2', headingColor)}>
            <BarChart2 className="h-4 w-4 text-emerald-400" />
            Digit Sequence Line Trend
          </h3>
          <span className={cn('text-xs', mutedColor)}>Spot horizontal flat lines indicating consecutive digit matches</span>
        </div>
        <div className="px-5 py-4">
          <DigitsLineChart digits={digits} isDark={isDark} defaultCount={20} counts={[10, 20, 50, 60]} />
        </div>
      </div>

      {/* ── Recent Pairs Stream ── */}
      <div className={cn('rounded-2xl p-5 border shadow-sm glass-panel', panelBorder)}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className={cn('text-sm font-bold', headingColor)}>Recent Consecutive Pairs</h3>
            <p className={cn('text-xs', subTextColor)}>Consecutive tick transitions (latest pair at top)</p>
          </div>
          <button
            onClick={() => setFilterMatchesOnly(!filterMatchesOnly)}
            className={cn('self-start sm:self-auto rounded-lg px-3 py-1 text-xs font-bold transition-all border', filterMatchesOnly ? pillActive : pillInactive)}
          >
            {filterMatchesOnly ? 'Showing Matches Only' : 'Show Matches Only'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredPairs.length === 0 ? (
            <p className={cn('text-sm py-4 col-span-full text-center', mutedColor)}>
              {filterMatchesOnly ? 'No matches found in the selected sample.' : 'Waiting for tick data…'}
            </p>
          ) : (
            filteredPairs.map((pair, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between rounded-xl p-3 border transition-all shadow-sm',
                  pair.match
                    ? (isDark ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-emerald-300 bg-emerald-50/70')
                    : (isDark ? 'border-white/5 bg-white/2' : 'border-gray-100 bg-gray-50/60')
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg font-black text-sm shadow-sm', isDark ? 'bg-white/10 text-white' : 'bg-white border text-gray-800')}>
                    {pair.a}
                  </span>
                  <span className={cn('text-xs font-bold', mutedColor)}>→</span>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg font-black text-sm shadow-sm', pair.match ? 'bg-emerald-500 text-white' : (isDark ? 'bg-white/10 text-white' : 'bg-white border text-gray-800'))}>
                    {pair.b}
                  </span>
                </div>

                {pair.match ? (
                  <span className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-black bg-emerald-500 text-white shadow-sm shadow-emerald-500/30">
                    <Check className="h-3.5 w-3.5" /> MATCH!
                  </span>
                ) : (
                  <span className={cn('inline-flex items-center gap-1 text-xs font-medium', mutedColor)}>
                    <X className="h-3 w-3" /> Differ
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Match Signal Analysis ── */}
      <div
        className={cn('rounded-2xl p-5 border shadow-sm glass-panel', isDark ? 'border-white/10' : 'border-blue-200/50')}
        style={{
          background: m.matchPercent >= 14
            ? (isDark ? '#06281e' : '#ecfdf5')
            : ticksSinceLastMatch >= 18
              ? (isDark ? '#2e1805' : '#fffbeb')
              : (isDark ? '#0e172a' : '#f0fdf4'),
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl text-white font-bold',
              m.matchPercent >= 14 ? 'bg-emerald-600' : ticksSinceLastMatch >= 18 ? 'bg-amber-500' : 'bg-blue-600'
            )}
          >
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-bold', headingColor)}>Matches Condition Status</span>
              <span
                className={cn(
                  'text-[10px] font-black uppercase px-2 py-0.5 rounded-full',
                  m.matchPercent >= 14
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : ticksSinceLastMatch >= 18
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                )}
              >
                {m.matchPercent >= 14
                  ? 'High Match Frequency'
                  : ticksSinceLastMatch >= 18
                  ? 'Overdue Match Alert'
                  : 'Normal Distribution'}
              </span>
            </div>
            <p className={cn('text-xs mt-0.5', subTextColor)}>
              {m.matchPercent >= 14
                ? `Matches are running hot at ${m.matchPercent.toFixed(1)}% (+${(m.matchPercent - 10).toFixed(1)}% above expected). Consecutive duplicates are clustering.`
                : ticksSinceLastMatch >= 18
                ? `No consecutive match recorded for ${ticksSinceLastMatch} ticks. High statistical potential for a repeat on high-probability digits.`
                : `Observed match rate of ${m.matchPercent.toFixed(1)}% is in alignment with standard random expectancy (10.0%). Current digit ${lastDigit} has ${lastDigitPercent.toFixed(1)}% frequency.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
