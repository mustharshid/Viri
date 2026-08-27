const { app, BrowserWindow, session, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const https = require('https');

let mainWindow = null;

// Determine extension directory path (support development and packaged builds)
function getExtensionPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'extension');
  }
  return path.join(__dirname, '..', 'extension');
}

async function createWindow() {
  // Load the embedded Viri Chrome Extension directly into Electron session
  const extPath = getExtensionPath();
  try {
    const ext = await session.defaultSession.loadExtension(extPath, {
      allowFileAccess: true
    });
    console.log(`[Viri Standalone] Successfully loaded embedded extension: ${ext.name} (v${ext.version})`);
  } catch (err) {
    console.error(`[Viri Standalone] Failed to load extension from ${extPath}:`, err);
  }

  // Create native cashier window
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 960,
    minHeight: 650,
    title: 'Viri Cashier Terminal',
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for extensions to communicate with the page
      webSecurity: true
    }
  });

  // Target Viri Cashier URL (Pairing screen)
  const cashierUrl = process.env.VIRI_CASHIER_URL || 'https://viri.thinksafe.mv/cashier';
  mainWindow.loadURL(cashierUrl);

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('https://viri.thinksafe.mv') && !url.includes('bankofmaldives.com.mv') && !url.includes('mib.com.mv')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('check-for-updates', async () => {
  return new Promise((resolve) => {
    const req = https.get('https://viri.thinksafe.mv/api/app-version', (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          resolve({ error: 'Failed to parse version response' });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ error: e.message });
    });
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ error: 'Update check timed out' });
    });
  });
});

ipcMain.on('reload-app', () => {
  if (mainWindow) {
    mainWindow.reload();
  }
});

ipcMain.on('toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});
