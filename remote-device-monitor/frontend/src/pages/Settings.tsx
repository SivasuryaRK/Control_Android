import React, { useState } from 'react';
import MainLayout from '../components/layout/MainLayout';
import { useAuth } from '../context/AuthContext';
import { User, Bell, Shield, Key, Copy, Check } from 'lucide-react';

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: () => void;
}

const Toggle: React.FC<ToggleProps> = ({ id, checked, onChange }) => (
  <button
    id={id}
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`toggle-track ${checked ? 'on' : 'off'}`}
  >
    <span className="toggle-thumb" />
  </button>
);

const Settings: React.FC = () => {
  const { user } = useAuth();
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [lowBatteryWarning, setLowBatteryWarning] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopyToken = () => {
    navigator.clipboard.writeText('rdm_live_sec_key_984f...a891').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const settingRows = [
    {
      id: 'toggle-email-alerts',
      label: 'Email Status Alerts',
      description: 'Receive email alerts when a device goes offline',
      value: emailAlerts,
      toggle: () => setEmailAlerts(!emailAlerts),
    },
    {
      id: 'toggle-battery-warnings',
      label: 'Low Battery Warnings',
      description: 'Trigger alert notifications when device battery < 20%',
      value: lowBatteryWarning,
      toggle: () => setLowBatteryWarning(!lowBatteryWarning),
    },
    {
      id: 'toggle-auto-sync',
      label: 'Automatic Telemetry Sync',
      description: 'Sync storage and battery data every 60 seconds',
      value: autoSync,
      toggle: () => setAutoSync(!autoSync),
    },
  ];

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl animate-fadeIn">
        {/* ── Header ── */}
        <div>
          <h1 className="page-title">System Settings</h1>
          <p className="page-subtitle mt-1">Manage account credentials, telemetry preferences, and notifications.</p>
        </div>

        {/* ── Account Profile ── */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <User className="h-4 w-4" />
            </div>
            Account Profile
          </h2>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/60 border border-white/5">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center font-bold text-xl shadow-[0_0_20px_rgba(99,102,241,0.3)] flex-shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white font-['Outfit'] text-base truncate">{user?.name || 'Operator'}</p>
              <p className="text-xs text-slate-500 font-mono truncate">{user?.email || 'user@example.com'}</p>
              <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                <span className="status-dot online" style={{ width: '6px', height: '6px' }} />
                Account Active
              </span>
            </div>
          </div>
        </div>

        {/* ── Notifications ── */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Bell className="h-4 w-4" />
            </div>
            Notification & Alert Preferences
          </h2>

          <div className="space-y-0.5">
            {settingRows.map((row, i) => (
              <React.Fragment key={row.id}>
                {i > 0 && <hr className="divider-glow my-3" />}
                <div className="flex items-center justify-between py-2 gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-200">{row.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{row.description}</p>
                  </div>
                  <Toggle id={row.id} checked={row.value} onChange={row.toggle} />
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Security & API Keys ── */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Shield className="h-4 w-4" />
            </div>
            Security & API Token
          </h2>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-white/6 gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Key className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <code className="text-xs text-cyan-300 font-mono truncate">rdm_live_sec_key_984f...a891</code>
            </div>
            <button
              id="copy-token-btn"
              onClick={handleCopyToken}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                copied
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/20'
              }`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy Token'}
            </button>
          </div>

          <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
            <span className="status-dot online" style={{ width: '6px', height: '6px' }} />
            All API requests are encrypted with TLS 1.3 · Token rotates every 90 days
          </p>
        </div>
      </div>
    </MainLayout>
  );
};

export default Settings;
