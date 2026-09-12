import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import MainLayout from '../components/layout/MainLayout';
import DeviceCard from '../components/ui/DeviceCard';
import EmptyState from '../components/ui/EmptyState';
import PairDeviceModal from '../components/devices/PairDeviceModal';
import ScreenMirrorModal from '../components/devices/ScreenMirrorModal';
import DeviceTelemetryModal from '../components/devices/DeviceTelemetryModal';
import DeviceFilesModal from '../components/devices/DeviceFilesModal';
import DeviceAppsModal from '../components/devices/DeviceAppsModal';
import { Search, Plus, Smartphone, Wifi, WifiOff, Monitor, BarChart2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL  = import.meta.env.VITE_API_URL   || 'http://localhost:3000/api';
const SOCKET_URL    = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

interface Device {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  status: 'online' | 'offline';
  battery: number | null;
  charging: boolean;
  storageUsedGb: number;
  storageTotalGb: number;
  androidVersion: string;
  lastSeen: string;
}

const filterTabs = [
  { id: 'all',     label: 'All',     icon: Smartphone },
  { id: 'online',  label: 'Online',  icon: Wifi },
  { id: 'offline', label: 'Offline', icon: WifiOff },
] as const;

const Devices: React.FC = () => {
  const { token } = useAuth();
  const [devices, setDevices]             = useState<Device[]>([]);
  const [searchQuery, setSearchQuery]     = useState('');
  const [filterStatus, setFilterStatus]   = useState<'all' | 'online' | 'offline'>('all');
  const [isPairModalOpen, setPairModal]   = useState(false);
  const [mirrorDevice, setMirrorDevice]   = useState<Device | null>(null);
  const [telemetryDevice, setTelemetryDevice] = useState<Device | null>(null);
  const [filesDevice, setFilesDevice]     = useState<Device | null>(null);
  const [appsDevice, setAppsDevice]       = useState<Device | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // ── Fetch real devices from backend ────────────────────────────────────────
  const fetchDevices = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/devices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const serverDevices: Device[] = (data.devices || []).map((d: any) => {
          const rawBat = d.batteryLevel !== undefined && d.batteryLevel !== null
            ? d.batteryLevel
            : d.battery;
          const validBattery = rawBat !== undefined && rawBat !== null && !isNaN(Number(rawBat))
            ? Math.min(100, Math.max(0, Math.round(Number(rawBat))))
            : null;

          return {
            id:            d.id,
            name:          d.deviceName,
            manufacturer:  d.manufacturer,
            model:         d.model,
            status:        (d.status === 'ONLINE' ? 'online' : 'offline') as 'online' | 'offline',
            battery:       validBattery,
            charging:      d.charging ?? false,
            storageUsedGb: d.storageUsedGb ?? 0,
            storageTotalGb:d.storageTotalGb ?? 0,
            androidVersion:d.androidVersion || '—',
            lastSeen:      d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString() : '—'
          };
        });
        setDevices(serverDevices);
      }
    } catch {
      // network error — keep existing
    }
  }, [token]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // ── Socket.IO real-time updates ────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected as dashboard');
    });

    // Live status updates
    socket.on('device:online', (data: { deviceId: string; status?: string; isOnline?: boolean; lastSeen?: string }) => {
      setDevices(prev => prev.map(d =>
        d.id === data.deviceId
          ? {
              ...d,
              status: 'online',
              lastSeen: data.lastSeen ? new Date(data.lastSeen).toLocaleTimeString() : new Date().toLocaleTimeString()
            }
          : d
      ));
    });

    socket.on('device:offline', (data: { deviceId: string; status?: string; isOnline?: boolean; lastSeen?: string }) => {
      setDevices(prev => prev.map(d =>
        d.id === data.deviceId
          ? {
              ...d,
              status: 'offline',
              lastSeen: data.lastSeen ? new Date(data.lastSeen).toLocaleTimeString() : new Date().toLocaleTimeString()
            }
          : d
      ));
    });

    socket.on('device:status', (data: { deviceId: string; status: string; lastSeenAt: string }) => {
      setDevices(prev => prev.map(d =>
        d.id === data.deviceId
          ? { ...d, status: data.status.toLowerCase() as 'online' | 'offline', lastSeen: new Date(data.lastSeenAt).toLocaleTimeString() }
          : d
      ));
    });

    // Live telemetry: battery & storage
    socket.on('device:battery', (data: { deviceId: string; percentage: number; charging: boolean; timestamp?: string }) => {
      setDevices(prev => prev.map(d =>
        d.id === data.deviceId
          ? {
              ...d,
              battery: Math.min(100, Math.max(0, Math.round(Number(data.percentage)))),
              charging: data.charging,
              status: 'online',
              lastSeen: data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
            }
          : d
      ));
    });

    socket.on('device:storage', (data: { deviceId: string; storageUsedGb: number; storageTotalGb: number; timestamp?: string }) => {
      setDevices(prev => prev.map(d =>
        d.id === data.deviceId
          ? {
              ...d,
              storageUsedGb: data.storageUsedGb,
              storageTotalGb: data.storageTotalGb,
              status: 'online',
              lastSeen: data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
            }
          : d
      ));
    });

    socket.on('device:error', (err: any) => {
      console.warn('[Socket] device:error received:', err);
    });

    socket.on('device:telemetry', (data: {
      deviceId: string;
      battery: number;
      charging: boolean;
      storageUsedGb: number;
      storageTotalGb: number;
    }) => {
      setDevices(prev => prev.map(d =>
        d.id === data.deviceId
          ? {
              ...d,
              battery:       data.battery,
              charging:      data.charging,
              storageUsedGb: data.storageUsedGb,
              storageTotalGb:data.storageTotalGb,
              status:        'online',
              lastSeen:      new Date().toLocaleTimeString(),
            }
          : d
      ));
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [token]);

  // ── Disconnect / Delete ────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/devices/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch { /* non-fatal */ }
    }
    setDevices(prev => prev.filter(d => d.id !== id));
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredDevices = devices.filter(d => {
    const q = searchQuery.toLowerCase();
    const matchSearch = d.name.toLowerCase().includes(q) ||
                        d.manufacturer.toLowerCase().includes(q) ||
                        d.model.toLowerCase().includes(q);
    const matchFilter = filterStatus === 'all' || d.status === filterStatus;
    return matchSearch && matchFilter;
  });

  const onlineCount  = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;

  return (
    <MainLayout>
      <div className="space-y-6 animate-fadeIn">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title">Devices Fleet</h1>
            <p className="page-subtitle mt-1">
              Manage and monitor all connected Android devices — {filteredDevices.length} shown
            </p>
          </div>
          <button
            id="pair-device-btn"
            onClick={() => setPairModal(true)}
            className="btn-primary self-start sm:self-auto flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            <span>Pair New Device</span>
          </button>
        </div>

        {/* ── Summary chips ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 bg-slate-800/50 border border-white/6 px-3 py-1.5 rounded-full">
            <Smartphone className="h-3.5 w-3.5 text-slate-400" />
            {devices.length} Total
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 px-3 py-1.5 rounded-full">
            <span className="status-dot online" style={{ width: '7px', height: '7px' }} />
            {onlineCount} Online
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 bg-slate-800/50 border border-white/6 px-3 py-1.5 rounded-full">
            <span className="status-dot offline" style={{ width: '7px', height: '7px' }} />
            {offlineCount} Offline
          </span>
        </div>

        {/* ── Search & Filter ────────────────────────────────────────────── */}
        <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              id="device-search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, model, manufacturer…"
              className="input-dark pl-10 py-2.5"
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/60 border border-white/6 w-full sm:w-auto">
            {filterTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                id={`filter-${id}-btn`}
                onClick={() => setFilterStatus(id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all flex-1 sm:flex-none justify-center ${
                  filterStatus === id
                    ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Devices Grid ───────────────────────────────────────────────── */}
        {filteredDevices.length === 0 ? (
          <EmptyState
            title="No devices found"
            description={devices.length === 0
              ? "No Android devices paired yet. Click 'Pair New Device' to get started."
              : "No devices matched your search or filter."}
            icon={<Smartphone className="h-6 w-6" />}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDevices.map(device => (
              <div key={device.id} className="relative">
                <DeviceCard
                  deviceId={device.id}
                  name={device.name}
                  manufacturer={device.manufacturer}
                  model={device.model}
                  status={device.status}
                  battery={device.battery}
                  charging={device.charging}
                  androidVersion={device.androidVersion}
                  storageUsedGb={device.storageUsedGb}
                  storageTotalGb={device.storageTotalGb}
                  lastSeen={device.lastSeen}
                  onScreenMirror={() => setMirrorDevice(device)}
                  onFiles={() => setFilesDevice(device)}
                  onApps={() => setAppsDevice(device)}
                  onTelemetry={() => setTelemetryDevice(device)}
                  onDelete={() => handleDelete(device.id)}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Modals ─────────────────────────────────────────────────────── */}
        <PairDeviceModal
          isOpen={isPairModalOpen}
          onClose={() => setPairModal(false)}
          onDevicePaired={fetchDevices}
        />

        {mirrorDevice && socketRef.current && (
          <ScreenMirrorModal
            deviceId={mirrorDevice.id}
            deviceName={mirrorDevice.name}
            socket={socketRef.current}
            onClose={() => setMirrorDevice(null)}
          />
        )}

        {filesDevice && socketRef.current && (
          <DeviceFilesModal
            deviceId={filesDevice.id}
            deviceName={filesDevice.name}
            socket={socketRef.current}
            onClose={() => setFilesDevice(null)}
          />
        )}

        {appsDevice && socketRef.current && (
          <DeviceAppsModal
            deviceId={appsDevice.id}
            deviceName={appsDevice.name}
            socket={socketRef.current}
            onClose={() => setAppsDevice(null)}
          />
        )}

        {telemetryDevice && token && (
          <DeviceTelemetryModal
            deviceId={telemetryDevice.id}
            deviceName={telemetryDevice.name}
            token={token}
            initialBattery={telemetryDevice.battery}
            initialCharging={telemetryDevice.charging}
            initialStorageUsedGb={telemetryDevice.storageUsedGb}
            initialStorageTotalGb={telemetryDevice.storageTotalGb}
            onClose={() => setTelemetryDevice(null)}
          />
        )}
      </div>
    </MainLayout>
  );
};

export default Devices;
