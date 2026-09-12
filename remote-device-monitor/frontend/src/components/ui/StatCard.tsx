import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color?: 'indigo' | 'emerald' | 'rose' | 'amber' | 'cyan' | 'gray';
  trend?: {
    value: string | number;
    isPositive: boolean;
  };
  onClick?: () => void;
}

const themeStyles: Record<string, { bg: string; text: string; border: string }> = {
  indigo: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'hover:border-indigo-500/40 hover:shadow-[0_0_25px_rgba(99,102,241,0.2)]',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'hover:border-emerald-500/40 hover:shadow-[0_0_25px_rgba(16,185,129,0.2)]',
  },
  rose: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'hover:border-rose-500/40 hover:shadow-[0_0_25px_rgba(244,63,94,0.2)]',
  },
  amber: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'hover:border-amber-500/40 hover:shadow-[0_0_25px_rgba(245,158,11,0.2)]',
  },
  cyan: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'hover:border-cyan-500/40 hover:shadow-[0_0_25px_rgba(6,182,212,0.2)]',
  },
  gray: {
    bg: 'bg-slate-800/50',
    text: 'text-slate-400',
    border: 'hover:border-slate-700',
  },
};

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  color = 'indigo',
  trend,
  onClick,
}) => {
  const theme = themeStyles[color] || themeStyles.indigo;

  return (
    <div
      onClick={onClick}
      className={`glass-card rounded-2xl p-5 flex items-center justify-between transition-all ${theme.border} ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="space-y-1">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
        <p className="text-3xl font-extrabold text-white font-['Outfit'] tracking-tight">{value}</p>
        {trend && (
          <div className="flex items-center space-x-1 pt-1">
            {trend.isPositive ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />
            )}
            <span
              className={`text-xs font-semibold ${
                trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {trend.value}
            </span>
          </div>
        )}
      </div>

      <div className={`p-3.5 rounded-xl border border-white/5 ${theme.bg} ${theme.text}`}>
        {icon}
      </div>
    </div>
  );
};

export default StatCard;
