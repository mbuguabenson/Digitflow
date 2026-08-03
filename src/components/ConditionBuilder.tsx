import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type ConditionRule, type ConditionField, type Comparator, type TradeAction,
  FIELD_LABELS, COMPARATOR_LABELS, ACTION_LABELS, createDefaultRule,
} from '@/lib/trade-conditions';

type Props = {
  rules: ConditionRule[];
  onChange: (rules: ConditionRule[]) => void;
  action: TradeAction;
  onActionChange: (action: TradeAction) => void;
  availableActions: TradeAction[];
  availableFields: ConditionField[];
  isDark: boolean;
  barrier: number;
  targetDigit: number;
};

const MATCH_TYPES: { value: string; label: string }[] = [
  { value: 'even', label: 'Even' },
  { value: 'odd', label: 'Odd' },
  { value: 'over', label: 'Over' },
  { value: 'under', label: 'Under' },
  { value: 'rise', label: 'Rising' },
  { value: 'fall', label: 'Falling' },
  { value: 'digit', label: `Digit` },
];

export function ConditionBuilder({
  rules, onChange, action, onActionChange,
  availableActions, availableFields, isDark, barrier, targetDigit,
}: Props) {
  const td = isDark ? 'text-slate-300' : 'text-gray-700';
  const inputCls = cn(
    'rounded border px-1.5 py-1 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-400/30',
    isDark ? 'bg-white/10 border-white/20 text-white' : 'bg-white border-gray-300 text-gray-800'
  );
  const selectCls = cn(inputCls, 'cursor-pointer appearance-none');

  const addRule = () => {
    onChange([...rules, createDefaultRule(availableFields[0], 50)]);
  };

  const removeRule = (id: string) => {
    onChange(rules.filter((r) => r.id !== id));
  };

  const updateRule = (id: string, patch: Partial<ConditionRule>) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const cardBg = isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200';
  const tagCls = isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700';
  const thenCls = isDark ? 'bg-green-600/30 text-green-300' : 'bg-green-100 text-green-700';

  return (
    <div className={cn('rounded-xl p-3 text-xs space-y-2.5 border', cardBg)}>
      <div className="flex items-center justify-between">
        <div className={cn('text-[10px] font-bold uppercase tracking-wide', isDark ? 'text-slate-400' : 'text-gray-400')}>
          Trading Conditions
        </div>
        <button
          onClick={addRule}
          className={cn(
            'flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors',
            isDark ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          )}
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {/* Rules */}
      <div className="space-y-2">
        {rules.length === 0 && (
          <div className={cn('text-center py-2 text-[11px]', isDark ? 'text-slate-500' : 'text-gray-400')}>
            No conditions — click "Add" to create one
          </div>
        )}
        {rules.map((rule, idx) => {
          const needsMatchType = rule.field === 'lastNMatch' || rule.field === 'streakLen';
          const needsMatchN = rule.field === 'lastNMatch';
          const matchTypeLabel = rule.matchType === 'digit' ? `Digit ${targetDigit}` : rule.matchType === 'over' ? `Over ${barrier}` : rule.matchType === 'under' ? `Under ${barrier}` : MATCH_TYPES.find((m) => m.value === rule.matchType)?.label ?? 'Even';

          return (
            <div key={rule.id} className={cn('flex flex-wrap items-center gap-1.5 rounded-lg p-2', isDark ? 'bg-white/5' : 'bg-white')}>
              <span className={cn('flex items-center gap-0.5 text-[10px] font-bold', isDark ? 'text-slate-500' : 'text-gray-400')}>
                <GripVertical className="h-3 w-3" />{idx === 0 ? 'if' : 'and'}
              </span>

              {/* Field selector */}
              <select
                value={rule.field}
                onChange={(e) => updateRule(rule.id, { field: e.target.value as ConditionField })}
                className={selectCls}
              >
                {availableFields.map((f) => (
                  <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                ))}
              </select>

              {/* Match type (for lastNMatch / streakLen) */}
              {needsMatchType && (
                <select
                  value={rule.matchType ?? 'even'}
                  onChange={(e) => updateRule(rule.id, { matchType: e.target.value as ConditionRule['matchType'] })}
                  className={selectCls}
                >
                  {MATCH_TYPES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              )}

              {/* Match N (for lastNMatch) */}
              {needsMatchN && (
                <>
                  <span className={td}>last</span>
                  <input
                    type="number" min={1} max={50} value={rule.matchN ?? 3}
                    onChange={(e) => updateRule(rule.id, { matchN: parseInt(e.target.value) || 1 })}
                    className={cn(inputCls, 'w-10 text-center')}
                  />
                  <span className={td}>ticks</span>
                </>
              )}

              {/* Comparator */}
              {!needsMatchN && (
                <select
                  value={rule.comparator}
                  onChange={(e) => updateRule(rule.id, { comparator: e.target.value as Comparator })}
                  className={cn(selectCls, 'w-12 text-center')}
                >
                  {(Object.keys(COMPARATOR_LABELS) as Comparator[]).map((c) => (
                    <option key={c} value={c}>{COMPARATOR_LABELS[c]}</option>
                  ))}
                </select>
              )}

              {/* Value input */}
              {!needsMatchN && (
                <>
                  <input
                    type="number" min={0} max={100} step={1} value={rule.value}
                    onChange={(e) => updateRule(rule.id, { value: parseFloat(e.target.value) || 0 })}
                    className={cn(inputCls, 'w-14 text-center')}
                  />
                  <span className={td}>%</span>
                </>
              )}

              {/* Match type label (read-only display for lastNMatch) */}
              {needsMatchN && (
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', tagCls)}>
                  {matchTypeLabel}
                </span>
              )}

              {/* Delete button */}
              <button
                onClick={() => removeRule(rule.id)}
                className={cn(
                  'ml-auto flex h-6 w-6 items-center justify-center rounded-md transition-colors',
                  isDark ? 'text-red-400 hover:bg-red-500/20' : 'text-red-500 hover:bg-red-100'
                )}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Action selector */}
      <div className="flex items-center gap-2 pt-1 border-t border-current/10">
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', thenCls)}>Then</span>
        <select
          value={action}
          onChange={(e) => onActionChange(e.target.value as TradeAction)}
          className={cn(selectCls, 'flex-1')}
        >
          {availableActions.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
