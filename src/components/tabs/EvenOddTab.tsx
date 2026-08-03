import { useState } from 'react';
import { Minus } from 'lucide-react';
import { Card, Badge, Progress } from '@/components/ui';
import { computeEvenOddStats, computeStreaks } from '@/lib/analysis';
import { cn } from '@/lib/utils';

type Props = { digits: number[]; currentDigit: number };

export function EvenOddTab({ digits, currentDigit }: Props) {
  const [lookback, setLookback] = useState(100);
  const slice = digits.slice(-lookback);
  const stats = computeEvenOddStats(slice);
  const streaks = computeStreaks(slice);
  const lastDigits = slice.slice(-25).reverse();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-[#1a2a4a]">Even / Odd Analysis</h2>
        <p className="mt-1 text-sm text-[#7a8aaa]">Predict whether the next digit will be even or odd.</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[#5a6a8a]">Lookback</span>
        <select
          value={lookback}
          onChange={(e) => setLookback(Number(e.target.value))}
          className="rounded-xl border border-blue-200/40 bg-white/70 px-3 py-1.5 text-sm font-medium text-[#3a4a6a] backdrop-blur-md"
        >
          {[50, 100, 150, 200].map((n) => (
            <option key={n} value={n}>{n} ticks</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#5a6a8a]">Even Digits</p>
              <p className="text-xs text-[#9aaaba]">0, 2, 4, 6, 8 — Expected 50%</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-violet-500">{stats.evenPercent.toFixed(1)}%</p>
              <p className="text-xs text-[#9aaaba]">{stats.evenCount} ticks</p>
            </div>
          </div>
          <Progress value={stats.evenPercent} className="mt-4" indicatorClassName="from-violet-500 to-purple-400" />
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#5a6a8a]">Odd Digits</p>
              <p className="text-xs text-[#9aaaba]">1, 3, 5, 7, 9 — Expected 50%</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-orange-500">{stats.oddPercent.toFixed(1)}%</p>
              <p className="text-xs text-[#9aaaba]">{stats.oddCount} ticks</p>
            </div>
          </div>
          <Progress value={stats.oddPercent} className="mt-4" indicatorClassName="from-orange-500 to-amber-400" />
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Longest Even Streak', value: streaks.longestEven, color: 'text-violet-500' },
          { label: 'Longest Odd Streak', value: streaks.longestOdd, color: 'text-orange-500' },
          { label: 'Total Ticks', value: slice.length, color: 'text-[#1a2a4a]' },
          { label: 'Current Digit', value: currentDigit, color: 'text-blue-500' },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <p className="text-xs font-medium text-[#7a8aaa]">{s.label}</p>
            <p className={cn('mt-1 text-2xl font-bold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-[#1a2a4a]">Recent Digits <span className="text-xs font-normal text-[#9aaaba]">(latest first)</span></h3>
        <div className="flex flex-wrap gap-2">
          {lastDigits.length === 0 && <p className="text-sm text-[#9aaaba]">Waiting for data…</p>}
          {lastDigits.map((d, i) => (
            <div
              key={i}
              className={cn(
                'digit-bubble h-10 w-10 text-sm',
                d % 2 === 0 ? 'even' : 'odd',
                i === 0 && 'current'
              )}
            >
              {d}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-[#1a2a4a]">Signal</h3>
        <div className="flex items-center gap-4">
          {stats.evenPercent > 55 ? (
            <Badge className="bg-violet-100/60 text-violet-700">Even favored ({(stats.evenPercent - 50).toFixed(1)}% above expected)</Badge>
          ) : stats.oddPercent > 55 ? (
            <Badge className="bg-orange-100/60 text-orange-600">Odd favored ({(stats.oddPercent - 50).toFixed(1)}% above expected)</Badge>
          ) : (
            <Badge className="bg-gray-100/60 text-[#7a8aaa]"><Minus className="h-3 w-3" /> Neutral — even/odd near balanced</Badge>
          )}
          <span className="text-xs text-[#9aaaba]">Signal triggers when deviation exceeds 5%.</span>
        </div>
      </Card>
    </div>
  );
}
