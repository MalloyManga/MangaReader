// main.js
import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

// --- 关键修复代码 ---
// 1. 获取当前文件的路径 (相当于 CJS 的 __filename)
const __filename = fileURLToPath(import.meta.url)
// 2. 获取当前文件所在的目录 (相当于 CJS 的 __dirname)
const __dirname = path.dirname(__filename)
// 判断是否为开发环境 (由 Electron Forge 自动设置)
const isDev = !app.isPackaged

function createWindow() {
    // 创建浏览器窗口
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            // 更安全的配置
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js') // (可选，但推荐)
        },
    })

    if (isDev) {
        // 开发环境下，加载 Nuxt 的开发服务器 URL
        // 我们明确告诉它加载 Nuxt 默认的 3000 端口
        mainWindow.loadURL('http://localhost:3000');
        // 打开开发者工具
        mainWindow.webContents.openDevTools();
    } else {
        // 生产环境下，加载 Nuxt 构建后的静态文件
        // Nuxt 4 的 SSG 输出目录是 .output/public
        mainWindow.loadFile(path.join(__dirname, '../.output/public/index.html'))
    }

    // Handle window closed event properly
    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})