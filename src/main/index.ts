import { app, BrowserWindow, Menu, protocol, session, shell } from 'electron'
import { join } from 'node:path'
import { APP_ID, APP_NAME } from '../shared/constants'
import { FILE_SCHEME } from '../shared/fileUrl'
import { registerFileProtocol } from './file-protocol'
import { registerIpcHandlers } from './ipc'
import { log, logError } from './logger'
import type { CopyService } from './copy-service'
import type { DuplicateService } from './duplicate-service'

protocol.registerSchemesAsPrivileged([
  {
    scheme: FILE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: false
    }
  }
])

let mainWindow: BrowserWindow | null = null
let copyService: CopyService | null = null
let duplicateService: DuplicateService | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: '#0b0f14',
    title: APP_NAME,
    autoHideMenuBar: true,
    useContentSize: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    logError('Fenster laden', `${code} ${description}`)
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    if (process.platform === 'win32') {
      app.setAppUserModelId(APP_ID)
    }
    Menu.setApplicationMenu(null)
    registerFileProtocol()

    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => {
        callback(false)
      }
    )

    try {
      const services = await registerIpcHandlers(() => mainWindow)
      copyService = services.copy
      duplicateService = services.duplicates
      await log('info', `${APP_NAME} ${app.getVersion()} gestartet`)
    } catch (error) {
      logError('Initialisierung', error)
    }

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    copyService?.cancelAll()
    duplicateService?.cancelAll()
  })

  process.on('uncaughtException', (error) => {
    logError('Unbehandelte Ausnahme', error)
  })

  process.on('unhandledRejection', (reason) => {
    logError('Unbehandelte Promise-Ablehnung', reason)
  })
}
