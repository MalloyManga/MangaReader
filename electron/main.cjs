// main.cjs
if (require('electron-squirrel-startup')) {
    require('electron').app.quit()
    process.exit(0)
}

/**
 * @typedef {Object} Book
 * @property {string} id - 唯一的 UUID
 * @property {string} path - 文件夹/文件路径
 * @property {string|null} cover - 图片 Base64，如果是 null 则没有封面
 * @property {number} totalPage - 总页数
 * @property {number} currentPage - 当前阅读页
 * @property {number} lastReadTime - 最后阅读时间的时间戳
 */

const { app, BrowserWindow, ipcMain, desktopCapturer, screen, globalShortcut, shell, Menu, dialog, protocol, net } = require('electron')
const path = require('path')
const fs = require('fs')
const url = require('url')
const { BackendService } = require('./backend-service.cjs')

const isDev = !app.isPackaged

/** @type {import('electron').BrowserWindow} */
let mainWindow // 将 mainWindow 提升到全局，以便我们可以从 ipcMain 访问它

// let captureWindow = null

/**
 * @type {import('./backend-service.cjs').BackendService}
 */
let backendService = null

/** @type {import('electron-store').default} */
let store

// 配置manga://协议schema
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

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000')
        mainWindow.webContents.openDevTools()
    } else {
        // 前端渲染加载文件挂起之后 立刻去添加监听器on
        mainWindow.loadFile(path.join(__dirname, '../.output/public/index.html'))

        Menu.setApplicationMenu(null)

        // 拦截唤起开发者工具的快捷键
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
                event.preventDefault()
            }
        })
    }

    // 用户通过其他方式操作窗口之后 通知UI进行处理(webContents.send)
    mainWindow.on('closed', () => {
        mainWindow = null
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

// async function createCaptureWindow() {
//     const { bounds: { width, height }, scaleFactor } = screen.getPrimaryDisplay() // 考虑到缩放比例 以及 宽高
//     const sources = await desktopCapturer.getSources({
//         types: ['screen'],
//         thumbnailSize: { width: width * scaleFactor, height: height * scaleFactor } // 获取到屏幕尺寸 宽高乘缩放比率
//     })
//     // 屏幕会有多个 获取到第一个 [0]
//     const base64 = sources[0].thumbnail.toDataURL() // base64传递到html里渲染

//     captureWindow = new BrowserWindow({
//         webPreferences: {
//             nodeIntegration: true,
//             preload: path.join(__dirname, 'preload.js')
//         },
//         fullscreen: true, // 全屏
//         transparent: true, // 透明
//         frame: false, // 无框架
//         skipTaskbar: true, // 底部任务栏不创建图标
//         autoHideMenuBar: true, // 自动隐藏菜单
//         movable: false, // 禁止拖拽
//         resizable: false, // 禁止改变大小
//         enableLargerThanScreen: true, // 允许窗口大于屏幕
//         hasShadow: false, // 无阴影
//         show: false, // 默认不显示
//     })
//     captureWindow.loadFile(path.join(__dirname, 'overlay.html'))
//     captureWindow.on('show', () => {
//         // 传递 base64 和 scaleFactor
//         captureWindow.webContents.send('window:capture-source', { base64, scaleFactor })

//         globalShortcut.register('Esc', () => {
//             captureWindow.close()
//         })
//     })
//     captureWindow.on('close', () => {
//         mainWindow.show()
//         globalShortcut.unregister('Esc')
//     })
//     captureWindow.show() // 监听上面的show事件

// }

// ipcMain.on('window:capture-open', () => {
//     // 截图的时间隐藏主窗口 同时 截图完毕或者退出的时间再重新显示
//     mainWindow.hide()
//     // 先隐藏主窗口,等待一小段时间确保窗口完全隐藏后再创建截图窗口
//     // 这样可以避免在截图时捕获到半透明的主窗口
//     setTimeout(() => {
//         createCaptureWindow()
//     }, 100) // 等待 100ms 确保主窗口完全隐藏
// })

// // 接收截图完成事件
// ipcMain.on('window:capture-complete', (event, screenshotData) => {
//     // 将截图数据发送给主窗口
//     if (mainWindow && !mainWindow.isDestroyed()) {
//         mainWindow.webContents.send('screenshot:captured', screenshotData)
//     }
//     // 关闭截图窗口
//     if (captureWindow && !captureWindow.isDestroyed()) {
//         captureWindow.close()
//     }
// })

// ipcMain.on('window:capture-close', () => {
//     if (captureWindow) {
//         captureWindow.close()
//         captureWindow = null
//     }
//     mainWindow.show()
// })


// 书架部分
ipcMain.handle('library:get-all', () => {
    return store ? store.get('library', []) : []
})

ipcMain.handle('library:add', async (_event, pathStr) => {
    try {
        /**
        * @type {Book[]}
        */
        const library = store.get('library', [])
        if (library.find(b => b.path === pathStr)) {
            return { success: false, error: 'Book already in library' }
        }

        let cover = null
        if (backendService && backendService.isReady) {
            try {
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

ipcMain.handle('library:update-progress', (_event, { id, currentPage, totalPage, lastReadTime }) => {
    /**
    * @type {Book[]}
    */
    const library = store.get('library', [])
    const index = library.findIndex(b => b.id === id)
    if (index !== -1) {
        // 更新阅读进度
        if (currentPage !== undefined) library[index].currentPage = currentPage
        if (totalPage !== undefined) library[index].totalPage = totalPage
        if (lastReadTime !== undefined) library[index].lastReadTime = lastReadTime
        store.set('library', library)
        return true
    }
    return false
})

ipcMain.handle('library:remove', (_event, id) => {
    /**
    * @type {Book[]}
    */
    let library = store.get('library', [])
    library = library.filter(b => b.id !== id)
    store.set('library', library)
    return true
})
// ------------------------------

// 主功能
ipcMain.handle('fs:exists', async (_event, pathStr) => {
    try {
        await fs.promises.stat(pathStr)
        return true
    } catch (e) {
        return false
    }
})

ipcMain.handle('dialog:open-file', async (_event) => {
    if (!mainWindow) return { canceled: true, filePaths: [] } // 这里为确保返回值相同故构建一个报错时的错误返回值
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Manga',
        properties: ['openFile', 'multiSelections'],
        filters: [
            {
                name: 'Images / PDF / Zip',
                extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'pdf', 'zip']
            }
        ]
    })
    return { canceled, filePaths }
})

// 用户点击按钮之后唤起dialog加载文件 仅仅返回路径给前端
ipcMain.handle('files:read-images', async (_event,/** @type {string[]} */ filePaths) => {
    try {
        if (!filePaths || filePaths.length === 0) return { success: false, imagePaths: [] }
        const imagePaths = []
        const filePath = filePaths[0]
        if ((await fs.promises.stat(filePath)).isDirectory()) { // 如果为文件夹 则读取文件夹中所有图片的路径并排序 全部返回
            // 此时 filePath 即 filePaths[0] 为文件夹的路径
            const folderFilePaths = await fs.promises.readdir(filePath) // readdir 仅仅获取到文件名称及后缀
            const sortedFilePaths = folderFilePaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
            for (const sortedFilePath of sortedFilePaths) {
                const fileExt = sortedFilePath.split('.').pop().toLowerCase()
                if (fileExt.match(/^(png|jpe?g|webp|gif)$/i)) {
                    const fullFilePath = path.join(filePath, sortedFilePath) // path.join拼接出完整的路径
                    imagePaths.push(fullFilePath)
                }
            }
        }
        else {
            const folderPath = path.dirname(filePath)
            const folderFilePaths = await fs.promises.readdir(folderPath)
            const sortedFilePaths = folderFilePaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
            for (const sortedFilePath of sortedFilePaths) {
                const fileExt = sortedFilePath.split('.').pop().toLowerCase()
                if (fileExt.match(/^(png|jpe?g|webp|gif)$/i)) {
                    const fullFilePath = path.join(folderPath, sortedFilePath) // path.join拼接出完整的路径
                    imagePaths.push(fullFilePath)
                }
            }
        }
        return { success: true, imagePaths }
    } catch (e) {
        return { success: false, error: e.message }
    }
})

// OCR 识别请求
ipcMain.handle('ocr:recognize', async (_event, imageBase64) => {
    try {
        console.log('Received OCR request, image size:', imageBase64.length)

        if (!backendService || !backendService.isReady) {
            return {
                success: false,
                error: 'OCR service not ready. Please wait...'
            }
        }

        const { text } = await backendService.recognize(imageBase64)

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
ipcMain.handle('ocr:tokenize', async (_event, text) => {
    try {
        if (!backendService) return { success: false, error: "Service not ready" }
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
ipcMain.handle('ocr:translate', async (_event, text) => {
    try {
        if (!backendService) return { success: false, error: "Service not ready" }
        const result = await backendService.translate(text)
        return { success: true, translation: result.translation }
    } catch (e) {
        return { success: false, error: e.message }
    }
})
// -------------------------------------------

// 模型相关
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

ipcMain.handle('dictionary:check', async () => {
    try {
        if (!backendService) return { success: false, error: "Service not ready" }
        const result = await backendService.checkDictionary()
        return { success: true, exists: result.exists }
    } catch (e) {
        return { success: false, error: e.message }
    }
})

ipcMain.handle('dictionary:download', async () => {
    try {
        if (!backendService) return { success: false, error: "Service not ready" }
        await backendService.downloadDictionary()
        return { success: true }
    } catch (e) {
        return { success: false, error: e.message }
    }
})

ipcMain.handle('dictionary:delete', async () => {
    try {
        if (!backendService) return { success: false, error: "Service not ready" }
        await backendService.deleteDictionary()
        return { success: true }
    } catch (e) {
        return { success: false, error: e.message }
    }
})

//  打开模型文件夹
ipcMain.on('open-model-folder', () => {
    const modelsRoot = getModelsPath()
    if (!fs.existsSync(modelsRoot)) {
        fs.mkdirSync(modelsRoot, { recursive: true })
    }
    shell.openPath(modelsRoot)
})
// -------------------------------------------

// 窗口控制 IPC 监听器 监听渲染进程发送的事件 调用mainWindow的方法进行操作
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
// -------------------------------------------

app.whenReady().then(async () => {
    try {
        await initStore()
        console.log('[INFO] Electron Store initialized')

        // 注册 Settings 相关的 IPC 强依赖store 故注册到whenReady的then回调当中
        // 获取所有设置
        ipcMain.handle('settings:get', () => {
            return store.store
        })

        // 保存单个设置 (key, value)
        ipcMain.on('settings:set', (_event, key, value) => {
            store.set(key, value)
        })

        // 打开配置文件
        ipcMain.on('settings:open-config', () => {
            store.openInEditor()
        })
        // --------------------------------

        // 创建ocr模型文件夹
        const modelsRoot = getModelsPath()
        const ocrModelPath = path.join(modelsRoot, 'ocr')
        await fs.promises.mkdir(ocrModelPath, { recursive: true })

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
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('model:download-progress', percent)
            }
        })

        backendService.on('dictionary-download-progress', (percent) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('dictionary:download-progress', percent)
            }
        })

        // 转发后端日志到前端
        backendService.on('log', (msg) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('backend:log', msg)
            }
        })

        backendService.start()

        // 监听打开外部链接的请求 使用默认浏览器打开
        ipcMain.handle('shell:open', async (_event, url) => {
            // 安全起见，只允许打开 http/https 协议
            if (url.startsWith('http://') || url.startsWith('https://')) {
                await shell.openExternal(url)
            }
        })

        ipcMain.handle('backend:check-ready', () => {
            return backendService ? backendService.isReady : false
        })

        // 批量更新快捷键设置
        ipcMain.handle('settings:update-shortcuts', (_event, /** @type {Record<String,String>} */ shortcuts) => {
            // 先清除所有旧的快捷键
            globalShortcut.unregisterAll()

            if (!shortcuts || typeof shortcuts !== 'object') {
                return false
            }

            // 遍历注册每个功能的快捷键
            for (const [action, shortcut] of Object.entries(shortcuts)) {
                if (!shortcut || typeof shortcut !== 'string' || shortcut.trim() === '') {
                    continue
                }

                // 格式转换 "Ctrl + A" -> "Ctrl+A"
                const accelerator = shortcut.replace(/\s+/g, '')

                try {
                    const ret = globalShortcut.register(accelerator, () => {
                        console.log(`[INFO] 快捷键触发: ${action} (${accelerator})`)

                        if (!mainWindow) return
                        const isAppActive = mainWindow.isFocused()
                        if (isAppActive) {
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

        // 自建图片协议 拦截mnaga:// 请求
        protocol.handle('manga', async (request) => {
            try {
                // 1. 截掉 'manga://' 头
                let rawPath = request.url.slice('manga://'.length)

                // 2. 解码！把浏览器自动编码的 %E3%83 还原回真实的汉字/日文
                rawPath = decodeURIComponent(rawPath)

                // 3. 修复盘符！如果浏览器把 C:/ 吞成了 c/，我们手动补上冒号
                // 正则解释：如果开头是一个字母紧跟一个斜杠 (比如 c/ 或 d/)
                if (/^[a-zA-Z]\//.test(rawPath)) {
                    // 在字母和斜杠中间插入冒号 -> c:/
                    rawPath = rawPath[0] + ':' + rawPath.slice(1)
                }

                // 4. 使用 Node.js 官方 API 转换为标准 file:// 协议
                // pathToFileURL 需要接收绝对纯净的本地路径 (例如 C:\Users\测试\1.png)
                const fileUrl = url.pathToFileURL(rawPath).href

                // 返回本地文件流
                return net.fetch(fileUrl)

            } catch (e) {
                console.error('加载本地图片出错 URL:', request.url)
                console.error('详细错误:', e)
                return new Response('File not found', { status: 404 })
            }
        })

        createMainWindow()
    } catch (e) {
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
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
    }
})
