import { useMemo, useState } from 'react';
import { computeDigitStats } from '@/lib/analysis';
import { cn } from '@/lib/utils';
import type { Account, TradeResult } from '@/hooks/useDerivAuth';
import { Loader2, CheckCircle2, XCircle, Wallet, Zap } from 'lucide-react';

type Props = {
  digits: number[];
  currentDigit: number;
  symbol: string;
  account: Account | null;
  placeTrade: (params: {
    symbol: string;
    contractType: string;
    barrier?: string;
    amount: number;
    duration: number;
    durationUnit: string;
    basis?: string;
  }) => Promise<TradeResult>;
  isDark: boolean;
};

const TILE_COLORS: Record<number, string> = {
  0: 'bg-[#00bcd4]',
  1: 'bg-[#e91e63]',
  2: 'bg-[#00acc1]',
  3: 'bg-[#5c6bc0]',
  4: 'bg-[#26a69a]',
  5: 'bg-[#29b6f6]',
  6: 'bg-[#ec407a]',
  7: 'bg-[#ab47bc]',
  8: 'bg-[#ffa726]',
  9: 'bg-[#42a5f5]',
};

function LineChart({ digits, isDark }: { digits: number[]; isDark: boolean }) {
  const show = digits.slice(-50);
  if (show.length < 2) return (
    <div className="flex h-full items-center justify-center text-sm text-[#9ca3af]">
      Waiting for data…
    </div>
  );
  const W = 580, H = 200;
  const PL = 10, PR = 10, PT = 22, PB = 10;
  const n = show.length;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const xOf = (i: number) => PL + (i / (n - 1)) * innerW;
  const yOf = (v: number) => PT + innerH - (v / 9) * innerH;
  const pts = show.map((d, i) => ({ x: xOf(i), y: yOf(d), v: d }));

  let path = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i - 1].x + pts[i].x) / 2;
    path += ` C ${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
  }
  const area = path + ` L ${pts[pts.length - 1].x},${PT + innerH} L ${pts[0].x},${PT + innerH} Z`;

  const lineColor = isDark ? '#a78bfa' : '#8b5cf6';
  const labelColor = isDark ? '#c4b5fd' : '#6d28d9';
  const gridColor = isDark ? '#1e2a5e' : '#e5e7eb';
  const chartBg = isDark ? '#111736' : '#f3f4f6';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ background: chartBg, borderRadius: 12 }}>
      <defs>
        <linearGradient id="ouAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0,2,4,6,8].map((v) => (
        <line key={v} x1={PL} y1={yOf(v)} x2={W - PR} y2={yOf(v)} stroke={gridColor} strokeWidth="1" />
      ))}
      <path d={area} fill="url(#ouAreaGrad)" />
      <path d={path} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill={lineColor} />
          <text x={p.x} y={p.y - 7} textAnchor="middle" fill={labelColor} fontSize="9" fontWeight="700">
            {p.v}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function OverUnderTab({ digits, currentDigit, symbol, account, placeTrade, isDark }: Props) {
  const [barrier, setBarrier] = useState(4);
  const [tickView, setTickView] = useState<10 | 20 | 50>(50);
  const [stake, setStake] = useState(1);
  const [duration, setDuration] = useState(5);
  const [tradeSide, setTradeSide] = useState<'OVER' | 'UNDER'>('OVER');
  const [tradeStatus, setTradeStatus] = useState<{ loading: boolean; result: TradeResult | null }>({
    loading: false,
    result: null,
  });

  const slice50 = useMemo(() => digits.slice(-50), [digits]);
  const digitStats = useMemo(() => computeDigitStats(slice50), [slice50]);

  const overDigits = Array.from({ length: 9 - barrier }, (_, i) => barrier + 1 + i);
  const underDigits = Array.from({ length: barrier }, (_, i) => i);

  const hottestOver = overDigits.length
    ? overDigits.reduce((best, d) => digitStats.counts[d] > digitStats.counts[best] ? d : best, overDigits[0])
    : barrier + 1;
  const hottestUnder = underDigits.length
    ? underDigits.reduce((best, d) => digitStats.counts[d] > digitStats.counts[best] ? d : best, underDigits[0])
    : 0;

  const underCount = slice50.filter(d => d < barrier).length;
  const overCount = slice50.filter(d => d > barrier).length;
  const neutralCount = slice50.filter(d => d === barrier).length;
  const underPct = slice50.length ? (underCount / slice50.length) * 100 : 0;
  const overPct = slice50.length ? (overCount / slice50.length) * 100 : 0;

  const signal: 'STRONG' | 'NEUTRAL' | 'WEAK' =
    Math.abs(underPct - overPct) >= 10 ? 'STRONG' :
    Math.abs(underPct - overPct) >= 4 ? 'NEUTRAL' : 'WEAK';
  const signalDir = underPct >= overPct ? 'UNDER' : 'OVER';
  const signalLabel =
    signal === 'STRONG' ? `STRONG ${signalDir} signal at ${Math.max(underPct, overPct).toFixed(1)}% - POWERFUL market!` :
    signal === 'NEUTRAL' ? `Market is balanced - No clear signal yet` :
    `Weak signal detected`;

  const last20 = digits.slice(-20);
  const prior30 = digits.slice(-50, -20);
  const last20Under = last20.length ? last20.filter(d => d < barrier).length / last20.length * 100 : 0;
  const prior30Under = prior30.length ? prior30.filter(d => d < barrier).length / prior30.length * 100 : 0;
  const momentum = Math.abs(last20Under - prior30Under);

  const mean = slice50.reduce((a, b) => a + b, 0) / (slice50.length || 1);
  const volatility = Math.sqrt(slice50.reduce((a, d) => a + (d - mean) ** 2, 0) / (slice50.length || 1));

  const gridDigits = digits.slice(-tickView);

  const handleTrade = async (side: 'OVER' | 'UNDER') => {
    if (!account) return;
    setTradeSide(side);
    setTradeStatus({ loading: true, result: null });
    const result = await placeTrade({
      symbol,
      contractType: side === 'OVER' ? 'DIGITOVER' : 'DIGITUNDER',
      barrier: String(barrier),
      amount: stake,
      duration,
      durationUnit: 't',
      basis: 'stake',
    });
    setTradeStatus({ loading: false, result });
    setTimeout(() => setTradeStatus({ loading: false, result: null }), 6000);
  };

  // Theme helpers
  const panelBg = isDark ? '#0a0e27' : '#ffffff';
  const panelBgAlt = isDark ? '#111736' : '#f8faff';
  const panelBorder = isDark ? 'border-white/10' : 'border-blue-200/40';
  const headingColor = isDark ? 'text-white' : 'text-[#1a2a4a]';
  const subTextColor = isDark ? 'text-[#9ca3af]' : 'text-[#7a8aaa]';
  const mutedTextColor = isDark ? 'text-[#6b7280]' : 'text-[#9aaaba]';
  const toggleBorder = isDark ? 'border-white/10' : 'border-blue-200/40';
  const toggleInactive = isDark ? 'bg-white/5 text-[#6b7280] hover:bg-white/10 hover:text-white' : 'bg-blue-50 text-[#7a8aaa] hover:bg-blue-100 hover:text-[#3b7ef8]';
  const innerCardBorder = isDark ? 'border-[#1e2a5e]' : 'border-blue-200/50';
  const innerCardBg = isDark ? '#111736' : '#f8faff';
  const digitPickerInactive = isDark ? 'bg-transparent border-white/20 text-white hover:border-white/50' : 'bg-transparent border-blue-200 text-[#3a4a6a] hover:border-blue-400';
  const signalBannerBg = signal === 'STRONG' ? (isDark ? '#14532d' : '#dcfce7') : signal === 'NEUTRAL' ? (isDark ? '#1e3a5f' : '#dbeafe') : (isDark ? '#3b1f1f' : '#fee2e2');
  const signalBannerText = isDark ? '#9ca3af' : '#4a5568';

  return (
    <div className="space-y-4">
      {/* ── Section 1: Select Digit ── */}
      <div className={cn('rounded-2xl overflow-hidden border', panelBorder)} style={{ background: panelBg }}>
        <div className="px-6 pt-5 pb-4">
          <h2 className={cn('text-center text-base font-bold mb-4', headingColor)}>
            Select Digit for Over/Under Analysis
          </h2>
          <div className="flex justify-center gap-2 mb-5">
            {[0,1,2,3,4,5,6,7,8,9].map((b) => (
              <button
                key={b}
                onClick={() => setBarrier(b)}
                className={cn(
                  'h-10 w-10 rounded-xl text-sm font-black transition-all border',
                  barrier === b
                    ? 'bg-[#f97316] border-[#f97316] text-white shadow-lg shadow-orange-500/40'
                    : digitPickerInactive
                )}
              >
                {b}
              </button>
            ))}
          </div>

          {/* Prediction power card */}
          <div className={cn('rounded-xl border p-4 mb-4', innerCardBorder)} style={{ background: innerCardBg }}>
            <h3 className={cn('text-center text-sm font-bold mb-3', headingColor)}>
              Digit {barrier} Prediction Power
            </h3>
            <div className="flex justify-between mb-3">
              <div>
                <p className={cn('text-[11px] mb-1', mutedTextColor)}>Frequency (Last 50)</p>
                <p className="text-2xl font-black" style={{ color: '#f97316' }}>
                  {(digitStats.percents[barrier] ?? 0).toFixed(1)}%
                </p>
                <p className={cn('text-[10px]', mutedTextColor)}>{digitStats.counts[barrier] ?? 0} times</p>
              </div>
              <div className="text-right">
                <p className={cn('text-[11px] mb-1', mutedTextColor)}>Momentum (Last 50)</p>
                <p className="text-2xl font-black" style={{ color: '#f97316' }}>
                  {momentum.toFixed(1)}%
                </p>
                <p className={cn('text-[10px]', mutedTextColor)}>{last20.filter(d => d < barrier).length} recent</p>
              </div>
            </div>
            <div className="flex items-center justify-between mb-1.5">
              <p className={cn('text-xs', subTextColor)}>Prediction Confidence</p>
              <span className="rounded px-2 py-0.5 text-[10px] font-black text-white"
                style={{ background: signal === 'STRONG' ? '#22c55e' : '#3b82f6' }}>
                {signal}
              </span>
            </div>
            <div className={cn('h-2 rounded-full overflow-hidden mb-1', isDark ? 'bg-white/10' : 'bg-blue-100')}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(underPct, overPct)}%`, background: 'linear-gradient(90deg, #3b82f6, #06b6d4)' }}
              />
            </div>
            <p className="text-center text-sm font-bold text-[#06b6d4]">
              {Math.max(underPct, overPct).toFixed(1)}% Confidence
            </p>
          </div>

          {/* Over/Under bars */}
          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-3">
              <span className={cn('w-20 text-xs font-semibold', headingColor)}>Over ({barrier+1}-9)</span>
              <div className={cn('flex-1 h-5 rounded-full overflow-hidden', isDark ? 'bg-white/10' : 'bg-blue-100')}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${overPct}%`, background: '#22c55e' }} />
              </div>
              <span className="w-12 text-right text-sm font-bold text-[#22c55e]">{overPct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn('w-20 text-xs font-semibold', headingColor)}>Under (0-{barrier-1})</span>
              <div className={cn('flex-1 h-5 rounded-full overflow-hidden', isDark ? 'bg-white/10' : 'bg-blue-100')}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${underPct}%`, background: '#06b6d4' }} />
              </div>
              <span className="w-12 text-right text-sm font-bold text-[#06b6d4]">{underPct.toFixed(1)}%</span>
            </div>
          </div>

          <div className={cn('rounded-lg py-2 px-4 text-center text-sm font-bold', isDark ? 'text-white' : 'text-white')}
            style={{ background: '#7c1a1a' }}>
            Digit {barrier} appeared {digitStats.counts[barrier] ?? 0} times ({(digitStats.percents[barrier] ?? 0).toFixed(1)}%)
          </div>
        </div>

        {/* Last 50 digit tiles */}
        <div className="px-4 pb-3">
          <p className={cn('text-center text-[11px] mb-2', mutedTextColor)}>
            Last 50 Digits (U = Under, O = Over, C = Current Digit {barrier})
          </p>
          <div className="flex flex-wrap gap-1">
            {slice50.map((d, i) => {
              const isC = d === barrier;
              const isOver = d > barrier;
              const label = isC ? 'C' : isOver ? 'O' : 'U';
              const bg = isC ? '#f97316' : isOver ? '#22c55e' : '#ef4444';
              return (
                <div key={i} className="flex flex-col items-center justify-center rounded-lg w-9 h-9 text-[9px] font-black text-white" style={{ background: bg }}>
                  <span>{label}</span>
                  <span className="text-[8px] opacity-75">{d}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Signal banner */}
        <div className="mx-4 mb-4 rounded-xl overflow-hidden">
          <div className="py-3 text-center" style={{ background: signalBannerBg }}>
            <div className="inline-flex items-center justify-center rounded-lg px-6 py-1.5 mb-2"
              style={{ background: signal === 'STRONG' ? '#16a34a' : signal === 'NEUTRAL' ? '#1d4ed8' : '#7c3aed' }}>
              <span className="text-sm font-black text-white">
                {signal === 'NEUTRAL' ? `NEUTRAL (${neutralCount}s)` : `${signal} ${signalDir}`}
              </span>
            </div>
            <p className="text-xs" style={{ color: signalBannerText }}>{signalLabel}</p>
          </div>
        </div>

        <div className={cn('px-6 py-3 flex items-center justify-between border-t', panelBorder)}>
          <span className={cn('text-xs', mutedTextColor)}>
            Current Digit: <span className={cn('text-2xl font-black ml-1', headingColor)}>{currentDigit}</span>
          </span>
          <span className={cn('text-xs', mutedTextColor)}>Symbol: <span className={cn('font-mono font-bold', headingColor)}>{symbol}</span></span>
        </div>
      </div>

      {/* ── Section 2: Last N Digits grid ── */}
      <div className={cn('rounded-2xl overflow-hidden border', panelBorder)} style={{ background: panelBg }}>
        <div className="px-6 pt-5 pb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className={cn('text-base font-bold', headingColor)}>Last {tickView} Digits</h3>
            <div className={cn('flex rounded-lg overflow-hidden border', toggleBorder)}>
              {([10, 20, 50] as const).map((n) => (
                <button key={n} onClick={() => setTickView(n)}
                  className={cn('px-3 py-1.5 text-xs font-bold transition-colors',
                    tickView === n ? 'bg-[#3b82f6] text-white' : toggleInactive)}>
                  {n} TICKS
                </button>
              ))}
            </div>
          </div>
          <p className={cn('text-[10px] font-bold tracking-widest uppercase mb-3', mutedTextColor)}>Recent Digit Sequence</p>
          <div className="flex flex-wrap gap-1.5">
            {gridDigits.map((d, i) => (
              <div key={i} className={cn(TILE_COLORS[d], 'flex h-11 w-11 items-center justify-center rounded-xl text-base font-black text-white shadow-md transition-transform',
                i === gridDigits.length - 1 && 'scale-110 ring-2 ring-white/60')}>
                {d}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 3: Line chart ── */}
      <div className={cn('rounded-2xl overflow-hidden border', panelBorder)} style={{ background: panelBg }}>
        <div className="px-6 pt-5 pb-5">
          <h3 className={cn('text-base font-bold mb-3', headingColor)}>Digits Line Chart</h3>
          <div style={{ height: 220 }}>
            <LineChart digits={digits} isDark={isDark} />
          </div>
        </div>
      </div>

      {/* ── Section 4: Analysis + Trade panel ── */}
      <div className={cn('rounded-2xl overflow-hidden border', isDark ? 'border-[#1e4d3a]' : 'border-emerald-200/50')}
        style={{ background: isDark ? '#061a12' : '#f0fdf4' }}>
        <div className="px-6 pt-5 pb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className={cn('text-sm font-bold', headingColor)}>
              Under (0–{barrier - 1}) / Over ({barrier + 1}–9) Analysis (Last 50 Ticks)
            </h3>
          </div>

          {/* Signal pill */}
          <div className="text-center mb-3">
            <div className="inline-flex items-center justify-center rounded-xl px-8 py-2 mb-2"
              style={{ background: signal === 'STRONG' ? '#16a34a' : signal === 'NEUTRAL' ? '#1d4ed8' : '#7c3aed' }}>
              <span className="text-base font-black text-white">{signal}</span>
            </div>
            <p className={cn('text-xs font-semibold', headingColor)}>{signalLabel}</p>
          </div>

          {/* Under / Over side by side */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={cn('rounded-xl p-4 border', isDark ? 'border-[#1e3a8a] bg-[#0f1f4a]' : 'border-blue-200 bg-blue-50/60')}>
              <p className={cn('text-xs mb-1', subTextColor)}>Under (0–{barrier - 1})</p>
              <p className={cn('text-2xl font-black', headingColor)}>{underPct.toFixed(1)}%</p>
              <div className={cn('h-2.5 rounded-full overflow-hidden mt-2', isDark ? 'bg-white/10' : 'bg-blue-100')}>
                <div className="h-full rounded-full" style={{ width: `${underPct}%`, background: '#06b6d4' }} />
              </div>
            </div>
            <div className={cn('rounded-xl p-4 border', isDark ? 'border-[#14532d] bg-[#052e16]' : 'border-emerald-200 bg-emerald-50/60')}>
              <p className={cn('text-xs mb-1', subTextColor)}>Over ({barrier + 1}–9)</p>
              <p className={cn('text-2xl font-black', headingColor)}>{overPct.toFixed(1)}%</p>
              <div className={cn('h-2.5 rounded-full overflow-hidden mt-2', isDark ? 'bg-white/10' : 'bg-emerald-100')}>
                <div className="h-full rounded-full" style={{ width: `${overPct}%`, background: '#22c55e' }} />
              </div>
            </div>
          </div>

          {/* 3 metric cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className={cn('rounded-xl p-3 border', isDark ? 'border-[#4a1d96] bg-[#2d1463]' : 'border-purple-200 bg-purple-50/60')}>
              <p className={cn('text-[11px] mb-1', isDark ? 'text-[#a78bfa]' : 'text-purple-600')}>Market Volatility</p>
              <p className={cn('text-2xl font-black', isDark ? 'text-[#c4b5fd]' : 'text-purple-700')}>{volatility.toFixed(2)}</p>
            </div>
            <div className={cn('rounded-xl p-3 border', isDark ? 'border-[#7c1a1a] bg-[#450a0a]' : 'border-red-200 bg-red-50/60')}>
              <p className={cn('text-[11px] mb-1', isDark ? 'text-[#f87171]' : 'text-red-600')}>Change Rate</p>
              <p className={cn('text-2xl font-black', isDark ? 'text-[#fca5a5]' : 'text-red-700')}>{momentum.toFixed(1)}%</p>
            </div>
            <div className={cn('rounded-xl p-3 border', isDark ? 'border-[#0e4a4a] bg-[#042828]' : 'border-teal-200 bg-teal-50/60')}>
              <p className={cn('text-[11px] mb-1', isDark ? 'text-[#5eead4]' : 'text-teal-600')}>Market Power</p>
              <p className={cn('text-2xl font-black', isDark ? 'text-[#99f6e4]' : 'text-teal-700')}>{Math.max(underPct, overPct).toFixed(1)}%</p>
              <p className={cn('text-[10px] uppercase', mutedTextColor)}>{signalDir}</p>
            </div>
          </div>

          {/* Trade panel */}
          {account ? (
            <div className={cn('rounded-xl p-4 mb-4 border', innerCardBorder)} style={{ background: innerCardBg }}>
              <div className="flex items-center gap-2 mb-3">
                <Wallet className={cn('h-4 w-4', isDark ? 'text-emerald-400' : 'text-emerald-600')} />
                <span className={cn('text-sm font-bold', headingColor)}>Place Real Trade</span>
                <span className={cn('ml-auto text-xs font-bold', isDark ? 'text-emerald-300' : 'text-emerald-700')}>
                  Balance: {account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {account.currency}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={cn('mb-1 block text-[11px] font-semibold', subTextColor)}>Stake ({account.currency})</label>
                  <input type="number" min={0.35} step={0.1} value={stake}
                    onChange={(e) => setStake(Math.max(0, parseFloat(e.target.value) || 0))}
                    className={cn('w-full rounded-lg border px-3 py-2 text-sm font-bold outline-none transition-colors',
                      isDark ? 'bg-white/5 border-white/10 text-white focus:border-blue-400' : 'bg-white border-blue-200 text-[#1a2a4a] focus:border-blue-400')} />
                </div>
                <div>
                  <label className={cn('mb-1 block text-[11px] font-semibold', subTextColor)}>Duration (ticks)</label>
                  <input type="number" min={1} max={10} step={1} value={duration}
                    onChange={(e) => setDuration(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    className={cn('w-full rounded-lg border px-3 py-2 text-sm font-bold outline-none transition-colors',
                      isDark ? 'bg-white/5 border-white/10 text-white focus:border-blue-400' : 'bg-white border-blue-200 text-[#1a2a4a] focus:border-blue-400')} />
                </div>
              </div>

              {/* Trade buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleTrade('OVER')}
                  disabled={tradeStatus.loading || stake <= 0}
                  className={cn('flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black text-white transition-all',
                    tradeStatus.loading && tradeSide === 'OVER' ? 'bg-emerald-400' : 'bg-gradient-to-r from-emerald-500 to-green-500 hover:shadow-lg hover:shadow-emerald-500/30',
                    (tradeStatus.loading && tradeSide !== 'OVER') && 'opacity-40',
                    stake <= 0 && 'opacity-50 cursor-not-allowed')}>
                  {tradeStatus.loading && tradeSide === 'OVER' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  OVER {barrier}
                </button>
                <button
                  onClick={() => handleTrade('UNDER')}
                  disabled={tradeStatus.loading || stake <= 0}
                  className={cn('flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black text-white transition-all',
                    tradeStatus.loading && tradeSide === 'UNDER' ? 'bg-cyan-400' : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30',
                    (tradeStatus.loading && tradeSide !== 'UNDER') && 'opacity-40',
                    stake <= 0 && 'opacity-50 cursor-not-allowed')}>
                  {tradeStatus.loading && tradeSide === 'UNDER' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  UNDER {barrier}
                </button>
              </div>

              {/* Trade result */}
              {tradeStatus.result && (
                <div className={cn('mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 border',
                  tradeStatus.result.success
                    ? (isDark ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200')
                    : (isDark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'))}>
                  {tradeStatus.result.success
                    ? <CheckCircle2 className={cn('h-4 w-4 shrink-0 mt-0.5', isDark ? 'text-emerald-400' : 'text-emerald-600')} />
                    : <XCircle className={cn('h-4 w-4 shrink-0 mt-0.5', isDark ? 'text-red-400' : 'text-red-600')} />}
                  <div className="text-xs">
                    {tradeStatus.result.success ? (
                      <>
                        <p className={cn('font-bold', isDark ? 'text-emerald-300' : 'text-emerald-700')}>
                          Trade placed: {tradeSide} {barrier}
                        </p>
                        <p className={isDark ? 'text-emerald-400/70' : 'text-emerald-600'}>
                          Contract ID: {tradeStatus.result.contractId}
                        </p>
                      </>
                    ) : (
                      <p className={cn('font-bold', isDark ? 'text-red-300' : 'text-red-700')}>
                        {tradeStatus.result.error}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={cn('rounded-xl p-4 mb-4 text-center border', innerCardBorder)} style={{ background: innerCardBg }}>
              <p className={cn('text-sm', subTextColor)}>
                Login to your Deriv account to place real trades
              </p>
            </div>
          )}

          {/* Summary */}
          <div className={cn('rounded-xl overflow-hidden border', isDark ? 'border-[#1e3a5f]' : 'border-blue-200')}>
            <div className={cn('py-2 text-center', isDark ? 'bg-[#0f1f4a]' : 'bg-blue-50')}>
              <p className={cn('text-xs font-bold', headingColor)}>Under (0–{barrier - 1}) / Over ({barrier + 1}–9) Analysis</p>
            </div>
            <div className="grid grid-cols-2">
              <div className={cn('p-4 border-r', panelBorder)} style={{ background: isDark ? '#0f1f4a' : '#f8faff' }}>
                <p className={cn('text-xs mb-1', subTextColor)}>Under (0–{barrier - 1})</p>
                <p className="text-2xl font-black text-[#22c55e]">{underPct.toFixed(1)}%</p>
                <p className={cn('text-[11px] mt-1', subTextColor)}>
                  Highest: Digit {hottestUnder} ({digitStats.counts[hottestUnder] ?? 0}x)
                </p>
              </div>
              <div className="p-4" style={{ background: isDark ? '#0f1f4a' : '#f8faff' }}>
                <p className={cn('text-xs mb-1', subTextColor)}>Over ({barrier + 1}–9)</p>
                <p className="text-2xl font-black text-[#22c55e]">{overPct.toFixed(1)}%</p>
                <p className={cn('text-[11px] mt-1', subTextColor)}>
                  Highest: Digit {hottestOver} ({digitStats.counts[hottestOver] ?? 0}x)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
