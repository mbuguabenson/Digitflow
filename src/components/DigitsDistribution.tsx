import { useMemo, useState } from 'react';
import { computeDigitStats } from '@/lib/analysis';
import { cn } from '@/lib/utils';

// ── Shared Digits Distribution ────────────────────────────────────────────────
// Renders 10 ring gauges (0-9) with colour-coded badges:
//   NOW  → orange   (current tick)
//   1ST  → green    (most appearing)
//   2ND  → yellow   (2nd most appearing)
//   LOW  → red      (least appearing)
//   rest → grey

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
  isNow: boolean;
  isSelected?: boolean;
  isMost?: boolean;
  isSecond?: boolean;
  isLeast?: boolean;
  onSelect?: () => void;
  isDark: boolean;
}) {
  const r = 30, cx = 40, cy = 40;
  const circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;

  let ringColor = isDark ? '#475569' : '#94a3b8';
  let barColor  = isDark ? '#475569' : '#94a3b8';
  if (isNow)         { ringColor = '#f97316'; barColor = '#f97316'; }
  else if (isMost)   { ringColor = '#22c55e'; barColor = '#22c55e'; }
  else if (isSecond) { ringColor = '#eab308'; barColor = '#eab308'; }
  else if (isLeast)  { ringColor = '#ef4444'; barColor = '#ef4444'; }

  const trackStroke = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  let digitTextColor = isDark ? '#e2e8f0' : '#1e293b';
  let pctTextColor   = isDark ? '#94a3b8' : '#64748b';
  if (isSelected)    { digitTextColor = '#38bdf8'; pctTextColor = '#38bdf8'; }
  else if (isNow)    { digitTextColor = '#f97316'; pctTextColor = '#f97316'; }
  else if (isMost)   { digitTextColor = '#22c55e'; pctTextColor = isDark ? '#4ade80' : '#16a34a'; }
  else if (isSecond) { digitTextColor = '#eab308'; pctTextColor = isDark ? '#fde047' : '#ca8a04'; }
  else if (isLeast)  { digitTextColor = '#ef4444'; pctTextColor = isDark ? '#f87171' : '#dc2626'; }

  const barTrack = isDark ? 'bg-white/10' : 'bg-black/5';

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center gap-1 sm:gap-1.5 select-none cursor-pointer transition-transform duration-200 py-1 px-0.5',
        isSelected ? 'scale-105' : 'hover:scale-105 opacity-90 hover:opacity-100'
      )}
      title={`Digit ${digit} (${percent.toFixed(1)}%)${isNow ? ' • Current' : isMost ? ' • Most Appearing' : isSecond ? ' • 2nd Most' : isLeast ? ' • Least Appearing' : ''}`}
    >
      {/* Badge */}
      <div className="h-4 sm:h-5 flex items-center">
        {isSelected ? (
          <span className="rounded-full bg-blue-500 px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] font-black tracking-widest text-white uppercase shadow-sm">SEL</span>
        ) : isNow ? (
          <span className="rounded-full bg-[#f97316] px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] font-black tracking-widest text-white uppercase shadow-sm">NOW</span>
        ) : isMost ? (
          <span className="rounded-full bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 sm:px-2 py-0.5 text-[7px] sm:text-[8px] font-black tracking-wider uppercase">1ST</span>
        ) : isSecond ? (
          <span className="rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 sm:px-2 py-0.5 text-[7px] sm:text-[8px] font-black tracking-wider uppercase">2ND</span>
        ) : isLeast ? (
          <span className="rounded-full bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 sm:px-2 py-0.5 text-[7px] sm:text-[8px] font-black tracking-wider uppercase">LOW</span>
        ) : (
          <span className="invisible text-[8px] px-1.5 py-0.5">NOW</span>
        )}
      </div>

      {/* Ring SVG */}
      <div className="relative">
        <svg viewBox="0 0 80 80" className="w-[62px] h-[62px] xs:w-[68px] xs:h-[68px] sm:w-[78px] sm:h-[78px] -rotate-90">
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
          <span className="text-[10px] xs:text-[11px] sm:text-xs font-extrabold leading-tight mt-0.5" style={{ color: pctTextColor }}>
            {percent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Mini bar */}
      <div className={cn('h-1 w-8 sm:w-10 rounded-full overflow-hidden', barTrack)}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(percent * 7, 100)}%`, background: isSelected ? '#38bdf8' : barColor }}
        />
      </div>
    </div>
  );
}

// ── Public wrapper ─────────────────────────────────────────────────────────────
export function DigitsDistribution({
  digits,
  currentDigit,
  isDark,
  selectedDigit,
  onSelectDigit,
}: {
  digits: number[];
  currentDigit: number;
  isDark: boolean;
  /** Controlled selection from parent — omit for self-managed internal state */
  selectedDigit?: number | null;
  onSelectDigit?: (d: number | null) => void;
}) {
  const [internalSelected, setInternalSelected] = useState<number | null>(null);

  const selected = selectedDigit !== undefined ? selectedDigit : internalSelected;

  const toggle = (d: number) => {
    const next = selected === d ? null : d;
    if (onSelectDigit) onSelectDigit(next);
    else setInternalSelected(next);
  };

  const stats = useMemo(() => computeDigitStats(digits), [digits]);

  const { mostAppearing, secondMostAppearing, leastAppearing } = useMemo(() => {
    if (digits.length === 0) return { mostAppearing: -1, secondMostAppearing: -1, leastAppearing: -1 };
    const ranked = Array.from({ length: 10 }, (_, d) => ({ digit: d, count: stats.counts[d] }))
      .sort((a, b) => b.count - a.count);
    if (ranked[0].count === ranked[ranked.length - 1].count) {
      return { mostAppearing: -1, secondMostAppearing: -1, leastAppearing: -1 };
    }
    return {
      mostAppearing: ranked[0].digit,
      secondMostAppearing: ranked[1].count > ranked[ranked.length - 1].count ? ranked[1].digit : -1,
      leastAppearing: ranked[ranked.length - 1].digit,
    };
  }, [digits.length, stats.counts]);

  const headingColor = isDark ? 'text-white' : 'text-[#1a2a4a]';
  const subTextColor = isDark ? 'text-[#6b7280]' : 'text-[#7a8aaa]';

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <h3 className={cn('text-base font-bold', headingColor)}>Digits Distribution</h3>
          {selected !== null && (
            <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
              Digit {selected}
              <button
                onClick={() => toggle(selected)}
                className="rounded-full hover:bg-white/20 p-0.5 transition-colors"
                title="Clear filter"
              >✕</button>
            </span>
          )}
        </div>
        <span className={cn('text-[10px] sm:text-[11px] font-medium hidden sm:inline', subTextColor)}>
          Tap a ring to highlight
        </span>
      </div>

      {/* Rings grid */}
      <div className="grid grid-cols-5 gap-y-3.5 gap-x-1 md:flex md:items-start md:justify-between md:gap-2">
        {Array.from({ length: 10 }, (_, d) => (
          <DigitRing
            key={d}
            digit={d}
            percent={stats.percents[d]}
            isNow={d === currentDigit}
            isSelected={selected === d}
            isMost={d === mostAppearing}
            isSecond={d === secondMostAppearing}
            isLeast={d === leastAppearing}
            onSelect={() => toggle(d)}
            isDark={isDark}
          />
        ))}
      </div>
    </div>
  );
}
