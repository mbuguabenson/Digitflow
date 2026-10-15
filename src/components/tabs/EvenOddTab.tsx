import { useMemo, useState } from 'react';
import { Activity, Flame, Zap, TrendingUp, BarChart2, ShieldAlert } from 'lucide-react';
import { computeEvenOddStats, computeStreaks } from '@/lib/analysis';
import { DigitsLineChart } from '@/components/DigitsLineChart';
import { cn } from '@/lib/utils';

type Props = {
  digits: number[];
  currentDigit: number;
  isDark?: boolean;
};

export function EvenOddTab({ digits, currentDigit, isDark = true }: Props) {
  const [lookback, setLookback] = useState<25 | 50 | 100 | 200>(50);
  const [sequenceView, setSequenceView] = useState<15 | 30 | 50>(30);

  const slice = useMemo(() => digits.slice(-lookback), [digits, lookback]);
  const stats = useMemo(() => computeEvenOddStats(slice), [slice]);
  const streaks = useMemo(() => computeStreaks(slice), [slice]);

  // Current active streak calculation
  const currentStreak = useMemo(() => {
    if (slice.length === 0) return { count: 0, type: 'none' as const };
    const lastType = slice[slice.length - 1] % 2 === 0 ? 'EVEN' : 'ODD';
    let count = 0;
    for (let i = slice.length - 1; i >= 0; i--) {
      const t = slice[i] % 2 === 0 ? 'EVEN' : 'ODD';
      if (t === lastType) count++;
      else break;
    }
    return { count, type: lastType };
  }, [slice]);

  const recentDigits = useMemo(() => slice.slice(-sequenceView), [slice, sequenceView]);

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

  const deviationEven = stats.evenPercent - 50;
  const deviationOdd = stats.oddPercent - 50;
  const bias = Math.abs(deviationEven) >= 6
    ? deviationEven > 0 ? 'EVEN_BIASED' : 'ODD_BIASED'
    : 'NEUTRAL';

  return (
    <div className="space-y-4">
      {/* ── Header Controls ── */}
      <div className={cn('rounded-2xl p-5 border shadow-sm glass-panel', panelBorder)}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-indigo-500/30 neu-tile">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h2 className={cn('text-lg font-bold flex items-center gap-2', headingColor)}>
                Even / Odd Analysis
                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border shadow-sm', isDark ? 'border-indigo-400/30 bg-indigo-500/10 text-indigo-400' : 'border-indigo-200 bg-indigo-50 text-indigo-700')}>
                  50/50 Binary Market
                </span>
              </h2>
              <p className={cn('text-xs mt-0.5', subTextColor)}>
                Statistical equilibrium tracking, streaks, and momentum for Even (0,2,4,6,8) vs Odd (1,3,5,7,9)
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

      {/* ── Head-to-Head Even vs Odd Battle Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Even Card */}
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl border p-5 transition-all shadow-sm',
            isDark ? 'border-violet-500/30' : 'border-violet-200',
            stats.evenPercent >= 55 ? (isDark ? 'ring-1 ring-violet-500/50' : 'ring-2 ring-violet-400/40') : ''
          )}
          style={{
            background: isDark
              ? 'linear-gradient(135deg, rgba(76, 29, 149, 0.22) 0%, rgba(17, 23, 54, 0.95) 100%)'
              : 'linear-gradient(135deg, rgba(245, 243, 255, 0.95) 0%, rgba(238, 242, 255, 0.7) 100%)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white font-black text-xs shadow-sm shadow-violet-500/30">
                E
              </span>
              <div>
                <h3 className={cn('text-sm font-bold', headingColor)}>EVEN DIGITS</h3>
                <p className={cn('text-[11px]', subTextColor)}>0 · 2 · 4 · 6 · 8</p>
              </div>
            </div>
            <span
              className={cn(
                'text-[11px] font-bold px-2 py-0.5 rounded-md border',
                deviationEven > 0
                  ? (isDark ? 'bg-violet-500/20 text-violet-300 border-violet-500/30' : 'bg-violet-100 text-violet-800 border-violet-300')
                  : (isDark ? 'bg-white/5 text-gray-400 border-white/10' : 'bg-gray-100 text-gray-600 border-gray-200')
              )}
            >
              {deviationEven >= 0 ? `+${deviationEven.toFixed(1)}%` : `${deviationEven.toFixed(1)}%`} vs Exp
            </span>
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <span className="text-3xl sm:text-4xl font-black text-violet-500 tracking-tight">
              {stats.evenPercent.toFixed(1)}%
            </span>
            <span className={cn('text-xs font-semibold', subTextColor)}>
              {stats.evenCount} of {slice.length} ticks
            </span>
          </div>

          {/* Progress bar */}
          <div className={cn('h-3 w-full rounded-full overflow-hidden p-0.5', isDark ? 'bg-black/30' : 'bg-violet-200/50')}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-400 transition-all duration-500 shadow-sm"
              style={{ width: `${Math.min(stats.evenPercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Odd Card */}
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl border p-5 transition-all shadow-sm',
            isDark ? 'border-orange-500/30' : 'border-orange-200',
            stats.oddPercent >= 55 ? (isDark ? 'ring-1 ring-orange-500/50' : 'ring-2 ring-orange-400/40') : ''
          )}
          style={{
            background: isDark
              ? 'linear-gradient(135deg, rgba(124, 45, 18, 0.22) 0%, rgba(17, 23, 54, 0.95) 100%)'
              : 'linear-gradient(135deg, rgba(255, 247, 237, 0.95) 0%, rgba(254, 243, 199, 0.6) 100%)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500 text-white font-black text-xs shadow-sm shadow-orange-500/30">
                O
              </span>
              <div>
                <h3 className={cn('text-sm font-bold', headingColor)}>ODD DIGITS</h3>
                <p className={cn('text-[11px]', subTextColor)}>1 · 3 · 5 · 7 · 9</p>
              </div>
            </div>
            <span
              className={cn(
                'text-[11px] font-bold px-2 py-0.5 rounded-md border',
                deviationOdd > 0
                  ? (isDark ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-orange-100 text-orange-800 border-orange-300')
                  : (isDark ? 'bg-white/5 text-gray-400 border-white/10' : 'bg-gray-100 text-gray-600 border-gray-200')
              )}
            >
              {deviationOdd >= 0 ? `+${deviationOdd.toFixed(1)}%` : `${deviationOdd.toFixed(1)}%`} vs Exp
            </span>
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <span className="text-3xl sm:text-4xl font-black text-orange-500 tracking-tight">
              {stats.oddPercent.toFixed(1)}%
            </span>
            <span className={cn('text-xs font-semibold', subTextColor)}>
              {stats.oddCount} of {slice.length} ticks
            </span>
          </div>

          {/* Progress bar */}
          <div className={cn('h-3 w-full rounded-full overflow-hidden p-0.5', isDark ? 'bg-black/30' : 'bg-orange-200/50')}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500 shadow-sm"
              style={{ width: `${Math.min(stats.oddPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Key Metrics & Streaks Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={cn('rounded-2xl p-4 border shadow-sm glass-card-elevated', cardBorder)}>
          <div className="flex items-center gap-2 mb-1.5">
            <Flame className="h-4 w-4 text-violet-400" />
            <p className={cn('text-xs font-medium', subTextColor)}>Longest Even Streak</p>
          </div>
          <p className="text-2xl font-black text-violet-400">{streaks.longestEven} <span className="text-xs font-normal text-violet-400/80">ticks</span></p>
        </div>

        <div className={cn('rounded-2xl p-4 border shadow-sm glass-card-elevated', cardBorder)}>
          <div className="flex items-center gap-2 mb-1.5">
            <Zap className="h-4 w-4 text-orange-400" />
            <p className={cn('text-xs font-medium', subTextColor)}>Longest Odd Streak</p>
          </div>
          <p className="text-2xl font-black text-orange-400">{streaks.longestOdd} <span className="text-xs font-normal text-orange-400/80">ticks</span></p>
        </div>

        <div className={cn('rounded-2xl p-4 border shadow-sm glass-card-elevated', cardBorder)}>
          <div className="flex items-center gap-2 mb-1.5">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <p className={cn('text-xs font-medium', subTextColor)}>Current Streak</p>
          </div>
          <p className={cn('text-2xl font-black', currentStreak.type === 'EVEN' ? 'text-violet-400' : 'text-orange-400')}>
            {currentStreak.count}x {currentStreak.type}
          </p>
        </div>

        <div className={cn('rounded-2xl p-4 border shadow-sm glass-card-elevated', cardBorder)}>
          <div className="flex items-center gap-2 mb-1.5">
            <BarChart2 className="h-4 w-4 text-blue-400" />
            <p className={cn('text-xs font-medium', subTextColor)}>Current Digit</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-2xl font-black', currentDigit % 2 === 0 ? 'text-violet-400' : 'text-orange-400')}>
              {currentDigit}
            </span>
            <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full shadow-sm', currentDigit % 2 === 0 ? 'bg-violet-500/20 text-violet-400' : 'bg-orange-500/20 text-orange-400')}>
              {currentDigit % 2 === 0 ? 'EVEN' : 'ODD'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Digits Line Chart Section ── */}
      <div className={cn('rounded-2xl border overflow-hidden shadow-sm glass-panel', panelBorder)}>
        <div className="px-5 pt-4 pb-2 border-b flex items-center justify-between" style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
          <h3 className={cn('text-sm font-bold flex items-center gap-2', headingColor)}>
            <TrendingUp className="h-4 w-4 text-indigo-400" />
            Digit Sequence Line Trend
          </h3>
          <span className={cn('text-xs', mutedColor)}>Interactive highlight & count selector</span>
        </div>
        <div className="px-5 py-4">
          <DigitsLineChart digits={digits} isDark={isDark} defaultCount={20} counts={[10, 20, 50, 60]} />
        </div>
      </div>

      {/* ── Recent Digit Sequence Stream ── */}
      <div className={cn('rounded-2xl p-5 border shadow-sm glass-panel', panelBorder)}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={cn('text-sm font-bold', headingColor)}>Recent Digit Sequence</h3>
            <p className={cn('text-xs', subTextColor)}>Even numbers in violet, odd numbers in orange (latest on right)</p>
          </div>
          <div className="inline-flex rounded-xl p-1 neu-inset">
            {([15, 30, 50] as const).map((cnt) => (
              <button
                key={cnt}
                onClick={() => setSequenceView(cnt)}
                className={cn('px-2.5 py-0.5 text-xs font-bold rounded-lg transition-all', sequenceView === cnt ? pillActive : pillInactive)}
              >
                {cnt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {recentDigits.map((d, i) => {
            const isEven = d % 2 === 0;
            const isLatest = i === recentDigits.length - 1;
            return (
              <div
                key={i}
                className={cn(
                  'flex flex-col items-center justify-center h-12 w-12 rounded-xl text-base font-black transition-all shadow-sm neu-tile',
                  isEven
                    ? (isDark ? 'bg-violet-950/70 border border-violet-500/40 text-violet-300' : 'bg-violet-100/90 border border-violet-300 text-violet-800')
                    : (isDark ? 'bg-orange-950/70 border border-orange-500/40 text-orange-300' : 'bg-orange-100/90 border border-orange-300 text-orange-800'),
                  isLatest && 'scale-110 ring-2 ring-blue-500 ring-offset-2',
                  isLatest && (isDark ? 'ring-offset-[#0a0e27]' : 'ring-offset-white')
                )}
              >
                <span>{d}</span>
                <span className="text-[9px] font-bold opacity-80 uppercase leading-none">{isEven ? 'E' : 'O'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Trading Signal Assessment Card ── */}
      <div
        className={cn('rounded-2xl p-5 border shadow-sm glass-panel', isDark ? 'border-white/10' : 'border-blue-200/50')}
        style={{
          background: bias === 'EVEN_BIASED'
            ? (isDark ? '#1e1138' : '#f5f3ff')
            : bias === 'ODD_BIASED'
              ? (isDark ? '#2e1409' : '#fff7ed')
              : (isDark ? '#0e172a' : '#f0fdf4'),
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl text-white font-bold',
                bias === 'EVEN_BIASED' ? 'bg-violet-600' : bias === 'ODD_BIASED' ? 'bg-orange-500' : 'bg-blue-600'
              )}
            >
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-bold', headingColor)}>Market Bias Assessment</span>
                <span
                  className={cn(
                    'text-[10px] font-black uppercase px-2 py-0.5 rounded-full',
                    bias === 'EVEN_BIASED' ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' :
                    bias === 'ODD_BIASED' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' :
                    'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  )}
                >
                  {bias === 'EVEN_BIASED' ? 'Even Favored' : bias === 'ODD_BIASED' ? 'Odd Favored' : 'Balanced Equilibrium'}
                </span>
              </div>
              <p className={cn('text-xs mt-0.5', subTextColor)}>
                {bias === 'EVEN_BIASED'
                  ? `Even digits are outperforming by +${deviationEven.toFixed(1)}% over the last ${lookback} ticks. Watch for trend continuation or mean-reversion.`
                  : bias === 'ODD_BIASED'
                  ? `Odd digits are outperforming by +${deviationOdd.toFixed(1)}% over the last ${lookback} ticks. Watch for trend continuation or mean-reversion.`
                  : `Even and Odd are tightly balanced near the 50% theoretical expectation (${stats.evenPercent.toFixed(1)}% vs ${stats.oddPercent.toFixed(1)}%). Optimal for mean-reversion.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
