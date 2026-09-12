import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Smartphone,
  Image,
  Tv,
  FileText,
  Settings,
  X,
  Shield,
  Zap,
} from 'lucide-react';

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onCloseMobile }) => {
  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, enabled: true },
    { label: 'Fleet Devices', path: '/devices', icon: Smartphone, enabled: true },
    { label: 'Activity Logs', path: '/audit-logs', icon: FileText, enabled: true },
    { label: 'Settings', path: '/settings', icon: Settings, enabled: true },
  ];

  const content = (
    <div className="flex flex-col h-full glass-sidebar text-slate-200 w-64">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight text-white font-['Outfit'] leading-none">
              Device<span className="text-indigo-400">Pulse</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mt-1">
              Remote Control
            </p>
          </div>
        </div>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Navigation Menu
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;

          if (!item.enabled) {
            return (
              <div
                key={item.label}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-500/60 cursor-not-allowed select-none text-xs font-medium border border-transparent"
              >
                <div className="flex items-center space-x-3">
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[9px] bg-slate-800/80 text-slate-400 px-2 py-0.5 rounded-full font-bold uppercase border border-slate-700">
                    {item.badge}
                  </span>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.label}
              to={item.path}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] border border-indigo-400/30'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
                }`
              }
            >
              <div className="flex items-center space-x-3">
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* System Status Card */}
      <div className="p-4 m-4 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs space-y-2">
        <div className="flex items-center justify-between font-bold text-indigo-300">
          <span className="flex items-center space-x-1.5">
            <Zap className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
            <span>Agent Sync</span>
          </span>
          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono">
            Active
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          WebSocket endpoint connected on port 3000.
        </p>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-800/60 text-[11px] text-slate-500 font-mono">
        <span>v1.0.0-pro</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-shrink-0 h-screen sticky top-0 z-30">
        {content}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full">
            {content}
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
