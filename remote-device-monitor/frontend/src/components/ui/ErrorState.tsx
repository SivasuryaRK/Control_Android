import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
}) => {
  return (
    <div className="glass-card rounded-2xl p-10 text-center max-w-md mx-auto my-6 border-rose-500/20 animate-fadeIn"
         style={{ borderColor: 'rgba(244,63,94,0.18)' }}>
      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-400 flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-base font-bold text-slate-100 mb-1.5 font-['Outfit']">{title}</h3>
      <p className="text-sm text-slate-500 mb-6 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-ghost inline-flex items-center gap-2 mx-auto"
          style={{ borderColor: 'rgba(244,63,94,0.25)', color: '#fb7185' }}
        >
          <RefreshCw className="h-4 w-4" />
          <span>Try again</span>
        </button>
      )}
    </div>
  );
};

export default ErrorState;
