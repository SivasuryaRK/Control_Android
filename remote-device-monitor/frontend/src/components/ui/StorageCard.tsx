import React from 'react';
import { HardDrive, Database } from 'lucide-react';

export interface StorageCardProps {
  label?: string;
  usedPercentage: number; // percentage 0-100
  usedGb?: number;
  totalGb?: number;
  onClick?: () => void;
}

const StorageCard: React.FC<StorageCardProps> = ({
  label = 'Storage Allocation',
  usedPercentage,
  usedGb = 83.2,
  totalGb = 128,
  onClick,
}) => {
  const freeGb = (totalGb - usedGb).toFixed(1);

  return (
    <div
      onClick={onClick}
      className={`glass-card rounded-2xl p-5 flex flex-col justify-between ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
          <HardDrive className="h-5 w-5" />
        </div>
      </div>

      <div className="flex items-baseline space-x-2 mb-3">
        <span className="text-3xl font-extrabold text-white font-['Outfit']">{usedPercentage}%</span>
        <span className="text-xs text-slate-400 font-medium">Used</span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden border border-slate-700/50 mb-4">
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${
            usedPercentage > 90
              ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]'
              : usedPercentage > 75
              ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
              : 'bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.5)]'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, usedPercentage))}%` }}
        />
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
        <div className="flex items-center space-x-1.5">
          <Database className="h-3.5 w-3.5 text-cyan-400" />
          <span>{usedGb} / {totalGb} GB</span>
        </div>
        <div className="text-right font-semibold text-emerald-400">
          {freeGb} GB Free
        </div>
      </div>
    </div>
  );
};

export default StorageCard;
