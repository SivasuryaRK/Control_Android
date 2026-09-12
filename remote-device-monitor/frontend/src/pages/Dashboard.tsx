import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import MainLayout from '../components/layout/MainLayout';
import StatCard from '../components/ui/StatCard';
import BatteryCard from '../components/ui/BatteryCard';
import StorageCard from '../components/ui/StorageCard';
import ConnectionStatus from '../components/ui/ConnectionStatus';
import DeviceCard from '../components/ui/DeviceCard';
import LoadingState from '../components/ui/LoadingState';
import DeviceTelemetryModal from '../components/devices/DeviceTelemetryModal';
import ScreenMirrorModal from '../components/devices/ScreenMirrorModal';
import DeviceFilesModal from '../components/devices/DeviceFilesModal';
import DeviceAppsModal from '../components/devices/DeviceAppsModal';
import { useAuth } from '../context/AuthContext';
import {
  Smartphone,
  Wifi,
  WifiOff,
  Activity,
  HardDrive,
  Clock,
  TrendingUp,
  ExternalLink,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

interface ActivityItem {
  id: string;
  description: string;
  timestamp: string;
  type: 'online' | 'offline' | 'alert' | 'register';
}

interface DeviceItem {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  status: 'online' | 'offline';
  battery: number | null;
  charging?: boolean;
  temperature?: number;
  voltage?: number;
  storageUsedGb?: number;
  storageTotalGb?: number;
  androidVersion: string;
  lastSeen: string;
}

interface BatteryHistoryPoint {
  time: string;
  battery: number;
  voltage?: number;
  temperature?: number;
}

const activityIconColor: Record<ActivityItem['type'], string> = {
  online: 'text-emerald-400',
  offline: 'text-rose-400',
  alert: 'text-amber-400',
  register: 'text-indigo-400',
};

const activityBg: Record<ActivityItem['type'], string> = {
  online: 'bg-emerald-500/8 border-emerald-500/20',
  offline: 'bg-rose-500/8 border-rose-500/20',
  alert: 'bg-amber-500/8 border-amber-500/20',
  register: 'bg-indigo-500/8 border-indigo-500/20',
};

const Dashboard: React.FC = () => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState({ totalDevices: 0, onlineDevices: 0, offlineDevices: 0 });
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [batteryTemp, setBatteryTemp] = useState<number>(31.5);
  const [batteryVoltage, setBatteryVoltage] = useState<number>(3900);

  const [storageTotalGb, setStorageTotalGb] = useState<number>(128);
  const [storageUsedGb, setStorageUsedGb] = useState<number>(0);
  const [storageFreeGb, setStorageFreeGb] = useState<number>(128);

  const [batteryHistory, setBatteryHistory] = useState<BatteryHistoryPoint[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [selectedDeviceModal, setSelectedDeviceModal] = useState<DeviceItem | null>(null);
  const [mirrorDevice, setMirrorDevice] = useState<DeviceItem | null>(null);
  const [filesDevice, setFilesDevice] = useState<DeviceItem | null>(null);
  const [appsDevice, setAppsDevice] = useState<DeviceItem | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // ── Initial Fetch ──────────────────────────────────────────────────────────
  const fetchDashboardData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch devices
      const devRes = await fetch(`${API_BASE_URL}/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!devRes.ok) throw new Error(`Failed to load devices (HTTP ${devRes.status})`);
      const devData = await devRes.json();
      const rawDevices: any[] = devData.devices || [];

      const parsedDevices: DeviceItem[] = rawDevices.map((d) => {
        const rawBat = d.batteryLevel !== undefined && d.batteryLevel !== null
          ? d.batteryLevel
          : d.battery;
        const validBattery = rawBat !== undefined && rawBat !== null && !isNaN(Number(rawBat))
          ? Math.min(100, Math.max(0, Math.round(Number(rawBat))))
          : null;

        return {
          id: d.id,
          name: d.deviceName || `${d.manufacturer} ${d.model}`,
          manufacturer: d.manufacturer || 'Android',
          model: d.model || 'Device',
          status: (d.status === 'ONLINE' || d.isOnline ? 'online' : 'offline') as 'online' | 'offline',
          battery: validBattery,
          charging: Boolean(d.charging),
          temperature: d.temperature ?? undefined,
          voltage: d.voltage ?? undefined,
          storageUsedGb: d.storageUsedGb ?? 0,
          storageTotalGb: d.storageTotalGb ?? 128,
          androidVersion: d.androidVersion || '14',
          lastSeen: d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString() : '—',
        };
      });

      setDevices(parsedDevices);

      const total = parsedDevices.length;
      const online = parsedDevices.filter((d) => d.status === 'online').length;
      setStats({
        totalDevices: total,
        onlineDevices: online,
        offlineDevices: total - online,
      });

      // 2. Fetch fleet telemetry & battery history
      const telRes = await fetch(`${API_BASE_URL}/devices/telemetry/fleet`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (telRes.ok) {
        const telData = await telRes.json();
        const rawHistory: any[] = telData.batteryHistory || [];

        if (rawHistory.length > 0) {
          const formattedHistory: BatteryHistoryPoint[] = rawHistory.slice(-20).map((h) => {
            const date = new Date(h.timestamp);
            const timeStr = isNaN(date.getTime())
              ? 'Now'
              : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return {
              time: timeStr,
              battery: h.percentage,
              voltage: h.voltage ? parseFloat((h.voltage / 1000).toFixed(2)) : undefined,
              temperature: h.temperature,
            };
          });
          setBatteryHistory(formattedHistory);

          const latest = rawHistory[rawHistory.length - 1];
          setBatteryLevel(latest.percentage);
          setIsCharging(Boolean(latest.charging));
          if (latest.temperature) setBatteryTemp(latest.temperature);
          if (latest.voltage) setBatteryVoltage(latest.voltage);
        } else if (parsedDevices.length > 0) {
          // Calculate average from devices that have real battery readings
          const devicesWithBattery = parsedDevices.filter((d) => d.battery !== null && d.battery !== undefined);
          if (devicesWithBattery.length > 0) {
            const avgBattery = Math.round(
              devicesWithBattery.reduce((sum, d) => sum + (d.battery as number), 0) / devicesWithBattery.length
            );
            setBatteryLevel(avgBattery);
          }
        }
      }

      // Initial storage calculation
      if (parsedDevices.length > 0) {
        const totalUsed = parsedDevices.reduce((sum, d) => sum + (d.storageUsedGb || 0), 0);
        const totalCap = parsedDevices.reduce((sum, d) => sum + (d.storageTotalGb || 128), 0);
        setStorageUsedGb(parseFloat(totalUsed.toFixed(1)));
        setStorageTotalGb(parseFloat(totalCap.toFixed(1)));
        setStorageFreeGb(parseFloat(Math.max(0, totalCap - totalUsed).toFixed(1)));
      }

      // Initial system activities
      setRecentActivities([
        {
          id: 'act-1',
          description: total > 0 ? `${online} active device(s) streaming telemetry` : 'No devices paired yet',
          timestamp: 'Live',
          type: online > 0 ? 'online' : 'alert',
        },
        {
          id: 'act-2',
          description: 'Socket.IO telemetry channel initialized',
          timestamp: 'Just now',
          type: 'online',
        },
      ]);
    } catch (err: any) {
      setError(err.message || 'Error connecting to monitoring service');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // ── Socket.IO Real-Time Stream (No Polling) ────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    // Real-time battery telemetry
    socket.on('device:battery', (data: {
      deviceId: string;
      percentage: number;
      charging: boolean;
      temperature?: number;
      voltage?: number;
      timestamp?: string;
    }) => {
      setBatteryLevel(data.percentage);
      setIsCharging(Boolean(data.charging));
      if (data.temperature !== undefined) setBatteryTemp(data.temperature);
      if (data.voltage !== undefined) setBatteryVoltage(data.voltage);

      // Append point to live history chart
      const timeStr = data.timestamp
        ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setBatteryHistory((prev) => {
        const next = [
          ...prev,
          {
            time: timeStr,
            battery: data.percentage,
            voltage: data.voltage ? parseFloat((data.voltage / 1000).toFixed(2)) : undefined,
            temperature: data.temperature,
          },
        ];
        return next.slice(-25); // retain last 25 live telemetry ticks
      });

      // Update device list
      setDevices((prev) =>
        prev.map((d) =>
          d.id === data.deviceId
            ? {
                ...d,
                battery: Math.min(100, Math.max(0, Math.round(Number(data.percentage)))),
                charging: data.charging,
                temperature: data.temperature ?? d.temperature,
                voltage: data.voltage ?? d.voltage,
                status: 'online',
                lastSeen: 'Just now',
              }
            : d
        )
      );
    });

    // Real-time storage telemetry
    socket.on('device:storage', (data: {
      deviceId: string;
      storageUsedGb: number;
      storageTotalGb: number;
      storageFreeGb?: number;
      timestamp?: string;
    }) => {
      setStorageUsedGb(data.storageUsedGb);
      if (data.storageTotalGb > 0) setStorageTotalGb(data.storageTotalGb);
      if (data.storageFreeGb !== undefined) {
        setStorageFreeGb(data.storageFreeGb);
      } else {
        setStorageFreeGb(Math.max(0, data.storageTotalGb - data.storageUsedGb));
      }

      setDevices((prev) =>
        prev.map((d) =>
          d.id === data.deviceId
            ? {
                ...d,
                storageUsedGb: data.storageUsedGb,
                storageTotalGb: data.storageTotalGb,
                status: 'online',
                lastSeen: 'Just now',
              }
            : d
        )
      );
    });

    // Device online / offline status updates
    socket.on('device:online', (data: { deviceId: string }) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === data.deviceId ? { ...d, status: 'online', lastSeen: 'Just now' } : d))
      );
      setStats((prev) => ({
        ...prev,
        onlineDevices: Math.min(prev.totalDevices, prev.onlineDevices + 1),
        offlineDevices: Math.max(0, prev.offlineDevices - 1),
      }));
    });

    socket.on('device:offline', (data: { deviceId: string }) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === data.deviceId ? { ...d, status: 'offline', lastSeen: 'Just now' } : d))
      );
      setStats((prev) => ({
        ...prev,
        onlineDevices: Math.max(0, prev.onlineDevices - 1),
        offlineDevices: Math.min(prev.totalDevices, prev.offlineDevices + 1),
      }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  if (loading) {
    return (
      <MainLayout>
        <LoadingState message="Loading live telemetry & battery health..." />
      </MainLayout>
    );
  }

  const storageUsedPercentage = storageTotalGb > 0
    ? Math.min(100, Math.round((storageUsedGb / storageTotalGb) * 100))
    : 0;

  const storageDistributionData = [
    { name: 'Used Storage', value: parseFloat(storageUsedGb.toFixed(1)), color: '#6366f1' },
    { name: 'Free Space', value: parseFloat(storageFreeGb.toFixed(1)), color: '#10b981' },
  ];

  return (
    <MainLayout>
      <div className="space-y-6 animate-fadeIn">
        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title shimmer-text">Dashboard Overview</h1>
            <p className="page-subtitle mt-1">
              Live telemetry, real-time battery health, and storage utilization.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDashboardData}
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-white/5 transition-colors"
              title="Refresh Dashboard"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <Link to="/devices" className="btn-primary flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              <span>Manage Fleet</span>
            </Link>
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-rose-400 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={fetchDashboardData}
              className="flex items-center gap-1 font-bold underline hover:text-rose-300"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Devices"
            value={stats.totalDevices}
            icon={<Smartphone className="h-5 w-5" />}
            color="indigo"
          />
          <StatCard
            title="Online Devices"
            value={stats.onlineDevices}
            icon={<Wifi className="h-5 w-5" />}
            color="emerald"
            trend={{ value: `${stats.onlineDevices} live`, isPositive: true }}
          />
          <StatCard
            title="Offline Devices"
            value={stats.offlineDevices}
            icon={<WifiOff className="h-5 w-5" />}
            color="rose"
          />
          <StatCard
            title="Free Storage"
            value={`${storageFreeGb.toFixed(1)} GB`}
            icon={<HardDrive className="h-5 w-5" />}
            color="cyan"
          />
        </div>

        {/* ── Telemetry Widgets ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <BatteryCard
            label="Fleet Battery Health"
            value={batteryLevel}
            charging={isCharging}
            temperature={batteryTemp}
            voltage={batteryVoltage}
          />
          <StorageCard
            label="Storage Utilization"
            usedPercentage={storageUsedPercentage}
            usedGb={storageUsedGb}
            totalGb={storageTotalGb}
          />
          <ConnectionStatus
            status={stats.onlineDevices > 0 ? 'connected' : 'disconnected'}
            label="Live Socket Link"
          />
        </div>

        {/* ── Charts Row (Recharts) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Battery Area Chart */}
          <div className="glass-card rounded-2xl p-5 lg:col-span-2 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-400" />
                  Real-time Battery History
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live battery discharge and charging curve via Socket.IO
                </p>
              </div>
              <span className="badge badge-info flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                Live Stream
              </span>
            </div>

            <div className="h-60 w-full">
              {batteryHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  Waiting for live telemetry stream from connected devices...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={batteryHistory}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorBattery" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(255,255,255,0.04)"
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: '#475569' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#475569' }}
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f1629',
                        color: '#e2e8f0',
                        borderRadius: '10px',
                        border: '1px solid rgba(99,102,241,0.3)',
                        fontSize: '12px',
                        backdropFilter: 'blur(12px)',
                      }}
                      formatter={(val: any) => [`${val}%`, 'Battery']}
                      labelFormatter={(label) => `Time: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="battery"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorBattery)"
                      dot={false}
                      activeDot={{ r: 5, fill: '#818cf8', stroke: '#0f1629', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Storage Distribution Chart */}
          <div className="glass-card rounded-2xl p-5 flex flex-col">
            <h2 className="text-sm font-bold text-slate-100 mb-0.5">Storage Breakdown</h2>
            <p className="text-xs text-slate-500 mb-4">
              Total internal memory ({storageTotalGb.toFixed(1)} GB)
            </p>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={storageDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {storageDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} opacity={0.9} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f1629',
                      color: '#e2e8f0',
                      borderRadius: '10px',
                      border: '1px solid rgba(99,102,241,0.3)',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [`${val} GB`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <hr className="divider-glow my-3" />

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  <span className="text-slate-400">Used Space</span>
                </div>
                <span className="font-bold text-slate-200 font-mono">
                  {storageUsedGb.toFixed(1)} GB ({storageUsedPercentage}%)
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-slate-400">Free Space</span>
                </div>
                <span className="font-bold text-emerald-400 font-mono">
                  {storageFreeGb.toFixed(1)} GB ({100 - storageUsedPercentage}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Activity & Fleet Devices ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent System Activity */}
          <div className="glass-card rounded-2xl p-5">
            <div
              className="flex items-center justify-between mb-4 pb-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-400" />
                Recent System Activity
              </h2>
              <Link
                to="/audit-logs"
                className="flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                View All <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            <div className="space-y-2">
              {recentActivities.map((act) => (
                <div
                  key={act.id}
                  className={`flex items-start gap-3 p-2.5 rounded-xl border text-xs interactive-row ${activityBg[act.type]}`}
                >
                  <div className={`mt-0.5 flex-shrink-0 ${activityIconColor[act.type]}`}>
                    {act.type === 'online' ? (
                      <Wifi className="h-3.5 w-3.5" />
                    ) : act.type === 'offline' ? (
                      <WifiOff className="h-3.5 w-3.5" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-200 truncate">{act.description}</p>
                    <p className="text-slate-500 mt-0.5 font-mono text-[10px]">{act.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fleet Devices Preview */}
          <div className="glass-card rounded-2xl p-5">
            <div
              className="flex items-center justify-between mb-4 pb-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-indigo-400" />
                Fleet Devices
              </h2>
              <Link
                to="/devices"
                className="flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                View All <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            <div className="space-y-3">
              {devices.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No devices paired. Go to <Link to="/devices" className="text-indigo-400 underline">Devices</Link> to pair your first phone.
                </div>
              ) : (
                devices.slice(0, 3).map((device) => (
                  <div key={device.id}>
                    <DeviceCard
                      deviceId={device.id}
                      name={device.name}
                      manufacturer={device.manufacturer}
                      model={device.model}
                      status={device.status}
                      battery={device.battery}
                      charging={device.charging}
                      storageUsedGb={device.storageUsedGb}
                      storageTotalGb={device.storageTotalGb}
                      androidVersion={device.androidVersion}
                      lastSeen={device.lastSeen}
                      onScreenMirror={() => setMirrorDevice(device)}
                      onFiles={() => setFilesDevice(device)}
                      onApps={() => setAppsDevice(device)}
                      onTelemetry={() => setSelectedDeviceModal(device)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Screen Mirror Modal ── */}
        {mirrorDevice && socketRef.current && (
          <ScreenMirrorModal
            deviceId={mirrorDevice.id}
            deviceName={mirrorDevice.name}
            socket={socketRef.current}
            onClose={() => setMirrorDevice(null)}
          />
        )}

        {/* ── Remote Files & Photo Gallery Modal ── */}
        {filesDevice && socketRef.current && (
          <DeviceFilesModal
            deviceId={filesDevice.id}
            deviceName={filesDevice.name}
            socket={socketRef.current}
            onClose={() => setFilesDevice(null)}
          />
        )}

        {/* ── Remote App Launcher Modal ── */}
        {appsDevice && socketRef.current && (
          <DeviceAppsModal
            deviceId={appsDevice.id}
            deviceName={appsDevice.name}
            socket={socketRef.current}
            onClose={() => setAppsDevice(null)}
          />
        )}

        {/* ── Device Telemetry Modal ── */}
        {selectedDeviceModal && token && (
          <DeviceTelemetryModal
            deviceId={selectedDeviceModal.id}
            deviceName={selectedDeviceModal.name}
            token={token}
            initialBattery={selectedDeviceModal.battery}
            initialCharging={selectedDeviceModal.charging}
            initialStorageUsedGb={selectedDeviceModal.storageUsedGb}
            initialStorageTotalGb={selectedDeviceModal.storageTotalGb}
            onClose={() => setSelectedDeviceModal(null)}
          />
        )}
      </div>
    </MainLayout>
  );
};

export default Dashboard;
