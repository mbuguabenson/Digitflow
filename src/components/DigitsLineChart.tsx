import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

// ── Shared Digits Line Chart ─────────────────────────────────────────────────
// Supports count selector (10 / 20 / 30 / 50 / 60 / 120), digit selection with
// cross-chart highlight, and consistent styling with SmartAnalysisTab.

type CountOption = 10 | 20 | 30 | 50 | 60 | 120;

function LineChartSVG({
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
  // Scale the viewBox width to accommodate more points without cramping
  const W = count >= 100 ? 900 : count >= 60 ? 720 : 540;
  const H = 220;
  const PAD = { top: 28, right: 20, bottom: 14, left: 26 };
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

  // Scale dot + font based on count so everything fits
  const dotR    = count >= 100 ? 2.5 : count >= 60 ? 3 : count > 30 ? 4.5 : 5.5;
  const fontSize = count >= 100 ? 9   : count >= 60 ? 11 : count > 30 ? 13 : 15;
  const textOffset = count >= 100 ? 9  : count >= 60 ? 10 : count > 30 ? 12 : 14;
  const strokeWidth = count >= 60 ? 1.8 : 2.5;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full"
      style={{ borderRadius: 12 }}
      preserveAspectRatio="xMidYMid meet"
    >
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

      {/* Y-axis digit labels */}
      {[0, 3, 6, 9].map((lvl) => (
        <text
          key={`lbl-${lvl}`}
          x={PAD.left - 6}
          y={yOf(lvl) + 4}
          textAnchor="end"
          fill={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.20)'}
          fontSize="9"
        >
          {lvl}
        </text>
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
          curR = dotR + 2;
        } else if (isLatest && selectedDigit === null) {
          curDot = latestColor;
          curLabel = latestColor;
          curR = dotR + 1;
        }

        return (
          <g
            key={i}
            className="cursor-pointer transition-opacity duration-200"
            onClick={() => onSelectDigit?.(p.v)}
            opacity={isDimmed ? 0.15 : 1}
          >
            {isSelected && (
              <circle
                cx={p.x}
                cy={p.y}
                r={curR + 3.5}
                fill="none"
                stroke={selectedAccent}
                strokeWidth="1.5"
                opacity="0.5"
              />
            )}
            <circle cx={p.x} cy={p.y} r={curR} fill={curDot} />
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

// ── Public component with built-in count selector & optional digit selection ──
export function DigitsLineChart({
  digits,
  isDark,
  showSelector = true,
  defaultCount = 20,
  counts,
  externalSelectedDigit,
  onSelectDigit,
}: {
  digits: number[];
  isDark: boolean;
  /** Show the count toggle. Default true. */
  showSelector?: boolean;
  defaultCount?: CountOption;
  /** Override the count options shown. Default: [10,20,30,50] */
  counts?: CountOption[];
  /** Pass in a selected digit from the parent for cross-chart sync */
  externalSelectedDigit?: number | null;
  onSelectDigit?: (d: number) => void;
}) {
  const countOptions: CountOption[] = counts ?? [10, 20, 30, 50];
  const [count, setCount] = useState<CountOption>(defaultCount);
  const [internalSelected, setInternalSelected] = useState<number | null>(null);

  const selectedDigit = externalSelectedDigit !== undefined ? externalSelectedDigit : internalSelected;
  const matchCount = useMemo(
    () => (selectedDigit !== null ? digits.slice(-count).filter((d) => d === selectedDigit).length : 0),
    [digits, count, selectedDigit]
  );

  const handleSelect = (d: number) => {
    if (onSelectDigit) {
      onSelectDigit(d);
    } else {
      setInternalSelected((prev) => (prev === d ? null : d));
    }
  };

  const headingColor = isDark ? 'text-white' : 'text-[#1a2a4a]';
  const subTextColor = isDark ? 'text-[#6b7280]' : 'text-[#7a8aaa]';
  const toggleBorder = isDark ? 'border-white/10' : 'border-blue-200/40';
  const toggleInactive = isDark
    ? 'bg-white/5 text-[#6b7280] hover:bg-white/10 hover:text-white'
    : 'bg-blue-50 text-[#7a8aaa] hover:bg-blue-100 hover:text-[#3b7ef8]';

  // Taller chart when showing many points
  const chartH = count >= 60 ? 'h-[320px] sm:h-[260px]' : 'h-[280px] sm:h-[220px]';

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={cn('text-base font-bold', headingColor)}>
            Last {count} Digits Line Chart
          </h3>
          {selectedDigit !== null && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              Digit {selectedDigit} ({matchCount}x)
            </span>
          )}
        </div>
        {showSelector && (
          <div className="flex items-center gap-2">
            {selectedDigit !== null && (
              <button
                onClick={() => handleSelect(selectedDigit)}
                className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors',
                  isDark
                    ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    : 'bg-blue-50 border-blue-200/40 text-slate-500 hover:bg-blue-100'
                )}
              >
                Clear
              </button>
            )}
            <div className={cn('flex rounded-lg overflow-hidden border', toggleBorder)}>
              {countOptions.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={cn(
                    'px-2 py-1 text-[11px] font-bold transition-colors',
                    count === n ? 'bg-[#3b82f6] text-white' : toggleInactive
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chart — width is 100%, SVG scales via viewBox */}
      <div className={cn('w-full overflow-hidden', chartH)}>
        <LineChartSVG
          digits={digits}
          count={count}
          selectedDigit={selectedDigit}
          onSelectDigit={handleSelect}
          isDark={isDark}
        />
      </div>

      {/* Digit filter hint */}
      {digits.length >= 2 && (
        <p className={cn('text-[10px] mt-1.5 text-center', subTextColor)}>
          Tap any dot to highlight that digit
        </p>
      )}
    </div>
  );
}
