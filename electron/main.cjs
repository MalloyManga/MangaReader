// main.cjs
if (require('electron-squirrel-startup')) {
    require('electron').app.quit()
    process.exit(0)
}

const { app, BrowserWindow, protocol, Menu, globalShortcut, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// 实例抽象到ctx 注入:长期存活实例(mainWindow/backend/store/paths)由 context 持有,IPC 域模块经参数读取
const { BackendService } = require('./backend-service.cjs')
const ctx = require('./ipc/context.cjs')
const { registerAll } = require('./ipc/register.cjs')

const isDev = !app.isPackaged

/** @type {import('electron').BrowserWindow} */
let mainWindow

/**
 * @type {import('./backend-service.cjs').BackendService}
 */
let backendService = null

// 配置manga://协议schema(必须在 app ready 之前,故不随 protocol.handle 迁出)
protocol.registerSchemesAsPrivileged([{
    scheme: 'manga',
    privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
    }
}])

// 为软件相关文件配置专用文件夹 避免存储到默认的C盘
if (app.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'))
    const portableDataPath = path.join(exeDir, 'data')

    try {
        // 使用同步方法设置 userData 路径 确保取代默认的C盘路径
        // 尝试创建或访问 data 目录
        if (!fs.existsSync(portableDataPath)) {
            fs.mkdirSync(portableDataPath)
        }
        // 检查写权限
        fs.accessSync(portableDataPath, fs.constants.W_OK)

        app.setPath('userData', portableDataPath)
        console.log('[Portable Mode] Enabled. Data path:', portableDataPath)
    } catch (e) {
        console.log('[Portable Mode] Failed (Permission denied?), falling back to default AppData.', e.message)
    }
}
// -------------------------------------------

function getModelsPath() {
    // 开发环境 项目根目录/models
    // 生产环境 安装目录/resources/backend/models
    return isDev
        ? path.join(__dirname, '../models')
        : path.join(process.resourcesPath, 'backend', 'models')
}

function getServicesModulesPath() {
    return isDev
        ? path.join(__dirname, '../services/modules')
        : path.join(app.getPath('userData'), 'services', 'modules')
}

// 配置文件损坏恢复:删除损坏文件后用默认值重建(Malloy 拍板:不做备份,直接删)
// 触发场景:config.json 被手动编辑写坏,或极罕见的写入故障(conf 默认不开 clearInvalidConfig,JSON.parse 直接抛错)
function recoverCorruptedStore(configPath, error) {
    console.error('[Store] 配置文件损坏,将删除并重建为默认配置:', error.message)
    try {
        fs.unlinkSync(configPath)
    } catch (e) {
        // 删除失败(权限等)时后续重建会再次失败,由外层 whenReady 的 catch 兜底
        console.error('[Store] 删除损坏配置文件失败:', e.message)
    }
}

//  初始化 Electron Store (处理 ESM 导入)
// 配置文件损坏(JSON 解析失败)时:删除损坏文件 -> 默认值重建 -> 弹窗告知用户
async function initStore() {
    const { default: Store } = await import('electron-store')

    const options = {
        name: 'config', // 文件名为 config.json
        defaults: {     // 默认配置 防止首次运行为空
            enableTranslation: true,
            translationModelId: '',
            enableTokenization: true,
            translationApiKey: '',
            theme: 'system',
            downloadSource: 'mirror',
            ocrShortcut: '',
            library: [] // 书架数据
        }
    }

    try {
        const store = new Store(options)
        ctx.setStore(store)
        return store
    } catch (error) {
        // 仅 JSON 解析失败按损坏处理;其他错误保持原行为上抛给 whenReady 的 catch
        if (!(error instanceof SyntaxError)) throw error
        recoverCorruptedStore(path.join(app.getPath('userData'), 'config.json'), error)

        // 文件已删除,以默认值重建;若再失败则由外层 catch 兜底
        const store = new Store(options)
        ctx.setStore(store)
        dialog.showMessageBoxSync({
            type: 'warning',
            title: 'MangaReader',
            message: '配置文件已损坏,已重置为默认设置',
            detail: '本地设置与书架记录未能恢复'
        })
        return store
    }
}

// 向当前窗口转发后端事件;窗口不存在或已销毁时静默丢弃
function sendToWindow(channel, payload) {
    const win = mainWindow
    if (win && !win.isDestroyed()) {
        win.webContents.send(channel, payload)
    }
}

function createMainWindow() {
    const iconPath = isDev
        ? path.join(__dirname, '../public/MangaReaderLogo.ico')
        : path.join(__dirname, '../.output/public/MangaReaderLogo.ico')

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1200,
        minHeight: 800,
        frame: false,
        icon: iconPath,
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
    })
    ctx.setMainWindow(mainWindow)

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000')
        mainWindow.webContents.openDevTools()
    } else {
        // 前端渲染加载文件挂起之后 立刻去添加监听器on
        mainWindow.loadFile(path.join(__dirname, '../.output/public/index.html'))
        Menu.setApplicationMenu(null)
    }

    // 用户通过其他方式操作窗口之后 通知UI进行处理(webContents.send)
    mainWindow.on('closed', () => {
        mainWindow = null
        ctx.setMainWindow(null)
    })

    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window:state-change', 'maximized')
    })

    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window:state-change', 'normal')
    })

    mainWindow.once('ready-to-show', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.webContents.send('window:state-change', 'maximized')
        }
    })
}

app.whenReady().then(async () => {
    try {
        // electron-store 内部的初始化依赖app本身的生命周期 故必须在 whenReady 内部加载
        const store = await initStore()
        console.log('[INFO] Electron Store initialized')

        // 创建ocr模型文件夹
        const modelsRoot = getModelsPath()
        const ocrModelPath = path.join(modelsRoot, 'ocr')
        await fs.promises.mkdir(ocrModelPath, { recursive: true })

        // 启动 OCR 服务
        const servicesModulesPath = getServicesModulesPath()
        await fs.promises.mkdir(servicesModulesPath, { recursive: true })
        backendService = new BackendService(
            ocrModelPath,
            servicesModulesPath,
            store.get('downloadSource', 'mirror')
        )
        ctx.setBackend(backendService)
        ctx.setPaths({ modelsPath: modelsRoot, servicesModulesPath })

        backendService.on('ready', () => {
            console.log('Signal: Backend ready, notifying frontend...')
            sendToWindow('backend-status', { status: 'ready' })
        })

        // 监听初始化文字状态
        backendService.on('init-status', (message) => sendToWindow('init-status', message))

        //  监听初始化进度
        backendService.on('init-progress', (data) => sendToWindow('init-progress', data))

        // 监听初始化错误
        backendService.on('init-error', (data) => sendToWindow('init-error', data))

        backendService.on('download-progress', (data) => sendToWindow('model:download-progress', data))

        backendService.on('dictionary-download-progress', (percent) => sendToWindow('dictionary:download-progress', percent))

        backendService.on('detection-module-download-progress', (data) => sendToWindow('detection-module-download-progress', data))

        // 转发后端日志到前端
        backendService.on('log', (msg) => sendToWindow('backend:log', msg))

        // 统一注册全部 IPC 通道与 manga:// 协议 37 个通道: library 5 / backend 代理 19 / settings 4 / 系统 7 / files 2
        registerAll(ctx)

        backendService.start()

        createMainWindow()
    } catch (e) {
        // config.json 损坏已由 initStore 内部恢复(删除重建+告知用户)
        // 走到这里的剩余错误(磁盘/权限等)无法恢复 应用保持退出前打日志
        console.log('启动时错误', e)
    }
})

// 当所有窗口关闭时
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit() // 执行后自动触发 'will-quit'
    }
})

app.on('will-quit', () => {
    console.log('App is quitting, cleaning up...')

    // 注销快捷键
    globalShortcut.unregisterAll()

    // 停止 OCR 服务
    if (backendService) {
        backendService.stop()
        backendService = null
        ctx.setBackend(null)
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
    }
})
