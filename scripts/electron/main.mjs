// Electron shell for the data editor (see scripts/package-app.mjs). Runs the same
// server as `npm run edit` inside the app and shows it in its own window, with the
// number of pending public-edit suggestions as a badge.
import { app, BrowserWindow, dialog, nativeImage, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The name ("<site> Editor") is set when the app is packaged (productName in package.json).
const APP_NAME = app.getName();
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The server and the build resolve content/, assets/, public/ and .env relative to the working directory.
process.chdir(appRoot);
try {
  process.loadEnvFile(path.join(appRoot, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') console.warn(`Could not read .env: ${err.message}`);
}

const isFirstInstance = app.requestSingleInstanceLock();

let win = null;
let server = null;
let pendingCount = 0;

async function badgeImage(count) {
  const label = count > 99 ? '99+' : String(count);
  const size = label.length > 2 ? 14 : label.length > 1 ? 18 : 22;
  const dataUrl = await win.webContents.executeJavaScript(`(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d');
    x.fillStyle = '#d32f2f';
    x.beginPath();
    x.arc(16, 16, 16, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#fff';
    x.font = 'bold ${size}px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(${JSON.stringify(label)}, 16, 17);
    return c.toDataURL('image/png');
  })()`);
  return nativeImage.createFromDataURL(dataUrl);
}

// macOS dock badge and Linux (Unity launchers) via setBadgeCount; Windows taskbar overlay icon;
// the window title carries the count everywhere, including Linux desktops that ignore badges.
async function applyBadge() {
  if (!win || win.isDestroyed()) return;
  win.setTitle(pendingCount ? `${APP_NAME} (${pendingCount})` : APP_NAME);
  app.setBadgeCount(pendingCount);
  if (process.platform === 'win32') {
    try {
      win.setOverlayIcon(pendingCount ? await badgeImage(pendingCount) : null, `${pendingCount} pending suggestions`);
    } catch (err) {
      console.warn(`Could not draw the badge: ${err.message}`);
    }
  }
}

// The editor page polls the inbox only while its window is up front; this keeps the badge current regardless.
async function pollInbox(baseUrl) {
  let delay = 60_000;
  try {
    const body = await (await fetch(`${baseUrl}/api/inbox`)).json();
    if (!body.enabled) return;
    pendingCount = body.entries.length;
    delay = body.pollIntervalMs || delay;
    await applyBadge();
  } catch (err) {
    console.warn(`Inbox poll failed: ${err.message}`);
  }
  setTimeout(() => pollInbox(baseUrl), delay);
}

async function start() {
  await app.whenReady();
  const { createServerFromEnv } = await import('../edit-server.mjs');
  server = createServerFromEnv({ legacyInboxStatePaths: [path.join(app.getPath('userData'), 'inbox.json')] });
  const port = Number(process.env.EDIT_PORT) || 4848;
  const baseUrl = `http://127.0.0.1:${port}`;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  win = new BrowserWindow({ width: 1280, height: 860, title: APP_NAME });
  // The page sets its own <title>; ours carries the badge count.
  win.on('page-title-updated', (event) => event.preventDefault());
  win.webContents.on('did-finish-load', applyBadge);
  // Anything that is not the editor itself (site links, WebDAV, forges) opens in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(baseUrl)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(baseUrl);
  pollInbox(baseUrl);
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.on('window-all-closed', () => app.quit());
app.on('quit', () => server?.close());

if (isFirstInstance) {
  start().catch((err) => {
    dialog.showErrorBox(APP_NAME, `Could not start the editor: ${err.message}`);
    app.quit();
  });
} else {
  app.quit();
}
