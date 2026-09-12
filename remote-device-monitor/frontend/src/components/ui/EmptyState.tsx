import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action, icon }) => {
  return (
    <div className="glass-card rounded-2xl p-10 text-center max-w-md mx-auto my-6 animate-fadeIn">
      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4 animate-float">
        {icon || <Inbox className="h-7 w-7" />}
      </div>
      <h3 className="text-base font-bold text-slate-100 mb-1.5 font-['Outfit']">{title}</h3>
      <p className="text-sm text-slate-500 mb-6 leading-relaxed">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="btn-primary mx-auto"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
