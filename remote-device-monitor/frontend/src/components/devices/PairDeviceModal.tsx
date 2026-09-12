import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Copy, Check, Clock, RefreshCw, Smartphone, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface PairDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDevicePaired?: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const PairDeviceModal: React.FC<PairDeviceModalProps> = ({ isOpen, onClose, onDevicePaired }) => {
  const { token } = useAuth();
  const [code, setCode] = useState<string>('');
  const [expiresInSeconds, setExpiresInSeconds] = useState<number>(300);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [pairedDeviceName, setPairedDeviceName] = useState<string | null>(null);

  const initialDeviceCountRef = useRef<number>(-1);

  // Fetch a new pairing code from backend
  const fetchPairingCode = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    setCopied(false);
    setPairedDeviceName(null);

    try {
      const res = await fetch(`${API_BASE_URL}/devices/pairing-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate pairing code');
      }

      const data = await res.json();
      setCode(data.code);
      setExpiresInSeconds(data.expiresInSeconds || 300);
    } catch (err: any) {
      setError(err.message || 'Network error generating code');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Initial code generation when modal opens
  useEffect(() => {
    if (isOpen) {
      // Record initial device count to detect new pairing
      const getInitialCount = async () => {
        if (!token) return;
        try {
          const res = await fetch(`${API_BASE_URL}/devices`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            initialDeviceCountRef.current = (data.devices || []).length;
          }
        } catch {
          initialDeviceCountRef.current = 0;
        }
      };

      getInitialCount();
      fetchPairingCode();
    }
  }, [isOpen, fetchPairingCode, token]);

  // Expiration countdown timer
  useEffect(() => {
    if (!isOpen || expiresInSeconds <= 0 || pairedDeviceName) return;

    const timer = setInterval(() => {
      setExpiresInSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, expiresInSeconds, pairedDeviceName]);

  // Poll for paired device every 3 seconds while code is active
  useEffect(() => {
    if (!isOpen || expiresInSeconds <= 0 || pairedDeviceName || !token) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/devices`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const devices = data.devices || [];
          if (initialDeviceCountRef.current !== -1 && devices.length > initialDeviceCountRef.current) {
            const newlyPaired = devices[0];
            setPairedDeviceName(newlyPaired.deviceName || 'Android Device');
            if (onDevicePaired) onDevicePaired();
          }
        }
      } catch {
        // non-fatal polling error
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [isOpen, expiresInSeconds, pairedDeviceName, token, onDevicePaired]);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div
        className="relative w-full max-w-md bg-slate-900/90 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
        >
          <X className="h-5 w-5" />
        </button>

        {pairedDeviceName ? (
          // Success State
          <div className="text-center py-6 space-y-4 animate-scaleUp">
            <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-500/20">
              <Check className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-white">Device Connected!</h2>
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-emerald-400">{pairedDeviceName}</span> has been securely paired and associated with your account.
            </p>
            <button
              onClick={onClose}
              className="btn-primary w-full mt-4"
            >
              Continue to Dashboard
            </button>
          </div>
        ) : (
          // Pairing Code State
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                <Smartphone className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Pair Android Device</h2>
                <p className="text-xs text-slate-400">Generate a cryptographically secure one-time code</p>
              </div>
            </div>

            {error ? (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 flex items-start gap-3 text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p>{error}</p>
                  <button
                    onClick={fetchPairingCode}
                    className="text-xs font-semibold underline text-rose-300 hover:text-white"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Code & QR Code Card */}
                <div className="bg-slate-800/60 border border-white/8 rounded-2xl p-5 text-center space-y-4">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
                    {/* QR Code */}
                    {code && !isLoading && (
                      <div className="p-2.5 bg-white rounded-xl shadow-lg flex-shrink-0">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&data=${encodeURIComponent(
                            JSON.stringify({
                              code,
                              serverUrl: window.location.origin.replace('5173', '3000')
                            })
                          )}`}
                          alt="Scan to Pair QR Code"
                          className="w-28 h-28 object-contain"
                        />
                      </div>
                    )}

                    <div className="space-y-3 flex-1 text-center sm:text-left">
                      <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                        One-Time Pairing Code
                      </p>

                      {isLoading ? (
                        <div className="py-2 flex justify-center sm:justify-start items-center">
                          <RefreshCw className="h-6 w-6 text-cyan-400 animate-spin" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center sm:justify-start gap-3">
                          <span className="text-3xl font-mono font-extrabold tracking-widest text-cyan-300 drop-shadow">
                            {code}
                          </span>
                          <button
                            onClick={handleCopy}
                            title="Copy to clipboard"
                            className="p-2 text-slate-400 hover:text-cyan-400 bg-white/5 hover:bg-white/10 rounded-lg transition"
                          >
                            {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
                          </button>
                        </div>
                      )}

                      {/* Timer & Expiry */}
                      <div className="flex items-center justify-center sm:justify-start gap-2 text-xs font-medium text-slate-400">
                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                        {expiresInSeconds > 0 ? (
                          <span>
                            Expires in <span className="text-amber-400 font-semibold">{formatTime(expiresInSeconds)}</span>
                          </span>
                        ) : (
                          <span className="text-rose-400 font-semibold">Code expired</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div className="space-y-2.5 text-xs text-slate-300 bg-slate-800/30 border border-white/5 p-4 rounded-xl">
                  <p className="font-semibold text-white flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    Instant Fast Setup
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>Launch <strong className="text-slate-200">DevicePulse</strong> on your phone.</li>
                    <li>Tap <strong className="text-cyan-300">Scan Website QR Code</strong> and point at the QR box above.</li>
                    <li>The phone pairs and links in <strong className="text-emerald-400">1 second</strong>!</li>
                  </ol>
                </div>

                {/* Footer buttons */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    onClick={fetchPairingCode}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    Regenerate Code
                  </button>

                  <button
                    onClick={onClose}
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PairDeviceModal;
