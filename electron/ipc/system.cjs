// electron/ipc/system.cjs
// 系统域:窗口控制 / 对话框 / shell / fs 探测 无状态 OS 杂项合并,依赖仅 mainWindow(经 ctx 取当前窗口)

const { app, ipcMain, dialog, shell } = require('electron')
const fs = require('fs')
const path = require('path')

/**
 * @param {typeof import('./context.cjs')} ctx
 */
module.exports = function registerSystemIpc(ctx) {

    // 窗口控制 IPC 监听器 监听渲染进程发送的事件 调用mainWindow的方法进行操作
    ipcMain.on('window:minimize', () => {
        const win = ctx.getWindow()
        if (win) {
            win.minimize()
        }
    })

    ipcMain.on('window:maximize', () => {
        const win = ctx.getWindow()
        if (win) {
            if (win.isMaximized()) {
                win.unmaximize()
            } else {
                win.maximize()
            }
        }
    })

    ipcMain.on('window:close', () => {
        const win = ctx.getWindow()
        if (win) {
            win.close()
        }
    })

    ipcMain.handle('dialog:open-file', async (_event) => {
        const win = ctx.getWindow()
        if (!win) return { canceled: true, filePaths: [] } // 这里为确保返回值相同故构建一个报错时的错误返回值
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
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

    ipcMain.handle('dialog:select-export-directory', async (_event, defaultName) => {
        const win = ctx.getWindow()
        if (!win) return { canceled: true }
        const safeName = path.basename(String(defaultName || 'translated-manga')).replace(/[<>:"/\\|?*]/g, '_')
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: '选择翻译图片保存文件夹',
            defaultPath: path.join(app.getPath('downloads'), safeName),
            properties: ['openDirectory', 'createDirectory']
        })
        return { canceled, directoryPath: filePaths[0] }
    })

    // 监听打开外部链接的请求 使用默认浏览器打开
    ipcMain.handle('shell:open', async (_event, url) => {
        // 安全起见 只允许打开 http/https 协议
        if (url.startsWith('http://') || url.startsWith('https://')) {
            await shell.openExternal(url)
        }
    })

    ipcMain.handle('fs:exists', async (_event, pathStr) => {
        try {
            await fs.promises.stat(pathStr)
            return true
        } catch (e) {
            return false
        }
    })
}
