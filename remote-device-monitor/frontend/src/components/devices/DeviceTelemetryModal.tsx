import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Battery,
  BatteryCharging,
  HardDrive,
  Thermometer,
  Gauge,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Clock,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import LoadingState from '../ui/LoadingState';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface DeviceTelemetryModalProps {
  deviceId: string;
  deviceName: string;
  token: string;
  initialBattery?: number;
  initialCharging?: boolean;
  initialStorageUsedGb?: number;
  initialStorageTotalGb?: number;
  onClose: () => void;
}

interface BatteryReading {
  percentage: number;
  charging: boolean;
  temperature?: number;
  voltage?: number;
  timestamp: string;
  timeFormatted?: string;
}

interface StorageReading {
  totalBytes?: number;
  usedBytes?: number;
  availableBytes?: number;
  timestamp: string;
}

const DeviceTelemetryModal: React.FC<DeviceTelemetryModalProps> = ({
  deviceId,
  deviceName,
  token,
  initialBattery = 100,
  initialCharging = false,
  initialStorageUsedGb = 0,
  initialStorageTotalGb = 0,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batteryHistory, setBatteryHistory] = useState<BatteryReading[]>([]);
  const [currentBattery, setCurrentBattery] = useState<number>(initialBattery);
  const [isCharging, setIsCharging] = useState<boolean>(initialCharging);
  const [temperature, setTemperature] = useState<number>(32.0);
  const [voltage, setVoltage] = useState<number>(3900);
  const [storageUsedGb, setStorageUsedGb] = useState<number>(initialStorageUsedGb);
  const [storageTotalGb, setStorageTotalGb] = useState<number>(initialStorageTotalGb);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/devices/${deviceId}/battery-history?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to load telemetry (HTTP ${res.status})`);
      }

      const data = await res.json();
      const rawList: any[] = data.history || [];

      if (rawList.length > 0) {
        const latest = rawList[rawList.length - 1];
        setCurrentBattery(latest.percentage);
        setIsCharging(Boolean(latest.charging));
        if (latest.temperature) setTemperature(latest.temperature);
        if (latest.voltage) setVoltage(latest.voltage);
      }

      const formatted: BatteryReading[] = rawList.map((item, idx) => {
        const date = new Date(item.timestamp);
        const timeStr = isNaN(date.getTime())
          ? `pt-${idx + 1}`
          : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return {
          percentage: item.percentage,
          charging: Boolean(item.charging),
          temperature: item.temperature,
          voltage: item.voltage,
          timestamp: item.timestamp,
          timeFormatted: timeStr,
        };
      });

      setBatteryHistory(formatted);
    } catch (err: any) {
      setError(err.message || 'Error fetching telemetry data');
    } finally {
      setLoading(false);
    }
  }, [deviceId, token]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const storageFreeGb = Math.max(0, storageTotalGb - storageUsedGb);
  const storagePercentage = storageTotalGb > 0
    ? Math.min(100, Math.round((storageUsedGb / storageTotalGb) * 100))
    : 0;

  const storageChartData = [
    { name: 'Used', value: parseFloat(storageUsedGb.toFixed(1)), color: '#6366f1' },
    { name: 'Free', value: parseFloat(storageFreeGb.toFixed(1)), color: '#10b981' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="glass-modal w-full max-w-3xl rounded-2xl border border-white/10 p-6 flex flex-col max-h-[90vh] overflow-y-auto">
        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Battery className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {deviceName} Telemetry
              </h2>
              <p className="text-xs text-slate-400">Real-time Battery Health & Storage Analytics</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="mb-5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-rose-400 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={fetchHistory}
              className="flex items-center gap-1 font-semibold underline hover:text-rose-300"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        )}

        {loading ? (
          <LoadingState message="Fetching live battery & storage telemetry..." />
        ) : (
          <div className="space-y-6">
            {/* ── Real-time Metrics Grid ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Battery Card */}
              <div className="glass-card rounded-2xl p-4 border border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Battery Level
                  </span>
                  {isCharging ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                      <Zap className="h-3 w-3 animate-pulse" /> Fast Charging
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-slate-400 bg-slate-800 border border-slate-700 px-2.5 py-0.5 rounded-full">
                      Discharging
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-4xl font-extrabold text-white font-mono">
                    {currentBattery}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700/50 mb-4">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isCharging
                        ? 'bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.6)]'
                        : currentBattery <= 20
                        ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]'
                        : currentBattery <= 50
                        ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]'
                        : 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, currentBattery))}%` }}
                  />
                </div>

                {/* Secondary Telemetry */}
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/5 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Thermometer className="h-3.5 w-3.5 text-indigo-400" />
                    <span>{temperature.toFixed(1)}°C Temp</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5 text-indigo-400" />
                    <span>{(voltage / 1000).toFixed(2)} V Voltage</span>
                  </div>
                </div>
              </div>

              {/* Storage Card */}
              <div className="glass-card rounded-2xl p-4 border border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Internal Storage
                  </span>
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                    <HardDrive className="h-4 w-4" />
                  </div>
                </div>

                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-4xl font-extrabold text-white font-mono">
                    {storagePercentage}%
                  </span>
                  <span className="text-xs text-slate-400 font-medium">Used</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700/50 mb-4">
                  <div
                    className="h-full rounded-full bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.6)] transition-all duration-500"
                    style={{ width: `${storagePercentage}%` }}
                  />
                </div>

                {/* Storage breakdown */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5 text-xs">
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase">Used</p>
                    <p className="font-bold text-slate-200">{storageUsedGb.toFixed(1)} GB</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase">Free</p>
                    <p className="font-bold text-emerald-400">{storageFreeGb.toFixed(1)} GB</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase">Total</p>
                    <p className="font-bold text-slate-400">{storageTotalGb.toFixed(1)} GB</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Battery History Chart (Recharts) ── */}
            <div className="glass-card rounded-2xl p-4 border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-400" />
                    Battery Telemetry History
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Historical battery percentage and discharge pattern
                  </p>
                </div>
                <button
                  onClick={fetchHistory}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                  title="Refresh history"
                >
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              </div>

              {batteryHistory.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No historical battery readings recorded yet.
                </div>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={batteryHistory}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="modalBatteryGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="rgba(255,255,255,0.05)"
                      />
                      <XAxis
                        dataKey="timeFormatted"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderRadius: '12px',
                          border: '1px solid rgba(99,102,241,0.3)',
                          fontSize: '12px',
                          color: '#f8fafc',
                        }}
                        formatter={(value: any) => [`${value}%`, 'Battery']}
                        labelFormatter={(label) => `Time: ${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="percentage"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        fill="url(#modalBatteryGrad)"
                        activeDot={{ r: 5, fill: '#818cf8', stroke: '#0f172a', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceTelemetryModal;
