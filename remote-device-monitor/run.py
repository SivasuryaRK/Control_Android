#!/usr/bin/env python3
"""
DevicePulse - Remote Device Monitor
Unified Project Runner Script with Public Remote Tunnel Support

This script automatically:
1. Detects backend, frontend, and android directories.
2. Cleans up lingering processes on ports 3000 and 5173.
3. Installs missing npm dependencies if needed.
4. Starts the Backend API & Socket.IO server (Port 3000).
5. Starts the Frontend Web Dashboard (Port 5173).
6. Starts a Public HTTPS Tunnel (ngrok / localtunnel) for remote devices across different networks (Cellular 4G/5G, different Wi-Fi).
7. Displays all connection URLs (Local Wi-Fi IP + Public Tunnel HTTPS URL).
8. Opens the dashboard in your default browser.
9. Streams prefixed live logs in real time.
10. Gracefully shuts down all child processes and tunnels on Ctrl+C.
"""

import os
import re
import sys
import time
import socket
import signal
import shutil
import threading
import subprocess
import webbrowser
from pathlib import Path

# ANSI colors for beautiful terminal output
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
RESET = "\033[0m"


def print_banner():
    print(f"""{CYAN}{BOLD}
╔══════════════════════════════════════════════════════════════╗
║               DevicePulse - Project Launcher                 ║
║           Remote Device Monitor & Socket.IO Fleet            ║
╚══════════════════════════════════════════════════════════════╝{RESET}
""")


def get_project_paths():
    current_dir = Path(__file__).resolve().parent
    if (current_dir / "remote-device-monitor").exists():
        base_dir = current_dir / "remote-device-monitor"
    else:
        base_dir = current_dir

    backend_dir = base_dir / "backend"
    frontend_dir = base_dir / "frontend"
    android_dir = base_dir / "android"

    return backend_dir, frontend_dir, android_dir


def get_local_ips():
    """Retrieve non-loopback IPv4 addresses."""
    ips = []
    try:
        if sys.platform == "win32":
            cmd = 'Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -ExpandProperty IPAddress'
            out = subprocess.check_output(["powershell", "-NoProfile", "-Command", cmd], text=True)
            ips = [line.strip() for line in out.strip().splitlines() if line.strip()]
        else:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ips = [s.getsockname()[0]]
            s.close()
    except Exception:
        pass
    return ips


def kill_port(port: int):
    """Kill any process listening on the given port (Windows & Unix)."""
    if sys.platform == "win32":
        try:
            cmd = f'Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}'
            subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True)
        except Exception:
            pass
    else:
        try:
            subprocess.run(f"fuser -k {port}/tcp", shell=True, capture_output=True)
        except Exception:
            pass


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("localhost", port)) == 0


def wait_for_port(port: int, timeout: float = 20.0) -> bool:
    start_time = time.time()
    while time.time() - start_time < timeout:
        if is_port_in_use(port):
            return True
        time.sleep(0.5)
    return False


def stream_output(process, prefix, color):
    """Streams stdout/stderr lines with a colorful prefix."""
    try:
        for line in iter(process.stdout.readline, ""):
            if line:
                print(f"{color}[{prefix}]{RESET} {line.rstrip()}")
        process.stdout.close()
    except Exception:
        pass


def check_dependencies(backend_dir: Path, frontend_dir: Path):
    npm_cmd = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm_cmd:
        print(f"{RED}[Error] Node.js and npm are required but were not found in PATH.{RESET}")
        sys.exit(1)

    # Check backend node_modules
    if not (backend_dir / "node_modules").exists():
        print(f"{YELLOW}[Setup] Installing backend dependencies...{RESET}")
        subprocess.run([npm_cmd, "install"], cwd=str(backend_dir), check=True)

    # Check frontend node_modules
    if not (frontend_dir / "node_modules").exists():
        print(f"{YELLOW}[Setup] Installing frontend dependencies...{RESET}")
        subprocess.run([npm_cmd, "install"], cwd=str(frontend_dir), check=True)


def start_public_tunnel(port=3000):
    """
    Creates a secure public HTTPS tunnel so phones on different networks
    (cellular data / 4G / 5G / external Wi-Fi) can connect seamlessly.
    Tries pyngrok / ngrok first, then falls back to npx localtunnel.
    """
    # 1. Try pyngrok / ngrok
    try:
        from pyngrok import ngrok
        tunnel = ngrok.connect(port, "http")
        url = tunnel.public_url.replace("http://", "https://")
        return {"type": "ngrok", "url": url, "cleanup": lambda: ngrok.kill()}
    except Exception:
        pass

    # 2. Try npx localtunnel
    npx_cmd = shutil.which("npx") or shutil.which("npx.cmd")
    if npx_cmd:
        try:
            proc = subprocess.Popen(
                [npx_cmd, "-y", "localtunnel", "--port", str(port)],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )
            # Read first lines to capture the URL
            tunnel_url = None
            for _ in range(20):
                line = proc.stdout.readline()
                match = re.search(r'(https://[a-zA-Z0-9\-\.]+\.loca\.lt)', line)
                if match:
                    tunnel_url = match.group(1)
                    break
                time.sleep(0.3)

            if tunnel_url:
                return {
                    "type": "localtunnel",
                    "url": tunnel_url,
                    "process": proc,
                    "cleanup": lambda: proc.terminate()
                }
        except Exception:
            pass

    return None


def main():
    print_banner()

    backend_dir, frontend_dir, android_dir = get_project_paths()

    print(f"{CYAN}📁 Backend directory:{RESET}  {backend_dir}")
    print(f"{CYAN}📁 Frontend directory:{RESET} {frontend_dir}")
    print(f"{CYAN}📁 Android directory:{RESET}  {android_dir}\n")

    # Verify paths
    if not backend_dir.exists() or not frontend_dir.exists():
        print(f"{RED}[Error] Could not locate backend or frontend directory.{RESET}")
        sys.exit(1)

    print(f"{YELLOW}🔍 Checking dependencies and clearing ports...{RESET}")
    kill_port(3000)
    kill_port(5173)
    check_dependencies(backend_dir, frontend_dir)

    npm_cmd = shutil.which("npm") or shutil.which("npm.cmd")
    processes = []
    tunnel_info = None

    def shutdown():
        print(f"\n{YELLOW}🛑 Stopping all services and tunnels...{RESET}")
        if tunnel_info and "cleanup" in tunnel_info:
            try:
                tunnel_info["cleanup"]()
            except Exception:
                pass
        for p in processes:
            try:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
                else:
                    p.terminate()
            except Exception:
                pass
        kill_port(3000)
        kill_port(5173)
        print(f"{GREEN}✔ All services stopped successfully.{RESET}")

    def sigint_handler(sig, frame):
        shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, sigint_handler)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, sigint_handler)

    # ── Start Backend ──
    print(f"{GREEN}🚀 Starting Backend API & Socket.IO server on port 3000...{RESET}")
    backend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=str(backend_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    processes.append(backend_proc)
    threading.Thread(target=stream_output, args=(backend_proc, "Backend", MAGENTA), daemon=True).start()

    # ── Start Frontend ──
    print(f"{GREEN}🚀 Starting Frontend Dashboard on port 5173...{RESET}")
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=str(frontend_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    processes.append(frontend_proc)
    threading.Thread(target=stream_output, args=(frontend_proc, "Frontend", CYAN), daemon=True).start()

    # Wait for servers to be ready
    backend_ready = wait_for_port(3000, timeout=15.0)
    frontend_ready = wait_for_port(5173, timeout=15.0)

    # ── Start Public Remote Tunnel (for Cellular 5G / Remote Wi-Fi) ──
    print(f"{YELLOW}🌐 Creating public remote tunnel for cross-network access...{RESET}")
    tunnel_info = start_public_tunnel(3000)
    if tunnel_info and "process" in tunnel_info:
        processes.append(tunnel_info["process"])

    local_ips = get_local_ips()

    print("\n" + "=" * 68)
    if backend_ready:
        print(f"{GREEN}✔ Backend API is LIVE:{RESET}      http://localhost:3000")
        print(f"{GREEN}✔ Health check endpoint:{RESET}   http://localhost:3000/health")
    else:
        print(f"{YELLOW}⚠ Backend starting up on:{RESET} http://localhost:3000")

    if frontend_ready:
        print(f"{GREEN}✔ Frontend Dashboard LIVE:{RESET} http://localhost:5173")
    else:
        print(f"{YELLOW}⚠ Frontend starting up on:{RESET} http://localhost:5173")

    print("-" * 68)
    print(f"{BOLD}📱 Android Connection Instructions:{RESET}")

    if tunnel_info and "url" in tunnel_info:
        print(f"\n{BOLD}{GREEN}🌍 WORLDWIDE / CELLULAR (5G / 4G / Different Wi-Fi):{RESET}")
        print(f"   👉 Server URL: {BOLD}{CYAN}{tunnel_info['url']}{RESET}")
        print(f"   (In your phone app, tap the top banner and paste the URL above!)")

    if local_ips:
        print(f"\n{BOLD}🏠 SAME WI-FI / LOCAL NETWORK:{RESET}")
        for ip in local_ips:
            print(f"   👉 Server URL: {CYAN}http://{ip}:3000{RESET}")

    print(f"\n{BOLD}💻 ANDROID EMULATOR:{RESET}")
    print(f"   👉 Server URL: {CYAN}http://10.0.2.2:3000{RESET}")

    print("=" * 68)
    print(f"{BOLD}Press Ctrl+C at any time to stop all services.{RESET}\n")

    # Automatically open browser to dashboard
    time.sleep(1)
    webbrowser.open("http://localhost:5173")

    # Keep main thread alive while children run
    try:
        while True:
            time.sleep(1)
            for p in processes:
                if p.poll() is not None:
                    print(f"{RED}[Warning] A process terminated unexpectedly (code: {p.returncode}).{RESET}")
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()
