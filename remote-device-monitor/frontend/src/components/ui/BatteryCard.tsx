import React from 'react';
import { BatteryLow, BatteryMedium, BatteryFull, Zap, Thermometer, Gauge } from 'lucide-react';

export interface BatteryCardProps {
  label?: string;
  value?: number | null; // percentage 0-100 or null
  charging?: boolean;
  temperature?: number; // degrees C
  voltage?: number; // mV
  onClick?: () => void;
}

const BatteryCard: React.FC<BatteryCardProps> = ({
  label = 'Fleet Battery Health',
  value = null,
  charging = false,
  temperature = 0,
  voltage = 0,
  onClick,
}) => {
  const hasValue = value !== undefined && value !== null && !isNaN(Number(value));
  const displayValue = hasValue ? Math.max(0, Math.min(100, Math.round(Number(value)))) : null;

  const getIcon = () => {
    if (charging) return <Zap className="h-5 w-5 text-amber-400 animate-pulse" />;
    if (displayValue === null) return <BatteryMedium className="h-5 w-5 text-slate-400" />;
    if (displayValue <= 20) return <BatteryLow className="h-5 w-5 text-rose-400" />;
    if (displayValue <= 50) return <BatteryMedium className="h-5 w-5 text-amber-400" />;
    return <BatteryFull className="h-5 w-5 text-emerald-400" />;
  };

  const getProgressColor = () => {
    if (displayValue === null) return 'bg-slate-700';
    if (charging) return 'bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]';
    if (displayValue <= 20) return 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]';
    if (displayValue <= 50) return 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]';
    return 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]';
  };

  const displayTemp = temperature && !isNaN(Number(temperature)) ? Number(temperature).toFixed(1) : '—';
  const displayVoltage = voltage && !isNaN(Number(voltage)) && Number(voltage) > 0
    ? (Number(voltage) / 1000).toFixed(2)
    : '—';

  return (
    <div
      onClick={onClick}
      className={`glass-card rounded-2xl p-5 flex flex-col justify-between ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60">
          {getIcon()}
        </div>
      </div>

      <div className="flex items-baseline space-x-2 mb-3">
        <span className="text-3xl font-extrabold text-white font-['Outfit']">
          {displayValue !== null ? `${displayValue}%` : '—'}
        </span>
        {charging ? (
          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
            Charging ⚡
          </span>
        ) : (
          <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
            Discharging
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden border border-slate-700/50 mb-4">
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${getProgressColor()}`}
          style={{ width: `${Math.min(100, Math.max(0, displayValue ?? 0))}%` }}
        />
      </div>

      {/* Telemetry Stats */}
      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
        <div className="flex items-center space-x-1.5">
          <Thermometer className="h-3.5 w-3.5 text-indigo-400" />
          <span>{displayTemp}°C</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <Gauge className="h-3.5 w-3.5 text-indigo-400" />
          <span>{displayVoltage} V</span>
        </div>
      </div>
    </div>
  );
};

export default BatteryCard;
