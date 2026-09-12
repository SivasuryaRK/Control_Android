import React from 'react';
import { Menu, LogOut, User as UserIcon, Bell, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface TopNavProps {
  onOpenMobileMenu?: () => void;
}

const TopNav: React.FC<TopNavProps> = ({ onOpenMobileMenu }) => {
  const { user, logout } = useAuth();

  return (
    <header className="glass-header sticky top-0 z-20 px-4 md:px-8 py-3 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 rounded-xl text-slate-300 hover:bg-slate-800/80 focus:outline-none"
            aria-label="Open mobile navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {/* Status latency badge */}
        <div className="hidden sm:flex items-center space-x-2 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>System Healthy</span>
          <span className="text-[10px] text-emerald-500 font-mono pl-1 border-l border-emerald-500/30">14ms</span>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Quick activity bell */}
        <button className="relative p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded-xl transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-indigo-500 rounded-full ring-2 ring-slate-900" />
        </button>

        {/* User Profile Badge */}
        <div className="flex items-center space-x-3 pl-3 border-l border-slate-800">
          <div className="bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 p-2 rounded-xl">
            <UserIcon className="h-4 w-4" />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold text-slate-100 leading-tight">
              {user?.name || 'Operator'}
            </p>
            <p className="text-[11px] text-slate-400 leading-tight font-mono">{user?.email || 'user@example.com'}</p>
          </div>

          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors ml-1"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopNav;
