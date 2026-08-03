import { useState, useEffect, useRef } from 'react';
import { ChevronDown, LogOut, RefreshCw, Check, Sparkles } from 'lucide-react';
import type { Account, AccountInfo } from '@/hooks/useDerivAuth';
import { cn } from '@/lib/utils';

export function USFlag3DIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={cn('shrink-0 shadow-md rounded-sm', className)} viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="24" rx="3" fill="#B22234" />
      <path d="M0 3.69H32M0 7.38H32M0 11.08H32M0 14.77H32M0 18.46H32M0 22.15H32" stroke="white" strokeWidth="1.85" />
      <rect width="14" height="13" rx="2" fill="#3C3B6E" />
      <circle cx="3.5" cy="3.5" r="0.7" fill="white" />
      <circle cx="7.5" cy="3.5" r="0.7" fill="white" />
      <circle cx="11.5" cy="3.5" r="0.7" fill="white" />
      <circle cx="5.5" cy="6.5" r="0.7" fill="white" />
      <circle cx="9.5" cy="6.5" r="0.7" fill="white" />
      <circle cx="3.5" cy="9.5" r="0.7" fill="white" />
      <circle cx="7.5" cy="9.5" r="0.7" fill="white" />
      <circle cx="11.5" cy="9.5" r="0.7" fill="white" />
    </svg>
  );
}

export function DemoDIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <div className={cn('relative flex items-center justify-center font-black rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/30 border border-amber-300/40 shrink-0', className)}>
      <span className="text-[11px] leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">D</span>
    </div>
  );
}

type Props = {
  account: Account;
  accounts: AccountInfo[];
  selectAccount: (loginid: string) => Promise<void>;
  logout: () => void;
  refreshBalance: () => Promise<void>;
  isDark: boolean;
};

export function AccountDropdownCard({
  account,
  accounts,
  selectAccount,
  logout,
  refreshBalance,
  isDark,
}: Props) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // Ensure active account is included in accounts array if raw API returned single item
  const displayAccounts = accounts.length > 0 ? accounts : [{
    loginid: account.loginid,
    currency: account.currency,
    balance: account.balance,
    isVirtual: account.isVirtual,
    isActive: true,
  }];

  const realAccounts = displayAccounts.filter((a) => !a.isVirtual);
  const demoAccounts = displayAccounts.filter((a) => a.isVirtual);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    await refreshBalance();
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Account Button Card */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2.5 rounded-full px-3.5 py-1.5 backdrop-blur-xl border transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02]',
          account.isVirtual
            ? isDark
              ? 'bg-amber-500/10 border-amber-400/30 text-amber-200 hover:bg-amber-500/20'
              : 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-300/60 text-amber-900 hover:bg-amber-500/20'
            : isDark
              ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/20'
              : 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-300/60 text-emerald-900 hover:bg-emerald-500/20'
        )}
      >
        {/* Account Icon */}
        {account.isVirtual ? <DemoDIcon className="h-5 w-5" /> : <USFlag3DIcon className="h-5 w-5" />}

        {/* Account Details */}
        <div className="flex flex-col items-start text-left leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold tracking-tight opacity-90">{account.loginid}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider',
                account.isVirtual
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-emerald-500 text-white shadow-xs'
              )}
            >
              {account.isVirtual ? 'Demo' : 'Real'}
            </span>
          </div>
          <span className="text-xs font-black tabular-nums">
            {account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {account.currency}
          </span>
        </div>

        <ChevronDown
          className={cn('h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ml-1', open && 'rotate-180')}
        />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          className={cn(
            'absolute right-0 top-full mt-2.5 w-72 rounded-2xl border p-3 shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150',
            isDark
              ? 'bg-[#0f172a]/95 border-slate-700/60 text-slate-100'
              : 'bg-white/95 border-slate-200/80 text-slate-900'
          )}
        >
          {/* Header row */}
          <div className="flex items-center justify-between px-2 pb-2.5 border-b border-slate-200/30 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-bold uppercase tracking-wider opacity-70">Trading Accounts</span>
            </div>
            <button
              onClick={handleRefresh}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg border transition-all hover:rotate-180 duration-500',
                isDark ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700' : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
              title="Refresh Balance"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            </button>
          </div>

          {/* Account Lists */}
          <div className="py-2 space-y-3 max-h-[320px] overflow-y-auto">
            {/* Real Accounts */}
            {realAccounts.length > 0 && (
              <div>
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                  Real Accounts
                </p>
                <div className="space-y-1">
                  {realAccounts.map((acc) => {
                    const isSelected = acc.loginid === account.loginid;
                    return (
                      <button
                        key={acc.loginid}
                        onClick={async () => {
                          await selectAccount(acc.loginid);
                          setOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium transition-all',
                          isSelected
                            ? isDark
                              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                            : isDark
                              ? 'hover:bg-slate-800/60 text-slate-300'
                              : 'hover:bg-slate-100 text-slate-700'
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <USFlag3DIcon className="h-4 w-4" />
                          <div>
                            <p className="font-bold">{acc.loginid}</p>
                            <p className="text-[11px] opacity-75 tabular-nums">
                              {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {acc.currency}
                            </p>
                          </div>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-emerald-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Demo Accounts */}
            {demoAccounts.length > 0 && (
              <div>
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">
                  Demo Accounts
                </p>
                <div className="space-y-1">
                  {demoAccounts.map((acc) => {
                    const isSelected = acc.loginid === account.loginid;
                    return (
                      <button
                        key={acc.loginid}
                        onClick={async () => {
                          await selectAccount(acc.loginid);
                          setOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium transition-all',
                          isSelected
                            ? isDark
                              ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                              : 'bg-amber-50 border border-amber-200 text-amber-800'
                            : isDark
                              ? 'hover:bg-slate-800/60 text-slate-300'
                              : 'hover:bg-slate-100 text-slate-700'
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <DemoDIcon className="h-4 w-4" />
                          <div>
                            <p className="font-bold">{acc.loginid}</p>
                            <p className="text-[11px] opacity-75 tabular-nums">
                              {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {acc.currency}
                            </p>
                          </div>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-amber-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Logout Section */}
          <div className="pt-2 border-t border-slate-200/30 dark:border-slate-800">
            <button
              onClick={() => {
                logout();
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all',
                isDark
                  ? 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25'
                  : 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
              )}
            >
              <LogOut className="h-3.5 w-3.5" />
              Log Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
