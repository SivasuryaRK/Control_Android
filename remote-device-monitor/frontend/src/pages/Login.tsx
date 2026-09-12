import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Mail, Lock, ArrowRight, Zap } from 'lucide-react';

interface LocationState {
  from?: {
    pathname: string;
  };
}

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const locationState = location.state as LocationState | undefined;
  const from = locationState?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please check your credentials.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Animated orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/8 rounded-full blur-[100px] animate-float pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-600/6 rounded-full blur-[80px] animate-float pointer-events-none" style={{ animationDelay: '2s' }} />

      <div className="auth-card">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.5)]">
              <Shield className="h-7 w-7 text-white" />
            </div>
            {/* Orbit dot */}
            <div className="absolute inset-0 rounded-2xl border border-indigo-400/20" style={{ animation: 'none' }}>
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0f1629] shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-white font-['Outfit']">
            Device<span className="text-indigo-400">Pulse</span>
          </h1>
          <p className="text-xs text-slate-500 font-semibold tracking-widest uppercase mt-1">
            Remote Control Platform
          </p>
        </div>

        <hr className="divider-glow mb-7" />

        <div className="mb-6">
          <h2 className="text-2xl font-extrabold text-white font-['Outfit'] mb-1">Welcome back</h2>
          <p className="text-sm text-slate-500">Sign in to your operator console</p>
        </div>

        {/* Quick Demo Credentials Badge */}
        <div className="mb-5 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between gap-2">
          <div className="text-xs">
            <span className="text-indigo-300 font-semibold block">Default Operator:</span>
            <span className="text-slate-400 font-mono text-[11px]">admin@example.com / Password@123</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setEmail('admin@example.com');
              setPassword('Password@123');
              setErrorMessage('');
            }}
            className="px-2.5 py-1 text-[11px] font-medium bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 hover:text-white rounded-lg border border-indigo-500/30 transition-all flex-shrink-0"
          >
            Auto-fill
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-medium animate-fadeIn">
            <div className="flex items-start gap-2.5">
              <span className="status-dot offline mt-0.5 flex-shrink-0" style={{ background: '#f43f5e', boxShadow: '0 0 6px rgba(244,63,94,0.6)' }} />
              <div>
                <p className="font-semibold">{errorMessage}</p>
                <p className="text-[11px] text-rose-400/80 mt-1">
                  Click <strong>Auto-fill</strong> above or{' '}
                  <Link to="/register" className="underline hover:text-white">create a new operator account</Link>.
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="login-email" className="label-dark">Email address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-dark pl-10"
                placeholder="operator@example.com"
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="login-password" className="label-dark">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-dark pl-10"
                placeholder="••••••••••"
                autoComplete="current-password"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full mt-2 py-3 text-sm"
            id="login-submit-btn"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Authenticating…</span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                <span>Sign In</span>
                <ArrowRight className="h-4 w-4 ml-auto opacity-60" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          No account yet?{' '}
          <Link to="/register" className="text-indigo-400 font-semibold hover:text-indigo-300 transition-colors">
            Create operator account →
          </Link>
        </p>

        {/* Footer decoration */}
        <div className="mt-8 pt-5 border-t border-white/5 flex items-center justify-center gap-1.5 text-[10px] text-slate-600 font-mono">
          <span className="status-dot online" style={{ width: '6px', height: '6px' }} />
          <span>Encrypted · Zero-log · Secure Transport</span>
        </div>
      </div>
    </div>
  );
};

export default Login;
