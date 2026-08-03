import { useState } from 'react';
import { Brain, TrendingUp, TrendingDown, Activity, Zap, Target } from 'lucide-react';
import { Card, Badge, Progress } from '@/components/ui';
import { computeAIAnalysis } from '@/lib/analysis';
import { cn } from '@/lib/utils';

type Props = { digits: number[]; currentDigit: number };

const confidenceStyles = {
  high: 'bg-green-100/60 text-green-700',
  medium: 'bg-yellow-100/60 text-yellow-700',
  low: 'bg-gray-100/60 text-[#7a8aaa]',
};

const strengthStyles = {
  strong: 'bg-red-100/60 text-red-600',
  moderate: 'bg-yellow-100/60 text-yellow-700',
  weak: 'bg-gray-100/60 text-[#7a8aaa]',
};

export function AIAnalysisTab({ digits, currentDigit }: Props) {
  const [lookback, setLookback] = useState(100);
  const slice = digits.slice(-lookback);
  const ai = computeAIAnalysis(slice);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/30">
          <Brain className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-[#1a2a4a]">AI Analysis</h2>
          <p className="text-sm text-[#7a8aaa]">Comprehensive statistical analysis combining all digit patterns and predictions.</p>
        </div>
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

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { icon: Activity, color: 'text-blue-500', bg: 'bg-blue-100/60', label: 'Entropy', value: `${ai.normalizedEntropy.toFixed(1)}%`, sub: '100% = perfectly random' },
          { icon: Target, color: 'text-green-500', bg: 'bg-green-100/60', label: 'Mean Digit', value: ai.mean.toFixed(2), sub: 'Expected: 4.50' },
          { icon: Zap, color: 'text-orange-500', bg: 'bg-orange-100/60', label: 'Std Deviation', value: ai.stdDev.toFixed(2), sub: 'Expected: ~2.87' },
          {
            icon: ai.trend > 0 ? TrendingUp : TrendingDown,
            color: ai.trend > 0 ? 'text-green-500' : 'text-red-500',
            bg: ai.trend > 0 ? 'bg-green-100/60' : 'bg-red-100/60',
            label: 'Trend',
            value: `${ai.trend > 0 ? '+' : ''}${ai.trend.toFixed(2)}`,
            sub: '2nd half vs 1st half avg',
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="stat-card">
              <div className="flex items-center gap-2">
                <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', s.bg)}>
                  <Icon className={cn('h-4 w-4', s.color)} />
                </span>
                <p className="text-xs font-medium text-[#7a8aaa]">{s.label}</p>
              </div>
              <p className="mt-2 text-2xl font-bold text-[#1a2a4a]">{s.value}</p>
              <p className="text-[10px] text-[#9aaaba]">{s.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Predictions */}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-bold text-[#1a2a4a]">AI Predictions</h3>
        <div className="space-y-3">
          {ai.predictions.length === 0 && <p className="text-sm text-[#9aaaba]">Need at least 20 ticks for predictions…</p>}
          {ai.predictions.map((pred, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-white/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="digit-bubble h-10 w-10 text-lg current">{pred.digit}</div>
                <div>
                  <p className="text-sm font-semibold text-[#1a2a4a]">Next digit likely: {pred.digit}</p>
                  <p className="text-xs text-[#7a8aaa]">{pred.reason}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#1a2a4a]">{pred.probability.toFixed(1)}%</span>
                <Badge className={confidenceStyles[pred.confidence]}>{pred.confidence}</Badge>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-xl bg-white/50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="digit-bubble h-10 w-10 text-sm even">E/O</div>
              <div>
                <p className="text-sm font-semibold text-[#1a2a4a]">Even: {ai.evenOdd.evenPercent.toFixed(1)}% / Odd: {ai.evenOdd.oddPercent.toFixed(1)}%</p>
                <p className="text-xs text-[#7a8aaa]">{ai.evenOdd.evenPercent > 50 ? 'Even bias detected' : 'Odd bias detected'}</p>
              </div>
            </div>
            <Badge className={confidenceStyles[ai.evenConfidence]}>{ai.evenConfidence}</Badge>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="digit-bubble h-10 w-10 text-sm over">O/U</div>
              <div>
                <p className="text-sm font-semibold text-[#1a2a4a]">Over 5: {ai.ou5.overPercent.toFixed(1)}% / Under 5: {ai.ou5.underPercent.toFixed(1)}%</p>
                <p className="text-xs text-[#7a8aaa]">{ai.ou5.overPercent > 50 ? 'Over bias detected' : 'Under bias detected'}</p>
              </div>
            </div>
            <Badge className={confidenceStyles[ai.ouConfidence]}>{ai.ouConfidence}</Badge>
          </div>
        </div>
      </Card>

      {/* Patterns */}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-bold text-[#1a2a4a]">Detected Patterns</h3>
        {ai.patterns.length === 0 ? (
          <p className="text-sm text-[#9aaaba]">No significant patterns detected in current data window.</p>
        ) : (
          <div className="space-y-2">
            {ai.patterns.map((p, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl bg-white/50 px-4 py-3">
                <Badge className={strengthStyles[p.strength]}>{p.strength}</Badge>
                <div>
                  <p className="text-sm font-semibold text-[#1a2a4a]">{p.name}</p>
                  <p className="text-xs text-[#7a8aaa]">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Digit distribution */}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-bold text-[#1a2a4a]">Digit Distribution</h3>
        <div className="space-y-2">
          {ai.stats.counts.map((count, digit) => (
            <div key={digit} className="flex items-center gap-3">
              <span className="w-6 text-sm font-bold text-[#5a6a8a]">{digit}</span>
              <div className="flex-1">
                <Progress
                  value={ai.stats.percents[digit]}
                  indicatorClassName={cn(
                    digit === ai.hottestDigit ? 'from-orange-500 to-amber-400' :
                    digit === ai.coldestDigit ? 'from-blue-500 to-cyan-400' :
                    'from-gray-400 to-gray-300'
                  )}
                />
              </div>
              <span className="w-20 text-right text-xs text-[#7a8aaa]">{ai.stats.percents[digit].toFixed(1)}% ({count})</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-orange-500" /> Hottest: {ai.hottestDigit} ({ai.maxPercent.toFixed(1)}%)</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-blue-500" /> Coldest: {ai.coldestDigit} ({ai.minPercent.toFixed(1)}%)</span>
        </div>
      </Card>

      {/* Cross-analysis summary */}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-bold text-[#1a2a4a]">Cross-Analysis Summary</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: 'Match Rate', value: `${ai.matches.matchPercent.toFixed(1)}%` },
            { label: 'Differ Rate', value: `${ai.differs.differPercent.toFixed(1)}%` },
            { label: 'Current Streak', value: `${ai.streaks.currentStreak.current}x digit ${ai.streaks.currentStreak.digitValue}` },
            { label: 'Even Rate', value: `${ai.evenOdd.evenPercent.toFixed(1)}%` },
            { label: 'Over 5 Rate', value: `${ai.ou5.overPercent.toFixed(1)}%` },
            { label: 'Total Ticks', value: String(slice.length) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-white/50 p-3">
              <p className="text-xs text-[#7a8aaa]">{s.label}</p>
              <p className="text-lg font-bold text-[#1a2a4a]">{s.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
