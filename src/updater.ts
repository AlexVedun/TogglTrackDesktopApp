import { app, type BrowserWindow, dialog, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';

const GITHUB_OWNER = 'AlexVedun';
const GITHUB_REPO = 'TogglTrackDesktopApp';
const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const LATEST_RELEASE_WEB_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  html_url?: string;
  assets?: GitHubReleaseAsset[];
}

function parseSemver(raw: string): [number, number, number] | null {
  const cleaned = raw.trim().replace(/^v/i, '');
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(cleaned);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = parseSemver(latest);
  const currentParts = parseSemver(current);
  if (!latestParts || !currentParts) return false;
  for (let i = 0; i < 3; i++) {
    if (latestParts[i] > currentParts[i]) return true;
    if (latestParts[i] < currentParts[i]) return false;
  }
  return false;
}

function fetchJson<T>(url: string, redirectsLeft = 5): Promise<T> {
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `${GITHUB_REPO}/${app.getVersion()}`
        }
      },
      res => {
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          resolve(fetchJson<T>(nextUrl, redirectsLeft - 1));
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status} when fetching ${url}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf8');
            resolve(JSON.parse(text) as T);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on('error', reject);
  });
}

function downloadFileWithProgress(
  url: string,
  destinationPath: string,
  onProgress?: (fraction: number) => void,
  redirectsLeft = 5
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) {
      reject(new Error('Too many redirects while downloading update'));
      return;
    }

    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': `${GITHUB_REPO}/${app.getVersion()}`
        }
      },
      res => {
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          resolve(downloadFileWithProgress(nextUrl, destinationPath, onProgress, redirectsLeft - 1));
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status} while downloading ${url}`));
          return;
        }

        const totalBytes = Number(res.headers['content-length'] ?? 0);
        let receivedBytes = 0;

        const fileStream = fs.createWriteStream(destinationPath);
        res.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (totalBytes > 0 && onProgress) {
            onProgress(Math.min(1, receivedBytes / totalBytes));
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        fileStream.on('error', err => {
          res.destroy();
          fs.unlink(destinationPath, () => reject(err));
        });
      }
    );

    req.on('error', err => {
      fs.unlink(destinationPath, () => reject(err));
    });
  });
}

function showMessageBox(
  getWindow: () => BrowserWindow | null,
  options: Electron.MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    return dialog.showMessageBox(win, options);
  }
  return dialog.showMessageBox(options);
}

const DESKTOP_NAME = 'dev.toggltrack.wrapper';

function updateLinuxDesktopEntryIfPresent(newAppImagePath: string): void {
  try {
    const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    const desktopFile = path.join(dataHome, 'applications', `${DESKTOP_NAME}.desktop`);
    if (!fs.existsSync(desktopFile)) return;

    const escapedPath = newAppImagePath
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"')
      .replaceAll('$', '\\$')
      .replaceAll('`', '\\`');

    const content = fs.readFileSync(desktopFile, 'utf8');
    const updated = content.replace(/^Exec=.*$/m, `Exec="${escapedPath}" %U`);
    if (updated !== content) {
      fs.writeFileSync(desktopFile, updated, { mode: 0o644 });
    }
  } catch (error) {
    console.error('Failed to update Linux desktop entry path:', error);
  }
}

function setupElectronAutoUpdater(getWindow: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on('error', error => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.setProgressBar(-1);
    }
    console.error('Auto-update error:', error);
  });

  if (process.platform === 'linux') {
    autoUpdater.on('appimage-filename-updated', newPath => {
      updateLinuxDesktopEntryIfPresent(newPath);
    });
  }

  autoUpdater.on('update-available', async info => {
    try {
      const { response } = await showMessageBox(getWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available.`,
        detail: `Current version: ${app.getVersion()}\nWould you like to download and install the update?`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1
      });

      if (response === 0) {
        await autoUpdater.downloadUpdate();
      }
    } catch (error) {
      console.error('Failed to download update:', error);
    }
  });

  autoUpdater.on('download-progress', progress => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.setProgressBar(Math.min(1, Math.max(0, progress.percent / 100)));
    }
  });

  autoUpdater.on('update-downloaded', async info => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.setProgressBar(-1);
    }

    const { response } = await showMessageBox(getWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart the application now to install the update?',
      buttons: ['Restart and Install', 'Install on Quit'],
      defaultId: 0,
      cancelId: 1
    });

    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  void autoUpdater.checkForUpdates().catch(error => {
    console.error('Failed to check for updates:', error);
  });
}

async function checkMacOsUpdates(getWindow: () => BrowserWindow | null): Promise<void> {
  try {
    const release = await fetchJson<GitHubRelease>(LATEST_RELEASE_API_URL);
    if (!release?.tag_name || !isNewerVersion(release.tag_name, app.getVersion())) {
      return;
    }

    const latestVersion = release.tag_name.replace(/^v/i, '');
    const dmgAsset = release.assets?.find(asset => asset.name.toLowerCase().endsWith('.dmg'));

    const { response } = await showMessageBox(getWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${latestVersion}) is available.`,
      detail: `Current version: ${app.getVersion()}\nWould you like to download the update?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    });

    if (response !== 0) return;

    if (!dmgAsset) {
      await shell.openExternal(release.html_url || LATEST_RELEASE_WEB_URL);
      return;
    }

    const safeFileName = path.basename(dmgAsset.name);
    const destinationPath = path.join(os.tmpdir(), safeFileName);

    const win = getWindow();
    await downloadFileWithProgress(dmgAsset.browser_download_url, destinationPath, fraction => {
      const currentWin = getWindow();
      if (currentWin && !currentWin.isDestroyed()) {
        currentWin.setProgressBar(fraction);
      }
    });

    if (win && !win.isDestroyed()) {
      win.setProgressBar(-1);
    }

    const { response: installResponse } = await showMessageBox(getWindow, {
      type: 'info',
      title: 'Update Downloaded',
      message: `${safeFileName} has been downloaded.`,
      detail: 'Open the disk image and quit the application to replace it in Applications?',
      buttons: ['Open Installer and Quit', 'Show in Finder'],
      defaultId: 0,
      cancelId: 1
    });

    if (installResponse === 0) {
      const openError = await shell.openPath(destinationPath);
      if (openError) {
        shell.showItemInFolder(destinationPath);
      }
      app.quit();
    } else {
      shell.showItemInFolder(destinationPath);
    }
  } catch (error) {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.setProgressBar(-1);
    }
    console.error('Failed to check or download macOS update:', error);
  }
}

export function checkForUpdatesOnStartup(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return;

  if (process.platform === 'win32' || process.platform === 'linux') {
    setupElectronAutoUpdater(getWindow);
  } else if (process.platform === 'darwin') {
    void checkMacOsUpdates(getWindow);
  }
}
