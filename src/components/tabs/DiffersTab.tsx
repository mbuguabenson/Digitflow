import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Card, Badge, Progress } from '@/components/ui';
import { computeDiffersStats } from '@/lib/analysis';
import { cn } from '@/lib/utils';

type Props = { digits: number[]; currentDigit: number };

export function DiffersTab({ digits, currentDigit }: Props) {
  const [lookback, setLookback] = useState(100);
  const slice = digits.slice(-lookback);
  const d = computeDiffersStats(slice);
  const lastDigit = slice.length > 0 ? slice[slice.length - 1] : 0;
  const lastDigitDiffers = d.digitNextDiffers[lastDigit];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-[#1a2a4a]">Differs Analysis</h2>
        <p className="mt-1 text-sm text-[#7a8aaa]">Predict whether the next digit will differ from the previous digit.</p>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium text-[#7a8aaa]">Differ Rate</p>
          <p className="mt-1 text-3xl font-bold text-blue-500">{d.differPercent.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-[#9aaaba]">Expected: {d.expectedDifferPercent}%</p>
          <Progress value={d.differPercent} className="mt-3" />
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-[#7a8aaa]">Total Differs</p>
          <p className="mt-1 text-3xl font-bold text-green-600">{d.differCount}</p>
          <p className="mt-1 text-xs text-[#9aaaba]">out of {d.totalPairs} pairs</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-[#7a8aaa]">Last Digit</p>
          <p className="mt-1 text-3xl font-bold text-[#1a2a4a]">{lastDigit}</p>
          <p className="mt-1 text-xs text-[#9aaaba]">Next differs {lastDigitDiffers?.percent.toFixed(1) ?? '0'}%</p>
        </Card>
      </div>

      {/* Per-digit probability */}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-bold text-[#1a2a4a]">Per-Digit "Next Differs" Probability</h3>
        <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
          {Array.from({ length: 10 }, (_, digit) => {
            const info = d.digitNextDiffers[digit];
            return (
              <div key={digit} className="text-center">
                <div className={cn('digit-bubble mx-auto h-14 w-14 text-lg', digit === lastDigit && 'current')}>
                  {digit}
                </div>
                <p className="mt-1 text-xs font-semibold text-[#5a6a8a]">{info.percent.toFixed(0)}%</p>
                <p className="text-[10px] text-[#9aaaba]">{info.differs}/{info.total}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Recent transitions */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-[#1a2a4a]">Recent Transitions <span className="text-xs font-normal text-[#9aaaba]">(latest first)</span></h3>
        <div className="space-y-1.5">
          {d.recentTransitions.length === 0 && <p className="text-sm text-[#9aaaba]">Waiting for data…</p>}
          {d.recentTransitions.map((t, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2',
                t.differs ? 'bg-green-50/60' : 'bg-red-50/60'
              )}
            >
              <div className="flex items-center gap-1">
                <span className="digit-bubble h-7 w-7 text-xs">{t.from}</span>
                <span className="text-[#9aaaba]">→</span>
                <span className="digit-bubble h-7 w-7 text-xs">{t.to}</span>
              </div>
              {t.differs ? (
                <Badge className="bg-green-100/60 text-green-700"><Check className="h-3 w-3" /> Differs</Badge>
              ) : (
                <Badge className="bg-red-100/60 text-red-600"><X className="h-3 w-3" /> Same</Badge>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Signal */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-[#1a2a4a]">Signal</h3>
        <div className="flex items-center gap-4">
          {d.differPercent > d.expectedDifferPercent + 3 ? (
            <Badge className="bg-green-100/60 text-green-700"><Check className="h-3 w-3" /> Differs more frequent than expected</Badge>
          ) : d.differPercent < d.expectedDifferPercent - 3 ? (
            <Badge className="bg-red-100/60 text-red-600"><X className="h-3 w-3" /> Differs less frequent than expected</Badge>
          ) : (
            <Badge className="bg-gray-100/60 text-[#7a8aaa]">Neutral — differs near expected rate</Badge>
          )}
          <span className="text-xs text-[#9aaaba]">After digit {lastDigit}, the next digit differs {lastDigitDiffers?.percent.toFixed(1) ?? '0'}% of the time.</span>
        </div>
      </Card>
    </div>
  );
}
