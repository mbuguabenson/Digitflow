import { useMemo, useState } from 'react';
import { computeDigitStats, computeEvenOddStats, computeOverUnderStats } from '@/lib/analysis';
import { cn } from '@/lib/utils';

type Props = { digits: number[]; currentDigit: number; isDark: boolean };

// Per-digit ring/bar colors
const DIGIT_COLORS: Record<number, { ring: string; bar: string; tile: string }> = {
  0: { ring: '#f59e0b', bar: '#f59e0b', tile: 'from-[#00bcd4] to-[#006064]' },
  1: { ring: '#ef4444', bar: '#ef4444', tile: 'from-[#e91e63] to-[#880e4f]' },
  2: { ring: '#3b82f6', bar: '#3b82f6', tile: 'from-[#00acc1] to-[#004d56]' },
  3: { ring: '#6366f1', bar: '#6366f1', tile: 'from-[#5c6bc0] to-[#1a237e]' },
  4: { ring: '#06b6d4', bar: '#06b6d4', tile: 'from-[#26a69a] to-[#004d40]' },
  5: { ring: '#f97316', bar: '#f97316', tile: 'from-[#29b6f6] to-[#0277bd]' },
  6: { ring: '#3b82f6', bar: '#3b82f6', tile: 'from-[#ec407a] to-[#880e4f]' },
  7: { ring: '#14b8a6', bar: '#14b8a6', tile: 'from-[#ab47bc] to-[#4a148c]' },
  8: { ring: '#22c55e', bar: '#22c55e', tile: 'from-[#ffa726] to-[#e65100]' },
  9: { ring: '#22c55e', bar: '#22c55e', tile: 'from-[#42a5f5] to-[#0d47a1]' },
};

// ── Ring Gauge ──────────────────────────────────────────────────────────────
function DigitRing({
  digit,
  percent,
  isNow,
  isSelected,
  isMost,
  isSecond,
  isLeast,
  onSelect,
  isDark,
}: {
  digit: number;
  percent: number;
  count?: number;
  isNow: boolean;
  isSelected?: boolean;
  isMost?: boolean;
  isSecond?: boolean;
  isLeast?: boolean;
  onSelect?: () => void;
  isDark: boolean;
}) {
  const r = 30;
  const cx = 40;
  const cy = 40;
  const circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;

  // Colors:
  // - Current digit (isNow): Orange (#f97316)
  // - Most appearing (1st): Green (#22c55e)
  // - 2nd most appearing: Yellow (#eab308)
  // - Least appearing: Red (#ef4444)
  // - All other digits: Consistent Grey (#475569 dark / #94a3b8 light)
  let ringColor = isDark ? '#475569' : '#94a3b8';
  let barColor = isDark ? '#475569' : '#94a3b8';

  if (isNow) {
    ringColor = '#f97316';
    barColor = '#f97316';
  } else if (isMost) {
    ringColor = '#22c55e';
    barColor = '#22c55e';
  } else if (isSecond) {
    ringColor = '#eab308';
    barColor = '#eab308';
  } else if (isLeast) {
    ringColor = '#ef4444';
    barColor = '#ef4444';
  }

  const trackStroke = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  let digitTextColor = isDark ? '#e2e8f0' : '#1e293b';
  let pctTextColor = isDark ? '#94a3b8' : '#64748b';

  if (isSelected) {
    digitTextColor = '#38bdf8';
    pctTextColor = '#38bdf8';
  } else if (isNow) {
    digitTextColor = '#f97316';
    pctTextColor = '#f97316';
  } else if (isMost) {
    digitTextColor = '#22c55e';
    pctTextColor = isDark ? '#4ade80' : '#16a34a';
  } else if (isSecond) {
    digitTextColor = '#eab308';
    pctTextColor = isDark ? '#fde047' : '#ca8a04';
  } else if (isLeast) {
    digitTextColor = '#ef4444';
    pctTextColor = isDark ? '#f87171' : '#dc2626';
  }

  const barTrack = isDark ? 'bg-white/10' : 'bg-black/5';

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center gap-1 sm:gap-1.5 select-none cursor-pointer transition-transform duration-200 py-1 px-0.5',
        isSelected ? 'scale-105' : 'hover:scale-105 opacity-90 hover:opacity-100'
      )}
      title={`Digit ${digit} (${percent.toFixed(1)}%)${isNow ? ' • Current Digit' : isMost ? ' • Most Appearing' : isSecond ? ' • 2nd Most' : isLeast ? ' • Least Appearing' : ''}`}
    >
      <div className="h-4 sm:h-5 flex items-center">
        {isSelected ? (
          <span className="rounded-full bg-blue-500 px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] font-black tracking-widest text-white uppercase shadow-sm">
            SELECTED
          </span>
        ) : isNow ? (
          <span className="rounded-full bg-[#f97316] px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] font-black tracking-widest text-white uppercase shadow-sm">
            NOW
          </span>
        ) : isMost ? (
          <span className="rounded-full bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 sm:px-2 py-0.5 text-[7px] sm:text-[8px] font-black tracking-wider uppercase">
            1ST
          </span>
        ) : isSecond ? (
          <span className="rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 sm:px-2 py-0.5 text-[7px] sm:text-[8px] font-black tracking-wider uppercase">
            2ND
          </span>
        ) : isLeast ? (
          <span className="rounded-full bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 sm:px-2 py-0.5 text-[7px] sm:text-[8px] font-black tracking-wider uppercase">
            LOW
          </span>
        ) : (
          <span className="invisible text-[8px] sm:text-[9px] px-1.5 py-0.5">NOW</span>
        )}
      </div>
      <div className="relative">
        <svg viewBox="0 0 80 80" className="w-[66px] h-[66px] xs:w-[72px] xs:h-[72px] sm:w-[82px] sm:h-[82px] md:w-[88px] md:h-[88px] -rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackStroke} strokeWidth="6" />
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={isSelected ? '#38bdf8' : ringColor}
            strokeWidth={isSelected || isNow ? 7 : 6}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl xs:text-2xl sm:text-3xl font-black leading-none tracking-tight" style={{ color: digitTextColor }}>
            {digit}
          </span>
          <span className="text-[11px] xs:text-xs sm:text-[13px] font-extrabold leading-tight mt-0.5" style={{ color: pctTextColor }}>
            {percent.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className={cn('h-1 w-8 sm:w-11 rounded-full overflow-hidden', barTrack)}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(percent * 7, 100)}%`, background: isSelected ? '#38bdf8' : barColor }}
        />
      </div>
    </div>
  );
}


// ── Line Chart ───────────────────────────────────────────────────────────────
function LineChart({
  digits,
  count = 20,
  selectedDigit = null,
  onSelectDigit,
  isDark,
}: {
  digits: number[];
  count?: number;
  selectedDigit?: number | null;
  onSelectDigit?: (d: number) => void;
  isDark: boolean;
}) {
  const W = 540;
  const H = 220;
  const PAD = { top: 30, right: 24, bottom: 16, left: 28 };
  const show = digits.slice(-count);
  if (show.length < 2) return (
    <div className="flex h-full items-center justify-center text-sm text-[#6b7280]">
      Waiting for data…
    </div>
  );

  const n = show.length;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const xOf = (i: number) => PAD.left + (i / (n - 1)) * innerW;
  const yOf = (v: number) => PAD.top + innerH - (v / 9) * innerH;
  const pts = show.map((d, i) => ({ x: xOf(i), y: yOf(d), v: d }));

  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i - 1].x + pts[i].x) / 2;
    d += ` C ${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
  }

  const lineColor = isDark ? '#6366f1' : '#8B8FEA';
  const dotColor = isDark ? '#818cf8' : '#8B8FEA';
  const labelColor = isDark ? '#2dd4bf' : '#14b8a6';
  const latestColor = '#f97316';
  const selectedAccent = '#38bdf8';

  const dotR = count > 30 ? 4.5 : 5.5;
  // Maintain readable font size even when 50 digits are selected
  const fontSize = 15;
  const textOffset = 14;
  const strokeWidth = 2.5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ borderRadius: 12 }}>
      {/* Background digit guide lines */}
      {[0, 3, 6, 9].map((lvl) => (
        <line
          key={lvl}
          x1={PAD.left}
          y1={yOf(lvl)}
          x2={W - PAD.right}
          y2={yOf(lvl)}
          stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}
          strokeDasharray="3 3"
        />
      ))}

      <path
        d={d}
        fill="none"
        stroke={lineColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={selectedDigit !== null ? 0.35 : 1}
      />

      {pts.map((p, i) => {
        const isLatest = i === pts.length - 1;
        const isSelected = selectedDigit !== null && p.v === selectedDigit;
        const isDimmed = selectedDigit !== null && p.v !== selectedDigit;

        let curDot = dotColor;
        let curLabel = labelColor;
        let curR = dotR;

        if (isSelected) {
          curDot = selectedAccent;
          curLabel = selectedAccent;
          curR = dotR + 2.5;
        } else if (isLatest && selectedDigit === null) {
          curDot = latestColor;
          curLabel = latestColor;
          curR = dotR + 1.5;
        }

        return (
          <g
            key={i}
            className="cursor-pointer transition-opacity duration-200"
            onClick={() => onSelectDigit?.(p.v)}
            opacity={isDimmed ? 0.2 : 1}
          >
            {isSelected && (
              <circle
                cx={p.x}
                cy={p.y}
                r={curR + 4}
                fill="none"
                stroke={selectedAccent}
                strokeWidth="2"
                opacity="0.6"
              />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={curR}
              fill={curDot}
            />
            <text
              x={p.x}
              y={p.y - textOffset}
              textAnchor="middle"
              fill={curLabel}
              fontSize={isSelected ? fontSize + 1 : fontSize}
              fontWeight={isSelected || isLatest ? '900' : '700'}
            >
              {p.v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Digit Tile ──────────────────────────────────────────────────────────────
function DigitTile({
  digit,
  isLatest,
  isSelected,
  isDimmed,
  onClick,
}: {
  digit: number;
  isLatest: boolean;
  isSelected?: boolean;
  isDimmed?: boolean;
  onClick?: () => void;
}) {
  const { tile } = DIGIT_COLORS[digit];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        `bg-gradient-to-br ${tile}`,
        'flex h-11 w-11 items-center justify-center rounded-xl text-base font-black text-white shadow-md transition-all duration-200 cursor-pointer',
        isSelected && 'scale-110 ring-4 ring-cyan-400 shadow-xl shadow-cyan-500/40 z-10 brightness-110',
        !isSelected && isLatest && 'scale-105 ring-2 ring-white/70',
        isDimmed && 'opacity-25 grayscale-[35%] scale-95'
      )}
      title={`Click to filter by Digit ${digit}`}
    >
      {digit}
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export function SmartAnalysisTab({ digits, currentDigit, isDark }: Props) {
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null);
  const [lineCount, setLineCount] = useState<10 | 20 | 30 | 50>(20);
  const [tickView, setTickView] = useState<10 | 20 | 50>(50);
  const stats = useMemo(() => computeDigitStats(digits), [digits]);
  const { mostAppearing, secondMostAppearing, leastAppearing } = useMemo(() => {
    if (digits.length === 0) {
      return { mostAppearing: -1, secondMostAppearing: -1, leastAppearing: -1 };
    }
    const ranked = Array.from({ length: 10 }, (_, d) => ({
      digit: d,
      count: stats.counts[d],
    })).sort((a, b) => b.count - a.count);

    if (ranked[0].count === ranked[ranked.length - 1].count) {
      return { mostAppearing: -1, secondMostAppearing: -1, leastAppearing: -1 };
    }

    const most = ranked[0].digit;
    const second = ranked[1].count > ranked[ranked.length - 1].count ? ranked[1].digit : -1;
    const least = ranked[ranked.length - 1].digit;

    return {
      mostAppearing: most,
      secondMostAppearing: second,
      leastAppearing: least,
    };
  }, [digits.length, stats.counts]);

  const gridDigits = digits.slice(-tickView);
  const lineChartDigits = digits.slice(-lineCount);

  const toggleSelectDigit = (d: number) => {
    setSelectedDigit((prev) => (prev === d ? null : d));
  };

  const lineChartMatchCount = useMemo(
    () => (selectedDigit !== null ? lineChartDigits.filter((d) => d === selectedDigit).length : 0),
    [lineChartDigits, selectedDigit]
  );

  const gridMatchCount = useMemo(
    () => (selectedDigit !== null ? gridDigits.filter((d) => d === selectedDigit).length : 0),
    [gridDigits, selectedDigit]
  );

  const panelBg = isDark ? '#0a0e27' : '#ffffff';
  const panelBorder = isDark ? 'border-white/10' : 'border-blue-200/40';
  const headingColor = isDark ? 'text-white' : 'text-[#1a2a4a]';
  const subTextColor = isDark ? 'text-[#6b7280]' : 'text-[#7a8aaa]';
  const dividerColor = isDark ? 'bg-white/10' : 'bg-blue-200/40';
  const toggleBorder = isDark ? 'border-white/10' : 'border-blue-200/40';
  const toggleInactive = isDark ? 'bg-white/5 text-[#6b7280] hover:bg-white/10 hover:text-white' : 'bg-blue-50 text-[#7a8aaa] hover:bg-blue-100 hover:text-[#3b7ef8]';

  return (
    <div className={cn('rounded-2xl overflow-hidden border', panelBorder)} style={{ background: panelBg }}>
      {/* ── Digits Distribution ── */}
      <div className="px-3.5 sm:px-6 pt-5 sm:pt-6 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 sm:mb-5">
          <div className="flex items-center gap-2">
            <h2 className={cn('text-lg sm:text-xl font-black', headingColor)}>Digits Distribution</h2>
            {selectedDigit !== null && (
              <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
                Filtered: Digit {selectedDigit}
                <button
                  onClick={() => setSelectedDigit(null)}
                  className="rounded-full hover:bg-white/20 p-0.5 transition-colors"
                  title="Clear filter"
                >
                  ✕
                </button>
              </span>
            )}
          </div>
          <span className={cn('text-[11px] font-medium hidden sm:inline', subTextColor)}>
            Click any digit to highlight occurrences across charts
          </span>
        </div>
        <div className="grid grid-cols-5 gap-y-3.5 gap-x-1 md:flex md:items-start md:justify-between md:gap-2 pb-2">
          {Array.from({ length: 10 }, (_, d) => (
            <DigitRing
              key={d}
              digit={d}
              percent={stats.percents[d]}
              isNow={d === currentDigit}
              isSelected={selectedDigit === d}
              isMost={d === mostAppearing}
              isSecond={d === secondMostAppearing}
              isLeast={d === leastAppearing}
              onSelect={() => toggleSelectDigit(d)}
              isDark={isDark}
            />
          ))}
        </div>
      </div>

      <div className={cn('h-px mx-6', dividerColor)} />

      {/* ── Bottom two panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <div className={cn('p-6 border-r', panelBorder)}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <h3 className={cn('text-base font-bold', headingColor)}>Last {lineCount} Digits Line Chart</h3>
              {selectedDigit !== null && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Digit {selectedDigit} ({lineChartMatchCount}x)
                </span>
              )}
            </div>
            <div className={cn('flex rounded-lg overflow-hidden border', toggleBorder)}>
              {([10, 20, 30, 50] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setLineCount(n)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-bold transition-colors',
                    lineCount === n ? 'bg-[#3b82f6] text-white' : toggleInactive
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[280px] sm:h-[220px]">
            <LineChart
              digits={digits}
              count={lineCount}
              selectedDigit={selectedDigit}
              onSelectDigit={toggleSelectDigit}
              isDark={isDark}
            />
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className={cn('text-base font-bold', headingColor)}>Last {tickView} Digits Chart</h3>
              {selectedDigit !== null && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Digit {selectedDigit} ({gridMatchCount}x)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className={cn('text-[11px] font-bold tracking-widest uppercase', subTextColor)}>
              Recent Digit Sequence
            </span>
            <div className={cn('flex rounded-lg overflow-hidden border', toggleBorder)}>
              {([10, 20, 50] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setTickView(n)}
                  className={cn(
                    'px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-bold transition-colors leading-tight',
                    tickView === n ? 'bg-[#3b82f6] text-white' : toggleInactive
                  )}
                >
                  <span className="sm:hidden">{n}T</span>
                  <span className="hidden sm:inline">{n} TICKS</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {gridDigits.length === 0 ? (
              <p className={cn('text-sm', subTextColor)}>Waiting for ticks…</p>
            ) : (
              gridDigits.map((d, i) => (
                <DigitTile
                  key={i}
                  digit={d}
                  isLatest={i === gridDigits.length - 1}
                  isSelected={selectedDigit !== null && d === selectedDigit}
                  isDimmed={selectedDigit !== null && d !== selectedDigit}
                  onClick={() => toggleSelectDigit(d)}
                />
              ))
            )}
          </div>
        </div>
      </div>


      <div className={cn('h-px mx-6', dividerColor)} />

      {/* ── Statistical Data ── */}
      <StatisticalData digits={digits} isDark={isDark} />
    </div>
  );
}

// ── Statistical Data Section ─────────────────────────────────────────────────
function StatisticalData({ digits, isDark }: { digits: number[]; isDark: boolean }) {
  const headingColor = isDark ? 'text-white' : 'text-[#1a2a4a]';
  const subTextColor = isDark ? 'text-[#6b7280]' : 'text-[#7a8aaa]';
  const cardBg = isDark ? 'bg-white/[0.03]' : 'bg-blue-50/30';
  const cardBorder = isDark ? 'border-white/10' : 'border-blue-200/40';

  const eo = useMemo(() => computeEvenOddStats(digits), [digits]);
  const ou = useMemo(() => computeOverUnderStats(digits, 4), [digits]);
  const stats = useMemo(() => computeDigitStats(digits), [digits]);

  // ── Pattern detection: last 20 digits ──────────────────────────────────────
  const last20 = digits.slice(-20);

  // Detect alternating / streak patterns in E/O sequence
  const eoSequence = last20.map((d) => (d % 2 === 0 ? 'E' : 'O'));
  const ouSequence = last20.map((d) => (d <= 4 ? 'U' : 'O'));

  // Pattern: 2+ consecutive same then opposite (signal)
  function detectEOPattern(seq: string[]): string {
    if (seq.length < 3) return '';
    const last = seq[seq.length - 1];
    let streak = 1;
    for (let i = seq.length - 2; i >= 0; i--) {
      if (seq[i] === last) streak++;
      else break;
    }
    const dominant = eo.evenPercent >= 56 ? 'E' : eo.oddPercent >= 56 ? 'O' : null;
    if (dominant && streak >= 2 && last !== dominant) {
      return `${streak}+ ${last === 'E' ? 'Even' : 'Odd'} streak detected → Possible ${dominant === 'E' ? 'Even' : 'Odd'} entry`;
    }
    if (streak >= 3) {
      return `${streak} consecutive ${last === 'E' ? 'Even' : 'Odd'} — reversal watch`;
    }
    return '';
  }

  function detectOUPattern(seq: string[]): string {
    if (seq.length < 3) return '';
    const last = seq[seq.length - 1];
    let streak = 1;
    for (let i = seq.length - 2; i >= 0; i--) {
      if (seq[i] === last) streak++;
      else break;
    }
    const dominant = ou.underPercent >= 56 ? 'U' : ou.overPercent >= 56 ? 'O' : null;
    if (dominant && streak >= 2 && last !== dominant) {
      return `${streak}+ ${last === 'U' ? 'Under' : 'Over'} streak → Possible ${dominant === 'U' ? 'Under' : 'Over'} entry`;
    }
    if (streak >= 3) {
      return `${streak} consecutive ${last === 'U' ? 'Under' : 'Over'} — reversal watch`;
    }
    return '';
  }

  const eoPatternHint = useMemo(() => detectEOPattern(eoSequence), [eoSequence.join(''), eo.evenPercent]);
  const ouPatternHint = useMemo(() => detectOUPattern(ouSequence), [ouSequence.join(''), ou.underPercent]);

  // Highest digit in Under group (0-4) and Over group (5-9)
  const highestUnder = useMemo(() => {
    let best = -1, bestCount = -1;
    for (let d = 0; d <= 4; d++) {
      if (stats.counts[d] > bestCount) { bestCount = stats.counts[d]; best = d; }
    }
    return best;
  }, [stats.counts]);

  const highestOver = useMemo(() => {
    let best = -1, bestCount = -1;
    for (let d = 5; d <= 9; d++) {
      if (stats.counts[d] > bestCount) { bestCount = stats.counts[d]; best = d; }
    }
    return best;
  }, [stats.counts]);

  // Differs: most constant digit
  const differsResult = useMemo(() => {
    const last60 = digits.slice(-60);
    const last60Stats = computeDigitStats(last60);
    const sorted = [...Array.from({ length: 10 }, (_, d) => ({ d, pct: stats.percents[d], cnt: stats.counts[d] }))]
      .sort((a, b) => b.pct - a.pct);
    const excluded = new Set([sorted[0].d, sorted[1].d, sorted[sorted.length - 1].d]);
    let candidate = -1;
    let candidatePct = 101;
    for (let d = 0; d < 10; d++) {
      if (excluded.has(d)) continue;
      const pct60 = last60Stats.percents[d];
      if (pct60 < 10) {
        if (pct60 < candidatePct) { candidatePct = pct60; candidate = d; }
      }
    }
    if (candidate === -1) {
      for (let d = 0; d < 10; d++) {
        if (excluded.has(d)) continue;
        const pct60 = last60Stats.percents[d];
        if (pct60 < candidatePct) { candidatePct = pct60; candidate = d; }
      }
    }
    return { digit: candidate, pct: candidatePct === 101 ? 0 : candidatePct };
  }, [digits, stats]);

  // Matches: highest appearing digit
  const matchesResult = useMemo(() => {
    let max = -1, idx = 0;
    for (let d = 0; d < 10; d++) {
      if (stats.percents[d] > max) { max = stats.percents[d]; idx = d; }
    }
    return { digit: idx, pct: max, count: stats.counts[idx] };
  }, [stats]);

  const eoWinner: 'even' | 'odd' = eo.evenPercent >= eo.oddPercent ? 'even' : 'odd';
  const ouWinner: 'under' | 'over' = ou.underPercent >= ou.overPercent ? 'under' : 'over';

  return (
    <div className="px-4 sm:px-6 pt-5 pb-6">
      <h3 className={cn('text-base font-bold mb-4', headingColor)}>Statistical Data</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Even vs Odd */}
        <div className={cn('rounded-2xl border p-4', cardBg, cardBorder)}>
          <div className="flex items-center justify-between mb-2">
            <span className={cn('text-sm font-bold', headingColor)}>Even vs Odd</span>
            <span className={cn('text-[11px]', subTextColor)}>{eo.evenCount + eo.oddCount} ticks</span>
          </div>
          <DualGlowBar
            leftLabel="Even"
            leftPct={eo.evenPercent}
            leftColor="#3b82f6"
            rightLabel="Odd"
            rightPct={eo.oddPercent}
            rightColor="#a855f7"
            winner={eoWinner === 'even' ? 'left' : 'right'}
            isDark={isDark}
          />
          {/* E/O tile sequence */}
          <div className="mt-3">
            <span className={cn('text-[10px] font-bold uppercase tracking-widest mb-1.5 block', subTextColor)}>
              Last {eoSequence.length} ticks
            </span>
            <div className="flex flex-wrap gap-1">
              {eoSequence.map((t, i) => (
                <span
                  key={i}
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black text-white',
                    i === eoSequence.length - 1
                      ? 'ring-2 ring-white/70 scale-110'
                      : 'opacity-80',
                    t === 'E'
                      ? 'bg-blue-500'
                      : 'bg-purple-500'
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
            {eoPatternHint && (
              <div className={cn(
                'mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border',
                isDark
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
                  : 'bg-yellow-50 border-yellow-300/60 text-yellow-700'
              )}>
                <span>⚡</span>
                <span>{eoPatternHint}</span>
              </div>
            )}
          </div>
        </div>

        {/* Under 0-4 vs Over 5-9 */}
        <div className={cn('rounded-2xl border p-4', cardBg, cardBorder)}>
          <div className="flex items-center justify-between mb-2">
            <span className={cn('text-sm font-bold', headingColor)}>Under 0-4 vs Over 5-9</span>
            <span className={cn('text-[11px]', subTextColor)}>{ou.overCount + ou.underCount} ticks</span>
          </div>
          <DualGlowBar
            leftLabel="Under 0-4"
            leftPct={ou.underPercent}
            leftColor="#f59e0b"
            rightLabel="Over 5-9"
            rightPct={ou.overPercent}
            rightColor="#22c55e"
            winner={ouWinner === 'under' ? 'left' : 'right'}
            isDark={isDark}
          />
          {/* O/U tile sequence */}
          <div className="mt-3">
            <span className={cn('text-[10px] font-bold uppercase tracking-widest mb-1.5 block', subTextColor)}>
              Last {ouSequence.length} ticks
            </span>
            <div className="flex flex-wrap gap-1">
              {ouSequence.map((t, i) => (
                <span
                  key={i}
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black text-white',
                    i === ouSequence.length - 1
                      ? 'ring-2 ring-white/70 scale-110'
                      : 'opacity-80',
                    t === 'U'
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
            {/* Highest digit in Under and Over groups */}
            <div className="mt-2.5 flex items-center gap-3">
              <div className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border flex-1',
                isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-300/60'
              )}>
                <span className={cn('text-[10px] font-bold', isDark ? 'text-amber-400' : 'text-amber-600')}>TOP UNDER</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500 text-[11px] font-black text-white">
                  {highestUnder === -1 ? '–' : highestUnder}
                </span>
                {highestUnder !== -1 && (
                  <span className={cn('text-[10px] font-semibold ml-auto', isDark ? 'text-amber-400' : 'text-amber-600')}>
                    {stats.percents[highestUnder].toFixed(1)}%
                  </span>
                )}
              </div>
              <div className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border flex-1',
                isDark ? 'bg-green-500/10 border-green-500/30' : 'bg-green-50 border-green-300/60'
              )}>
                <span className={cn('text-[10px] font-bold', isDark ? 'text-green-400' : 'text-green-600')}>TOP OVER</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-green-500 text-[11px] font-black text-white">
                  {highestOver === -1 ? '–' : highestOver}
                </span>
                {highestOver !== -1 && (
                  <span className={cn('text-[10px] font-semibold ml-auto', isDark ? 'text-green-400' : 'text-green-600')}>
                    {stats.percents[highestOver].toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            {ouPatternHint && (
              <div className={cn(
                'mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border',
                isDark
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
                  : 'bg-yellow-50 border-yellow-300/60 text-yellow-700'
              )}>
                <span>⚡</span>
                <span>{ouPatternHint}</span>
              </div>
            )}
          </div>
        </div>

        {/* Differs — most constant digit */}
        <div className={cn('rounded-2xl border p-4', cardBg, cardBorder)}>
          <div className="flex items-center justify-between mb-3">
            <span className={cn('text-sm font-bold', headingColor)}>Differs</span>
            <span className={cn('text-[11px]', subTextColor)}>Most constant digit</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-400 text-4xl font-black text-white shadow-lg shadow-pink-500/30">
              {differsResult.digit === -1 ? '–' : differsResult.digit}
            </div>
            <div className="flex-1">
              <p className={cn('text-sm font-semibold', headingColor)}>
                {differsResult.digit === -1 ? 'No suitable digit' : `Digit ${differsResult.digit}`}
              </p>
              <p className={cn('text-xs', subTextColor)}>
                Appearance in last 60 ticks: <span className="font-bold">{differsResult.pct.toFixed(2)}%</span>
              </p>
              <p className={cn('text-[11px] mt-1', subTextColor)}>
                Excludes most, 2nd most &amp; least frequent. Must be under 10%.
              </p>
            </div>
          </div>
        </div>

        {/* Matches — highest appearing digit */}
        <div className={cn('rounded-2xl border p-4', cardBg, cardBorder)}>
          <div className="flex items-center justify-between mb-3">
            <span className={cn('text-sm font-bold', headingColor)}>Matches</span>
            <span className={cn('text-[11px]', subTextColor)}>Highest appearing</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-400 text-4xl font-black text-white shadow-lg shadow-violet-500/30">
              {matchesResult.digit}
            </div>
            <div className="flex-1">
              <p className={cn('text-sm font-semibold', headingColor)}>
                Digit {matchesResult.digit}
              </p>
              <p className={cn('text-xs', subTextColor)}>
                Appears <span className="font-bold">{matchesResult.pct.toFixed(2)}%</span> of the time ({matchesResult.count} occurrences)
              </p>
              <p className={cn('text-[11px] mt-1', subTextColor)}>
                Most frequently appearing digit — best for Matches trades.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Dual Glow Bar — single bar, two sides, winning side glows ────────────────
function DualGlowBar({
  leftLabel, leftPct, leftColor,
  rightLabel, rightPct, rightColor,
  winner, isDark,
}: {
  leftLabel: string; leftPct: number; leftColor: string;
  rightLabel: string; rightPct: number; rightColor: string;
  winner: 'left' | 'right'; isDark: boolean;
}) {
  const total = leftPct + rightPct || 1;
  const leftWidth = (leftPct / total) * 100;
  const rightWidth = (rightPct / total) * 100;
  const headingColor = isDark ? 'text-white' : 'text-[#1a2a4a]';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: leftColor }} />
          <span className={cn('text-xs font-bold', headingColor)}>{leftLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('text-xs font-bold', headingColor)}>{rightLabel}</span>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: rightColor }} />
        </div>
      </div>
      {/* Slimmer bar: h-5 instead of h-8 */}
      <div className={cn('flex h-5 w-full overflow-hidden rounded-full border', isDark ? 'border-white/10 bg-white/5' : 'border-blue-200/40 bg-blue-50/50')}>
        <div
          className={cn('flex items-center justify-center text-[10px] font-black text-white transition-all duration-500', winner === 'left' && 'glow-bar')}
          style={{ width: `${leftWidth}%`, background: leftColor }}
        >
          {leftWidth > 15 && `${leftPct.toFixed(1)}%`}
        </div>
        <div
          className={cn('flex items-center justify-center text-[10px] font-black text-white transition-all duration-500', winner === 'right' && 'glow-bar')}
          style={{ width: `${rightWidth}%`, background: rightColor }}
        >
          {rightWidth > 15 && `${rightPct.toFixed(1)}%`}
        </div>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] font-semibold" style={winner === 'left' ? { color: leftColor } : undefined}>
          {leftPct.toFixed(2)}% {winner === 'left' && '●'}
        </span>
        <span className="text-[11px] font-semibold" style={winner === 'right' ? { color: rightColor } : undefined}>
          {winner === 'right' && '●'} {rightPct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}




