import React, { useState, useEffect } from 'react';
import MainLayout from '../components/layout/MainLayout';
import EmptyState from '../components/ui/EmptyState';
import { Shield, Search, FileText, Info, AlertTriangle, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  level: 'info' | 'warning' | 'error';
  details: string;
}

const initialLogs: AuditLogEntry[] = [
  { id: 'log-001', timestamp: '2026-09-06 14:30:15', user: 'admin@example.com',      action: 'DEVICE_PAIR',     resource: 'Pixel 8 Pro',   level: 'info',    details: 'Device paired successfully' },
  { id: 'log-002', timestamp: '2026-09-06 14:25:03', user: 'admin@example.com',      action: 'BATTERY_ALERT',   resource: 'OnePlus 11',    level: 'warning', details: 'Battery level dropped below 20%' },
  { id: 'log-003', timestamp: '2026-09-06 14:20:45', user: 'system',                 action: 'TOKEN_ROTATE',    resource: 'RefreshToken',  level: 'info',    details: 'Automated token rotation executed' },
  { id: 'log-004', timestamp: '2026-09-06 14:15:22', user: 'john.doe@example.com',   action: 'USER_LOGIN',      resource: 'Auth API',      level: 'info',    details: 'Successful authentication' },
  { id: 'log-005', timestamp: '2026-09-06 14:10:08', user: 'jane.smith@example.com', action: 'DEVICE_REGISTER', resource: 'Galaxy S23',    level: 'info',    details: 'New device enrolled' },
];

const levelConfig = {
  info:    { label: 'Info',    icon: Info,          class: 'badge badge-info' },
  warning: { label: 'Warn',   icon: AlertTriangle,  class: 'badge badge-warn' },
  error:   { label: 'Error',  icon: XCircle,        class: 'badge badge-error' },
};

const actionColors: Record<string, string> = {
  PAIRING_CODE_CREATED: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  PAIRING_SUCCESSFUL:   'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  PAIRING_FAILED:       'text-rose-400 bg-rose-500/10 border-rose-500/20',
  DEVICE_DISCONNECTED:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  DEVICE_PAIR:          'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  BATTERY_ALERT:        'text-amber-400  bg-amber-500/10  border-amber-500/20',
  TOKEN_ROTATE:         'text-cyan-400   bg-cyan-500/10   border-cyan-500/20',
  USER_LOGIN:           'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  DEVICE_REGISTER:      'text-violet-400 bg-violet-500/10 border-violet-500/20',
};

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const AuditLogs: React.FC = () => {
  const { token, user } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!token) return;

    const fetchAuditLogs = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/devices/audit-logs`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const serverLogs: AuditLogEntry[] = (data.logs || []).map((l: any) => {
            let level: 'info' | 'warning' | 'error' = 'info';
            if (l.action === 'PAIRING_FAILED') level = 'error';
            else if (l.action === 'DEVICE_DISCONNECTED') level = 'warning';

            const meta = l.metadata || {};
            const details = meta.reason
              ? `Reason: ${meta.reason}`
              : meta.deviceName
              ? `Device: ${meta.deviceName}`
              : `Action: ${l.action}`;

            return {
              id: l.id,
              timestamp: new Date(l.timestamp).toLocaleString(),
              user: user?.email || 'authenticated user',
              action: l.action,
              resource: meta.deviceName || meta.deviceIdentifier || 'Device API',
              level,
              details
            };
          });

          if (serverLogs.length > 0) {
            setLogs([...serverLogs, ...initialLogs]);
          }
        }
      } catch {
        // fallback to initialLogs
      }
    };

    fetchAuditLogs();
  }, [token, user]);

  const filteredLogs = logs.filter(
    (log) =>
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="space-y-6 animate-fadeIn">
        {/* ── Header ── */}
        <div>
          <h1 className="page-title">Activity Logs</h1>
          <p className="page-subtitle mt-1">Audit history of device events, user actions, and system security alerts.</p>
        </div>

        {/* ── Filter Bar ── */}
        <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              id="audit-log-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by action, resource, user…"
              className="input-dark pl-10 py-2.5"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono flex-shrink-0">
            <Shield className="h-3.5 w-3.5 text-indigo-400" />
            {filteredLogs.length} entries
          </div>
        </div>

        {/* ── Table ── */}
        <div className="dark-panel">
          {filteredLogs.length === 0 ? (
            <EmptyState
              title="No logs found"
              description="No activity log entries matched your filter."
              icon={<FileText className="h-6 w-6" />}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="rdm-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th className="hidden lg:table-cell">Details</th>
                    <th className="text-right">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => {
                    const lvl = levelConfig[log.level] || levelConfig.info;
                    const LvlIcon = lvl.icon;
                    const actionCls = actionColors[log.action] || 'text-slate-400 bg-slate-800/60 border-white/10';
                    return (
                      <tr key={log.id} className="interactive-row">
                        <td>
                          <span className="value-mono text-[11px]">{log.timestamp}</span>
                        </td>
                        <td>
                          <span className="text-slate-300 font-medium text-xs">{log.user}</span>
                        </td>
                        <td>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold font-mono border tracking-wide ${actionCls}`}>
                            {log.action}
                          </span>
                        </td>
                        <td>
                          <span className="text-slate-300 font-medium text-xs">{log.resource}</span>
                        </td>
                        <td className="hidden lg:table-cell">
                          <span className="text-slate-500 text-xs">{log.details}</span>
                        </td>
                        <td className="text-right">
                          <span className={`${lvl.class} inline-flex items-center gap-1`}>
                            <LvlIcon className="h-2.5 w-2.5" />
                            {lvl.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default AuditLogs;
