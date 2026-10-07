import { app, BrowserWindow, Menu, shell, session, type MenuItemConstructorOptions } from 'electron';

const TIMER_URL = 'https://track.toggl.com/timer';
const PARTITION = 'persist:toggl-track';

let mainWindow: BrowserWindow | null = null;

function isTogglUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' &&
      (url.hostname === 'toggl.com' || url.hostname.endsWith('.toggl.com'));
  } catch {
    return false;
  }
}

function openExternalHttps(rawUrl: string): void {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'https:') {
      void shell.openExternal(url.toString());
    }
  } catch {
    // Ignore malformed links from the remote page.
  }
}

function createMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Toggl Track',
      submenu: [
        { label: 'Timer', accelerator: 'CmdOrCtrl+1', click: () => mainWindow?.loadURL(TIMER_URL) },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { label: 'Open in browser', click: () => openExternalHttps(mainWindow?.webContents.getURL() || TIMER_URL) },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Toggl Track',
    width: 1100,
    height: 780,
    minWidth: 560,
    minHeight: 480,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      partition: PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false
    }
  });

  const contents = mainWindow.webContents;

  function handleNavigation(event: Electron.Event, url: string): void {
    if (!isTogglUrl(url)) {
      event.preventDefault();
      openExternalHttps(url);
    }
  }

  contents.on('will-navigate', handleNavigation);
  contents.on('will-redirect', handleNavigation);

  contents.setWindowOpenHandler(({ url }) => {
    if (isTogglUrl(url)) {
      setImmediate(() => {
        const window = mainWindow;
        if (window && !window.isDestroyed()) void window.loadURL(url);
      });
    } else {
      openExternalHttps(url);
    }
    return { action: 'deny' };
  });

  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      console.error(`Could not load ${validatedURL}: ${errorDescription} (${errorCode})`);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  void mainWindow.loadURL(TIMER_URL);
}

app.whenReady().then(() => {
  const togglSession = session.fromPartition(PARTITION);
  togglSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(permission === 'notifications' && isTogglUrl(details.requestingUrl));
  });
  togglSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return permission === 'notifications' && isTogglUrl(requestingOrigin);
  });

  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
