import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Card, Badge, Progress } from '@/components/ui';
import { computeMatchesStats } from '@/lib/analysis';
import { cn } from '@/lib/utils';

type Props = { digits: number[]; currentDigit: number };

export function MatchesTab({ digits, currentDigit }: Props) {
  const [lookback, setLookback] = useState(100);
  const slice = digits.slice(-lookback);
  const m = computeMatchesStats(slice);
  const lastDigit = slice.length > 0 ? slice[slice.length - 1] : 0;
  const lastDigitCount = m.stats.counts[lastDigit];
  const lastDigitPercent = m.stats.percents[lastDigit];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-[#1a2a4a]">Matches Analysis</h2>
        <p className="mt-1 text-sm text-[#7a8aaa]">Predict whether the next digit will match the previous digit.</p>
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

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium text-[#7a8aaa]">Match Rate</p>
          <p className="mt-1 text-3xl font-bold text-blue-500">{m.matchPercent.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-[#9aaaba]">Expected: {m.expectedMatchPercent}%</p>
          <Progress value={m.matchPercent} className="mt-3" />
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-[#7a8aaa]">Total Matches</p>
          <p className="mt-1 text-3xl font-bold text-green-600">{m.matchCount}</p>
          <p className="mt-1 text-xs text-[#9aaaba]">out of {m.totalPairs} pairs</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-[#7a8aaa]">Last Digit</p>
          <p className="mt-1 text-3xl font-bold text-[#1a2a4a]">{lastDigit}</p>
          <p className="mt-1 text-xs text-[#9aaaba]">{lastDigitPercent.toFixed(1)}% ({lastDigitCount}x)</p>
        </Card>
      </div>

      {/* Digit frequency */}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-bold text-[#1a2a4a]">Digit Frequency Distribution</h3>
        <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
          {m.stats.counts.map((count, digit) => (
            <div key={digit} className="text-center">
              <div
                className={cn(
                  'digit-bubble mx-auto h-14 w-14 text-lg',
                  digit === lastDigit && 'current'
                )}
              >
                {digit}
              </div>
              <p className="mt-1 text-xs text-[#7a8aaa]">{count}</p>
              <p className="text-[10px] text-[#9aaaba]">{m.stats.percents[digit].toFixed(1)}%</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent pairs */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-[#1a2a4a]">Recent Digit Pairs <span className="text-xs font-normal text-[#9aaaba]">(latest first)</span></h3>
        <div className="space-y-1.5">
          {m.recentPairs.length === 0 && <p className="text-sm text-[#9aaaba]">Waiting for data…</p>}
          {m.recentPairs.map((pair, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2',
                pair.match ? 'bg-green-50/60' : 'bg-gray-50/60'
              )}
            >
              <div className="flex items-center gap-1">
                <span className="digit-bubble h-7 w-7 text-xs">{pair.a}</span>
                <span className="text-[#9aaaba]">→</span>
                <span className="digit-bubble h-7 w-7 text-xs">{pair.b}</span>
              </div>
              {pair.match ? (
                <Badge className="bg-green-100/60 text-green-700"><Check className="h-3 w-3" /> Match</Badge>
              ) : (
                <Badge className="bg-gray-100/60 text-[#7a8aaa]"><X className="h-3 w-3" /> No match</Badge>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Signal */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-[#1a2a4a]">Signal</h3>
        <div className="flex items-center gap-4">
          {m.matchPercent > m.expectedMatchPercent + 3 ? (
            <Badge className="bg-green-100/60 text-green-700"><Check className="h-3 w-3" /> Matches more frequent than expected</Badge>
          ) : m.matchPercent < m.expectedMatchPercent - 3 ? (
            <Badge className="bg-red-100/60 text-red-600"><X className="h-3 w-3" /> Matches less frequent than expected</Badge>
          ) : (
            <Badge className="bg-gray-100/60 text-[#7a8aaa]">Neutral — matches near expected rate</Badge>
          )}
          <span className="text-xs text-[#9aaaba]">Current digit {lastDigit} has a {lastDigitPercent.toFixed(1)}% frequency.</span>
        </div>
      </Card>
    </div>
  );
}
