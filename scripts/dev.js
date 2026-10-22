const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 5173;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const vite = spawn(npx, ['vite'], { cwd: ROOT, stdio: 'inherit', shell: true });

// On Windows, child.kill() only kills the shell wrapper — the node process
// running Vite survives and keeps holding the port, so the next `npm run dev`
// fails with EADDRINUSE. Kill the whole process tree instead.
let cleanedUp = false;
function stopVite() {
  if (cleanedUp) return;
  cleanedUp = true;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${vite.pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-vite.pid, 'SIGTERM');
    }
  } catch (e) {
    vite.kill();
  }
}

function waitForPort(attempt = 0) {
  if (attempt > 120) {
    console.error(`Vite did not open port ${PORT} in time.`);
    stopVite();
    process.exit(1);
  }
  // Probe 'localhost' rather than '127.0.0.1' — on Windows Vite binds the
  // IPv6 loopback (::1), so a v4-only probe never connects.
  const socket = net.connect(PORT, 'localhost');
  socket.on('connect', () => {
    socket.destroy();
    startElectron();
  });
  socket.on('error', () => {
    socket.destroy();
    setTimeout(() => waitForPort(attempt + 1), 250);
  });
}

function startElectron() {
  const electron = spawn(npx, ['electron', '.'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${PORT}` }
  });
  electron.on('close', () => {
    stopVite();
    process.exit(0);
  });
}

['SIGINT', 'SIGTERM', 'exit'].forEach((sig) => process.on(sig, stopVite));

waitForPort();
