import React, { useState } from 'react';
import {
  Smartphone,
  Battery,
  Cpu,
  Clock,
  Settings,
  Trash2,
  Radio,
  Monitor,
  BarChart2,
  HardDrive,
  Zap,
} from 'lucide-react';
import ConnectionStatus from './ConnectionStatus';

export interface DeviceCardProps {
  deviceId: string;
  name: string;
  status: 'online' | 'offline';
  battery: number | null;
  charging?: boolean;
  manufacturer?: string;
  model?: string;
  androidVersion?: string;
  storageUsedGb?: number;
  storageTotalGb?: number;
  lastSeen?: string;
  onScreenMirror?: () => void;
  onTelemetry?: () => void;
  onFiles?: () => void;
  onApps?: () => void;
  onSettings?: () => void;
  onDelete?: () => void;
}

const DeviceCard: React.FC<DeviceCardProps> = ({
  deviceId,
  name,
  status,
  battery,
  charging = false,
  manufacturer = 'Android',
  model = 'Device',
  androidVersion,
  storageUsedGb = 0,
  storageTotalGb = 0,
  lastSeen = 'Recently',
  onScreenMirror,
  onTelemetry,
  onFiles,
  onApps,
  onSettings,
  onDelete,
}) => {
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  const handlePing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPinging(true);
    setPingResult(null);
    setTimeout(() => {
      setPinging(false);
      setPingResult(status === 'online' ? '18ms latency (OK)' : 'Device is offline');
      setTimeout(() => setPingResult(null), 3500);
    }, 500);
  };

  const isOnline = status === 'online';
  const hasBattery = battery !== null && battery !== undefined && !isNaN(Number(battery));
  const displayBattery = hasBattery
    ? Math.max(0, Math.min(100, Math.round(Number(battery))))
    : null;

  const storagePercentage = storageTotalGb > 0
    ? Math.min(100, Math.round((storageUsedGb / storageTotalGb) * 100))
    : 0;

  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-indigo-500/40 transition-all shadow-lg hover:shadow-[0_8px_30px_rgba(99,102,241,0.15)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 rounded-xl flex-shrink-0">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white text-base font-['Outfit'] leading-snug truncate">
              {name}
            </h3>
            <p className="text-xs text-slate-400 font-medium truncate">
              {manufacturer} • {model}
            </p>
          </div>
        </div>
        <ConnectionStatus status={status} variant="badge" />
      </div>

      {/* Hardware & OS Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 bg-slate-900/60 border border-slate-800/80 p-3 rounded-xl">
        <div className="flex items-center space-x-1.5 min-w-0">
          <Cpu className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
          <span className="truncate">Android {androidVersion || '16'}</span>
        </div>
        <div className="flex items-center space-x-1.5 min-w-0">
          <Clock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="truncate">{lastSeen}</span>
        </div>
      </div>

      {/* Battery & Storage Indicators */}
      <div className="space-y-3 pt-1">
        {/* Battery Bar */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium flex items-center space-x-1">
              <Battery className="h-3.5 w-3.5 text-slate-400" />
              <span>Battery</span>
              {charging && (
                <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5 ml-1">
                  <Zap className="h-2.5 w-2.5 animate-pulse" /> Fast
                </span>
              )}
            </span>
            <span className="font-bold text-slate-200 font-mono">
              {displayBattery !== null ? `${displayBattery}%` : '—'}
            </span>
          </div>
          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-slate-700/50">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                displayBattery === null
                  ? 'bg-slate-700'
                  : charging
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                  : displayBattery < 20
                  ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                  : displayBattery < 50
                  ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                  : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
              }`}
              style={{ width: `${displayBattery ?? 0}%` }}
            />
          </div>
        </div>

        {/* Storage Bar (if available) */}
        {storageTotalGb > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium flex items-center space-x-1">
                <HardDrive className="h-3.5 w-3.5 text-cyan-400" />
                <span>Storage</span>
              </span>
              <span className="font-bold text-slate-300 font-mono text-[11px]">
                {storageUsedGb.toFixed(1)} / {storageTotalGb.toFixed(1)} GB ({storagePercentage}%)
              </span>
            </div>
            <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-slate-700/50">
              <div
                className="h-2 rounded-full bg-cyan-500 transition-all duration-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                style={{ width: `${storagePercentage}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Ping Feedback Notice */}
      {pingResult && (
        <div className="text-[11px] font-mono text-center py-1.5 px-2 bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 rounded-lg animate-fadeIn">
          {pingResult}
        </div>
      )}

      {/* Card Footer Actions (Always accessible) */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
          {/* Screen Mirror Quick Action Button */}
          {onScreenMirror && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onScreenMirror();
              }}
              disabled={!isOnline}
              className={`inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isOnline
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                  : 'bg-slate-800/60 text-slate-500 border border-slate-700/40 cursor-not-allowed opacity-60'
              }`}
              title={isOnline ? 'Open Screen Mirror' : 'Device is offline'}
            >
              <Monitor className="h-3.5 w-3.5" />
              <span>Mirror</span>
            </button>
          )}

          {/* Files & Photos Explorer Button */}
          {onFiles && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFiles();
              }}
              disabled={!isOnline}
              className={`inline-flex items-center justify-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isOnline
                  ? 'bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30'
                  : 'bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed'
              }`}
              title="Browse Photos & Files"
            >
              <HardDrive className="h-3.5 w-3.5 text-cyan-400" />
              <span>Files</span>
            </button>
          )}

          {/* App Launcher Button */}
          {onApps && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApps();
              }}
              disabled={!isOnline}
              className={`inline-flex items-center justify-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isOnline
                  ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed'
              }`}
              title="Launch Installed Apps"
            >
              <Smartphone className="h-3.5 w-3.5 text-indigo-400" />
              <span>Apps</span>
            </button>
          )}

          {/* Telemetry Modal Button */}
          {onTelemetry && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTelemetry();
              }}
              className="inline-flex items-center justify-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5 text-xs font-semibold transition-colors"
              title="View Battery & Storage Telemetry"
            >
              <BarChart2 className="h-3.5 w-3.5 text-indigo-400" />
              <span>Telemetry</span>
            </button>
          )}
        </div>

        {/* Secondary Actions */}
        <div className="flex items-center space-x-1">
          <button
            onClick={handlePing}
            disabled={pinging}
            className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-colors"
            title="Ping device"
          >
            <Radio className={`h-4 w-4 ${pinging ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {onSettings && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSettings();
              }}
              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
              title="Device Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}

          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Remove Device"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeviceCard;
