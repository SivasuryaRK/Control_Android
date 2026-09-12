import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Monitor,
  Loader2,
  WifiOff,
  Maximize2,
  Minimize2,
  Camera,
  RotateCw,
  Zap,
  Smartphone,
  ChevronLeft,
  Home,
  Square,
  Bell,
  Lock,
  Volume2,
  VolumeX,
  Keyboard,
  MousePointer2,
  Send,
} from 'lucide-react';

interface Props {
  deviceId: string;
  deviceName: string;
  socket: any;
  onClose: () => void;
}

type InputMode = 'touch' | 'keyboard';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const ScreenMirrorModal: React.FC<Props> = ({ deviceId, deviceName, socket, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // Gesture tracking
  const pointerDownRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const isDraggingRef = useRef(false);

  const [status, setStatus] = useState<'waiting' | 'connecting' | 'connected' | 'error'>('waiting');
  const [error, setError] = useState('');
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState<number>(12);
  const [resolution, setResolution] = useState<{ width: number; height: number }>({ width: 540, height: 960 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>('touch');
  const [textInput, setTextInput] = useState('');
  const [remoteEnabled, setRemoteEnabled] = useState(true);
  const [lastAction, setLastAction] = useState('');

  const frameCountRef = useRef(0);
  const lastFpsCalcRef = useRef(Date.now());

  // ── Remote Input Helpers ────────────────────────────────────────────────────

  const emitRemoteInput = useCallback(
    (payload: Record<string, unknown>) => {
      if (!socket || !remoteEnabled) return;
      socket.emit('remote:input', { deviceId, ...payload });
      setLastAction(payload.type as string);
      setTimeout(() => setLastAction(''), 800);
    },
    [socket, deviceId, remoteEnabled]
  );

  // ── Canvas Normalized Coordinate Helpers ────────────────────────────────────

  const getCanvasNorm = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    },
    []
  );

  // ── Pointer Event Handlers (touch + mouse) ──────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (inputMode !== 'touch' || status !== 'connected') return;
      e.preventDefault();
      const canvas = canvasRef.current;
      canvas?.setPointerCapture(e.pointerId);
      const coord = getCanvasNorm(e.clientX, e.clientY);
      if (coord) {
        pointerDownRef.current = { x: coord.x, y: coord.y, t: Date.now() };
        isDraggingRef.current = false;
      }
    },
    [inputMode, status, getCanvasNorm]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointerDownRef.current || status !== 'connected') return;
      const coord = getCanvasNorm(e.clientX, e.clientY);
      if (!coord) return;
      const dx = Math.abs(coord.x - pointerDownRef.current.x);
      const dy = Math.abs(coord.y - pointerDownRef.current.y);
      if (dx > 0.015 || dy > 0.015) {
        isDraggingRef.current = true;
      }
    },
    [status, getCanvasNorm]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const down = pointerDownRef.current;
      if (!down || status !== 'connected') return;
      pointerDownRef.current = null;

      const coord = getCanvasNorm(e.clientX, e.clientY);
      if (!coord) return;

      const duration = Date.now() - down.t;

      if (isDraggingRef.current) {
        // Swipe gesture
        emitRemoteInput({
          type: 'swipe',
          x1: down.x,
          y1: down.y,
          x2: coord.x,
          y2: coord.y,
          durationMs: Math.min(duration, 800),
        });
      } else if (duration > 600) {
        // Long press
        emitRemoteInput({ type: 'longpress', x: down.x, y: down.y });
      } else {
        // Tap / click
        emitRemoteInput({ type: 'click', x: down.x, y: down.y });
      }
      isDraggingRef.current = false;
    },
    [status, getCanvasNorm, emitRemoteInput]
  );

  // ── Frame Reception & WebRTC ────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    setStatus('waiting');
    setError('');

    socket.emit('screen:start', { deviceId });
    const startRetryTimer = setInterval(() => {
      socket.emit('screen:start', { deviceId });
    }, 2500);

    const handleFrame = (data: {
      deviceId: string;
      image: string;
      width?: number;
      height?: number;
      timestamp?: number | string;
    }) => {
      if (data.deviceId !== deviceId) return;
      setStatus('connected');
      if (data.width && data.height) setResolution({ width: data.width, height: data.height });
      if (data.timestamp) {
        const ft = typeof data.timestamp === 'string' ? Number(data.timestamp) : data.timestamp;
        if (!isNaN(ft)) setLatency(Math.max(4, Date.now() - ft));
      }
      const canvas = canvasRef.current;
      if (canvas && data.image) {
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
          if (canvas.width !== img.width || canvas.height !== img.height) {
            canvas.width = img.width;
            canvas.height = img.height;
          }
          ctx?.drawImage(img, 0, 0);
          frameCountRef.current++;
        };
        img.src = data.image;
      }
    };

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setStatus('connected');
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('screen:ice', { deviceId, candidate: event.candidate.toJSON() });
      }
    };

    const handleOffer = async (data: { deviceId: string; sdp: RTCSessionDescriptionInit }) => {
      if (data.deviceId !== deviceId) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('screen:answer', { deviceId, sdp: answer });
      } catch (err: any) {
        console.warn('[WebRTC] Answer error:', err);
      }
    };

    const handleIce = (data: { deviceId: string; candidate: RTCIceCandidateInit }) => {
      if (data.deviceId !== deviceId) return;
      pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
    };

    const handleStopped = (data: { deviceId: string }) => {
      if (data.deviceId === deviceId) setStatus('waiting');
    };

    socket.on('screen:frame', handleFrame);
    socket.on('screen:offer', handleOffer);
    socket.on('screen:ice', handleIce);
    socket.on('screen:stopped', handleStopped);

    const fpsTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastFpsCalcRef.current) / 1000;
      if (elapsed > 0) {
        setFps(Math.round(frameCountRef.current / elapsed));
        frameCountRef.current = 0;
        lastFpsCalcRef.current = now;
      }
    }, 1000);

    return () => {
      clearInterval(fpsTimer);
      clearInterval(startRetryTimer);
      socket.off('screen:frame', handleFrame);
      socket.off('screen:offer', handleOffer);
      socket.off('screen:ice', handleIce);
      socket.off('screen:stopped', handleStopped);
      socket.emit('screen:stop', { deviceId });
      pc.close();
      pcRef.current = null;
    };
  }, [deviceId, socket]);

  const handleClose = () => {
    if (socket) socket.emit('screen:stop', { deviceId });
    onClose();
  };

  const takeScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `screenshot-${deviceName}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [deviceName]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const sendKey = (key: string) => emitRemoteInput({ type: 'key', key });

  const sendText = () => {
    if (!textInput.trim()) return;
    emitRemoteInput({ type: 'text', text: textInput });
    setTextInput('');
  };

  // ── Remote Control Bar Buttons ───────────────────────────────────────────────

  const rcButtons = [
    { icon: <ChevronLeft className="h-5 w-5" />, key: 'back', label: 'Back', color: 'text-rose-400 hover:bg-rose-500/20' },
    { icon: <Home className="h-5 w-5" />, key: 'home', label: 'Home', color: 'text-emerald-400 hover:bg-emerald-500/20' },
    { icon: <Square className="h-5 w-5" />, key: 'recents', label: 'Recents', color: 'text-blue-400 hover:bg-blue-500/20' },
    { icon: <Bell className="h-5 w-5" />, key: 'notifications', label: 'Notifs', color: 'text-amber-400 hover:bg-amber-500/20' },
    { icon: <Lock className="h-5 w-5" />, key: 'lock', label: 'Lock', color: 'text-purple-400 hover:bg-purple-500/20' },
    { icon: <Volume2 className="h-5 w-5" />, key: 'volume_up', label: 'Vol+', color: 'text-sky-400 hover:bg-sky-500/20' },
    { icon: <VolumeX className="h-5 w-5" />, key: 'volume_down', label: 'Vol-', color: 'text-sky-400 hover:bg-sky-500/20' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div
        ref={containerRef}
        className="glass-modal w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[96vh]"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-slate-900/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Smartphone className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">{deviceName} — Live Mirror</h3>
              <p className="text-xs text-slate-400 font-mono">
                {resolution.width}×{resolution.height} · {latency}ms · {fps} FPS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Stream Status */}
            <span
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                status === 'connected'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : status === 'connecting'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : status === 'error'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {status === 'connected' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </>
              )}
              {status === 'connecting' && <><Loader2 className="w-3 h-3 animate-spin" /> Connecting…</>}
              {status === 'waiting' && <><WifiOff className="w-3 h-3" /> Waiting…</>}
              {status === 'error' && 'Error'}
            </span>

            {/* Action Tools */}
            <div className="flex items-center gap-1 bg-slate-800/80 border border-white/5 rounded-xl p-1">
              {/* Remote Control Toggle */}
              <button
                id="rc-toggle"
                onClick={() => setRemoteEnabled((v) => !v)}
                className={`p-1.5 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1 px-2 ${
                  remoteEnabled
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
                    : 'hover:bg-white/10 text-slate-500'
                }`}
                title={remoteEnabled ? 'Remote Control Active' : 'Remote Control Disabled'}
              >
                <MousePointer2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{remoteEnabled ? 'Control ON' : 'Control OFF'}</span>
              </button>
              <button
                id="screenshot-btn"
                onClick={takeScreenshot}
                disabled={status !== 'connected'}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors disabled:opacity-30"
                title="Screenshot"
              >
                <Camera className="h-4 w-4" />
              </button>
              <button
                onClick={() => setRotation((p) => (p + 90) % 360)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="Rotate"
              >
                <RotateCw className="h-4 w-4" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>

            <button onClick={handleClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Main Content: Screen + Controls ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Screen Area */}
          <div className="relative bg-slate-950 flex items-center justify-center p-3 flex-1 overflow-hidden">
            {/* Touch feedback indicator */}
            {lastAction && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-indigo-600/80 text-white text-xs px-3 py-1 rounded-full border border-indigo-400/40 animate-fadeIn pointer-events-none">
                {lastAction === 'click' ? '👆 Tap' : lastAction === 'swipe' ? '👆 Swipe' : lastAction === 'longpress' ? '👆 Long Press' : lastAction === 'key' ? '⌨️ Key' : lastAction === 'text' ? '⌨️ Text Sent' : lastAction}
              </div>
            )}

            {/* Canvas for Frame Streaming — interactive */}
            <canvas
              ref={canvasRef}
              style={{
                transform: `rotate(${rotation}deg)`,
                maxWidth: rotation % 180 === 0 ? '380px' : '640px',
                maxHeight: '70vh',
                cursor: remoteEnabled && status === 'connected' ? 'crosshair' : 'default',
                touchAction: 'none',
              }}
              className={`w-auto h-auto rounded-2xl shadow-2xl border transition-transform duration-300 select-none ${
                status !== 'connected' ? 'hidden' : 'block'
              } ${
                remoteEnabled && status === 'connected'
                  ? 'border-indigo-500/50 ring-1 ring-indigo-500/20'
                  : 'border-slate-800'
              }`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                pointerDownRef.current = null;
                isDraggingRef.current = false;
              }}
            />

            {/* WebRTC Video Fallback */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{
                transform: `rotate(${rotation}deg)`,
                maxWidth: rotation % 180 === 0 ? '380px' : '640px',
                maxHeight: '70vh',
              }}
              className="hidden w-auto h-auto rounded-2xl shadow-2xl border border-slate-800"
            />

            {/* Waiting/Error Placeholders */}
            {status !== 'connected' && (
              <div className="flex flex-col items-center gap-4 text-center p-8 max-w-md animate-fadeIn">
                {status === 'error' ? (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                      <WifiOff className="h-8 w-8 text-rose-400" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold mb-1">Mirroring Interrupted</h4>
                      <p className="text-rose-400 text-xs">{error || 'Stream lost or device disconnected.'}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      {status === 'connecting' ? (
                        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                      ) : (
                        <Monitor className="h-8 w-8 text-indigo-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-white font-bold mb-1">
                        {status === 'connecting' ? 'Establishing Mirror Stream…' : 'Waiting for Screen Stream'}
                      </h4>
                      <p className="text-slate-400 text-xs leading-relaxed">
                        The Android app will automatically start streaming. If it doesn't appear, ensure the app is open and screen share is active.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Remote Control Sidebar ── */}
          <div className="w-56 flex-shrink-0 border-l border-white/10 bg-slate-900/70 flex flex-col gap-3 p-3 overflow-y-auto">
            {/* Mode toggle */}
            <div className="flex rounded-xl overflow-hidden border border-white/10 text-xs">
              <button
                onClick={() => setInputMode('touch')}
                className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors font-medium ${
                  inputMode === 'touch' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                <MousePointer2 className="h-3.5 w-3.5" /> Touch
              </button>
              <button
                onClick={() => setInputMode('keyboard')}
                className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors font-medium ${
                  inputMode === 'keyboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                <Keyboard className="h-3.5 w-3.5" /> Type
              </button>
            </div>

            {/* Text input area (keyboard mode) */}
            {inputMode === 'keyboard' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-400 leading-snug">
                  Types text into the currently focused input field on the phone.
                </p>
                <textarea
                  id="remote-text-input"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendText();
                    }
                  }}
                  rows={3}
                  placeholder="Type text to send…"
                  className="w-full bg-slate-800/80 border border-white/10 rounded-xl text-white text-xs p-2.5 resize-none focus:outline-none focus:border-indigo-500/50 placeholder:text-slate-600"
                />
                <button
                  id="send-text-btn"
                  onClick={sendText}
                  disabled={!textInput.trim()}
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" /> Send Text
                </button>
              </div>
            )}

            {/* Touch mode hint */}
            {inputMode === 'touch' && (
              <div className="rounded-xl bg-slate-800/60 border border-white/5 p-2.5 text-xs text-slate-400 leading-snug">
                <p className="font-semibold text-slate-300 mb-1">Touch Controls</p>
                <p>• <span className="text-white">Tap</span> — click</p>
                <p>• <span className="text-white">Hold 0.6s</span> — long press</p>
                <p>• <span className="text-white">Drag</span> — swipe</p>
              </div>
            )}

            {/* Hardware Key Buttons */}
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2 px-0.5">Hardware Keys</p>
              <div className="grid grid-cols-1 gap-1.5">
                {rcButtons.map((btn) => (
                  <button
                    key={btn.key}
                    id={`rc-key-${btn.key}`}
                    onClick={() => sendKey(btn.key)}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl bg-slate-800/70 border border-white/5 text-xs font-medium transition-all active:scale-95 ${btn.color}`}
                    title={btn.label}
                  >
                    {btn.icon}
                    <span>{btn.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Accessibility status indicator */}
            <div className="rounded-xl bg-slate-800/40 border border-white/5 p-2.5 text-xs text-slate-500 leading-snug mt-auto">
              <p className="text-slate-400 font-semibold mb-0.5">Remote Control</p>
              <p>Requires Accessibility Service enabled on phone. Navigate: Settings → Accessibility → DevicePulse.</p>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-2.5 border-t border-white/10 bg-slate-900/60 flex items-center justify-between text-xs flex-shrink-0">
          <div className="flex items-center gap-2 text-slate-400">
            <Zap className="h-3.5 w-3.5 text-indigo-400" />
            <span>
              {remoteEnabled
                ? 'Remote control active — tap/swipe the mirror to control the phone'
                : 'Remote control disabled — enable to interact'}
            </span>
          </div>
          <button onClick={handleClose} className="btn-secondary text-xs px-4 py-1.5">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScreenMirrorModal;
