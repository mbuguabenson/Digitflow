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
  count,
  isNow,
  isDark,
}: {
  digit: number;
  percent: number;
  count: number;
  isNow: boolean;
  isDark: boolean;
}) {
  const r = 30;
  const cx = 40;
  const cy = 40;
  const circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;
  const { ring, bar } = DIGIT_COLORS[digit];

  const trackStroke = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const digitTextColor = isNow ? '#f97316' : isDark ? '#ffffff' : '#1a2a4a';
  const pctTextColor = isNow ? '#f97316' : isDark ? '#a0aec0' : '#7a8aaa';
  const barTrack = isDark ? 'bg-white/10' : 'bg-black/5';
  const countColor = isDark ? 'text-[#4a5568]' : 'text-[#9aaaba]';

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      <div className={cn('h-5 flex items-center', !isNow && 'invisible')}>
        <span className="rounded-full bg-[#f97316] px-2 py-0.5 text-[9px] font-black tracking-widest text-white uppercase">
          NOW
        </span>
      </div>
      <div className="relative">
        <svg width="80" height="80" className="-rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackStroke} strokeWidth="6" />
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={isNow ? '#f97316' : ring}
            strokeWidth={isNow ? 7 : 6}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black leading-none" style={{ color: digitTextColor }}>
            {digit}
          </span>
          <span className="text-[11px] font-bold leading-tight mt-0.5" style={{ color: pctTextColor }}>
            {percent.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className={cn('h-1 w-10 rounded-full overflow-hidden', barTrack)}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(percent * 7, 100)}%`, background: isNow ? '#f97316' : bar }}
        />
      </div>
      <span className={cn('text-[10px]', countColor)}>n={count}</span>
    </div>
  );
}

// ── Line Chart ───────────────────────────────────────────────────────────────
function LineChart({ digits, isDark }: { digits: number[]; isDark: boolean }) {
  const W = 540;
  const H = 220;
  const PAD = { top: 30, right: 24, bottom: 16, left: 28 };
  const show = digits.slice(-15);
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
  const area = d + ` L ${pts[pts.length - 1].x},${PAD.top + innerH} L ${pts[0].x},${PAD.top + innerH} Z`;

  const gridColor = isDark ? '#1e2a5e' : '#e5e7eb';
  const lineColor = isDark ? '#a78bfa' : '#7c3aed';
  const dotColor = isDark ? '#a78bfa' : '#7c3aed';
  const labelColor = isDark ? '#c4b5fd' : '#5b21b6';
  const chartBg = isDark ? '#111736' : '#f3f4f6';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ background: chartBg, borderRadius: 12 }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0,1,2,3,4,5,6,7,8,9].map((v) => (
        <line key={v} x1={PAD.left} y1={yOf(v)} x2={W - PAD.right} y2={yOf(v)} stroke={gridColor} strokeWidth="1" />
      ))}
      <path d={area} fill="url(#areaGrad)" />
      <path d={d} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <rect x={p.x - 6} y={p.y - 6} width="12" height="12" fill={dotColor} rx="2" />
          <text x={p.x} y={p.y - 11} textAnchor="middle" fill={labelColor} fontSize="11" fontWeight="700">
            {p.v}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Digit Tile ──────────────────────────────────────────────────────────────
function DigitTile({ digit, isLatest }: { digit: number; isLatest: boolean }) {
  const { tile } = DIGIT_COLORS[digit];
  return (
    <div
      className={cn(
        `bg-gradient-to-br ${tile}`,
        'flex h-11 w-11 items-center justify-center rounded-xl text-base font-black text-white shadow-md transition-transform',
        isLatest && 'scale-110 ring-2 ring-white/60'
      )}
    >
      {digit}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export function SmartAnalysisTab({ digits, currentDigit, isDark }: Props) {
  const [tickView, setTickView] = useState<10 | 20 | 50>(50);
  const stats = useMemo(() => computeDigitStats(digits), [digits]);
  const gridDigits = digits.slice(-tickView);

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
      <div className="px-6 pt-6 pb-4">
        <h2 className={cn('text-xl font-black mb-5', headingColor)}>Digits Distribution</h2>
        <div className="flex items-start justify-between gap-2 overflow-x-auto pb-2">
          {Array.from({ length: 10 }, (_, d) => (
            <DigitRing
              key={d}
              digit={d}
              percent={stats.percents[d]}
              count={stats.counts[d]}
              isNow={d === currentDigit}
              isDark={isDark}
            />
          ))}
        </div>
      </div>

      <div className={cn('h-px mx-6', dividerColor)} />

      {/* ── Bottom two panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <div className={cn('p-6 border-r', panelBorder)}>
          <h3 className={cn('text-base font-bold mb-4', headingColor)}>Last Digits Line Chart</h3>
          <div style={{ height: 220 }}>
            <LineChart digits={digits} isDark={isDark} />
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className={cn('text-base font-bold', headingColor)}>Last {tickView} Digits Chart</h3>
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
                    'px-3 py-1.5 text-xs font-bold transition-colors',
                    tickView === n ? 'bg-[#3b82f6] text-white' : toggleInactive
                  )}
                >
                  {n} TICKS
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {gridDigits.length === 0 ? (
              <p className={cn('text-sm', subTextColor)}>Waiting for ticks…</p>
            ) : (
              gridDigits.map((d, i) => (
                <DigitTile key={i} digit={d} isLatest={i === gridDigits.length - 1} />
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

  // Differs: most constant digit — not the most/least/2nd-most appearing, and <10% in last 60 ticks
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
    <div className="px-6 pt-5 pb-6">
      <h3 className={cn('text-base font-bold mb-4', headingColor)}>Statistical Data</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Even vs Odd — single glowing progress bar */}
        <div className={cn('rounded-2xl border p-4', cardBg, cardBorder)}>
          <div className="flex items-center justify-between mb-3">
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
        </div>

        {/* Under 0-4 vs Over 5-9 — single glowing progress bar */}
        <div className={cn('rounded-2xl border p-4', cardBg, cardBorder)}>
          <div className="flex items-center justify-between mb-3">
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
  const subTextColor = isDark ? 'text-[#6b7280]' : 'text-[#7a8aaa]';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: leftColor }} />
          <span className={cn('text-xs font-bold', headingColor)}>{leftLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-bold', headingColor)}>{rightLabel}</span>
          <span className="h-3 w-3 rounded-full" style={{ background: rightColor }} />
        </div>
      </div>
      <div className={cn('flex h-8 w-full overflow-hidden rounded-full border', isDark ? 'border-white/10 bg-white/5' : 'border-blue-200/40 bg-blue-50/50')}>
        <div
          className={cn('flex items-center justify-center text-xs font-black text-white transition-all duration-500', winner === 'left' && 'glow-bar')}
          style={{ width: `${leftWidth}%`, background: leftColor }}
        >
          {leftWidth > 15 && `${leftPct.toFixed(1)}%`}
        </div>
        <div
          className={cn('flex items-center justify-center text-xs font-black text-white transition-all duration-500', winner === 'right' && 'glow-bar')}
          style={{ width: `${rightWidth}%`, background: rightColor }}
        >
          {rightWidth > 15 && `${rightPct.toFixed(1)}%`}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
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
