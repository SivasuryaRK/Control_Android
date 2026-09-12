import React from 'react';
import { Wifi, ServerOff, RefreshCw, Zap } from 'lucide-react';

interface ConnectionStatusProps {
  status: 'connected' | 'disconnected' | 'connecting' | 'online' | 'offline';
  label?: string;
  variant?: 'card' | 'badge';
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  label = 'Status',
  variant = 'card',
}) => {
  const isOnline    = status === 'connected' || status === 'online';
  const isConnecting = status === 'connecting';

  if (variant === 'badge') {
    return (
      <span
        className={`badge ${
          isOnline
            ? 'badge-online'
            : isConnecting
            ? 'badge-warn'
            : 'badge-offline'
        }`}
      >
        <span
          className={`status-dot ${isOnline ? 'online' : 'offline'}`}
          style={{ width: '6px', height: '6px', animation: isConnecting ? 'pulse-ring 1.2s infinite' : undefined }}
        />
        <span>{isOnline ? 'Online' : isConnecting ? 'Connecting' : 'Offline'}</span>
      </span>
    );
  }

  /* Card variant */
  const iconBg = isOnline
    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
    : isConnecting
    ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
    : 'bg-rose-500/10 border-rose-500/25 text-rose-400';

  const statusLabel = isOnline ? 'Connected' : isConnecting ? 'Connecting…' : 'Disconnected';

  return (
    <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
      <div className={`p-3 rounded-xl border ${iconBg} flex-shrink-0`}>
        {isOnline ? (
          <Wifi className="h-5 w-5" />
        ) : isConnecting ? (
          <RefreshCw className="h-5 w-5 animate-spin" />
        ) : (
          <ServerOff className="h-5 w-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="section-label mb-0.5">{label}</p>
        <p className="text-lg font-extrabold font-['Outfit'] text-white">{statusLabel}</p>
        {isOnline && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <Zap className="h-3 w-3 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-semibold">WebSocket active · 14ms</span>
          </div>
        )}
        {!isOnline && !isConnecting && (
          <p className="text-xs text-slate-500 mt-1">No server connection detected</p>
        )}
      </div>

      {/* Live pulse indicator */}
      {isOnline && (
        <div className="relative flex-shrink-0">
          <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-30 animate-pulse-ring" style={{ width: '14px', height: '14px' }} />
          <span className="relative block w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;
