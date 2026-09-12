import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Play,
  Search,
  RefreshCw,
  Layers,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Filter,
} from 'lucide-react';

interface AppItem {
  name: string;
  packageName: string;
  versionName?: string;
  versionCode?: number;
  icon?: string; // base64 PNG
  isSystemApp?: boolean;
}

interface DeviceAppsModalProps {
  deviceId: string;
  deviceName: string;
  socket: any;
  onClose: () => void;
}

const DeviceAppsModal: React.FC<DeviceAppsModalProps> = ({
  deviceId,
  deviceName,
  socket,
  onClose,
}) => {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSystemApps, setShowSystemApps] = useState<boolean>(false);
  const [launchingApp, setLaunchingApp] = useState<string | null>(null);
  const [launchResult, setLaunchResult] = useState<{ packageName: string; success: boolean; error?: string } | null>(null);

  const loadApps = useCallback(() => {
    if (!socket) return;
    setLoading(true);
    setError(null);
    socket.emit('apps:list', { deviceId });
  }, [deviceId, socket]);

  useEffect(() => {
    if (!socket) return;

    loadApps();

    const handleListResponse = (data: {
      deviceId: string;
      apps: AppItem[];
      error?: string;
    }) => {
      if (data.deviceId !== deviceId) return;
      setLoading(false);
      if (data.error && (!data.apps || data.apps.length === 0)) {
        setError(data.error);
      } else {
        setApps(data.apps || []);
      }
    };

    const handleLaunchResponse = (data: {
      deviceId: string;
      packageName: string;
      success: boolean;
      error?: string;
    }) => {
      if (data.deviceId !== deviceId) return;
      setLaunchingApp(null);
      setLaunchResult(data);
      setTimeout(() => setLaunchResult(null), 4000);
    };

    socket.on('apps:list:response', handleListResponse);
    socket.on('apps:launch:response', handleLaunchResponse);

    return () => {
      socket.off('apps:list:response', handleListResponse);
      socket.off('apps:launch:response', handleLaunchResponse);
    };
  }, [deviceId, socket, loadApps]);

  const handleLaunch = (pkg: string) => {
    setLaunchingApp(pkg);
    setLaunchResult(null);
    socket.emit('apps:launch', { deviceId, packageName: pkg });
  };

  const filteredApps = apps.filter((app) => {
    const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          app.packageName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSystem = showSystemApps ? true : !app.isSystemApp;
    return matchesSearch && matchesSystem;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="glass-modal w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col h-[85vh] bg-slate-900/95">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {deviceName} App Launcher
              </h3>
              <p className="text-xs text-slate-400">
                {apps.length} installed applications found
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadApps}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Refresh Apps"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Search & Filter Bar ── */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-white/5 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search installed apps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            onClick={() => setShowSystemApps(!showSystemApps)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              showSystemApps
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Filter className="h-3 w-3" />
            {showSystemApps ? 'Showing System Apps' : 'User Apps Only'}
          </button>
        </div>

        {/* ── Apps Grid ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-3">
              <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin" />
              <p className="text-sm text-slate-400">Querying installed applications on phone...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-rose-400 space-y-2">
              <p className="font-semibold">{error}</p>
              <button
                onClick={loadApps}
                className="text-xs text-indigo-400 underline hover:text-white"
              >
                Retry
              </button>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2">
              <Smartphone className="h-12 w-12 text-slate-600" />
              <p className="text-sm">No matching applications found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredApps.map((app) => {
                const isLaunching = launchingApp === app.packageName;
                return (
                  <div
                    key={app.packageName}
                    className="bg-slate-950/60 border border-white/5 hover:border-indigo-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-md hover:shadow-indigo-500/10 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center text-indigo-400 flex-shrink-0">
                        <Smartphone className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{app.name}</h4>
                        <p className="text-[10px] text-slate-500 truncate font-mono">{app.packageName}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {app.isSystemApp ? 'System' : 'v' + (app.versionName || '1.0')}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleLaunch(app.packageName)}
                      disabled={isLaunching}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all flex-shrink-0 disabled:opacity-50"
                    >
                      {isLaunching ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5 fill-current" />
                      )}
                      <span>Open</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Action Notification Toast ── */}
        {launchResult && (
          <div
            className={`px-6 py-2.5 border-t text-xs flex items-center gap-2 ${
              launchResult.success
                ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-950/80 border-rose-500/30 text-rose-300'
            }`}
          >
            {launchResult.success ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Launched <strong>{launchResult.packageName}</strong> successfully on device screen!</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-rose-400" />
                <span>Failed to launch: {launchResult.error}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceAppsModal;
