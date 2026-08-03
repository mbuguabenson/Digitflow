import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({
  children,
  className,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div className={cn(hover ? 'glass' : 'glass-static', className)}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        className
      )}
    >
      {children}
    </span>
  );
}

export function Progress({
  value,
  className,
  indicatorClassName,
  height = 'h-2',
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
  height?: string;
}) {
  return (
    <div
      className={cn(
        height,
        'w-full overflow-hidden rounded-full',
        'bg-blue-100/60',
        className
      )}
    >
      <div
        className={cn(
          'h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500',
          indicatorClassName
        )}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

export function RingGauge({
  value,
  size = 120,
  strokeWidth = 10,
  color = '#3b7ef8',
  trackColor = 'rgba(180,200,255,0.25)',
  children,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(Math.max(value, 0), 100) / 100) * circ;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        style={{ display: 'block' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

export function SectionTitle({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <h3 className="mb-4 flex items-center gap-2 text-[15px] font-700 text-[#1a2a4a]">
      {icon && (
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-400/20">
          {icon}
        </span>
      )}
      {children}
    </h3>
  );
}
