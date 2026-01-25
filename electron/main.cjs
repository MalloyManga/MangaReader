// main.cjs
if (require('electron-squirrel-startup')) {
    require('electron').app.quit();
    process.exit(0);
}
const { app, BrowserWindow, ipcMain, desktopCapturer, screen, globalShortcut, shell, Menu, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { BackendService } = require('./backend-service.cjs')

// --- Portable Mode Support (便携模式支持) ---
if (app.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'))
    const portableDataPath = path.join(exeDir, 'data')

    try {
        // 尝试创建或访问 data 目录
        if (!fs.existsSync(portableDataPath)) {
            fs.mkdirSync(portableDataPath)
        }
        // 检查写权限
        fs.accessSync(portableDataPath, fs.constants.W_OK)

        // 设置 userData 路径
        app.setPath('userData', portableDataPath)
        console.log('[Portable Mode] Enabled. Data path:', portableDataPath)
    } catch (e) {
        console.log('[Portable Mode] Failed (Permission denied?), falling back to default AppData.', e.message)
    }
}
// -------------------------------------------

// 判断是否为开发环境 (由 Electron Forge 自动设置)
const isDev = !app.isPackaged

let mainWindow // 将 mainWindow 提升到全局，以便我们可以从 ipcMain 访问它

let captureWindow = null
let backendService = null // OCR 服务实例

// 全局 store 变量
let store

function getModelsPath() {
    // 开发环境：项目根目录/models
    // 生产环境：安装目录/resources/backend/models
    return isDev
        ? path.join(__dirname, '../models')
        : path.join(process.resourcesPath, 'backend', 'models')
}

//  初始化 Electron Store (处理 ESM 导入)
async function initStore() {
    const { default: Store } = await import('electron-store')

    store = new Store({
        name: 'config', // 文件名为 config.json
        defaults: {     // 默认配置，防止首次运行为空
            enableTranslation: false,
            enableTokenization: true,
            translationApiKey: '',
            theme: 'system',
            ocrShortcut: '',
            library: [] // 书架数据
        }
    })
    return store
}

function createMainWindow() {
    // 创建浏览器窗口
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false, // 禁用默认边框
        icon: path.join(__dirname, '../public/MangaReaderLogo.ico'),
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
    })

    if (isDev) {
        // 开发环境下，加载 Nuxt 的开发服务器 URL
        // 我们明确告诉它加载 Nuxt 默认的 3000 端口
        mainWindow.loadURL('http://localhost:3000')
        // 打开开发者工具
        mainWindow.webContents.openDevTools()
    } else {
        // 生产环境下，加载 Nuxt 构建后的静态文件
        // Nuxt 4 的 SSG 输出目录是 .output/public
        mainWindow.loadFile(path.join(__dirname, '../.output/public/index.html'))

        // [Security] Disable default menu in production
        Menu.setApplicationMenu(null)

        // [Security] Intercept shortcuts to prevent opening DevTools
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
                event.preventDefault()
            }
        })
    }

    // Handle window closed event properly
    mainWindow.on('closed', () => {
        mainWindow = null
    })

    // 监听窗口最大化/还原事件，并发送给前端
    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window:state-change', 'maximized')
    })

    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window:state-change', 'normal')
    })

    // 窗口准备好时，也可以发送一次当前状态（可选，防止初始状态不对）
    mainWindow.once('ready-to-show', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.webContents.send('window:state-change', 'maximized')
        }
    })
}

async function createCaptureWindow() {
    const { bounds: { width, height }, scaleFactor } = screen.getPrimaryDisplay() // 考虑到缩放比例 以及 宽高
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: width * scaleFactor, height: height * scaleFactor } // 获取到屏幕尺寸 宽高乘缩放比率
    })
    // 屏幕会有多个 获取到第一个 [0]
    const base64 = sources[0].thumbnail.toDataURL() // base64传递到html里渲染

    captureWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, 'preload.js')
        },
        fullscreen: true, // 全屏
        transparent: true, // 透明
        frame: false, // 无框架
        skipTaskbar: true, // 底部任务栏不创建图标
        autoHideMenuBar: true, // 自动隐藏菜单
        movable: false, // 禁止拖拽
        resizable: false, // 禁止改变大小
        enableLargerThanScreen: true, // 允许窗口大于屏幕
        hasShadow: false, // 无阴影
        show: false, // 默认不显示
    })
    captureWindow.loadFile(path.join(__dirname, 'overlay.html'))
    captureWindow.on('show', () => {
        // 传递 base64 和 scaleFactor
        captureWindow.webContents.send('window:capture-source', { base64, scaleFactor })

        globalShortcut.register('Esc', () => {
            captureWindow.close()
        })
    })
    captureWindow.on('close', () => {
        mainWindow.show()
        globalShortcut.unregister('Esc')
    })
    captureWindow.show() // 监听上面的show事件

}

// --- IPC Handlers ---

ipcMain.on('window:capture-open', () => {
    // 截图的时间隐藏主窗口 同时 截图完毕或者退出的时间再重新显示
    mainWindow.hide()
    // 先隐藏主窗口,等待一小段时间确保窗口完全隐藏后再创建截图窗口
    // 这样可以避免在截图时捕获到半透明的主窗口
    setTimeout(() => {
        createCaptureWindow()
    }, 100) // 等待 100ms 确保主窗口完全隐藏
})

// 接收截图完成事件
ipcMain.on('window:capture-complete', (event, screenshotData) => {
    // 将截图数据发送给主窗口
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('screenshot:captured', screenshotData)
    }
    // 关闭截图窗口
    if (captureWindow && !captureWindow.isDestroyed()) {
        captureWindow.close()
    }
})


ipcMain.on('window:capture-close', () => {
    if (captureWindow) {
        captureWindow.close()
        captureWindow = null
    }
    mainWindow.show()
})

//  打开模型文件夹
ipcMain.on('open-model-folder', () => {
    const modelsRoot = getModelsPath()
    // 打开 models 根目录，让用户看到 ocr/translation 等子文件夹
    if (!fs.existsSync(modelsRoot)) {
        fs.mkdirSync(modelsRoot, { recursive: true })
    }
    shell.openPath(modelsRoot)
})

// --- Library IPC Handlers ---

ipcMain.handle('library:get-all', () => {
    return store ? store.get('library', []) : []
})

ipcMain.handle('library:add', async (event, pathStr) => {
    try {
        const library = store.get('library', [])
        // 简单去重
        if (library.find(b => b.path === pathStr)) {
            return { success: false, error: 'Book already in library' }
        }

        let cover = null
        // 尝试提取封面
        if (backendService && backendService.isReady) {
            try {
                // 增加 timeout 避免卡死
                const res = await backendService.extractCover(pathStr)
                if (res && res.cover) {
                    cover = `data:image/jpeg;base64,${res.cover}`
                }
            } catch (e) {
                console.error('Cover extraction failed:', e)
            }
        }

        const newBook = {
            id: require('crypto').randomUUID(),
            path: pathStr,
            cover: cover,
            totalPage: 0,
            currentPage: 0,
            lastReadTime: Date.now()
        }

        library.push(newBook)
        store.set('library', library)
        return { success: true, book: newBook }
    } catch (e) {
        return { success: false, error: e.message }
    }
})

ipcMain.handle('library:update-progress', (event, { id, currentPage, totalPage, lastReadTime }) => {
    const library = store.get('library', [])
    const index = library.findIndex(b => b.id === id)
    if (index !== -1) {
        if (currentPage !== undefined) library[index].currentPage = currentPage
        if (totalPage !== undefined) library[index].totalPage = totalPage
        if (lastReadTime !== undefined) library[index].lastReadTime = lastReadTime
        store.set('library', library)
        return true
    }
    return false
})

ipcMain.handle('library:remove', (event, id) => {
    let library = store.get('library', [])
    library = library.filter(b => b.id !== id)
    store.set('library', library)
    return true
})

ipcMain.handle('fs:exists', (event, pathStr) => {
    return fs.existsSync(pathStr)
})

ipcMain.handle('book:load', async (event, folderPath) => {
    try {
        if (!fs.existsSync(folderPath)) {
            return { success: false, error: 'Path not found' }
        }
        
        // 如果是文件（如 PDF/Zip），暂时不支持直接 loadBook，需要 FileUpload 处理
        // 这里只处理文件夹形式的漫画
        const stats = fs.statSync(folderPath)
        if (!stats.isDirectory()) {
             return { success: false, error: 'Not a directory' }
        }

        const files = fs.readdirSync(folderPath)
        const images = []
        
        // 简单自然排序
        const sortedFiles = files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

        for (const file of sortedFiles) {
             const ext = path.extname(file).toLowerCase()
             if (['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext)) {
                 const fullPath = path.join(folderPath, file)
                 // 如果图片太大，这里可能会比较慢或占内存。
                 // 生产环境建议使用 custom protocol (manga://) 流式加载
                 const data = fs.readFileSync(fullPath).toString('base64')
                 const mimeType = ext === '.jpg' ? 'jpeg' : ext.substring(1)
                 
                 images.push({
                     name: file,
                     data: `data:image/${mimeType};base64,${data}` 
                 })
             }
        }

        return { success: true, images }
    } catch (e) {
        console.error('book:load error:', e)
        return { success: false, error: e.message }
    }
})

ipcMain.handle('dialog:open-file', async (event) => {
    if (!mainWindow) return { canceled: true, filePaths: [] }
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Manga',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Images / PDF / Zip', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'pdf', 'zip'] }]
    })
    return { canceled, filePaths }
})

ipcMain.handle('files:read-images', async (event, filePaths) => {
    try {
        if (!filePaths || filePaths.length === 0) return { success: false, images: [] }
        
        // Infer parent path from the first file
        const firstFile = filePaths[0]
        const parentPath = path.dirname(firstFile)

        // Smart Import Logic:
        // Instead of just reading the selected files, we scan the PARENT DIRECTORY
        // to find suitable images, mimicking "Open Folder" behavior by selecting a file.
        // This is what the user explicitly requested ("detect parent folder from one file").
        
        const files = fs.readdirSync(parentPath)
        // Sort files naturally (001, 002, 010)
        const sortedFiles = files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        
        const images = []

        for (const file of sortedFiles) {
             const fullPath = path.join(parentPath, file)
             const stats = fs.statSync(fullPath)
             if (!stats.isFile()) continue

             const ext = path.extname(file).toLowerCase()
             const name = file // use filename as name
             
             if (['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext)) {
                 const data = fs.readFileSync(fullPath).toString('base64')
                 const mimeType = ext === '.jpg' ? 'jpeg' : ext.substring(1)
                 images.push({
                     name: name,
                     data: `data:image/${mimeType};base64,${data}`,
                     type: 'image'
                 })
             } else if (ext === '.pdf') {
                 const data = fs.readFileSync(fullPath).toString('base64')
                 images.push({
                     name: name,
                     data: `data:application/pdf;base64,${data}`,
                     type: 'pdf'
                 })
             } else if (ext === '.zip') {
                 const data = fs.readFileSync(fullPath).toString('base64')
                 images.push({
                     name: name,
                     data: `data:application/zip;base64,${data}`,
                     type: 'zip'
                 })
             }
        }
        
        return { success: true, images, parentPath }
    } catch(e) {
        return { success: false, error: e.message }
    }
})

// OCR 识别请求
ipcMain.handle('ocr:recognize', async (event, imageBase64) => {
    try {
        console.log('Received OCR request, image size:', imageBase64.length)

        if (!backendService || !backendService.isReady) {
            return {
                success: false,
                error: 'OCR service not ready. Please wait...'
            }
        }

        const text = await backendService.recognize(imageBase64)

        return {
            success: true,
            text: text
        }
    } catch (error) {
        console.error('OCR recognition error:', error)
        return {
            success: false,
            error: error.message
        }
    }
})

// 分词请求
ipcMain.handle('ocr:tokenize', async (event, text) => {
    try {
        if (!backendService) return { success: false, error: "Service not ready" }
        // 调用 Service
        const result = await backendService.tokenize(text)
        console.log(`Tokenize result: ${result?.tokens?.length || 0} tokens found`)
        if (!result) {
            throw new Error('Service returned empty result')
        }

        // Service 返回的是 { tokens: [...] }
        return { success: true, tokens: result.tokens }
    } catch (e) {
        return { success: false, error: e.message }
    }
})

// 翻译请求
ipcMain.handle('ocr:translate', async (event, text) => {
    try {
        if (!backendService) return { success: false, error: "Service not ready" }
        const result = await backendService.translate(text)
        return { success: true, translation: result.translation }
    } catch (e) {
        return { success: false, error: e.message }
    }
})

// 检查模型状态
ipcMain.handle('model:check', async () => {
    try {
        if (!backendService) return { success: false, error: "Service not ready" }
        const result = await backendService.checkModel()
        return { success: true, exists: result.exists }
    } catch (e) {
        return { success: false, error: e.message }
    }
})

// 下载模型
ipcMain.handle('model:download', async () => {
    try {
        if (!backendService) return { success: false, error: "Service not ready" }
        await backendService.downloadModel()
        return { success: true }
    } catch (e) {
        return { success: false, error: e.message }
    }
})

// 删除模型
ipcMain.handle('model:delete', async () => {
    try {
        if (!backendService) return { success: false, error: "Service not ready" }
        await backendService.deleteModel()
        return { success: true }
    } catch (e) {
        return { success: false, error: e.message }
    }
})

// 窗口控制 IPC 监听器 监听渲染进程发送的事件
ipcMain.on('window:minimize', () => {
    if (mainWindow) {
        mainWindow.minimize()
    }
})

ipcMain.on('window:maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize()
        } else {
            mainWindow.maximize()
        }
    }
})

ipcMain.on('window:close', () => {
    if (mainWindow) {
        mainWindow.close()
    }
})

app.whenReady().then(async () => {
    try {
        // 1. 先等待 store 初始化完成
        await initStore()
        console.log('[INFO] Electron Store initialized')

        // 2. 注册 Settings 相关的 IPC
        // 获取所有设置
        ipcMain.handle('settings:get', () => {
            return store.store // .store 返回整个配置对象
        })

        // 保存单个设置 (key, value)
        ipcMain.on('settings:set', (event, key, value) => {
            store.set(key, value)
        })

        // 打开配置文件 (给用户看)
        ipcMain.on('settings:open-config', () => {
            store.openInEditor()
        })

        const modelsRoot = getModelsPath()
        const ocrModelPath = path.join(modelsRoot, 'ocr')
        if (!fs.existsSync(ocrModelPath)) {
            fs.mkdirSync(ocrModelPath, { recursive: true })
        }

        // 启动 OCR 服务
        backendService = new BackendService(ocrModelPath)
        backendService.on('ready', () => {
            console.log('Signal: Backend ready, notifying frontend...')
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('backend-status', { status: 'ready' })
            }
        })

        // 监听初始化文字状态
        backendService.on('init-status', (message) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('init-status', message)
            }
        })

        //  监听初始化进度
        backendService.on('init-progress', (data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('init-progress', data)
            }
        })

        // 监听初始化错误
        backendService.on('init-error', (data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('init-error', data)
            }
        })

        backendService.on('download-progress', (percent) => {
            // console.log(`Downloading: ${percent}%`) // 可选：在终端显示
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('model:download-progress', percent)
            }
        })

        // 转发后端日志到前端
        backendService.on('log', (msg) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('backend:log', msg)
            }
        })

        backendService.start()

        // 监听打开外部链接的请求
        ipcMain.handle('shell:open', async (event, url) => {
            // 安全起见，只允许打开 http/https 协议
            if (url.startsWith('http://') || url.startsWith('https://')) {
                await shell.openExternal(url)
            }
        })

        ipcMain.handle('backend:check-ready', () => {
            return backendService ? backendService.isReady : false
        })

        // 批量更新快捷键设置
        ipcMain.handle('settings:update-shortcuts', (event, shortcuts) => {
            // shortcuts: { ocr: '...', next: '...', prev: '...' }

            // 1. 先清除所有旧的快捷键
            globalShortcut.unregisterAll()

            if (!shortcuts || typeof shortcuts !== 'object') {
                return true
            }

            // 2. 遍历注册每个功能的快捷键
            for (const [action, shortcut] of Object.entries(shortcuts)) {
                if (!shortcut || typeof shortcut !== 'string' || shortcut.trim() === '') {
                    continue
                }

                // 格式转换 "Ctrl + A" -> "Ctrl+A"
                const accelerator = shortcut.replace(/\s+/g, '')

                try {
                    const ret = globalShortcut.register(accelerator, () => {
                        console.log(`[INFO] 快捷键触发: ${action} (${accelerator})`)

                        if (mainWindow) {
                            if (mainWindow.isMinimized()) mainWindow.restore()
                            // OCR可能需要窗口显示，但翻页快捷键大概率是在阅读时使用，窗口本身就是活跃的
                            mainWindow.show()

                            // 发送通用事件，带上 action 类型
                            mainWindow.webContents.send('shortcut:triggered', action)
                        }
                    })

                    if (!ret) {
                        console.warn(`[WARN] 快捷键注册失败 (可能被占用): ${action} - ${accelerator}`)
                    }
                } catch (err) {
                    console.error(`[ERROR] 快捷键注册异常: ${action}`, err)
                }
            }
            return true
        })

        // 创建主窗口
        createMainWindow()
    } catch (e) {
        console.log('启动时错误', e)
    }
})

// 当所有窗口关闭时
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit() // 这行代码执行后，会自动触发 'will-quit'
    }
})

app.on('will-quit', () => {
    console.log('App is quitting, cleaning up...')

    // 1. 注销快捷键
    globalShortcut.unregisterAll()

    // 2. 停止 OCR 服务
    if (backendService) {
        backendService.stop()
        // backendService = null // 可选
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
    }
})
