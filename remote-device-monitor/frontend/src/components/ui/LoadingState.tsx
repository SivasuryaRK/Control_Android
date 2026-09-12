import React from 'react';

interface LoadingStateProps {
  message?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Loading monitoring data...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      {/* Neon spinner */}
      <div className="relative w-14 h-14 mb-5">
        {/* Outer glow ring */}
        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
        {/* Spinning ring */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 border-r-violet-500 animate-spin" style={{ animationDuration: '0.9s' }} />
        {/* Inner dot */}
        <div className="absolute inset-3 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse" />
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-400">{message}</p>
      <p className="text-xs text-slate-600 mt-1 font-mono">Fetching telemetry data…</p>
    </div>
  );
};

export default LoadingState;
