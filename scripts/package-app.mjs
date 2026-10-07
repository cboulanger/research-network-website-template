// Packages the data editor as a desktop app (Electron) for the OS this runs on and
// puts a launcher for it on the Desktop, replacing a previous copy.
//
// LOCAL USE ONLY: the app contains a plain-text copy of .env (WebDAV password, tokens).
// Never publish or share it. The build happens under .local/ (gitignored) and is removed afterwards.
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';
import { readContentFile } from './lib/content-store.mjs';

const ELECTRON_VERSION = '44.6.0';
// What the app needs from the repo: the editor server, the build it triggers, and the default content.
const APP_FILES = ['scripts', 'schema', 'assets', 'content', 'package-lock.json'];
// Tooling that is not needed at run time.
const DEV_ONLY_DEPENDENCIES = ['semantic-release', '@electron/packager'];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, '.local', 'app-build');
const stageDir = path.join(buildDir, 'stage');

// The app is named after the site: "<bannerLabel> Editor" (bannerLabel from data/site.json in CONTENT_PATH).
async function resolveAppName() {
  const contentPath = process.env.CONTENT_PATH || path.join(root, 'content');
  try {
    const { bannerLabel } = JSON.parse(await readContentFile(contentPath, 'data/site.json'));
    // The name ends up in file names, so drop characters that are not allowed there.
    const label = String(bannerLabel).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim();
    if (label) return `${label} Editor`;
  } catch (err) {
    console.warn(`Could not read bannerLabel from site.json (${err.message}); naming the app "Site Editor".`);
  }
  return 'Site Editor';
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

function desktopDir() {
  if (process.env.DESKTOP_DIR) return process.env.DESKTOP_DIR;
  const query =
    process.platform === 'win32' ? ['powershell', ['-NoProfile', '-Command', '[Environment]::GetFolderPath("Desktop")']]
    : process.platform === 'linux' ? ['xdg-user-dir', ['DESKTOP']]
    : null;
  if (query) {
    const result = spawnSync(query[0], query[1], { encoding: 'utf8' });
    const dir = result.status === 0 ? result.stdout.trim() : '';
    if (dir && existsSync(dir)) return dir;
  }
  return path.join(os.homedir(), 'Desktop');
}

async function stage() {
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });
  for (const name of APP_FILES) await cp(path.join(root, name), path.join(stageDir, name), { recursive: true });

  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const dependencies = Object.fromEntries(
    Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([name]) => !DEV_ONLY_DEPENDENCIES.includes(name))
  );
  const appPkg = {
    name: pkg.name,
    productName: APP_NAME,
    version: '1.0.0',
    private: true,
    type: 'module',
    main: 'scripts/electron/main.mjs',
    dependencies,
  };
  await writeFile(path.join(stageDir, 'package.json'), JSON.stringify(appPkg, null, 2));
  run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: stageDir });

  if (existsSync(path.join(root, '.env'))) {
    await cp(path.join(root, '.env'), path.join(stageDir, '.env'));
  } else {
    console.warn('No .env found: the app will use the generic content/ and have no deploy or inbox credentials.');
  }
}

async function replace(source, target) {
  try {
    await rm(target, { recursive: true, force: true });
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') throw new Error(`Could not replace ${target}: close the running app first.`);
    throw err;
  }
  await cp(source, target, { recursive: true, verbatimSymlinks: true });
}

// The Desktop gets a single launcher: the .app bundle on macOS, a shortcut elsewhere. The app folder
// (executable + resources) lives in the user's application directory.
async function install(packagedDir) {
  const desktop = desktopDir();
  if (process.platform === 'darwin') {
    const target = path.join(desktop, `${APP_NAME}.app`);
    await replace(path.join(packagedDir, `${APP_NAME}.app`), target);
    return target;
  }
  const appDir = path.join(
    process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs')
    : path.join(os.homedir(), '.local', 'share'),
    APP_NAME
  );
  await replace(packagedDir, appDir);

  if (process.platform === 'win32') {
    const exe = path.join(appDir, `${APP_NAME}.exe`);
    const target = path.join(desktop, `${APP_NAME}.lnk`);
    const script = `$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK); $s.TargetPath = $env:EXE; $s.WorkingDirectory = $env:APPDIR; $s.IconLocation = $env:EXE; $s.Save()`;
    run('powershell', ['-NoProfile', '-Command', script], { env: { ...process.env, LNK: target, EXE: exe, APPDIR: appDir }, shell: false });
    return target;
  }
  const target = path.join(desktop, `${APP_NAME}.desktop`);
  await writeFile(
    target,
    `[Desktop Entry]
Type=Application
Name=${APP_NAME}
Exec="${path.join(appDir, APP_NAME)}"
Path=${appDir}
Terminal=false
`,
    { mode: 0o755 }
  );
  return target;
}

if (process.env.CI) {
  console.error('Refusing to package in CI: the app embeds .env and is for local use only.');
  process.exit(1);
}

const APP_NAME = await resolveAppName();
await stage();
const [packagedDir] = await packager({
  dir: stageDir,
  out: path.join(buildDir, 'out'),
  name: APP_NAME,
  platform: process.platform,
  arch: process.arch,
  electronVersion: ELECTRON_VERSION,
  asar: false,
  prune: false,
  overwrite: true,
});
const target = await install(packagedDir);
await rm(buildDir, { recursive: true, force: true });
console.log(`\n${APP_NAME} installed at ${target}\nIt contains your .env in plain text: keep it local, never publish or share it.`);
