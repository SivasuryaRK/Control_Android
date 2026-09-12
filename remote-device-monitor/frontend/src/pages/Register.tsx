import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Mail, Lock, User, ArrowRight, CheckCircle2 } from 'lucide-react';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await register(name, email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const features = [
    'Real-time device telemetry',
    'Battery & storage monitoring',
    'Secure WebSocket sync',
  ];

  return (
    <div className="auth-page">
      {/* Animated orbs */}
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-violet-600/7 rounded-full blur-[100px] animate-float pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/4 w-72 h-72 bg-indigo-600/8 rounded-full blur-[80px] animate-float pointer-events-none" style={{ animationDelay: '1.5s' }} />

      <div className="auth-card" style={{ maxWidth: '28rem' }}>
        {/* Brand */}
        <div className="flex items-center gap-3 mb-7">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)] flex-shrink-0">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-base font-bold text-white font-['Outfit'] leading-none">
              Device<span className="text-indigo-400">Pulse</span>
            </p>
            <p className="text-[10px] text-slate-500 font-semibold tracking-widest uppercase mt-0.5">
              Operator Registration
            </p>
          </div>
        </div>

        <hr className="divider-glow mb-6" />

        <h2 className="text-xl font-extrabold text-white font-['Outfit'] mb-1">Create your account</h2>
        <p className="text-xs text-slate-500 mb-5">Enroll as an operator to manage your Android device fleet.</p>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {features.map(f => (
            <span key={f} className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {f}
            </span>
          ))}
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/8 border border-rose-500/25 text-rose-400 text-xs font-medium animate-fadeIn">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1 flex-shrink-0 shadow-[0_0_6px_rgba(244,63,94,0.7)]" />
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Name */}
          <div>
            <label htmlFor="reg-name" className="label-dark">Full name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                id="reg-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-dark pl-10"
                placeholder="John Doe"
                autoComplete="name"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="reg-email" className="label-dark">Email address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-dark pl-10"
                placeholder="name@example.com"
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="reg-password" className="label-dark">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                id="reg-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-dark pl-10"
                placeholder="Min 8 chars, mixed case + number"
                autoComplete="new-password"
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="reg-confirm-password" className="label-dark">Confirm password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                id="reg-confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-dark pl-10"
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full mt-1 py-3 text-sm"
            id="register-submit-btn"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Creating account…</span>
              </>
            ) : (
              <>
                <span>Create Operator Account</span>
                <ArrowRight className="h-4 w-4 ml-auto opacity-60" />
              </>
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-400 font-semibold hover:text-indigo-300 transition-colors">
            Sign in →
          </Link>
        </p>

        <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-center gap-1.5 text-[10px] text-slate-600 font-mono">
          <span className="status-dot online" style={{ width: '6px', height: '6px' }} />
          <span>Argon2id hashed · JWT secured · HTTPS only</span>
        </div>
      </div>
    </div>
  );
};

export default Register;
