import { useMemo, useState } from 'react';
import { ArrowRightLeft, Check, X, ShieldCheck, BarChart2, TrendingUp, Zap, Sparkles } from 'lucide-react';
import { computeDiffersStats } from '@/lib/analysis';
import { DigitsLineChart } from '@/components/DigitsLineChart';
import { cn } from '@/lib/utils';

type Props = {
  digits: number[];
  currentDigit: number;
  isDark?: boolean;
};

export function DiffersTab({ digits, currentDigit, isDark = true }: Props) {
  const [lookback, setLookback] = useState<25 | 50 | 100 | 200>(50);
  const [filterFailuresOnly, setFilterFailuresOnly] = useState(false);

  const slice = useMemo(() => digits.slice(-lookback), [digits, lookback]);
  const d = useMemo(() => computeDiffersStats(slice), [slice]);

  const lastDigit = slice.length > 0 ? slice[slice.length - 1] : currentDigit;
  const lastDigitDiffers = d.digitNextDiffers[lastDigit];

  // Identify safest differ targets (digits with 100% differ rate and fewest repeats)
  const safestDigits = useMemo(() => {
    const list: { digit: number; percent: number; total: number }[] = [];
    for (let i = 0; i <= 9; i++) {
      list.push({ digit: i, percent: d.digitNextDiffers[i].percent, total: d.digitNextDiffers[i].total });
    }
    // Sort by highest percent, then highest sample count
    list.sort((a, b) => b.percent - a.percent || b.total - a.total);
    return list;
  }, [d]);

  const bestTarget = safestDigits[0] || { digit: 0, percent: 100, total: 0 };

  // Theme styling tokens
  const panelBg = isDark ? '#0a0e27' : '#ffffff';
  const panelBorder = isDark ? 'border-white/10' : 'border-blue-200/50';
  const cardBg = isDark ? '#111736' : '#f8faff';
  const cardBorder = isDark ? 'border-[#1e2a5e]' : 'border-blue-200/40';
  const headingColor = isDark ? 'text-white' : 'text-[#1a2a4a]';
  const subTextColor = isDark ? 'text-[#9ca3af]' : 'text-[#7a8aaa]';
  const mutedColor = isDark ? 'text-[#6b7280]' : 'text-[#9aaaba]';
  const pillActive = 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-500/25';
  const pillInactive = isDark
    ? 'bg-white/5 text-[#9ca3af] hover:bg-white/10 hover:text-white border border-white/5'
    : 'bg-blue-50/70 text-[#5a6a8a] hover:bg-blue-100 hover:text-[#0284c7] border border-blue-200/40';

  const filteredTransitions = filterFailuresOnly
    ? d.recentTransitions.filter(t => !t.differs)
    : d.recentTransitions;

  return (
    <div className="space-y-4">
      {/* ── Header Controls ── */}
      <div className={cn('rounded-2xl p-5 border shadow-sm', panelBorder)} style={{ background: panelBg }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20">
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <div>
              <h2 className={cn('text-lg font-bold flex items-center gap-2', headingColor)}>
                Differs Analysis
                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', isDark ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-400' : 'border-cyan-200 bg-cyan-50 text-cyan-700')}>
                  Expected 90.0% Win Rate
                </span>
              </h2>
              <p className={cn('text-xs mt-0.5', subTextColor)}>
                High-probability differ tracking, transition safety scores, and non-repeat predictability
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className={cn('text-xs font-bold uppercase tracking-wider', mutedColor)}>Lookback:</span>
            <div className="inline-flex rounded-xl p-1 border" style={{ borderColor: isDark ? 'rgba(255,255,254,0.08)' : 'rgba(219,234,254,0.8)', background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(240,249,255,0.6)' }}>
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

      {/* ── Key Metrics Overview ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Differ Rate Card */}
        <div className={cn('rounded-xl p-4 border shadow-sm flex flex-col justify-between', cardBorder)} style={{ background: cardBg }}>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className={cn('text-xs font-medium', subTextColor)}>Observed Differ Rate</p>
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', d.differPercent >= 90 ? (isDark ? 'bg-cyan-500/20 text-cyan-300' : 'bg-cyan-100 text-cyan-800') : (isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-800'))}>
                {d.differPercent >= 90 ? `+${(d.differPercent - 90).toFixed(1)}%` : `${(d.differPercent - 90).toFixed(1)}%`} vs 90%
              </span>
            </div>
            <p className="text-3xl font-black text-cyan-400">
              {d.differPercent.toFixed(1)}%
            </p>
          </div>
          <div className="mt-3">
            <div className={cn('h-2 w-full rounded-full overflow-hidden p-0.5', isDark ? 'bg-black/40' : 'bg-blue-100')}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                style={{ width: `${Math.min(d.differPercent, 100)}%` }}
              />
            </div>
            <p className={cn('text-[10px] mt-1', mutedColor)}>Baseline: 90.0% standard differ probability</p>
          </div>
        </div>

        {/* Total Differs Card */}
        <div className={cn('rounded-xl p-4 border shadow-sm flex flex-col justify-between', cardBorder)} style={{ background: cardBg }}>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              <p className={cn('text-xs font-medium', subTextColor)}>Total Differs</p>
            </div>
            <p className="text-3xl font-black text-cyan-400">
              {d.differCount} <span className={cn('text-sm font-semibold', mutedColor)}>/ {d.totalPairs} pairs</span>
            </p>
          </div>
          <p className={cn('text-xs mt-3', subTextColor)}>
            Only {d.totalPairs - d.differCount} same-digit repeats recorded
          </p>
        </div>

        {/* Safest Differ Target */}
        <div className={cn('rounded-xl p-4 border shadow-sm flex flex-col justify-between', cardBorder)} style={{ background: cardBg }}>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <p className={cn('text-xs font-medium', subTextColor)}>Optimal Differ Target</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-xl shadow-md shadow-emerald-500/30">
                {bestTarget.digit}
              </span>
              <div>
                <p className="text-sm font-black text-emerald-400">{bestTarget.percent.toFixed(0)}% Differ Rate</p>
                <p className={cn('text-[11px]', mutedColor)}>{bestTarget.total} sample occurrences</p>
              </div>
            </div>
          </div>
          <p className={cn('text-xs mt-3', subTextColor)}>Safest digit to bet AGAINST repeating</p>
        </div>

        {/* Last Digit Continuation */}
        <div className={cn('rounded-xl p-4 border shadow-sm flex flex-col justify-between', cardBorder)} style={{ background: cardBg }}>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              <p className={cn('text-xs font-medium', subTextColor)}>After Digit {lastDigit}</p>
            </div>
            <p className="text-3xl font-black text-blue-400">
              {lastDigitDiffers?.percent.toFixed(1) ?? '100.0'}%
            </p>
          </div>
          <p className={cn('text-xs mt-3', subTextColor)}>
            {lastDigitDiffers?.differs ?? 0} of {lastDigitDiffers?.total ?? 0} times the next digit differed
          </p>
        </div>
      </div>

      {/* ── Per-Digit "Next Differs" Probability Matrix ── */}
      <div className={cn('rounded-2xl p-5 border shadow-sm', panelBorder)} style={{ background: panelBg }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={cn('text-sm font-bold', headingColor)}>Per-Digit "Next Differs" Probability Matrix</h3>
            <p className={cn('text-xs', subTextColor)}>When each digit appears, what percentage of the time does the subsequent digit differ?</p>
          </div>
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded border', isDark ? 'border-white/10 text-gray-400' : 'border-gray-200 text-gray-600')}>
            Higher % = Safer Differ Bet
          </span>
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2.5">
          {Array.from({ length: 10 }, (_, digit) => {
            const info = d.digitNextDiffers[digit];
            const isCurrent = digit === lastDigit;
            const is100 = info.percent === 100 && info.total > 0;
            return (
              <div
                key={digit}
                className={cn(
                  'rounded-xl p-2.5 text-center transition-all border shadow-sm',
                  isCurrent
                    ? (isDark ? 'bg-cyan-600/20 border-cyan-500 text-white ring-2 ring-cyan-500/40' : 'bg-cyan-50 border-cyan-400 text-cyan-900 ring-2 ring-cyan-300')
                    : cardBorder
                )}
                style={{ background: isCurrent ? undefined : cardBg }}
              >
                <div
                  className={cn(
                    'mx-auto h-9 w-9 flex items-center justify-center rounded-lg font-black text-base shadow-sm mb-1',
                    isCurrent
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white'
                      : is100
                      ? 'bg-emerald-500 text-white'
                      : (isDark ? 'bg-white/5 text-white' : 'bg-gray-100 text-[#1a2a4a]')
                  )}
                >
                  {digit}
                </div>
                <p className={cn('text-xs font-bold leading-tight', is100 ? 'text-emerald-400' : isCurrent ? 'text-cyan-400' : headingColor)}>
                  {info.percent.toFixed(0)}%
                </p>
                <p className={cn('text-[10px] leading-tight', mutedColor)}>
                  {info.differs}/{info.total}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Digits Line Chart Section ── */}
      <div className={cn('rounded-2xl border overflow-hidden shadow-sm', panelBorder)} style={{ background: panelBg }}>
        <div className="px-5 pt-4 pb-2 border-b flex items-center justify-between" style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
          <h3 className={cn('text-sm font-bold flex items-center gap-2', headingColor)}>
            <BarChart2 className="h-4 w-4 text-cyan-400" />
            Digit Sequence Line Trend
          </h3>
          <span className={cn('text-xs', mutedColor)}>Vertical jumps denote differs; flat steps denote matches</span>
        </div>
        <div className="px-5 py-4">
          <DigitsLineChart digits={digits} isDark={isDark} defaultCount={20} counts={[10, 20, 50, 60]} />
        </div>
      </div>

      {/* ── Recent Transitions Stream ── */}
      <div className={cn('rounded-2xl p-5 border shadow-sm', panelBorder)} style={{ background: panelBg }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className={cn('text-sm font-bold', headingColor)}>Recent Digit Transitions</h3>
            <p className={cn('text-xs', subTextColor)}>Tick-to-tick movements (green = differed, red = repeated)</p>
          </div>
          <button
            onClick={() => setFilterFailuresOnly(!filterFailuresOnly)}
            className={cn('self-start sm:self-auto rounded-lg px-3 py-1 text-xs font-bold transition-all border', filterFailuresOnly ? pillActive : pillInactive)}
          >
            {filterFailuresOnly ? 'Showing Same Repeats Only' : 'Show Same Repeats Only'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredTransitions.length === 0 ? (
            <p className={cn('text-sm py-4 col-span-full text-center', mutedColor)}>
              {filterFailuresOnly ? 'No same-digit repeats found in this sample!' : 'Waiting for tick data…'}
            </p>
          ) : (
            filteredTransitions.map((t, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between rounded-xl p-3 border transition-all shadow-sm',
                  t.differs
                    ? (isDark ? 'border-white/5 bg-white/2' : 'border-gray-100 bg-gray-50/60')
                    : (isDark ? 'border-red-500/40 bg-red-950/20' : 'border-red-300 bg-red-50/70')
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg font-black text-sm shadow-sm', isDark ? 'bg-white/10 text-white' : 'bg-white border text-gray-800')}>
                    {t.from}
                  </span>
                  <span className={cn('text-xs font-bold', mutedColor)}>→</span>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg font-black text-sm shadow-sm', !t.differs ? 'bg-red-500 text-white' : (isDark ? 'bg-white/10 text-white' : 'bg-white border text-gray-800'))}>
                    {t.to}
                  </span>
                </div>

                {t.differs ? (
                  <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', isDark ? 'text-cyan-400' : 'text-cyan-700')}>
                    <Check className="h-3.5 w-3.5" /> Differs
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-black bg-red-500 text-white shadow-sm shadow-red-500/30">
                    <X className="h-3.5 w-3.5" /> SAME
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Differs Strategy Advisor ── */}
      <div
        className={cn('rounded-2xl p-5 border shadow-sm', isDark ? 'border-white/10' : 'border-blue-200/50')}
        style={{
          background: d.differPercent >= 92
            ? (isDark ? '#062828' : '#f0fdfa')
            : (isDark ? '#0e172a' : '#f8fafc'),
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600 text-white font-bold">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-bold', headingColor)}>Differs Probability Insight</span>
              <span className={cn('text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30')}>
                Optimal Differ Conditions
              </span>
            </div>
            <p className={cn('text-xs mt-0.5', subTextColor)}>
              Over the last {lookback} ticks, the differ win rate is {d.differPercent.toFixed(1)}%. Digit {bestTarget.digit} has recorded a {bestTarget.percent.toFixed(0)}% differ continuation rate, making it a statistically favorable barrier for Differs contracts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
